// Ekstrakcja wszystkich istotnych SEO-elementów z HTML do struktury danych.
import * as cheerio from 'cheerio';

export function extractPageData(html, baseUrl) {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;

  const getMeta = (name) =>
    $(`meta[name="${name}" i]`).attr('content')?.trim() ||
    $(`meta[property="${name}" i]`).attr('content')?.trim() ||
    null;

  // --- Tytuł i opis ---
  const title = $('head > title').first().text().trim() || null;
  const titleCount = $('head > title').length;
  const metaDescription = getMeta('description');

  // --- Robots ---
  const metaRobots = getMeta('robots');
  const googlebot = getMeta('googlebot');

  // --- Canonical ---
  const canonical = $('link[rel="canonical" i]').attr('href')?.trim() || null;
  const canonicalCount = $('link[rel="canonical" i]').length;

  // --- Nagłówki ---
  const headings = {};
  for (let i = 1; i <= 6; i++) {
    headings[`h${i}`] = $(`h${i}`)
      .map((_, el) => $(el).text().replace(/\s+/g, ' ').trim())
      .get()
      .filter(Boolean);
  }

  // --- Język / charset / viewport ---
  const htmlLang = $('html').attr('lang') || null;
  const charset =
    $('meta[charset]').attr('charset') ||
    ($('meta[http-equiv="content-type" i]').attr('content')?.match(/charset=([^;]+)/i)?.[1] ?? null);
  const viewport = getMeta('viewport');

  // --- Open Graph / Twitter ---
  const og = {};
  $('meta[property^="og:" i]').each((_, el) => {
    const p = $(el).attr('property')?.toLowerCase();
    if (p) og[p] = $(el).attr('content')?.trim();
  });
  const twitter = {};
  $('meta[name^="twitter:" i]').each((_, el) => {
    const n = $(el).attr('name')?.toLowerCase();
    if (n) twitter[n] = $(el).attr('content')?.trim();
  });

  // --- Hreflang ---
  const hreflang = $('link[rel="alternate" i][hreflang]')
    .map((_, el) => ({ lang: $(el).attr('hreflang'), href: $(el).attr('href') }))
    .get();

  // --- Dane strukturalne (JSON-LD) ---
  const jsonLd = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const types = [];
      const collectTypes = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) return obj.forEach(collectTypes);
        if (obj['@type']) types.push(...[].concat(obj['@type']));
        if (obj['@graph']) collectTypes(obj['@graph']);
      };
      collectTypes(parsed);
      jsonLd.push({ valid: true, types });
    } catch {
      jsonLd.push({ valid: false, types: [] });
    }
  });
  const microdata = $('[itemscope]').length;
  const rdfa = $('[typeof]').length;

  // --- Obrazy ---
  const images = $('img')
    .map((_, el) => ({
      src: $(el).attr('src') || $(el).attr('data-src') || '',
      alt: $(el).attr('alt'),
      width: $(el).attr('width'),
      height: $(el).attr('height'),
      loading: $(el).attr('loading'),
    }))
    .get();
  const imagesMissingAlt = images.filter((i) => i.alt === undefined || i.alt === null).length;
  const imagesEmptyAlt = images.filter((i) => i.alt !== undefined && i.alt.trim() === '').length;

  // --- Linki ---
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let abs;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      return;
    }
    const rel = ($(el).attr('rel') || '').toLowerCase();
    const isInternal = new URL(abs).origin === origin;
    links.push({
      href: abs,
      text: $(el).text().replace(/\s+/g, ' ').trim(),
      rel,
      nofollow: rel.includes('nofollow'),
      internal: isInternal,
    });
  });
  const internalLinks = links.filter((l) => l.internal);
  const externalLinks = links.filter((l) => !l.internal);

  // --- Paginacja ---
  const relNext = $('link[rel="next" i]').attr('href') || null;
  const relPrev = $('link[rel="prev" i]').attr('href') || null;

  // --- Favicon / manifest / AMP ---
  const favicon = $('link[rel*="icon" i]').attr('href') || null;
  const manifest = $('link[rel="manifest" i]').attr('href') || null;
  const ampHref = $('link[rel="amphtml" i]').attr('href') || null;

  // --- Treść / tekst ---
  $('script, style, noscript, template').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const textRatio = html.length > 0 ? bodyText.length / html.length : 0;

  return {
    title,
    titleLength: title ? title.length : 0,
    titleCount,
    metaDescription,
    metaDescriptionLength: metaDescription ? metaDescription.length : 0,
    metaRobots,
    googlebot,
    canonical,
    canonicalCount,
    headings,
    h1Count: headings.h1.length,
    htmlLang,
    charset,
    viewport,
    og,
    twitter,
    hreflang,
    jsonLd,
    microdata,
    rdfa,
    images,
    imageCount: images.length,
    imagesMissingAlt,
    imagesEmptyAlt,
    links,
    internalLinks,
    externalLinks,
    internalLinkCount: internalLinks.length,
    externalLinkCount: externalLinks.length,
    relNext,
    relPrev,
    favicon,
    manifest,
    ampHref,
    wordCount,
    textRatio,
    htmlSize: html.length,
  };
}
