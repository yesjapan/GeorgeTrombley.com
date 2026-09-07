#!/usr/bin/env node
/**
 * Launch check for georgetrombley.com.
 *
 *   node scripts/check-dns.mjs
 *   node scripts/check-dns.mjs example.com
 *
 * Reports, in the order things have to happen:
 *   1. Which nameservers the domain is on (should be Cloudflare)
 *   2. Whether the apex and www resolve
 *   3. Whether HTTPS works and who is serving it
 *
 * DNS answers here come from Cloudflare's resolver over DoH, so they reflect
 * public state rather than whatever this machine has cached. A nameserver change
 * can still take a few hours to be visible everywhere.
 */

const domain = process.argv[2] ?? 'georgetrombley.com';

async function dns(name, type) {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(15_000) },
    );
    const json = await res.json();
    return (json.Answer ?? []).map((a) => a.data.replace(/\.$/, ''));
  } catch (err) {
    return [`ERROR ${err.message}`];
  }
}

function verdict(ok, text) {
  return `${ok ? 'OK  ' : '--  '} ${text}`;
}

console.log(`\nChecking ${domain}\n${'='.repeat(40)}`);

// 1. Nameservers
const ns = await dns(domain, 'NS');
const onCloudflare = ns.some((n) => n.endsWith('ns.cloudflare.com'));
console.log('\n1. Nameservers');
if (ns.length === 0) console.log('    (none found)');
for (const n of ns) console.log(`    ${n}`);
console.log(
  '   ' +
    verdict(
      onCloudflare,
      onCloudflare
        ? 'on Cloudflare'
        : 'NOT on Cloudflare yet — the zone must live there for the apex to work',
    ),
);

// 2. Records
console.log('\n2. Records');
const apex = await dns(domain, 'A');
const www = [...(await dns(`www.${domain}`, 'CNAME')), ...(await dns(`www.${domain}`, 'A'))];
console.log(`    apex A     : ${apex.join(', ') || '(none)'}`);
console.log(`    www        : ${www.join(', ') || '(none)'}`);
console.log('   ' + verdict(apex.length > 0, apex.length ? 'apex resolves' : 'apex does not resolve'));

// 3. HTTPS
console.log('\n3. HTTPS');
for (const host of [domain, `www.${domain}`]) {
  try {
    const res = await fetch(`https://${host}/`, {
      redirect: 'manual',
      headers: { 'user-agent': 'georgetrombley.com launch check' },
      signal: AbortSignal.timeout(20_000),
    });
    const server = res.headers.get('server') ?? '?';
    const loc = res.headers.get('location');
    const isPages = Boolean(res.headers.get('cf-ray'));
    console.log(
      `    https://${host}  ->  ${res.status}` +
        (loc ? ` -> ${loc}` : '') +
        `  [server: ${server}${isPages ? ', via Cloudflare' : ''}]`,
    );
  } catch (err) {
    console.log(`    https://${host}  ->  not reachable (${err.message.slice(0, 50)})`);
  }
}

console.log(
  '\nA nameserver change can take a few hours to show up everywhere.\n' +
    'Cloudflare emails you when it has taken over the zone.\n',
);
