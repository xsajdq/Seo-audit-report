// Klient Serper.dev — TOP wyniki Google dla frazy (darmowe 2500 zapytań, bez karty).
// Klucz API: z body żądania lub zmiennej środowiskowej SERPER_API_KEY.
export async function serperSearch(query, { apiKey, num = 10, gl = 'pl', hl = 'pl' } = {}) {
  const key = apiKey || process.env.SERPER_API_KEY;
  if (!key) return { available: false, error: 'Brak klucza API Serper.dev.', urls: [], questions: [], related: [] };

  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      signal: c.signal,
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, gl, hl, num }),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { available: false, error: `Serper HTTP ${r.status}${txt ? ': ' + txt.slice(0, 120) : ''}`, urls: [], questions: [], related: [] };
    }
    const data = await r.json();
    const organic = Array.isArray(data.organic) ? data.organic : [];
    const urls = organic
      .map((o) => ({ url: o.link, title: o.title, snippet: o.snippet }))
      .filter((o) => o.url && /^https?:\/\//.test(o.url));
    const questions = (data.peopleAlsoAsk || []).map((p) => p.question).filter(Boolean);
    const related = (data.relatedSearches || []).map((r2) => r2.query).filter(Boolean);
    return { available: true, urls, questions, related };
  } catch (err) {
    return { available: false, error: err.name === 'AbortError' ? 'Timeout' : err.message, urls: [], questions: [], related: [] };
  } finally {
    clearTimeout(t);
  }
}
