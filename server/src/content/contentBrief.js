// Etap B — generator briefów contentowych.
// Dla frazy LUB istniejącej strony tworzy brief: outline (H2/H3), pytania do
// odpowiedzenia, encje/terminy do użycia, docelowa długość, title+meta,
// linki wewnętrzne. Opcjonalnie wzbogacony o Google Suggest i Wikipedia/ConceptNet.
import { buildKnowledgeGraph } from '../knowledge/topicGraph.js';
import { tokenize, normalize } from '../knowledge/text.js';
import { buildTitle, buildDescription } from '../keyword/keywordMatcher.js';
import { analyzeLinkOpportunities } from './internalLinks.js';
import { expandKeyword } from './keywordExpansion.js';
import { enrichEntities } from '../knowledge/entityApi.js';

function normUrl(u) {
  try { const x = new URL(u); x.hash = ''; let s = x.href; if (s.endsWith('/') && x.pathname !== '/') s = s.slice(0, -1); return s.toLowerCase(); }
  catch { return String(u).toLowerCase(); }
}
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let i = 0; const [s, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of s) if (big.has(x)) i++;
  return i / (a.size + b.size - i);
}

export async function generateBrief(result, { keyword, url, brand = '', useSuggest = false, useApi = false } = {}) {
  const kg = buildKnowledgeGraph(result.pages, { label: 'site' });

  // Wyznacz temat: po URL (klaster strony) albo po frazie (najlepsze dopasowanie etykiety)
  let topic = null;
  let mainKeyword = (keyword || '').trim();
  if (url) {
    const t = normUrl(url);
    topic = kg.topics.find((x) => x.pages.some((p) => normUrl(p.url) === t));
    if (topic && !mainKeyword) mainKeyword = topic.label;
  }
  if (!topic && mainKeyword) {
    const kwTokens = new Set(tokenize(mainKeyword));
    let best = 0;
    for (const x of kg.topics) {
      const sim = jaccard(kwTokens, new Set(tokenize(x.label + ' ' + x.pages.map((p) => p.title).join(' '))));
      if (sim > best) { best = sim; topic = x; }
    }
    if (best < 0.12) topic = null;
  }
  if (!mainKeyword) mainKeyword = topic?.label || '';
  if (!mainKeyword) return { error: 'Podaj frazę docelową lub adres strony.' };

  // Profil tematu
  const expectedTerms = topic?.expectedTerms || [];
  const clusterPages = topic ? result.pages.filter((p) => topic.pages.some((tp) => normUrl(tp.url) === normUrl(p.url))) : [];
  const targetWords = Math.max(800, ...clusterPages.map((p) => p.seo?.wordCount || 0));

  // Nagłówki kandydaci z klastra (H2/H3 peerów)
  const clusterHeadings = [];
  const seenH = new Set();
  for (const p of clusterPages) {
    for (const h of String(p.seo?.headingsText || '').split(' . ')) {
      const clean = h.trim();
      const key = normalize(clean);
      if (clean.length > 6 && !seenH.has(key)) { seenH.add(key); clusterHeadings.push(clean); }
    }
  }

  // Pytania: z klastra + (opcjonalnie) Google Suggest
  let questions = (topic?.expectedQuestions || []).slice();
  let suggestData = { available: false };
  if (useSuggest) {
    suggestData = await expandKeyword(mainKeyword, { deep: true }).catch(() => ({ available: false, questions: [], suggestions: [] }));
    if (suggestData.questions?.length) questions = [...new Set([...questions, ...suggestData.questions])];
  }
  questions = questions.slice(0, 15);

  // Encje (opcjonalnie z API)
  let entities = [];
  let api = { used: false, available: false, sources: [] };
  if (useApi) {
    api = await enrichEntities(mainKeyword, tokenize(mainKeyword)).catch(() => ({ available: false, entities: [], sources: [] }));
    api.used = true;
    entities = (api.entities || []).slice(0, 25);
  }

  // Outline: złóż H2 z nagłówków klastra + pytań + sugestii
  const outline = buildOutline(mainKeyword, clusterHeadings, questions, suggestData.suggestions || []);

  // Title / meta
  const additional = expectedTerms.filter((t) => normalize(t) !== normalize(mainKeyword)).slice(0, 3);
  const suggestedTitle = buildTitle(mainKeyword, additional, brand);
  const suggestedDescription = buildDescription(mainKeyword, additional, brand);
  const slug = '/' + normalize(mainKeyword).replace(/\s+/g, '-');

  // Linki wewnętrzne
  let internalLinks = [];
  if (url) {
    const lo = analyzeLinkOpportunities(result, url, { max: 8 });
    if (!lo.error) internalLinks = lo.opportunities.map((o) => ({ from: o.url, anchor: lo.suggestedAnchor, relevance: o.relevance }));
  } else {
    // dla nowej strony: powiązane strony jako potencjalne źródła linków
    const kwTokens = new Set(tokenize(mainKeyword));
    internalLinks = result.pages
      .filter((p) => p.seo)
      .map((p) => ({ url: p.url, title: p.seo.title, sim: jaccard(kwTokens, new Set(tokenize((p.seo.title || '') + ' ' + (p.seo.headingsText || '')))) }))
      .filter((p) => p.sim > 0.1)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 8)
      .map((p) => ({ from: p.url, anchor: mainKeyword, relevance: Math.round(p.sim * 100) }));
  }

  return {
    keyword: mainKeyword,
    forUrl: url || null,
    topic: topic?.label || null,
    targetWords,
    suggestedTitle,
    suggestedDescription,
    suggestedSlug: slug,
    outline,
    questions,
    termsToInclude: expectedTerms,
    entities,
    internalLinks,
    suggest: { used: useSuggest, available: suggestData.available, related: (suggestData.suggestions || []).slice(0, 30) },
    api: { used: api.used, available: api.available, sources: api.sources || [] },
  };
}

function buildOutline(keyword, clusterHeadings, questions, suggestions) {
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const out = [{ level: 'H1', text: cap(keyword) }];
  out.push({ level: 'H2', text: `Czym jest ${keyword}? — definicja` });
  // wybierz najlepsze nagłówki klastra
  for (const h of clusterHeadings.slice(0, 6)) out.push({ level: 'H2', text: h });
  // pytania jako H2/H3
  for (const q of questions.slice(0, 6)) out.push({ level: 'H3', text: cap(q.replace(/\?+$/, '') + '?') });
  // sekcje stałe
  out.push({ level: 'H2', text: `${cap(keyword)} — najczęstsze błędy i wskazówki` });
  out.push({ level: 'H2', text: 'Podsumowanie i FAQ' });
  // dedupe po znormalizowanym tekście
  const seen = new Set();
  return out.filter((o) => { const k = normalize(o.text); if (seen.has(k)) return false; seen.add(k); return true; });
}
