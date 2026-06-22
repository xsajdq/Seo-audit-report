import React from 'react';

export default function PageDetail({ page, onClose }) {
  const s = page.seo || {};
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Szczegóły strony</h3>
          <button className="close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <a className="page-url" href={page.url} target="_blank" rel="noreferrer">{page.url}</a>
          {page.finalUrl !== page.url && <p className="muted">→ {page.finalUrl}</p>}

          <div className="meta-grid">
            <Meta label="Status" value={page.status} />
            <Meta label="Czas odpowiedzi" value={`${page.responseTimeMs} ms`} />
            <Meta label="TTFB" value={page.ttfb ? `${page.ttfb} ms` : '—'} />
            <Meta label="Rozmiar" value={page.bytes ? `${(page.bytes / 1024).toFixed(1)} KB` : '—'} />
            <Meta label="Głębokość" value={page.depth} />
            <Meta label="Słów" value={s.wordCount ?? '—'} />
          </div>

          {page.render?.metrics && (
            <div className="cwv">
              <h4>Core Web Vitals (render)</h4>
              <div className="meta-grid">
                <Meta label="LCP" value={page.render.metrics.lcp ? `${page.render.metrics.lcp} ms` : '—'} />
                <Meta label="FCP" value={page.render.metrics.fcp ? `${page.render.metrics.fcp} ms` : '—'} />
                <Meta label="CLS" value={page.render.metrics.cls ?? '—'} />
                <Meta label="DOM węzłów" value={page.render.metrics.domNodes ?? '—'} />
                <Meta label="Błędy konsoli" value={page.render.metrics.consoleErrors ?? '—'} />
              </div>
            </div>
          )}

          <h4>Elementy SEO</h4>
          <table className="detail-table">
            <tbody>
              <Row label="Tytuł" value={s.title} extra={s.titleLength ? `${s.titleLength} zn.` : ''} />
              <Row label="Meta description" value={s.metaDescription} extra={s.metaDescriptionLength ? `${s.metaDescriptionLength} zn.` : ''} />
              <Row label="H1" value={(s.h1 || []).join(' | ')} extra={`${s.h1Count} szt.`} />
              <Row label="Canonical" value={s.canonical} />
              <Row label="Meta robots" value={s.metaRobots} />
              <Row label="Język (lang)" value={s.htmlLang} />
              <Row label="Viewport" value={s.viewport} />
              <Row label="Open Graph" value={s.hasOpenGraph ? 'tak' : 'nie'} />
              <Row label="Dane strukturalne" value={s.hasStructuredData ? (s.structuredTypes || []).join(', ') || 'tak' : 'nie'} />
              <Row label="Obrazy" value={`${s.imageCount} (bez alt: ${s.imagesMissingAlt})`} />
              <Row label="Linki wew./zew." value={`${s.internalLinkCount} / ${s.externalLinkCount}`} />
              <Row label="Hreflang" value={s.hreflangCount ? `${s.hreflangCount} wersji` : '—'} />
            </tbody>
          </table>

          {page.redirectChain?.length > 0 && (
            <>
              <h4>Łańcuch przekierowań</h4>
              <ol className="redirects">
                {page.redirectChain.map((r, i) => <li key={i}>{r.status} → {r.to}</li>)}
              </ol>
            </>
          )}

          <h4>Problemy ({page.issues.length})</h4>
          <div className="issues">
            {page.issues.map((i, idx) => (
              <div className="issue-flat" key={idx}>
                <span className={`badge ${i.severity}`}>{i.severity}</span>
                <div>
                  <b>{i.title}</b>
                  <p>{i.detail}</p>
                </div>
              </div>
            ))}
            {page.issues.length === 0 && <p className="muted">Brak problemów na tej stronie 🎉</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return <div className="meta-item"><span>{label}</span><b>{value}</b></div>;
}
function Row({ label, value, extra }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value ? <>{value} {extra && <span className="muted">({extra})</span>}</> : <span className="muted">— brak —</span>}</td>
    </tr>
  );
}
