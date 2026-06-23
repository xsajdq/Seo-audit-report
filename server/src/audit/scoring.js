// Liczy realistyczny wynik 0-100 per kategoria oraz wynik ogólny jako WAŻONĄ
// ŚREDNIĄ kategorii (a nie osobną sumę kar) — dzięki temu ogólna ocena nie może
// być niższa niż wszystkie kategorie naraz.
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

// Waga kategorii w wyniku ogólnym (wpływ na SEO). Niszowe kategorie mają mniej.
const CATEGORY_WEIGHT = {
  indexability: 3.0,
  meta: 2.5,
  content: 2.5,
  performance: 2.0,
  mobile: 2.0,
  links: 1.6,
  architecture: 1.6,
  structured: 1.5,
  security: 1.4,
  usability: 1.4,
  accessibility: 1.2,
  geo: 1.2,
  international: 1.0,
  local: 1.0,
  social: 0.8,
  url: 0.8,
};

// Skala łagodności krzywej kategorii — wyższa = łagodniej spada wynik.
const CURVE = 9;

export function scoreAudit(pages, siteIssues = []) {
  const allIssues = [...siteIssues];
  for (const p of pages) for (const i of p.issues || []) allIssues.push(i);

  const byCategory = {};
  for (const key in CATEGORIES) byCategory[key] = { errors: 0, warnings: 0, notices: 0, penalty: 0, hasIssues: false };

  const counts = { error: 0, warning: 0, notice: 0 };
  for (const issue of allIssues) {
    if (counts[issue.severity] !== undefined) counts[issue.severity]++;
    const cat = byCategory[issue.category];
    if (cat) {
      cat.penalty += SEVERITY_WEIGHT[issue.severity] || 0;
      cat.hasIssues = true;
      if (issue.severity === 'error') cat.errors++;
      else if (issue.severity === 'warning') cat.warnings++;
      else if (issue.severity === 'notice') cat.notices++;
    }
  }

  const pageCount = Math.max(pages.length, 1);

  // Wynik kategorii: krzywa asymptotyczna względem kary na stronę (nigdy < 0,
  // łagodnie spada). Brak problemów -> 100.
  const categoryScores = {};
  for (const key in byCategory) {
    const c = byCategory[key];
    const penaltyPerPage = c.penalty / pageCount;
    const score = Math.round((10000) / (100 + penaltyPerPage * CURVE));
    categoryScores[key] = {
      label: CATEGORIES[key],
      score: Math.max(0, Math.min(100, score)),
      errors: c.errors,
      warnings: c.warnings,
      notices: c.notices,
      weight: CATEGORY_WEIGHT[key] || 1,
    };
  }

  // Wynik ogólny = ważona średnia kategorii.
  let wSum = 0;
  let sSum = 0;
  for (const key in categoryScores) {
    const w = CATEGORY_WEIGHT[key] || 1;
    wSum += w;
    sSum += categoryScores[key].score * w;
  }
  const score = Math.round(sSum / (wSum || 1));

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
  if (score >= 45) return 'D';
  return 'F';
}
