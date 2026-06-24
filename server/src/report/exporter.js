// Eksport wyników audytu do CSV, raportu HTML oraz checklisty .xlsx.
import { CATEGORIES } from '../audit/scoring.js';
import { buildXlsx } from './xlsx.js';

const PRIORITY = { error: 'Wysoki', warning: 'Średni', notice: 'Niski' };
const STATUS_OPTIONS = ['Do zrobienia', 'W trakcie', 'Zrobione'];

// Buduje skoroszyt .xlsx z checklistą wdrożeniową po audycie.
export function buildChecklistXlsx(result, kg = null) {
  const { summary, meta, site } = result;

  // --- Arkusz: Podsumowanie ---
  const summaryRows = [
    ['Audyt SEO — podsumowanie', ''],
    ['Adres', meta.startUrl],
    ['Wygenerowano', new Date(meta.generatedAt).toLocaleString('pl-PL')],
    ['Wynik ogólny', summary.score],
    ['Ocena', summary.grade],
    ['Przeskanowane strony', summary.totals.pages],
    ['Błędy', summary.totals.error],
    ['Ostrzeżenia', summary.totals.warning],
    ['Uwagi', summary.totals.notice],
    ['', ''],
    ['Kategoria', 'Wynik', 'Błędy', 'Ostrzeżenia', 'Uwagi'],
    ...Object.values(summary.categories).map((c) => [c.label, c.score, c.errors, c.warnings, c.notices]),
  ];

  // --- Arkusz: Checklista (zagregowane problemy, priorytetyzowane) ---
  const agg = new Map();
  const consider = [];
  for (const p of result.pages) for (const i of p.issues) consider.push({ ...i, url: p.url });
  for (const i of result.siteIssues || []) consider.push({ ...i, url: '(cała witryna)' });
  for (const i of consider) {
    const k = `${i.severity}|${i.category}|${i.title}`;
    if (!agg.has(k)) agg.set(k, { ...i, count: 0, pages: [] });
    const e = agg.get(k);
    e.count++;
    if (e.pages.length < 5 && i.url) e.pages.push(i.url);
  }
  const order = { error: 0, warning: 1, notice: 2 };
  const issues = [...agg.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

  const checklistHeader = ['Priorytet', 'Waga', 'Kategoria', 'Co poprawić', 'Jak naprawić', 'Szczegóły', 'Liczba stron', 'Przykładowe URL-e', 'Status', 'Notatki'];
  const checklistRows = [checklistHeader, ...issues.map((i) => [
    PRIORITY[i.severity] || '—',
    i.severity,
    CATEGORIES[i.category] || i.category,
    i.title,
    i.fix || '',
    i.detail || '',
    i.count,
    (i.pages || []).join('\n'),
    '',
    '',
  ])];

  // --- Arkusz: Strony ---
  const pagesHeader = ['URL', 'Status', 'Tytuł', 'H1', 'Słów', 'Błędy', 'Ostrzeżenia', 'Uwagi', 'Status realizacji'];
  const pagesRows = [pagesHeader, ...result.pages
    .slice()
    .sort((a, b) => (b.issueCounts.error * 100 + b.issueCounts.warning * 10) - (a.issueCounts.error * 100 + a.issueCounts.warning * 10))
    .map((p) => [
      p.url, p.status, p.seo?.title || '', p.seo?.h1Count ?? '', p.seo?.wordCount ?? '',
      p.issueCounts.error, p.issueCounts.warning, p.issueCounts.notice, '',
    ])];

  const sheets = [
    { name: 'Podsumowanie', columns: [{ width: 28 }, { width: 14 }, { width: 12 }, { width: 12 }, { width: 12 }], rows: summaryRows },
    {
      name: 'Checklista', autofilter: true,
      columns: [{ width: 10 }, { width: 9 }, { width: 20 }, { width: 36 }, { width: 55 }, { width: 45 }, { width: 11 }, { width: 40 }, { width: 14 }, { width: 26 }],
      rows: checklistRows,
      statusValidation: { col: 8, lastRow: checklistRows.length, options: STATUS_OPTIONS },
    },
    {
      name: 'Strony', autofilter: true,
      columns: [{ width: 50 }, { width: 8 }, { width: 40 }, { width: 6 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 8 }, { width: 16 }],
      rows: pagesRows,
      statusValidation: { col: 8, lastRow: pagesRows.length, options: STATUS_OPTIONS },
    },
  ];

  // --- Arkusz: Kompletność treści (z grafu wiedzy) ---
  if (kg && kg.topics) {
    const complRows = [['Strona', 'Temat', 'Kompletność %', 'Brakujące podtematy', 'Brakujące pytania', 'Status']];
    for (const t of kg.topics) {
      for (const p of t.pages) {
        if (p.completeness != null && p.completeness < 100) {
          complRows.push([p.title || p.url, t.label, p.completeness, (p.missing || []).join(', '), (p.missingQuestions || []).join(' | '), '']);
        }
      }
    }
    if (complRows.length > 1) {
      sheets.push({
        name: 'Kompletność treści', autofilter: true,
        columns: [{ width: 45 }, { width: 28 }, { width: 14 }, { width: 50 }, { width: 40 }, { width: 14 }],
        rows: complRows,
        statusValidation: { col: 5, lastRow: complRows.length, options: STATUS_OPTIONS },
      });
    }
  }

  return buildXlsx(sheets);
}

export function toCSV(result) {
  const rows = [
    ['URL', 'Status', 'Tytuł', 'Dł. tytułu', 'Meta description', 'Dł. opisu', 'H1', 'Słów', 'Obrazy bez alt', 'Linki wew.', 'Czas (ms)', 'Błędy', 'Ostrzeżenia', 'Uwagi'],
  ];
  for (const p of result.pages) {
    const s = p.seo || {};
    rows.push([
      p.url,
      p.status,
      s.title || '',
      s.titleLength || 0,
      s.metaDescription || '',
      s.metaDescriptionLength || 0,
      s.h1Count ?? '',
      s.wordCount ?? '',
      s.imagesMissingAlt ?? '',
      s.internalLinkCount ?? '',
      p.responseTimeMs ?? '',
      p.issueCounts.error,
      p.issueCounts.warning,
      p.issueCounts.notice,
    ]);
  }
  return rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

// Prosta checklista treści (.xlsx): lista wszystkich wpisów i usług z informacją,
// jakie podtematy (odpowiedzi) i pytania muszą się jeszcze pojawić.
const TYPE_ORDER = { blog: 0, service: 1, product: 2, category: 3, location: 4, homepage: 5, page: 6 };
export function buildContentChecklistXlsx(result, kg) {
  const STATUS_OPTIONS = ['Do zrobienia', 'W trakcie', 'Gotowe'];
  const rows = [[
    'Typ', 'Tytuł', 'URL', 'Temat', 'Kompletność %', 'Słów',
    'Brakujące podtematy (odpowiedzi do pokrycia)', 'Pytania do dodania', 'Status', 'Notatki',
  ]];

  const flat = [];
  if (kg && kg.topics) {
    for (const t of kg.topics) {
      for (const p of t.pages) {
        flat.push({
          type: p.type, typeLabel: p.typeLabel, title: p.title, url: p.url, topic: t.label,
          completeness: p.completeness, words: p.words,
          missing: p.missing || [], missingQuestions: p.missingQuestions || [],
        });
      }
    }
  }
  // sortuj: typ (wpisy, usługi…), potem najmniej kompletne najpierw
  flat.sort((a, b) =>
    (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) ||
    (a.completeness ?? 101) - (b.completeness ?? 101));

  for (const p of flat) {
    rows.push([
      p.typeLabel, p.title, p.url, p.topic,
      p.completeness ?? '—', p.words ?? '',
      p.missing.join(', '),
      p.missingQuestions.join('  |  '),
      '', '',
    ]);
  }

  const sheets = [{
    name: 'Wpisy i usługi', autofilter: true,
    columns: [{ width: 18 }, { width: 42 }, { width: 48 }, { width: 26 }, { width: 13 }, { width: 8 }, { width: 50 }, { width: 50 }, { width: 14 }, { width: 28 }],
    rows,
    statusValidation: { col: 8, lastRow: rows.length, options: STATUS_OPTIONS },
  }];

  // legenda typów
  sheets.push({
    name: 'Legenda', columns: [{ width: 22 }, { width: 60 }],
    rows: [
      ['Jak korzystać', ''],
      ['Typ', 'Filtruj kolumnę „Typ", aby wybrać wpisy blogowe lub usługi.'],
      ['Kompletność %', 'Im niżej, tym więcej treści brakuje względem tematu (klastra).'],
      ['Brakujące podtematy', 'Zagadnienia/odpowiedzi, które warto dodać do treści.'],
      ['Pytania do dodania', 'Pytania (sekcje H2/FAQ), na które strona powinna odpowiedzieć.'],
      ['Status', 'Lista rozwijana: Do zrobienia / W trakcie / Gotowe.'],
    ],
  });

  return buildXlsx(sheets);
}

// Content plan -> .xlsx (kalendarz redakcyjny)
export function buildContentPlanXlsx(plan) {
  const STATUS_OPTIONS = ['Do zrobienia', 'W przygotowaniu', 'W trakcie', 'Opublikowane'];
  const header = ['Miesiąc', 'Akcja', 'Typ', 'Główna fraza', 'Sugerowany tytuł', 'Slug / URL', 'Klaster', 'Intencja', 'Priorytet', 'Frazy wspierające', 'Uzasadnienie', 'Status', 'Właściciel'];
  const rows = [header];
  for (const it of plan.items) {
    rows.push([
      `Miesiąc ${it.month}`, it.action, it.type, it.keyword, it.title || '', it.slug || it.url || '',
      it.cluster || '', it.intent || '', it.priority, (it.supporting || []).join(', '), it.reason || '', '', '',
    ]);
  }
  const sheets = [{
    name: 'Content plan', autofilter: true,
    columns: [{ width: 11 }, { width: 18 }, { width: 20 }, { width: 28 }, { width: 44 }, { width: 34 }, { width: 22 }, { width: 14 }, { width: 10 }, { width: 38 }, { width: 50 }, { width: 16 }, { width: 16 }],
    rows,
    statusValidation: { col: 11, lastRow: rows.length, options: STATUS_OPTIONS },
  }];
  return buildXlsx(sheets);
}

export function toHTMLReport(result, kg = null) {
  const { summary, meta, site } = result;
  const sevColor = { error: '#dc2626', warning: '#d97706', notice: '#0891b2' };

  const catRows = Object.entries(summary.categories)
    .map(([key, c]) =>
      `<tr><td>${c.label}</td><td><b>${c.score}</b>/100</td><td style="color:${sevColor.error}">${c.errors}</td><td style="color:${sevColor.warning}">${c.warnings}</td><td style="color:${sevColor.notice}">${c.notices}</td></tr>`
    )
    .join('');

  // Zbierz unikalne typy problemów z liczbą wystąpień
  const issueAgg = new Map();
  for (const p of result.pages) {
    for (const i of p.issues) {
      const k = `${i.severity}|${i.category}|${i.title}`;
      if (!issueAgg.has(k)) issueAgg.set(k, { ...i, count: 0, pages: [] });
      const e = issueAgg.get(k);
      e.count++;
      if (e.pages.length < 8) e.pages.push(p.url);
    }
  }
  const sevOrder = { error: 0, warning: 1, notice: 2 };
  const issuesSorted = [...issueAgg.values()].sort(
    (a, b) => sevOrder[a.severity] - sevOrder[b.severity] || b.count - a.count
  );
  const issueRows = issuesSorted
    .map(
      (i) =>
        `<tr><td><span class="badge" style="background:${sevColor[i.severity]}">${i.severity}</span></td><td>${esc(i.title)}</td><td style="color:#14532d">${esc(i.fix || '')}</td><td>${CATEGORIES[i.category] || i.category}</td><td style="text-align:center">${i.count}</td></tr>`
    )
    .join('');

  const pageRows = result.pages
    .map((p) => {
      const s = p.seo || {};
      return `<tr><td><a href="${esc(p.url)}" target="_blank">${esc(p.url)}</a></td><td>${p.status}</td><td>${esc(s.title || '—')}</td><td>${s.h1Count ?? '—'}</td><td>${s.wordCount ?? '—'}</td><td style="color:${sevColor.error}">${p.issueCounts.error}</td><td style="color:${sevColor.warning}">${p.issueCounts.warning}</td><td style="color:${sevColor.notice}">${p.issueCounts.notice}</td></tr>`;
    })
    .join('');

  return `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Raport SEO — ${esc(new URL(meta.startUrl).hostname)}</title>
<style>
*{box-sizing:border-box} body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f8fafc;color:#0f172a;line-height:1.5}
.wrap{max-width:1100px;margin:0 auto;padding:32px}
h1{font-size:24px;margin:0 0 4px} .sub{color:#64748b;margin-bottom:24px;font-size:14px}
.score{display:flex;align-items:center;gap:24px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:24px;margin-bottom:24px}
.gauge{width:120px;height:120px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:38px;font-weight:700;color:#fff}
.stat{display:flex;gap:24px;flex-wrap:wrap}
.stat div{font-size:13px;color:#64748b} .stat b{display:block;font-size:22px;color:#0f172a}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:24px;font-size:13px}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #f1f5f9} th{background:#f8fafc;font-weight:600;color:#475569}
td a{color:#2563eb;text-decoration:none} h2{font-size:18px;margin:24px 0 12px}
.badge{color:#fff;padding:2px 8px;border-radius:6px;font-size:11px;text-transform:uppercase;font-weight:600}
</style></head><body><div class="wrap">
<h1>Raport audytu SEO</h1>
<div class="sub">${esc(meta.startUrl)} · wygenerowano ${new Date(meta.generatedAt).toLocaleString('pl-PL')}</div>
<div class="score">
  <div class="gauge" style="background:${scoreColor(summary.score)}">${summary.score}</div>
  <div class="stat">
    <div><b>${summary.grade}</b>Ocena</div>
    <div><b>${summary.totals.pages}</b>Stron</div>
    <div><b style="color:${sevColor.error}">${summary.totals.error}</b>Błędów</div>
    <div><b style="color:${sevColor.warning}">${summary.totals.warning}</b>Ostrzeżeń</div>
    <div><b style="color:${sevColor.notice}">${summary.totals.notice}</b>Uwag</div>
    <div><b>${site.duplicateTitles}</b>Dup. tytułów</div>
    <div><b>${site.orphanPages}</b>Osierocone</div>
  </div>
</div>
<h2>Wyniki wg kategorii</h2>
<table><thead><tr><th>Kategoria</th><th>Wynik</th><th>Błędy</th><th>Ostrzeżenia</th><th>Uwagi</th></tr></thead><tbody>${catRows}</tbody></table>
<h2>Najczęstsze problemy</h2>
<table><thead><tr><th>Waga</th><th>Problem</th><th>Jak naprawić</th><th>Kategoria</th><th>Wystąpień</th></tr></thead><tbody>${issueRows}</tbody></table>
${kgSection(kg, esc)}
<h2>Strony (${result.pages.length})</h2>
<table><thead><tr><th>URL</th><th>Status</th><th>Tytuł</th><th>H1</th><th>Słów</th><th>E</th><th>W</th><th>N</th></tr></thead><tbody>${pageRows}</tbody></table>
</div></body></html>`;
}

// Sekcja tematycznego grafu wiedzy + kompletności wpisów w raporcie HTML.
function kgSection(kg, esc) {
  if (!kg || !kg.topics || kg.topics.length === 0) return '';
  const covColor = (s) => (s >= 70 ? '#16a34a' : s >= 50 ? '#d97706' : '#dc2626');
  const topicRows = kg.topics.map((t) =>
    `<tr><td>${esc(t.label)}</td><td>${t.size}</td><td style="color:${covColor(t.coverage)}"><b>${t.coverage}%</b></td><td>${t.hasPillar ? '✓' : '—'}</td><td>${t.interlinkRatio}%</td><td>${Object.entries(t.byType).map(([k, n]) => `${n}×${k}`).join(', ')}</td></tr>`
  ).join('');

  // Kompletność wpisów < 100%
  const incomplete = [];
  for (const t of kg.topics) {
    for (const p of t.pages) {
      if (p.completeness != null && p.completeness < 100) {
        incomplete.push({ topic: t.label, ...p });
      }
    }
  }
  incomplete.sort((a, b) => a.completeness - b.completeness);
  const complRows = incomplete.slice(0, 40).map((p) =>
    `<tr><td><a href="${esc(p.url)}" target="_blank">${esc(p.title)}</a></td><td>${esc(p.topic)}</td><td style="color:${covColor(p.completeness)}"><b>${p.completeness}%</b></td><td>${esc((p.missing || []).slice(0, 8).join(', '))}</td></tr>`
  ).join('');

  const gapRows = (kg.gaps || []).map((g) =>
    `<tr><td>${esc(g.topic)}</td><td>${esc(g.type)}</td><td>${esc(g.detail)}</td></tr>`
  ).join('');

  return `<h2>Tematyczny graf wiedzy</h2>
<div class="sub">Tematów: ${kg.stats.topics} · śr. pokrycie ${kg.stats.avgCoverage}% · luk: ${kg.stats.gapsCount} · klastry bez pillara: ${kg.stats.pillarsMissing}</div>
<table><thead><tr><th>Temat</th><th>Stron</th><th>Pokrycie</th><th>Pillar</th><th>Interlink</th><th>Skład</th></tr></thead><tbody>${topicRows}</tbody></table>
${complRows ? `<h2>Kompletność treści wpisów (&lt;100%)</h2>
<table><thead><tr><th>Strona</th><th>Temat</th><th>Kompletność</th><th>Brakujące podtematy</th></tr></thead><tbody>${complRows}</tbody></table>` : ''}
${gapRows ? `<h2>Luki tematyczne</h2>
<table><thead><tr><th>Temat</th><th>Typ</th><th>Rekomendacja</th></tr></thead><tbody>${gapRows}</tbody></table>` : ''}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function scoreColor(s) {
  if (s >= 90) return '#16a34a';
  if (s >= 75) return '#65a30d';
  if (s >= 60) return '#d97706';
  if (s >= 40) return '#ea580c';
  return '#dc2626';
}
