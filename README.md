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
  - Dane strukturalne: JSON-LD (składnia + **walidacja pól wg typu Schema.org — wiele branż**: Organization/Person/WebSite, LocalBusiness i ~60 podtypów (gastronomia, medycyna, hotele, sklepy, usługi, prawo, motoryzacja, uroda, finanse, fitness…), Article/BlogPosting/NewsArticle, Recipe, HowTo, FAQPage/QAPage, Course, Book, VideoObject/ImageObject, Product/Offer/Review/AggregateRating, JobPosting, Event, SoftwareApplication, BreadcrumbList, PostalAddress, ContactPoint, OpeningHoursSpecification, GeoCoordinates), microdata, RDFa
  - Social: Open Graph / Twitter Cards
  - Linki: wewnętrzne/zewnętrzne, nofollow, niedziałające linki (opcjonalnie)
  - Wydajność: czas odpowiedzi/TTFB, rozmiar HTML, kompresja (gzip/brotli), Cache-Control
  - Bezpieczeństwo: HTTPS, mixed content, HSTS, CSP, X-Content-Type-Options
  - Międzynarodowe: `lang`, hreflang (self-reference)
  - Struktura URL: długość, wielkie litery, podkreślenia, nadmiar parametrów
  - **GEO (Generative Engine Optimization)** — gotowość pod silniki AI (AI Overviews, ChatGPT, Perplexity): semantyczny HTML, sygnały E-E-A-T (autor), świeżość (data publ./aktualizacji), nagłówki-pytania i FAQ, listy/tabele, długość akapitów, treściowe schema (Article/FAQ/HowTo), `llms.txt`, encja Organization + `sameAs`
  - **Local / Geo SEO** — schema Organization/LocalBusiness, NAP (adres/telefon), geo meta (geo.region/position, ICBM), osadzona mapa
- **Analiza całej witryny (cross-page, jak topowe crawlery)**:
  - zduplikowane tytuły/opisy, **near-duplicate content** (podobieństwo Jaccarda na treści)
  - **graf linków wewnętrznych**: linki do stron 4xx/5xx, linki do przekierowań, strony osierocone
  - **głębokość kliknięć** (strony >3 kliki od startu), rozkład głębokości
  - **reconciliacja sitemap ↔ crawl**: nieindeksowalne URL-e w sitemap, strony spoza sitemap
  - **kanonikalizacja domeny**: http→https, spójność www/non-www
  - jakość anchor textów (puste/generyczne), przekierowania tymczasowe (302/307), konflikt noindex+canonical
