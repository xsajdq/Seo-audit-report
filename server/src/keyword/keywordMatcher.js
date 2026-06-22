// Dopasowanie listy słów kluczowych do najtrafniejszych podstron + sugestie meta
// title/description oraz propozycje nowych stron dla fraz bez dobrej strony docelowej.
//
// Schemat meta title: "główne słowo kluczowe - dodatkowe frazy | brand".

const PL_STOPWORDS = new Set([
  'i', 'oraz', 'w', 'we', 'na', 'do', 'z', 'ze', 'a', 'o', 'u', 'od', 'po', 'za', 'dla', 'pod', 'nad',
  'the', 'and', 'or', 'of', 'to', 'in', 'for', 'a', 'an', 'jak', 'co', 'czy', 'że', 'to', 'jest', 'są',
  'oraz', 'lub', 'albo', 'ale', 'bez', 'przy', 'przez', 'jako', 'aby', 'więc', 'gdzie', 'kiedy',
]);

const FIELD_WEIGHTS = { url: 4, title: 5, h1: 4, headings: 2, description: 3, body: 1 };
const MAX_WEIGHT = 5;

// Usuwa polskie znaki diakrytyczne dla odpornego dopasowania.
function deburr(s) {
  return s
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ż/g, 'z').replace(/ź/g, 'z');
}

