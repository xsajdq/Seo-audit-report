// Wykrywanie i parsowanie sitemap.xml (w tym sitemap index oraz zagnieżdżone mapy).
import * as cheerio from 'cheerio';
import { fetchUrl } from './fetcher.js';

export async function discoverSitemaps(origin, robotsSitemaps = []) {
  const candidates = new Set(robotsSitemaps);
  candidates.add(new URL('/sitemap.xml', origin).href);
  candidates.add(new URL('/sitemap_index.xml', origin).href);

  const found = [];
  for (const sm of candidates) {
    const res = await fetchUrl(sm, { timeout: 12000 });
    if (res.ok && res.body && /<(urlset|sitemapindex)/i.test(res.body)) {
      found.push({ url: sm, status: res.status });
    }
  }
  return found;
}

/** Rekurencyjnie zbiera URL-e ze wszystkich sitemap (z limitem głębokości i liczby). */
export async function collectSitemapUrls(sitemapUrls, { maxUrls = 50000, maxDepth = 3 } = {}) {
  const urls = new Set();
  const visited = new Set();

  async function process(url, depth) {
    if (depth > maxDepth || visited.has(url) || urls.size >= maxUrls) return;
    visited.add(url);
    const res = await fetchUrl(url, { timeout: 15000 });
    if (!res.ok || !res.body) return;
    const $ = cheerio.load(res.body, { xmlMode: true });

    // sitemap index -> zagnieżdżone mapy
    const nested = $('sitemap > loc')
      .map((_, el) => $(el).text().trim())
      .get();
    for (const n of nested) {
      await process(n, depth + 1);
    }

    // zwykłe wpisy url
    $('url > loc').each((_, el) => {
      if (urls.size < maxUrls) urls.add($(el).text().trim());
    });
  }

  for (const sm of sitemapUrls) {
    await process(sm, 0);
  }
  return [...urls];
}
