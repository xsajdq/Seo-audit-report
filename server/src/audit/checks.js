// Silnik reguł: na podstawie danych strony + odpowiedzi HTTP generuje listę problemów (issues).
// severity: 'error' (krytyczne), 'warning' (do poprawy), 'notice' (informacja), 'good' (ok).

const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 70;
const DESC_MAX = 160;

export function runChecks(page) {
  const { data, response } = page;
  const issues = [];
  const add = (severity, category, title, detail) =>
    issues.push({ severity, category, title, detail });

  const h = response.headers || {};
  const headerLower = {};
  for (const k in h) headerLower[k.toLowerCase()] = h[k];

  // ===== INDEKSOWALNOŚĆ =====
  const robots = (data.metaRobots || '').toLowerCase();
  const xRobots = (headerLower['x-robots-tag'] || '').toLowerCase();
  const noindex = robots.includes('noindex') || xRobots.includes('noindex');
  if (noindex) {
    add('warning', 'indexability', 'Strona z noindex', 'Strona zawiera dyrektywę noindex — nie zostanie zaindeksowana.');
  }
  if (robots.includes('nofollow')) {
    add('notice', 'indexability', 'Meta robots: nofollow', 'Wszystkie linki na stronie są oznaczone jako nofollow.');
  }

  // Status / przekierowania
  if (response.status >= 400) {
    add('error', 'indexability', `Błąd HTTP ${response.status}`, `Strona zwraca status ${response.status}.`);
  } else if (response.redirectChain && response.redirectChain.length > 0) {
    const sev = response.redirectChain.length > 1 ? 'warning' : 'notice';
    add(sev, 'indexability', `Przekierowanie (${response.redirectChain.length})`,
      `Łańcuch przekierowań: ${response.redirectChain.map((r) => `${r.status}→`).join('')} ${response.finalUrl}`);
  }

  // Canonical
  if (data.canonicalCount > 1) {
    add('error', 'indexability', 'Wiele tagów canonical', `Znaleziono ${data.canonicalCount} tagów canonical — powinien być dokładnie jeden.`);
  } else if (!data.canonical) {
    add('notice', 'indexability', 'Brak tagu canonical', 'Strona nie ma zdefiniowanego linku canonical.');
  } else {
    try {
      const c = new URL(data.canonical, response.finalUrl).href;
      const self = response.finalUrl.replace(/#.*$/, '');
      if (c.replace(/\/$/, '') !== self.replace(/\/$/, '')) {
        add('notice', 'indexability', 'Canonical wskazuje na inny URL', `Canonical: ${c}`);
      }
    } catch {
      add('warning', 'indexability', 'Nieprawidłowy URL w canonical', `Wartość: ${data.canonical}`);
    }
  }

  // ===== META / TYTUŁ =====
  if (!data.title) {
    add('error', 'meta', 'Brak tagu <title>', 'Strona nie ma tytułu — kluczowy element SEO.');
  } else {
    if (data.titleCount > 1) add('warning', 'meta', 'Wiele tagów <title>', `Znaleziono ${data.titleCount} tagów title.`);
    if (data.titleLength < TITLE_MIN) add('warning', 'meta', 'Tytuł zbyt krótki', `${data.titleLength} znaków (zalecane ${TITLE_MIN}-${TITLE_MAX}).`);
    else if (data.titleLength > TITLE_MAX) add('warning', 'meta', 'Tytuł zbyt długi', `${data.titleLength} znaków (zalecane ${TITLE_MIN}-${TITLE_MAX}) — może zostać ucięty w SERP.`);
  }

  if (!data.metaDescription) {
    add('warning', 'meta', 'Brak meta description', 'Brak opisu — Google wygeneruje go automatycznie.');
  } else {
    if (data.metaDescriptionLength < DESC_MIN) add('notice', 'meta', 'Meta description zbyt krótki', `${data.metaDescriptionLength} znaków (zalecane ${DESC_MIN}-${DESC_MAX}).`);
    else if (data.metaDescriptionLength > DESC_MAX) add('notice', 'meta', 'Meta description zbyt długi', `${data.metaDescriptionLength} znaków — może zostać ucięty.`);
  }

  // ===== NAGŁÓWKI =====
  if (data.h1Count === 0) {
    add('error', 'content', 'Brak nagłówka H1', 'Strona nie zawiera żadnego H1.');
  } else if (data.h1Count > 1) {
    add('warning', 'content', 'Wiele nagłówków H1', `Znaleziono ${data.h1Count} nagłówków H1.`);
  }
  // hierarchia: H#  bez wcześniejszego poziomu
  for (let i = 2; i <= 6; i++) {
    if (data.headings[`h${i}`].length > 0 && data.headings[`h${i - 1}`].length === 0 && data.headings.h1.length > 0) {
      add('notice', 'content', `Pominięty poziom nagłówka (H${i} bez H${i - 1})`, 'Zaburzona hierarchia nagłówków.');
      break;
    }
  }

  // ===== TREŚĆ =====
  if (data.wordCount < 100 && !noindex) {
    add('warning', 'content', 'Mało treści (thin content)', `Tylko ${data.wordCount} słów na stronie.`);
  }
  if (data.textRatio < 0.1 && data.wordCount > 0) {
    add('notice', 'content', 'Niski stosunek tekstu do HTML', `${(data.textRatio * 100).toFixed(1)}% — dużo kodu względem treści.`);
  }

  // ===== OBRAZY =====
  if (data.imagesMissingAlt > 0) {
    add('warning', 'content', 'Obrazy bez atrybutu alt', `${data.imagesMissingAlt} z ${data.imageCount} obrazów nie ma atrybutu alt.`);
  }
  const noDimensions = data.images.filter((i) => i.src && (!i.width || !i.height)).length;
  if (noDimensions > 0) {
    add('notice', 'performance', 'Obrazy bez wymiarów width/height', `${noDimensions} obrazów — może powodować CLS (skoki layoutu).`);
  }

  // ===== MOBILE =====
  if (!data.viewport) {
    add('error', 'mobile', 'Brak meta viewport', 'Strona nie jest zoptymalizowana pod urządzenia mobilne.');
  } else if (!/width\s*=\s*device-width/i.test(data.viewport)) {
    add('warning', 'mobile', 'Viewport bez device-width', `Wartość: ${data.viewport}`);
  }

  // ===== JĘZYK / KODOWANIE =====
  if (!data.htmlLang) {
    add('warning', 'international', 'Brak atrybutu lang w <html>', 'Brak deklaracji języka strony.');
  }
  if (!data.charset) {
    add('notice', 'meta', 'Brak deklaracji charset', 'Zalecane <meta charset="utf-8">.');
  }

  // ===== HREFLANG =====
  if (data.hreflang.length > 0) {
    const hasSelf = data.hreflang.some((h2) => {
      try { return new URL(h2.href, response.finalUrl).href.replace(/\/$/, '') === response.finalUrl.replace(/\/$/, ''); }
      catch { return false; }
    });
    if (!hasSelf) add('notice', 'international', 'Hreflang bez self-reference', 'Zestaw hreflang nie zawiera odwołania do bieżącej strony.');
  }

  // ===== DANE STRUKTURALNE =====
  const invalidLd = data.jsonLd.filter((j) => !j.valid).length;
  if (invalidLd > 0) {
    add('warning', 'structured', 'Nieprawidłowy JSON-LD', `${invalidLd} bloków danych strukturalnych ma błąd składni.`);
  }
  if (data.jsonLd.length === 0 && data.microdata === 0 && data.rdfa === 0) {
    add('notice', 'structured', 'Brak danych strukturalnych', 'Strona nie zawiera JSON-LD, microdata ani RDFa.');
  }

  // ===== OPEN GRAPH / SOCIAL =====
  if (!data.og['og:title'] && !data.og['og:image']) {
    add('notice', 'social', 'Brak tagów Open Graph', 'Brak og:title/og:image — gorsze udostępnienia w social media.');
  }

  // ===== LINKI =====
  if (data.internalLinkCount === 0) {
    add('warning', 'links', 'Brak linków wewnętrznych', 'Strona nie linkuje do innych podstron (potencjalna strona osierocona).');
  }

  // ===== WYDAJNOŚĆ =====
  if (response.responseTimeMs > 1500) {
    add('warning', 'performance', 'Wolna odpowiedź serwera', `Czas odpowiedzi ${response.responseTimeMs} ms (TTFB ~${response.ttfb} ms).`);
  } else if (response.responseTimeMs > 600) {
    add('notice', 'performance', 'Umiarkowany czas odpowiedzi', `${response.responseTimeMs} ms.`);
  }
  if (data.htmlSize > 150 * 1024) {
    add('notice', 'performance', 'Duży rozmiar HTML', `${(data.htmlSize / 1024).toFixed(0)} KB — rozważ ograniczenie.`);
  }
  const enc = (headerLower['content-encoding'] || '').toLowerCase();
  if (!/gzip|br|deflate/.test(enc) && data.htmlSize > 10 * 1024) {
    add('warning', 'performance', 'Brak kompresji', 'Odpowiedź nie jest kompresowana (gzip/brotli).');
  }
  const cache = headerLower['cache-control'] || '';
  if (!cache) {
    add('notice', 'performance', 'Brak nagłówka Cache-Control', 'Brak konfiguracji cache dla zasobu.');
  }

  // ===== BEZPIECZEŃSTWO =====
  const isHttps = response.finalUrl.startsWith('https://');
  if (!isHttps) {
    add('error', 'security', 'Brak HTTPS', 'Strona nie używa bezpiecznego protokołu HTTPS.');
  } else {
    // mixed content
    const mixed = (data.images || []).some((i) => i.src.startsWith('http://')) ||
      (data.links || []).some((l) => l.href.startsWith('http://') && l.internal);
    if (mixed) add('warning', 'security', 'Mixed content', 'Strona HTTPS ładuje zasoby przez HTTP.');
  }
  if (isHttps && !headerLower['strict-transport-security']) {
    add('notice', 'security', 'Brak nagłówka HSTS', 'Brak Strict-Transport-Security.');
  }
  if (!headerLower['x-content-type-options']) {
    add('notice', 'security', 'Brak X-Content-Type-Options', 'Zalecane nosniff.');
  }
  if (!headerLower['content-security-policy']) {
    add('notice', 'security', 'Brak Content-Security-Policy', 'Brak nagłówka CSP.');
  }

  // ===== URL =====
  try {
    const u = new URL(response.finalUrl);
    if (u.pathname.length > 115) add('notice', 'url', 'Długi URL', `${u.pathname.length} znaków w ścieżce.`);
    if (/[A-Z]/.test(u.pathname)) add('notice', 'url', 'Wielkie litery w URL', 'URL zawiera wielkie litery.');
    if (u.pathname.includes('_')) add('notice', 'url', 'Podkreślenia w URL', 'Zalecane myślniki (-) zamiast podkreśleń (_).');
    if (u.searchParams.toString().length > 0 && [...u.searchParams].length > 3) {
      add('notice', 'url', 'Wiele parametrów w URL', `${[...u.searchParams].length} parametrów query.`);
    }
  } catch { /* ignore */ }

  // ===== GEO — Generative Engine Optimization (widoczność w silnikach AI) =====
  // Treść o realnej objętości — oceniamy GEO tylko dla stron treściowych.
  if (data.wordCount >= 250 && !noindex) {
    const sem = data.semantic || {};
    const hasSemantic = (sem.article + sem.main + sem.section) > 0;
    if (!hasSemantic) {
      add('notice', 'geo', 'Brak semantycznego HTML (article/main/section)', 'Silniki AI lepiej ekstrahują treść z elementów semantycznych zamiast samych <div>.');
    }
    if (!data.hasAuthor) {
      add('warning', 'geo', 'Brak sygnałów autorstwa (E-E-A-T)', 'Brak autora (meta author / rel=author / JSON-LD author) — AI preferuje treści z jasnym autorstwem.');
    }
    if (!data.hasModifiedDate && !data.hasPublishDate) {
      add('warning', 'geo', 'Brak daty publikacji/aktualizacji', 'Brak datePublished/dateModified — silniki AI faworyzują treści o znanej świeżości.');
    }
    if (data.questionHeadings === 0 && !data.ldFlags?.faqPage) {
      add('notice', 'geo', 'Brak nagłówków w formie pytań / FAQ', 'Nagłówki-pytania i sekcje FAQ ułatwiają cytowanie przez AI (AI Overviews, ChatGPT, Perplexity).');
    }
    if (data.listCount === 0 && data.tableCount === 0) {
      add('notice', 'geo', 'Brak list i tabel', 'Listy i tabele to format łatwo ekstrahowany i cytowany przez silniki generatywne.');
    }
    if (data.longParagraphs >= 3) {
      add('notice', 'geo', 'Długie akapity (trudne do cytowania)', `${data.longParagraphs} akapitów >140 słów — krótsze, zwięzłe odpowiedzi są chętniej cytowane przez AI.`);
    }
    const richTypes = (data.jsonLd || []).flatMap((j) => j.types).join(' ');
    if (!/Article|FAQ|HowTo|Product|Recipe|Event/i.test(richTypes)) {
      add('notice', 'geo', 'Brak treściowego schema (Article/FAQ/HowTo…)', 'Dane strukturalne typu treściowego pomagają AI zrozumieć i zacytować zawartość.');
    }
  }

  // ===== LOCAL / GEO — sygnały lokalne i geograficzne =====
  const ld = data.ldFlags || {};
  // Sygnały sugerujące biznes lokalny (strona kontaktowa / dane firmy)
  const looksLocal = ld.localBusiness || ld.address || data.hasMapEmbed || data.telLinks > 0 ||
    /kontakt|contact|lokalizacj|adres|address|dojazd|gdzie-jeste/i.test(response.finalUrl);

  if (ld.localBusiness && !ld.address) {
    add('warning', 'local', 'LocalBusiness bez adresu', 'Schema LocalBusiness nie zawiera PostalAddress — kluczowe dla lokalnego SEO i Map Google.');
  }
  if (looksLocal) {
    if (!ld.localBusiness && !ld.organization) {
      add('warning', 'local', 'Brak schema Organization/LocalBusiness', 'Strona wygląda na lokalną/kontaktową, ale brak danych strukturalnych firmy (NAP w schema).');
    }
    if (!data.hasPhoneInText && data.telLinks === 0) {
      add('notice', 'local', 'Brak numeru telefonu', 'Brak widocznego telefonu (NAP) — istotne dla lokalnego SEO.');
    }
    if (!data.hasPostalCode && !data.hasStreetMention && !ld.address) {
      add('notice', 'local', 'Brak adresu (NAP)', 'Brak wykrytego adresu pocztowego — uzupełnij spójne dane NAP.');
    }
    if (!data.hasGeoMeta && !ld.localBusiness) {
      add('notice', 'local', 'Brak geo meta / współrzędnych', 'Brak meta geo.region/geo.position/ICBM lub współrzędnych w schema.');
    }
    if (!data.hasMapEmbed && (ld.localBusiness || ld.address)) {
      add('notice', 'local', 'Brak osadzonej mapy', 'Rozważ osadzenie mapy (Google Maps) na stronie kontaktowej/lokalizacji.');
    }
  }

  return issues;
}
