#!/usr/bin/env node
/**
 * Turn a YouTube @handle (or channel URL) into the UC… channel id that the RSS
 * feed endpoint requires.
 *
 *   npm run resolve-channel -- @JapaneseFromZero
 *   npm run resolve-channel -- https://www.youtube.com/@JapaneseFromZero
 *
 * YouTube's UI shows handles everywhere and the id almost nowhere, but
 * https://www.youtube.com/feeds/videos.xml only accepts channel_id. This fetches
 * the channel page and reads the id out of the markup.
 *
 * Paste the result into src/data/youtube-channels.yml.
 */

const input = process.argv.slice(2).join(' ').trim();

if (!input) {
  console.error('Usage: npm run resolve-channel -- @handle');
  process.exit(1);
}

// Already an id? Nothing to do.
if (/^UC[A-Za-z0-9_-]{22}$/.test(input)) {
  console.log(input);
  process.exit(0);
}

function toUrl(value) {
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  const handle = value.startsWith('@') ? value : '@' + value;
  return 'https://www.youtube.com/' + handle;
}

const url = toUrl(input);

const res = await fetch(url, {
  headers: {
    // Without a browser-ish UA YouTube returns a consent interstitial with no id.
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
    'accept-language': 'en-US,en;q=0.9',
  },
  signal: AbortSignal.timeout(20_000),
}).catch((err) => {
  console.error(`Could not reach ${url}: ${err.message}`);
  process.exit(1);
});

if (!res.ok) {
  console.error(`Could not reach ${url}: HTTP ${res.status} ${res.statusText}`);
  process.exit(1);
}

const html = await res.text();

// Several places carry it; take the first that matches. Order matters: the
// canonical link, the RSS link and `externalId` are the page's OWN channel.
// A bare `"channelId"` is not — a channel page mentions featured and related
// channels too, and the first one in the markup is often one of those. Reading
// that used to hand back a neighbour's id with this channel's title.
const patterns = [
  /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/,
  /application\/rss\+xml[^>]*channel_id=(UC[A-Za-z0-9_-]{22})/,
  /"externalId":"(UC[A-Za-z0-9_-]{22})"/,
];

let id;
for (const pattern of patterns) {
  const match = html.match(pattern);
  if (match) {
    id = match[1];
    break;
  }
}

if (!id) {
  console.error(
    `Found the page but no channel id in it.\n` +
      `YouTube may have served a consent page. Open ${url} in a browser, click\n` +
      `through to any video, and read the id from the "…/channel/UC…" URL instead.`,
  );
  process.exit(1);
}

const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
const label = titleMatch ? titleMatch[1] : '';

console.log(`\n${id}\n`);
console.log('Add to src/data/youtube-channels.yml:\n');
console.log(`- id: ${id}`);
if (label) console.log(`  label: ${label}`);
console.log('');
