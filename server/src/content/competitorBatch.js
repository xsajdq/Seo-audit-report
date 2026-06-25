// Batch „vs konkurencja": dla każdego tematu witryny pobiera TOP Google (Serper),
// buduje wzorzec treści raz na temat i ocenia wszystkie wpisy tematu, zwracając
// ranking najsłabszych względem konkurencji. Profil budowany raz na temat →
// zużycie Serper = liczba przeanalizowanych tematów (a nie stron).
import pLimit from 'p-limit';
import { buildKnowledgeGraph } from '../knowledge/topicGraph.js';
import { buildCompetitorProfile, scoreAgainstProfile, fetchPageText } from './competitorProfile.js';

/**
 * @param {Array} pages  strony z wyniku audytu
 * @param {object} opts  { apiKey, num, maxTopics, maxPagesPerTopic, onProgress }
 */
export async function runCompetitorBatch(pages, { apiKey, num = 10, maxTopics = 10, maxPagesPerTopic = 6, onProgress } = {}) {
  const kg = buildKnowledgeGraph(pages, { label: 'site' });
  let topics = kg.topics.filter((t) => t.label && t.pages.length);
  const skipped = [];
  if (topics.length > maxTopics) {
    for (const t of topics.slice(maxTopics)) skipped.push({ keyword: t.label, reason: `pominięto (limit ${maxTopics} tematów na przebieg)` });
    topics = topics.slice(0, maxTopics);
  }

  const rows = [];
  const failed = [];
  const topicSummaries = [];
  let queriesUsed = 0;
  let done = 0;

  for (const topic of topics) {
    const keyword = topic.label;
    onProgress?.({ phase: 'topic', keyword, done, total: topics.length });
    let profile;
    try {
      profile = await buildCompetitorProfile(keyword, { apiKey, num });
    } catch (e) {
      skipped.push({ keyword, reason: e.message });
      done++;
      continue;
    }
    if (!profile.available) {
      skipped.push({ keyword, reason: profile.error || 'Brak wzorca.' });
      done++;
      continue;
    }
    queriesUsed++;
    topicSummaries.push({
      id: topic.id, keyword, targetWords: profile.targetWords,
      competitors: profile.competitors.length, referenceTerms: profile.referenceTerms.length,
      pages: topic.pages.length,
    });

    const pagesToScore = topic.pages.slice(0, maxPagesPerTopic);
    const limit = pLimit(4);
    const scored = await Promise.all(pagesToScore.map((p) => limit(async () => {
      const page = await fetchPageText(p.url).catch(() => null);
      if (!page) return { error: true, topicId: topic.id, keyword, url: p.url, title: p.title || p.url };
      const targetText = `${page.title} ${page.h1.join(' ')} ${page.headings.join(' ')} ${page.bodyText}`;
      const s = scoreAgainstProfile(targetText, profile);
      return {
        topicId: topic.id, keyword, url: p.url, title: page.title || p.title || p.url, typeLabel: p.typeLabel,
        score: s.score, grade: s.grade, wordCount: s.wordCount, targetWords: s.targetWords,
        termCoverage: s.coverage.terms, missingCount: s.missingTerms.length,
        missingTerms: s.missingTerms.slice(0, 12), missingQuestions: s.missingQuestions.slice(0, 6),
      };
    })));
    for (const sc of scored) (sc.error ? failed : rows).push(sc);
    done++;
    onProgress?.({ phase: 'scored', keyword, done, total: topics.length });
  }

  rows.sort((a, b) => a.score - b.score);
  return {
    source: 'Serper.dev (TOP Google)',
    topicsAnalyzed: topicSummaries.length,
    topicsTotal: topics.length,
    queriesUsed,
    rows,
    failed,
    skipped,
    topics: topicSummaries,
    avgScore: rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : null,
  };
}
