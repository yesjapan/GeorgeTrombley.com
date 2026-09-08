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

const SPEECH_BUBBLE =
  '<svg class="chat__icon" viewBox="0 0 20 16" aria-hidden="true" focusable="false">' +
  '<path d="M2.6 0h14.8A2.6 2.6 0 0 1 20 2.6v8.1a2.6 2.6 0 0 1-2.6 2.6H7.9L3.2 16a.6.6 0 0 1-.95-.5v-2.2H2.6A2.6 2.6 0 0 1 0 10.7V2.6A2.6 2.6 0 0 1 2.6 0Z" fill="currentColor"/>' +
  '<circle cx="5.8" cy="6.6" r="1.35" fill="var(--chat-dot)"/>' +
  '<circle cx="10" cy="6.6" r="1.35" fill="var(--chat-dot)"/>' +
  '<circle cx="14.2" cy="6.6" r="1.35" fill="var(--chat-dot)"/>' +
  '</svg>';

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
      parts.push(`<p class="chat__msg">${escapeHtml(smarten(line))}</p>`);
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
