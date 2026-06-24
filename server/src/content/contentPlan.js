// Etap A — generator content planu / kalendarza redakcyjnego.
// Z listy fraz (+ luk z grafu i niekompletnych wpisów) buduje priorytetyzowaną
// listę treści do stworzenia/rozbudowy i rozkłada ją na miesiące.
import { matchKeywords } from '../keyword/keywordMatcher.js';
import { buildKnowledgeGraph } from '../knowledge/topicGraph.js';
import { normalize } from '../knowledge/text.js';

const INTENT_PRIORITY = { transakcyjna: 3, informacyjna: 2.2, nawigacyjna: 1, 'ogólna': 2 };

function guessType(intent, local) {
  if (intent === 'transakcyjna') return local ? 'Usługa (lokalna)' : 'Usługa / oferta';
  if (intent === 'informacyjna') return 'Wpis blogowy';
  return 'Strona / wpis';
}

export function generateContentPlan(result, { keywords = [], brand = '', months = 6, perMonth = 4 } = {}) {
  const items = [];

  // 1. Z fraz: nowe strony (luki) oraz strony docelowe ze słabym pokryciem
  if (keywords.length > 0) {
    const m = matchKeywords(result.pages, keywords, { brand });
    for (const np of m.newPages) {
      const intent = guessIntentOfCluster(np, m);
      items.push({
        action: 'Nowa treść',
        type: guessType(intent.intent, intent.local),
        keyword: np.primary,
        supporting: np.additional,
        title: np.suggestedTitle,
        slug: np.suggestedSlug,
        description: np.suggestedDescription,
        cluster: np.primary,
        intent: intent.intent,
        local: intent.local,
        priority: round1((INTENT_PRIORITY[intent.intent] || 2) + (intent.local ? 0.4 : 0) + Math.min(np.keywords.length * 0.2, 1)),
        reason: `Fraza bez dobrej strony docelowej (${np.keywords.length} powiązanych).`,
      });
    }
  }

  // 2. Z grafu wiedzy: luki tematyczne (brak pillara) + płytkie wpisy
  const kg = buildKnowledgeGraph(result.pages, { label: 'site' });
  for (const t of kg.topics) {
    if (t.size >= 3 && !t.hasPillar) {
      items.push({
        action: 'Nowa treść (pillar)', type: 'Strona filarowa (pillar)',
        keyword: t.label, supporting: t.expectedTerms?.slice(0, 5) || [], title: cap(t.label),
        slug: '/' + normalize(t.label).replace(/\s+/g, '-'), cluster: t.label, intent: 'informacyjna', local: false,
        priority: 3.2, reason: `Klaster „${t.label}" ma ${t.size} wpisów bez strony filarowej.`,
      });
    }
    for (const p of t.pages) {
      if (p.completeness != null && p.completeness < 60) {
        items.push({
          action: 'Rozbudowa treści', type: p.typeLabel, keyword: t.label,
          supporting: (p.missing || []).slice(0, 6), title: p.title, slug: p.url, cluster: t.label,
          intent: 'informacyjna', local: false,
          priority: round1(2.5 + (60 - p.completeness) / 40),
          reason: `Kompletność ${p.completeness}% — brakuje: ${(p.missing || []).slice(0, 5).join(', ')}.`,
          url: p.url,
        });
      }
    }
  }

  // dedupe po (action + slug/keyword), sort wg priorytetu
  const seen = new Set();
  const deduped = [];
  for (const it of items.sort((a, b) => b.priority - a.priority)) {
    const key = `${it.action}|${normalize(it.title || it.keyword)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(it);
  }

  // rozkład na miesiące (round-robin wg priorytetu)
  const cap2 = Math.max(1, perMonth);
  const planned = deduped.map((it, i) => ({ ...it, month: Math.min(months, Math.floor(i / cap2) + 1) }));
  const byMonth = {};
  for (let mth = 1; mth <= months; mth++) byMonth[mth] = planned.filter((p) => p.month === mth);

  return {
    summary: {
      total: planned.length,
      nowe: planned.filter((p) => p.action.startsWith('Nowa')).length,
      rozbudowa: planned.filter((p) => p.action === 'Rozbudowa treści').length,
      months,
    },
    items: planned,
    byMonth,
  };
}

function guessIntentOfCluster(np, m) {
  // znajdź intencję z dowolnej powiązanej frazy w unmatched
  const kw = (np.keywords || [np.primary])[0];
  const u = (m.unmatched || []).find((x) => x.keyword === kw);
  return { intent: u?.intent || 'informacyjna', local: u?.local || false };
}
function round1(n) { return Math.round(n * 10) / 10; }
function cap(s) { return String(s).charAt(0).toUpperCase() + String(s).slice(1); }
