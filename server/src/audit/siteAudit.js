// Analiza całej witryny (cross-page): duplikaty tytułów/opisów, strony osierocone,
// niespójność canonical, rozkład głębokości itd.
export function analyzeSite(pages, { startUrl } = {}) {
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

  // --- Rozkład głębokości ---
  const depthDist = {};
  for (const p of pages) {
    const d = p.depth ?? 0;
    depthDist[d] = (depthDist[d] || 0) + 1;
  }

  return {
    issues,
    stats: {
      crawled: pages.length,
      indexable: indexable.length,
      duplicateTitles: dupTitles.length,
      duplicateDescriptions: dupDescs.length,
      orphanPages: orphans.length,
      depthDistribution: depthDist,
    },
  };
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
