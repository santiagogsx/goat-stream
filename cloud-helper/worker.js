// Goat Stream sign-in helper — a free Cloudflare Worker.
// Google won't let an app finish a sign-in without the app's private "client secret", and a secret can't live
// inside an app that anyone can download. So the TV sends the one-time sign-in code here; this helper adds the
// secret (kept in Cloudflare's encrypted settings) and passes the request to Google. It stores nothing.
// OneDrive and Dropbox don't need a secret; the helper also forwards them for TVs whose browser engine blocks
// those requests (Samsung / LG).
//
// Settings (Cloudflare dashboard → your Worker → Settings → Variables and Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (secret), ONEDRIVE_CLIENT_ID, DROPBOX_APP_KEY,
//   REDIRECT_URI = https://santiagogsx.github.io/goat-stream/relay/oauth.html
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (req.method !== 'POST' || url.pathname !== '/token') return new Response('Goat Stream sign-in helper 🐐', { headers: CORS });

    let b;
    try { b = await req.json(); } catch (e) { return json({ error: 'bad_request' }, 400); }
    const providers = {
      google: { token: 'https://oauth2.googleapis.com/token', id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET },
      onedrive: { token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', id: env.ONEDRIVE_CLIENT_ID, scope: 'offline_access Files.Read.All User.Read' },
      dropbox: { token: 'https://api.dropboxapi.com/oauth2/token', id: env.DROPBOX_APP_KEY },
    };
    const p = providers[b.provider];
    if (!p || !p.id) return json({ error: 'provider_not_set_up' }, 400);

    const form = new URLSearchParams({ client_id: p.id });
    if (p.secret) form.set('client_secret', p.secret);
    if (p.scope) form.set('scope', p.scope);
    if (b.grant_type === 'authorization_code') {
      // only finish sign-ins that started from Goat Stream's own hand-off page
      if (!b.code || !b.code_verifier || b.redirect_uri !== env.REDIRECT_URI) return json({ error: 'not_allowed' }, 400);
      form.set('grant_type', 'authorization_code');
      form.set('code', b.code);
      form.set('code_verifier', b.code_verifier);
      form.set('redirect_uri', b.redirect_uri);
    } else if (b.grant_type === 'refresh_token' && b.refresh_token) {
      form.set('grant_type', 'refresh_token');
      form.set('refresh_token', b.refresh_token);
    } else {
      return json({ error: 'unsupported_grant_type' }, 400);
    }
    const r = await fetch(p.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    return new Response(await r.text(), { status: r.status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  },
};
