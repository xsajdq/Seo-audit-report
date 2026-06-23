// Wspólne narzędzia tekstowe: normalizacja, lekki polski stemmer, tokenizacja, TF-IDF.
const STOP = new Set([
  'i', 'oraz', 'w', 'we', 'na', 'do', 'z', 'ze', 'a', 'o', 'u', 'od', 'po', 'za', 'dla', 'pod', 'nad',
  'the', 'and', 'or', 'of', 'to', 'in', 'for', 'an', 'jak', 'co', 'czy', 'ze', 'jest', 'sa', 'lub',
  'albo', 'ale', 'bez', 'przy', 'przez', 'jako', 'aby', 'wiec', 'gdzie', 'kiedy', 'to', 'sie', 'jego',
  'jej', 'ich', 'oraz', 'tym', 'ten', 'ta', 'te', 'tej', 'jakie', 'twoj', 'twoja', 'nasz', 'nasza',
]);

export function deburr(s) {
  return s
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ż/g, 'z').replace(/ź/g, 'z');
}

export function normalize(text) {
  return deburr(String(text || '').toLowerCase()).replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const SUFFIXES = ['ami', 'ach', 'om', 'owi', 'ego', 'emu', 'iego', 'iemu', 'owie', 'ych', 'ymi', 'imi', 'owy', 'owa', 'owe', 'iej', 'ej', 'im', 'ym', 'em', 'mi', 'ie', 'a', 'e', 'i', 'y', 'o', 'u'];
export function stem(token) {
  if (token.length <= 4 || /\d/.test(token)) return token;
  for (const suf of SUFFIXES) {
    if (token.endsWith(suf) && token.length - suf.length >= 3) return token.slice(0, token.length - suf.length);
  }
  return token;
}

export function tokenize(text) {
  return normalize(text).split(' ').filter((t) => t.length > 2 && !STOP.has(t)).map(stem);
}

// Buduje wektory TF-IDF dla dokumentów + mapę stem→najczęstsza forma powierzchniowa.
export function buildTfIdf(docs) {
  const surfaceForms = new Map(); // stem -> {form: count}
  const tfs = docs.map((d) => {
    const tf = new Map();
    const rawTokens = normalize(d.text).split(' ').filter((t) => t.length > 2 && !STOP.has(t));
    for (const raw of rawTokens) {
      const s = stem(raw);
      tf.set(s, (tf.get(s) || 0) + 1);
      if (!surfaceForms.has(s)) surfaceForms.set(s, new Map());
      const fm = surfaceForms.get(s);
      fm.set(raw, (fm.get(raw) || 0) + 1);
    }
    return tf;
  });

  const df = new Map();
  for (const tf of tfs) for (const term of tf.keys()) df.set(term, (df.get(term) || 0) + 1);
  const N = docs.length || 1;

  const vectors = tfs.map((tf) => {
    const vec = new Map();
    let norm = 0;
    for (const [term, count] of tf) {
      const idf = Math.log((N + 1) / ((df.get(term) || 0) + 1)) + 1;
      const w = count * idf;
      vec.set(term, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const term of vec.keys()) vec.set(term, vec.get(term) / norm);
    return vec;
  });

  const surface = (s) => {
    const fm = surfaceForms.get(s);
    if (!fm) return s;
    return [...fm.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  return { vectors, df, N, surface };
}

export function cosine(a, b) {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, w] of small) {
    const wb = big.get(term);
    if (wb) dot += w * wb;
  }
  return dot; // wektory są znormalizowane
}