- **Render JavaScript (opcjonalnie)** — Playwright/Chromium: render stron na JS + **Core Web Vitals** (LCP, FCP, CLS, TBT jako proxy INP), wykrywanie treści zależnej od JS.
- **Scoring 0–100** z oceną A–F: wynik ogólny to ważona średnia kategorii (realistyczny, spójny — nie zaniża), wyniki per kategoria z łagodną krzywą.
- **Podpowiedzi „jak naprawić"** przy każdym problemie (technicznie i contentowo) — widoczne w aplikacji, raporcie HTML i checkliście XLSX.
- **Eksport**: raport HTML (do druku/PDF), **checklista wdrożeniowa .xlsx** (Excel / Arkusze Google — priorytety, kolumna statusu z listą rozwijaną, arkusze: Podsumowanie / Checklista / Strony / Kompletność treści), CSV, JSON.
- **Live progress** przez SSE — widzisz skanowanie na żywo.
- **Dopasowanie słów kluczowych do podstron** — wklejasz listę fraz, a narzędzie:
  - dobiera najtrafniejszą istniejącą podstronę (algorytm ważony po polach: URL/title/H1/nagłówki/opis/treść + lekki polski stemmer),
  - dla fraz bez dobrej strony proponuje **utworzenie nowej podstrony** (z klastrowaniem podobnych fraz i slugiem),
  - generuje sugerowany **meta title i description** wg schematu `główne słowo - dodatkowe frazy | brand` (z limitami długości i przyciskiem „Kopiuj"),
  - **klasyfikuje frazy wg intencji** (transakcyjna / informacyjna / nawigacyjna / ogólna) + flaga **lokalna** (miasta PL, wskazówki lokalizacyjne).
- **Tematyczny graf wiedzy (topical map) + analiza luk treściowych**:
  - automatyczna **klasyfikacja typów podstron** (wpis blogowy / usługa / produkt / kategoria / lokalizacja / kontakt / o nas / prawne)
  - **klastrowanie tematyczne** (TF-IDF + cosine) i interaktywna **wizualizacja grafu** (tematy + linkowanie wewnętrzne)
  - **pokrycie i luki**: płytkie tematy, brak strony filarowej (pillar), słaby interlinking klastra
  - **audyt kompletności wpisów** — czy wpis pokrywa 100% podtematów oczekiwanych w danym temacie (profil tematu + brakujące podtematy i pytania per wpis)
  - **lista wszystkich wpisów i usług** w grafie wiedzy — filtr po typie, sortowanie wg kompletności, podgląd/analiza każdej strony
  - **głęboka analiza pojedynczej strony (wpis/usługa)** — wybierasz stronę, aplikacja pobiera jej treść i pokazuje brakujące **encje, frazy, podtematy i pytania** + rekomendacje; opcjonalne wzbogacenie darmowym API **Wikipedia PL + ConceptNet** (bez klucza, z lokalnym fallbackiem)
  - **checklista treści .xlsx** — lista wpisów/usług z kompletnością, brakującymi podtematami (odpowiedziami) i pytaniami do dodania, z kolumną statusu
- **Analiza treści vs konkurencja (TOP Google, realna)**:
  - pobiera TOP10 wyników Google dla frazy przez **Serper.dev** (darmowe 2500 zapytań, bez karty) lub z ręcznie podanych adresów
  - buduje wzorzec **TF-IDF** z treści konkurentów i wskazuje terminy/encje/pytania, których używają najlepsi, a brakuje u Ciebie (niecyrkularnie — nie z własnych stron)
  - ocena A–F treści/strony/draftu vs mediana TOP wyników, brakujące terminy i pytania, nagłówki konkurencji
- **Narzędzia treści (all-in-one)**:
  - **Plan treści / kalendarz redakcyjny** — z fraz + luk z grafu + niekompletnych wpisów buduje priorytetyzowaną listę treści rozłożoną na miesiące (eksport XLSX)
  - **Generator briefów** — outline (H2/H3), pytania, terminy/encje, docelowa długość, title/meta, linki wewnętrzne (opcjonalnie z Google Suggest + Wikipedia/ConceptNet)
  - **Edytor treści** — ocena draftu A–F względem profilu tematu + brakujące terminy/pytania
  - **Rozszerzanie fraz** — Google Suggest + pytania „People Also Ask" (darmowe, bez klucza)
  - **Rekomender linkowania wewnętrznego** — skąd podlinkować stronę i z jakim anchorem
- **Historia i projekty** — trwały zapis audytów (pliki JSON), grupowanie po domenie, porównania w czasie (naprawione vs nowe problemy, zmiana wyniku)
  - **analiza luk vs konkurencja** — podajesz domeny konkurentów, aplikacja skanuje ich blogi i wskazuje tematy, których u Ciebie brakuje lub są słabiej rozwinięte (z listą podtematów do pokrycia)
  - **eksport do raportu HTML** — graf, pokrycie tematów, kompletność wpisów i luki w drukowalnym raporcie (PDF)

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
- [x] **Faza 5d** — inteligencja cross-page (graf linków, broken/redirect internal, sitemap↔crawl, near-duplicate, click depth, kanonikalizacja domeny, anchor text)
- [x] **Faza 5e** — AI-readiness (outbound authority, RAG chunking, AI-fluff, entity density), a11y (ARIA/etykiety/tabindex), hreflang return tags, łańcuchy canonical, paginacja, formaty obrazów (WebP/AVIF), resource hints, kanibalizacja fraz, wewnętrzny PageRank
- [x] **Faza 5f** — użyteczność/UX: czytelność i czas czytania, zasoby blokujące render, breadcrumbs, favicon, wyszukiwarka, strony zaufania (E-E-A-T), soft-404, kompletność OG/Twitter, zgodność Title↔H1, jakość nazw plików obrazów, statystyki w treści, nagłówki anty-clickjacking/Referrer-Policy
- [x] **Faza 6** — tematyczny graf wiedzy (topical map): klasyfikacja typów podstron, klastrowanie tematyczne, wizualizacja grafu, pokrycie/luki, analiza luk treściowych vs konkurencja
- [ ] **Faza 7** — integracja CrUX/Lighthouse, eksport PDF, analiza logów serwera

## Porównanie z czołowymi narzędziami

| Obszar | Screaming Frog / Sitebulb | Ta aplikacja |
|---|---|---|
| Crawl, status kody, meta, nagłówki, canonical, hreflang | ✅ | ✅ |
| Graf linków wewnętrznych (broken/redirect/orphan) | ✅ | ✅ |
| Near-duplicate / duplikaty | ✅ | ✅ (Jaccard) |
| Click depth / architektura | ✅ | ✅ (metryki) |
| Dane strukturalne (walidacja wg typu) | ✅ | ✅ (wiele branż) |
| Render JS + Core Web Vitals | ✅ | ✅ (Playwright) |
| GEO (AI) + Local SEO + mapowanie fraz | częściowo | ✅ |
| Integracje GA/GSC/PSI | ✅ | ❌ (świadomie 100% lokalnie) |
| Analiza logów serwera | ✅ (Log Analyzer) | ⏳ planowane |
| Analiza konkurencji / luki frazowe | ✅ (Ahrefs/Semrush) | ⏳ planowane |
| Wizualizacja architektury (graf) | ✅ (Sitebulb) | ⏳ planowane |

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
