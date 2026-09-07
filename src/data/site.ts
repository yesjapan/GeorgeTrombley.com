/**
 * Single source of truth for site-wide identity, navigation and outbound links.
 *
 * Everything here is used in more than one place — page <head> tags, the footer,
 * the Person JSON-LD `sameAs` array. Change it once, it changes everywhere.
 */

export const site = {
  name: 'George Trombley',
  /** Used in <title> as "Page — {titleSuffix}" */
  titleSuffix: 'George Trombley',
  tagline: 'Interpreter, textbook author, novelist.',
  description:
    'George Trombley spent eighteen years interpreting Japanese for Microsoft, IBM, NTT DoCoMo and Lucent, then wrote the Japanese From Zero! series. Books, writing, video and the novel Fate Squared.',
  url: 'https://georgetrombley.com',
  locale: 'en_US',
  /** Path to the Open Graph image, relative to the site root. */
  ogImage: '/og.jpg',
  email: 'george@fromzero.com',
} as const;

export const nav = [
  { label: 'Books', href: '/books' },
  { label: 'About', href: '/about' },
  { label: 'Writing', href: '/writing' },
  { label: 'Videos', href: '/videos' },
  { label: 'Fiction', href: '/fiction' },
  { label: 'Buy', href: '/buy' },
] as const;

/**
 * Outbound properties. `sameAs` entries feed the Person JSON-LD, which is how
 * search engines connect this site to the Amazon/Goodreads author records.
 */
export const links = {
  fromZero: 'https://www.fromzero.com',
  fateSquared: 'https://fatesquared.com',
  substack: 'https://polyglotgeorge.substack.com',
  amazonAuthor: 'https://www.amazon.com/George-Trombley/e/B00J0I6L9W',
  goodreads: 'https://www.goodreads.com/author/show/206130.George_Trombley',
} as const;

export const sameAs: string[] = [
  links.fromZero,
  links.fateSquared,
  links.substack,
  links.amazonAuthor,
  links.goodreads,
];

/**
 * Kit (kit.com) inline form for the general "news from George" list.
 * Keep this list separate from the Fate Squared release list.
 *
 * To activate: create the form in Kit (Grow → Landing Pages & Forms → New form),
 * take the numeric id out of the URL, and paste it below. Until it is a real id
 * the signup block does not render at all — see components/KitForm.astro.
 */
export const kitFormId: string | null = null; // e.g. '1234567'

/**
 * Publisher of the From Zero! series, used in Book JSON-LD.
 */
export const publisher = {
  textbooks: 'YesJapan Corporation',
  fiction: 'Sandspeck Press',
} as const;