function normalize(text) {
  return deburr(String(text || '').toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Lekki stemmer dla polskiego: ucina najczęstsze końcówki fleksyjne, by dopasować
// różne formy gramatyczne (plecaki→plecak, turystyczne→turystyczn, męskich→mesk).
// Przybliżony, ale znacząco poprawia trafność (recall) dopasowania.
const PL_SUFFIXES = [
  'ialbo', 'owieni', 'owych', 'owymi', 'iejszy', 'iejsza',
  'ami', 'ach', 'om', 'owi', 'ego', 'emu', 'iego', 'iemu', 'owie', 'ych', 'ymi', 'imi',
  'owy', 'owa', 'owe', 'ego', 'iej', 'ej', 'im', 'ym', 'em', 'mi', 'ią', 'ie',
  'a', 'e', 'i', 'y', 'o', 'u', 'ą', 'ę',
];
function stem(token) {
  if (token.length <= 4 || /\d/.test(token)) return token;
  for (const suf of PL_SUFFIXES) {
    const d = deburr(suf);
    if (token.endsWith(d) && token.length - d.length >= 3) {
      return token.slice(0, token.length - d.length);
    }
  }
  return token;
}

function tokenize(text, { keepStop = false } = {}) {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 1 && (keepStop || !PL_STOPWORDS.has(t)))
    .map(stem);
}

// Znormalizowana + stemowana reprezentacja tekstu do dopasowania całych fraz.
function stemmedPhrase(text) {
  return tokenize(text).join(' ');
}

// Profil strony: dla każdego tokenu zapamiętujemy maksymalną wagę pola, w którym wystąpił,
// oraz znormalizowane teksty pól do dopasowania całych fraz.
function buildProfile(page) {
  const s = page.seo || {};
  let slug = '';
  try { slug = new URL(page.url).pathname.replace(/[-_/]/g, ' '); } catch { /* noop */ }

  const fields = {
    url: slug,
    title: s.title || '',
    h1: (s.h1 || []).join(' '),
    headings: [(s.h2 || []).join(' '), s.headingsText || ''].join(' '),
    description: s.metaDescription || '',
    body: s.bodySample || '',
  };

  const tokenWeight = new Map();
  const fieldNorm = {};
  for (const [field, text] of Object.entries(fields)) {
    fieldNorm[field] = stemmedPhrase(text);
    const w = FIELD_WEIGHTS[field];
    for (const tok of tokenize(text)) {
      if ((tokenWeight.get(tok) || 0) < w) tokenWeight.set(tok, w);
    }
  }
  return { page, tokenWeight, fieldNorm };
}

// Wynik dopasowania frazy do strony (0-100) + składowe wyjaśniające.
function scoreKeyword(keyword, profile) {
  const phrase = stemmedPhrase(keyword);
  const tokens = tokenize(keyword);
  if (tokens.length === 0) return { score: 0 };

  let score = 0;
  const reasons = [];

  // Dopasowanie całej frazy w polach (mocny sygnał)
  const phraseBonus = { title: 50, h1: 35, url: 30, headings: 20, description: 16, body: 14 };
  for (const [field, bonus] of Object.entries(phraseBonus)) {
    if (phrase && profile.fieldNorm[field] && profile.fieldNorm[field].includes(phrase)) {
      score += bonus;
      reasons.push(`fraza w: ${field}`);
      break; // licz najmocniejsze pole raz
    }
  }

  // Pokrycie tokenów (jak duża część słów frazy występuje na stronie)
  let covered = 0;
  let weightSum = 0;
  for (const tok of tokens) {
    const w = profile.tokenWeight.get(tok) || 0;
    if (w > 0) {
      covered++;
      weightSum += w;
    }
  }
  const coverage = covered / tokens.length;
  const coverageScore = coverage * (weightSum / (tokens.length * MAX_WEIGHT)) * 45;
  score += coverageScore;
  if (covered > 0) reasons.push(`pokrycie ${Math.round(coverage * 100)}%`);

  return { score: Math.min(100, Math.round(score)), coverage, reasons };
}

function confidenceLabel(score) {
  if (score >= 60) return 'silne';
  if (score >= 40) return 'średnie';
  if (score >= 25) return 'słabe';
  return 'brak';
}

const ASSIGN_THRESHOLD = 25;

// --- Klasyfikacja intencji frazy: transakcyjna / informacyjna / nawigacyjna / ogólna + flaga lokalna ---
const TRANSACTIONAL = /\b(kup|kupic|kupno|kupie|cena|cennik|cenowy|sprzedaz|sprzedam|sprzedazy|wynajem|wynajac|wynajme|najem|tanio|tani|tania|promocja|rabat|sklep|oferta|oferty|zamow|zamowic|koszt|kosztuje|buy|price|sale|rent|cheap|order|deal)\b/;
const INFORMATIONAL = /\b(jak|co|czy|dlaczego|ile|kiedy|gdzie|czym|jaki|jaka|jakie|jakich|poradnik|porady|krok|przewodnik|instrukcja|definicja|znaczenie|vs|kontra|przyklady|how|what|why|when|guide|tutorial)\b/;
// Małe wsparcie wykrywania fraz lokalnych (najważniejsze miasta PL + wskazówki lokalizacyjne)
const PL_CITIES = /\b(warszawa|krakow|lodz|wroclaw|poznan|gdansk|szczecin|bydgoszcz|lublin|katowice|bialystok|gdynia|czestochowa|radom|sosnowiec|torun|kielce|rzeszow|gliwice|zabrze|olsztyn|bielsko|bytom|zakopane|sopot|gniezno)\b/;
const LOCAL_CUES = /\b(blisko|okolica|okolicy|dzielnica|dzielnicy|osiedle|osiedlu|ulica|ulicy|centrum|wojewodztwo|powiat|gmina|near|local)\b/;

function classifyIntent(keywordRaw, brand) {
  const norm = normalize(keywordRaw);
  const brandNorm = brand ? normalize(brand) : '';
  let intent = 'ogólna';
  // słowa-pytania/poradnikowe mają priorytet nad komercyjnymi (np. "jak kupić" = informacyjna)
  if (brandNorm && norm.includes(brandNorm)) intent = 'nawigacyjna';
  else if (INFORMATIONAL.test(norm)) intent = 'informacyjna';
  else if (TRANSACTIONAL.test(norm)) intent = 'transakcyjna';

  // Lokalna: miasto z listy, wskazówki lokalizacyjne, lub słowo zaczynające się wielką literą
  // w oryginale (nie na początku frazy) — typowa nazwa własna miejsca.
  const capPlace = /\s[A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćńółęąś]+/.test(keywordRaw.trim());
  const local = PL_CITIES.test(norm) || LOCAL_CUES.test(norm) || capPlace;
  return { intent, local };
}

export function matchKeywords(pages, keywords, { brand = '' } = {}) {
  const cleanKeywords = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  const indexable = pages.filter(
    (p) => p.seo && p.status >= 200 && p.status < 300
  );
  const profiles = indexable.map(buildProfile);

  const perPage = new Map(); // url -> { page, keywords: [{keyword, score, confidence}] }
  const unmatched = [];
  const intents = { transakcyjna: 0, informacyjna: 0, nawigacyjna: 0, 'ogólna': 0, lokalna: 0 };

  for (const kw of cleanKeywords) {
    const { intent, local } = classifyIntent(kw, brand);
    intents[intent] = (intents[intent] || 0) + 1;
    if (local) intents.lokalna++;

    let best = null;
    for (const prof of profiles) {
      const res = scoreKeyword(kw, prof);
      if (!best || res.score > best.score) best = { ...res, page: prof.page };
    }
    if (best && best.score >= ASSIGN_THRESHOLD) {
      const url = best.page.url;
      if (!perPage.has(url)) perPage.set(url, { page: best.page, keywords: [] });
      perPage.get(url).keywords.push({
        keyword: kw,
        score: best.score,
        confidence: confidenceLabel(best.score),
        intent,
        local,
        reasons: best.reasons,
      });
    } else {
      unmatched.push({
        keyword: kw,
        intent,
        local,
        bestScore: best ? best.score : 0,
        bestPage: best ? best.page.url : null,
      });
    }
  }

  // Buduj przypisania per strona z sugestiami meta
  const assignments = [...perPage.values()].map(({ page, keywords: kws }) => {
    const sorted = [...kws].sort((a, b) => b.score - a.score);
    const primary = sorted[0].keyword;
    const additional = sorted.slice(1).map((k) => k.keyword);
    return {
      url: page.url,
      currentTitle: page.seo.title || null,
      currentTitleLength: page.seo.titleLength || 0,
      currentDescription: page.seo.metaDescription || null,
      primary,
      additional,
      keywords: sorted,
      suggestedTitle: buildTitle(primary, additional, brand),
      suggestedDescription: buildDescription(primary, additional, brand),
    };
  }).sort((a, b) => b.keywords.length - a.keywords.length);

  // Propozycje nowych stron dla fraz bez dobrej strony — klastrowanie po wspólnych tokenach
  const newPages = clusterUnmatched(unmatched, brand);

  return {
    brand,
    summary: {
      keywords: cleanKeywords.length,
      matched: cleanKeywords.length - unmatched.length,
      unmatched: unmatched.length,
      pagesTargeted: assignments.length,
      newPagesSuggested: newPages.length,
      intents,
    },
    assignments,
    unmatched,
    newPages,
  };
}

// --- Klastrowanie fraz bez strony w propozycje nowych podstron ---
function clusterUnmatched(unmatched, brand) {
  const items = unmatched.map((u) => ({ keyword: u.keyword, tokens: new Set(tokenize(u.keyword)) }));
  const clusters = [];
  const used = new Array(items.length).fill(false);

  for (let i = 0; i < items.length; i++) {
    if (used[i]) continue;
    const cluster = [items[i].keyword];
    used[i] = true;
    for (let j = i + 1; j < items.length; j++) {
      if (used[j]) continue;
      const overlap = [...items[i].tokens].filter((t) => items[j].tokens.has(t)).length;
      const minSize = Math.min(items[i].tokens.size, items[j].tokens.size) || 1;
      if (overlap / minSize >= 0.5) {
        cluster.push(items[j].keyword);
        used[j] = true;
      }
    }
    clusters.push(cluster);
  }

  return clusters.map((kws) => {
    // główne słowo = najkrótsze (najbardziej generyczne/”head”), reszta jako dodatkowe
    const sorted = [...kws].sort((a, b) => tokenize(a).length - tokenize(b).length || a.length - b.length);
    const primary = sorted[0];
    const additional = sorted.slice(1);
    return {
      primary,
      additional,
      keywords: kws,
      suggestedSlug: '/' + normalize(primary).replace(/\s+/g, '-'),
      suggestedTitle: buildTitle(primary, additional, brand),
      suggestedDescription: buildDescription(primary, additional, brand),
    };
  });
}

// --- Generowanie meta title wg schematu: "główne - dodatkowe | brand" (≤ ~60 zn.) ---
function buildTitle(primary, additional, brand) {
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const head = cap(primary);
  const brandPart = brand ? ` | ${brand}` : '';
  const budget = 60;

  // dokładaj dodatkowe frazy póki mieści się w limicie
  let extras = [];
  for (const a of additional) {
    const candidate = `${head} - ${[...extras, a].join(', ')}${brandPart}`;
    if (candidate.length <= budget) extras.push(a);
    else break;
  }
  let title = extras.length ? `${head} - ${extras.join(', ')}${brandPart}` : `${head}${brandPart}`;
  if (title.length > budget && brand) title = `${head} | ${brand}`; // awaryjnie bez dodatków
  if (title.length > budget) title = head.slice(0, budget);
  return title;
}

// --- Generowanie meta description (≤ ~158 zn.) ---
function buildDescription(primary, additional, brand) {
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const budget = 158;
  const extras = additional.slice(0, 3).join(', ');
  const brandTail = brand ? ` Sprawdź ofertę ${brand}.` : ' Sprawdź szczegóły.';
  let desc = extras
    ? `${cap(primary)} — ${extras}.${brandTail}`
    : `${cap(primary)}.${brandTail}`;
  if (desc.length > budget) {
    // skróć część dodatkową
    desc = `${cap(primary)}.${brandTail}`;
  }
  if (desc.length > budget) desc = desc.slice(0, budget - 1) + '…';
  return desc;
}
