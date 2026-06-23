// Głęboka analiza pojedynczej strony (wpis blogowy / usługa): pobiera świeżą treść,
// wyznacza jej profil (encje, frazy, podtematy, pytania) i porównuje z oczekiwanym
// profilem tematu (klaster + opcjonalnie darmowe API), wskazując czego brakuje.
import * as cheerio from 'cheerio';
import { fetchUrl } from '../crawler/fetcher.js';
import { buildKnowledgeGraph } from './topicGraph.js';
import { tokenize, normalize, deburr } from './text.js';
import { enrichEntities } from './entityApi.js';

function normUrl(u) {
  try {
    const url = new URL(u); url.hash = '';
    let s = url.href; if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1);
    return s.toLowerCase();
  } catch { return String(u).toLowerCase(); }
}

const STOP = new Set(['i', 'oraz', 'w', 'we', 'na', 'do', 'z', 'ze', 'o', 'od', 'po', 'za', 'dla', 'pod', 'nad', 'the', 'and', 'or', 'of', 'to', 'in', 'for', 'jak', 'co', 'czy', 'jest', 'sa', 'lub', 'ale', 'sie', 'tym', 'ten', 'ta', 'te', 'aby', 'oraz', 'jego', 'jej', 'tak', 'tu', 'by']);

