// HTTP fetcher z pomiarem czasu odpowiedzi, śledzeniem przekierowań i nagłówków.
const USER_AGENT =
  'SEO-Audit-Tool/1.0 (+local; technical SEO crawler)';

/**
 * Pobiera URL ręcznie podążając za przekierowaniami, aby zbudować łańcuch redirectów.
 * @returns {Promise<object>} dane odpowiedzi
 */
export async function fetchUrl(url, { method = 'GET', timeout = 20000, maxRedirects = 10 } = {}) {
  const redirectChain = [];
  let currentUrl = url;
  let response;
  const startedAt = Date.now();

  for (let i = 0; i <= maxRedirects; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const stepStart = Date.now();
    try {
      response = await fetch(currentUrl, {
        method,
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pl,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
        },
      });
    } catch (err) {
      clearTimeout(timer);
      return {
        url,
        finalUrl: currentUrl,
        ok: false,
        error: err.name === 'AbortError' ? 'Timeout' : err.message,
        status: 0,
        redirectChain,
        responseTimeMs: Date.now() - startedAt,
      };
    }
    clearTimeout(timer);

    const status = response.status;
    const location = response.headers.get('location');
    const ttfb = Date.now() - stepStart;

    // 3xx z Location -> podążaj dalej
    if (status >= 300 && status < 400 && location) {
      const nextUrl = new URL(location, currentUrl).href;
      redirectChain.push({ from: currentUrl, to: nextUrl, status });
      currentUrl = nextUrl;
      continue;
    }

    // Odpowiedź końcowa
    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let body = '';
    let bytes = 0;
    const contentType = headers['content-type'] || '';
    if (method !== 'HEAD') {
      const buf = Buffer.from(await response.arrayBuffer());
      bytes = buf.length;
      if (/text|html|xml|json|javascript|css/.test(contentType) || !contentType) {
        body = buf.toString('utf-8');
      }
    }

    return {
      url,
      finalUrl: currentUrl,
      ok: status >= 200 && status < 400,
      status,
      statusText: response.statusText,
      headers,
      contentType,
      body,
      bytes,
      ttfb,
      responseTimeMs: Date.now() - startedAt,
      redirectChain,
    };
  }

  return {
    url,
    finalUrl: currentUrl,
    ok: false,
    error: `Przekroczono limit przekierowań (${maxRedirects})`,
    status: 0,
    redirectChain,
    responseTimeMs: Date.now() - startedAt,
  };
}

/** Lekkie sprawdzenie statusu (do weryfikacji linków). Próbuje HEAD, fallback GET. */
export async function checkStatus(url, { timeout = 15000 } = {}) {
  let res = await fetchUrl(url, { method: 'HEAD', timeout, maxRedirects: 5 });
  // Niektóre serwery nie wspierają HEAD -> fallback do GET
  if (!res.ok && (res.status === 405 || res.status === 501 || res.status === 0)) {
    res = await fetchUrl(url, { method: 'GET', timeout, maxRedirects: 5 });
  }
  return {
    url,
    status: res.status,
    ok: res.ok,
    finalUrl: res.finalUrl,
    redirectChain: res.redirectChain || [],
    error: res.error,
  };
}

export { USER_AGENT };
