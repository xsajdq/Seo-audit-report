// Etap F — trwała historia audytów i projekty (grupowanie po domenie).
// Zapis do plików JSON (bez natywnych zależności). Umożliwia porównania w czasie.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data/audits');
const INDEX = path.join(DATA_DIR, 'index.json');

function ensure() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INDEX)) fs.writeFileSync(INDEX, '[]');
}
function readIndex() {
  ensure();
  try { return JSON.parse(fs.readFileSync(INDEX, 'utf-8')); } catch { return []; }
}
function writeIndex(arr) { fs.writeFileSync(INDEX, JSON.stringify(arr, null, 2)); }

export function saveAudit(id, result) {
  try {
    ensure();
    fs.writeFileSync(path.join(DATA_DIR, `${id}.json`), JSON.stringify(result));
    let domain = result.meta?.origin || result.meta?.startUrl || '';
    try { domain = new URL(result.meta.startUrl).hostname; } catch { /* noop */ }
    const entry = {
      id, domain, startUrl: result.meta?.startUrl,
      generatedAt: result.meta?.generatedAt,
      score: result.summary?.score, grade: result.summary?.grade,
      pages: result.summary?.totals?.pages || result.pages?.length || 0,
      errors: result.summary?.totals?.error || 0,
      warnings: result.summary?.totals?.warning || 0,
    };
    const idx = readIndex().filter((e) => e.id !== id);
    idx.unshift(entry);
    // limit 200 wpisów — usuń pliki nadmiarowe
    const keep = idx.slice(0, 200);
    for (const old of idx.slice(200)) {
      try { fs.unlinkSync(path.join(DATA_DIR, `${old.id}.json`)); } catch { /* noop */ }
    }
    writeIndex(keep);
    return true;
  } catch {
    return false;
  }
}

export function listHistory() {
  const idx = readIndex();
  // grupuj po domenie (projekty)
  const projects = {};
  for (const e of idx) {
    if (!projects[e.domain]) projects[e.domain] = [];
    projects[e.domain].push(e);
  }
  return {
    audits: idx,
    projects: Object.entries(projects).map(([domain, audits]) => ({
      domain, count: audits.length, latest: audits[0], audits,
    })).sort((a, b) => new Date(b.latest.generatedAt) - new Date(a.latest.generatedAt)),
  };
}

export function getAudit(id) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${id}.json`), 'utf-8')); }
  catch { return null; }
}

export function deleteAudit(id) {
  try { fs.unlinkSync(path.join(DATA_DIR, `${id}.json`)); } catch { /* noop */ }
  writeIndex(readIndex().filter((e) => e.id !== id));
  return true;
}

// Porównanie dwóch audytów (zmiana w czasie).
export function compareAudits(idA, idB) {
  const a = getAudit(idA);
  const b = getAudit(idB);
  if (!a || !b) return null;
  const catDiff = {};
  for (const key in (b.summary?.categories || {})) {
    const before = a.summary?.categories?.[key]?.score ?? null;
    const after = b.summary?.categories?.[key]?.score ?? null;
    catDiff[key] = { label: b.summary.categories[key].label, before, after, delta: before != null && after != null ? after - before : null };
  }
  // nowe i naprawione problemy (po tytule)
  const titlesOf = (r) => {
    const s = new Map();
    for (const p of r.pages || []) for (const i of p.issues || []) s.set(`${i.category}|${i.title}`, i.title);
    for (const i of r.siteIssues || []) s.set(`${i.category}|${i.title}`, i.title);
    return s;
  };
  const ta = titlesOf(a); const tb = titlesOf(b);
  const resolved = [...ta.keys()].filter((k) => !tb.has(k)).map((k) => ta.get(k));
  const created = [...tb.keys()].filter((k) => !ta.has(k)).map((k) => tb.get(k));

  return {
    a: { id: idA, generatedAt: a.meta?.generatedAt, score: a.summary?.score, grade: a.summary?.grade },
    b: { id: idB, generatedAt: b.meta?.generatedAt, score: b.summary?.score, grade: b.summary?.grade },
    scoreDelta: (b.summary?.score ?? 0) - (a.summary?.score ?? 0),
    categories: catDiff,
    resolved: resolved.slice(0, 50),
    created: created.slice(0, 50),
  };
}
