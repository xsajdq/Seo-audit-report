// Analiza luk treściowych względem konkurencji: porównuje tematy (klastry) Twojej
// witryny z tematami konkurentów i wskazuje tematy, których u Ciebie brakuje
// lub są słabiej rozwinięte (zwłaszcza wpisy blogowe).
import { buildKnowledgeGraph } from './topicGraph.js';
import { tokenize } from './text.js';

function topicTokens(topic) {
  const set = new Set(tokenize(topic.label));
  for (const p of topic.pages) for (const t of tokenize(p.title || '')) set.add(t);
  return set;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [s, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of s) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

const MATCH_THRESHOLD = 0.22;

/**
 * @param {Array} ourPages  serializowane strony Twojej witryny
 * @param {Array} competitors  [{ domain, pages }]
 */
export function analyzeContentGap(ourPages, competitors) {
  const ourGraph = buildKnowledgeGraph(ourPages, { label: 'Twoja witryna' });
  const ourTopics = ourGraph.topics.map((t) => ({ ...t, tokens: topicTokens(t), blogCount: t.byType.blog || 0 }));

  const compResults = [];
  const gapMap = new Map(); // klucz tematu konkurenta -> agregat

  for (const comp of competitors) {
    const g = buildKnowledgeGraph(comp.pages, { label: comp.domain });
    const compTopics = g.topics
      .filter((t) => t.size >= 1)
      .map((t) => ({ ...t, tokens: topicTokens(t), blogCount: t.byType.blog || 0 }));

    compResults.push({
      domain: comp.domain,
      pagesScanned: comp.pages.length,
      topics: compTopics.length,
      blogPages: (g.pageTypes.find((pt) => pt.type === 'blog') || {}).count || 0,
      pageTypes: g.pageTypes,
    });

    for (const ct of compTopics) {
      // najlepsze dopasowanie do naszych tematów
      let best = 0;
      let bestOur = null;
      for (const ot of ourTopics) {
        const sim = jaccard(ct.tokens, ot.tokens);
        if (sim > best) { best = sim; bestOur = ot; }
      }
      const key = ct.label;
      const examples = ct.pages.slice(0, 4).map((p) => ({ url: p.url, title: p.title, type: p.typeLabel }));

      const subtopics = (ct.expectedTerms || []).slice(0, 12);
      if (best < MATCH_THRESHOLD) {
        // temat całkowicie nieobecny u nas
        const e = gapMap.get(key) || { topic: ct.label, kind: 'missing', dominantType: ct.dominantType, competitors: [], examples: [], compCount: 0, subtopics: [] };
        e.kind = 'missing';
        e.competitors.push(comp.domain);
        e.compCount += ct.size;
        e.examples.push(...examples);
        e.subtopics = [...new Set([...e.subtopics, ...subtopics])].slice(0, 12);
        gapMap.set(key, e);
      } else if (ct.blogCount >= 2 && bestOur && ct.blogCount > (bestOur.blogCount + 1)) {
        // temat jest, ale konkurent ma znacznie więcej wpisów
        const e = gapMap.get(key) || { topic: bestOur.label, kind: 'thinner', dominantType: ct.dominantType, competitors: [], examples: [], compCount: 0, ourCount: bestOur.blogCount, subtopics: [] };
        e.kind = 'thinner';
        e.competitors.push(`${comp.domain} (${ct.blogCount} vs Twoje ${bestOur.blogCount})`);
        e.examples.push(...examples);
        e.subtopics = [...new Set([...e.subtopics, ...subtopics])].slice(0, 12);
        gapMap.set(key, e);
      }
    }
  }

  const gaps = [...gapMap.values()].map((g) => ({
    ...g,
    competitors: [...new Set(g.competitors)],
    examples: dedupeExamples(g.examples).slice(0, 6),
  })).sort((a, b) => (a.kind === b.kind ? b.compCount - a.compCount : a.kind === 'missing' ? -1 : 1));

  return {
    ourTopics: ourTopics.length,
    competitors: compResults,
    summary: {
      missing: gaps.filter((g) => g.kind === 'missing').length,
      thinner: gaps.filter((g) => g.kind === 'thinner').length,
      total: gaps.length,
    },
    gaps,
  };
}

function dedupeExamples(arr) {
  const seen = new Set();
  const out = [];
  for (const e of arr) {
    if (seen.has(e.url)) continue;
    seen.add(e.url);
    out.push(e);
  }
  return out;
}
