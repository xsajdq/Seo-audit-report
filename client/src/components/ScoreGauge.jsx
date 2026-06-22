import React from 'react';

export default function ScoreGauge({ score, grade }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 90 ? '#16a34a' : score >= 75 ? '#65a30d' : score >= 60 ? '#d97706' : score >= 40 ? '#ea580c' : '#dc2626';

  return (
    <div className="gauge-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="12" />
        <circle
          cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text x="70" y="64" textAnchor="middle" fontSize="34" fontWeight="700" fill="#0f172a">{score}</text>
        <text x="70" y="88" textAnchor="middle" fontSize="13" fill="#64748b">/ 100</text>
      </svg>
      <div className="grade" style={{ color }}>Ocena {grade}</div>
    </div>
  );
}
