// Orkiestrator audytu: BFS crawl + audyt każdej strony + zdarzenia postępu.
import pLimit from 'p-limit';
import { fetchUrl, USER_AGENT } from './fetcher.js';
import { fetchRobots, isAllowed } from './robots.js';
import { discoverSitemaps, collectSitemapUrls } from './sitemap.js';
import { extractPageData } from '../audit/extract.js';
import { runChecks } from '../audit/checks.js';
import { analyzeSite } from '../audit/siteAudit.js';
import { scoreAudit } from '../audit/scoring.js';
import { recommendationFor } from '../audit/recommendations.js';
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

  // llms.txt (Generative Engine Optimization — wskazuje LLM-om kluczowe treści)
  const llmsRes = await fetchUrl(new URL('/llms.txt', origin).href, { timeout: 8000 }).catch(() => null);
  const llmsTxt = { exists: !!(llmsRes && llmsRes.ok && llmsRes.body && llmsRes.body.length > 10), url: new URL('/llms.txt', origin).href };

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
  const site = analyzeSite(pages, { startUrl: start, sitemapUrls });

  // Kanonikalizacja domeny: http→https oraz spójność www/non-www (klasyczny check specjalisty)
  const domainIssues = await checkDomainCanonicalization(origin);
  site.issues.push(...domainIssues);

  // Soft-404: nieistniejący URL powinien zwracać 404/410, nie 200
  try {
    const fakeUrl = new URL(`/nieistniejaca-strona-${Math.random().toString(36).slice(2, 10)}`, origin).href;
    const fake = await fetchUrl(fakeUrl, { timeout: 8000 });
    if (fake.status >= 200 && fake.status < 300) {
      site.issues.push({ severity: 'warning', category: 'indexability', title: 'Soft 404 (błędny URL zwraca 200)', detail: 'Nieistniejący adres zwraca status 200 zamiast 404/410 — Google może indeksować puste/błędne strony.' });
    }
  } catch { /* sieć — pomiń */ }

  // GEO na poziomie witryny: llms.txt + spójność encji (sameAs/Organization)
  if (!llmsTxt.exists) {
    site.issues.push({
      severity: 'notice', category: 'geo', title: 'Brak pliku llms.txt',
      detail: 'Brak /llms.txt — pliku wskazującego silnikom AI kluczowe treści witryny (wschodzący standard GEO).',
    });
  }
  const hasOrgEntity = pages.some((p) => p.data && p.data.ldFlags && (p.data.ldFlags.organization || p.data.ldFlags.localBusiness));
  const hasSameAs = pages.some((p) => p.data && p.data.ldFlags && p.data.ldFlags.sameAs && p.data.ldFlags.sameAs.length > 0);
  if (!hasOrgEntity) {
    site.issues.push({
      severity: 'notice', category: 'geo', title: 'Brak encji Organization w danych strukturalnych',
      detail: 'Żadna strona nie deklaruje schema Organization/LocalBusiness — utrudnia AI rozpoznanie marki jako encji.',
    });
  } else if (!hasSameAs) {
    site.issues.push({
      severity: 'notice', category: 'geo', title: 'Brak sameAs w encji Organization',
      detail: 'Dodaj sameAs (profile social, Wikipedia/Wikidata) do schema Organization — wzmacnia rozpoznanie encji przez AI.',
    });
  }

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
    llmsTxt,
    sitemaps,
    summary,
    site: site.stats,
    siteIssues: site.issues.map((i) => ({ ...i, fix: recommendationFor(i) })),
    pages: pages.map(serializePage),
  };

  emit({ type: 'done', result });
  return result;
}

