#!/usr/bin/env node
/**
 * One-time import of the Substack archive into src/content/posts/.
 *
 *   npm run import-substack
 *   npm run import-substack -- --force     # overwrite files that already exist
 *   npm run import-substack -- --feed=https://other.substack.com/feed
 *
 * The site is the source of truth for writing from here on. Imported posts keep
 * `canonicalUrl` pointing at the Substack permalink, because those URLs are
 * already indexed — this site should not compete with them for the same text.
 * Posts written here afterwards leave `canonicalUrl` unset and canonical to
 * georgetrombley.com.
 *
 * HTML-to-Markdown conversion is never perfect. Read every generated file
 * before committing.
 */

import { writeFile, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import TurndownService from 'turndown';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'src', 'content', 'posts');
const DEFAULT_FEED = 'https://polyglotgeorge.substack.com/feed';

const args = process.argv.slice(2);
const force = args.includes('--force');
const feedArg = args.find((a) => a.startsWith('--feed='));
const FEED = feedArg ? feedArg.slice('--feed='.length) : DEFAULT_FEED;

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

// Substack wraps most images in figure/figcaption and link-previews in divs.
// Strip the chrome so the markdown is plain prose.
turndown.addRule('substackChrome', {
  filter: (node) =>
    node.nodeName === 'DIV' &&
    /subscription-widget|button-wrapper|captioned-image|image-link-expand|digest-post-embed/.test(
      node.getAttribute?.('class') ?? '',
    ),
  replacement: () => '',
});

turndown.addRule('figure', {
  filter: 'figure',
  replacement: (content) => '\n\n' + content.trim() + '\n\n',
});

function slugify(title) {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

/** YAML-safe single-quoted scalar. */
function yamlString(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function firstSentences(markdown, max = 200) {
  const plain = markdown
    .replace(/^#.*$/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + '…').trim();
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Fetching ${FEED}`);
  const res = await fetch(FEED, {
    headers: { 'user-agent': 'georgetrombley.com importer' },
  });
  if (!res.ok) {
    throw new Error(`Feed request failed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    cdataPropName: '__cdata',
  });
  const parsed = parser.parse(xml);
  const rawItems = parsed?.rss?.channel?.item;
  if (!rawItems) throw new Error('No <item> elements found — is this an RSS feed?');
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  let skipped = 0;

  for (const item of items) {
    const text = (v) =>
      v == null ? '' : typeof v === 'object' ? (v.__cdata ?? v['#text'] ?? '') : String(v);

    const title = text(item.title).trim();
    if (!title) continue;

    const link = text(item.link).trim();
    const date = new Date(text(item.pubDate));
    const html = text(item['content:encoded']) || text(item.description);

    const slug = slugify(title);
    const file = path.join(OUT_DIR, `${slug}.md`);

    if (!force && (await exists(file))) {
      console.log(`  skip   ${slug}.md (exists)`);
      skipped++;
      continue;
    }

    const body = turndown.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
    const description = text(item.description)
      ? firstSentences(turndown.turndown(text(item.description)))
      : firstSentences(body);

    const frontmatter = [
      '---',
      `title: ${yamlString(title)}`,
      `date: ${date.toISOString().slice(0, 10)}`,
      `description: ${yamlString(description)}`,
      `canonicalUrl: ${yamlString(link)}`,
      "originallyPublishedAt: 'Substack'",
      '---',
      '',
    ].join('\n');

    await writeFile(file, frontmatter + body + '\n', 'utf8');
    console.log(`  write  ${slug}.md`);
    written++;
  }

  console.log(`\nDone. ${written} written, ${skipped} skipped.`);
  if (written > 0) {
    console.log('Read each generated file before committing — HTML→Markdown always needs a pass.');
  }
}

main().catch((err) => {
  console.error(`\nImport failed: ${err.message}`);
  process.exit(1);
});