function extractEntities(text) {
  const m = text.match(/\b[A-ZŻŹĆĄŚĘŁÓŃ][a-zżźćńółęąś]+(?:\s+[A-ZŻŹĆĄŚĘŁÓŃ]?[a-zżźćńółęąś]+){0,3}\b/g) || [];
  const freq = new Map();
  for (const e of m) {
    const clean = e.trim();
    if (clean.split(' ').length < 2) continue; // tylko wielowyrazowe = mocniejsze encje
    const key = clean.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  return freq;
}

function extractKeyphrases(text) {
  const toks = normalize(text).split(' ').filter((t) => t.length > 2 && !STOP.has(t));
  const freq = new Map();
  for (let i = 0; i < toks.length - 1; i++) {
    const bi = toks[i] + ' ' + toks[i + 1];
    freq.set(bi, (freq.get(bi) || 0) + 1);
    if (i < toks.length - 2) {
      const tri = bi + ' ' + toks[i + 2];
      freq.set(tri, (freq.get(tri) || 0) + 1);
    }
  }
  return freq;
}

function extractQuestions(headingTexts) {
  return headingTexts.filter((h) => h.includes('?')).map((h) => h.trim());
}

function profileFromHtml(html, url) {
  const $ = cheerio.load(html);
  const title = $('head > title').first().text().trim();
  const h1 = $('h1').map((_, el) => $(el).text().trim()).get();
  const headingTexts = $('h2, h3, h4').map((_, el) => $(el).text().replace(/\s+/g, ' ').trim()).get();
  $('script, style, noscript, template, nav, footer, header').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  return {
    url, title, h1, headingTexts,
    bodyText,
    normText: normalize(bodyText),
    wordCount: bodyText ? bodyText.split(/\s+/).length : 0,
    termSet: new Set(tokenize(`${title} ${h1.join(' ')} ${headingTexts.join(' ')} ${bodyText}`)),
    entities: extractEntities(`${title}. ${h1.join('. ')}. ${bodyText}`),
    keyphrases: extractKeyphrases(`${title} ${h1.join(' ')} ${headingTexts.join(' ')} ${bodyText}`),
    questions: extractQuestions(headingTexts),
  };
}

export async function analyzePage(targetUrl, result, { useApi = false } = {}) {
  const res = await fetchUrl(targetUrl, { timeout: 20000 });
  if (!res.ok || !res.body || !(res.contentType || '').includes('html')) {
    return { error: `Nie udało się pobrać treści strony (status ${res.status}).` };
  }
  const own = profileFromHtml(res.body, res.finalUrl);

  // Znajdź klaster tematyczny strony
  const kg = buildKnowledgeGraph(result.pages, { label: 'site' });
  const target = normUrl(targetUrl);
  const topic = kg.topics.find((t) => t.pages.some((p) => normUrl(p.url) === target));

  // Strony klastra (peers) do zbudowania oczekiwanego profilu
  const clusterUrls = new Set((topic?.pages || []).map((p) => normUrl(p.url)));
  const clusterPages = result.pages.filter((p) => clusterUrls.has(normUrl(p.url)));
  const peerText = clusterPages
    .filter((p) => normUrl(p.url) !== target)
    .map((p) => `${p.seo?.title || ''} ${(p.seo?.h1 || []).join(' ')} ${p.seo?.headingsText || ''} ${p.seo?.bodySample || ''}`)
    .join(' \n ');

  // Oczekiwane: terminy (z grafu), encje i frazy (z peerów), pytania
  const expectedTerms = topic?.expectedTerms || [];
  const expectedQuestions = topic?.expectedQuestions || [];
  const peerEntities = topN(extractEntities(peerText), 2, 25);
  const peerPhrases = topN(extractKeyphrases(peerText), 2, 25);

  // Opcjonalne wzbogacenie darmowym API
  let api = { available: false, sources: [], entities: [], terms: [] };
  const mainKeyword = topic?.label || tokenize(own.title).slice(0, 3).join(' ');
  if (useApi && mainKeyword) {
    try { api = await enrichEntities(mainKeyword, tokenize(mainKeyword)); } catch { /* fallback */ }
  }

  // Łączny zbiór oczekiwanych encji/fraz
  const expectedEntities = [...new Set([...peerEntities, ...api.entities.map((e) => e.toLowerCase())])];
  const expectedPhrases = [...new Set([...peerPhrases])];
  const apiTerms = api.terms.map((t) => normalize(t)).filter(Boolean);

  // Czego brakuje
  const has = (phrase) => own.normText.includes(deburr(String(phrase).toLowerCase()));
  const ownStemHas = (term) => own.termSet.has(tokenizeFirst(term));

  const missingTerms = expectedTerms.filter((t) => !ownStemHas(t));
  const missingEntities = expectedEntities.filter((e) => !has(e)).slice(0, 25);
  const missingPhrases = expectedPhrases.filter((p) => !has(p)).slice(0, 20);
  const missingApiTerms = [...new Set(apiTerms)].filter((t) => !has(t)).slice(0, 20);
  const missingQuestions = expectedQuestions.filter((q) => {
    const qn = normalize(q).slice(0, 25);
    return !own.questions.some((oq) => normalize(oq).includes(qn)) && !own.normText.includes(qn);
  });

  // Pokrycie
  const termCov = expectedTerms.length ? Math.round(((expectedTerms.length - missingTerms.length) / expectedTerms.length) * 100) : null;
  const entCov = expectedEntities.length ? Math.round(((expectedEntities.length - missingEntities.length) / expectedEntities.length) * 100) : null;
  const parts = [termCov, entCov].filter((x) => x != null);
  const completeness = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : termCov;

  // Rekomendacje
  const peerWordMax = Math.max(0, ...clusterPages.map((p) => p.seo?.wordCount || 0));
  const recommendations = [];
  if (peerWordMax && own.wordCount < peerWordMax * 0.6) {
    recommendations.push(`Rozbuduj treść — ${own.wordCount} słów vs ~${peerWordMax} w najobszerniejszej stronie tematu.`);
  }
  if (missingTerms.length) recommendations.push(`Dodaj brakujące podtematy: ${missingTerms.slice(0, 8).join(', ')}.`);
  if (missingEntities.length) recommendations.push(`Uwzględnij encje: ${missingEntities.slice(0, 8).join(', ')}.`);
  if (missingQuestions.length) recommendations.push(`Odpowiedz na pytania (sekcje FAQ/H2): ${missingQuestions.slice(0, 4).join(' | ')}.`);

  return {
    url: own.url,
    title: own.title,
    type: topic ? (topic.pages.find((p) => normUrl(p.url) === target)?.typeLabel || 'Strona') : 'Brak klastra',
    topic: topic?.label || null,
    wordCount: own.wordCount,
    completeness,
    coverage: { terms: termCov, entities: entCov },
    expected: {
      terms: expectedTerms.length, entities: expectedEntities.length, phrases: expectedPhrases.length, questions: expectedQuestions.length,
    },
    own: {
      entities: topN(own.entities, 1, 15),
      keyphrases: topN(own.keyphrases, 2, 12),
      questions: own.questions.slice(0, 10),
    },
    missing: {
      terms: missingTerms.slice(0, 20),
      entities: missingEntities,
      phrases: missingPhrases,
      questions: missingQuestions.slice(0, 8),
      apiTerms: missingApiTerms,
    },
    api: { used: useApi, available: api.available, sources: api.sources },
    recommendations,
    note: topic ? null : 'Strona nie została przypisana do klastra tematycznego — profil oczekiwany jest ograniczony. Dodaj więcej treści w temacie lub włącz wzbogacenie API.',
  };
}

function tokenizeFirst(s) {
  const t = tokenize(s);
  return t[0] || normalize(s);
}
function topN(freqMap, minFreq, n) {
  return [...freqMap.entries()].filter(([, c]) => c >= minFreq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}
