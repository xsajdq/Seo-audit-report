// Klasyfikacja typu podstrony: wpis blogowy, usługa, produkt, kategoria,
// kontakt, o nas, lokalizacja, prawne, strona główna itp.
const TYPES = {
  homepage: 'Strona główna',
  blog: 'Wpis blogowy / artykuł',
  service: 'Usługa',
  product: 'Produkt',
  category: 'Kategoria / listing',
  location: 'Lokalizacja',
  contact: 'Kontakt',
  about: 'O nas',
  legal: 'Strona prawna',
  page: 'Inna podstrona',
};

export function pageTypeLabel(type) {
  return TYPES[type] || TYPES.page;
}

export function classifyPageType(page) {
  const seo = page.seo || {};
  let path = '/';
  try { path = new URL(page.url).pathname.toLowerCase().replace(/\/+$/, '') || '/'; } catch { /* noop */ }
  const types = (seo.structuredTypes || []).join(' ');
  const title = (seo.title || '').toLowerCase();
  const wordCount = seo.wordCount || 0;
  const internal = seo.internalLinkCount || 0;
  const hasAuthor = seo.geo?.hasAuthor;
  const hasDate = seo.geo?.hasPublishDate || seo.geo?.hasModifiedDate;

  const is = (re) => re.test(path) || re.test(title);

  // Strona główna
  if (path === '/' || path === '') return mk('homepage', 1, ['root URL']);

  // Prawne
  if (is(/polityk|privacy|regulamin|terms|cookie|rodo|gdpr|warunki/)) return mk('legal', 0.9, ['URL/tytuł prawny']);

  // Kontakt
  if (is(/kontakt|contact|skontaktuj/) || /ContactPage/i.test(types)) return mk('contact', 0.9, ['kontakt']);

  // O nas
  if (is(/o-nas|onas|o-firmie|about|o-mnie|zespol|team|nasza-historia/) || /AboutPage/i.test(types)) return mk('about', 0.85, ['o nas']);

  // Produkt
  if (/Product\b/i.test(types) || is(/\/produkt|\/product|\/sklep|\/shop|\/p\//)) return mk('product', 0.85, ['schema/URL produkt']);

  // Wpis blogowy / artykuł
  if (/Article|BlogPosting|NewsArticle/i.test(types)) return mk('blog', 0.95, ['schema Article']);
  if (is(/\/blog|\/artykul|\/poradnik|\/aktualnosci|\/news|\/wpis|\/post|\/baza-wiedzy|\/wiedza/)) return mk('blog', 0.85, ['URL blog']);
  if (hasAuthor && hasDate && wordCount > 300) return mk('blog', 0.7, ['autor + data + treść']);

  // Usługa
  if (/Service\b/i.test(types)) return mk('service', 0.9, ['schema Service']);
  if (is(/\/uslug|\/oferta|\/service|\/co-robimy|\/realizacj|\/specjalizacj|\/zakres/)) return mk('service', 0.8, ['URL usługa']);

  // Lokalizacja (local landing)
  if (is(/\/lokalizacj|\/oddzial|\/miasto|\/region|\/gdzie|\/dojazd/) || /LocalBusiness/i.test(types)) return mk('location', 0.7, ['lokalizacja']);

  // Kategoria / listing (dużo linków, mało treści)
  if (is(/\/kategoria|\/category|\/tag\/|\/produkty|\/oferty|\/uslugi$/) || (internal > 25 && wordCount < 300)) {
    return mk('category', 0.65, ['listing: dużo linków, mało treści']);
  }

  return mk('page', 0.4, ['brak jednoznacznych sygnałów']);
}

function mk(type, confidence, signals) {
  return { type, label: TYPES[type], confidence, signals };
}

export { TYPES };
