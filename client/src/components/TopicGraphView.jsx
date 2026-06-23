import React, { useMemo, useState } from 'react';

const TYPE_COLORS = {
  blog: '#2563eb',
  service: '#16a34a',
  product: '#9333ea',
  category: '#d97706',
  location: '#0891b2',
  homepage: '#0f172a',
  page: '#64748b',
};

// Prosta statyczna symulacja force-directed (repulsja + sprężyny), liczona raz.
function layout(nodes, edges, width, height) {
  const N = nodes.length;
  const pos = nodes.map((_, i) => ({
    x: width / 2 + Math.cos((i / N) * 2 * Math.PI) * Math.min(width, height) * 0.32 + (Math.random() - 0.5) * 30,
    y: height / 2 + Math.sin((i / N) * 2 * Math.PI) * Math.min(width, height) * 0.32 + (Math.random() - 0.5) * 30,
  }));
  const idOf = new Map(nodes.map((n, i) => [n.id, i]));
  const k = Math.sqrt((width * height) / Math.max(N, 1)) * 0.55;

  for (let iter = 0; iter < 320; iter++) {
    const disp = pos.map(() => ({ x: 0, y: 0 }));
    // repulsja
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (k * k) / dist;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        disp[i].x += fx; disp[i].y += fy;
        disp[j].x -= fx; disp[j].y -= fy;
      }
    }
    // przyciąganie po krawędziach
    for (const e of edges) {
      const a = idOf.get(e.source); const b = idOf.get(e.target);
      if (a === undefined || b === undefined) continue;
      let dx = pos[a].x - pos[b].x;
      let dy = pos[a].y - pos[b].y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (dist * dist) / k * (0.6 + Math.min(e.weight, 8) * 0.05);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      disp[a].x -= fx; disp[a].y -= fy;
      disp[b].x += fx; disp[b].y += fy;
    }
    const temp = Math.max(2, 30 * (1 - iter / 320));
    for (let i = 0; i < N; i++) {
      const d = Math.sqrt(disp[i].x ** 2 + disp[i].y ** 2) || 0.01;
      pos[i].x += (disp[i].x / d) * Math.min(d, temp);
      pos[i].y += (disp[i].y / d) * Math.min(d, temp);
      pos[i].x = Math.max(40, Math.min(width - 40, pos[i].x));
      pos[i].y = Math.max(40, Math.min(height - 40, pos[i].y));
    }
  }
  return pos;
}

export default function TopicGraphView({ nodes, edges, onSelect }) {
  const width = 760, height = 460;
  const [hover, setHover] = useState(null);
  const pos = useMemo(() => layout(nodes, edges, width, height), [nodes, edges]);
  if (nodes.length === 0) return <p className="muted">Za mało danych do zbudowania grafu.</p>;

  const maxSize = Math.max(...nodes.map((n) => n.size), 1);
  const r = (n) => 10 + (n.size / maxSize) * 22;
  const idOf = new Map(nodes.map((n, i) => [n.id, i]));
  const maxW = Math.max(...edges.map((e) => e.weight), 1);

  return (
    <div className="graph-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} className="topic-graph">
        {edges.map((e, i) => {
          const a = pos[idOf.get(e.source)]; const b = pos[idOf.get(e.target)];
          if (!a || !b) return null;
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd5e1" strokeWidth={0.5 + (e.weight / maxW) * 3} opacity="0.6" />;
        })}
        {nodes.map((n, i) => (
          <g key={n.id} transform={`translate(${pos[i].x},${pos[i].y})`}
             onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
             onClick={() => onSelect?.(n.id)} style={{ cursor: 'pointer' }}>
            {n.gap && <circle r={r(n) + 4} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="3 2" />}
            <circle r={r(n)} fill={TYPE_COLORS[n.type] || '#64748b'} opacity={hover === n.id ? 1 : 0.85} />
            <text textAnchor="middle" y={r(n) + 12} fontSize="10" fill="#0f172a" className="graph-label">
              {n.label.length > 22 ? n.label.slice(0, 20) + '…' : n.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="graph-legend">
        {Object.entries(TYPE_COLORS).map(([t, c]) => (
          <span key={t}><i style={{ background: c }} />{t}</span>
        ))}
        <span><i style={{ border: '2px dashed #dc2626', background: 'transparent' }} />luka pokrycia</span>
      </div>
    </div>
  );
}
