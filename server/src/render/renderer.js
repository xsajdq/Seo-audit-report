// Opcjonalny render headless (Playwright). Dynamiczny import — jeśli pakiet/przeglądarka
// nie są zainstalowane, render jest po prostu pomijany (graceful degradation).
let chromiumPromise = null;
let available = null;

async function getChromium() {
  if (available === false) return null;
  if (!chromiumPromise) {
    chromiumPromise = import('playwright')
      .then((m) => {
        available = true;
        return m.chromium;
      })
      .catch(() => {
        available = false;
        return null;
      });
  }
  return chromiumPromise;
}

export async function isRenderAvailable() {
  const chromium = await getChromium();
  if (!chromium) return false;
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    available = false;
    return false;
  }
}

let sharedBrowser = null;
async function getBrowser() {
  const chromium = await getChromium();
  if (!chromium) return null;
  if (!sharedBrowser || !sharedBrowser.isConnected()) {
    sharedBrowser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  }
  return sharedBrowser;
}

export async function closeBrowser() {
  if (sharedBrowser) {
    try { await sharedBrowser.close(); } catch { /* noop */ }
    sharedBrowser = null;
  }
}

/**
 * Renderuje stronę i zwraca renderowany HTML oraz Core Web Vitals (LCP, CLS) i metryki.
 */
export async function renderPage(url, { timeout = 30000 } = {}) {
  const browser = await getBrowser();
  if (!browser) return null;

  const context = await browser.newContext({
    userAgent: 'SEO-Audit-Tool/1.0 (headless render)',
    viewport: { width: 1366, height: 768 },
  });
  const page = await context.newPage();
  let consoleErrors = 0;
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors++; });

  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout });
    // Daj czas na zebranie metryk web-vitals
    await page.waitForTimeout(800);

    const metrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const paints = performance.getEntriesByType('paint');
      const fcp = paints.find((p) => p.name === 'first-contentful-paint');
      const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
      const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1] : null;
      let cls = 0;
      for (const e of performance.getEntriesByType('layout-shift') || []) {
        if (!e.hadRecentInput) cls += e.value;
      }
      // TBT (Total Blocking Time) — proxy interaktywności (INP wymaga realnej interakcji)
      let tbt = 0;
      let longTasks = 0;
      for (const e of performance.getEntriesByType('longtask') || []) {
        const blocking = e.duration - 50;
        if (blocking > 0) { tbt += blocking; longTasks++; }
      }
      return {
        ttfb: nav.responseStart ? Math.round(nav.responseStart) : null,
        domContentLoaded: nav.domContentLoadedEventEnd ? Math.round(nav.domContentLoadedEventEnd) : null,
        load: nav.loadEventEnd ? Math.round(nav.loadEventEnd) : null,
        fcp: fcp ? Math.round(fcp.startTime) : null,
        lcp: lcp ? Math.round(lcp.startTime || lcp.renderTime || lcp.loadTime) : null,
        cls: Math.round(cls * 1000) / 1000,
        tbt: Math.round(tbt),
        longTasks,
        domNodes: document.getElementsByTagName('*').length,
      };
    });

    const renderedHtml = await page.content();
    return {
      status: resp ? resp.status() : null,
      renderedHtml,
      metrics: { ...metrics, consoleErrors },
    };
  } catch (err) {
    return { error: err.message };
  } finally {
    await context.close().catch(() => {});
  }
}
