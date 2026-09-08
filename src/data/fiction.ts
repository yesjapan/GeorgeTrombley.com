import { getCollection, type CollectionEntry } from 'astro:content';

export type FictionEntry = CollectionEntry<'fiction'>;

/**
 * Published sample chapters in reading order — the fiction entries that have
 * a URL. Optionally limited to one book.
 *
 * Front-matter entries (`kind: front`) are left out: they exist only to be
 * shown inside the first chapter's reader and have no route of their own, so a
 * link to one is a 404. Every page that links to a chapter goes through here
 * so that cannot happen by accident — it did once, when the home page took
 * "the lowest-ordered published entry" and got the front matter.
 */
export async function getChapters(book?: string): Promise<FictionEntry[]> {
  return (await getCollection('fiction'))
    .filter(
      (e) => !e.data.draft && e.data.kind === 'chapter' && (!book || e.data.book === book),
    )
    .sort((a, b) => a.data.order - b.data.order);
}

/** The book's front matter entry, if one is published. */
export async function getFrontMatter(book: string): Promise<FictionEntry | undefined> {
  return (await getCollection('fiction')).find(
    (e) => e.data.kind === 'front' && e.data.book === book && !e.data.draft,
  );
}
