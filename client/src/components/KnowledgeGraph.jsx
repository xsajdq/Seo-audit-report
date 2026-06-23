import React, { useEffect, useState } from 'react';
import { getKnowledgeGraph, analyzeContentGap } from '../lib/api.js';
import TopicGraphView from './TopicGraphView.jsx';

export default function KnowledgeGraph({ resultId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getKnowledgeGraph(resultId).then(setData).catch((e) => setError(e.message));
  }, [resultId]);

  if (error) return <div className="card"><p className="kw-error">{error}</p></div>;
  if (!data) return <div className="card"><p className="muted">Buduję graf wiedzy…</p></div>;

  const selTopic = selected != null ? data.topics.find((t) => t.id === selected) : null;

  return (
    <div className="card">
      <h3>Tematyczny graf wiedzy</h3>
      <p className="muted">
        Mapa pokrycia tematycznego witryny: węzły to tematy (klastry treści), połączenia to linkowanie wewnętrzne.
        Czerwona przerywana obwódka oznacza temat z luką pokrycia (płytki / bez strony filarowej / słaby interlinking).
      </p>

      <div className="kw-summary">
        <Stat n={data.stats.topics} label="Tematów" />
        <Stat n={data.stats.topicalPages} label="Stron tematycznych" />
        <Stat n={`${data.stats.avgCoverage}%`} label="Śr. pokrycie" />
        <Stat n={data.stats.wellCovered} label="Dobrze pokrytych" cls="good" />
        <Stat n={data.stats.gapsCount} label="Luk" cls="warn" />
        <Stat n={data.stats.pillarsMissing} label="Brak pillara" cls="warn" />
      </div>

      <div className="type-chips">
        {data.pageTypes.map((t) => (
          <span key={t.type} className="type-chip"><b>{t.count}</b> {t.label}</span>
        ))}
      </div>

      <TopicGraphView nodes={data.nodes} edges={data.edges} onSelect={setSelected} />

      {selTopic && (
        <div className="topic-detail">
          <div className="topic-detail-head">
            <h4>Temat: {selTopic.label}</h4>
            <button className="btn ghost tiny" onClick={() => setSelected(null)}>Zamknij</button>
          </div>
          <div className="kw-summary">
            <Stat n={`${selTopic.coverage}%`} label="Pokrycie" />
            <Stat n={selTopic.size} label="Stron" />
            <Stat n={selTopic.avgWords} label="Śr. słów" />
            <Stat n={selTopic.hasPillar ? 'Tak' : 'Nie'} label="Pillar" cls={selTopic.hasPillar ? 'good' : 'warn'} />
            <Stat n={`${selTopic.interlinkRatio}%`} label="Interlinking" />
          </div>
          {selTopic.expectedTerms?.length > 0 && (
            <p className="expected-terms"><b>Temat powinien pokrywać:</b> {selTopic.expectedTerms.join(', ')}</p>
          )}
          <ul className="topic-pages">
            {selTopic.pages.map((p, i) => (
              <li key={i}>
                <span className={`type-badge t-${p.type}`}>{p.typeLabel}</span>
                <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a>
                <span className="muted"> · {p.words} słów</span>
                {p.completeness != null && (
                  <span className={`compl ${complCls(p.completeness)}`}> · kompletność {p.completeness}%</span>
                )}
                {p.missing?.length > 0 && (
                  <div className="missing-terms">Brakuje: {p.missing.join(', ')}
                    {p.missingQuestions?.length > 0 && <> · <i>pytania: {p.missingQuestions.join(' | ')}</i></>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h4 style={{ marginTop: 20 }}>Tematy i pokrycie</h4>
      <div className="topic-list">
        {data.topics.map((t) => (
          <div key={t.id} className={`topic-row ${t.coverage < 50 ? 'gap' : ''}`} onClick={() => setSelected(t.id)}>
            <div className="topic-row-head">
              <span className="topic-name">{t.label}</span>
              <span className={`cov ${covCls(t.coverage)}`}>{t.coverage}%</span>
            </div>
            <div className="cat-bar"><div className={`fill ${covCls(t.coverage)}`} style={{ width: `${t.coverage}%` }} /></div>
            <div className="topic-meta">
              {Object.entries(t.byType).map(([ty, n]) => <span key={ty} className={`type-badge t-${ty}`}>{n}× {ty}</span>)}
              {!t.hasPillar && t.size >= 3 && <span className="gap-badge">brak pillara</span>}
              {t.interlinkRatio < 50 && t.size >= 3 && <span className="gap-badge">słaby interlinking</span>}
            </div>
          </div>
        ))}
      </div>

      {data.gaps.length > 0 && (
        <>
          <h4 style={{ marginTop: 20 }}>Wykryte luki (wewnętrzne)</h4>
          <div className="issues">
            {data.gaps.map((g, i) => (
              <div className="issue-flat" key={i}>
                <span className={`badge ${g.severity}`}>{g.type}</span>
                <div><b>{g.topic}</b><p>{g.detail}</p></div>
              </div>
            ))}
          </div>
        </>
      )}

      <CompetitorGap resultId={resultId} />
    </div>
  );
}

function CompetitorGap({ resultId }) {
  const [domains, setDomains] = useState('');
  const [maxPages, setMaxPages] = useState(40);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gap, setGap] = useState(null);

  async function run() {
    const competitors = domains.split(/[\s,\n]+/).map((s) => s.trim()).filter(Boolean);
    if (competitors.length === 0) { setError('Podaj co najmniej jedną domenę konkurenta.'); return; }
    setError(null); setLoading(true); setGap(null);
    try {
      setGap(await analyzeContentGap(resultId, competitors, maxPages));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <div className="competitor-box">
      <h4>Analiza luk vs konkurencja</h4>
      <p className="muted">Podaj domeny konkurentów (po przecinku lub w nowych liniach). Aplikacja przeskanuje ich blogi/strony i wskaże tematy, których u Ciebie brakuje lub są słabiej rozwinięte.</p>
      <div className="kw-inputs">
        <label className="field">
          <span>Domeny konkurentów (maks. 4)</span>
          <textarea className="kw-textarea" rows={3} placeholder={'konkurent1.pl\nkonkurent2.pl'} value={domains} onChange={(e) => setDomains(e.target.value)} />
        </label>
        <label className="field">
          <span>Stron na konkurenta: {maxPages}</span>
          <input type="range" min="15" max="120" value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} />
        </label>
      </div>
      <button className="btn primary" onClick={run} disabled={loading}>
        {loading ? 'Skanuję konkurencję… (to może chwilę potrwać)' : 'Znajdź luki treściowe →'}
      </button>
      {error && <p className="kw-error">{error}</p>}

      {gap && (
        <div className="kw-results">
          <div className="kw-summary">
            <Stat n={gap.summary.missing} label="Brakujące tematy" cls="warn" />
            <Stat n={gap.summary.thinner} label="Słabiej rozwinięte" cls="warn" />
            {gap.competitors.map((c, i) => <Stat key={i} n={c.blogPages} label={`${c.domain} (wpisy)`} />)}
          </div>
          {gap.gaps.length === 0 && <p className="muted">Nie wykryto istotnych luk — Twoje pokrycie tematyczne jest konkurencyjne 🎉</p>}
          {gap.gaps.map((g, i) => (
            <div className={`kw-page ${g.kind === 'missing' ? 'kw-new' : ''}`} key={i}>
              <div className="kw-slug">
                <span className={`gap-badge ${g.kind}`}>{g.kind === 'missing' ? 'BRAK U CIEBIE' : 'SŁABIEJ ROZWINIĘTE'}</span>
                <b> {g.topic}</b>
                <span className="muted"> · u: {g.competitors.join(', ')}</span>
              </div>
              {g.subtopics?.length > 0 && (
                <p className="expected-terms"><b>Podtematy do pokrycia:</b> {g.subtopics.join(', ')}</p>
              )}
              <ul className="issue-pages">
                {g.examples.map((e, k) => (
                  <li key={k}><a href={e.url} target="_blank" rel="noreferrer">{e.title}</a> <span className="muted">({e.type})</span></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ n, label, cls }) {
  return <div className={`kw-stat ${cls || ''}`}><b>{n}</b><span>{label}</span></div>;
}
function covCls(s) {
  if (s >= 70) return 'great';
  if (s >= 50) return 'ok';
  return 'bad';
}
function complCls(s) {
  if (s >= 80) return 'great';
  if (s >= 50) return 'ok';
  return 'bad';
}
