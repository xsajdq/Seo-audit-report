// Buduje WZORZEC treści z konkurencji (TOP SERP lub ręcznych URL-i) i ocenia
// stronę/draft względem niego (metodologia TF-IDF jak Surfer/Clearscope).
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { fetchUrl } from '../crawler/fetcher.js';
import { serperSearch } from './serp.js';
import { tokenize, normalize, deburr, buildTfIdf } from '../knowledge/text.js';

function extractContent(html) {
  const $ = cheerio.load(html);
  const title = $('head > title').first().text().trim();
  const h1 = $('h1').map((_, e) => $(e).text().trim()).get();
  const headings = $('h2, h3').map((_, e) => $(e).text().replace(/\s+/g, ' ').trim()).get().filter((h) => h.length > 3);
  $('script, style, noscript, template, nav, footer, header, form, aside').remove();
  const main = $('main').text() || $('article').text() || $('body').text();
  const bodyText = (main || '').replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const questions = headings.filter((h) => h.includes('?'));
  return { title, h1, headings, bodyText, wordCount, questions };
}

function extractEntities(text) {
  const m = text.match(/\b[A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćńółęąś]+(?:\s+[A-ZŻŹĆĄŚĘŁÓŃ]?[a-zżźćńółęąś]+){1,3}\b/g) || [];
  const f = new Map();
  for (const e of m) { const k = e.toLowerCase().trim(); f.set(k, (f.get(k) || 0) + 1); }
  return f;
}

/**
 * Wzorzec treści z konkurencji.
 * @param {string} keyword
 * @param {object} opts { apiKey, num, competitorUrls }
 */
export async function buildCompetitorProfile(keyword, { apiKey, num = 10, competitorUrls = null } = {}) {
  // 1. Pozyskaj adresy konkurentów
  let urls = [];
  let serpQuestions = [];
  let related = [];
  let serpAvailable = false;
  if (competitorUrls && competitorUrls.length) {
    urls = competitorUrls.map((u) => ({ url: u, title: u }));
  } else {
    const serp = await serperSearch(keyword, { apiKey, num });
    if (!serp.available) return { available: false, error: serp.error, keyword };
    serpAvailable = true;
    urls = serp.urls.slice(0, num);
    serpQuestions = serp.questions;
    related = serp.related;
  }
  if (urls.length === 0) return { available: false, error: 'Brak wyników do analizy.', keyword };

  // 2. Pobierz i wyekstrahuj treść konkurentów
  const limit = pLimit(5);
  const fetched = await Promise.all(urls.map((u) => limit(async () => {
    const res = await fetchUrl(u.url, { timeout: 15000 }).catch(() => null);
    if (!res || !res.ok || !res.body || !(res.contentType || '').includes('html')) return null;
    const c = extractContent(res.body);
    if (c.wordCount < 80) return null;
    return { url: u.url, title: c.title || u.title, ...c };
  })));
  const docs = fetched.filter(Boolean);
  if (docs.length < 2) return { available: false, error: `Za mało konkurentów do analizy (pobrano ${docs.length}). Sprawdź klucz API lub adresy.`, keyword, fetched: docs.length };

  // 3. TF-IDF — terminy charakterystyczne dla TOP wyników
  const tfdocs = docs.map((d) => ({ text: `${d.title} ${d.h1.join(' ')} ${d.headings.join(' ')} ${d.bodyText}` }));
  const { vectors, surface } = buildTfIdf(tfdocs);
  // df w obrębie konkurentów
  const df = new Map();
  const docTokenSets = tfdocs.map((d) => new Set(tokenize(d.text)));
  for (const s of docTokenSets) for (const t of s) df.set(t, (df.get(t) || 0) + 1);
  // średni TF-IDF na termin (waga ważności)
  const tfidfAvg = new Map();
  for (const v of vectors) for (const [t, w] of v) tfidfAvg.set(t, (tfidfAvg.get(t) || 0) + w);
  const minDf = Math.max(2, Math.ceil(docs.length * 0.3));
  const referenceStems = [...df.entries()]
    .filter(([t, c]) => c >= minDf && tokenize(t).length)   // pojawia się u min. 30% konkurentów
    .sort((a, b) => (tfidfAvg.get(b[0]) || 0) - (tfidfAvg.get(a[0]) || 0))
    .slice(0, 40)
    .map(([t]) => t);
  const referenceTerms = referenceStems.map((s) => surface(s));

  // 4. Nagłówki / pytania / encje / docelowa długość
  const headingPool = [];
  const seenH = new Set();
  for (const d of docs) for (const h of [...d.h1, ...d.headings]) {
    const k = normalize(h);
    if (h.length > 6 && !seenH.has(k)) { seenH.add(k); headingPool.push(h); }
  }
  const questions = [...new Set([...serpQuestions, ...docs.flatMap((d) => d.questions)])].slice(0, 15);
  const words = docs.map((d) => d.wordCount).sort((a, b) => a - b);
  const targetWords = words[Math.floor(words.length / 2)]; // mediana
  const entAgg = new Map();
  for (const d of docs) for (const [e, c] of extractEntities(`${d.title}. ${d.bodyText}`)) entAgg.set(e, (entAgg.get(e) || 0) + c);
  const entities = [...entAgg.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([e]) => e);

  return {
    available: true,
    keyword,
    source: serpAvailable ? 'Serper.dev (TOP Google)' : 'Ręczne adresy',
    competitors: docs.map((d) => ({ url: d.url, title: d.title, words: d.wordCount })),
    referenceStems,
    referenceTerms,
    headingSuggestions: headingPool.slice(0, 15),
    questions,
    entities,
    targetWords,
    related,
  };
}

// Ocena treści względem wzorca konkurencji.
export function scoreAgainstProfile(text, profile) {
  const normText = normalize(text);
  const termSet = new Set(tokenize(text));
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const has = (s) => normText.includes(deburr(String(s).toLowerCase()));

  const covered = profile.referenceStems.filter((s) => termSet.has(s));
  const missingTerms = profile.referenceStems
    .map((s, i) => ({ s, term: profile.referenceTerms[i] }))
    .filter((x) => !termSet.has(x.s))
    .map((x) => x.term);
  const missingEntities = (profile.entities || []).filter((e) => !has(e)).slice(0, 20);
  const missingQuestions = (profile.questions || []).filter((q) => !has(normalize(q).slice(0, 22))).slice(0, 12);

  const termCov = profile.referenceStems.length ? covered.length / profile.referenceStems.length : 0;
  const lenRatio = profile.targetWords ? Math.min(1.2, wordCount / profile.targetWords) : 1;
  const score = Math.round((termCov * 0.7 + Math.min(1, lenRatio) * 0.3) * 100);

  return {
    grade: grade(score),
    score,
    wordCount,
    targetWords: profile.targetWords,
    coverage: { terms: Math.round(termCov * 100), length: Math.round(Math.min(1, lenRatio) * 100) },
    coveredTerms: covered.length,
    expectedTerms: profile.referenceStems.length,
    missingTerms,
    missingEntities,
    missingQuestions,
  };
}

function grade(s) { return s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 65 ? 'C' : s >= 50 ? 'D' : 'F'; }

// Pobiera i ekstrahuje treść jednej strony (cel analizy).
export async function fetchPageText(url) {
  const res = await fetchUrl(url, { timeout: 20000 });
  if (!res.ok || !res.body || !(res.contentType || '').includes('html')) return null;
  const c = extractContent(res.body);
  return { url: res.finalUrl, ...c };
}
