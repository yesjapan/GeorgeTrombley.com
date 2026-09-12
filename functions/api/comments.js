// Cloudflare Pages Function: POST /api/comments.
// All the logic lives in cms/comments.js; this file only binds it to the
// Pages runtime. Secrets come from the Pages project's environment variables.
import { handleComment } from '../../cms/comments.js';

export const onRequest = ({ request, env }) => handleComment(request, env);
