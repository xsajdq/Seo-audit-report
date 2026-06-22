import React, { useEffect, useRef } from 'react';

export default function Progress({ progress, onCancel }) {
  const logRef = useRef(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress.log]);

  const pct = progress.total ? Math.min(100, Math.round((progress.processed / progress.total) * 100)) : null;

  return (
    <div className="card">
      <div className="progress-head">
        <h2>Trwa audyt…</h2>
        <button className="btn ghost" onClick={onCancel}>Przerwij</button>
      </div>

      <div className="progress-stats">
        <div><b>{progress.processed}</b><span>przeskanowano</span></div>
        <div><b>{progress.queued}</b><span>w kolejce</span></div>
        <div><b>{progress.total ?? '∞'}</b><span>limit</span></div>
      </div>

      <div className="bar">
        {pct != null ? (
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        ) : (
          <div className="bar-fill indeterminate" />
        )}
      </div>
      <div className="status-line">{progress.status}</div>

      <div className="log" ref={logRef}>
        {progress.log.map((l, i) => (
          <div key={i} className={`log-row ${l.kind}`}>
            {l.kind === 'page' ? (
              <>
                <span className={`code s${Math.floor((l.status || 0) / 100)}`}>{l.status || '—'}</span>
                <span className="log-url">{l.text}</span>
                {l.issues > 0 && <span className="log-issues">{l.issues} problemów</span>}
              </>
            ) : (
              <span className="log-status">{l.text}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
