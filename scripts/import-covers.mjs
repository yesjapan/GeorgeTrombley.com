#!/usr/bin/env node
/**
 * Import book cover art into src/content/books/covers/.
 *
 *   node scripts/import-covers.mjs <source-dir>
 *   node scripts/import-covers.mjs <source-dir> --dry
 *
 * Publisher cover files arrive as very large PNGs with inconsistent names. This
 * normalises them: renames to the book's slug, downsizes, and converts to JPEG.
 *
 * Why downsize and convert: the source PNGs are ~2.5MB each and every future
 * cover revision would add that again to git history. The site never renders a
 * cover wider than 720px, so a 1600px JPEG is still better than 2x the largest
 * use. Astro re-encodes to WebP/AVIF at build time regardless — the source file
 * only affects repo weight and build speed, not what a visitor downloads.
 *
 * Mapping is by explicit table, not by guessing from the filename, so a
 * misnamed source file fails loudly instead of silently landing on the wrong
 * book.
 */

import { readdir, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(ROOT, 'src', 'content', 'books', 'covers');

/** Longest edge of the stored source image. */
const MAX_WIDTH = 1600;
const QUALITY = 92;

/**
 * source filename (case-insensitive, extension ignored) → book slug.
 * The slug must match a file in src/content/books/.
 */
const MAP = {
  'japanesefz1-cover-(front)': 'japanese-from-zero-1',
  'japanesefz2-cover-(front)': 'japanese-from-zero-2',
  'japanesefz3-cover-(front)': 'japanese-from-zero-3',
  'japanesefz4-cover-(front)': 'japanese-from-zero-4',
  'japanesefz5-cover-(front)': 'japanese-from-zero-5',
  'koreanfz1-cover-(front)': 'korean-from-zero-1',
  'koreanfz2-cover-(front)': 'korean-from-zero-2',
  'koreanfz3-cover-(front)': 'korean-from-zero-3',
  'spanishfz1-cover-(front)': 'spanish-from-zero-1',
  'kanji from zero 1': 'kanji-from-zero-1',
  'kana from zero': 'kana-from-zero',
  'kanjifz2 cover front': 'kanji-from-zero-2',
  'hiraganafz': 'hiragana-from-zero',
  'katakanafz': 'katakana-from-zero',
  'hangul from zero': 'hangul-from-zero',
};

const srcDir = process.argv[2];
const dry = process.argv.includes('--dry');

if (!srcDir) {
  console.error('Usage: node scripts/import-covers.mjs <source-dir> [--dry]');
  process.exit(1);
}

const kb = (n) => Math.round(n / 1024) + ' KB';

const files = (await readdir(srcDir)).filter((f) =>
  /\.(png|jpe?g|webp|tiff?)$/i.test(f),
);

if (files.length === 0) {
  console.error(`No image files in ${srcDir}`);
  process.exit(1);
}

await mkdir(DEST, { recursive: true });

let done = 0;
const unmapped = [];

for (const file of files.sort()) {
  const key = path.basename(file, path.extname(file)).toLowerCase();
  const slug = MAP[key];

  if (!slug) {
    unmapped.push(file);
    continue;
  }

  const from = path.join(srcDir, file);
  const to = path.join(DEST, `${slug}.jpg`);
  const before = (await stat(from)).size;
  const meta = await sharp(from).metadata();

  if (dry) {
    console.log(`  would write ${slug}.jpg  <- ${file} (${meta.width}x${meta.height}, ${kb(before)})`);
    continue;
  }

  // toBuffer before writing: sharp cannot read and write the same path, and
  // this also keeps a partially-written file from replacing a good one.
  const buf = await sharp(from)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  await sharp(buf).toFile(to);
  const after = (await stat(to)).size;

  console.log(
    `  ${slug}.jpg`.padEnd(30) +
      `${meta.width}x${meta.height} -> ${MAX_WIDTH}w   ` +
      `${kb(before)} -> ${kb(after)}  (-${Math.round((1 - after / before) * 100)}%)`,
  );
  done++;
}

if (unmapped.length) {
  console.error(`\n${unmapped.length} file(s) had no entry in MAP and were skipped:`);
  for (const f of unmapped) console.error(`  ${f}`);
  console.error('Add them to MAP in scripts/import-covers.mjs.');
  process.exit(1);
}

console.log(`\n${dry ? 'Dry run.' : `Wrote ${done} cover(s) to src/content/books/covers/.`}`);
if (!dry) {
  console.log('Remember: a book only shows its cover once its .md has a `cover:` line.');
}
