// Orkiestrator audytu: BFS crawl + audyt każdej strony + zdarzenia postępu.
import pLimit from 'p-limit';
import { fetchUrl, USER_AGENT } from './fetcher.js';
import { fetchRobots, isAllowed } from './robots.js';
import { discoverSitemaps, collectSitemapUrls } from './sitemap.js';
import { extractPageData } from '../audit/extract.js';
import { runChecks } from '../audit/checks.js';
import { analyzeSite } from '../audit/siteAudit.js';
import { scoreAudit } from '../audit/scoring.js';
import { renderPage } from '../render/renderer.js';

export class CrawlController {
  constructor() {
    this.cancelled = false;
  }
  cancel() {
    this.cancelled = true;
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    // usuń typowe parametry śledzące
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_)/i.test(p)) u.searchParams.delete(p);
    }
    let s = u.href;
    if (s.endsWith('/') && u.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

function sameSite(a, b, includeSubdomains) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    if (includeSubdomains) {
      const rootA = ua.hostname.split('.').slice(-2).join('.');
      const rootB = ub.hostname.split('.').slice(-2).join('.');
      return rootA === rootB;
    }
    return ua.hostname === ub.hostname;
  } catch {
    return false;
  }
}

/**
 * Uruchamia pełny audyt.
 * @param {object} opts
 * @param {function} emit  callback(event) do raportowania postępu
 * @param {CrawlController} controller
 */
export async function runAudit(opts, emit = () => {}, controller = new CrawlController()) {
  const {
    startUrl,
    maxPages = 50,        // liczba lub 'all' (=> Infinity)
    concurrency = 5,
    respectRobots = true,
    includeSubdomains = false,
    checkExternalLinks = false,
    renderJs = false,
    useSitemap = true,
  } = opts;

  const limitPages = maxPages === 'all' || maxPages === Infinity ? Infinity : Number(maxPages);
  const start = normalizeUrl(startUrl);
  if (!start) throw new Error('Nieprawidłowy adres URL startowy.');
  const origin = new URL(start).origin;

  emit({ type: 'status', phase: 'init', message: 'Inicjalizacja audytu…' });

  // robots.txt
  let robots = null;
  emit({ type: 'status', phase: 'robots', message: 'Pobieranie robots.txt…' });
  const robotsData = await fetchRobots(origin);
  robots = robotsData.exists ? robotsData : null;

  // sitemap
  let sitemapUrls = [];
  let sitemaps = [];
  if (useSitemap) {
    emit({ type: 'status', phase: 'sitemap', message: 'Wykrywanie sitemap…' });
    sitemaps = await discoverSitemaps(origin, robotsData.sitemaps || []);
    if (sitemaps.length) {
      sitemapUrls = await collectSitemapUrls(sitemaps.map((s) => s.url), {
        maxUrls: limitPages === Infinity ? 50000 : Math.max(limitPages * 3, 500),
      });
    }
  }

  // Kolejka BFS
  const queue = [{ url: start, depth: 0 }];
  const seen = new Set([start]);
  // wstrzyknij URL-e z sitemap jako kandydatów (priorytet po crawlowaniu linków)
  for (const su of sitemapUrls) {
    const n = normalizeUrl(su);
    if (n && sameSite(origin, n, includeSubdomains) && !seen.has(n)) {
      seen.add(n);
      queue.push({ url: n, depth: 1, fromSitemap: true });
    }
  }

  const pages = [];
  const limit = pLimit(concurrency);
  let processed = 0;

  emit({
    type: 'status',
    phase: 'crawl',
    message: 'Rozpoczynam skanowanie…',
    discovered: queue.length,
    sitemapCount: sitemapUrls.length,
    robots: robotsData.exists,
  });

  // Przetwarzaj falami, by móc dodawać nowo odkryte linki
  while (queue.length > 0 && pages.length < limitPages && !controller.cancelled) {
    const batch = queue.splice(0, Math.min(concurrency * 2, queue.length));
    const tasks = batch.map((item) =>
      limit(async () => {
        if (controller.cancelled || pages.length >= limitPages) return;

        // robots check
        if (respectRobots && robots) {
          const pathname = new URL(item.url).pathname;
          if (!isAllowed(robots, pathname, USER_AGENT)) {
            return;
          }
        }

        const auditedPage = await auditPage(item, { renderJs });
        pages.push(auditedPage);
        processed++;

        emit({
          type: 'progress',
          processed,
          total: limitPages === Infinity ? null : limitPages,
          queued: queue.length,
          url: item.url,
          status: auditedPage.response.status,
          issues: auditedPage.issues.length,
        });

        // Odkrywanie nowych linków
        if (auditedPage.data && pages.length < limitPages) {
          for (const link of auditedPage.data.internalLinks || []) {
            const n = normalizeUrl(link.href);
            if (!n || seen.has(n)) continue;
            if (!sameSite(origin, n, includeSubdomains)) continue;
            seen.add(n);
            queue.push({ url: n, depth: (item.depth ?? 0) + 1 });
          }
        }
      })
    );
    await Promise.all(tasks);
  }

  // Weryfikacja linków zewnętrznych (opcjonalnie)
  if (checkExternalLinks && !controller.cancelled) {
    emit({ type: 'status', phase: 'links', message: 'Sprawdzanie linków zewnętrznych…' });
    await verifyExternalLinks(pages, emit, controller);
  }

  // Analiza całej witryny
  emit({ type: 'status', phase: 'analyze', message: 'Analiza całej witryny…' });
  const site = analyzeSite(pages, { startUrl: start });
  const summary = scoreAudit(pages, site.issues);

  const result = {
    meta: {
      startUrl: start,
      origin,
      generatedAt: new Date().toISOString(),
      options: { maxPages, respectRobots, includeSubdomains, checkExternalLinks, renderJs, useSitemap },
      cancelled: controller.cancelled,
    },
    robots: { exists: robotsData.exists, url: robotsData.url, sitemaps: robotsData.sitemaps || [], crawlDelay: null },
    sitemaps,
    summary,
    site: site.stats,
    siteIssues: site.issues,
    pages: pages.map(serializePage),
  };

  emit({ type: 'done', result });
  return result;
}

