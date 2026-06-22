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
  - Dane strukturalne: JSON-LD (składnia + **walidacja pól wg typu Schema.org**: Organization, LocalBusiness, RealEstateAgent, Article, Product, Review, FAQPage, BreadcrumbList, PostalAddress, Offer, Event, Person), microdata, RDFa
  - Social: Open Graph / Twitter Cards
  - Linki: wewnętrzne/zewnętrzne, nofollow, niedziałające linki (opcjonalnie)
  - Wydajność: czas odpowiedzi/TTFB, rozmiar HTML, kompresja (gzip/brotli), Cache-Control
  - Bezpieczeństwo: HTTPS, mixed content, HSTS, CSP, X-Content-Type-Options
  - Międzynarodowe: `lang`, hreflang (self-reference)
  - Struktura URL: długość, wielkie litery, podkreślenia, nadmiar parametrów
  - **GEO (Generative Engine Optimization)** — gotowość pod silniki AI (AI Overviews, ChatGPT, Perplexity): semantyczny HTML, sygnały E-E-A-T (autor), świeżość (data publ./aktualizacji), nagłówki-pytania i FAQ, listy/tabele, długość akapitów, treściowe schema (Article/FAQ/HowTo), `llms.txt`, encja Organization + `sameAs`
  - **Local / Geo SEO** — schema Organization/LocalBusiness, NAP (adres/telefon), geo meta (geo.region/position, ICBM), osadzona mapa
- **Analiza całej witryny**: zduplikowane tytuły/opisy, strony osierocone, rozkład głębokości.
- **Render JavaScript (opcjonalnie)** — Playwright/Chromium: render stron na JS + **Core Web Vitals** (LCP, FCP, CLS, TBT jako proxy INP), wykrywanie treści zależnej od JS.
- **Scoring 0–100** z oceną A–F i wynikami per kategoria.
- **Eksport**: raport HTML (do druku/PDF), CSV, JSON.
- **Live progress** przez SSE — widzisz skanowanie na żywo.
- **Dopasowanie słów kluczowych do podstron** — wklejasz listę fraz, a narzędzie:
  - dobiera najtrafniejszą istniejącą podstronę (algorytm ważony po polach: URL/title/H1/nagłówki/opis/treść + lekki polski stemmer),
  - dla fraz bez dobrej strony proponuje **utworzenie nowej podstrony** (z klastrowaniem podobnych fraz i slugiem),
  - generuje sugerowany **meta title i description** wg schematu `główne słowo - dodatkowe frazy | brand` (z limitami długości i przyciskiem „Kopiuj"),
  - **klasyfikuje frazy wg intencji** (transakcyjna / informacyjna / nawigacyjna / ogólna) + flaga **lokalna** (miasta PL, wskazówki lokalizacyjne).

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
- [x] **Faza 5a** — dopasowanie słów kluczowych do podstron + sugestie meta title/description + propozycje nowych stron
- [x] **Faza 5b** — kategorie **GEO (optymalizacja pod AI)** i **Local/Geo SEO** + check `llms.txt`
- [x] **Faza 5c** — walidacja Schema.org wg typów + klasyfikacja intencji fraz + TBT/INP
- [ ] **Faza 6** — analiza konkurencji i luki frazowe/treściowe (skan konkurentów), pełny Lighthouse, eksport PDF

## Co warto dodać dalej (analiza braków audytu)

Aktualny audyt pokrywa większość krytycznych obszarów technicznego SEO. Obszary do rozbudowy:

**Wydajność / zasoby**
- Pełny Lighthouse (Performance/Accessibility/Best Practices/SEO score, realne CWV pod throttlingiem mobile)
- Analiza zasobów: nieskompresowane/niezminifikowane CSS/JS, brak `loading=lazy`, format obrazów (WebP/AVIF vs JPG/PNG), zasoby renderujące-blokująco

**Treść / semantyka**
- Wykrywanie duplikacji treści (near-duplicate, shingling/MinHash) — teraz tylko duplikaty title/description
- Analiza słów kluczowych w treści (gęstość, kanibalizacja między podstronami)
- Czytelność tekstu, język treści vs deklarowany `lang`

**Indeksowalność / architektura**
- Walidacja schema.org wg typów (wymagane pola dla Product/Article/FAQ/BreadcrumbList) + podgląd rich results
- Spójność canonical ↔ hreflang ↔ sitemap (np. URL w sitemap z noindex, canonical do noindex)
- Głębokość kliknięć vs ranking, wykrywanie pętli przekierowań, „soft 404"
- Mapa linkowania wewnętrznego (anchor text, rozkład PageRank/siły linków)

**Dostępność / UX (pośrednio SEO)**
- Kontrast, etykiety formularzy, ARIA, kolejność nagłówków jako pełny audyt a11y
- Favicon/manifest/PWA, AMP walidacja

**Operacyjne**
- Porównania historyczne między audytami (mimo braku stałej bazy — eksport/import migawek)
- Harmonogramy i alerty, audyt wielu domen, integracja z Google Search Console (opcjonalnie)

## Licencja

MIT
