import React, { useMemo, useState } from 'react';
import ScoreGauge from './ScoreGauge.jsx';
import PageDetail from './PageDetail.jsx';
import KeywordMapper from './KeywordMapper.jsx';
import KnowledgeGraph from './KnowledgeGraph.jsx';

const SEV_LABEL = { error: 'Błędy', warning: 'Ostrzeżenia', notice: 'Uwagi' };

export default function Results({ result, resultId, onReset }) {
  const [tab, setTab] = useState('overview');
  const [selectedPage, setSelectedPage] = useState(null);

  const aggregatedIssues = useMemo(() => aggregateIssues(result), [result]);
  const host = (() => { try { return new URL(result.meta.startUrl).hostname; } catch { return result.meta.startUrl; } })();

  return (
    <div className="results">
      <div className="results-head">
        <div>
          <h2>Wynik audytu — {host}</h2>
          <p className="muted">{result.summary.totals.pages} stron · {new Date(result.meta.generatedAt).toLocaleString('pl-PL')}{result.meta.cancelled ? ' · przerwano' : ''}</p>
        </div>
        <div className="actions">
          <a className="btn ghost" href={`/api/result/${resultId}/export?format=html`} target="_blank" rel="noreferrer">Raport HTML</a>
          <a className="btn ghost" href={`/api/result/${resultId}/export?format=csv`}>CSV</a>
          <a className="btn ghost" href={`/api/result/${resultId}/export?format=json`}>JSON</a>
          <button className="btn" onClick={onReset}>Nowy audyt</button>
        </div>
      </div>

      <div className="overview-grid">
        <div className="card gauge-card">
          <ScoreGauge score={result.summary.score} grade={result.summary.grade} />
          <div className="totals">
            <Total n={result.summary.totals.error} label="Błędy" cls="error" />
            <Total n={result.summary.totals.warning} label="Ostrzeżenia" cls="warning" />
            <Total n={result.summary.totals.notice} label="Uwagi" cls="notice" />
          </div>
        </div>
        <div className="card site-stats">
          <h3>Witryna</h3>
          <ul>
            <li><span>Przeskanowane strony</span><b>{result.site.crawled}</b></li>
            <li><span>Strony indeksowalne</span><b>{result.site.indexable}</b></li>
            <li><span>Zduplikowane tytuły</span><b className={result.site.duplicateTitles ? 'warn' : ''}>{result.site.duplicateTitles}</b></li>
            <li><span>Zduplikowane opisy</span><b className={result.site.duplicateDescriptions ? 'warn' : ''}>{result.site.duplicateDescriptions}</b></li>
            <li><span>Strony osierocone</span><b className={result.site.orphanPages ? 'warn' : ''}>{result.site.orphanPages}</b></li>
            <li><span>Linki do błędów (4xx/5xx)</span><b className={result.site.brokenInternalTargets ? 'warn' : ''}>{result.site.brokenInternalTargets ?? 0}</b></li>
            <li><span>Linki do przekierowań</span><b className={result.site.redirectInternalTargets ? 'warn' : ''}>{result.site.redirectInternalTargets ?? 0}</b></li>
            <li><span>Near-duplicate</span><b className={result.site.nearDuplicates ? 'warn' : ''}>{result.site.nearDuplicates ?? 0}</b></li>
            <li><span>Maks. głębokość kliknięć</span><b className={result.site.maxDepth >= 4 ? 'warn' : ''}>{result.site.maxDepth ?? '—'}</b></li>
            <li><span>robots.txt</span><b>{result.robots.exists ? '✓' : '✗'}</b></li>
            <li><span>Sitemap</span><b>{result.sitemaps.length ? '✓' : '✗'}</b></li>
            <li><span>llms.txt (GEO/AI)</span><b className={result.llmsTxt?.exists ? '' : 'warn'}>{result.llmsTxt?.exists ? '✓' : '✗'}</b></li>
          </ul>
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Kategorie</button>
        <button className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>Problemy ({aggregatedIssues.length})</button>
        <button className={tab === 'pages' ? 'active' : ''} onClick={() => setTab('pages')}>Strony ({result.pages.length})</button>
        <button className={tab === 'site' ? 'active' : ''} onClick={() => setTab('site')}>Analiza witryny</button>
        <button className={tab === 'keywords' ? 'active' : ''} onClick={() => setTab('keywords')}>Słowa kluczowe</button>
        <button className={tab === 'graph' ? 'active' : ''} onClick={() => setTab('graph')}>Graf wiedzy</button>
      </div>

      {tab === 'overview' && <Categories categories={result.summary.categories} />}
      {tab === 'issues' && <IssuesList issues={aggregatedIssues} onSelectPage={setSelectedPage} pages={result.pages} />}
      {tab === 'pages' && <PagesTable pages={result.pages} onSelect={setSelectedPage} />}
      {tab === 'site' && <SiteAnalysis result={result} />}
      {tab === 'keywords' && <KeywordMapper resultId={resultId} />}
      {tab === 'graph' && <KnowledgeGraph resultId={resultId} />}

      {selectedPage && (
        <PageDetail page={selectedPage} onClose={() => setSelectedPage(null)} />
      )}
    </div>
  );
}

