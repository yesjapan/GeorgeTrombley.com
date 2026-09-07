#!/usr/bin/env node
/**
 * Refresh src/data/videos.json from the channels listed in
 * src/data/youtube-channels.yml.
 *
 *   npm run videos
 *
 * Uses YouTube's public per-channel RSS feed, which needs no API key and has no
 * quota. It runs at build time rather than in the browser because that endpoint
 * sends no CORS headers, so a client-side fetch cannot work without a proxy.
 *
 * Design notes:
 *
 * - Per-channel failure isolation. If one channel's fetch fails, that channel's
 *   previously-known videos are carried over rather than dropped, so a transient
 *   YouTube blip can never silently empty the videos page. Only a total failure
 *   with no prior data is treated as an error.
 * - No-op when nothing changed, so the scheduled workflow produces no empty
 *   commits.
 *
 * Exit codes: 0 = up to date or written, 1 = could not produce any data.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { XMLParser } from 'fast-xml-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANNELS_FILE = path.join(ROOT, 'src', 'data', 'youtube-channels.yml');
const OUT_FILE = path.join(ROOT, 'src', 'data', 'videos.json');

/** Total videos kept across all channels. */
const MAX_TOTAL = 24;
/** Default per-channel cap before merging. */
const DEFAULT_PER_CHANNEL = 10;
const FEED_BASE = 'https://www.youtube.com/feeds/videos.xml?channel_id=';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function readChannels() {
  const raw = await readFile(CHANNELS_FILE, 'utf8');
  const parsed = parseYaml(raw);
  if (!parsed) return [];
  if (!Array.isArray(parsed)) {
    throw new Error(`${CHANNELS_FILE} must contain a YAML list (or be entirely commented out).`);
  }

  return parsed.map((entry, i) => {
    if (!entry?.id) {
      throw new Error(`Channel #${i + 1} in youtube-channels.yml has no "id".`);
    }
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(entry.id)) {
      throw new Error(
        `Channel #${i + 1} id "${entry.id}" is not a YouTube channel id.\n` +
          'It must start with "UC" and be 24 characters. To convert an @handle:\n' +
          `    npm run resolve-channel -- ${entry.id}`,
      );
    }
    return {
      id: entry.id,
      label: entry.label ?? '',
      limit: Number.isInteger(entry.limit) ? entry.limit : DEFAULT_PER_CHANNEL,
    };
  });
}

async function readExisting() {
  try {
    const parsed = JSON.parse(await readFile(OUT_FILE, 'utf8'));
    return Array.isArray(parsed?.videos) ? parsed.videos : [];
  } catch {
    return [];
  }
}

async function fetchChannel(channel) {
  const res = await fetch(FEED_BASE + encodeURIComponent(channel.id), {
    headers: { 'user-agent': 'georgetrombley.com video refresh' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

  const feed = parser.parse(await res.text())?.feed;
  if (!feed) throw new Error('response was not a YouTube feed');

  const channelTitle = typeof feed.title === 'string' ? feed.title : channel.label;

  return asArray(feed.entry)
    .map((entry) => {
      const videoId = entry['yt:videoId'];
      if (!videoId) return null;
      const media = entry['media:group'] ?? {};
      const thumb = media['media:thumbnail']?.['@_url'];
      return {
        id: String(videoId),
        title: String(entry.title ?? '').trim(),
        published: new Date(entry.published).toISOString(),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        // i.ytimg.com serves these; hqdefault always exists, maxres often does not.
        thumbnail: thumb ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        channelId: channel.id,
        channelLabel: channel.label || channelTitle || '',
      };
    })
    .filter(Boolean)
    .slice(0, channel.limit);
}

async function main() {
  const channels = await readChannels();
  const existing = await readExisting();

  if (channels.length === 0) {
    console.log(
      'No channels configured in src/data/youtube-channels.yml — nothing to do.\n' +
        'Uncomment an entry there (and run `npm run resolve-channel -- @handle` to\n' +
        'turn a handle into a UC… id) to switch the videos page on.',
    );
    return;
  }

  const collected = [];
  const failures = [];

  const results = await Promise.allSettled(channels.map(fetchChannel));

  results.forEach((result, i) => {
    const channel = channels[i];
    if (result.status === 'fulfilled') {
      collected.push(...result.value);
      console.log(`  ok     ${channel.label || channel.id} — ${result.value.length} videos`);
      return;
    }

    // Carry this channel's last-known videos forward rather than dropping them.
    const carried = existing.filter((v) => v.channelId === channel.id);
    collected.push(...carried);
    failures.push({ channel, reason: result.reason?.message ?? String(result.reason) });
    console.warn(
      `  FAILED ${channel.label || channel.id} — ${result.reason?.message ?? result.reason}` +
        (carried.length ? ` (kept ${carried.length} previously-known)` : ' (no prior data)'),
    );
  });

  if (collected.length === 0) {
    console.error('\nNo videos could be collected from any channel and no prior data exists.');
    process.exit(1);
  }

  // De-duplicate — a video can legitimately appear once per configured channel.
  const byId = new Map();
  for (const video of collected) {
    if (!byId.has(video.id)) byId.set(video.id, video);
  }

  const videos = [...byId.values()]
    .sort((a, b) => Date.parse(b.published) - Date.parse(a.published))
    .slice(0, MAX_TOTAL);

  // Compare on the video list only. `updated` changes every run by definition,
  // so including it would defeat the no-op check and commit on every cron tick.
  const previous = JSON.stringify(existing);
  if (previous === JSON.stringify(videos)) {
    console.log(`\nNo change — ${videos.length} videos already current.`);
    return;
  }

  await writeFile(
    OUT_FILE,
    JSON.stringify({ updated: new Date().toISOString(), videos }, null, 2) + '\n',
    'utf8',
  );
  console.log(`\nWrote ${videos.length} videos to src/data/videos.json`);
  if (failures.length) {
    console.log(`${failures.length} channel(s) failed; their previous videos were kept.`);
  }
}

main().catch((err) => {
  console.error(`\nvideo refresh failed: ${err.message}`);
  process.exit(1);
});
