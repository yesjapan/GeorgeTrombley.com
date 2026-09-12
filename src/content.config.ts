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
      /**
       * Accepts a list, and also a single string with commas in it — which is
       * what the writing desk produces when several tags are typed into one
       * box — and always yields clean separate tags.
       */
      tags: z
        .union([z.array(z.string()), z.string()])
        .default([])
        .transform((t) =>
          (Array.isArray(t) ? t : [t])
            .flatMap((s) => s.split(','))
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      hero: image().optional(),
      draft: z.boolean().default(false),
      /**
       * SEO override: tells search engines some OTHER copy of this post is the
       * one to rank. Normally left unset — this site is the canonical home for
       * everything it publishes, including posts mirrored from Substack, since
       * Substack's reach comes from its own discovery rather than from search.
       *
       * Deliberately separate from `sourceUrl` below: crediting where something
       * first appeared and conceding search ranking to it are different
       * decisions, and wiring them to one field meant you could not do one
       * without the other.
       */
      canonicalUrl: z.string().url().optional(),
      /** Where the post first appeared. Renders as a credit line and link. */
      sourceUrl: z.string().url().optional(),
      /** Human-readable origin, e.g. "Substack". Shown with `sourceUrl`. */
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

/**
 * Fiction excerpts — sample chapters published to sell the novel.
 *
 * Separate from `posts` because they are a different kind of thing: they belong
 * to a book rather than to a date, they are read rather than skimmed, and they
 * end in a buy button rather than in another essay. They are also deliberately
 * kept out of the RSS feed, which is for the essays.
 *
 * `draft` defaults to TRUE here, the opposite of everywhere else. An excerpt
 * with no text yet is the normal starting state, and a half-written chapter
 * going live by accident is worse than one that needs a flag flipped.
 */
const fiction = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/fiction' }),
  schema: ({ image }) =>
    z.object({
      /**
       * `chapter` is a readable excerpt with its own URL. `front` is the book's
       * front matter — cover, title page, copyright, dedication, and any
       * prefatory text in the body — shown before the first chapter so opening
       * the sample feels like opening the book. A front entry has no route.
       */
      kind: z.enum(['chapter', 'front']).default('chapter'),
      /** e.g. "Chapter One", or the book title for a front entry. */
      title: z.string(),
      /**
       * The heading as it appears on the page in the book, when that differs
       * from the title — Fate Squared names chapters "1 - George".
       */
      heading: z.string().optional(),
      /** Which book this belongs to, e.g. "Fate Squared". */
      book: z.string(),
      /** Reading order within the book. Front matter is 0. */
      order: z.number(),
      description: z.string(),
      /** Where to send a reader who finishes and wants the book. */
      buyUrl: z.string().url().optional(),
      draft: z.boolean().default(true),

      // ---- front matter only ----
      cover: image().optional(),
      /**
       * The title-page lockup: an SVG in src/assets/, inlined so it takes the
       * page's ink colour in both colour schemes. Without one, the title page
       * is set as text from `title`, `subtitle` and `author`.
       */
      lockup: z.string().regex(/\.svg$/, 'lockup must be an .svg in src/assets/').optional(),
      subtitle: z.string().optional(),
      author: z.string().optional(),
      /** One line at the foot of the title page, e.g. "© 2026 … All rights reserved." */
      copyright: z.string().optional(),
    }),
});

/**
 * Reader comments on essays — content, like everything else.
 *
 * The comment form posts to /api/comments, which commits a file here with
 * `approved: false` (and a [CI Skip] commit message, so nothing is built).
 * Approving it in the writing desk is an ordinary commit, and the site
 * rebuilds with the comment under its essay. Nothing about the reader is
 * kept beyond the name they typed and the text — no email, no address.
 *
 * The body is rendered as plain paragraphs, never as Markdown or HTML, so a
 * comment cannot put markup into the page.
 */
const comments = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/comments' }),
  schema: z.object({
    /** The essay's id — its filename without .md, i.e. the /writing/ slug. */
    post: z.string(),
    name: z.string().max(60),
    date: z.coerce.date(),
    approved: z.boolean().default(false),
    /** George's own reply, shown with an Author mark. */
    author: z.boolean().default(false),
  }),
});

export const collections = { books, posts, news, fiction, comments };
