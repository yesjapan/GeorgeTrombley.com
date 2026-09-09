/**
 * GitHub sign-in for the writing desk (/admin/, Sveltia CMS).
 *
 * The CMS runs entirely in the browser and needs a GitHub token to commit.
 * GitHub's OAuth flow requires one server-side secret, so this small handler
 * holds it. Two routes:
 *
 *   GET /api/auth            start: send the browser to GitHub to approve
 *   GET /api/auth/callback   finish: swap the code for a token, hand it to the
 *                            CMS window that opened the popup, close
 *
 * The hand-off follows the protocol Decap and Sveltia both speak: the popup
 * posts "authorizing:github" to its opener, the opener answers with the same
 * string, and the popup replies with the token — only to an origin on the
 * allow-list below, so a page elsewhere cannot open this popup and collect a
 * token. A random `state` set in a cookie on the way out and checked on the
 * way back stops a forged callback.
 *
 * Framework-neutral on purpose: it takes a Request and an env object and
 * returns a Response, so the same code serves as a Cloudflare Pages Function
 * or inside a Worker.
 */

/** Origins allowed to receive a token. localhost is for trying the desk locally. */
const ALLOWED_HOSTS = ['georgetrombley.com', 'www.georgetrombley.com', 'localhost', '127.0.0.1'];

const COOKIE = 'gt_cms_state';

/**
 * @param {Request} request
 * @param {{ GITHUB_CLIENT_ID?: string, GITHUB_CLIENT_SECRET?: string }} env
 */
export async function handleAuth(request, env) {
  const url = new URL(request.url);
  const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret } = env;

  if (!clientId || !clientSecret) {
    return html(
      500,
      page(
        'Sign-in is not configured',
        'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not set on the Cloudflare project. See README → Writing from the admin.',
      ),
    );
  }

  const path = url.pathname.replace(/\/+$/, '');

  // ---- start ----------------------------------------------------------------
  if (path.endsWith('/auth')) {
    const siteId = url.searchParams.get('site_id') ?? '';
    if (!ALLOWED_HOSTS.includes(siteId.replace(/:\d+$/, ''))) {
      return html(400, page('Not allowed', `Sign-in was requested for "${escapeHtml(siteId)}", which is not this site.`));
    }
    const state = randomToken();
    const redirect = new URL('https://github.com/login/oauth/authorize');
    redirect.searchParams.set('client_id', clientId);
    redirect.searchParams.set('scope', url.searchParams.get('scope') || 'repo,user');
    redirect.searchParams.set('state', state);
    redirect.searchParams.set('redirect_uri', `${url.origin}${path}/callback`);
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirect.toString(),
        // Lax is enough: GitHub returns the browser here with a top-level GET.
        'Set-Cookie': `${COOKIE}=${state}; Path=/api/auth; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
        'Cache-Control': 'no-store',
      },
    });
  }

  // ---- callback -------------------------------------------------------------
  if (path.endsWith('/auth/callback')) {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const cookieState = readCookie(request.headers.get('Cookie') ?? '', COOKIE);

    if (!code || !state || state !== cookieState) {
      return html(400, handoff({ error: 'Sign-in did not complete (missing or mismatched state). Close this window and try again.' }));
    }

    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'georgetrombley.com writing desk',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${url.origin}${path}`,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.access_token) {
      return html(
        400,
        handoff({ error: data.error_description || data.error || 'GitHub did not issue a token.' }),
      );
    }

    return html(200, handoff({ token: data.access_token }), {
      // The state cookie has done its job.
      'Set-Cookie': `${COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
    });
  }

  return html(404, page('Not found', 'Nothing here.'));
}

/** The page the popup shows while it hands the result to the CMS window. */
function handoff({ token, error }) {
  const provider = 'github';
  const message = token
    ? `authorization:${provider}:success:${JSON.stringify({ provider, token })}`
    : `authorization:${provider}:error:${JSON.stringify({ provider, error })}`;
  const body = error
    ? `<p>${escapeHtml(error)}</p><p>You can close this window.</p>`
    : '<p>Signed in. Returning to the writing desk…</p>';
  return page(error ? 'Sign-in failed' : 'Signed in', body, `
    (function () {
      var allowed = ${JSON.stringify(ALLOWED_HOSTS)};
      var message = ${JSON.stringify(message)};
      var opener = window.opener;
      if (!opener) return;
      function receive(e) {
        if (e.data !== 'authorizing:${provider}') return;
        var host = '';
        try { host = new URL(e.origin).hostname; } catch (_) {}
        if (allowed.indexOf(host) === -1) return;
        window.removeEventListener('message', receive);
        opener.postMessage(message, e.origin);
        setTimeout(function () { window.close(); }, 300);
      }
      window.addEventListener('message', receive, false);
      opener.postMessage('authorizing:${provider}', '*');
    })();
  `);
}

function page(title, body, script = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;color:#1c1917;background:#faf7f2;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.25rem;font-weight:600}</style>
</head><body><main><h1>${escapeHtml(title)}</h1>${body}</main><script>${script}</script></body></html>`;
}

function html(status, body, extra = {}) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}

function readCookie(header, name) {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return '';
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
