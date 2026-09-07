#!/usr/bin/env node
/**
 * Generate public/og.jpg — the 1200x630 card that Twitter/X, Facebook, iMessage,
 * Slack and Discord show when someone pastes a link to the site.
 *
 *   npm run og
 *
 * Re-run this only if the name, tagline or portrait changes. The output is
 * committed, so a normal build does not depend on it.
 *
 * Text is drawn as an SVG overlay rendered by sharp's librsvg. That means it uses
 * fonts installed on THIS machine, not the webfonts the site loads — so the
 * families below are deliberately generic serif/sans stacks that resolve
 * everywhere. The card is a thumbnail; exact typeface fidelity is not the point.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTRAIT = path.join(ROOT, 'src', 'assets', 'author.jpg');
const OUT = path.join(ROOT, 'public', 'og.jpg');

const W = 1200;
const H = 630;
const PHOTO_W = 430;
const SQUARE = 42; // matches --square in tokens.css

const PAPER = '#faf7f0';
const INK = '#191512';
const INK_MUTED = '#4f473f';
const SEAL = '#b8392e';

function gridLines() {
  const lines = [];
  for (let x = SQUARE; x < W - PHOTO_W; x += SQUARE) {
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${H}"/>`);
  }
  for (let y = SQUARE; y < H; y += SQUARE) {
    lines.push(`<line x1="0" y1="${y}" x2="${W - PHOTO_W}" y2="${y}"/>`);
  }
  return lines.join('');
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="${PAPER}"/>

  <g stroke="${INK}" stroke-opacity="0.075" stroke-width="1">
    ${gridLines()}
  </g>

  <rect x="72" y="86" width="26" height="26" fill="${SEAL}"/>

  <text x="72" y="228" font-family="Georgia, 'Times New Roman', serif"
        font-size="82" fill="${INK}">George Trombley</text>

  <text x="72" y="296" font-family="Georgia, 'Times New Roman', serif"
        font-size="40" font-style="italic" fill="${SEAL}">Interpreter. Author. Novelist.</text>

  <line x1="72" y1="352" x2="${W - PHOTO_W - 72}" y2="352"
        stroke="${INK}" stroke-opacity="0.2" stroke-width="1"/>

  <text x="72" y="410" font-family="Helvetica, Arial, sans-serif"
        font-size="27" fill="${INK_MUTED}">Japanese &#183; Korean &#183; Kanji &#183; Spanish From Zero!</text>

  <text x="72" y="452" font-family="Helvetica, Arial, sans-serif"
        font-size="27" fill="${INK_MUTED}">and the novel Fate Squared</text>

  <text x="72" y="556" font-family="Helvetica, Arial, sans-serif"
        font-size="23" letter-spacing="3" fill="${INK}"
        fill-opacity="0.45">GEORGETROMBLEY.COM</text>
</svg>`;

const portrait = await sharp(PORTRAIT)
  .resize(PHOTO_W, H, { fit: 'cover', position: 'top' })
  .greyscale()
  .modulate({ brightness: 1.02 })
  .toBuffer();

await sharp(Buffer.from(svg))
  .composite([{ input: portrait, left: W - PHOTO_W, top: 0 }])
  .jpeg({ quality: 88, mozjpeg: true })
  .toFile(OUT);

console.log(`Wrote ${path.relative(ROOT, OUT)} (${W}x${H})`);
