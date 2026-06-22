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
  const ldFlags = {
    author: false, datePublished: false, dateModified: false,
    organization: false, localBusiness: false, faqPage: false,
    breadcrumb: false, address: false, telephone: false, sameAs: [],
  };
  const LOCAL_TYPES = /LocalBusiness|Restaurant|Store|Dentist|Physician|Hotel|ProfessionalService|Plumber|AutoRepair|RealEstateAgent/i;
  const ldEntities = []; // spłaszczone węzły {type, props} do walidacji pól
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed = JSON.parse(raw);
      const types = [];
      const collectTypes = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        if (Array.isArray(obj)) return obj.forEach(collectTypes);
        if (obj['@type']) {
          const t = [].concat(obj['@type']);
          types.push(...t);
          const ts = t.join(' ');
          if (/Organization/i.test(ts)) ldFlags.organization = true;
          if (LOCAL_TYPES.test(ts)) ldFlags.localBusiness = true;
          if (/FAQPage/i.test(ts)) ldFlags.faqPage = true;
          if (/BreadcrumbList/i.test(ts)) ldFlags.breadcrumb = true;
          ldEntities.push({ types: t, props: Object.keys(obj), obj });
        }
        if (obj.author) ldFlags.author = true;
        if (obj.datePublished) ldFlags.datePublished = true;
        if (obj.dateModified) ldFlags.dateModified = true;
        if (obj.address) ldFlags.address = true;
        if (obj.telephone) ldFlags.telephone = true;
        if (obj.sameAs) ldFlags.sameAs.push(...[].concat(obj.sameAs));
        if (obj['@graph']) collectTypes(obj['@graph']);
        for (const k in obj) {
          if (k !== '@graph' && obj[k] && typeof obj[k] === 'object') collectTypes(obj[k]);
        }
      };
      collectTypes(parsed);
      jsonLd.push({ valid: true, types });
    } catch {
      jsonLd.push({ valid: false, types: [] });
    }
  });
  const schemaIssues = validateSchemaEntities(ldEntities);
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

  // --- GEO (Generative Engine Optimization) / struktura dla AI ---
  const semantic = {
    article: $('article').length,
    section: $('section').length,
    main: $('main').length,
    nav: $('nav').length,
    header: $('header').length,
    footer: $('footer').length,
    aside: $('aside').length,
  };
  const listCount = $('ul, ol').length;
  const tableCount = $('table').length;
  const paragraphLengths = $('p').map((_, el) => $(el).text().trim().length).get();
  const longParagraphs = paragraphLengths.filter((n) => n > 900).length; // ~140 słów
  const allHeadingTexts = [...headings.h2, ...headings.h3, ...headings.h4];
  const questionHeadings = allHeadingTexts.filter((t) => /\?\s*$/.test(t)).length;

  // E-E-A-T / autorstwo i świeżość
  const metaAuthor = getMeta('author');
  const relAuthor = $('[rel="author" i]').first().text().trim() || null;
  const articlePublished = getMeta('article:published_time');
  const articleModified = getMeta('article:modified_time');
  const hasAuthor = !!(metaAuthor || relAuthor || ldFlags.author);
  const hasPublishDate = !!(articlePublished || ldFlags.datePublished);
  const hasModifiedDate = !!(articleModified || ldFlags.dateModified);

  // --- Local / Geo SEO ---
  const geoRegion = getMeta('geo.region');
  const geoPlacename = getMeta('geo.placename');
  const geoPosition = getMeta('geo.position');
  const icbm = getMeta('icbm');
  const hasGeoMeta = !!(geoRegion || geoPlacename || geoPosition || icbm);
  const telLinks = $('a[href^="tel:"]').length;
  const hasMapEmbed = $('iframe[src*="google.com/maps" i], iframe[src*="maps.google" i], iframe[src*="openstreetmap" i]').length > 0;

  // --- Treść / tekst ---
  $('script, style, noscript, template').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  // Wzorce adresu (PL: kod 00-000, oraz ogólne wzmianki o ulicy)
  const hasPostalCode = /\b\d{2}-\d{3}\b/.test(bodyText) || /\b\d{5}\b/.test(bodyText);
  const hasStreetMention = /\b(ul\.|ulica|al\.|aleja|plac|street|st\.|ave\.?|avenue)\b/i.test(bodyText);
  const hasPhoneInText = telLinks > 0 || /(\+?\d[\d\s().-]{7,}\d)/.test(bodyText);
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const textRatio = html.length > 0 ? bodyText.length / html.length : 0;
  // Próbka treści do dopasowania słów kluczowych (ograniczona, by nie rozdmuchać payloadu).
  const headingsText = [...headings.h1, ...headings.h2, ...headings.h3].join(' . ');
  const bodySample = bodyText.slice(0, 1500);

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
    headingsText,
    bodySample,
    // GEO / AI
    ldFlags,
    schemaIssues,
    semantic,
    listCount,
    tableCount,
    longParagraphs,
    paragraphCount: paragraphLengths.length,
    questionHeadings,
    hasAuthor,
    hasPublishDate,
    hasModifiedDate,
    // Local / Geo
    hasGeoMeta,
    geoMeta: { geoRegion, geoPlacename, geoPosition, icbm },
    telLinks,
    hasMapEmbed,
    hasPostalCode,
    hasStreetMention,
    hasPhoneInText,
  };
}

// Walidacja danych strukturalnych wg typu — wymagane (required) i zalecane (recommended)
// właściwości najważniejszych typów Schema.org (m.in. dla nieruchomości).
const SCHEMA_RULES = {
  Organization: { required: ['name', 'url'], recommended: ['logo', 'sameAs'] },
  LocalBusiness: { required: ['name', 'address'], recommended: ['telephone', 'openingHours', 'image', 'geo', 'priceRange', 'url'] },
  RealEstateAgent: { required: ['name', 'address'], recommended: ['telephone', 'openingHours', 'image', 'geo', 'areaServed', 'url'] },
  PostalAddress: { required: ['streetAddress', 'addressLocality'], recommended: ['postalCode', 'addressCountry'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },
  Article: { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'dateModified', 'publisher'] },
  BlogPosting: { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'dateModified', 'publisher'] },
  NewsArticle: { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'dateModified', 'publisher'] },
  Product: { required: ['name'], recommended: ['image', 'offers', 'description', 'brand'] },
  Offer: { required: ['price', 'priceCurrency'], recommended: ['availability'] },
  Review: { required: ['author', 'reviewRating'], recommended: ['itemReviewed'] },
  AggregateRating: { required: ['ratingValue'], recommended: ['reviewCount', 'ratingCount'] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
  Event: { required: ['name', 'startDate'], recommended: ['location', 'endDate'] },
  Person: { required: ['name'], recommended: ['jobTitle', 'image'] },
};

function validateSchemaEntities(entities) {
  const issues = [];
  for (const ent of entities) {
    for (const type of ent.types) {
      const rule = SCHEMA_RULES[type];
      if (!rule) continue;
      const present = new Set(ent.props);
      const missingReq = rule.required.filter((p) => !present.has(p));
      const missingRec = rule.recommended.filter((p) => !present.has(p));
      if (missingReq.length) {
        issues.push({ type, severity: 'error', missing: missingReq, kind: 'required' });
      }
      if (missingRec.length) {
        issues.push({ type, severity: 'notice', missing: missingRec, kind: 'recommended' });
      }
    }
  }
  return issues;
}
