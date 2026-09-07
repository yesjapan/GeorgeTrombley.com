import data from './retailers.json';

/**
 * Where to buy each book, by region. Powers /buy.
 *
 * Two sources are combined:
 *
 *  1. `retailers.json` — George's own amzn.to affiliate short links per book per
 *     region, plus a handful of non-Amazon shops with real product URLs. None of
 *     this can be derived from anything, so it is stored verbatim.
 *
 *  2. `isbnRetailers` below — retailers reachable purely from an ISBN. These use
 *     ISBN-lookup URLs rather than the slug-based product URLs that were in the
 *     source catalogue, because a slug URL breaks whenever a retailer re-slugs
 *     its catalogue and an ISBN lookup does not.
 *
 * The upshot: **a new book needs only its `isbn13` to appear on the buy page.**
 * Affiliate links are a bonus on top.
 *
 * Two stores were dropped when this was compiled, both verified dead:
 *   - Book Depository closed in 2023; its product URLs bounce to a generic
 *     Amazon page.
 *   - Right Stuf was folded into the Crunchyroll store; its book URLs are gone.
 *
 * Re-check everything with `node scripts/check-links.mjs`. Amazon, Waterstones,
 * Kinokuniya and Bookshop.org all return 403 to scripted requests — that is
 * bot-blocking, not a dead link, so judge those by hand.
 */

export interface Region {
  code: string;
  label: string;
  /** Amazon domain for this region, or null where Amazon has no local store. */
  amazon: string | null;
}

/** Order shown in the region picker. */
export const regions: Region[] = [
  { code: 'us', label: 'United States', amazon: 'amazon.com' },
  { code: 'ca', label: 'Canada', amazon: 'amazon.ca' },
  { code: 'uk', label: 'United Kingdom', amazon: 'amazon.co.uk' },
  { code: 'de', label: 'Germany', amazon: 'amazon.de' },
  { code: 'fr', label: 'France', amazon: 'amazon.fr' },
  { code: 'it', label: 'Italy', amazon: 'amazon.it' },
  { code: 'es', label: 'Spain', amazon: 'amazon.es' },
  { code: 'jp', label: 'Japan', amazon: 'amazon.co.jp' },
  { code: 'au', label: 'Australia', amazon: 'amazon.com.au' },
  { code: 'no', label: 'Norway', amazon: null },
];

export const defaultRegion = 'us';

const amazonAffiliate = data.amazonAffiliate as Record<string, Record<string, string>>;
const localShops = data.localShops as Record<
  string,
  Record<string, { label: string; url: string }[]>
>;

/** Retailers reachable from an ISBN alone, and the regions they serve. */
const isbnRetailers: {
  label: string;
  regions: string[];
  url: (isbn: string) => string;
}[] = [
  {
    label: 'Barnes & Noble',
    regions: ['us'],
    url: (isbn) => `https://www.barnesandnoble.com/s/${isbn}`,
  },
  {
    label: 'Bookshop.org',
    regions: ['us', 'uk'],
    url: (isbn) => `https://bookshop.org/search?keywords=${isbn}`,
  },
  {
    label: 'Waterstones',
    regions: ['uk'],
    url: (isbn) => `https://www.waterstones.com/books/search/term/${isbn}`,
  },
  {
    label: 'Kinokuniya',
    regions: ['us'],
    url: (isbn) => `https://united-states.kinokuniya.com/bw/${isbn}`,
  },
];

export interface BuyLink {
  label: string;
  url: string;
  /** The one to style as primary. */
  primary?: boolean;
}

/**
 * Canonical display order, widest reach first.
 *
 * Without this the order varies per book: a book that came from the storefront
 * catalogue picks up Walmart and Kinokuniya before the ISBN-derived retailers,
 * while a newer book gets only the ISBN-derived ones. Same retailers, different
 * sequence, which reads as sloppiness on a page where every row is visible at
 * once. Anything not listed here sorts to the end alphabetically.
 */
const RETAILER_ORDER = [
  'Amazon',
  'Barnes & Noble',
  'Walmart',
  'Bookshop.org',
  'Waterstones',
  'Bay Language Books',
  'Kinokuniya',
  'Outland',
];

function rank(label: string): number {
  const i = RETAILER_ORDER.indexOf(label);
  return i === -1 ? RETAILER_ORDER.length : i;
}

/**
 * Every place to buy `slug` in `region`, best first.
 *
 * Amazon leads when available: the stored affiliate link if there is one, else an
 * ISBN search on that region's Amazon domain. Then any stored local shop, then
 * the ISBN-derived retailers that serve the region.
 *
 * Returns an empty array only when a book has neither an ISBN nor any stored
 * link, which the buy page treats as "no listings yet" rather than rendering an
 * empty row.
 */
export function buyLinksFor(
  slug: string,
  region: Region,
  isbn?: string,
): BuyLink[] {
  const links: BuyLink[] = [];

  const affiliate = amazonAffiliate[slug]?.[region.code];
  if (affiliate) {
    links.push({ label: 'Amazon', url: affiliate, primary: true });
  } else if (region.amazon && isbn) {
    links.push({
      label: 'Amazon',
      url: `https://www.${region.amazon}/s?k=${isbn}`,
      primary: true,
    });
  }

  // ISBN-derived retailers go in BEFORE the stored ones, because where both
  // exist the ISBN lookup is the more durable of the two. The catalogue's
  // Waterstones URLs, for example, are slugs like
  // /book/japanese-from-zero-2020-1/george-trombley/... which break the moment
  // the shop re-slugs its catalogue; /books/search/term/<isbn> does not.
  if (isbn) {
    for (const r of isbnRetailers) {
      if (!r.regions.includes(region.code)) continue;
      links.push({ label: r.label, url: r.url(isbn) });
    }
  }

  // Then any stored shop that nothing above already covers — Walmart, Bay
  // Language Books and Outland have no ISBN-lookup URL, so they only exist here.
  for (const shop of localShops[slug]?.[region.code] ?? []) {
    if (links.some((l) => l.label === shop.label)) continue;
    links.push({ label: shop.label, url: shop.url });
  }

  return links.sort((a, b) => {
    const d = rank(a.label) - rank(b.label);
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });
}
