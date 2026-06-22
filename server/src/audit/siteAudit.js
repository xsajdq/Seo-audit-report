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

  // --- Wzajemność tagów hreflang (return tags) + walidacja kodów języka ---
  const hreflangByUrl = new Map();
  for (const p of indexable) {
    const entries = (p.data?.hreflang || []).map((h) => ({ lang: h.lang, href: h.href ? normalize(new URL(h.href, p.url).href) : null }));
    if (entries.length) hreflangByUrl.set(normalize(p.url), entries);
  }
  const missingReturn = [];
  const badLangCodes = new Set();
  for (const [src, entries] of hreflangByUrl) {
    for (const e of entries) {
      if (e.lang && e.lang.toLowerCase() !== 'x-default' && !/^[a-z]{2}(-[a-z]{2})?$/i.test(e.lang)) badLangCodes.add(e.lang);
      if (!e.href || e.href === src || e.lang === 'x-default') continue;
      const targetEntries = hreflangByUrl.get(e.href);
      if (targetEntries && !targetEntries.some((te) => te.href === src)) {
        missingReturn.push(`${src} → ${e.href} (brak tagu zwrotnego)`);
      }
    }
  }
  if (missingReturn.length > 0) {
    add('warning', 'international', 'Hreflang bez tagu zwrotnego (return tag)', `${missingReturn.length} powiązań hreflang nie ma odwzajemnienia — Google ignoruje takie tagi.`, missingReturn.slice(0, 20));
  }
  if (badLangCodes.size > 0) {
    add('warning', 'international', 'Nieprawidłowe kody hreflang', `Niepoprawne wartości: ${[...badLangCodes].slice(0, 10).join(', ')}.`);
  }

  // --- Łańcuchy canonical (canonical → URL, który ma własny canonical na inny URL) ---
  const canonicalByUrl = new Map();
  for (const p of indexable) {
    if (!p.data?.canonical) continue;
    try {
      const c = normalize(new URL(p.data.canonical, p.url).href);
      if (c !== normalize(p.url)) canonicalByUrl.set(normalize(p.url), c);
    } catch { /* noop */ }
  }
  const canonicalChains = [];
  for (const [src, target] of canonicalByUrl) {
    const next = canonicalByUrl.get(target);
    if (next && next !== target) {
      canonicalChains.push(`${src} → ${target} → ${next}`);
    }
  }
  if (canonicalChains.length > 0) {
    add('warning', 'indexability', 'Łańcuch canonical', `${canonicalChains.length} stron ma canonical wskazujący na URL, który sam kanonikalizuje gdzie indziej.`, canonicalChains.slice(0, 20));
  }

  // --- Kanibalizacja słów kluczowych (różne URL-e pod tę samą intencję/temat) ---
  const cannibal = findCannibalization(indexable);
  if (cannibal.length > 0) {
    for (const c of cannibal.slice(0, 12)) {
      add('warning', 'content', 'Możliwa kanibalizacja słów kluczowych', `Różne strony zoptymalizowane pod ten sam temat („${c.topic}").`, c.urls);
    }
  }

  // --- Wewnętrzny PageRank (przepływ mocy linków) ---
  const prStats = computeInternalPageRank(pages, indexable);
  if (prStats.weakImportant.length > 0) {
    add('notice', 'architecture', 'Ważne strony ze słabym linkowaniem wewnętrznym', `${prStats.weakImportant.length} stron blisko strony głównej ma niski wewnętrzny PageRank — wzmocnij linkowanie.`, prStats.weakImportant.slice(0, 15));
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
      cannibalization: cannibal.length,
      hreflangMissingReturn: missingReturn.length,
      canonicalChains: canonicalChains.length,
      maxDepth,
      deepPages,
      depthDistribution: depthDist,
      topPages: prStats.topPages,
    },
  };
}

