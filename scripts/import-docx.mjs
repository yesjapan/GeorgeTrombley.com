#!/usr/bin/env node
/**
 * Convert a chapter out of the Fate Squared manuscript into the Markdown this
 * site reads.
 *
 *   node scripts/import-docx.mjs "Fate Squared Chapter 1.docx"
 *   node scripts/import-docx.mjs <file.docx> --out src/content/fiction/x.md
 *   node scripts/import-docx.mjs <file.docx> --heading "2 - Kim"
 *
 * Why not a generic converter (pandoc, word2md, Writage): none of them know
 * what a chat exchange is. They would emit the sender names as bold paragraphs
 * and the messages as loose italic ones, and every exchange in the chapter
 * would then need rebuilding into a ```chat block by hand.
 *
 * This reads the manuscript's own paragraph styles instead, which are already
 * semantic:
 *
 *   1Text, 1Textnoindent, 1Textchaptertop   body prose
 *   ChatboxRIGHT / ChatboxLEFT              a text message, and which side
 *   ChatboxRIGHT + bold run                 the sender's name
 *   Heading1                                chapter break
 *   13Space3ctrl3                           a beat inside an exchange
 *
 * so the mapping is exact rather than inferred. Nothing is uploaded anywhere;
 * a .docx is a zip of XML and this reads it directly.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);

const args = process.argv.slice(2);
const source = args.find((a) => !a.startsWith('--'));
const outArg = args.find((a) => a.startsWith('--out='))?.slice('--out='.length);
const headingArg = args
  .find((a) => a.startsWith('--heading='))
  ?.slice('--heading='.length);

if (!source) {
  console.error('Usage: node scripts/import-docx.mjs <file.docx> [--out=path] [--heading="1 - George"]');
  process.exit(1);
}

/** Body styles that are ordinary prose. */
const PROSE = new Set(['1Text', '1Textnoindent', '1Textchaptertop']);
/** A blank spacer used inside an exchange; carries no text. */
const SPACER = new Set(['13Space3ctrl3']);

/**
 * Strip Private Use Area codepoints.
 *
 * Every sender name in the manuscript ends in U+F13E — the speech bubble from
 * the custom From-Zero-EMOJI-HEADS font. A PUA codepoint means nothing without
 * that font installed, so it would render as a blank box for readers. The
 * reader draws its own bubble in SVG instead, so these are dropped.
 */
const stripPua = (s) => s.replace(/[-]/gu, '');

const decode = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

/** Read word/document.xml out of the .docx without unpacking the whole thing. */
async function readDocumentXml(file) {
  const out = path.join(tmpdir(), `docx-${Date.now()}`);
  // PowerShell is always present on this machine and avoids a zip dependency.
  // FileShare.ReadWrite so a copy still works while Word has the file open.
  const ps = `
    $src = ${JSON.stringify(path.resolve(file))}
    $tmp = ${JSON.stringify(out + '.docx')}
    $in  = New-Object System.IO.FileStream($src,'Open','Read','ReadWrite')
    $o   = New-Object System.IO.FileStream($tmp,'Create','Write')
    $in.CopyTo($o); $o.Close(); $in.Close()
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($tmp)
    $e = $zip.GetEntry('word/document.xml')
    [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, ${JSON.stringify(out + '.xml')}, $true)
    $zip.Dispose()
    Remove-Item $tmp -Force
  `;
  await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
  return readFile(out + '.xml', 'utf8');
}

