import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Collection schemas.
 *
 * These are the contract for every content file on the site. They exist so that
 * "just drop a markdown file in" is actually safe: a typo in frontmatter fails
 * the build with a precise message instead of quietly rendering a broken card.
 *
 * Cover images live next to the book files in `src/content/books/covers/` and are
 * referenced as `./covers/name.png`. Going through `image()` rather than a public/
 * URL means Astro emits responsive AVIF/WebP and knows the intrinsic dimensions,
 * so covers never cause layout shift.
 */

const books = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/books' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      /** Must match a key in src/data/series.ts */
      series: z.string(),
      /** Position within the series. Sorts the shelf. */
      order: z.number(),
      subtitle: z.string().optional(),
      isbn13: z
        .string()
        .regex(/^\d{13}$/, 'isbn13 must be exactly 13 digits, no hyphens')
        .optional(),
      cover: image().optional(),
      publishedYear: z.number().int().min(1990).max(2100).optional(),
      coauthors: z.array(z.string()).default([]),
      /** Free text, e.g. "Beginner" or "Upper beginner". */
      level: z.string().optional(),
      formats: z
        .array(z.enum(['Paperback', 'Kindle', 'Audio', 'Online course']))
        .default([]),
      buy: z
        .object({
          amazon: z.string().url().optional(),
          barnesNoble: z.string().url().optional(),
          bookshop: z.string().url().optional(),
          fromZero: z.string().url().optional(),
        })
        .default({}),
      /** One or two sentences, used on cards and in meta descriptions. */
      blurb: z.string(),
      featured: z.boolean().default(false),
      draft: z.boolean().default(false),
    }),
});

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      description: z.string(),
      tags: z.array(z.string()).default([]),
      hero: image().optional(),
      draft: z.boolean().default(false),
      /**
       * Set on imported posts so the canonical URL still points at the place the
       * post was first indexed. New posts written here leave it unset and
       * canonical to this site.
       */
      canonicalUrl: z.string().url().optional(),
      /** Human-readable origin, e.g. "Substack". Shown as a small credit line. */
      originallyPublishedAt: z.string().optional(),
    }),
});

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    /**
     * Optional link — a news item is often just a pointer. Accepts either an
     * external URL or a path on this site, since most items point at a book
     * page here rather than somewhere else.
     */
    link: z
      .string()
      .refine(
        (v) => v.startsWith('/') || /^https?:\/\//.test(v),
        'link must be an absolute URL (https://…) or a site-relative path (/books/…)',
      )
      .optional(),
  }),
});

export const collections = { books, posts, news };
