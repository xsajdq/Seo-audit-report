// Liczy wynik 0-100 na podstawie wagi błędów per kategoria.
const SEVERITY_WEIGHT = { error: 10, warning: 3, notice: 1, good: 0 };

export const CATEGORIES = {
  meta: 'Meta i tytuły',
  content: 'Treść i nagłówki',
  indexability: 'Indeksowalność',
  links: 'Linki',
  structured: 'Dane strukturalne',
  performance: 'Wydajność',
  security: 'Bezpieczeństwo',
  mobile: 'Mobile',
  international: 'Międzynarodowe',
  social: 'Social / Open Graph',
  url: 'Struktura URL',
  geo: 'GEO (AI / silniki generatywne)',
  local: 'Local / Geo SEO',
  architecture: 'Architektura / linkowanie',
  accessibility: 'Dostępność (a11y)',
  usability: 'Użyteczność (UX)',
};

export function scoreAudit(pages, siteIssues = []) {
  const allIssues = [...siteIssues];
  for (const p of pages) {
    for (const i of p.issues || []) allIssues.push(i);
  }

  const byCategory = {};
  for (const key in CATEGORIES) byCategory[key] = { errors: 0, warnings: 0, notices: 0, penalty: 0 };

  let totalPenalty = 0;
  const counts = { error: 0, warning: 0, notice: 0 };
  for (const issue of allIssues) {
    const w = SEVERITY_WEIGHT[issue.severity] || 0;
    totalPenalty += w;
    if (counts[issue.severity] !== undefined) counts[issue.severity]++;
    const cat = byCategory[issue.category];
    if (cat) {
      cat.penalty += w;
      if (issue.severity === 'error') cat.errors++;
      else if (issue.severity === 'warning') cat.warnings++;
      else if (issue.severity === 'notice') cat.notices++;
    }
  }

  // Normalizacja: kara względem liczby stron, by wynik był porównywalny.
  const pageCount = Math.max(pages.length, 1);
  const avgPenalty = totalPenalty / pageCount;
  // 0 kary -> 100; rośnie kara -> spada wynik (krzywa)
  const score = Math.max(0, Math.round(100 - avgPenalty * 1.5));

  // Wyniki per kategoria
  const categoryScores = {};
  for (const key in byCategory) {
    const c = byCategory[key];
    const avg = c.penalty / pageCount;
    categoryScores[key] = {
      label: CATEGORIES[key],
      score: Math.max(0, Math.round(100 - avg * 4)),
      errors: c.errors,
      warnings: c.warnings,
      notices: c.notices,
    };
  }

  return {
    score,
    grade: gradeFor(score),
    totals: { ...counts, total: allIssues.length, pages: pages.length },
    categories: categoryScores,
  };
}

function gradeFor(score) {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
