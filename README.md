# 🔍 SEO Audit Tool

Lokalne, potężne narzędzie do **technicznego audytu SEO**. Działa w przeglądarce, uruchamiane lokalnie na Linux. Prosty interfejs, a w środku silnik sprawdzający kilkadziesiąt elementów technicznego SEO na wybranej liczbie podstron — lub na całej witrynie.

> 🔒 **W 100% lokalnie i prywatnie** — żadne dane nie opuszczają Twojego komputera, brak kluczy API.

## Możliwości

- **Crawler BFS** — skanuje wybraną liczbę podstron (10/25/50/100/250/500 lub dowolną), albo **wszystkie**.
- **Wykrywanie stron** z linków wewnętrznych + `sitemap.xml` (w tym sitemap index).
- **robots.txt** — parsowanie i respektowanie reguł allow/disallow.
- **~40 reguł technicznego SEO** per strona:
  - Meta: `<title>`, meta description (długości), charset, wiele tagów title
  - Indeksowalność: noindex/nofollow, canonical (wielokrotne/zewnętrzne), status HTTP, łańcuchy przekierowań, X-Robots-Tag
  - Treść: H1 (brak/wiele), hierarchia nagłówków, thin content, stosunek tekst/HTML
  - Obrazy: brak atrybutu `alt`, brak wymiarów (ryzyko CLS)
  - Mobile: meta viewport
  - Dane strukturalne: JSON-LD (walidacja), microdata, RDFa
  - Social: Open Graph / Twitter Cards
  - Linki: wewnętrzne/zewnętrzne, nofollow, niedziałające linki (opcjonalnie)
  - Wydajność: czas odpowiedzi/TTFB, rozmiar HTML, kompresja (gzip/brotli), Cache-Control
  - Bezpieczeństwo: HTTPS, mixed content, HSTS, CSP, X-Content-Type-Options
  - Międzynarodowe: `lang`, hreflang (self-reference)
  - Struktura URL: długość, wielkie litery, podkreślenia, nadmiar parametrów
- **Analiza całej witryny**: zduplikowane tytuły/opisy, strony osierocone, rozkład głębokości.
- **Render JavaScript (opcjonalnie)** — Playwright/Chromium: render stron na JS + **Core Web Vitals** (LCP, FCP, CLS), wykrywanie treści zależnej od JS.
- **Scoring 0–100** z oceną A–F i wynikami per kategoria.
- **Eksport**: raport HTML (do druku/PDF), CSV, JSON.
- **Live progress** przez SSE — widzisz skanowanie na żywo.

## Wymagania

- Node.js ≥ 20 (zalecane 22)
- Linux / macOS / Windows

## Instalacja

```bash
npm install
```

(Opcjonalnie) render JavaScript i Core Web Vitals — instalacja przeglądarki Chromium:

```bash
npm run audit:setup-browser
```

## Uruchomienie

### Tryb produkcyjny (jeden serwer)

```bash
npm run build      # buduje frontend
npm start          # serwer + aplikacja na http://localhost:4317
```

Otwórz **http://localhost:4317** w przeglądarce.

### Tryb deweloperski (hot reload)

```bash
npm run dev        # serwer (:4317) + Vite (:5173)
```

Otwórz **http://localhost:5173**.

## Jak używać

1. Wpisz adres strony (np. `example.com`).
2. Wybierz zakres: konkretną liczbę podstron lub „wszystkie".
3. (Opcjonalnie) rozwiń opcje zaawansowane — render JS, sprawdzanie linków zewnętrznych, subdomeny, robots.txt.
4. Kliknij **Uruchom audyt** i obserwuj postęp na żywo.
5. Przeglądaj wyniki: ocena ogólna, kategorie, lista problemów, tabela stron (klik → szczegóły), analiza witryny.
6. Eksportuj raport (HTML / CSV / JSON).

## Architektura

```
server/   Node.js + Express
  src/crawler/   fetcher, robots, sitemap, crawler (BFS + orkiestracja)
  src/audit/     extract (parsowanie HTML), checks (reguły), scoring, siteAudit
  src/render/    renderer (Playwright, opcjonalny)
  src/report/    exporter (CSV, HTML)
client/   React + Vite
  src/components/ AuditForm, Progress, Results, ScoreGauge, PageDetail
```

## Konfiguracja

- Port serwera: zmienna `PORT` (domyślnie `4317`).

## Roadmapa

- [x] **Faza 1** — fundament: crawler, SSE, dashboard, eksport
- [x] **Faza 2** — komplet checków technicznych (~40 reguł)
- [x] **Faza 3** — analiza witryny (duplikaty, osierocone, sitemap/robots)
- [x] **Faza 4** — render JS + Core Web Vitals (Playwright)
- [ ] **Faza 5** — pełna integracja Lighthouse, porównania historyczne, harmonogramy, więcej reguł (np. analiza obrazów WebP/AVIF, walidacja schema.org wg typów)

## Licencja

MIT
