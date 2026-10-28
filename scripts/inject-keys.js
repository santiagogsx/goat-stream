// Release builds: copy Goat Stream's PUBLIC app IDs from the GOAT_CONFIG_JSON secret into
//   desktop/config.json  (the PC app)   and   web/js/config.js  (TV apps + browsers).
// Only identifiers that are safe in a downloadable app are copied:
//   Google client ID, OneDrive client ID, Dropbox app key, sign-in helper URL.
// Secrets (the Google client secret, the TMDB key) are NEVER built into downloads — anyone can unpack an app.
// The Google secret lives only in the sign-in helper (cloud-helper/) and on your own PC's Settings.
const fs = require('fs');
const path = require('path');

const raw = process.env.GOAT_CONFIG_JSON;
if (!raw || !raw.trim()) { console.log('GOAT_CONFIG_JSON not set — building without cloud IDs'); process.exit(0); }
const keys = JSON.parse(raw);
const pub = {
  googleClientId: (keys.google && keys.google.clientId) || '',
  onedriveClientId: (keys.onedrive && keys.onedrive.clientId) || '',
  dropboxAppKey: (keys.dropbox && keys.dropbox.appKey) || '',
  tokenHelper: keys.tokenHelper || '',
};
const root = path.join(__dirname, '..');

// PC app: IDs only (no secrets)
const deskFile = path.join(root, 'desktop', 'config.json');
const desk = JSON.parse(fs.readFileSync(deskFile, 'utf8'));
desk.google = { clientId: pub.googleClientId, clientSecret: '' };
desk.onedrive = { clientId: pub.onedriveClientId };
desk.dropbox = { appKey: pub.dropboxAppKey };
desk.tokenHelper = pub.tokenHelper;
fs.writeFileSync(deskFile, JSON.stringify(desk, null, 2));

// TV apps + browsers
const webFile = path.join(root, 'web', 'js', 'config.js');
let js = fs.readFileSync(webFile, 'utf8');
js = js.replace(/cloud:\s*\{[\s\S]*?\n  \},/, 'cloud: ' + JSON.stringify(pub, null, 4).replace(/\n}/, '\n  }').replace(/\n {4}/g, '\n    ') + ',');
fs.writeFileSync(webFile, js);
console.log('public IDs built in:', Object.entries(pub).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none');