// Kanibalizacja: różne URL-e o silnie pokrywających się tytułach/H1 (ten sam target),
// ale nie identyczne (identyczne tytuły wykrywa osobny check).
function findCannibalization(pages) {
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
    .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ż/g, 'z').replace(/ź/g, 'z')
    .replace(/[^a-z0-9\s]/g, ' ');
  const STOP = new Set(['i', 'oraz', 'w', 'na', 'do', 'z', 'dla', 'the', 'and', 'of', 'a', 'o', 'po', 'za']);
  const sig = pages.map((p) => {
    const text = norm(`${p.data?.title || ''} ${(p.data?.headings?.h1 || []).join(' ')}`);
    const toks = new Set(text.split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)));
    return { url: p.url, title: (p.data?.title || '').trim().toLowerCase(), toks };
  }).filter((s) => s.toks.size >= 2);

  const out = [];
  const used = new Set();
  const N = Math.min(sig.length, 600);
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (sig[i].title === sig[j].title) continue; // identyczne tytuły = inny check
      let inter = 0;
      for (const t of sig[i].toks) if (sig[j].toks.has(t)) inter++;
      const sim = inter / (sig[i].toks.size + sig[j].toks.size - inter);
      if (sim >= 0.6) {
        const key = `${i}-${j}`;
        if (used.has(key)) continue;
        used.add(key);
        const topic = [...sig[i].toks].filter((t) => sig[j].toks.has(t)).slice(0, 4).join(' ');
        out.push({ topic, urls: [sig[i].url, sig[j].url], similarity: Math.round(sim * 100) });
      }
    }
  }
  return out;
}

// Wewnętrzny PageRank metodą iteracji potęgowej (damping 0.85). Mutuje pages (p.pagerank).
function computeInternalPageRank(allPages, indexable) {
  const nodes = indexable.map((p) => normalize(p.url));
  const idx = new Map(nodes.map((u, i) => [u, i]));
  const n = nodes.length;
  if (n === 0) return { topPages: [], weakImportant: [] };

  const outLinks = nodes.map(() => []);
  const pageByNode = indexable;
  for (let i = 0; i < n; i++) {
    const links = pageByNode[i].data?.internalLinks || [];
    const targets = new Set();
    for (const l of links) {
      const t = idx.get(normalize(l.href));
      if (t !== undefined && t !== i) targets.add(t);
    }
    outLinks[i] = [...targets];
  }

  const d = 0.85;
  let pr = new Array(n).fill(1 / n);
  for (let iter = 0; iter < 25; iter++) {
    const next = new Array(n).fill((1 - d) / n);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (outLinks[i].length === 0) dangling += pr[i];
      else {
        const share = (d * pr[i]) / outLinks[i].length;
        for (const t of outLinks[i]) next[t] += share;
      }
    }
    const danglingShare = (d * dangling) / n;
    for (let i = 0; i < n; i++) next[i] += danglingShare;
    pr = next;
  }

  // Mutacja: zapisz pagerank (znormalizowany 0-100 względem max) na surowych stronach
  const max = Math.max(...pr, 1e-9);
  for (let i = 0; i < n; i++) {
    pageByNode[i].pagerank = Math.round((pr[i] / max) * 100);
  }

  const ranked = nodes.map((u, i) => ({ url: pageByNode[i].url, pr: Math.round((pr[i] / max) * 100), depth: pageByNode[i].depth ?? 0 }))
    .sort((a, b) => b.pr - a.pr);
  const topPages = ranked.slice(0, 8).map((r) => ({ url: r.url, pr: r.pr }));
  // ważne (płytkie) strony z niskim PR
  const threshold = ranked.length > 4 ? ranked[Math.floor(ranked.length * 0.75)].pr : 0;
  const weakImportant = ranked.filter((r) => r.depth <= 1 && r.pr <= threshold && r.pr < 40).map((r) => `${r.url} (PR ${r.pr}, głęb. ${r.depth})`);
  return { topPages, weakImportant };
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
