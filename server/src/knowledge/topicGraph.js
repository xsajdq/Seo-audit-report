// Budowa tematycznego grafu wiedzy z przeskanowanych stron:
// - klasyfikacja typów podstron (wpis/usługa/produkt/…)
// - klastrowanie tematyczne (TF-IDF + cosine)
// - pokrycie tematów i wykrywanie luk (pillar, interlinking, thin content)
// - węzły i krawędzie do wizualizacji grafu
import { buildTfIdf, cosine, tokenize, normalize } from './text.js';
import { classifyPageType, TYPES } from './pageType.js';

const CLUSTER_THRESHOLD = 0.20;
// Typy stron włączane do mapy tematycznej (pomijamy prawne/kontakt jako nietematyczne).
const TOPICAL_TYPES = new Set(['blog', 'service', 'product', 'category', 'location', 'page', 'homepage']);

function normUrl(u) {
  try {
    const url = new URL(u);
    url.hash = '';
    let s = url.href;
    if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1);
    return s;
  } catch { return u; }
}

export function buildKnowledgeGraph(pages, { label = 'Twoja witryna' } = {}) {
  // 1. Klasyfikacja typów
  const classified = pages.map((p) => ({ page: p, ...classifyPageType(p) }));
  const typeCounts = {};
  for (const key of Object.keys(TYPES)) typeCounts[key] = 0;
  for (const c of classified) typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;

  // 2. Dokumenty do klastrowania
  const docs = classified
    .filter((c) => TOPICAL_TYPES.has(c.type) && (c.page.seo?.title || c.page.seo?.headingsText))
    .map((c) => {
      const s = c.page.seo;
      const text = `${(s.title || '') + ' '} `.repeat(3) +
        `${(s.h1 || []).join(' ')} `.repeat(2) +
        `${s.headingsText || ''} ${s.bodySample || ''}`;
      return { url: normUrl(c.page.url), origUrl: c.page.url, text, type: c.type, page: c.page };
    });

  if (docs.length === 0) {
    return { label, stats: emptyStats(typeCounts), topics: [], nodes: [], edges: [], gaps: [], pageTypes: typeBreakdown(typeCounts) };
  }

  const { vectors, surface } = buildTfIdf(docs);

  // 3. Greedy klastrowanie wg cosine do centroidu (większe strony seedują klastry)
  const order = docs.map((_, i) => i).sort((a, b) => vectors[b].size - vectors[a].size);
  const clusters = []; // { members:[idx], centroid:Map, count }
  for (const i of order) {
    let best = -1, bestSim = 0;
    for (let c = 0; c < clusters.length; c++) {
      const sim = cosine(vectors[i], clusters[c].centroid);
      if (sim > bestSim) { bestSim = sim; best = c; }
    }
    if (best >= 0 && bestSim >= CLUSTER_THRESHOLD) {
      const cl = clusters[best];
      cl.members.push(i);
      // aktualizacja centroidu (średnia)
      for (const [t, w] of vectors[i]) cl.centroid.set(t, (cl.centroid.get(t) || 0) + w);
      cl.count++;
    } else {
      clusters.push({ members: [i], centroid: new Map(vectors[i]), count: 1 });
    }
  }

  // 4. Mapowanie url -> topicId
  const urlToTopic = new Map();
  clusters.forEach((cl, tid) => cl.members.forEach((m) => urlToTopic.set(docs[m].url, tid)));

  // 5. Etykiety tematów (top terminy)
  const topicLabels = clusters.map((cl) => {
    const agg = new Map();
    for (const m of cl.members) for (const [t, w] of vectors[m]) agg.set(t, (agg.get(t) || 0) + w);
    const top = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => surface(t));
    return top.join(' ');
  });

  // 6. Krawędzie między tematami (linkowanie wewnętrzne) + interlinking wewnątrz
  const edgeMap = new Map();
  const intraLinks = new Array(clusters.length).fill(0);
  for (const d of docs) {
    const src = urlToTopic.get(d.url);
    if (src === undefined) continue;
    for (const href of d.page.seo?.internalLinkHrefs || []) {
      const tgt = urlToTopic.get(normUrl(href));
      if (tgt === undefined) continue;
      if (tgt === src) { intraLinks[src]++; continue; }
      const key = src < tgt ? `${src}-${tgt}` : `${tgt}-${src}`;
      edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
    }
  }

  // 7. Pokrycie i metryki per temat
  const topics = clusters.map((cl, tid) => {
    const members = cl.members.map((m) => docs[m]);
    const byType = {};
    let totalWords = 0;
    for (const m of members) {
      byType[m.type] = (byType[m.type] || 0) + 1;
      totalWords += m.page.seo?.wordCount || 0;
    }
    const size = members.length;
    const avgWords = Math.round(totalWords / size);
    const dominantType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0][0];
    const maxWords = Math.max(...members.map((m) => m.page.seo?.wordCount || 0));
    // Pillar = strona-hub: typ filarowy (kategoria/usługa/strona główna/lokalizacja)
    // lub wyraźnie obszerniejsza strona pełniąca rolę przewodnika.
    const hasPillar = members.some((m) => ['homepage', 'category', 'service', 'location'].includes(m.type)) ||
      (size >= 3 && maxWords >= avgWords * 1.8 && maxWords >= 800);
    const interlinkRatio = size > 1 ? Math.min(1, intraLinks[tid] / (size - 1)) : 1;
    const coverage = coverageScore({ size, avgWords, hasPillar, interlinkRatio });
    // Audyt kompletności treści wpisów względem profilu tematu
    const completeness = computeCompleteness(members, surface);
    return {
      id: tid,
      label: topicLabels[tid] || `Temat ${tid + 1}`,
      size,
      expectedTerms: completeness.expectedTerms,
      expectedQuestions: completeness.expectedQuestions,
      pages: members.map((m) => {
        const comp = completeness.perUrl.get(m.origUrl) || {};
        return {
          url: m.origUrl, type: m.type, typeLabel: TYPES[m.type],
          title: m.page.seo?.title || m.origUrl, words: m.page.seo?.wordCount || 0, depth: m.page.depth,
          completeness: comp.completeness ?? null,
          coveredCount: comp.covered ?? 0,
          expectedCount: completeness.expectedTerms.length,
          missing: comp.missing || [],
          missingQuestions: comp.missingQuestions || [],
        };
      }),
      byType,
      dominantType,
      avgWords,
      hasPillar,
      interlinkRatio: Math.round(interlinkRatio * 100),
      coverage,
    };
  }).sort((a, b) => b.size - a.size);

  // 8. Luki treściowe (wewnętrzne)
  const gaps = detectGaps(topics, docs, urlToTopic);

  // 9. Węzły + krawędzie do wizualizacji
  const nodes = topics.map((t) => ({ id: t.id, label: t.label, size: t.size, type: t.dominantType, coverage: t.coverage, gap: t.coverage < 50 }));
  const edges = [...edgeMap.entries()].map(([k, w]) => { const [s, t] = k.split('-').map(Number); return { source: s, target: t, weight: w }; });

  const stats = {
    totalPages: pages.length,
    topicalPages: docs.length,
    topics: topics.length,
    wellCovered: topics.filter((t) => t.coverage >= 70).length,
    gapsCount: gaps.length,
    pillarsMissing: topics.filter((t) => !t.hasPillar && t.size >= 3).length,
    avgCoverage: Math.round(topics.reduce((s, t) => s + t.coverage, 0) / (topics.length || 1)),
  };

  return { label, stats, topics, nodes, edges, gaps, pageTypes: typeBreakdown(typeCounts) };
}