/** One paragraph, reduced to what matters. */
function parseParagraphs(xml) {
  return [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)].map((m) => {
    const body = m[1];
    const style = /<w:pStyle w:val="([^"]+)"/.exec(body)?.[1] ?? '';

    // Runs, each carrying its own bold/italic/underline.
    const runs = [...body.matchAll(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g)].map((r) => {
      // A <w:br/> is a line break inside a paragraph. In a chat paragraph it
      // separates two messages that were typed as one block, so it has to
      // survive extraction — without it, "...up to no good!" and "So, if we're
      // still on..." ran together with no space between them.
      const seg = r[1].replace(/<w:br\s*\/>/g, '<w:t>&#32;</w:t>');
      const props = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(seg)?.[1] ?? '';
      const text = stripPua(
        [...seg.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
          .map((t) => decode(t[1]))
          .join(''),
      );
      return {
        text,
        bold: /<w:b\/>|<w:b w:val="(?:true|1)"/.test(props),
        italic: /<w:i\/>|<w:i w:val="(?:true|1)"/.test(props),
        underline: /<w:u [^>]*w:val="(?!none)/.test(props),
      };
    });

    return { style, runs, text: runs.map((r) => r.text).join('') };
  });
}

/** Runs -> Markdown, merging adjacent runs that share formatting. */
function runsToMarkdown(runs, { forChat = false } = {}) {
  const list = runs.filter((r) => r.text);
  const PLAIN = { bold: false, italic: false, underline: false };
  const fmtOf = (r) => `${r.bold}|${r.italic}|${r.underline}`;
  const isInert = (r) => !/[\p{L}\p{N}]/u.test(r.text);

  const merged = [];
  for (let i = 0; i < list.length; i++) {
    let r = list[i];
    const last = merged[merged.length - 1];

    // A run of nothing but punctuation and space cannot show emphasis, but
    // Word will happily leave italic on one: type an italic sentence, then go
    // back and add the full stop before it, and that stop is italic. Emitted
    // literally it becomes `*.*` in the Markdown.
    //
    // Such a run only ever LOSES emphasis. Formatted like the run before it,
    // it is simply the end of that run — the full stop closing an italic
    // thought stays italic. Formatted differently, it is either sandwiched
    // inside a span (the runs either side match: a comma mid-thought) and
    // takes that formatting, or it sits at a boundary and is set plain —
    // the stop after an italic title stays roman, and the stray italic stop
    // after plain prose loses its italic.
    if (isInert(r) && !(last && fmtOf(last) === fmtOf(r))) {
      const next = list.slice(i + 1).find((x) => !isInert(x));
      const inside = last && next && fmtOf(last) === fmtOf(next);
      const fmt = inside ? last : PLAIN;
      r = { text: r.text, bold: fmt.bold, italic: fmt.italic, underline: fmt.underline };
    }

    if (
      last &&
      last.bold === r.bold &&
      last.italic === r.italic &&
      last.underline === r.underline
    ) {
      last.text += r.text;
    } else {
      merged.push({ ...r });
    }
  }

  return merged
    .map((r) => {
      // Word often carries formatting across the trailing space; moving it
      // outside keeps "*word* next" rather than "*word *next".
      const lead = /^\s*/.exec(r.text)[0];
      const trail = /\s*$/.exec(r.text)[0];
      const core = r.text.slice(lead.length, r.text.length - trail.length);
      if (!core) return r.text;

      let out = core;
      // Chat messages are set in italic already, so italic there is not
      // emphasis and would be noise; the book underlines instead.
      if (r.italic && !forChat) out = `*${out}*`;
      if (r.underline) out = `__${out}__`;
      if (r.bold && !forChat) out = `**${out}**`;
      return lead + out + trail;
    })
    .join('');
}

const ENDS_SENTENCE = /[.!?…"”'’)\]]\s*$|[\u{1F300}-\u{1FAFF}]\s*$/u;

/**
 * Collapse a turn's lines. In the manuscript a long message is hard-wrapped
 * into several paragraphs to fit the printed column, so those have to be
 * rejoined — the web reader reflows and would otherwise break mid-sentence in
 * the wrong places. A line that already ends a sentence is treated as a
 * complete message and kept separate.
 */
function joinLines(lines) {
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev && !ENDS_SENTENCE.test(prev)) {
      out[out.length - 1] = `${prev.replace(/\s+$/, '')} ${line.trim()}`;
    } else {
      out.push(line.trim());
    }
  }
  return out.filter(Boolean);
}

