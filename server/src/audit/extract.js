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
          if (LOCAL_TYPES.test(ts) || t.some((x) => LB_SUBTYPES.has(x))) ldFlags.localBusiness = true;
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

// Walidacja danych strukturalnych wg typu Schema.org — wymagane (required) i zalecane
// (recommended) właściwości dla wielu branż (e-commerce, treści, usługi lokalne,
// praca, eventy, kursy, oprogramowanie, media itd.).
const LB = { required: ['name', 'address'], recommended: ['telephone', 'openingHoursSpecification', 'geo', 'image', 'priceRange', 'url'] };
const ARTICLE = { required: ['headline', 'author', 'datePublished'], recommended: ['image', 'dateModified', 'publisher'] };

const SCHEMA_RULES = {
  // Organizacje / encje
  Organization: { required: ['name', 'url'], recommended: ['logo', 'sameAs', 'contactPoint'] },
  Corporation: { required: ['name', 'url'], recommended: ['logo', 'sameAs'] },
  NGO: { required: ['name', 'url'], recommended: ['logo', 'sameAs'] },
  Person: { required: ['name'], recommended: ['jobTitle', 'image', 'sameAs', 'url'] },
  WebSite: { required: ['name', 'url'], recommended: ['potentialAction'] },
  WebPage: { required: ['name'], recommended: ['description'] },
  BreadcrumbList: { required: ['itemListElement'], recommended: [] },

  // Local business (bazowa + podtypy dziedziczą przez LB_SUBTYPES)
  LocalBusiness: LB,
  Service: { required: ['name'], recommended: ['provider', 'areaServed', 'description'] },

  // Adres / kontakt / godziny / geo
  PostalAddress: { required: ['streetAddress', 'addressLocality'], recommended: ['postalCode', 'addressCountry', 'addressRegion'] },
  ContactPoint: { required: ['telephone'], recommended: ['contactType', 'areaServed', 'availableLanguage'] },
  OpeningHoursSpecification: { required: ['dayOfWeek', 'opens', 'closes'], recommended: [] },
  GeoCoordinates: { required: ['latitude', 'longitude'], recommended: [] },

  // Treści / publishing
  Article: ARTICLE, BlogPosting: ARTICLE, NewsArticle: ARTICLE, TechArticle: ARTICLE,
  Recipe: { required: ['name', 'image', 'recipeIngredient', 'recipeInstructions'], recommended: ['author', 'datePublished', 'nutrition', 'aggregateRating', 'prepTime', 'cookTime'] },
  HowTo: { required: ['name', 'step'], recommended: ['image', 'totalTime', 'tool', 'supply'] },
  FAQPage: { required: ['mainEntity'], recommended: [] },
  QAPage: { required: ['mainEntity'], recommended: [] },
  Question: { required: ['name', 'acceptedAnswer'], recommended: ['answerCount'] },
  Course: { required: ['name', 'description'], recommended: ['provider', 'hasCourseInstance'] },
  Book: { required: ['name', 'author'], recommended: ['isbn', 'publisher'] },
  PodcastEpisode: { required: ['name', 'url'], recommended: ['datePublished', 'associatedMedia'] },

  // Media
  VideoObject: { required: ['name', 'thumbnailUrl', 'uploadDate'], recommended: ['description', 'duration', 'contentUrl', 'embedUrl'] },
  ImageObject: { required: ['contentUrl'], recommended: ['license', 'creator', 'creditText'] },

  // E-commerce
  Product: { required: ['name'], recommended: ['image', 'offers', 'description', 'brand', 'sku', 'aggregateRating', 'review'] },
  Offer: { required: ['price', 'priceCurrency'], recommended: ['availability', 'url', 'priceValidUntil', 'itemCondition'] },
  AggregateOffer: { required: ['lowPrice', 'priceCurrency'], recommended: ['highPrice', 'offerCount'] },
  Review: { required: ['author', 'reviewRating'], recommended: ['itemReviewed', 'datePublished'] },
  AggregateRating: { required: ['ratingValue'], recommended: ['reviewCount', 'ratingCount', 'bestRating'] },
  Brand: { required: ['name'], recommended: ['logo'] },

  // Eventy / praca / software
  Event: { required: ['name', 'startDate'], recommended: ['location', 'endDate', 'offers', 'image', 'eventStatus', 'description'] },
  JobPosting: { required: ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'], recommended: ['baseSalary', 'employmentType', 'validThrough'] },
  SoftwareApplication: { required: ['name'], recommended: ['offers', 'aggregateRating', 'operatingSystem', 'applicationCategory'] },

  // Medyczne (organizacje traktowane jak LocalBusiness przez podtypy)
  MedicalOrganization: LB,
};

// Podtypy LocalBusiness — walidowane wg reguły bazowej LocalBusiness (jeśli brak własnej).
const LB_SUBTYPES = new Set([
  'RealEstateAgent', 'Restaurant', 'Store', 'GroceryStore', 'ClothingStore', 'ElectronicsStore',
  'Dentist', 'Physician', 'MedicalClinic', 'Hospital', 'Pharmacy', 'VeterinaryCare',
  'Hotel', 'LodgingBusiness', 'BedAndBreakfast', 'Resort', 'Motel',
  'ProfessionalService', 'LegalService', 'Attorney', 'Notary', 'AccountingService', 'InsuranceAgency',
  'Plumber', 'Electrician', 'HVACBusiness', 'RoofingContractor', 'GeneralContractor', 'HomeAndConstructionBusiness', 'MovingCompany',
  'AutoRepair', 'AutoDealer', 'AutoBodyShop', 'GasStation', 'CarWash',
  'BeautySalon', 'HairSalon', 'NailSalon', 'DaySpa', 'HealthAndBeautyBusiness',
  'BankOrCreditUnion', 'FinancialService', 'TravelAgency', 'FoodEstablishment', 'CafeOrCoffeeShop', 'Bakery', 'BarOrPub',
  'EntertainmentBusiness', 'SportsActivityLocation', 'GymOrFitnessCenter', 'ChildCare', 'School', 'EducationalOrganization',
  'GovernmentOffice', 'TouristAttraction', 'NightClub', 'Library', 'EmploymentAgency', 'DryCleaningOrLaundry',
]);

function ruleFor(type) {
  if (SCHEMA_RULES[type]) return SCHEMA_RULES[type];
  if (LB_SUBTYPES.has(type)) return LB;
  return null;
}

function validateSchemaEntities(entities) {
  const issues = [];
  for (const ent of entities) {
    for (const type of ent.types) {
      const rule = ruleFor(type);
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
