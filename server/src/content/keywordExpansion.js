// Etap E — darmowe rozszerzanie fraz przez Google Suggest (bez klucza API).
// Generuje podpowiedzi i pytania ("People Also Ask"-like) z autouzupełniania.
// W środowisku bez sieci zwraca pusto (graceful fallback).
const QUESTION_PREFIXES = ['jak', 'co to jest', 'dlaczego', 'ile kosztuje', 'czy', 'kiedy', 'gdzie', 'jaki', 'który', 'czym jest', 'jak wybrać'];
const ALPHABET = 'abcdefghijklmnoprstuwz'.split('');

async function suggest(query, lang = 'pl') {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${lang}&q=${encodeURIComponent(query)}`;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6000);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'User-Agent': 'Mozilla/5.0 SEO-Audit-Tool' } });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * Rozszerza frazę: podstawowe podpowiedzi + "alphabet soup" + pytania.
 * @returns {{ available:boolean, suggestions:string[], questions:string[], modifiers:object }}
 */
export async function expandKeyword(seed, { lang = 'pl', deep = true } = {}) {
  const base = String(seed || '').trim();
  if (!base) return { available: false, suggestions: [], questions: [], modifiers: {} };

  const queries = [base];
  if (deep) {
    for (const a of ALPHABET) queries.push(`${base} ${a}`);
    for (const q of QUESTION_PREFIXES) queries.push(`${q} ${base}`);
  }

  const seen = new Set();
  const suggestions = [];
  const questions = [];
  // ogranicz równoległość, by nie przeciążyć Google
  const batchSize = 6;
  let anyResponse = false;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((q) => suggest(q, lang)));
    for (const list of results) {
      if (list.length) anyResponse = true;
      for (const s of list) {
        const key = s.toLowerCase().trim();
        if (seen.has(key) || key === base.toLowerCase()) continue;
        seen.add(key);
        if (/^(jak|co|dlaczego|ile|czy|kiedy|gdzie|jaki|który|czym|po co|na co|za ile)\b/i.test(key) || key.includes('?')) {
          questions.push(s);
        } else {
          suggestions.push(s);
        }
      }
    }
  }

  // grupowanie modyfikatorów (komercyjne / lokalne / porównawcze)
  const modifiers = {
    komercyjne: suggestions.filter((s) => /\b(cena|cennik|tanio|tani|sklep|kup|kupić|promocja|oferta|koszt|ranking|najlepsz)\b/i.test(s)).slice(0, 30),
    poradnikowe: suggestions.filter((s) => /\b(jak|poradnik|krok|instrukcja|sposób|domowy|samodzielnie)\b/i.test(s)).slice(0, 30),
    lokalne: suggestions.filter((s) => /\b(warszawa|krakow|kraków|wrocław|poznań|gdańsk|blisko|okolica|w pobliżu)\b/i.test(s)).slice(0, 30),
  };

  return {
    available: anyResponse,
    seed: base,
    suggestions: suggestions.slice(0, 200),
    questions: questions.slice(0, 80),
    modifiers,
    total: suggestions.length + questions.length,
  };
}