function chatBlock(turns, pov) {
  // `me` is whoever the manuscript sets on the right, decided once for the
  // whole chapter rather than per block. Some exchanges are a single incoming
  // message with no reply; taking the first speaker there would have put Kim
  // on George's side of the page for those. A chapter written from Kim's point
  // of view would set ChatboxRIGHT on her lines and produce me=Kim by itself.
  const me = pov || turns.find((t) => t.side === 'RIGHT')?.who || '';
  const lines = [];
  for (const turn of turns) {
    for (const msg of joinLines(turn.lines)) {
      lines.push(`${turn.who}: ${msg}`);
    }
  }
  return ['```chat' + (me ? ` me=${me}` : ''), ...lines, '```'].join('\n');
}

function convert(paragraphs, heading) {
  // Find the chapter, skipping front matter (copyright, forward, dedication).
  const headings = paragraphs
    .map((p, i) => ({ i, p }))
    .filter(({ p }) => p.style === 'Heading1' && p.text.trim());

  let start = 0;
  let end = paragraphs.length;
  let chapterTitle = '';

  const wanted = heading
    ? headings.find((h) => h.p.text.trim() === heading)
    : headings.find((h) => /^\d+\s*[-–—]/.test(h.p.text.trim()));

  if (wanted) {
    chapterTitle = wanted.p.text.trim();
    start = wanted.i + 1;
    const nextHeading = headings.find((h) => h.i > wanted.i);
    if (nextHeading) end = nextHeading.i;
  } else {
    console.warn('No chapter heading found; converting the whole document.');
  }

  // The right-hand speaker for the whole chapter: the most frequent sender
  // on ChatboxRIGHT. Decided up front so every block agrees.
  const rightCounts = new Map();
  {
    let who = null;
    for (let i = start; i < end; i++) {
      const p = paragraphs[i];
      if (!p.style.startsWith('Chatbox')) continue;
      const t = p.text.trim();
      if (!t) continue;
      if (p.runs.some((r) => r.bold && r.text.trim())) {
        who = t;
        if (p.style.includes('RIGHT')) {
          rightCounts.set(who, (rightCounts.get(who) ?? 0) + 1);
        }
      }
    }
  }
  const pov =
    [...rightCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

  const out = [];
  let turns = [];
  let current = null;

  const flushChat = () => {
    if (current) turns.push(current);
    current = null;
    if (turns.length) {
      out.push(chatBlock(turns, pov));
      turns = [];
    }
  };

  for (let i = start; i < end; i++) {
    const p = paragraphs[i];
    const text = p.text.trim();

    if (SPACER.has(p.style)) continue;

    if (p.style.startsWith('Chatbox')) {
      const side = p.style.includes('RIGHT') ? 'RIGHT' : 'LEFT';
      if (!text) continue;
      const isName = p.runs.some((r) => r.bold && r.text.trim());
      if (isName) {
        if (current) turns.push(current);
        current = { who: text.replace(/\s+$/, ''), side, lines: [] };
      } else if (current) {
        current.lines.push(runsToMarkdown(p.runs, { forChat: true }).trim());
      }
      continue;
    }

    flushChat();

    if (!text) continue;
    if (PROSE.has(p.style) || p.style === '') {
      out.push(runsToMarkdown(p.runs).replace(/\s+/g, ' ').trim());
    }
  }
  flushChat();

  return { chapterTitle, body: out.join('\n\n') };
}

const xml = await readDocumentXml(source);
const paragraphs = parseParagraphs(xml);
const { chapterTitle, body } = convert(paragraphs, headingArg);

const words = body.split(/\s+/).filter(Boolean).length;
const chats = (body.match(/```chat/g) ?? []).length;

if (outArg) {
  await writeFile(outArg, body + '\n', 'utf8');
  console.log(`Wrote ${outArg}`);
} else {
  process.stdout.write(body + '\n');
}

console.error(
  `\nChapter heading : ${chapterTitle || '(none found)'}\n` +
    `Paragraphs      : ${paragraphs.length} in document\n` +
    `Words converted : ${words}\n` +
    `Chat blocks     : ${chats}\n`,
);
