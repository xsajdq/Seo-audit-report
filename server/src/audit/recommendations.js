// Konkretne podpowiedzi "jak naprawić" dla wykrytych problemów — technicznie
// i contentowo. Mapowanie po tytule problemu + sensowny fallback per kategoria.
const FIX = {
  // Indeksowalność
  'Strona z noindex': 'Jeśli strona ma być w Google — usuń meta robots „noindex" oraz nagłówek X-Robots-Tag. Jeśli ukrycie jest celowe, zignoruj.',
  'Wiele tagów canonical': 'Zostaw dokładnie jeden tag <link rel="canonical"> wskazujący preferowany URL.',
  'Brak tagu canonical': 'Dodaj <link rel="canonical"> wskazujący kanoniczny adres strony (zwykle ona sama).',
  'Canonical wskazuje na inny URL': 'Upewnij się, że canonical celowo wskazuje wersję kanoniczną; w razie pomyłki ustaw self-canonical.',
  'Konflikt: noindex + canonical na inny URL': 'Wybierz jeden sygnał: albo noindex (strona nie do indeksu), albo canonical (konsolidacja). Nie łącz ich.',
  'Przekierowanie tymczasowe (302/307)': 'Jeśli zmiana jest trwała, zmień przekierowanie na 301 (przekazuje moc linków).',
  'Łańcuch canonical': 'Ustaw canonical bezpośrednio na finalny URL, bez pośrednich kroków.',
  'Sitemap zawiera nieindeksowalne URL-e': 'Usuń z sitemap.xml adresy z noindex/przekierowaniem/błędem — zostaw tylko strony 200, indeksowalne.',
  'Strony poza sitemap': 'Dodaj wartościowe, indeksowalne strony do sitemap.xml, aby przyspieszyć ich indeksację.',
  'Soft 404 (błędny URL zwraca 200)': 'Skonfiguruj serwer/CMS, by nieistniejące adresy zwracały status 404 (lub 410).',
  'Brak kanonikalizacji www/non-www': 'Wybierz jedną wersję (www lub bez) i przekieruj 301 drugą na nią.',

  // Meta / tytuły
  'Brak tagu <title>': 'Dodaj unikalny <title> 30–60 znaków z najważniejszą frazą na początku i marką na końcu.',
  'Tytuł zbyt krótki': 'Rozbuduj tytuł do 30–60 znaków, dodaj główną frazę i kontekst (np. lokalizację/markę).',
  'Tytuł zbyt długi': 'Skróć tytuł do ~60 znaków, by nie był ucinany w wynikach; najważniejsze słowa na początku.',
  'Brak meta description': 'Dodaj meta description 70–160 znaków z frazą i wezwaniem do działania — podnosi CTR.',
  'Title i H1 bez wspólnych słów': 'Ujednolić temat — w title i H1 użyj tej samej głównej frazy kluczowej.',
  'Paginacja bez numeru w tytule': 'Dodaj numer strony do title/description paginacji (np. „— Strona 2"), by uniknąć duplikatów.',

  // Treść / nagłówki
  'Brak nagłówka H1': 'Dodaj jeden nagłówek H1 opisujący temat strony, zawierający główną frazę.',
  'Wiele nagłówków H1': 'Zostaw jeden H1; pozostałe zmień na H2/H3 zgodnie z hierarchią.',
  'Mało treści (thin content)': 'Rozbuduj treść (zwykle 300–800+ słów): odpowiedz na realne pytania użytkownika, dodaj przykłady i szczegóły.',
  'Obrazy bez atrybutu alt': 'Uzupełnij atrybut alt opisujący obraz (naturalnie z frazą) — to SEO i dostępność.',
  'Nieopisowe nazwy plików obrazów': 'Zmień nazwy plików na opisowe z myślnikami (np. buty-trekkingowe-meskie.webp) zamiast IMG_1234.',

  // Mobile
  'Brak meta viewport': 'Dodaj <meta name="viewport" content="width=device-width, initial-scale=1"> w <head>.',

  // Dane strukturalne
  'Brak danych strukturalnych': 'Dodaj JSON-LD dopasowany do typu strony (Article, Product, LocalBusiness, FAQPage…) — pomaga w rich results i AI.',

  // Wydajność
  'Wolna odpowiedź serwera': 'Skróć TTFB: cache po stronie serwera/CDN, optymalizacja zapytań DB, hosting bliżej użytkowników.',
  'Brak kompresji': 'Włącz kompresję gzip/brotli na serwerze dla HTML/CSS/JS.',
  'Brak nagłówka Cache-Control': 'Ustaw Cache-Control dla zasobów statycznych (dłuższy max-age dla obrazów/CSS/JS).',
  'Stare formaty obrazów (JPEG/PNG)': 'Konwertuj obrazy do WebP/AVIF i serwuj przez <picture> z fallbackiem.',
  'Obrazy bez lazy-loading': 'Dodaj loading="lazy" do obrazów poza pierwszym ekranem.',
  'Nadmiar tagów preload': 'Ogranicz preload do 1–2 krytycznych zasobów (np. obraz LCP, główny font).',
  'Skrypty blokujące renderowanie': 'Dodaj defer/async do skryptów w <head> lub przenieś je na koniec <body>.',

  // Bezpieczeństwo
  'Brak HTTPS': 'Wdróż certyfikat SSL i wymuś HTTPS (przekierowanie 301 z http na https).',
  'Mixed content': 'Zmień wszystkie zasoby http:// na https:// na stronach HTTPS.',
  'Brak przekierowania http→https': 'Skonfiguruj przekierowanie 301 całego ruchu http na https.',
  'Brak ochrony przed clickjacking': 'Dodaj nagłówek X-Frame-Options: SAMEORIGIN lub CSP frame-ancestors.',
  'Brak Referrer-Policy': 'Ustaw nagłówek Referrer-Policy (np. strict-origin-when-cross-origin).',

  // i18n
  'Brak atrybutu lang w <html>': 'Dodaj atrybut lang do <html> (np. lang="pl").',
  'Hreflang bez tagu zwrotnego (return tag)': 'Każda wersja językowa musi wskazywać hreflangiem wszystkie pozostałe ORAZ samą siebie (wzajemność).',

  // Linki / architektura
  'Brak linków wewnętrznych': 'Dodaj linki wewnętrzne do powiązanych podstron (z opisowym anchor textem).',
  'Wewnętrzne linki do stron z błędem (4xx/5xx)': 'Popraw lub usuń linki prowadzące do błędnych adresów; podmień na działające.',
  'Wewnętrzne linki do przekierowań': 'Linkuj bezpośrednio do finalnego URL, pomijając przekierowanie.',
  'Generyczne anchor texty': 'Zamień „kliknij tutaj/więcej" na opisowy anchor z frazą docelowej strony.',
  'Linki wewnętrzne bez tekstu kotwicy': 'Dodaj tekst kotwicy do linków (lub alt do linkowanych obrazów).',
  'Ważne strony ze słabym linkowaniem wewnętrznym': 'Wzmocnij linkowanie do tych stron z mocnych podstron (strona główna, kategorie, popularne wpisy).',

  // GEO / AI
  'Brak semantycznego HTML (article/main/section)': 'Owiń treść w <main>/<article>/<section> — ułatwia ekstrakcję treści przez AI i czytniki.',
  'Brak sygnałów autorstwa (E-E-A-T)': 'Dodaj autora (imię, krótkie bio, link do strony autora) i datę — buduje wiarygodność (E-E-A-T).',
  'Brak daty publikacji/aktualizacji': 'Dodaj datePublished/dateModified (w treści i JSON-LD) — AI faworyzuje świeże, datowane treści.',
  'Brak nagłówków w formie pytań / FAQ': 'Dodaj sekcję FAQ i nagłówki w formie pytań (z FAQPage schema) — ułatwia cytowanie przez AI.',
  'Brak list i tabel': 'Dodaj listy i tabele porównawcze — to format chętnie ekstrahowany przez silniki AI.',
  'Długie akapity (trudne do cytowania)': 'Skróć akapity do ~3–4 zdań; jedna myśl na akapit.',
  'Brak treściowego schema (Article/FAQ/HowTo…)': 'Dodaj JSON-LD odpowiedni do treści (Article/FAQPage/HowTo) z kompletem pól.',
  'Brak linków do wiarygodnych źródeł': 'Dodaj linki do autorytatywnych źródeł (.gov/.edu, badania, oficjalne portale) potwierdzających dane.',
  'Brak śródtytułów (treść nie pod RAG)': 'Podziel treść śródtytułami H2/H3 co ~150–300 słów; jeden temat na sekcję.',
  'Zbyt długie sekcje (RAG/chunking)': 'Dodaj więcej śródtytułów H2/H3, by sekcje były krótsze i lepiej wektoryzowane przez LLM.',
  'Generyczne frazy (AI-fluff)': 'Usuń ogólniki („w dzisiejszym świecie…"); zastąp konkretami, danymi i przykładami.',
  'Niskie zagęszczenie encji': 'Wprowadź powiązane encje (nazwy, marki, pojęcia, miejsca) istotne dla tematu — pełność semantyczna.',
  'Brak danych liczbowych / statystyk': 'Dodaj konkretne liczby, %, kwoty, daty i źródła — zwiększa zaufanie i cytowalność w AI.',
  'Brak pliku llms.txt': 'Dodaj /llms.txt wskazujący kluczowe treści i sekcje dla modeli AI.',
  'Brak encji Organization w danych strukturalnych': 'Dodaj JSON-LD Organization (name, url, logo, sameAs) — pomaga AI rozpoznać markę jako encję.',
  'Brak sameAs w encji Organization': 'Dodaj pole sameAs z profilami (social, Wikipedia/Wikidata) do schema Organization.',

  // Local
  'LocalBusiness bez adresu': 'Uzupełnij PostalAddress (ulica, kod, miasto) w schema LocalBusiness.',
  'Brak schema Organization/LocalBusiness': 'Dodaj JSON-LD LocalBusiness z NAP (nazwa, adres, telefon) i godzinami otwarcia.',
  'Brak numeru telefonu': 'Umieść spójny numer telefonu (NAP) w treści i w schema.',
  'Brak adresu (NAP)': 'Dodaj pełny adres (NAP) w stopce i na stronie kontaktowej, spójny z wizytówką Google.',
  'Brak osadzonej mapy': 'Osadź mapę Google na stronie kontaktowej/lokalizacji.',

  // a11y
  'Przyciski/linki bez dostępnej nazwy': 'Dodaj tekst lub aria-label do przycisków/linków-ikon (np. lupa wyszukiwania).',
  'Pola formularza bez etykiety': 'Powiąż każde pole z <label for> lub dodaj aria-label.',
  'Dodatni tabindex': 'Usuń tabindex>0; pozostaw naturalną kolejność fokusu (tabindex 0 lub brak).',

  // Użyteczność
  'Trudna czytelność (długie zdania)': 'Skróć zdania (<20 słów), używaj list, krótkich akapitów i prostego języka.',
  'Niska czytelność tekstu': 'Uprość język, skróć zdania, dodaj śródtytuły i wypunktowania.',
  'Wiele arkuszy stylów': 'Połącz/minifikuj pliki CSS; usuń nieużywane style.',
  'Brak okruszków (breadcrumbs)': 'Dodaj nawigację okruszkową (z BreadcrumbList schema) — orientacja + linkowanie wewnętrzne.',
  'Brak favicon': 'Dodaj favicon (link rel="icon") — rozpoznawalność w kartach i wynikach.',
  'Brak stron zaufania (E-E-A-T)': 'Utwórz brakujące strony zaufania (Polityka prywatności, Regulamin, Kontakt, O nas).',

  // Social
  'Brak tagów Open Graph': 'Dodaj og:title, og:description, og:image, og:url, og:type — lepszy podgląd w social media.',
  'Niekompletne tagi Open Graph': 'Uzupełnij brakujące pola Open Graph (og:url, og:type, og:description).',
  'Brak Twitter Card': 'Dodaj twitter:card (summary_large_image) i powiązane tagi twitter:*.',
};

