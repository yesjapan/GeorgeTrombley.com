// Cloudflare Pages Function: GET /api/auth and /api/auth/callback.
// All the logic lives in cms/github-oauth.js; this file only binds it to
// the Pages runtime. The two secrets come from the Pages project's
// environment variables (Settings → Environment variables).
import { handleAuth } from '../../../cms/github-oauth.js';

export const onRequestGet = ({ request, env }) => handleAuth(request, env);