// Audyt kompletności: profil tematu (oczekiwane podtematy/pytania) + pokrycie per wpis.
// Profil = istotne terminy występujące w znaczącej części stron klastra.
export function computeCompleteness(members, surface, extraProfileMembers = []) {
  const profileDocs = [...members, ...extraProfileMembers];
  const psize = profileDocs.length;
  if (psize < 2) return { expectedTerms: [], expectedQuestions: [], perUrl: new Map() };

  // DF terminów w obrębie profilu
  const memberTokenSets = profileDocs.map((m) => new Set(tokenize(m.text)));
  const df = new Map();
  for (const set of memberTokenSets) for (const t of set) df.set(t, (df.get(t) || 0) + 1);

  // oczekiwane terminy: występujące w >=40% stron (min 2), pomijamy zbyt rzadkie/uniwersalne
  const minDf = Math.max(2, Math.ceil(psize * 0.4));
  const expectedStems = [...df.entries()]
    .filter(([, c]) => c >= minDf)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([t]) => t);
  const surf = (s) => (surface ? surface(s) : s);
  const expectedTerms = expectedStems.map(surf);

  // oczekiwane pytania (nagłówki-pytania w temacie)
  const qMap = new Map();
  for (const m of profileDocs) {
    for (const h of String(m.page?.seo?.headingsText || '').split(' . ')) {
      if (h.includes('?')) {
        const key = h.trim().toLowerCase();
        if (key.length > 8) qMap.set(key, (qMap.get(key) || h.trim()));
      }
    }
  }
  const expectedQuestions = [...qMap.values()].slice(0, 10);

  // pokrycie per wpis (tylko nasze strony = members)
  const perUrl = new Map();
  for (const m of members) {
    const set = new Set(tokenize(m.text));
    const covered = expectedStems.filter((s) => set.has(s));
    const missing = expectedStems.filter((s) => !set.has(s)).map(surf).slice(0, 15);
    const ownQ = String(m.page?.seo?.headingsText || '').toLowerCase();
    const missingQuestions = expectedQuestions.filter((q) => !ownQ.includes(q.toLowerCase().slice(0, 20))).slice(0, 6);
    const completeness = expectedStems.length > 0 ? Math.round((covered.length / expectedStems.length) * 100) : null;
    perUrl.set(m.origUrl, { completeness, covered: covered.length, missing, missingQuestions });
  }
  return { expectedTerms, expectedQuestions, perUrl };
}

