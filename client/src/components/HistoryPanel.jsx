import React, { useEffect, useState } from 'react';
import { getHistory, loadHistoryAudit, compareHistory, deleteHistory } from '../lib/api.js';

export default function HistoryPanel({ onOpen }) {
  const [data, setData] = useState(null);
  const [sel, setSel] = useState([]);
  const [cmp, setCmp] = useState(null);

  const refresh = () => getHistory().then(setData);
  useEffect(() => { refresh(); }, []);

  if (!data || data.audits.length === 0) return null;

  async function open(id) {
    const r = await loadHistoryAudit(id);
    onOpen(r, id);
  }
  function toggle(id) {
    setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-2));
  }
  async function doCompare() {
    if (sel.length === 2) setCmp(await compareHistory(sel[0], sel[1]));
  }
  async function remove(id) {
    await deleteHistory(id); setSel((s) => s.filter((x) => x !== id)); setCmp(null); refresh();
  }

  return (
    <div className="card history">
      <div className="history-head">
        <h2>Historia audytów ({data.audits.length})</h2>
        {sel.length === 2 && <button className="btn primary" onClick={doCompare}>Porównaj zaznaczone →</button>}
      </div>

      {cmp && (
        <div className="cmp">
          <div className="cmp-head">
            <span>Zmiana wyniku: <b className={cmp.scoreDelta >= 0 ? 'pos' : 'neg'}>{cmp.scoreDelta >= 0 ? '+' : ''}{cmp.scoreDelta}</b> ({cmp.a.score} → {cmp.b.score})</span>
            <button className="btn ghost tiny" onClick={() => setCmp(null)}>Zamknij</button>
          </div>
          <div className="cmp-grid">
            <div><b className="pos">Naprawione ({cmp.resolved.length})</b><ul>{cmp.resolved.slice(0, 10).map((t, i) => <li key={i}>{t}</li>)}</ul></div>
            <div><b className="neg">Nowe ({cmp.created.length})</b><ul>{cmp.created.slice(0, 10).map((t, i) => <li key={i}>{t}</li>)}</ul></div>
          </div>
        </div>
      )}

      {data.projects.map((proj) => (
        <div key={proj.domain} className="proj">
          <h3>{proj.domain} <span className="muted">({proj.count})</span></h3>
          <table className="pages-table">
            <thead><tr><th></th><th>Data</th><th>Wynik</th><th>Strony</th><th>Błędy</th><th></th></tr></thead>
            <tbody>
              {proj.audits.map((a) => (
                <tr key={a.id}>
                  <td><input type="checkbox" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} /></td>
                  <td>{new Date(a.generatedAt).toLocaleString('pl-PL')}</td>
                  <td><b className={scoreCls(a.score)}>{a.score}</b> {a.grade}</td>
                  <td>{a.pages}</td>
                  <td className="error">{a.errors}</td>
                  <td>
                    <button className="btn ghost tiny" onClick={() => open(a.id)}>Otwórz</button>
                    <button className="btn ghost tiny" onClick={() => remove(a.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function scoreCls(s) {
  if (s >= 75) return 'great';
  if (s >= 60) return 'good';
  if (s >= 45) return 'ok';
  return 'bad';
}
