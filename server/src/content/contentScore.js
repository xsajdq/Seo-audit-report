// Etap C — ocena draftu treści względem profilu tematu (jak Surfer/Clearscope).
// Zwraca ocenę A–F, pokrycie terminów/pytań, brakujące elementy i licznik słów.
import { buildKnowledgeGraph } from '../knowledge/topicGraph.js';
import { tokenize, normalize, deburr } from '../knowledge/text.js';

function normUrl(u) {
  try { const x = new URL(u); x.hash = ''; let s = x.href; if (s.endsWith('/') && x.pathname !== '/') s = s.slice(0, -1); return s.toLowerCase(); }
  catch { return String(u).toLowerCase(); }
}
function jaccard(a, b) { if (!a.size || !b.size) return 0; let i = 0; const [s, big] = a.size < b.size ? [a, b] : [b, a]; for (const x of s) if (big.has(x)) i++; return i / (a.size + b.size - i); }

export function scoreDraft(result, { text = '', keyword = '', url = '' } = {}) {
  const kg = buildKnowledgeGraph(result.pages, { label: 'site' });
  let topic = null;
  if (url) { const t = normUrl(url); topic = kg.topics.find((x) => x.pages.some((p) => normUrl(p.url) === t)); }
  if (!topic && keyword) {
    const kt = new Set(tokenize(keyword)); let best = 0;
    for (const x of kg.topics) { const s = jaccard(kt, new Set(tokenize(x.label + ' ' + x.pages.map((p) => p.title).join(' ')))); if (s > best) { best = s; topic = x; } }
    if (best < 0.12) topic = null;
  }

  const expectedTerms = topic?.expectedTerms || [];
  const expectedQuestions = topic?.expectedQuestions || [];
  const clusterPages = topic ? result.pages.filter((p) => topic.pages.some((tp) => normUrl(tp.url) === normUrl(p.url))) : [];
  const targetWords = Math.max(700, ...clusterPages.map((p) => p.seo?.wordCount || 0));

  const normText = normalize(text);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const termSet = new Set(tokenize(text));
  const has = (s) => normText.includes(deburr(String(s).toLowerCase()));

  const coveredTerms = expectedTerms.filter((t) => termSet.has(tokenize(t)[0] || normalize(t)));
  const missingTerms = expectedTerms.filter((t) => !coveredTerms.includes(t));
  const coveredQ = expectedQuestions.filter((q) => has(normalize(q).slice(0, 22)));
  const missingQuestions = expectedQuestions.filter((q) => !coveredQ.includes(q));

  const termCov = expectedTerms.length ? coveredTerms.length / expectedTerms.length : null;
  const lengthRatio = Math.min(1, wordCount / targetWords);

  // wynik 0-100: 70% pokrycie terminów + 30% długość (gdy brak profilu — sama długość)
  let score;
  if (termCov == null) score = Math.round(lengthRatio * 100);
  else score = Math.round((termCov * 0.7 + lengthRatio * 0.3) * 100);

  return {
    topic: topic?.label || null,
    grade: gradeLetter(score),
    score,
    wordCount,
    targetWords,
    coverage: { terms: termCov != null ? Math.round(termCov * 100) : null, length: Math.round(lengthRatio * 100) },
    covered: { terms: coveredTerms.length, questions: coveredQ.length },
    expected: { terms: expectedTerms.length, questions: expectedQuestions.length },
    missingTerms: missingTerms.slice(0, 30),
    missingQuestions: missingQuestions.slice(0, 10),
    note: topic ? null : 'Brak dopasowanego tematu — ocena oparta tylko na długości. Podaj frazę występującą w audytowanej witrynie lub dodaj więcej treści w temacie.',
  };
}

function gradeLetter(s) {
  if (s >= 90) return 'A';
  if (s >= 80) return 'B';
  if (s >= 65) return 'C';
  if (s >= 50) return 'D';
  return 'F';
}