function coverageScore({ size, avgWords, hasPillar, interlinkRatio }) {
  let s = 0;
  s += Math.min(40, size * 12);                 // liczba treści w temacie
  s += hasPillar ? 20 : 0;                       // pillar / hub
  s += Math.min(20, (avgWords / 800) * 20);      // głębokość treści
  s += interlinkRatio * 20;                      // dwukierunkowe linkowanie
  return Math.max(0, Math.min(100, Math.round(s)));
}

function detectGaps(topics, docs, urlToTopic) {
  const gaps = [];
  // a) Tematy słabo rozwinięte / bez pillara / słaby interlinking
  for (const t of topics) {
    if (t.size === 1) {
      gaps.push({ type: 'thin', topic: t.label, severity: 'warning', detail: 'Temat oparty na 1 stronie — brak wsparcia (cluster). Dodaj artykuły uzupełniające.' });
    } else if (t.avgWords < 300) {
      gaps.push({ type: 'thin', topic: t.label, severity: 'notice', detail: `Płytka treść (śr. ${t.avgWords} słów). Rozbuduj wpisy w tym temacie.` });
    }
    if (t.size >= 3 && !t.hasPillar) {
      gaps.push({ type: 'pillar', topic: t.label, severity: 'warning', detail: 'Klaster bez strony filarowej (pillar/usługa/kategoria). Utwórz stronę-hub łączącą wpisy.' });
    }
    if (t.size >= 3 && t.interlinkRatio < 50) {
      gaps.push({ type: 'interlink', topic: t.label, severity: 'notice', detail: `Słabe linkowanie wewnątrz tematu (${t.interlinkRatio}%). Połącz wpisy klastra dwukierunkowo.` });
    }
  }
  return gaps;
}

function typeBreakdown(typeCounts) {
  return Object.entries(typeCounts)
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, label: TYPES[type], count }))
    .sort((a, b) => b.count - a.count);
}

function emptyStats(typeCounts) {
  return { totalPages: Object.values(typeCounts).reduce((a, b) => a + b, 0), topicalPages: 0, topics: 0, wellCovered: 0, gapsCount: 0, pillarsMissing: 0, avgCoverage: 0 };
}
