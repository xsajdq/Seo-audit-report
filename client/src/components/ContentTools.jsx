import React, { useState } from 'react';
import { generateContentPlan, downloadContentPlanXlsx, generateBrief, scoreDraft, expandKeyword } from '../lib/api.js';

export default function ContentTools({ resultId }) {
  const [tab, setTab] = useState('plan');
  return (
    <div className="card">
      <div className="subtabs">
        {[['plan', '📅 Plan treści'], ['brief', '📝 Brief'], ['editor', '✍️ Edytor treści'], ['expand', '🔍 Rozszerzanie fraz']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'plan' && <PlanPanel resultId={resultId} />}
      {tab === 'brief' && <BriefPanel resultId={resultId} />}
      {tab === 'editor' && <EditorPanel resultId={resultId} />}
      {tab === 'expand' && <ExpandPanel />}
    </div>
  );
}

function PlanPanel({ resultId }) {
  const [kw, setKw] = useState('');
  const [brand, setBrand] = useState('');
  const [months, setMonths] = useState(6);
  const [perMonth, setPerMonth] = useState(4);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const body = () => ({ keywords: kw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean), brand: brand.trim(), months, perMonth });
  async function run() {
    setLoading(true); setErr(null);
    try { setData(await generateContentPlan(resultId, body())); } catch (e) { setErr(e.message); } finally { setLoading(false); }
  }

  return (
    <div>
      <h3>Plan treści (kalendarz redakcyjny)</h3>
      <p className="muted">Wklej frazy docelowe (opcjonalnie). Plan połączy je z lukami z grafu wiedzy i niekompletnymi wpisami, ustawi priorytety i rozłoży na miesiące.</p>
      <div className="kw-inputs">
        <label className="field"><span>Frazy docelowe (jedna na linię, opcjonalne)</span>
          <textarea className="kw-textarea" rows={5} value={kw} onChange={(e) => setKw(e.target.value)} placeholder={'kredyt hipoteczny kalkulator\nlokata terminowa\n…'} /></label>
        <div>
          <label className="field"><span>Marka</span><input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
          <label className="field"><span>Miesięcy: {months}</span><input type="range" min="1" max="12" value={months} onChange={(e) => setMonths(+e.target.value)} /></label>
          <label className="field"><span>Treści/miesiąc: {perMonth}</span><input type="range" min="1" max="12" value={perMonth} onChange={(e) => setPerMonth(+e.target.value)} /></label>
        </div>
      </div>
      <div className="dl-buttons">
        <button className="btn primary" onClick={run} disabled={loading}>{loading ? 'Generuję…' : 'Wygeneruj plan →'}</button>
        {data && <button className="btn ghost" onClick={() => downloadContentPlanXlsx(resultId, body())}>⬇ Pobierz plan (XLSX)</button>}
      </div>
      {err && <p className="kw-error">{err}</p>}
      {data && (
        <div className="kw-results">
          <div className="kw-summary">
            <S n={data.summary.total} l="Pozycji" /><S n={data.summary.nowe} l="Nowe treści" cls="good" /><S n={data.summary.rozbudowa} l="Do rozbudowy" cls="warn" />
          </div>
          {Object.entries(data.byMonth).map(([m, items]) => items.length > 0 && (
            <div key={m} className="plan-month">
              <h4>Miesiąc {m} ({items.length})</h4>
              {items.map((it, i) => (
                <div key={i} className="plan-item">
                  <div><span className={`gap-badge ${it.action.startsWith('Nowa') ? 'missing' : 'thinner'}`}>{it.action}</span> <b>{it.title || it.keyword}</b></div>
                  <div className="muted" style={{ fontSize: 13 }}>{it.type} · prio {it.priority} · {it.cluster} {it.url ? `· ${it.url}` : ''}</div>
                  <div style={{ fontSize: 13 }}>{it.reason}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefPanel({ resultId }) {
  const [keyword, setKeyword] = useState('');
  const [url, setUrl] = useState('');
  const [brand, setBrand] = useState('');
  const [useSuggest, setUseSuggest] = useState(false);
  const [useApi, setUseApi] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function run() {
    setLoading(true); setErr(null);
    try { setData(await generateBrief(resultId, { keyword: keyword.trim(), url: url.trim(), brand: brand.trim(), useSuggest, useApi })); }
    catch (e) { setErr(e.message); setData(null); } finally { setLoading(false); }
  }
  const copy = (t) => navigator.clipboard?.writeText(t);

  return (
    <div>
      <h3>Generator briefu contentowego</h3>
      <p className="muted">Podaj frazę docelową (dla nowej treści) lub adres istniejącej strony. Brief zawiera outline, pytania, terminy/encje, długość, title/meta i linki wewnętrzne.</p>
      <div className="kw-inputs">
        <label className="field"><span>Fraza docelowa</span><input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="np. kredyt hipoteczny kalkulator" /></label>
        <label className="field"><span>…lub adres istniejącej strony</span><input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
      </div>
      <label className="field"><span>Marka</span><input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={useSuggest} onChange={(e) => setUseSuggest(e.target.checked)} /><span>Dodaj pytania z Google Suggest (wymaga internetu)</span></label>
      <label className="check"><input type="checkbox" checked={useApi} onChange={(e) => setUseApi(e.target.checked)} /><span>Dodaj encje z Wikipedia/ConceptNet (wymaga internetu)</span></label>
      <button className="btn primary" onClick={run} disabled={loading}>{loading ? 'Generuję brief…' : 'Wygeneruj brief →'}</button>
      {err && <p className="kw-error">{err}</p>}
      {data && (
        <div className="kw-results brief">
          <div className="meta-grid">
            <Meta l="Fraza" v={data.keyword} /><Meta l="Temat" v={data.topic || '—'} /><Meta l="Docelowo słów" v={`~${data.targetWords}`} />
          </div>
          <Sug label="Sugerowany Title" value={data.suggestedTitle} onCopy={copy} />
          <Sug label="Sugerowany Description" value={data.suggestedDescription} onCopy={copy} />
          <Sug label="Slug" value={data.suggestedSlug} onCopy={copy} />
          <h4>Outline (struktura nagłówków)</h4>
          <ul className="outline">{data.outline.map((o, i) => <li key={i} className={`ol-${o.level}`}><b>{o.level}</b> {o.text}</li>)}</ul>
          {data.questions.length > 0 && (<><h4>Pytania do odpowiedzenia</h4><ul className="q-list">{data.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>)}
          <h4>Terminy do użycia ({data.termsToInclude.length})</h4>
          <div className="term-chips">{data.termsToInclude.map((t, i) => <span key={i} className="term-chip">{t}</span>)}</div>
          {data.entities.length > 0 && (<><h4>Encje (API)</h4><div className="term-chips">{data.entities.map((t, i) => <span key={i} className="term-chip warn">{t}</span>)}</div></>)}
          {data.internalLinks.length > 0 && (<><h4>Linki wewnętrzne do dodania</h4><ul className="issue-pages">{data.internalLinks.map((l, i) => <li key={i}>z <a href={l.from} target="_blank" rel="noreferrer">{l.from}</a> → anchor: „{l.anchor}" ({l.relevance}%)</li>)}</ul></>)}
        </div>
      )}
    </div>
  );
}

function EditorPanel({ resultId }) {
  const [keyword, setKeyword] = useState('');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try { setData(await scoreDraft(resultId, { text, keyword: keyword.trim(), url: url.trim() })); } catch { /* noop */ } finally { setLoading(false); }
  }
  return (
    <div>
      <h3>Edytor treści — ocena pokrycia tematu</h3>
      <p className="muted">Wklej treść (draft), podaj frazę lub adres docelowy i sprawdź ocenę A–F względem profilu tematu oraz brakujące terminy/pytania.</p>
      <div className="kw-inputs">
        <label className="field"><span>Fraza docelowa</span><input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} /></label>
        <label className="field"><span>…lub adres strony</span><input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></label>
      </div>
      <textarea className="kw-textarea" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Wklej lub napisz treść…" />
      <button className="btn primary" onClick={run} disabled={loading || !text.trim()}>{loading ? 'Oceniam…' : 'Oceń treść →'}</button>
      {data && (
        <div className="kw-results">
          <div className="editor-score">
            <div className={`grade-badge g-${data.grade}`}>{data.grade}</div>
            <div className="kw-summary" style={{ margin: 0 }}>
              <S n={`${data.score}%`} l="Wynik" /><S n={`${data.wordCount}/${data.targetWords}`} l="Słów / cel" />
              <S n={data.coverage.terms != null ? `${data.coverage.terms}%` : '—'} l="Pokrycie terminów" />
              <S n={data.topic || '—'} l="Temat" />
            </div>
          </div>
          {data.note && <p className="note">{data.note}</p>}
          {data.missingTerms.length > 0 && (<><h4>Brakujące terminy ({data.missingTerms.length})</h4><div className="term-chips">{data.missingTerms.map((t, i) => <span key={i} className="term-chip bad">{t}</span>)}</div></>)}
          {data.missingQuestions.length > 0 && (<><h4>Pytania do poruszenia</h4><ul className="q-list">{data.missingQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></>)}
        </div>
      )}
    </div>
  );
}

function ExpandPanel() {
  const [seed, setSeed] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  async function run() {
    setLoading(true); setErr(null);
    try { const d = await expandKeyword(seed.trim(), true); setData(d); if (!d.available) setErr('Brak odpowiedzi z Google Suggest (sprawdź internet).'); }
    catch (e) { setErr(e.message); } finally { setLoading(false); }
  }
  return (
    <div>
      <h3>Rozszerzanie fraz (Google Suggest)</h3>
      <p className="muted">Wpisz frazę bazową — narzędzie pobierze dziesiątki podpowiedzi i pytań „ludzie też pytają" (darmowo, bez klucza API).</p>
      <div className="dl-buttons">
        <input className="search" style={{ flex: 1 }} value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="np. kredyt hipoteczny" onKeyDown={(e) => e.key === 'Enter' && run()} />
        <button className="btn primary" onClick={run} disabled={loading || !seed.trim()}>{loading ? 'Pobieram…' : 'Rozszerz →'}</button>
      </div>
      {err && <p className="kw-error">{err}</p>}
      {data && data.available && (
        <div className="kw-results">
          <div className="kw-summary"><S n={data.total} l="Podpowiedzi" /><S n={data.questions.length} l="Pytań" /></div>
          {data.questions.length > 0 && (<><h4>Pytania (People Also Ask)</h4><ul className="q-list">{data.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>)}
          <h4>Podpowiedzi</h4>
          <div className="term-chips">{data.suggestions.map((s, i) => <span key={i} className="term-chip">{s}</span>)}</div>
        </div>
      )}
    </div>
  );
}

function S({ n, l, cls }) { return <div className={`kw-stat ${cls || ''}`}><b>{n}</b><span>{l}</span></div>; }
function Meta({ l, v }) { return <div className="meta-item"><span>{l}</span><b>{v}</b></div>; }
function Sug({ label, value, onCopy }) {
  return (
    <div className="kw-suggestion">
      <div className="kw-sug-head"><span className="kw-sug-label">{label} <em>({String(value).length} zn.)</em></span><button className="btn ghost tiny" onClick={() => onCopy(value)}>Kopiuj</button></div>
      <div className="kw-sug-value">{value}</div>
    </div>
  );
}
