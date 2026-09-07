/**
 * Series metadata and shelf order.
 *
 * The `series` field on every book in src/content/books must match a key here.
 * Order in this object is the order the series appear on /books — flagship first.
 */

export interface Series {
  /** Display name, e.g. "Japanese From Zero!" */
  title: string;
  /** One line, shown under the series heading. */
  description: string;
  /** Written language the series teaches, used in the shelf label. */
  language: string;
}

export const series = {
  'japanese-from-zero': {
    title: 'Japanese From Zero!',
    language: 'Japanese',
    description:
      'The five-volume course that starts at absolute zero and builds to advanced grammar, introducing hiragana, katakana and kanji progressively rather than all at once.',
  },
  // Titled "The Kana Books" rather than "Kana From Zero!" because one of the
  // three books inside it is itself called Kana From Zero! — using the same name
  // for the group and a member of the group reads as a mistake.
  'kana-from-zero': {
    title: 'The Kana Books',
    language: 'Hiragana & Katakana',
    description:
      'Dedicated workbooks for the two Japanese syllabaries, for readers who want the writing systems on their own — hiragana and katakana separately, or both in one volume.',
  },
  'kanji-from-zero': {
    title: 'Kanji From Zero!',
    language: 'Kanji',
    description:
      'A structured path through the Japanese characters, built on the same progressive method as the main course.',
  },
  'korean-from-zero': {
    title: 'Korean From Zero!',
    language: 'Korean',
    description:
      'The From Zero! method applied to Korean, written with Korean linguist Reed Bullen and a team of native-speaking co-authors.',
  },
  // The Korean counterpart to the Kana books: the writing system on its own,
  // separate from the three-volume course. Sits after Korean From Zero! for the
  // same reason the Kana books sit after Japanese From Zero!.
  'hangul-from-zero': {
    title: 'Hangul From Zero!',
    language: 'Hangul',
    description:
      'The Korean alphabet on its own, for readers who want to clear the writing system before starting the course — or who only came for hangul.',
  },
  'spanish-from-zero': {
    title: 'Spanish From Zero!',
    language: 'Spanish',
    description:
      'The From Zero! method carried into a fourth language, written with Hugo Canedo.',
  },
} as const satisfies Record<string, Series>;

export type SeriesKey = keyof typeof series;

/** Shelf order for /books — object key order, made explicit. */
export const seriesOrder = Object.keys(series) as SeriesKey[];

export function getSeries(key: string): Series | undefined {
  return (series as Record<string, Series>)[key];
}