async function auditPage(item, { renderJs }) {
  const response = await fetchUrl(item.url, { timeout: 20000 });
  const page = { url: item.url, depth: item.depth ?? 0, response, data: null, issues: [], render: null };

  const isHtml = (response.contentType || '').includes('html');
  if (response.ok && response.body && isHtml) {
    page.data = extractPageData(response.body, response.finalUrl);

    // Render JS (opcjonalnie)
    if (renderJs) {
      const rendered = await renderPage(item.url).catch(() => null);
      if (rendered && rendered.renderedHtml && !rendered.error) {
        page.render = { metrics: rendered.metrics };
        // porównanie liczby słów surowy vs render
        const renderedData = extractPageData(rendered.renderedHtml, response.finalUrl);
        page.render.wordCountRendered = renderedData.wordCount;
        page.render.wordCountRaw = page.data.wordCount;
        if (renderedData.wordCount > page.data.wordCount * 1.5 && page.data.wordCount < 200) {
          page.issues.push({
            severity: 'warning',
            category: 'content',
            title: 'Treść zależna od JavaScript',
            detail: `Render JS ujawnił ${renderedData.wordCount} słów vs ${page.data.wordCount} w surowym HTML — możliwe problemy z indeksacją.`,
          });
        }
      }
    }

    page.issues.push(...runChecks(page));
  } else if (!response.ok) {
    page.issues.push({
      severity: response.status >= 500 ? 'error' : 'error',
      category: 'indexability',
      title: response.error ? `Błąd: ${response.error}` : `Status HTTP ${response.status}`,
      detail: `Nie udało się poprawnie pobrać strony (status ${response.status}).`,
    });
  }
  return page;
}

async function verifyExternalLinks(pages, emit, controller) {
  const { checkStatus } = await import('./fetcher.js');
  const unique = new Map();
  for (const p of pages) {
    for (const l of (p.data?.externalLinks || [])) {
      if (!unique.has(l.href)) unique.set(l.href, []);
      unique.get(l.href).push(p.url);
    }
  }
  const limit = pLimit(8);
  const entries = [...unique.entries()].slice(0, 500);
  let checked = 0;
  const broken = [];
  await Promise.all(
    entries.map(([href, sources]) =>
      limit(async () => {
        if (controller.cancelled) return;
        const res = await checkStatus(href);
        checked++;
        if (!res.ok && res.status !== 0) {
          if (res.status >= 400) broken.push({ href, status: res.status, sources: sources.slice(0, 5) });
        }
        if (checked % 20 === 0) emit({ type: 'status', phase: 'links', message: `Sprawdzono ${checked}/${entries.length} linków…` });
      })
    )
  );
  // dołącz problemy do stron źródłowych
  for (const b of broken) {
    for (const src of b.sources) {
      const p = pages.find((pp) => pp.url === src);
      if (p) p.issues.push({
        severity: 'warning',
        category: 'links',
        title: 'Niedziałający link zewnętrzny',
        detail: `${b.href} → status ${b.status}`,
      });
    }
  }
  emit({ type: 'status', phase: 'links', message: `Znaleziono ${broken.length} niedziałających linków zewnętrznych.` });
}

function serializePage(p) {
  const d = p.data;
  return {
    url: p.url,
    finalUrl: p.response.finalUrl,
    depth: p.depth,
    status: p.response.status,
    error: p.response.error || null,
    responseTimeMs: p.response.responseTimeMs,
    ttfb: p.response.ttfb,
    bytes: p.response.bytes,
    contentType: p.response.contentType,
    redirectChain: p.response.redirectChain || [],
    issues: p.issues,
    issueCounts: countSeverity(p.issues),
    render: p.render,
    seo: d
      ? {
          title: d.title,
          titleLength: d.titleLength,
          metaDescription: d.metaDescription,
          metaDescriptionLength: d.metaDescriptionLength,
          h1: d.headings.h1,
          h2: d.headings.h2.slice(0, 15),
          h1Count: d.h1Count,
          canonical: d.canonical,
          metaRobots: d.metaRobots,
          htmlLang: d.htmlLang,
          viewport: d.viewport,
          wordCount: d.wordCount,
          imageCount: d.imageCount,
          imagesMissingAlt: d.imagesMissingAlt,
          internalLinkCount: d.internalLinkCount,
          externalLinkCount: d.externalLinkCount,
          hasStructuredData: d.jsonLd.length > 0 || d.microdata > 0 || d.rdfa > 0,
          structuredTypes: d.jsonLd.flatMap((j) => j.types),
          hasOpenGraph: !!(d.og['og:title'] || d.og['og:image']),
          hreflangCount: d.hreflang.length,
          headingsText: d.headingsText,
          bodySample: d.bodySample,
        }
      : null,
  };
}

function countSeverity(issues) {
  const c = { error: 0, warning: 0, notice: 0 };
  for (const i of issues) if (c[i.severity] !== undefined) c[i.severity]++;
  return c;
}