// Fallback per kategoria, gdy brak dokładnego dopasowania tytułu.
const CATEGORY_FALLBACK = {
  meta: 'Popraw znaczniki meta (title/description) zgodnie z dobrymi praktykami.',
  content: 'Rozbuduj i uporządkuj treść oraz nagłówki pod intencję użytkownika.',
  indexability: 'Uporządkuj sygnały indeksowania (robots, canonical, status, sitemap).',
  links: 'Popraw linkowanie wewnętrzne i usuń linki do błędów/przekierowań.',
  structured: 'Uzupełnij/popraw dane strukturalne JSON-LD wg typu strony.',
  performance: 'Zoptymalizuj wydajność (cache, kompresja, obrazy, skrypty).',
  security: 'Wzmocnij bezpieczeństwo (HTTPS, nagłówki bezpieczeństwa).',
  mobile: 'Zadbaj o poprawną obsługę mobile (viewport, responsywność).',
  international: 'Popraw konfigurację językową (lang, hreflang).',
  social: 'Uzupełnij tagi social (Open Graph / Twitter Card).',
  url: 'Uprość strukturę URL (krótkie, małe litery, myślniki).',
  geo: 'Dostosuj treść pod silniki AI (struktura, E-E-A-T, dane, FAQ).',
  local: 'Uzupełnij sygnały lokalne (NAP, schema LocalBusiness, mapa).',
  architecture: 'Popraw architekturę i przepływ linków wewnętrznych.',
  accessibility: 'Popraw dostępność (etykiety, nazwy elementów, fokus).',
  usability: 'Popraw użyteczność (czytelność, nawigacja, szybkość wyświetlania).',
};

