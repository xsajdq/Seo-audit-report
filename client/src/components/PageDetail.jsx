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
            <Meta label="Wewn. PageRank" value={page.pagerank != null ? `${page.pagerank}/100` : '—'} />
            <Meta label="Słów" value={s.wordCount ?? '—'} />
          </div>

          {page.render?.metrics && (
            <div className="cwv">
              <h4>Core Web Vitals (render)</h4>
              <div className="meta-grid">
                <Meta label="LCP" value={page.render.metrics.lcp ? `${page.render.metrics.lcp} ms` : '—'} />
                <Meta label="FCP" value={page.render.metrics.fcp ? `${page.render.metrics.fcp} ms` : '—'} />
                <Meta label="CLS" value={page.render.metrics.cls ?? '—'} />
                <Meta label="TBT (proxy INP)" value={page.render.metrics.tbt != null ? `${page.render.metrics.tbt} ms` : '—'} />
                <Meta label="INP" value="wymaga interakcji" />
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

          {s.geo && (
            <>
              <h4>GEO — gotowość pod AI (silniki generatywne)</h4>
              <div className="signal-grid">
                <Signal ok={s.geo.semanticHtml} label="Semantyczny HTML" />
                <Signal ok={s.geo.hasAuthor} label="Autor (E-E-A-T)" />
                <Signal ok={s.geo.hasModifiedDate || s.geo.hasPublishDate} label="Data publ./aktual." />
                <Signal ok={s.geo.questionHeadings > 0 || s.geo.faqSchema} label="Pytania / FAQ" />
                <Signal ok={s.geo.lists > 0 || s.geo.tables > 0} label="Listy / tabele" />
                <Signal ok={s.geo.faqSchema} label="FAQ schema" />
                <Signal ok={s.geo.authoritySources > 0} label="Linki do źródeł" />
                <Signal ok={s.geo.fluffCount === 0} label="Bez AI-fluff" />
              </div>
            </>
          )}

          {s.a11y && (
            <>
              <h4>Dostępność (a11y)</h4>
              <div className="signal-grid">
                <Signal ok={s.a11y.interactiveNoName === 0} label="Przyciski/linki z nazwą" />
                <Signal ok={s.a11y.inputsNoLabel === 0} label="Pola z etykietą" />
                <Signal ok={s.a11y.positiveTabindex === 0} label="Brak dodatniego tabindex" />
              </div>
            </>
          )}

          {s.ux && (
            <>
              <h4>Użyteczność (UX)</h4>
              <div className="meta-grid">
                <Meta label="Czytelność" value={`${s.ux.readability}/100`} />
                <Meta label="Śr. dł. zdania" value={`${s.ux.avgSentenceLength} słów`} />
                <Meta label="Czas czytania" value={`${s.ux.readingTimeMin} min`} />
                <Meta label="Skrypty blok." value={s.ux.headSyncScripts} />
                <Meta label="Arkusze CSS" value={s.ux.stylesheets} />
                <Meta label="Dane/statystyki" value={s.ux.statCount} />
              </div>
              <div className="signal-grid">
                <Signal ok={s.ux.hasBreadcrumb} label="Breadcrumbs" />
                <Signal ok={s.ux.hasSearch} label="Wyszukiwarka" />
                <Signal ok={s.ux.hasFavicon} label="Favicon" />
              </div>
            </>
          )}

          {s.local && (
            <>
              <h4>Local / Geo SEO</h4>
              <div className="signal-grid">
                <Signal ok={s.local.organization || s.local.localBusiness} label="Schema firmy" />
                <Signal ok={s.local.address} label="Adres (NAP)" />
                <Signal ok={s.local.phone} label="Telefon" />
                <Signal ok={s.local.geoMeta} label="Geo meta" />
                <Signal ok={s.local.map} label="Mapa" />
                <Signal ok={s.local.sameAs > 0} label={`sameAs (${s.local.sameAs})`} />
              </div>
            </>
          )}

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
                  {i.fix && <p className="issue-fix">✅ {i.fix}</p>}
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
function Signal({ ok, label }) {
  return (
    <div className={`signal ${ok ? 'on' : 'off'}`}>
      <span className="signal-icon">{ok ? '✓' : '✗'}</span>
      <span>{label}</span>
    </div>
  );
}
function Row({ label, value, extra }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value ? <>{value} {extra && <span className="muted">({extra})</span>}</> : <span className="muted">— brak —</span>}</td>
    </tr>
  );
}
