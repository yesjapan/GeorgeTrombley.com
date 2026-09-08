/**
 * Turns a fenced ```chat block into the styled message exchange used in the
 * printed book — sender name, then their lines, aligned right for the point-of-
 * view character and left for everyone else.
 *
 * Authoring:
 *
 *     ```chat me=George
 *     George: Hey, I won't be able to make our Thursday lunch this week.
 *     Kim: Oh?
 *     Kim: Anything I should know about?
 *     George: Nothing serious, I accepted a new client who insists on Thursdays.
 *     ```
 *
 * `me=` names the character whose messages sit on the right. Omit it and the
 * first speaker is used, which is right for most scenes.
 *
 * Consecutive lines from the same sender are grouped under one name label, the
 * way a phone shows them and the way the book sets them.
 *
 * A code fence is used rather than a custom syntax because it already parses as
 * Markdown: editors highlight it, nothing else in the pipeline has to change,
 * and a chapter still reads sensibly as plain text if this plugin is ever
 * removed.
 */

/**
 * The speech bubble after a sender's name is glyph U+F13E in George's own
 * From-Zero-EMOJI-HEADS font — the same glyph the printed book uses. The font
 * covers only the Private Use Area (U+F100–U+F13F), so it is applied to this
 * one span and nothing else; the faces inside messages are ordinary Unicode
 * emoji and render with the system's emoji font, as they do in the book.
 *
 * Written as a JS escape rather than the literal character so the source stays
 * plain ASCII and cannot be mangled by an editor that does not know the font.
 */
const SPEECH_BUBBLE =
  '<span class="chat__icon" aria-hidden="true">' + '\uF13E' + '</span>';

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Inline emphasis inside a message line.
 *
 * Messages are already set in italic, so italic cannot also carry emphasis the
 * way it does in the surrounding prose. The book underlines instead — "I
 * strongly recommend you DO NOT take this job" — and Markdown has no underline
 * syntax at all, so one is defined here:
 *
 *     __text__   underline
 *     **text**   bold
 *
 * Applied after escaping, so the tags introduced here survive and anything the
 * author typed stays inert.
 */
function inlineMarkup(escaped) {
  return escaped
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(EMOJI, wrapEmoji);
}

/**
 * Emoji inside a message are set upright and monochrome, as in the printed
 * book — Word put those runs in Segoe UI Symbol, whose faces are line drawings,
 * not the colour emoji font. Two things make that happen on the web:
 *
 *   - U+FE0E (variation selector 15) appended to the character asks for the
 *     text-style glyph rather than the colour one, replacing any U+FE0F that
 *     asked for the opposite;
 *   - a span, so CSS can cancel the message's italic and name a monochrome
 *     font first.
 */
const EMOJI = /(\p{Extended_Pictographic})[\uFE0E\uFE0F]?/gu;
const wrapEmoji = (_, ch) => `<span class="chat__emoji">${ch}\uFE0E</span>`;

/** Typographic quotes and dashes, so message text matches the surrounding prose. */
function smarten(value) {
  return value
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/\.\.\./g, '…')
    .replace(/(^|[\s(\[{"])'/g, '$1‘')
    .replace(/'/g, '’')
    .replace(/(^|[\s(\[{])"/g, '$1“')
    .replace(/"/g, '”');
}

function parseMeta(meta) {
  const match = /(?:^|\s)me=("([^"]*)"|\S+)/.exec(meta ?? '');
  if (!match) return null;
  return (match[2] ?? match[1]).trim();
}

/**
 * Split the block into turns: [{ who, lines: [...] }], merging consecutive
 * lines from the same sender.
 */
function parseTurns(source) {
  const turns = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const match = /^([^:]{1,40}):\s*(.*)$/.exec(line);
    if (match) {
      const who = match[1].trim();
      const text = match[2].trim();
      const last = turns[turns.length - 1];
      if (last && last.who === who) {
        if (text) last.lines.push(text);
      } else {
        turns.push({ who, lines: text ? [text] : [] });
      }
      continue;
    }

    // A continuation line with no "Name:" prefix belongs to the previous turn.
    if (turns.length > 0) {
      turns[turns.length - 1].lines.push(line);
    }
  }
  return turns.filter((t) => t.lines.length > 0);
}

function render(turns, me) {
  const parts = [
    '<div class="chat" role="group" aria-label="Text message exchange">',
  ];

  for (const turn of turns) {
    const side = turn.who === me ? 'out' : 'in';
    parts.push(`<div class="chat__turn chat__turn--${side}">`);
    parts.push(
      `<p class="chat__who">${escapeHtml(turn.who)}${SPEECH_BUBBLE}</p>`,
    );
    for (const line of turn.lines) {
      parts.push(
        `<p class="chat__msg">${inlineMarkup(escapeHtml(smarten(line)))}</p>`,
      );
    }
    parts.push('</div>');
  }

  parts.push('</div>');
  return parts.join('');
}

export default function remarkChat() {
  return (tree) => {
    // Shallow walk; chat blocks are always top level in a chapter.
    const visit = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      node.children = node.children.map((child) => {
        if (child.type === 'code' && child.lang === 'chat') {
          const turns = parseTurns(child.value ?? '');
          if (turns.length === 0) return child;
          const me = parseMeta(child.meta) ?? turns[0].who;
          return { type: 'html', value: render(turns, me) };
        }
        visit(child);
        return child;
      });
    };
    visit(tree);
  };
}
