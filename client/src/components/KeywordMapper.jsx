import React, { useState } from 'react';
import { matchKeywords } from '../lib/api.js';

export default function KeywordMapper({ resultId }) {
  const [text, setText] = useState('');
  const [brand, setBrand] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  async function run() {
    const keywords = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (keywords.length === 0) {
      setError('Wklej co najmniej jedno słowo kluczowe (jedno na linię).');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await matchKeywords(resultId, keywords, brand.trim());
      setData(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <h3>Dopasowanie słów kluczowych do podstron</h3>
      <p className="muted">
        Wklej listę słów kluczowych (jedno na linię). Aplikacja dobierze najtrafniejszą istniejącą podstronę,
        a dla fraz bez dobrej strony zaproponuje utworzenie nowej — wraz z gotowym meta title i description
        wg schematu <code>główne słowo - dodatkowe frazy | brand</code>.
      </p>

      <div className="kw-inputs">
        <label className="field">
          <span>Słowa kluczowe (jedno na linię)</span>
          <textarea
            className="kw-textarea"
            rows={8}
            placeholder={'buty trekkingowe męskie\nbuty w góry damskie\nplecak turystyczny 30l\n…'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Nazwa marki (brand)</span>
          <input type="text" placeholder="np. GórskiSklep" value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
      </div>

      <button className="btn primary" onClick={run} disabled={loading}>
        {loading ? 'Analizuję…' : 'Dopasuj słowa kluczowe →'}
      </button>
      {error && <p className="kw-error">{error}</p>}

      {data && <KeywordResults data={data} />}
    </div>
  );
}

function KeywordResults({ data }) {
  return (
    <div className="kw-results">
      <div className="kw-summary">
        <Stat n={data.summary.keywords} label="Słów kluczowych" />
        <Stat n={data.summary.matched} label="Dopasowanych" cls="good" />
        <Stat n={data.summary.pagesTargeted} label="Podstron docelowych" />
        <Stat n={data.summary.unmatched} label="Bez strony" cls="warn" />
        <Stat n={data.summary.newPagesSuggested} label="Nowych stron (sugestia)" cls="warn" />
      </div>

      {data.summary.intents && (
        <div className="kw-intents">
          <span className="muted">Intencje:</span>
          {Object.entries(data.summary.intents).filter(([, n]) => n > 0).map(([k, n]) => (
            <span key={k} className={`intent-tag i-${k}`}>{k}: {n}</span>
          ))}
        </div>
      )}

      <h4>Przypisania do istniejących podstron</h4>
      {data.assignments.length === 0 && <p className="muted">Brak dopasowań do istniejących stron.</p>}
      {data.assignments.map((a, i) => (
        <PageAssignment key={i} a={a} />
      ))}

      {data.newPages.length > 0 && (
        <>
          <h4 style={{ marginTop: 24 }}>Propozycje nowych podstron</h4>
          <p className="muted">Te frazy nie mają dobrej strony docelowej — warto stworzyć dedykowane podstrony.</p>
          {data.newPages.map((p, i) => (
            <NewPageCard key={i} p={p} />
          ))}
        </>
      )}

      {data.unmatched.length > 0 && (
        <details className="kw-unmatched">
          <summary>Wszystkie frazy bez dobrego dopasowania ({data.unmatched.length})</summary>
          <ul>
            {data.unmatched.map((u, i) => (
              <li key={i}>
                <b>{u.keyword}</b>
                {u.intent && <span className={`intent-tag i-${u.intent}`}>{u.intent}</span>}
                {u.local && <span className="intent-tag i-lokalna">lokalna</span>}
                <span className="muted"> — najlepszy wynik: {u.bestScore}/100{u.bestPage ? ` (${u.bestPage})` : ''}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PageAssignment({ a }) {
  return (
    <div className="kw-page">
      <a className="kw-url" href={a.url} target="_blank" rel="noreferrer">{a.url}</a>
      <div className="kw-chips">
        {a.keywords.map((k, i) => (
          <span className={`chip ${i === 0 ? 'kw-primary' : ''}`} key={i} title={`wynik: ${k.score}/100 · ${k.intent}${k.local ? ' · lokalna' : ''}`}>
            {i === 0 ? '★ ' : ''}{k.keyword}
            <em className={`intent-dot i-${k.intent}`} />
            {k.local && <em className="intent-dot i-lokalna" />}
          </span>
        ))}
      </div>
      <Suggestion label="Sugerowany Title" value={a.suggestedTitle} current={a.currentTitle} />
      <Suggestion label="Sugerowany Description" value={a.suggestedDescription} current={a.currentDescription} />
    </div>
  );
}

function NewPageCard({ p }) {
  return (
    <div className="kw-page kw-new">
      <div className="kw-slug">Proponowany URL: <code>{p.suggestedSlug}</code></div>
      <div className="kw-chips">
        <span className="chip kw-primary">★ {p.primary}</span>
        {p.additional.map((k, i) => (
          <span className="chip" key={i}>{k}</span>
        ))}
      </div>
      <Suggestion label="Title" value={p.suggestedTitle} />
      <Suggestion label="Description" value={p.suggestedDescription} />
    </div>
  );
}

function Suggestion({ label, value, current }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }
  return (
    <div className="kw-suggestion">
      <div className="kw-sug-head">
        <span className="kw-sug-label">{label} <em>({value.length} zn.)</em></span>
        <button className="btn ghost tiny" onClick={copy}>{copied ? 'Skopiowano ✓' : 'Kopiuj'}</button>
      </div>
      <div className="kw-sug-value">{value}</div>
      {current && current !== value && (
        <div className="kw-current">obecnie: <span>{current}</span></div>
      )}
    </div>
  );
}

function Stat({ n, label, cls }) {
  return (
    <div className={`kw-stat ${cls || ''}`}>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  );
}
