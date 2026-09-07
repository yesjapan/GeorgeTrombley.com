#!/usr/bin/env node
/**
 * Check that every outbound retailer link still resolves.
 *
 *   node scripts/check-links.mjs                 # check src/data/retailers.ts
 *   node scripts/check-links.mjs urls.txt        # check a newline-separated list
 *
 * Retailer links rot. Book Depository closed in 2023, Right Stuf folded into the
 * Crunchyroll store, and product URLs get retired whenever an edition changes.
 * A dead "Buy" button is worse than no button, so run this before shipping a
 * change to the buy page — and once in a while afterwards.
 *
 * Amazon in particular is hostile to scripted requests. A 4xx/5xx from Amazon
 * usually means bot-blocking rather than a dead link, so those are reported as
 * BLOCKED rather than DEAD and need a human to eyeball them. Short amzn.to links
 * are judged on whether they redirect to an amazon domain at all, which is the
 * part that actually tells us the short link is still live.
 */

import { readFile } from 'node:fs/promises';

const CONCURRENCY = 8;
const TIMEOUT_MS = 20_000;

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const input = process.argv[2];

async function collectUrls() {
  if (input) {
    const text = await readFile(input, 'utf8');
    return [...new Set(text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean))];
  }
  const mod = await import('../src/data/retailers.ts').catch(() => null);
  if (!mod) {
    console.error('Pass a file of URLs, or run this after src/data/retailers.ts exists.');
    process.exit(1);
  }
  const urls = new Set();
  for (const book of Object.values(mod.buyLinks ?? {})) {
    for (const region of Object.values(book)) {
      for (const link of region.links ?? []) urls.add(link.url);
    }
  }
  return [...urls];
}

function host(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '?';
  }
}

async function check(url) {
  const controller = AbortSignal.timeout(TIMEOUT_MS);
  const isShort = /(^|\.)amzn\.to$/.test(host(url));

  try {
    // Short links: don't follow. A redirect to an amazon domain is the signal.
    if (isShort) {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        headers: { 'user-agent': UA },
        signal: controller,
      });
      const loc = res.headers.get('location') ?? '';
      if (res.status >= 300 && res.status < 400 && /amazon\./i.test(loc)) {
        return { url, status: res.status, state: 'OK', note: host(loc) };
      }
      if (res.status >= 300 && res.status < 400) {
        return { url, status: res.status, state: 'SUSPECT', note: 'redirects to ' + (loc || '?') };
      }
      return { url, status: res.status, state: 'DEAD', note: 'no redirect' };
    }

    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'user-agent': UA, accept: 'text/html' },
      signal: controller,
    });

    const amazonish = /amazon\./i.test(host(res.url));
    if (res.ok) {
      // Some shops return 200 with a "not found" body. Cheap sniff.
      const body = (await res.text()).slice(0, 4000).toLowerCase();
      if (/page not found|no longer available|we couldn't find|product not found/.test(body)) {
        return { url, status: res.status, state: 'DEAD', note: 'not-found page' };
      }
      return { url, status: res.status, state: 'OK', note: host(res.url) };
    }
    if (amazonish && (res.status === 403 || res.status === 503 || res.status === 429)) {
      return { url, status: res.status, state: 'BLOCKED', note: 'amazon bot block' };
    }
    return { url, status: res.status, state: 'DEAD', note: res.statusText };
  } catch (err) {
    return { url, status: 0, state: 'DEAD', note: err.message.slice(0, 60) };
  }
}

const urls = await collectUrls();
console.log(`Checking ${urls.length} URLs...\n`);

const results = [];
let i = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (i < urls.length) {
      const url = urls[i++];
      results.push(await check(url));
    }
  }),
);

const by = (s) => results.filter((r) => r.state === s);
const groups = ['DEAD', 'SUSPECT', 'BLOCKED', 'OK'];

for (const g of groups) {
  const rows = by(g);
  if (!rows.length) continue;
  console.log(`\n=== ${g} (${rows.length}) ===`);
  if (g === 'OK') {
    const hosts = {};
    for (const r of rows) hosts[host(r.url)] = (hosts[host(r.url)] ?? 0) + 1;
    for (const [h, n] of Object.entries(hosts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${h}`);
    }
  } else {
    for (const r of rows.sort((a, b) => host(a.url).localeCompare(host(b.url)))) {
      console.log(`  ${String(r.status).padStart(3)}  ${host(r.url).padEnd(28)} ${r.note}`);
      console.log(`       ${r.url}`);
    }
  }
}

console.log(
  `\nSummary: ${by('OK').length} ok, ${by('BLOCKED').length} blocked, ` +
    `${by('SUSPECT').length} suspect, ${by('DEAD').length} dead.`,
);
if (by('DEAD').length) process.exitCode = 1;
