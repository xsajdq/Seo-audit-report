import React, { useState } from 'react';
import { analyzePageContent, linkSuggestions, competitorAnalysis } from '../lib/api.js';

export default function PageAnalysisModal({ resultId, url, onClose }) {
  const [useApi, setUseApi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  async function run(withApi) {
    setLoading(true); setError(null);
    try {
      setData(await analyzePageContent(resultId, url, withApi));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  React.useEffect(() => { run(false); /* eslint-disable-next-line */ }, [url]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Analiza treści strony</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <a className="page-url" href={url} target="_blank" rel="noreferrer">{url}</a>

          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={useApi} onChange={(e) => { setUseApi(e.target.checked); run(e.target.checked); }} />
            <span>Wzbogać o darmowe API encji (Wikipedia PL + ConceptNet) — wymaga internetu</span>
          </label>

          {loading && <p className="muted">Analizuję treść{useApi ? ' + pobieram encje z API' : ''}…</p>}
          {error && <p className="kw-error">{error}</p>}

          {data && !loading && (
            <>
              <div className="meta-grid">
                <Meta label="Kompletność" value={`${data.completeness ?? '—'}%`} />
                <Meta label="Pokrycie podtematów" value={data.coverage.terms != null ? `${data.coverage.terms}%` : '—'} />
                <Meta label="Pokrycie encji" value={data.coverage.entities != null ? `${data.coverage.entities}%` : '—'} />
                <Meta label="Słów" value={data.wordCount} />
                <Meta label="Temat" value={data.topic || '—'} />
                <Meta label="Typ" value={data.type} />
              </div>

              {data.api?.used && (
                <p className="muted" style={{ fontSize: 13 }}>
                  {data.api.available ? `Wzbogacono z: ${data.api.sources.join(', ')}` : 'API niedostępne — użyto analizy lokalnej (sprawdź połączenie z internetem).'}
                </p>
              )}
              {data.note && <p className="note">{data.note}</p>}

              <MissingBlock title="Brakujące podtematy / frazy kluczowe" items={data.missing.terms} cls="bad" />
              <MissingBlock title="Brakujące encje (z treści tematu)" items={data.missing.entities} cls="bad" />
              {data.missing.apiTerms?.length > 0 && <MissingBlock title="Powiązane pojęcia (API) do uwzględnienia" items={data.missing.apiTerms} cls="warn" />}
              <MissingBlock title="Brakujące frazy wielowyrazowe" items={data.missing.phrases} cls="warn" />
              {data.missing.questions?.length > 0 && (
                <div className="analysis-block">
                  <h4>Pytania bez odpowiedzi na stronie</h4>
                  <ul className="q-list">{data.missing.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                </div>
              )}

              {data.recommendations.length > 0 && (
                <div className="analysis-block reco">
                  <h4>Rekomendacje</h4>
                  <ul>{data.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}

              <details className="analysis-block">
                <summary>Co strona już pokrywa</summary>
                <p><b>Encje:</b> {data.own.entities.join(', ') || '—'}</p>
                <p><b>Frazy:</b> {data.own.keyphrases.join(', ') || '—'}</p>
              </details>

              <SerpCompare resultId={resultId} url={url} />
              <LinkSuggestions resultId={resultId} url={url} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LinkSuggestions({ resultId, url }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try { setData(await linkSuggestions(resultId, url)); } catch { /* noop */ } finally { setLoading(false); }
  }
  return (
    <div className="analysis-block">
      <h4>Linkowanie wewnętrzne</h4>
      {!data && <button className="btn ghost tiny" onClick={run} disabled={loading}>{loading ? 'Szukam…' : 'Pokaż skąd podlinkować tę stronę'}</button>}
      {data && (
        <>
          <p className="muted" style={{ fontSize: 13 }}>Sugerowany anchor: <b>„{data.suggestedAnchor}"</b> · obecnych linków przychodzących: {data.existingInboundCount}</p>
          {data.opportunities.length === 0 ? <p className="muted">Brak nowych okazji linkowania.</p> : (
            <ul className="issue-pages">
              {data.opportunities.map((o, i) => (
                <li key={i}>z <a href={o.url} target="_blank" rel="noreferrer">{o.title || o.url}</a> <span className="muted">({o.relevance}% trafności)</span></li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function SerpCompare({ resultId, url }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  async function run() {
    setLoading(true); setErr(null);
    try {
      const apiKey = localStorage.getItem('serperKey') || '';
      if (!apiKey) { setErr('Brak klucza Serper.dev. Dodaj go w: Narzędzia treści → Vs konkurencja (SERP).'); setLoading(false); return; }
      setData(await competitorAnalysis(resultId, { url, apiKey }));
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  return (
    <div className="analysis-block">
      <h4>Vs konkurencja (TOP Google) — realne sprawdzenie</h4>
      {!data && <button className="btn ghost tiny" onClick={run} disabled={loading}>{loading ? 'Analizuję TOP Google…' : 'Porównaj z TOP wynikami Google'}</button>}
      {err && <p className="kw-error">{err}</p>}
      {data && data.scoring && (
        <>
          <p style={{ fontSize: 13 }}>Wynik vs TOP: <b className={`compl ${data.scoring.score >= 65 ? 'great' : data.scoring.score >= 50 ? 'ok' : 'bad'}`}>{data.scoring.grade} ({data.scoring.score}%)</b> · pokrycie terminów {data.scoring.coverage.terms}% · {data.scoring.wordCount}/{data.scoring.targetWords} słów</p>
          {data.scoring.missingTerms.length > 0 && <div className="term-chips">{data.scoring.missingTerms.slice(0, 20).map((t, i) => <span key={i} className="term-chip bad">{t}</span>)}</div>}
        </>
      )}
      {data && !data.scoring && <p className="muted">Zbudowano wzorzec, ale nie udało się pobrać treści tej strony.</p>}
    </div>
  );
}

function Meta({ label, value }) {
  return <div className="meta-item"><span>{label}</span><b>{value}</b></div>;
}
function MissingBlock({ title, items, cls }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="analysis-block">
      <h4>{title} <span className="muted">({items.length})</span></h4>
      <div className="term-chips">
        {items.map((t, i) => <span key={i} className={`term-chip ${cls}`}>{t}</span>)}
      </div>
    </div>
  );
}
