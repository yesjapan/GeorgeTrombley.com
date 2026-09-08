# georgetrombley.com

The author hub — books, bio, essays, videos, and the novel. Built with
[Astro](https://astro.build), deployed to Cloudflare Pages, content in Markdown.

Sibling sites: [fromzero.com](https://www.fromzero.com) (the courses),
[fatesquared.com](https://fatesquared.com) (the novel).

---

## Run it locally

```bash
npm install
npm run dev          # http://localhost:4321
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built site, to check it before pushing |
| `npm run check` | TypeScript + Astro diagnostics |
| `npm run videos` | Refresh the video list from YouTube (see below) |
| `npm run resolve-channel -- @handle` | Turn a YouTube @handle into the `UC…` id |
| `npm run import-substack` | Pull new Substack posts (also runs on a schedule) |
| `npm run og` | Regenerate `public/og.jpg`, the social-share card |
| `node scripts/import-covers.mjs <dir>` | Normalise publisher cover art (see below) |
| `node scripts/check-links.mjs <file>` | Check retailer links still resolve |

---

## Adding things

Everything is a file. No CMS, no database, no admin login. Add the file, commit,
push — Cloudflare Pages rebuilds within a minute.

**The build refuses to publish malformed content.** Every content file is
validated against a schema in `src/content.config.ts`, so a typo fails the build
with a message naming the file and the field rather than shipping a broken page.

### A new book

Create `src/content/books/some-slug.md`. The filename becomes the URL
(`/books/some-slug`).

```markdown
---
title: Japanese From Zero! 6
series: japanese-from-zero        # must match a key in src/data/series.ts
order: 6                          # position within the series
cover: ./covers/japanese-from-zero-6.jpg   # optional — see below
isbn13: '9780000000000'           # optional, exactly 13 digits, quoted
coauthors: [Yukari Takenaka]      # optional
level: Advanced                   # optional, free text
formats: [Paperback, Kindle]      # Paperback | Kindle | Audio | Online course
featured: false
buy:
  amazon: https://amzn.to/xxxx
  fromZero: https://www.fromzero.com
blurb: One or two sentences. Used on cards and as the page meta description.
---

The body is the long description. Markdown, whatever length you like.

- Bullet lists work
- So does everything else
```

**A book with no `cover:` still works** — it renders a typographic placeholder
card set in the site's own type, so a book can go up before its art exists.

### Cover art

Don't hand-resize anything. Drop the publisher's files — whatever they're called,
whatever size — into `src/content/books/covers/new/` and run:

```bash
node scripts/import-covers.mjs src/content/books/covers/new
node scripts/import-covers.mjs src/content/books/covers/new --dry   # preview first
```

It renames each file to the book's slug, caps it at 1600px, converts to JPEG, and
writes it to `src/content/books/covers/`. Source PNGs are typically 2–4MB and the
result is ~350KB, which matters because every future cover revision would
otherwise add megabytes to git history forever. The site never renders a cover
wider than 720px, and Astro re-encodes to WebP/AVIF at build time regardless — the
stored file only affects repo weight, not what a visitor downloads.

The filename→slug mapping is an explicit table (`MAP`) at the top of the script.
**A file with no entry is skipped and the script exits non-zero**, so a misnamed
source can't silently land on the wrong book. Add new books to that table.

`covers/new/` is gitignored — it's a scratch drop folder, not part of the repo.

After importing, add the `cover:` line to the book's `.md`. The script reminds
you; it deliberately doesn't edit content files itself.

To add a whole new series, add an entry to `src/data/series.ts` first — the build
will stop and tell you if a book names a series that isn't there.

### An essay

Create `src/content/posts/some-slug.md` → `/writing/some-slug`.

```markdown
---
title: The title
date: 2026-09-14
description: One sentence. Shows on the card and in the RSS feed.
tags: [japanese, teaching]   # optional
draft: false                 # true hides it from the site and the feed entirely
---

The post.
```

Leave `canonicalUrl` unset. It is an SEO escape hatch for conceding search
rankings to some other copy of a post, and this site does not concede any —
including for posts mirrored from Substack.

### Substack mirroring

`.github/workflows/substack.yml` checks the Substack feed every six hours and
commits any new post into `src/content/posts/`. **Publish on Substack and it
appears here on its own**, usually within a few hours.

- **Only new posts are written.** An existing file is skipped, so edits made here
  are never clobbered. The trade-off is that edits made *on Substack* after a
  post is imported do not flow through — re-import that one by hand with
  `npm run import-substack -- --force` if you need them.
- **Imported posts get `sourceUrl`, not `canonicalUrl`.** `sourceUrl` renders the
  "Also published on Substack" credit and links back. `canonicalUrl` would tell
  Google that the Substack copy is the one to rank, which is not wanted:
  Substack's reach comes from its own discovery and recommendations, not from
  search, so there is nothing to gain by handing it the ranking. Two separate
  fields precisely so crediting and conceding can be decided independently.
- The conversion is automated and lands without review, so **skim new posts after
  they arrive**. HTML-to-Markdown is never perfect.

To write directly here instead, just add the `.md` file — no Substack involved,
and nothing to configure.

### A news item

Create `src/content/news/some-slug.md`. These are short — a headline, a date, an
optional link, a sentence or two.

```markdown
---
title: Spanish From Zero! 1 is out
date: 2026-04-15
link: /books/spanish-from-zero-1     # optional; a path here or a full URL
---
A sentence or two of context.
```

---

## The video feed

`/videos` fills itself in from YouTube. Nothing to maintain except the channel
list.

**To switch it on**, edit `src/data/youtube-channels.yml`:

```yaml
- id: UCgn9K2qbymsgC7iPxpkHOlg
  label: Learn Japanese From Zero!
```

The `id` must be the raw `UC…` channel id — YouTube's feed endpoint will not
accept an `@handle`. To convert one:

```bash
npm run resolve-channel -- @JapaneseFromZero
```

While every entry is commented out, `/videos` says so plainly and the rest of the
site is unaffected.

### How the refresh works

`.github/workflows/videos.yml` runs every six hours (and on demand from the
Actions tab). It reads the channel list, fetches each channel's public RSS feed —
**no API key, no quota, nothing to renew** — writes `src/data/videos.json`, and
commits it only if something actually changed. Cloudflare Pages sees the commit
and rebuilds.

Three deliberate behaviours worth knowing:

- **A failing channel cannot empty the page.** If one channel's fetch fails, its
  last-known videos are carried forward instead of dropped. Only a total failure
  with no prior data is an error.
- **No empty commits.** If nothing changed, nothing is written.
- **A malformed channel id fails loudly**, with the command to fix it.

> ⚠️ **If hosting ever moves to GitHub Pages, this breaks.** The workflow commits
> using `GITHUB_TOKEN`, and pushes made with `GITHUB_TOKEN` deliberately do not
> trigger other GitHub Actions. A GitHub Actions-based deploy would therefore
> never fire for a video refresh — `videos.json` would update in the repo and the
> live site would silently never change. Cloudflare Pages is immune because it
> builds on the push through its own git integration. If you must move, give the
> workflow a deploy key or a PAT instead of `GITHUB_TOKEN`.

> GitHub disables scheduled workflows after 60 days with no repository activity.
> The refresh commits keep it alive in normal use; if the site goes quiet for two
> months, press **Run workflow** once in the Actions tab.

---

## The buy page

`/buy` lists every book against the shops that carry it, in ten countries. The
country picker is **pure CSS** — every region is rendered into the page and one
`:has()` rule per region reveals the active one, so it works with JavaScript
switched off and there is nothing to hydrate.

Links come from two places, in `src/data/retailers.ts`:

1. **`retailers.json`** — your amzn.to affiliate links per book per region, plus
   Walmart, Bay Language Books and Outland product URLs. None of this can be
   derived, so it is stored. Generated once from the FromZero storefront data.
2. **ISBN patterns** — Barnes & Noble, Bookshop.org, Waterstones and Kinokuniya
   are all reachable from an ISBN lookup, so they are generated.

**The practical consequence: a new book needs only its `isbn13` to appear on the
buy page in every country.** An affiliate link is a bonus on top; without one the
page falls back to an ISBN search on that region's Amazon domain.

Where a retailer exists in both sources, the ISBN pattern wins — a slug URL like
`/book/japanese-from-zero-2020-1/george-trombley/...` breaks the moment the shop
re-slugs its catalogue, and an ISBN lookup doesn't.

Two stores were dropped as dead when this was compiled, both verified:
**Book Depository** (closed 2023 — its URLs now bounce to a generic Amazon page)
and **Right Stuf** (folded into the Crunchyroll store).

### Checking the links

```bash
node scripts/check-links.mjs A:/path/to/urls.txt
```

Retailer links rot, so re-run this occasionally. **Amazon, Waterstones,
Kinokuniya and Bookshop.org all return 403 to scripted requests** — that is
bot-blocking, not a dead link, and the script labels Amazon's as `BLOCKED` for
that reason. Judge the others by opening one in a browser.

## The newsletter form

`/` has a signup block wired for [Kit](https://kit.com). It is currently
**inactive** — `kitFormId` in `src/data/site.ts` is `null`, so rather than render
a form that goes nowhere, the block links to Substack instead.

To switch it on:

1. In Kit: **Grow → Landing Pages & Forms → New form** (inline; the site supplies
   its own styling). Keep this list separate from the Fate Squared release list.
2. Copy the numeric form id out of the URL.
3. Set `kitFormId` in `src/data/site.ts`.

The form posts natively to Kit with JavaScript disabled; the inline-submit
behaviour is progressive enhancement on top.

---

## Deployment

**Cloudflare Pages**, connected to the GitHub repo. Every push to `main` deploys.

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | 22 |

**Why Cloudflare Pages and not GitHub Pages.** Two reasons:

1. This is an Astro site, so it needs a build step. GitHub Pages can only serve
   a branch as-is, so it would need a GitHub Actions workflow to build — and the
   video cron commits with `GITHUB_TOKEN`, whose pushes deliberately do not
   trigger other workflows. The refresh would update the repo and the live site
   would silently never change. Cloudflare Pages builds on the push through its
   own git integration and sees that commit like any other.
2. Each deploy invalidates the edge cache automatically, and `_headers` /
   `_redirects` are honoured.

(For the record: **fatesquared.com is GitHub Pages behind the Cloudflare proxy**,
not Cloudflare Pages — its nameservers are at Cloudflare but GitHub serves the
files. That works there because it is hand-written HTML with no build step. The
`_headers` file in that repo is inert.)

`public/_headers` and `public/_redirects` are Cloudflare Pages files. `_headers`
caches the fingerprinted `/_astro/*` assets forever and forces HTML to
revalidate. Add old-site paths to `_redirects` as they turn up in the Cloudflare
404 analytics after launch.

There is deliberately **no `public/CNAME`** — that is a GitHub Pages file and
Cloudflare Pages ignores it. The custom domain is configured in the Pages project.

### DNS

- **Registrar:** GoDaddy.
- **DNS / nameservers:** Cloudflare. GoDaddy cannot host this domain's DNS,
  because Cloudflare Pages needs the apex (`georgetrombley.com`, no `www`) to
  resolve to a hostname, and DNS forbids a CNAME at the apex. Cloudflare works
  around that with CNAME flattening; **GoDaddy supports neither CNAME flattening
  nor ALIAS/ANAME records**, so the zone has to live at Cloudflare. GoDaddy
  remains the registrar — only the nameservers move.

Once the zone is on Cloudflare, adding the custom domain in the Pages project
writes the DNS records and issues the certificate automatically. Nothing to
enter by hand.

---

## Design

The concept is 原稿用紙 (*genkō yōshi*), the squared manuscript paper you learn to
write kana on. Three materials and nothing else: **paper** (warm off-white),
**ink** (near-black, brown-cast, never `#000`), and one **seal** vermilion — the
red of a hanko and of a teacher's correcting pen. Book covers are loud, so
everything around them stays quiet and they read as a shelf.

Type is **Instrument Serif** for display and **Instrument Sans** for everything
else. That is deliberate: fatesquared.com uses Instrument Sans, so the two sites
are visibly related without this one inheriting the thriller's indigo-and-magenta
palette.

- **All design tokens live in `src/styles/tokens.css`.** Change a colour, the type
  scale or the spacing rhythm there and it changes everywhere.
- Light and dark are **both** defined on `:root`. No colour has its only
  definition inside a media query.
- `--on-seal` is the text colour drawn on the seal. It flips to near-black in
  dark mode, where the seal is brightened and white-on-seal would fall to about
  3:1 contrast. Use it for anything sitting on a seal-coloured background.
- Reveal-on-scroll hides `[data-reveal]` elements until they scroll into view.
  There is a 2.5-second failsafe in `<head>`: if the reveal script never runs,
  the `js` class is dropped and the page renders plainly rather than staying
  blank. Never remove that without removing the opacity rule too.
- Everything respects `prefers-reduced-motion`.

---

## Still to do

1. **YouTube channel ids** — `src/data/youtube-channels.yml` is commented out.
   `UCgn9K2qbymsgC7iPxpkHOlg` is pre-filled but **not enabled**: it resolves to
   the Spanish-language *Japonés ¡Desde Cero!* channel, last upload January 2023.
   Confirm before switching it on.
2. **Kit form id** — see above.
3. **Two low-resolution covers.** Hiragana From Zero! and Katakana From Zero! came
   from 2014 files that are only 384x500. They look fine on the shelf cards, but
   on their own book pages they render soft on a high-DPI screen — the source is
   384px where roughly 700px is wanted. Every other cover is 2232x2907. If larger
   originals exist, drop them in and re-run the import; nothing else needs to
   change.
4. **Kanji From Zero! 2 has no ISBN** — it was missing from the source catalogue.
   This is now the one visible gap on `/buy`: that book shows only an Amazon
   link, where every other book shows four or five. Adding `isbn13` to
   `src/content/books/kanji-from-zero-2.md` lights up Barnes & Noble,
   Bookshop.org, Waterstones and Kinokuniya automatically, in every country.
5. **Kana From Zero! has two ISBNs in the wild** — `9780989654593` (US listings,
   used here) and `9780989654586` (UK/Book Depository). Confirm which belongs on
   the page.
6. **Kanji From Zero! 2 co-authors are unconfirmed.** Volume 1's cover credits
   George Trombley, Yukari Takenaka, Kanako Hatanaka and Justin McGowan; volume 2
   currently lists only Yukari Takenaka because its credits were not to hand.
7. **Spanish From Zero! 1 author order.** The printed cover reads "Hugo Canedo,
   George Trombley". The site lists George first, as it does on every book, since
   this is his author site. Say the word if it should match the cover instead.
8. **Bio copy on `/about` is a draft.** It is written in first person from
   verifiable public facts. Rewrite it in your own voice — that page more than any
   other should sound like you.
