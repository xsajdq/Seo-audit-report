// Analiza całej witryny (cross-page): duplikaty tytułów/opisów, strony osierocone,
// graf linków wewnętrznych, broken/redirect internal links, reconciliacja sitemap,
// near-duplicate content, rozkład głębokości itd.
export function analyzeSite(pages, { startUrl, sitemapUrls = [] } = {}) {
  const indexable = pages.filter(
    (p) => p.response && p.response.status >= 200 && p.response.status < 300 && p.data
  );

  const issues = [];
  const add = (severity, category, title, detail, affected) =>
    issues.push({ severity, category, title, detail, affected });

  // --- Duplikaty tytułów ---
  const titleMap = new Map();
  const descMap = new Map();
  for (const p of indexable) {
    const t = (p.data.title || '').trim().toLowerCase();
    if (t) {
      if (!titleMap.has(t)) titleMap.set(t, []);
      titleMap.get(t).push(p.url);
    }
    const d = (p.data.metaDescription || '').trim().toLowerCase();
    if (d) {
      if (!descMap.has(d)) descMap.set(d, []);
      descMap.get(d).push(p.url);
    }
  }
  const dupTitles = [...titleMap.entries()].filter(([, urls]) => urls.length > 1);
  for (const [title, urls] of dupTitles) {
    add('warning', 'meta', 'Zduplikowany tytuł', `"${title}" występuje na ${urls.length} stronach.`, urls.slice(0, 10));
  }
  const dupDescs = [...descMap.entries()].filter(([, urls]) => urls.length > 1);
  for (const [, urls] of dupDescs) {
    add('warning', 'meta', 'Zduplikowany meta description', `Identyczny opis na ${urls.length} stronach.`, urls.slice(0, 10));
  }

  // --- Strony osierocone (brak linków przychodzących z innych stron) ---
  const inbound = new Map();
  for (const p of indexable) inbound.set(normalize(p.url), 0);
  for (const p of indexable) {
    for (const link of p.data.internalLinks || []) {
      const key = normalize(link.href);
      if (inbound.has(key)) inbound.set(key, inbound.get(key) + 1);
    }
  }
  const startKey = startUrl ? normalize(startUrl) : null;
  const orphans = [...inbound.entries()]
    .filter(([key, count]) => count === 0 && key !== startKey)
    .map(([key]) => key);
  if (orphans.length > 0) {
    add('notice', 'links', 'Strony potencjalnie osierocone', `${orphans.length} stron bez linków wewnętrznych prowadzących do nich.`, orphans.slice(0, 15));
  }

  // --- Graf linków wewnętrznych: broken (4xx/5xx) i przekierowane (3xx) cele ---
  const statusByUrl = new Map();
  for (const p of pages) {
    statusByUrl.set(normalize(p.url), p.response.status);
    if (p.response.finalUrl) statusByUrl.set(normalize(p.response.finalUrl), p.response.status);
  }
  const brokenTargets = new Map();   // target -> { status, sources:Set }
  const redirectTargets = new Map();
  for (const p of pages) {
    for (const link of p.data?.internalLinks || []) {
      const key = normalize(link.href);
      const st = statusByUrl.get(key);
      if (st === undefined) continue; // cel niezaudytowany (poza zakresem crawla)
      if (st >= 400) {
        if (!brokenTargets.has(key)) brokenTargets.set(key, { status: st, sources: new Set() });
        brokenTargets.get(key).sources.add(p.url);
      } else if (st >= 300) {
        if (!redirectTargets.has(key)) redirectTargets.set(key, { status: st, sources: new Set() });
        redirectTargets.get(key).sources.add(p.url);
      }
    }
  }
  if (brokenTargets.size > 0) {
    const list = [...brokenTargets.entries()].map(([url, v]) => `${url} (${v.status}, z ${v.sources.size} stron)`);
    add('error', 'links', 'Wewnętrzne linki do stron z błędem (4xx/5xx)', `${brokenTargets.size} docelowych adresów zwraca błąd.`, list.slice(0, 20));
  }
  if (redirectTargets.size > 0) {
    const list = [...redirectTargets.entries()].map(([url, v]) => `${url} (${v.status}, z ${v.sources.size} stron)`);
    add('warning', 'links', 'Wewnętrzne linki do przekierowań', `${redirectTargets.size} linkowanych adresów przekierowuje — linkuj bezpośrednio do celu.`, list.slice(0, 20));
  }

  // --- Reconciliacja sitemap ↔ crawl ---
  if (sitemapUrls && sitemapUrls.length > 0) {
    const sitemapSet = new Set(sitemapUrls.map(normalize));
    const crawledSet = new Set(pages.map((p) => normalize(p.url)));
    // 1. URL-e w sitemap, które są nieindeksowalne (noindex / nie-200 / canonical na inny URL)
    const badInSitemap = [];
    for (const p of pages) {
      if (!sitemapSet.has(normalize(p.url))) continue;
      const robots = (p.data?.metaRobots || '').toLowerCase();
      if (p.response.status >= 300) badInSitemap.push(`${p.url} (status ${p.response.status})`);
      else if (robots.includes('noindex')) badInSitemap.push(`${p.url} (noindex)`);
    }
    if (badInSitemap.length > 0) {
      add('warning', 'indexability', 'Sitemap zawiera nieindeksowalne URL-e', `${badInSitemap.length} adresów z sitemap ma noindex lub status ≠ 200.`, badInSitemap.slice(0, 20));
    }
    // 2. Zaindeksowane, indeksowalne strony spoza sitemap
    const missing = indexable
      .filter((p) => !sitemapSet.has(normalize(p.url)) && !(p.data?.metaRobots || '').toLowerCase().includes('noindex'))
      .map((p) => p.url);
    if (missing.length > 0) {
      add('notice', 'indexability', 'Strony poza sitemap', `${missing.length} indeksowalnych stron nie występuje w sitemap.xml.`, missing.slice(0, 20));
    }
  }

  // --- Near-duplicate content (Jaccard na shingle'ach próbki treści) ---
  const nearDup = findNearDuplicates(indexable);
  if (nearDup.length > 0) {
    for (const g of nearDup.slice(0, 10)) {
      add('warning', 'content', 'Bardzo podobna treść (near-duplicate)', `Podobieństwo ~${g.similarity}% między stronami.`, g.urls);
    }
  }

  // --- Rozkład głębokości + inlinki ---
  const depthDist = {};
  for (const p of pages) {
    const d = p.depth ?? 0;
    depthDist[d] = (depthDist[d] || 0) + 1;
  }
  const maxDepth = Math.max(0, ...pages.map((p) => p.depth ?? 0));
  const deepPages = pages.filter((p) => (p.depth ?? 0) >= 4).length;

  return {
    issues,
    stats: {
      crawled: pages.length,
      indexable: indexable.length,
      duplicateTitles: dupTitles.length,
      duplicateDescriptions: dupDescs.length,
      orphanPages: orphans.length,
      brokenInternalTargets: brokenTargets.size,
      redirectInternalTargets: redirectTargets.size,
      nearDuplicates: nearDup.length,
      maxDepth,
      deepPages,
      depthDistribution: depthDist,
    },
  };
}

