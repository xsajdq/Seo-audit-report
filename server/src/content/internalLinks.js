// Etap D — rekomender linkowania wewnętrznego.
// Dla docelowej strony wskazuje, z których istniejących stron warto ją podlinkować
// (tematycznie powiązane, a jeszcze nie linkujące) i z jakim anchor textem.
import { buildTfIdf, cosine, tokenize } from '../knowledge/text.js';

function normUrl(u) {
  try {
    const url = new URL(u); url.hash = '';
    let s = url.href; if (s.endsWith('/') && url.pathname !== '/') s = s.slice(0, -1);
    return s.toLowerCase();
  } catch { return String(u).toLowerCase(); }
}

export function analyzeLinkOpportunities(result, targetUrl, { max = 15 } = {}) {
  const pages = (result.pages || []).filter((p) => p.seo && p.status >= 200 && p.status < 300);
  const target = normUrl(targetUrl);
  const idx = pages.findIndex((p) => normUrl(p.url) === target);
  if (idx === -1) return { error: 'Nie znaleziono strony w wynikach audytu.' };

  const docs = pages.map((p) => ({
    url: p.url, norm: normUrl(p.url),
    text: `${(p.seo.title || '') + ' '} `.repeat(3) + `${(p.seo.h1 || []).join(' ')} ${p.seo.headingsText || ''} ${p.seo.bodySample || ''}`,
    links: new Set((p.seo.internalLinkHrefs || []).map(normUrl)),
    title: p.seo.title || p.url,
  }));
  const { vectors, surface } = buildTfIdf(docs);

  // anchor: główne tokeny tytułu/H1 strony docelowej
  const targetPage = pages[idx];
  const anchorTokens = [...new Set(tokenize(`${targetPage.seo.title || ''} ${(targetPage.seo.h1 || []).join(' ')}`))]
    .slice(0, 4).map(surface);
  const suggestedAnchor = (targetPage.seo.h1?.[0] || targetPage.seo.title || anchorTokens.join(' ')).slice(0, 60);

  // kandydaci: wysokie podobieństwo, nie linkują jeszcze do celu, to nie cel
  const inboundOpportunities = [];
  for (let i = 0; i < docs.length; i++) {
    if (i === idx) continue;
    if (docs[i].links.has(target)) continue; // już linkuje
    const sim = cosine(vectors[idx], vectors[i]);
    if (sim < 0.08) continue;
    inboundOpportunities.push({ url: docs[i].url, title: docs[i].title, relevance: Math.round(sim * 100) });
  }
  inboundOpportunities.sort((a, b) => b.relevance - a.relevance);

  // już linkujące (kontekst)
  const existingInbound = docs.filter((d, i) => i !== idx && d.links.has(target)).map((d) => d.url);

  return {
    target: targetPage.url,
    title: targetPage.seo.title,
    suggestedAnchor,
    anchorVariants: [suggestedAnchor, ...anchorTokens].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 5),
    existingInboundCount: existingInbound.length,
    opportunities: inboundOpportunities.slice(0, max),
  };
}
