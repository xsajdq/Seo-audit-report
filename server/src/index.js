// Serwer Express: API audytu (SSE live-progress), eksport, serwowanie zbudowanego klienta.
import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { runAudit, CrawlController } from './crawler/crawler.js';
import { isRenderAvailable, closeBrowser } from './render/renderer.js';
import { toCSV, toHTMLReport, buildChecklistXlsx, buildContentChecklistXlsx } from './report/exporter.js';
import { matchKeywords } from './keyword/keywordMatcher.js';
import { buildKnowledgeGraph } from './knowledge/topicGraph.js';
import { analyzeContentGap } from './knowledge/contentGap.js';
import { analyzePage } from './knowledge/pageAnalysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 4317;

// Pamięć ostatnich wyników (bez trwałej historii — zgodnie z założeniem).
const lastResults = new Map(); // id -> result
const controllers = new Map(); // id -> CrawlController

// --- Status środowiska ---
app.get('/api/health', async (req, res) => {
  const renderAvailable = await isRenderAvailable();
  res.json({ ok: true, renderAvailable, version: '1.0.0' });
});

// --- Uruchom audyt ze strumieniem postępu (SSE) ---
app.get('/api/audit/stream', async (req, res) => {
  const startUrl = req.query.url;
  if (!startUrl) {
    res.status(400).json({ error: 'Brak parametru url' });
    return;
  }
  let normalized = startUrl;
  if (!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;

  const opts = {
    startUrl: normalized,
    maxPages: req.query.maxPages === 'all' ? 'all' : Number(req.query.maxPages || 50),
    respectRobots: req.query.respectRobots !== 'false',
    includeSubdomains: req.query.includeSubdomains === 'true',
    checkExternalLinks: req.query.checkExternalLinks === 'true',
    renderJs: req.query.renderJs === 'true',
    useSitemap: req.query.useSitemap !== 'false',
    concurrency: Math.min(Number(req.query.concurrency || 5), 10),
  };

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const controller = new CrawlController();
  controllers.set(id, controller);
  send({ type: 'start', id });

  req.on('close', () => {
    controller.cancel();
  });

  try {
    const result = await runAudit(opts, send, controller);
    lastResults.set(id, result);
    // ogranicz pamięć do 20 ostatnich
    if (lastResults.size > 20) {
      const firstKey = lastResults.keys().next().value;
      lastResults.delete(firstKey);
    }
  } catch (err) {
    send({ type: 'error', message: err.message });
  } finally {
    controllers.delete(id);
    res.end();
  }
});

// --- Anuluj audyt ---
app.post('/api/audit/:id/cancel', (req, res) => {
  const c = controllers.get(req.params.id);
  if (c) c.cancel();
  res.json({ ok: !!c });
});

// --- Pobierz zapisany wynik ---
app.get('/api/result/:id', (req, res) => {
  const r = lastResults.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Nie znaleziono wyniku' });
  res.json(r);
});

// --- Dopasowanie słów kluczowych do podstron ---
app.post('/api/result/:id/keywords', (req, res) => {
  const r = lastResults.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Nie znaleziono wyniku audytu (uruchom audyt ponownie).' });
  const { keywords, brand } = req.body || {};
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return res.status(400).json({ error: 'Podaj listę słów kluczowych (pole "keywords").' });
  }
  if (keywords.length > 5000) {
    return res.status(400).json({ error: 'Zbyt wiele słów kluczowych (limit 5000).' });
  }
  try {
    const result = matchKeywords(r.pages, keywords, { brand: (brand || '').trim() });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Tematyczny graf wiedzy (pokrycie + luki) ---
app.get('/api/result/:id/knowledge-graph', (req, res) => {
  const r = lastResults.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Nie znaleziono wyniku audytu (uruchom audyt ponownie).' });
  try {
    const host = (() => { try { return new URL(r.meta.startUrl).hostname; } catch { return 'Twoja witryna'; } })();
    res.json(buildKnowledgeGraph(r.pages, { label: host }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Głęboka analiza pojedynczego wpisu/usługi (encje, frazy, podtematy) ---
app.post('/api/result/:id/page-analysis', async (req, res) => {
  const r = lastResults.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Nie znaleziono wyniku audytu (uruchom audyt ponownie).' });
  const { url, useApi } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Podaj adres strony do analizy.' });
  try {
    const analysis = await analyzePage(url, r, { useApi: !!useApi });
    if (analysis.error) return res.status(422).json(analysis);
    res.json(analysis);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Analiza luk treściowych vs konkurencja (skanuje domeny konkurentów) ---
app.post('/api/result/:id/content-gap', async (req, res) => {
  const r = lastResults.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Nie znaleziono wyniku audytu (uruchom audyt ponownie).' });
  let { competitors, maxPages } = req.body || {};
  if (!Array.isArray(competitors) || competitors.length === 0) {
    return res.status(400).json({ error: 'Podaj co najmniej jedną domenę konkurenta.' });
  }
  competitors = competitors.map((c) => String(c).trim()).filter(Boolean).slice(0, 4);
  const perComp = Math.min(Number(maxPages) || 40, 120);

  try {
    const results = [];
    for (const c of competitors) {
      let url = c;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      const audit = await runAudit({
        startUrl: url, maxPages: perComp, concurrency: 5,
        respectRobots: true, includeSubdomains: false, checkExternalLinks: false,
        renderJs: false, useSitemap: true,
      }, () => {}, new CrawlController());
      let domain = url; try { domain = new URL(audit.meta.startUrl).hostname; } catch { /* noop */ }
      results.push({ domain, pages: audit.pages });
    }
    const gap = analyzeContentGap(r.pages, results);
    res.json(gap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Eksport ---
app.get('/api/result/:id/export', (req, res) => {
  const r = lastResults.get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Nie znaleziono wyniku' });
  const format = req.query.format || 'json';
  const host = new URL(r.meta.startUrl).hostname;
  const base = `seo-audit-${host}-${new Date().toISOString().slice(0, 10)}`;

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.csv"`);
    res.send(toCSV(r));
  } else if (format === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.html"`);
    let kg = null;
    try { kg = buildKnowledgeGraph(r.pages, { label: host }); } catch { /* graf opcjonalny */ }
    res.send(toHTMLReport(r, kg));
  } else if (format === 'xlsx') {
    let kg = null;
    try { kg = buildKnowledgeGraph(r.pages, { label: host }); } catch { /* graf opcjonalny */ }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="checklista-${base}.xlsx"`);
    res.send(buildChecklistXlsx(r, kg));
  } else if (format === 'content') {
    let kg = null;
    try { kg = buildKnowledgeGraph(r.pages, { label: host }); } catch { /* graf opcjonalny */ }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="checklista-tresci-${base}.xlsx"`);
    res.send(buildContentChecklistXlsx(r, kg));
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${base}.json"`);
    res.send(JSON.stringify(r, null, 2));
  }
});

// --- Serwuj zbudowany frontend (produkcja) ---
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = app.listen(PORT, () => {
  console.log(`\n  🔍 SEO Audit Tool — serwer działa`);
  console.log(`  → API:      http://localhost:${PORT}/api/health`);
  if (fs.existsSync(clientDist)) {
    console.log(`  → Aplikacja: http://localhost:${PORT}\n`);
  } else {
    console.log(`  → Frontend dev: uruchom 'npm run dev' (Vite na :5173)\n`);
  }
});

process.on('SIGINT', async () => {
  await closeBrowser();
  server.close(() => process.exit(0));
});