// Wykrywanie near-duplicate przez podobieństwo Jaccarda na 3-shingle'ach próbki treści.
function findNearDuplicates(pages) {
  const signatures = pages
    .map((p) => ({ url: p.url, sh: shingles(`${p.data?.title || ''} ${p.data?.headingsText || ''} ${p.data?.bodySample || ''}`) }))
    .filter((s) => s.sh.size >= 8);
  const groups = [];
  const used = new Set();
  const N = Math.min(signatures.length, 600); // ochrona przed O(n^2) na dużych crawlach
  for (let i = 0; i < N; i++) {
    if (used.has(i)) continue;
    const group = [signatures[i].url];
    for (let j = i + 1; j < N; j++) {
      if (used.has(j)) continue;
      const sim = jaccard(signatures[i].sh, signatures[j].sh);
      if (sim >= 0.82) {
        group.push(signatures[j].url);
        used.add(j);
        groups.push({ urls: [signatures[i].url, signatures[j].url], similarity: Math.round(sim * 100) });
      }
    }
  }
  return groups;
}

function shingles(text) {
  const tokens = String(text).toLowerCase().replace(/[^a-z0-9ąćęłńóśżź\s]/gi, ' ').split(/\s+/).filter(Boolean);
  const set = new Set();
  for (let i = 0; i < tokens.length - 2; i++) set.add(tokens[i] + ' ' + tokens[i + 1] + ' ' + tokens[i + 2]);
  return set;
}

function jaccard(a, b) {
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    let s = u.href;
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return url;
  }
}