// Sprawdza http→https oraz spójność www/non-www dla strony głównej.
async function checkDomainCanonicalization(origin) {
  const issues = [];
  try {
    const u = new URL(origin);
    const root = u.hostname.replace(/^www\./, '');
    const httpVariant = `http://${u.hostname}/`;
    const wwwVariant = `https://www.${root}/`;
    const nonWwwVariant = `https://${root}/`;

    const [http, www, nonWww] = await Promise.all([
      fetchUrl(httpVariant, { method: 'HEAD', timeout: 8000 }).catch(() => null),
      fetchUrl(wwwVariant, { method: 'HEAD', timeout: 8000 }).catch(() => null),
      fetchUrl(nonWwwVariant, { method: 'HEAD', timeout: 8000 }).catch(() => null),
    ]);

    // http powinno przekierowywać na https
    if (http && http.finalUrl && http.finalUrl.startsWith('http://') && http.status > 0) {
      issues.push({ severity: 'error', category: 'security', title: 'Brak przekierowania http→https', detail: `${httpVariant} nie przekierowuje na HTTPS.` });
    }
    // www i non-www nie powinny obie zwracać 200 (duplikacja strony głównej)
    const wwwOk = www && www.status >= 200 && www.status < 300 && www.redirectChain.length === 0;
    const nonWwwOk = nonWww && nonWww.status >= 200 && nonWww.status < 300 && nonWww.redirectChain.length === 0;
    if (wwwOk && nonWwwOk) {
      issues.push({ severity: 'warning', category: 'indexability', title: 'Brak kanonikalizacji www/non-www', detail: 'Zarówno wersja www, jak i non-www zwracają 200 bez przekierowania — duplikacja strony głównej. Wybierz jedną i przekieruj 301.' });
    }
  } catch { /* sieć / parsowanie — pomiń */ }
  return issues;
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
    pagerank: p.pagerank ?? null,
    issues: p.issues.map((i) => ({ ...i, fix: recommendationFor(i) })),
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
          internalLinkHrefs: (d.internalLinks || []).slice(0, 200).map((l) => l.href),
          hasStructuredData: d.jsonLd.length > 0 || d.microdata > 0 || d.rdfa > 0,
          structuredTypes: d.jsonLd.flatMap((j) => j.types),
          hasOpenGraph: !!(d.og['og:title'] || d.og['og:image']),
          hreflangCount: d.hreflang.length,
          headingsText: d.headingsText,
          bodySample: d.bodySample,
          geo: {
            semanticHtml: (d.semantic.article + d.semantic.main + d.semantic.section) > 0,
            hasAuthor: d.hasAuthor,
            hasPublishDate: d.hasPublishDate,
            hasModifiedDate: d.hasModifiedDate,
            questionHeadings: d.questionHeadings,
            lists: d.listCount,
            tables: d.tableCount,
            faqSchema: d.ldFlags.faqPage,
            fluffCount: d.fluffCount,
            entityCount: d.entityCount,
            wordsPerSection: d.wordsPerSection,
            authoritySources: (d.externalLinks || []).filter((l) => /\.(gov|edu)|wikipedia\.org/i.test(l.href)).length,
          },
          a11y: {
            interactiveNoName: d.a11y.interactiveNoName,
            inputsNoLabel: d.a11y.inputsNoLabel,
            positiveTabindex: d.a11y.positiveTabindex,
          },
          ux: {
            readability: d.readability,
            avgSentenceLength: d.avgSentenceLength,
            readingTimeMin: d.readingTimeMin,
            hasBreadcrumb: d.hasBreadcrumb,
            hasSearch: d.hasSearch,
            hasFavicon: d.hasFavicon,
            headSyncScripts: d.renderBlocking.headSyncScripts,
            stylesheets: d.renderBlocking.stylesheets,
            statCount: d.statCount,
          },
          local: {
            organization: d.ldFlags.organization,
            localBusiness: d.ldFlags.localBusiness,
            address: d.ldFlags.address || d.hasPostalCode || d.hasStreetMention,
            phone: d.hasPhoneInText,
            geoMeta: d.hasGeoMeta,
            map: d.hasMapEmbed,
            sameAs: d.ldFlags.sameAs.length,
          },
        }
      : null,
  };
}

function countSeverity(issues) {
  const c = { error: 0, warning: 0, notice: 0 };
  for (const i of issues) if (c[i.severity] !== undefined) c[i.severity]++;
  return c;
}