export function recommendationFor(issue) {
  if (!issue) return '';
  if (FIX[issue.title]) return FIX[issue.title];
  // dopasowanie po prefiksie (tytuły z liczbami/parametrami, np. „Błąd HTTP 404")
  if (/^Błąd HTTP|^Błąd:/.test(issue.title || '')) return 'Napraw stronę zwracającą błąd lub przekieruj (301) na działający odpowiednik; usuń linki do niej.';
  if (/^Przekierowanie \(/.test(issue.title || '')) return 'Ogranicz przekierowania i linkuj bezpośrednio do finalnego URL (301 zamiast łańcuchów).';
  if (/^Meta description (zbyt|za)/.test(issue.title || '')) return 'Dopasuj długość opisu do 70–160 znaków z frazą i CTA.';
  if (/^Schema .*brak wymaganych/.test(issue.title || '')) return 'Uzupełnij wymagane pola tego typu Schema.org (bez nich rich results nie zadziała).';
  if (/^Schema .*brak zalecanych/.test(issue.title || '')) return 'Dodaj zalecane pola tego typu Schema.org, by zwiększyć szansę na rich results.';
  if (/^Zduplikowany tytuł/.test(issue.title || '')) return 'Nadaj każdej stronie unikalny tytuł odzwierciedlający jej temat.';
  if (/^Zduplikowany meta description/.test(issue.title || '')) return 'Napisz unikalny opis dla każdej strony.';
  if (/^Near-duplicate|^Bardzo podobna treść/.test(issue.title || '')) return 'Scal podobne strony (301 + canonical) lub zróżnicuj treść/intencję.';
  if (/kanibalizacja/i.test(issue.title || '')) return 'Wybierz jedną stronę docelową na frazę; pozostałe przekształć/scal lub przekieruj.';
  return CATEGORY_FALLBACK[issue.category] || 'Zastosuj dobre praktyki SEO dla tego elementu.';
}
