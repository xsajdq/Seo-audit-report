// Eksport wyników audytu do CSV oraz samodzielnego raportu HTML.
import { CATEGORIES } from '../audit/scoring.js';

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

export function toHTMLReport(result) {
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
        `<tr><td><span class="badge" style="background:${sevColor[i.severity]}">${i.severity}</span></td><td>${esc(i.title)}</td><td>${CATEGORIES[i.category] || i.category}</td><td style="text-align:center">${i.count}</td></tr>`
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
<table><thead><tr><th>Waga</th><th>Problem</th><th>Kategoria</th><th>Wystąpień</th></tr></thead><tbody>${issueRows}</tbody></table>
<h2>Strony (${result.pages.length})</h2>
<table><thead><tr><th>URL</th><th>Status</th><th>Tytuł</th><th>H1</th><th>Słów</th><th>E</th><th>W</th><th>N</th></tr></thead><tbody>${pageRows}</tbody></table>
</div></body></html>`;
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
