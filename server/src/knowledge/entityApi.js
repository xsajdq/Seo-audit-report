// Opcjonalne wzbogacenie analizy o DARMOWE API knowledge graph (bez klucza):
// - Wikipedia (PL) — encje powiązane (linki z artykułu o danym temacie)
// - ConceptNet — pojęcia powiązane z frazą (RelatedTo)
// Wszystko z timeoutem i bezpiecznym fallbackiem — gdy brak sieci, zwraca puste.
const UA = 'SEO-Audit-Tool/1.0 (local content analysis)';

async function getJson(url, timeout = 7000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Encje powiązane z tematu wg Wikipedii (PL): wyszukaj artykuł, pobierz jego linki.
async function wikipediaEntities(keyword) {
  const search = await getJson(`https://pl.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&namespace=0&search=${encodeURIComponent(keyword)}`);
  const title = search && Array.isArray(search[1]) && search[1][0];
  if (!title) return [];
  const data = await getJson(`https://pl.wikipedia.org/w/api.php?action=query&format=json&prop=links&pllimit=120&plnamespace=0&titles=${encodeURIComponent(title)}`);
  const pages = data?.query?.pages;
  if (!pages) return [];
  const links = Object.values(pages)[0]?.links || [];
  return links
    .map((l) => l.title)
    .filter((t) => t && !/[:()]/.test(t) && t.split(' ').length <= 4)
    .slice(0, 80);
}

// Pojęcia powiązane wg ConceptNet (PL).
async function conceptNetTerms(token) {
  const data = await getJson(`https://api.conceptnet.io/related/c/pl/${encodeURIComponent(token)}?filter=/c/pl&limit=30`);
  const related = data?.related || [];
  return related
    .map((r) => (r['@id'] || '').split('/').pop())
    .filter(Boolean)
    .map((s) => s.replace(/_/g, ' '))
    .slice(0, 25);
}

/**
 * Zwraca wzbogacony zbiór oczekiwanych encji/terminów dla tematu.
 * @returns {{ entities:string[], terms:string[], sources:string[], available:boolean }}
 */
export async function enrichEntities(keyword, tokens = []) {
  const result = { entities: [], terms: [], sources: [], available: false };
  const tasks = [
    wikipediaEntities(keyword).then((e) => { if (e.length) { result.entities.push(...e); result.sources.push('Wikipedia'); } }),
    ...tokens.slice(0, 2).map((tok) => conceptNetTerms(tok).then((t) => { if (t.length) { result.terms.push(...t); if (!result.sources.includes('ConceptNet')) result.sources.push('ConceptNet'); } })),
  ];
  await Promise.allSettled(tasks);
  result.entities = [...new Set(result.entities)];
  result.terms = [...new Set(result.terms)];
  result.available = result.entities.length > 0 || result.terms.length > 0;
  return result;
}
