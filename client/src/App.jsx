import React, { useEffect, useState } from 'react';
import { startAudit, getHealth } from './lib/api.js';
import AuditForm from './components/AuditForm.jsx';
import Progress from './components/Progress.jsx';
import Results from './components/Results.jsx';
import HistoryPanel from './components/HistoryPanel.jsx';

export default function App() {
  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [health, setHealth] = useState({ renderAvailable: false });
  const [progress, setProgress] = useState({ processed: 0, total: null, queued: 0, log: [], status: '' });
  const [result, setResult] = useState(null);
  const [resultId, setResultId] = useState(null);
  const [error, setError] = useState(null);
  const [controller, setController] = useState(null);

  useEffect(() => {
    getHealth().then(setHealth);
  }, []);

  function handleStart(params) {
    setPhase('running');
    setError(null);
    setResult(null);
    setProgress({ processed: 0, total: params.maxPages === 'all' ? null : Number(params.maxPages), queued: 0, log: [], status: 'Start…' });

    const ctrl = startAudit(params, {
      onEvent: (ev) => {
        setProgress((prev) => {
          const next = { ...prev };
          if (ev.type === 'status') {
            next.status = ev.message;
            next.log = [...prev.log, { kind: 'status', text: ev.message }].slice(-200);
          } else if (ev.type === 'progress') {
            next.processed = ev.processed;
            next.queued = ev.queued;
            if (ev.total != null) next.total = ev.total;
            next.status = `Skanowanie: ${ev.url}`;
            next.log = [
              ...prev.log,
              { kind: 'page', text: ev.url, status: ev.status, issues: ev.issues },
            ].slice(-200);
          }
          return next;
        });
      },
      onDone: (res, id) => {
        setResult(res);
        setResultId(id);
        setPhase('done');
      },
      onError: (msg) => {
        setError(msg);
        setPhase('error');
      },
    });
    setController(ctrl);
  }

  function handleCancel() {
    controller?.cancel();
  }

  function reset() {
    setPhase('idle');
    setResult(null);
    setError(null);
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🔍</span>
          <div>
            <h1>SEO Audit Tool</h1>
            <p>Techniczny audyt SEO · lokalnie · prywatnie</p>
          </div>
        </div>
        <div className="env">
          <span className={`dot ${health.renderAvailable ? 'on' : 'off'}`} />
          Render JS: {health.renderAvailable ? 'dostępny' : 'niedostępny'}
        </div>
      </header>

      <main className="main">
        {phase === 'idle' && (
          <>
            <AuditForm onStart={handleStart} renderAvailable={health.renderAvailable} />
            <HistoryPanel onOpen={(res, id) => { setResult(res); setResultId(id); setPhase('done'); }} />
          </>
        )}
        {phase === 'running' && (
          <Progress progress={progress} onCancel={handleCancel} />
        )}
        {phase === 'error' && (
          <div className="card error-card">
            <h2>Błąd audytu</h2>
            <p>{error}</p>
            <button className="btn" onClick={reset}>Spróbuj ponownie</button>
          </div>
        )}
        {phase === 'done' && result && (
          <Results result={result} resultId={resultId} onReset={reset} />
        )}
      </main>

      <footer className="footer">
        SEO Audit Tool v1.0 — działa w pełni lokalnie, żadne dane nie opuszczają Twojego komputera.
      </footer>
    </div>
  );
}