function Total({ n, label, cls }) {
  return <div className={`total ${cls}`}><b>{n}</b><span>{label}</span></div>;
}

function Categories({ categories }) {
  const entries = Object.entries(categories).sort((a, b) => a[1].score - b[1].score);
  return (
    <div className="cat-grid">
      {entries.map(([key, c]) => (
        <div className="card cat" key={key}>
          <div className="cat-head">
            <span>{c.label}</span>
            <b className={scoreCls(c.score)}>{c.score}</b>
          </div>
          <div className="cat-bar"><div className={`fill ${scoreCls(c.score)}`} style={{ width: `${c.score}%` }} /></div>
          <div className="cat-counts">
            {c.errors > 0 && <span className="error">{c.errors} błędów</span>}
            {c.warnings > 0 && <span className="warning">{c.warnings} ostrz.</span>}
            {c.notices > 0 && <span className="notice">{c.notices} uwag</span>}
            {c.errors + c.warnings + c.notices === 0 && <span className="ok">Brak problemów ✓</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function IssuesList({ issues, onSelectPage, pages }) {
  const [filter, setFilter] = useState('all');
  const filtered = filter === 'all' ? issues : issues.filter((i) => i.severity === filter);
  return (
    <div className="card">
      <div className="filter-row">
        {['all', 'error', 'warning', 'notice'].map((f) => (
          <button key={f} className={filter === f ? 'chip active' : 'chip'} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Wszystkie' : SEV_LABEL[f]}
          </button>
        ))}
      </div>
      <div className="issues">
        {filtered.map((i, idx) => (
          <details className="issue" key={idx}>
            <summary>
              <span className={`badge ${i.severity}`}>{i.severity}</span>
              <span className="issue-title">{i.title}</span>
              <span className="issue-count">{i.count} {i.count === 1 ? 'strona' : 'stron'}</span>
            </summary>
            <div className="issue-body">
              <p>{i.detail}</p>
              <ul className="issue-pages">
                {i.pages.slice(0, 12).map((u, k) => {
                  const p = pages.find((pp) => pp.url === u);
                  return (
                    <li key={k}>
                      <button className="linklike" onClick={() => p && onSelectPage(p)}>{u}</button>
                    </li>
                  );
                })}
                {i.pages.length > 12 && <li className="muted">…i {i.pages.length - 12} więcej</li>}
              </ul>
            </div>
          </details>
        ))}
        {filtered.length === 0 && <p className="muted center">Brak problemów w tej kategorii 🎉</p>}
      </div>
    </div>
  );
}

function PagesTable({ pages, onSelect }) {
  const [sort, setSort] = useState('issues');
  const [q, setQ] = useState('');
  const sorted = useMemo(() => {
    let list = pages.filter((p) => p.url.toLowerCase().includes(q.toLowerCase()));
    const score = (p) => p.issueCounts.error * 100 + p.issueCounts.warning * 10 + p.issueCounts.notice;
    if (sort === 'issues') list = [...list].sort((a, b) => score(b) - score(a));
    else if (sort === 'status') list = [...list].sort((a, b) => b.status - a.status);
    else if (sort === 'time') list = [...list].sort((a, b) => b.responseTimeMs - a.responseTimeMs);
    return list;
  }, [pages, sort, q]);

  return (
    <div className="card">
      <div className="filter-row">
        <input className="search" placeholder="Filtruj po URL…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="issues">Sortuj: problemy</option>
          <option value="status">Sortuj: status</option>
          <option value="time">Sortuj: czas odpowiedzi</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="pages-table">
          <thead>
            <tr><th>URL</th><th>Status</th><th>Tytuł</th><th>H1</th><th>Słów</th><th>ms</th><th>E/W/N</th></tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={i} onClick={() => onSelect(p)} className="clickable">
                <td className="url-cell">{p.url}</td>
                <td><span className={`code s${Math.floor((p.status || 0) / 100)}`}>{p.status || '—'}</span></td>
                <td className="title-cell">{p.seo?.title || <span className="muted">— brak —</span>}</td>
                <td>{p.seo?.h1Count ?? '—'}</td>
                <td>{p.seo?.wordCount ?? '—'}</td>
                <td>{p.responseTimeMs ?? '—'}</td>
                <td className="ewn">
                  <span className="error">{p.issueCounts.error}</span>/
                  <span className="warning">{p.issueCounts.warning}</span>/
                  <span className="notice">{p.issueCounts.notice}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SiteAnalysis({ result }) {
  return (
    <div className="card">
      <h3>Analiza całej witryny</h3>
      {result.siteIssues.length === 0 && <p className="muted">Brak problemów na poziomie witryny 🎉</p>}
      <div className="issues">
        {result.siteIssues.map((i, idx) => (
          <details className="issue" key={idx}>
            <summary>
              <span className={`badge ${i.severity}`}>{i.severity}</span>
              <span className="issue-title">{i.title}</span>
            </summary>
            <div className="issue-body">
              <p>{i.detail}</p>
              {i.affected && (
                <ul className="issue-pages">
                  {i.affected.map((u, k) => <li key={k}>{u}</li>)}
                </ul>
              )}
            </div>
          </details>
        ))}
      </div>
      {result.site.topPages && result.site.topPages.length > 0 && (
        <>
          <h3 style={{ marginTop: 24 }}>Najmocniejsze strony (wewnętrzny PageRank)</h3>
          <ul className="kv">
            {result.site.topPages.map((p, i) => (
              <li key={i}><span>{p.url}</span><b>{p.pr}/100</b></li>
            ))}
          </ul>
        </>
      )}
      <h3 style={{ marginTop: 24 }}>Sitemap & robots</h3>
      <ul className="kv">
        <li><span>robots.txt</span><b>{result.robots.exists ? result.robots.url : 'nie znaleziono'}</b></li>
        {result.sitemaps.map((s, i) => <li key={i}><span>Sitemap</span><b>{s.url}</b></li>)}
      </ul>
    </div>
  );
}

function aggregateIssues(result) {
  const map = new Map();
  for (const p of result.pages) {
    for (const i of p.issues) {
      const k = `${i.severity}|${i.title}`;
      if (!map.has(k)) map.set(k, { ...i, count: 0, pages: [] });
      const e = map.get(k);
      e.count++;
      e.pages.push(p.url);
    }
  }
  const order = { error: 0, warning: 1, notice: 2 };
  return [...map.values()].sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
}

function scoreCls(s) {
  if (s >= 90) return 'great';
  if (s >= 75) return 'good';
  if (s >= 60) return 'ok';
  if (s >= 40) return 'poor';
  return 'bad';
}
