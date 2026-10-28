/* Goat Stream — one UI shared by:
 *   - the Windows app (Electron window, served by the PC server)          -> MODE 'desktop'
 *   - the Android TV app (bundled in a WebView, native 4K player)         -> MODE 'tv'
 *   - any other TV / phone browser on the home network (served by the PC) -> MODE 'browser' */
(() => {
'use strict';

const TV = !!window.GoatTV;
const DESKTOP = !!window.goatDesktop;
const MODE = TV ? 'tv' : DESKTOP ? 'desktop' : 'browser';
const IS_LOCALHOST = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (TV) document.documentElement.classList.add('tv');
if (MODE === 'browser' && !matchMedia('(hover: hover)').matches) document.documentElement.classList.add('remote');

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k, d) { try { const v = localStorage.getItem('goat.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('goat.' + k, JSON.stringify(v)); } catch (e) { /* storage full / blocked */ } },
};
function toast(msg, ms = 3800) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 450);
}
window.__goatToast = msg => toast(msg);
function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtSize(b) { if (!b) return ''; const gb = b / 1073741824; return gb >= 1 ? gb.toFixed(1) + ' GB' : Math.round(b / 1048576) + ' MB'; }
function fmtRuntime(sec) { if (!sec || sec < 60) return ''; const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }

const SOURCE_NAMES = { local: 'My PC', gdrive: 'Google Drive', dropbox: 'Dropbox', onedrive: 'OneDrive' };
const CLOUDS = ['gdrive', 'onedrive', 'dropbox'];
// account provider -> sign-in name used by the server's /oauth/<name>/… routes
const SIGNIN = { gdrive: 'google', dropbox: 'dropbox', onedrive: 'onedrive' };
const PROVIDER_BADGE = { gdrive: ['g', 'G'], dropbox: ['d', 'D'], onedrive: ['o', 'O'] };
const providerIcon = p => `<div class="provider ${PROVIDER_BADGE[p][0]}">${PROVIDER_BADGE[p][1]}</div>`;
const I = {
  play: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M11 10.5h2V17h-2zM11 7h2v2h-2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 3a7 7 0 0 1 5.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 11H7.8l5.6-5.6L12 4l-8 8 8 8 1.4-1.4L7.8 13H20z"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" transform="translate(1.4 0)"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M15.4 4.6 8 12l7.4 7.4 1.4-1.4-6-6 6-6z"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="m8.6 4.6 7.4 7.4-7.4 7.4-1.4-1.4 6-6-6-6z"/></svg>',
  rew: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="12" y="16" font-size="6.5" text-anchor="middle" fill="currentColor" font-family="Arial" font-weight="700">10</text></svg>',
  fwd: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="12" y="16" font-size="6.5" text-anchor="middle" fill="currentColor" font-family="Arial" font-weight="700">10</text></svg>',
  vol: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9v6h4l5 5V4L7 9zm18.7 1.4-1.4-1.4-2.3 2.3-2.3-2.3-1.4 1.4 2.3 2.3-2.3 2.3 1.4 1.4 2.3-2.3 2.3 2.3 1.4-1.4-2.3-2.3z"/></svg>',
  fs: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 5v14l9-7zm10 0h2v14h-2z"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/></svg>',
  tv: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 5h18v12H3zm2 2v8h14V7zm3 12h8v2H8z"/></svg>',
};

// Streaming services: Goat Stream can't play their DRM-protected video, but it can launch their official apps / sites.
const STREAMING_APPS = [
  { name: 'Netflix', pkg: 'com.netflix.ninja', url: 'https://www.netflix.com', color: '#b20710' },
  { name: 'Prime Video', pkg: 'com.amazon.amazonvideo.livingroom', url: 'https://www.primevideo.com', color: '#1a98ff' },
  { name: 'Disney+', pkg: 'com.disney.disneyplus', url: 'https://www.disneyplus.com', color: '#0b3c8c' },
  { name: 'Max', pkg: 'com.wbd.stream', url: 'https://www.max.com', color: '#002be7' },
  { name: 'Hulu', pkg: 'com.hulu.livingroomplus', url: 'https://www.hulu.com', color: '#118a52' },
  { name: 'Apple TV', pkg: 'com.apple.atve.androidtv.appletv', url: 'https://tv.apple.com', color: '#333' },
  { name: 'Paramount+', pkg: 'com.cbs.ott', url: 'https://www.paramountplus.com', color: '#0064ff' },
  { name: 'Peacock', pkg: 'com.peacocktv.peacockandroid', url: 'https://www.peacocktv.com', color: '#222' },
  { name: 'YouTube', pkg: 'com.google.android.youtube.tv', url: 'https://www.youtube.com', color: '#cc0000' },
  { name: 'Tubi', pkg: 'com.tubitv', url: 'https://tubitv.com', color: '#5b1cc4' },
  { name: 'Pluto TV', pkg: 'tv.pluto.android', url: 'https://pluto.tv', color: '#2b2b2b' },
  { name: 'Crunchyroll', pkg: 'com.crunchyroll.crunchyroid', url: 'https://www.crunchyroll.com', color: '#f47521' },
  // Movies you bought from Microsoft: Windows' Films & TV app on the PC; Movies Anywhere (links Microsoft purchases, US) on TVs
  { name: 'Microsoft Movies & TV', pcOnly: true, pcUrl: 'mswindowsvideo:', url: 'https://www.microsoft.com/store/movies-and-tv', color: '#107c10' },
  { name: 'Movies Anywhere', pkg: 'com.disney.moviesanywhere', url: 'https://moviesanywhere.com', color: '#22305a' },
];
const visibleApps = () => STREAMING_APPS.filter(a => !a.pcOnly || DESKTOP);
function appTileHTML(a, full) {
  const installed = !S.installedApps || !a.pkg || S.installedApps.includes(a.pkg);
  return `<button class="app-tile focusable" style="${full ? 'width:100%;' : ''}background:${a.color}" data-act="launchApp" data-pkg="${a.pkg || ''}" data-url="${a.url}" data-pcurl="${a.pcUrl || ''}">${esc(a.name)}${TV && !installed ? '<small>Get app</small>' : ''}</button>`;
}

// ---------- networking ----------
// TV app: all HTTP goes through the native bridge (no CORS / mixed-content limits). Elsewhere: fetch.
const bridgeWaits = {};
let bridgeSeq = 0;
window.__goatHttp = (id, status, text) => { const f = bridgeWaits[id]; delete bridgeWaits[id]; if (f) f({ status, text }); };
function http(method, url, headers, body) {
  headers = headers || {};
  if (TV) {
    return new Promise(res => {
      const id = ++bridgeSeq;
      bridgeWaits[id] = res;
      window.GoatTV.http(id, method, url, JSON.stringify(headers), body == null ? '' : String(body));
    });
  }
  return fetch(url, { method, headers, body: body == null ? undefined : body })
    .then(async r => ({ status: r.status, text: await r.text() }), e => ({ status: 0, text: String(e) }));
}
const cloud = window.GoatCloud.create(http);

// Where the PC server is. Desktop + browser: same origin. TV app: remembered address.
const conn = {
  base: TV ? store.get('server', '') : '',
  token: MODE === 'desktop' || (MODE === 'browser' && IS_LOCALHOST) ? '' : store.get('token', ''),
};
function needsPairing() { return MODE === 'tv' ? !(conn.base && conn.token) : (MODE === 'browser' && !IS_LOCALHOST && !conn.token); }

async function api(path, method, data) {
  const headers = { 'Content-Type': 'application/json' };
  if (conn.token) headers['x-goat-token'] = conn.token;
  const r = await http(method || 'GET', conn.base + path, headers, data === undefined ? null : JSON.stringify(data));
  if (!r.status) throw Object.assign(new Error('Can\'t reach your PC'), { offline: true });
  let j = null;
  try { j = r.text ? JSON.parse(r.text) : null; } catch (e) { /* ignore */ }
  if (r.status >= 400) throw Object.assign(new Error((j && j.error) || 'Error ' + r.status), { status: r.status });
  return j;
}
// URLs for <img>/<video> (they can't send headers, so the device token rides in the query string)
function srvUrl(path, params) {
  const q = new URLSearchParams(params || {});
  if (conn.token) q.set('t', conn.token);
  const qs = q.toString();
  return conn.base + path + (qs ? (path.includes('?') ? '&' : '?') + qs : '');
}
function imgUrl(u) { return !u ? '' : u.startsWith('/') ? srvUrl(u) : u; }

// ---------- state ----------
const S = {
  items: [], byId: {}, titles: [], titleMap: new Map(),
  progress: store.get('progress', {}), mylist: store.get('mylist', {}),
  online: false, serverName: '', page: 'home', query: '', hero: null, folderFilter: '',
  installedApps: null, settings: null, scanning: false,
  showApps: store.get('showApps', true),   // Netflix/Hulu/etc. launcher row — can be switched off in Settings
};

async function loadLibrary(quiet) {
  try {
    const lib = await api('/api/library');
    S.online = true;
    S.serverName = lib.serverName;
    S.scanning = lib.scanning;
    S.items = lib.items;
    S.showApps = lib.showApps !== false;
    store.set('showApps', S.showApps);
    if (TV) {
      store.set('lib', lib.items);
      api('/api/cloud/accounts').then(a => mergeAccounts(a.accounts)).catch(() => {});
    }
    try { mergeUserData(await api('/api/userdata')); } catch (e) { /* older server */ }
  } catch (e) {
    if (e.status === 401 && MODE !== 'desktop') { unlink(true); return; }
    S.online = false;
    if (TV) S.items = store.get('lib', []);
    if (!quiet) toast(TV ? 'Your PC is offline — showing your saved library. Cloud movies still play.' : 'Can\'t reach the Goat Stream server.');
  }
  buildTitles();
  render();
}

function mergeAccounts(remote) {
  const local = store.get('accounts', []);
  const merged = remote.map(r => {
    const l = local.find(x => x.id === r.id && x.refreshToken === r.refreshToken);
    return l ? Object.assign({}, r, { accessToken: l.accessToken, expiresAt: l.expiresAt }) : r;
  });
  store.set('accounts', merged);
}

function mergeUserData(ud) {
  const push = { progress: {}, mylist: {} };
  for (const kind of ['progress', 'mylist']) {
    const remote = ud[kind] || {}, local = S[kind];
    for (const [k, v] of Object.entries(remote)) if (!local[k] || local[k].t < v.t) local[k] = v;
    for (const [k, v] of Object.entries(local)) if (!remote[k] || remote[k].t < v.t) push[kind][k] = v;
    store.set(kind, local);
  }
  if (Object.keys(push.progress).length || Object.keys(push.mylist).length) api('/api/userdata', 'POST', push).catch(() => {});
}

function saveProgress(id, pos, dur) {
  if (!id || !(dur > 0)) return;
  const entry = { pos: Math.round(pos), dur: Math.round(dur), t: Date.now() };
  S.progress[id] = entry;
  store.set('progress', S.progress);
  api('/api/userdata', 'POST', { progress: { [id]: entry } }).catch(() => {});
}
function toggleMyList(key) {
  const on = !(S.mylist[key] && S.mylist[key].on);
  S.mylist[key] = { on, t: Date.now() };
  store.set('mylist', S.mylist);
  api('/api/userdata', 'POST', { mylist: { [key]: S.mylist[key] } }).catch(() => {});
  toast(on ? 'Added to My List' : 'Removed from My List', 2000);
  return on;
}
const inList = key => !!(S.mylist[key] && S.mylist[key].on);

// Group files into titles: one card per movie, one card per show (episodes inside)
function buildTitles() {
  S.byId = {};
  const map = new Map();
  for (const it of S.items) {
    S.byId[it.id] = it;
    const isShow = !!it.show;
    const base = isShow ? it.show : it.title || it.name;
    const key = (isShow ? 's:' : 'm:') + (it.tmdbId ? 't' + it.tmdbId : base.toLowerCase() + (isShow ? '' : '|' + (it.year || '')));
    let t = map.get(key);
    if (!t) { t = { key, kind: isShow ? 'show' : 'movie', name: it.metaTitle || base, year: it.year, items: [], added: 0, sources: new Set() }; map.set(key, t); }
    t.items.push(it);
    for (const f of ['poster', 'backdrop', 'backdropHi', 'overview', 'genres', 'rating', 'thumb', 'duration',
      'logo', 'tagline', 'cast', 'directors', 'runtime', 'cert']) if (!t[f] && it[f]) t[f] = it[f];
    if (it.quality === '4K') t.quality = '4K'; else if (!t.quality && it.quality) t.quality = it.quality;
    if (it.hdr) t.hdr = true;
    if (!t.year && it.year) t.year = it.year;
    t.added = Math.max(t.added, it.added || 0);
    t.sources.add(it.source);
  }
  S.titles = [...map.values()];
  for (const t of S.titles) {
    if (t.kind === 'show') t.items.sort((a, b) => (a.season - b.season) || (a.episode - b.episode));
    else t.items.sort(versionRank);
  }
  S.titleMap = map;
  const withArt = S.titles.filter(t => t.backdropHi || t.backdrop);
  const pool = withArt.length ? withArt : S.titles;
  if (!S.hero || !map.has(S.hero.key)) S.hero = pool[Math.floor(Math.random() * pool.length)] || null;
  else S.hero = map.get(S.hero.key);
}
function versionRank(a, b) {
  const q = it => (it.quality === '4K' ? 0 : it.quality === 'HD' ? 1 : 2);
  const src = it => (it.source === 'local' ? (S.online ? 0 : 9) : 1 + CLOUDS.indexOf(it.source));
  return q(a) - q(b) || src(a) - src(b);
}
function titleOfItem(it) {
  for (const t of S.titles) if (t.items.includes(it)) return t;
  return { key: it.id, name: it.title || it.name, items: [it] };
}

// ---------- rendering ----------
const PAGES = [
  ['home', 'Home'], ['movies', 'Movies'], ['shows', 'TV Shows'], ['local', 'My PC'],
  ['gdrive', 'Google Drive'], ['onedrive', 'OneDrive'], ['dropbox', 'Dropbox'], ['mylist', 'My List'], ['apps', 'Streaming Apps'],
];

function headerHTML() {
  const has = src => S.items.some(i => i.source === src);
  const tabs = PAGES.filter(([id]) => (CLOUDS.includes(id) || id === 'local') ? has(id) : id === 'apps' ? S.showApps : true);
  return `<header class="top" id="top">
    <img class="logo" src="img/wordmark.png" alt="Goat Stream" data-act="page" data-page="home">
    <nav>${tabs.map(([id, label]) => `<button class="tab focusable ${S.page === id ? 'on' : ''}" data-act="page" data-page="${id}">${label}</button>`).join('')}</nav>
    <div class="right">
      ${MODE !== 'desktop' ? `<span class="conn-dot ${S.online ? '' : 'off'}" title="${S.online ? 'Connected to ' + esc(S.serverName) : 'PC offline'}"></span>` : ''}
      <button class="icon-btn focusable" data-act="page" data-page="search" aria-label="Search">${I.search}</button>
      <button class="icon-btn focusable" data-act="page" data-page="settings" aria-label="Settings">${I.gear}</button>
    </div>
  </header>`;
}

function cardHTML(t, it) {
  const img = (it && it.still) || t.backdrop || t.thumb || (it && it.thumb);
  const p = it && S.progress[it.id];
  const pct = p ? Math.min(100, Math.round(p.pos / p.dur * 100)) : 0;
  const srcs = [...(t.sources || [])];
  return `<button class="card focusable ${p ? 'has-prog' : ''}" data-act="${it ? 'resume' : 'open'}" data-key="${esc(t.key)}" ${it ? `data-id="${esc(it.id)}"` : ''}>
    <div class="card-fallback"><span>${esc(t.name)}</span></div>
    ${img ? `<img loading="lazy" src="${esc(imgUrl(img))}" alt="" onerror="this.remove()">` : ''}
    <div class="card-shade"></div>
    ${srcs.length === 1 && S.page === 'home' && new Set(S.items.map(i => i.source)).size > 1 ? `<span class="src-tag">${SOURCE_NAMES[srcs[0]]}</span>` : ''}
    <div class="badges">${t.quality === '4K' ? '<i class="b4k">4K</i>' : ''}${t.hdr ? '<i>HDR</i>' : ''}</div>
    <div class="card-title">${esc(t.name)}${it && it.show ? ` <small>S${it.season}:E${it.episode}</small>` : ''}</div>
    ${p ? `<div class="prog"><div style="width:${pct}%"></div></div>` : ''}
  </button>`;
}

function rowHTML(title, cards) {
  if (!cards.length) return '';
  return `<section class="row"><h2>${esc(title)}</h2><div class="row-wrap">
    <button class="arrow l" data-act="scroll" data-dir="-1" tabindex="-1" aria-label="Scroll left">${I.left}</button>
    <div class="track">${cards.join('')}</div>
    <button class="arrow r" data-act="scroll" data-dir="1" tabindex="-1" aria-label="Scroll right">${I.right}</button>
  </div></section>`;
}

function appsRowHTML() {
  if (!S.showApps) return '';
  return rowHTML('Streaming Apps', visibleApps().map(a => appTileHTML(a)));
}

function metaLine(t) {
  const bits = [];
  if (t.rating) bits.push(`<span class="match">★ ${t.rating}</span>`);
  if (t.year) bits.push(`<span>${t.year}</span>`);
  if (t.cert) bits.push(`<span class="pill">${esc(t.cert)}</span>`);
  if (t.kind === 'show') {
    const seasons = new Set(t.items.map(i => i.season)).size;
    bits.push(`<span>${seasons} Season${seasons > 1 ? 's' : ''}</span>`);
  } else if (t.runtime || t.duration) bits.push(`<span>${fmtRuntime(t.runtime ? t.runtime * 60 : t.duration)}</span>`);
  if (t.quality === '4K') bits.push('<span class="pill gold">4K Ultra HD</span>'); else if (t.quality === 'HD') bits.push('<span class="pill">HD</span>');
  if (t.hdr) bits.push('<span class="pill">HDR</span>');
  return `<div class="meta">${bits.join('')}</div>`;
}

function heroHTML(t) {
  if (!t) return '';
  const bg = t.backdropHi || t.backdrop || t.thumb;
  return `<section class="hero">
    <div class="hero-bg ${bg ? '' : 'fallback'}" ${bg ? `style="background-image:url('${esc(imgUrl(bg))}')"` : ''}></div>
    <div class="hero-shade"></div>
    <div class="hero-info">
      ${t.logo ? `<img class="hero-logo" src="${esc(imgUrl(t.logo))}" alt="${esc(t.name)}">` : `<h1>${esc(t.name)}</h1>`}
      ${metaLine(t)}
      ${t.overview ? `<p>${esc(t.overview)}</p>` : '<p></p>'}
      <div class="btns">
        <button class="btn btn-play focusable" data-act="playTitle" data-key="${esc(t.key)}">${I.play} Play</button>
        <button class="btn btn-ghost focusable" data-act="open" data-key="${esc(t.key)}">${I.info} More Info</button>
      </div>
    </div>
  </section>`;
}

function continueItems() {
  return Object.entries(S.progress)
    .filter(([id, p]) => S.byId[id] && p.pos > 60 && p.pos < p.dur * 0.94)
    .sort((a, b) => b[1].t - a[1].t)
    .map(([id]) => S.byId[id])
    // one entry per show
    .filter((it, i, arr) => !it.show || arr.findIndex(x => x.show === it.show) === i)
    .slice(0, 20);
}

function emptyHTML() {
  if (MODE === 'desktop') {
    return `<div class="empty" style="padding-top:8rem"><h2>Let's fill up your library</h2>
      <p>Add the folders where you keep movies and shows, or connect a cloud drive. Goat Stream will find every video and make it look great.</p>
      <div class="btns"><button class="btn btn-play focusable" data-act="addFolder">${I.plus} Add a movie folder</button>
      <button class="btn btn-dark focusable" data-act="page" data-page="settings">Connect Google Drive, OneDrive or Dropbox</button></div></div>`;
  }
  return `<div class="empty" style="padding-top:8rem"><h2>No movies yet</h2>
    <p>${S.online ? 'Add Google Drive, OneDrive or Dropbox right here with your phone, or add movie folders in Goat Stream on your PC. Everything shows up here automatically.' :'Your PC is offline. Turn on your PC (Goat Stream runs in the system tray) and try again.'}</p>
    <div class="btns"><button class="btn btn-play focusable" data-act="refresh">Refresh</button>
    ${S.online ? `<button class="btn btn-dark focusable" data-act="addCloud">☁️ Add cloud drive</button>` : ''}</div></div>`;
}

function renderHome() {
  if (!S.titles.length) return emptyHTML() + `<div class="rows flat" style="padding-top:0">${appsRowHTML()}</div>`;
  const rows = [];
  const cw = continueItems();
  if (cw.length) rows.push(rowHTML('Continue Watching', cw.map(it => cardHTML(titleOfItem(it), it))));
  const recent = [...S.titles].sort((a, b) => b.added - a.added).slice(0, 24);
  rows.push(rowHTML('Recently Added', recent.map(t => cardHTML(t))));
  const mine = S.titles.filter(t => inList(t.key));
  if (mine.length) rows.push(rowHTML('My List', mine.map(t => cardHTML(t))));
  const uhd = S.titles.filter(t => t.quality === '4K');
  if (uhd.length) rows.push(rowHTML('4K Ultra HD', uhd.map(t => cardHTML(t))));
  for (const src of ['local', ...CLOUDS]) {
    const list = S.titles.filter(t => t.sources.has(src));
    if (list.length && list.length !== S.titles.length) rows.push(rowHTML('From ' + SOURCE_NAMES[src], list.map(t => cardHTML(t))));
  }
  const shows = S.titles.filter(t => t.kind === 'show');
  if (shows.length) rows.push(rowHTML('TV Shows', shows.map(t => cardHTML(t))));
  const genreCount = {};
  for (const t of S.titles) for (const g of t.genres || []) genreCount[g] = (genreCount[g] || 0) + 1;
  Object.entries(genreCount).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .forEach(([g]) => rows.push(rowHTML(g, S.titles.filter(t => (t.genres || []).includes(g)).map(t => cardHTML(t)))));
  const movies = S.titles.filter(t => t.kind === 'movie').sort((a, b) => a.name.localeCompare(b.name));
  if (movies.length) rows.push(rowHTML('All Movies', movies.map(t => cardHTML(t))));
  rows.push(appsRowHTML());
  return heroHTML(S.hero) + `<div class="rows">${rows.join('')}</div>`;
}

function renderGrid(title, list, extraHead) {
  return `<div class="page-head"><h1>${esc(title)}</h1>${extraHead || ''}</div>
    ${list.length ? `<div class="grid">${list.map(t => cardHTML(t)).join('')}</div>` : '<div class="empty">Nothing here yet.</div>'}`;
}

// My PC page: browse everything, or one movie folder at a time
function renderLocal() {
  const folders = [...new Set(S.items.filter(i => i.source === 'local' && i.folder).map(i => i.folder))].sort();
  if (!folders.includes(S.folderFilter)) S.folderFilter = '';
  const list = S.titles.filter(t => t.items.some(i => i.source === 'local' && (!S.folderFilter || i.folder === S.folderFilter)))
    .sort((a, b) => b.added - a.added);
  const chips = folders.length > 1 ? `<div class="seasons" style="margin:0">
    <button class="season-btn focusable ${!S.folderFilter ? 'on' : ''}" data-act="folderFilter" data-path="">All folders</button>
    ${folders.map(f => `<button class="season-btn focusable ${S.folderFilter === f ? 'on' : ''}" data-act="folderFilter" data-path="${esc(f)}" title="${esc(f)}">📁 ${esc(f.split(/[\\/]/).filter(Boolean).pop() || f)}</button>`).join('')}
  </div>` : '';
  return renderGrid('My PC', list, chips);
}

function renderSearch() {
  const q = S.query.trim().toLowerCase();
  const list = q ? S.titles.filter(t => t.name.toLowerCase().includes(q)
    || (t.genres || []).some(g => g.toLowerCase().includes(q))
    || t.items.some(i => (i.name || '').toLowerCase().includes(q))) : [];
  return `<div class="page-head"><div class="search-box">${I.search}
      <input id="search" class="focusable" placeholder="Titles, genres, file names" value="${esc(S.query)}" autocomplete="off"></div></div>
    ${q ? (list.length ? `<div class="grid">${list.map(t => cardHTML(t)).join('')}</div>` : `<div class="empty">No matches for “${esc(S.query)}”.</div>`)
        : '<div class="empty">Start typing to search your whole library.</div>'}`;
}

function renderApps() {
  return `<div class="page-head"><h1>Streaming Apps</h1></div>
    <div class="empty" style="padding-top:0">These open in each service's official ${TV ? 'app' : 'website'}. Their movies are copy-protected,
      so they play there instead of inside Goat Stream.</div>
    <div class="grid">${visibleApps().map(a => appTileHTML(a, true)).join('')}</div>
    <div class="empty" style="padding-top:0;font-size:.95rem">🎬 <b>Bought movies from Microsoft?</b> They're copy-protected, so they play in Microsoft's own
      ${DESKTOP ? '<b>Films & TV</b> app on this PC. ' : ''}On TVs, link your Microsoft account in <b>Movies Anywhere</b> (US) to watch many of them there.</div>`;
}

function render() {
  const app = $('#app');
  const prevFocus = document.activeElement && document.activeElement.closest('#app') ? focusSignature(document.activeElement) : null;
  let body;
  switch (S.page) {
    case 'home': body = renderHome(); break;
    case 'movies': body = renderGrid('Movies', S.titles.filter(t => t.kind === 'movie').sort((a, b) => a.name.localeCompare(b.name))); break;
    case 'shows': body = renderGrid('TV Shows', S.titles.filter(t => t.kind === 'show').sort((a, b) => a.name.localeCompare(b.name))); break;
    case 'local': body = renderLocal(); break;
    case 'gdrive': case 'dropbox': case 'onedrive':
      body = renderGrid(SOURCE_NAMES[S.page], S.titles.filter(t => t.sources.has(S.page)).sort((a, b) => b.added - a.added)); break;
    case 'mylist': body = renderGrid('My List', S.titles.filter(t => inList(t.key))); break;
    case 'apps': if (!S.showApps) { S.page = 'home'; body = renderHome(); } else body = renderApps(); break;
    case 'search': body = renderSearch(); break;
    case 'settings': body = '<div class="settings"><h1>Settings</h1><div id="settings-body"><div class="spinner"></div></div></div>'; break;
    default: body = '';
  }
  app.innerHTML = headerHTML() + `<main>${body}</main>`;
  if (S.page === 'settings') renderSettings();
  if (S.page === 'search') {
    const inp = $('#search');
    inp.addEventListener('input', () => { S.query = inp.value; const pos = inp.selectionStart; render(); const n = $('#search'); n.focus(); n.setSelectionRange(pos, pos); });
    if (!TV) inp.focus();
  }
  onScroll();
  restoreFocus(prevFocus);
}

function focusSignature(el) {
  return { act: el.dataset.act, key: el.dataset.key, id: el.dataset.id, page: el.dataset.page };
}
function restoreFocus(sig) {
  if (!(TV || document.documentElement.classList.contains('remote'))) return;
  let el = null;
  if (sig) {
    el = $$('#app .focusable').find(e => e.dataset.act === sig.act && e.dataset.key === sig.key && e.dataset.id === sig.id && e.dataset.page === sig.page);
  }
  if (!el) el = $('#app .hero .btn-play') || $('#app main .focusable') || $('#app .focusable');
  if (el) el.focus({ preventScroll: true });
}

function onScroll() { const top = $('#top'); if (top) top.classList.toggle('solid', window.scrollY > 40 || S.page !== 'home'); }
window.addEventListener('scroll', onScroll, { passive: true });

// ---------- overlays ----------
const overlays = [];
function openOverlay(html, opts) {
  opts = opts || {};
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = html;
  ov._returnFocus = document.activeElement;
  ov._onClose = opts.onClose;
  ov._locked = !!opts.locked;
  if (!opts.locked) ov.addEventListener('mousedown', e => { if (e.target === ov) closeOverlay(ov); });
  document.body.appendChild(ov);
  overlays.push(ov);
  document.body.style.overflow = 'hidden';
  const first = ov.querySelector('[data-autofocus]') || ov.querySelector('.focusable');
  if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
  return ov;
}
function closeOverlay(ov) {
  ov = ov || overlays[overlays.length - 1];
  if (!ov) return false;
  const i = overlays.indexOf(ov);
  if (i >= 0) overlays.splice(i, 1);
  ov.remove();
  if (!overlays.length) document.body.style.overflow = '';
  if (ov._onClose) ov._onClose();
  const rf = ov._returnFocus;
  if (rf && document.contains(rf)) rf.focus({ preventScroll: true });
  return true;
}

// Back button (TV remote, Esc, browser back)
window.goatBack = () => {
  if (Player.active) { Player.close(); return true; }
  const top = overlays[overlays.length - 1];
  if (top) { if (top._locked) return false; closeOverlay(top); return true; }
  if (S.page !== 'home') { go('home'); return true; }
  return false;
};

function go(page) {
  S.page = page;
  window.scrollTo(0, 0);
  render();
}

// ---------- details ----------
function openTitle(key, season) {
  const t = S.titleMap.get(key);
  if (!t) return;
  const bg = t.backdropHi || t.backdrop || t.thumb;
  const first = t.kind === 'show' ? nextEpisodeToWatch(t) : t.items[0];
  const p = first && S.progress[first.id];
  const resuming = p && p.pos > 60 && p.pos < p.dur * 0.94;
  const sideBits = [];
  if (t.cast && t.cast.length) sideBits.push(`<div><b>Cast:</b> ${esc(t.cast.slice(0, 5).join(', '))}</div>`);
  if (t.directors && t.directors.length) sideBits.push(`<div><b>${t.kind === 'show' ? 'Created by' : 'Director'}:</b> ${esc(t.directors.join(', '))}</div>`);
  if (t.genres && t.genres.length) sideBits.push(`<div><b>Genres:</b> ${esc(t.genres.join(', '))}</div>`);
  sideBits.push(`<div><b>Available from:</b> ${[...t.sources].map(s => SOURCE_NAMES[s]).join(', ')}</div>`);
  if (t.kind === 'movie' && first) {
    if (first.size) sideBits.push(`<div><b>File:</b> ${esc(fmtSize(first.size))}${first.probe && first.probe.vcodec ? ' · ' + esc(first.probe.vcodec.toUpperCase()) : ''}${first.probe && first.probe.acodec ? ' / ' + esc(first.probe.acodec.toUpperCase()) : ''}</div>`);
  }
  let lower = '';
  if (t.kind === 'show') {
    const seasons = [...new Set(t.items.map(i => i.season))].sort((a, b) => a - b);
    const cur = season != null && seasons.includes(season) ? season : (first ? first.season : seasons[0]);
    lower = `<div class="episodes"><h3>Episodes</h3>
      ${seasons.length > 1 ? `<div class="seasons">${seasons.map(s => `<button class="season-btn focusable ${s === cur ? 'on' : ''}" data-act="season" data-key="${esc(t.key)}" data-season="${s}">Season ${s}</button>`).join('')}</div>` : ''}
      ${t.items.filter(i => i.season === cur).map(i => {
        const ip = S.progress[i.id];
        const img = i.still || i.thumb || t.backdrop;
        return `<button class="ep focusable" data-act="playItem" data-id="${esc(i.id)}">
          <div class="n">${i.episode}</div>
          <div class="thumb">${img ? `<img loading="lazy" src="${esc(imgUrl(img))}" alt="" onerror="this.remove()">` : ''}${ip ? `<div class="prog"><div style="width:${Math.min(100, ip.pos / ip.dur * 100)}%"></div></div>` : ''}</div>
          <div><div class="t">${esc(i.epName || 'Episode ' + i.episode)}${i.quality === '4K' ? ' <span class="pill gold">4K</span>' : ''}</div>
          <div class="d">${esc(i.epOverview || SOURCE_NAMES[i.source] + (i.size ? ' · ' + fmtSize(i.size) : ''))}</div></div>
        </button>`;
      }).join('')}</div>`;
  } else if (t.items.length > 1) {
    lower = `<div class="versions"><h3>Choose a version</h3>${t.items.map(i => `<button class="ver focusable" data-act="playItem" data-id="${esc(i.id)}">
      ${I.play}<div class="grow"><b>${SOURCE_NAMES[i.source]}</b> · ${esc(i.quality === '4K' ? '4K Ultra HD' : i.quality || 'SD')}${i.hdr ? ' HDR' : ''} <small style="color:#999"> ${esc(i.name)} · ${fmtSize(i.size)}</small></div></button>`).join('')}</div>`;
  }
  const ov = openOverlay(`<div class="modal">
    <button class="round modal-close focusable" data-act="closeOverlay" aria-label="Close">${I.close}</button>
    <div class="modal-hero" ${bg ? `style="background-image:url('${esc(imgUrl(bg))}')"` : ''}>
      ${bg ? '' : '<div class="hero-bg fallback"></div>'}
      <div class="hero-shade"></div>
      ${t.logo ? `<img class="modal-logo" src="${esc(imgUrl(t.logo))}" alt="${esc(t.name)}">` : `<h2>${esc(t.name)}</h2>`}
      <div class="btns">
        <button class="btn btn-play focusable" data-autofocus data-act="${t.kind === 'show' ? 'playItem' : 'playTitle'}" data-key="${esc(t.key)}" data-id="${first ? esc(first.id) : ''}">${I.play} ${resuming ? 'Resume' : 'Play'}${t.kind === 'show' && first ? ` S${first.season}:E${first.episode}` : ''}</button>
        ${resuming ? `<button class="btn btn-ghost focusable" data-act="startOver" data-id="${esc(first.id)}">Start over</button>` : ''}
        <button class="round focusable" data-act="mylist" data-key="${esc(t.key)}" aria-label="My List">${inList(t.key) ? I.check : I.plus}</button>
        ${DESKTOP && first ? `<button class="round focusable" data-act="external" data-id="${esc(first.id)}" title="Play in VLC / external player">${I.ext}</button>` : ''}
      </div>
    </div>
    <div class="modal-body">
      <div>${metaLine(t)}${t.tagline ? `<p class="tagline">${esc(t.tagline)}</p>` : ''}<p>${esc(t.overview || (t.kind === 'show' ? `${t.items.length} episode${t.items.length > 1 ? 's' : ''}` : t.items[0].name))}</p></div>
      <div class="side-info">${sideBits.join('')}
        ${canAdmin() ? `<button class="btn btn-dark btn-small focusable" style="margin-top:.8rem" data-act="fixMatch" data-key="${esc(t.key)}">${t.poster ? 'Wrong cover? Fix match' : 'Find cover & details'}</button>` : ''}</div>
      ${lower}
    </div>
  </div>`);
  ov.dataset.title = key;
  return ov;
}

const canAdmin = () => MODE === 'desktop' || IS_LOCALHOST;

// "Fix match": search the movie database and pin the right cover + details to a title
function openFixMatch(key) {
  const t = S.titleMap.get(key);
  if (!t) return;
  const ov = openOverlay(`<div class="dialog" style="width:min(46rem,100%);text-align:left">
    <h2>Find the right ${t.kind === 'show' ? 'show' : 'movie'}</h2>
    <p style="color:#999;font-size:.9rem;margin:.2rem 0 1rem">File: ${esc(t.items[0].name)}</p>
    <div class="field" style="justify-content:flex-start"><input class="input focusable" id="fm-q" data-autofocus value="${esc(t.name)}" style="flex:1">
      <button class="btn btn-play btn-small focusable" id="fm-go">${I.search} Search</button></div>
    <div id="fm-res" class="match-list"></div></div>`);
  const run = async () => {
    const box = ov.querySelector('#fm-res');
    box.innerHTML = '<div class="spinner" style="margin:1.5rem auto"></div>';
    try {
      const { results } = await api('/api/meta/search?q=' + encodeURIComponent(ov.querySelector('#fm-q').value.trim()));
      box.innerHTML = results.length ? results.map(r => `<button class="match-res focusable" data-id="${r.id}" data-type="${r.type}">
          ${r.poster ? `<img src="${esc(r.poster)}" alt="">` : '<div class="noposter">🐐</div>'}
          <div><b>${esc(r.title)}</b> <span style="color:#999">${r.year || ''} · ${r.type === 'tv' ? 'TV show' : 'Movie'}</span>
          <div class="d">${esc(r.overview || '')}</div></div></button>`).join('') : '<p>No matches — try a different spelling.</p>';
    } catch (e) { box.innerHTML = `<p class="warn">${esc(e.message)}</p>`; }
  };
  ov.querySelector('#fm-go').addEventListener('click', run);
  ov.querySelector('#fm-q').addEventListener('keydown', e => { if (e.key === 'Enter') run(); });
  ov.querySelector('#fm-res').addEventListener('click', async e => {
    const b = e.target.closest('.match-res');
    if (!b) return;
    b.disabled = true;
    try {
      await api('/api/meta/fix', 'POST', { itemId: t.items[0].id, tmdbId: b.dataset.id, type: b.dataset.type });
      closeAll();
      await loadLibrary(true);
      toast('Cover & details updated');
      const nt = S.titles.find(x => x.items.some(i => i.id === t.items[0].id));
      if (nt) openTitle(nt.key);
    } catch (err) { toast(err.message); b.disabled = false; }
  });
  run();
}

function nextEpisodeToWatch(t) {
  const watched = t.items.map(i => S.progress[i.id]).map(p => p ? p : null);
  // most recently touched episode; if finished, the one after it
  let best = -1, bestT = 0;
  watched.forEach((p, i) => { if (p && p.t > bestT) { bestT = p.t; best = i; } });
  if (best < 0) return t.items[0];
  const p = watched[best];
  if (p.pos >= p.dur * 0.94 && t.items[best + 1]) return t.items[best + 1];
  return t.items[best];
}
function nextEpisodeAfter(it) {
  if (!it || !it.show) return null;
  const t = titleOfItem(it);
  const i = t.items.indexOf(it);
  return i >= 0 ? t.items[i + 1] || null : null;
}

// ---------- playback ----------
function resumeSec(it, fromStart) {
  if (fromStart) return 0;
  const p = S.progress[it.id];
  return p && p.pos > 30 && p.pos < p.dur * 0.94 ? Math.max(0, p.pos - 5) : 0;
}

async function play(it, fromStart) {
  if (!it) return;
  const start = resumeSec(it, fromStart);
  if (it.source === 'local' && !S.online) {
    if (TV) { try { await loadLibrary(true); } catch (e) { /* stays offline */ } }
    if (!S.online) { toast('This movie is on your PC, and your PC is offline. Turn it on and try again.'); return; }
  }
  if (DESKTOP && S.settings && S.settings.player === 'external') { playExternal(it); return; }
  if (TV) return playTV(it, start, 'direct');
  Player.open(it, start);
}

async function playExternal(it) {
  const r = await window.goatDesktop.playExternal(it.id);
  if (!r || !r.ok) toast(r && r.error ? r.error : 'Install VLC (videolan.org) to use an external player.');
}

// Android TV: hand off to the native 4K player (ExoPlayer: HEVC/HDR/Dolby passthrough, frame-rate matching)
let tvPlaying = null;
async function playTV(it, startSec, mode) {
  let url, headers = {};
  try {
    if (it.source === 'local' || mode !== 'direct') {
      url = srvUrl('/stream/' + encodeURIComponent(it.id), mode !== 'direct' ? { mode, start: Math.floor(startSec) } : {});
      if (mode !== 'direct') startSec = 0;
    } else {
      const accs = store.get('accounts', []);
      const acc = accs.find(a => a.id === it.cloud.accountId);
      if (acc) {
        const info = await cloud.playInfo(acc, it);
        store.set('accounts', accs);
        url = info.url; headers = info.headers;
      } else if (S.online) {
        url = srvUrl('/stream/' + encodeURIComponent(it.id));
      } else throw new Error('This cloud account isn\'t linked to the TV yet. Turn on your PC once to sync it.');
    }
  } catch (e) { toast(e.message || 'Couldn\'t start playback'); return; }
  const t = titleOfItem(it);
  tvPlaying = { it, mode };
  window.GoatTV.play(JSON.stringify({
    id: it.id, url, headers, startMs: Math.round(startSec * 1000),
    title: t.name, subtitle: it.show ? `S${it.season}:E${it.episode}${it.epName ? ' · ' + it.epName : ''}` : (it.quality === '4K' ? '4K Ultra HD' : ''),
    live: mode !== 'direct',
    offsetMs: mode !== 'direct' ? Math.round(startSec * 1000) : 0,
  }));
}
// Called by the native player when it closes
window.goatPlayerClosed = json => {
  let r = {};
  try { r = JSON.parse(json); } catch (e) { return; }
  const cur = tvPlaying;
  tvPlaying = null;
  if (!cur || cur.it.id !== r.id) return;
  const posSec = (r.pos + (r.offset || 0)) / 1000, durSec = (r.dur ? r.dur + (r.offset || 0) : (cur.it.duration || 0) * 1000) / 1000;
  if (durSec > 0) saveProgress(r.id, r.reason === 'ended' ? durSec : posSec, durSec);
  if (r.reason === 'auth') { playTV(cur.it, posSec, cur.mode); return; }               // token expired mid-movie -> refresh & continue
  if (r.reason === 'error') {
    if (S.online && cur.mode === 'direct') { toast('Converting this format on your PC…'); playTV(cur.it, posSec, 'remux'); return; }
    if (S.online && cur.mode === 'remux') { playTV(cur.it, posSec, 'transcode'); return; }
    toast('This video can\'t play on this TV' + (r.error ? ': ' + r.error : '') + (S.online ? '' : ' — turn on your PC so it can convert it.'), 6000);
  }
  if (r.reason === 'ended') { const nx = nextEpisodeAfter(cur.it); if (nx) { playTV(nx, 0, 'direct'); return; } }
  render();
};

// PC window + TV browsers: HTML5 player with automatic format fallback (direct -> remux -> full convert)
const Player = {
  active: null,
  pickMode(it) {
    const pr = it.probe;
    if (!pr || !pr.vcodec) return 'direct';
    const ext = (it.name.split('.').pop() || '').toLowerCase();
    const mse = t => { try { return !!(window.MediaSource && MediaSource.isTypeSupported(t)); } catch (e) { return false; } };
    const v = document.createElement('video');
    const can = t => mse(t) || v.canPlayType(t) === 'probably';
    const vOk = ({
      h264: true, vp8: true, vp9: can('video/webm; codecs="vp9"'),
      av1: can('video/mp4; codecs="av01.0.08M.08"'), hevc: can('video/mp4; codecs="hvc1.1.6.L153.B0"'),
    })[pr.vcodec];
    const aOk = !pr.acodec || ['aac', 'mp3', 'opus', 'vorbis', 'flac'].includes(pr.acodec);
    const chromium = !!window.chrome;
    const cOk = ['mp4', 'm4v', 'webm', 'mov'].includes(ext) || (ext === 'mkv' && chromium);
    if (vOk && aOk && cOk) return 'direct';
    if (vOk) return 'remux';
    return 'transcode';
  },
  open(it, startSec, forcedMode) {
    if (this.active) this.close(true);
    const t = titleOfItem(it);
    const el = document.createElement('div');
    el.className = 'player';
    el.innerHTML = `<video playsinline preload="auto"></video>
      <div class="pl-center"><div class="spinner"></div></div>
      <div class="pl-top"><button class="pl-btn" data-pl="close" aria-label="Back">${I.back}</button>
        <div class="pl-title"><b>${esc(t.name)}</b>${it.show ? ` <span>S${it.season}:E${it.episode}${it.epName ? ' · ' + esc(it.epName) : ''}</span>` : ''}</div>
        <span class="sp" style="flex:1"></span><span class="pl-badge" data-pl-mode></span></div>
      <div class="pl-bottom">
        <div class="pl-seek"><div class="bar"></div><div class="buf"></div><div class="played"></div><div class="knob"></div></div>
        <div class="pl-row">
          <button class="pl-btn" data-pl="toggle" aria-label="Play/Pause">${I.pause}</button>
          <button class="pl-btn" data-pl="rew" aria-label="Back 10 seconds">${I.rew}</button>
          <button class="pl-btn" data-pl="fwd" aria-label="Forward 10 seconds">${I.fwd}</button>
          <button class="pl-btn" data-pl="mute" aria-label="Mute">${I.vol}</button>
          <input class="pl-vol" type="range" min="0" max="1" step="0.05" value="${store.get('vol', 1)}">
          <span class="pl-time">0:00 / 0:00</span>
          <span class="sp"></span>
          <button class="btn btn-ghost btn-small hidden" data-pl="next">${I.next} Next Episode</button>
          ${DESKTOP ? `<button class="pl-btn" data-pl="external" title="Open in VLC">${I.ext}</button>` : ''}
          <button class="pl-btn" data-pl="fs" aria-label="Full screen">${I.fs}</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const video = el.querySelector('video');
    const P = this.active = {
      it, el, video, mode: forcedMode || this.pickMode(it), offset: 0,
      duration: it.duration || (it.probe && it.probe.duration) || 0, lastSave: 0, idleTimer: null,
    };
    video.volume = +store.get('vol', 1);
    if (DESKTOP) window.goatDesktop.setPlaying(true);

    const curTime = () => P.offset + (video.currentTime || 0);
    const dur = () => P.mode === 'direct' && isFinite(video.duration) && video.duration > 0 ? video.duration : P.duration || video.duration || 0;
    const load = sec => {
      sec = Math.max(0, sec || 0);
      el.querySelector('.pl-center').innerHTML = '<div class="spinner"></div>';
      if (P.mode === 'direct') {
        P.offset = 0;
        const src = srvUrl('/stream/' + encodeURIComponent(it.id));
        if (video.getAttribute('src') !== src) video.src = src;
        const seek = () => { try { video.currentTime = sec; } catch (e) { /* not ready */ } };
        if (video.readyState >= 1) seek(); else video.addEventListener('loadedmetadata', seek, { once: true });
      } else {
        P.offset = sec;                         // converted streams restart at the seek point
        video.src = srvUrl('/stream/' + encodeURIComponent(it.id), { mode: P.mode, start: Math.floor(sec) });
      }
      video.play().catch(() => {});
      el.querySelector('[data-pl-mode]').textContent = P.mode === 'direct' ? (it.quality === '4K' ? '4K · Direct' : 'Direct') : P.mode === 'remux' ? 'Converting audio' : 'Converting';
    };
    P.seekTo = sec => {
      const d = dur();
      sec = Math.max(0, Math.min(d ? d - 1 : sec, sec));
      if (P.mode === 'direct') video.currentTime = sec; else load(sec);
      wake();
    };
    const fallback = why => {
      const order = ['direct', 'remux', 'transcode'];
      const nextMode = order[order.indexOf(P.mode) + 1];
      const at = curTime();
      if (nextMode) { P.mode = nextMode; load(at); return; }
      el.querySelector('.pl-center').innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'pl-msg';
      msg.innerHTML = `<div class="dialog"><div class="big-icon">🐐</div><h2>Can't play this video</h2>
        <p>${esc(why || 'The file may be damaged or use a very unusual format.')}</p>
        <div class="btns">${DESKTOP ? `<button class="btn btn-play focusable" data-pl="external">${I.ext} Open in VLC</button>` : ''}
        <button class="btn btn-dark focusable" data-pl="close">Close</button></div></div>`;
      el.appendChild(msg);
      const b = msg.querySelector('.focusable'); if (b) b.focus();
    };

    video.addEventListener('error', () => {
      const code = video.error && video.error.code;
      fallback(code === 4 ? 'Format not supported, even after converting.' : 'Playback error (' + code + ').');
    });
    video.addEventListener('loadedmetadata', () => {
      // A file whose video codec this screen can't decode often "plays" as audio only
      if (P.mode !== 'transcode' && video.videoWidth === 0 && (!it.probe || it.probe.vcodec)) fallback();
    });
    video.addEventListener('waiting', () => { el.querySelector('.pl-center').innerHTML = '<div class="spinner"></div>'; });
    video.addEventListener('playing', () => { el.querySelector('.pl-center').innerHTML = ''; });
    video.addEventListener('play', () => { el.querySelector('[data-pl="toggle"]').innerHTML = I.pause; });
    video.addEventListener('pause', () => { el.querySelector('[data-pl="toggle"]').innerHTML = I.play; wake(); });
    video.addEventListener('ended', () => {
      saveProgress(it.id, dur(), dur());
      const nx = nextEpisodeAfter(it);
      if (nx) Player.open(nx, 0); else Player.close();
    });
    video.addEventListener('timeupdate', () => {
      const d = dur(), c = curTime();
      el.querySelector('.pl-time').textContent = `${fmtTime(c)} / ${fmtTime(d)}`;
      const pct = d ? c / d * 100 : 0;
      el.querySelector('.played').style.width = pct + '%';
      el.querySelector('.knob').style.left = pct + '%';
      if (video.buffered.length && d) el.querySelector('.buf').style.width = Math.min(100, (P.offset + video.buffered.end(video.buffered.length - 1)) / d * 100) + '%';
      if (Date.now() - P.lastSave > 10000) { P.lastSave = Date.now(); saveProgress(it.id, c, d); }
      el.querySelector('[data-pl="next"]').classList.toggle('hidden', !(nextEpisodeAfter(it) && d && d - c < 90));
    });

    const seekBar = el.querySelector('.pl-seek');
    seekBar.addEventListener('click', e => {
      const r = seekBar.getBoundingClientRect();
      P.seekTo((e.clientX - r.left) / r.width * dur());
    });
    el.querySelector('.pl-vol').addEventListener('input', e => { video.volume = +e.target.value; video.muted = false; store.set('vol', video.volume); });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-pl]');
      if (!b) { if (e.target === video) togglePlay(); return; }
      const a = b.dataset.pl;
      if (a === 'close') Player.close();
      else if (a === 'toggle') togglePlay();
      else if (a === 'rew') P.seekTo(curTime() - 10);
      else if (a === 'fwd') P.seekTo(curTime() + 10);
      else if (a === 'mute') { video.muted = !video.muted; b.innerHTML = video.muted ? I.mute : I.vol; }
      else if (a === 'fs') toggleFs();
      else if (a === 'next') { const nx = nextEpisodeAfter(it); if (nx) Player.open(nx, 0); }
      else if (a === 'external') { video.pause(); playExternal(it); }
    });
    el.addEventListener('dblclick', e => { if (e.target === video) toggleFs(); });
    const togglePlay = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); };
    const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen().catch(() => {}); };
    const wake = () => {
      el.classList.remove('idle');
      clearTimeout(P.idleTimer);
      P.idleTimer = setTimeout(() => { if (!video.paused) el.classList.add('idle'); }, 3200);
    };
    el.addEventListener('mousemove', wake);
    P.keys = e => {
      const k = e.key;
      if (k === ' ' || k === 'Enter' || k === 'k' || k === 'MediaPlayPause') togglePlay();
      else if (k === 'ArrowLeft' || k === 'j' || k === 'MediaRewind') P.seekTo(curTime() - 10);
      else if (k === 'ArrowRight' || k === 'l' || k === 'MediaFastForward') P.seekTo(curTime() + 10);
      else if (k === 'ArrowUp') { video.volume = Math.min(1, video.volume + 0.1); store.set('vol', video.volume); }
      else if (k === 'ArrowDown') { video.volume = Math.max(0, video.volume - 0.1); store.set('vol', video.volume); }
      else if (k === 'f') toggleFs();
      else if (k === 'm') video.muted = !video.muted;
      else if (k === 'Escape' || k === 'Backspace' || k === 'GoBack') { if (document.fullscreenElement && k === 'Escape') return; Player.close(); }
      else return;
      e.preventDefault();
      wake();
    };
    P.curTime = curTime; P.dur = dur;
    load(startSec);
    wake();
    if (TV || !DESKTOP) el.requestFullscreen && el.requestFullscreen().catch(() => {});
  },
  close(silent) {
    const P = this.active;
    if (!P) return;
    this.active = null;
    const d = P.dur(), c = P.curTime();
    if (d) saveProgress(P.it.id, c, d);
    P.video.pause();
    P.video.removeAttribute('src');
    P.video.load();
    clearTimeout(P.idleTimer);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    P.el.remove();
    if (DESKTOP) window.goatDesktop.setPlaying(false);
    if (!silent) render();
  },
};

// ---------- spatial navigation (TV remotes, keyboards) ----------
const Nav = {
  scope() {
    const ob = $('.onboard');
    if (ob) return ob;
    return overlays.length ? overlays[overlays.length - 1] : $('#app');
  },
  items() { return $$('.focusable', this.scope()).filter(e => !e.disabled && e.offsetParent !== null); },
  focus(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    this.reveal(el);
  },
  // Scroll only when the highlight gets near an edge, and only as far as needed — feels calm on a TV
  reveal(el) {
    const track = el.closest('.track');
    if (track) {
      const t = track.getBoundingClientRect(), r = el.getBoundingClientRect(), pad = t.width * 0.05;
      if (r.left < t.left + pad) track.scrollBy({ left: r.left - t.left - pad, behavior: 'smooth' });
      else if (r.right > t.right - pad) track.scrollBy({ left: r.right - t.right + pad, behavior: 'smooth' });
    }
    if (el.closest('.top')) return;
    if (el.closest('.hero') && !overlays.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const box = el.closest('.overlay') || el.closest('.onboard');
    const r = el.getBoundingClientRect(), vh = innerHeight;
    if (r.top < vh * 0.18 || r.bottom > vh * 0.86) {
      (box || window).scrollBy({ top: r.top + r.height / 2 - vh * 0.45, behavior: 'smooth' });
    }
  },
  // Up/down: go to the very next row, then the closest item in it. Left/right: stay in the same row.
  move(dir) {
    const list = this.items();
    const cur = document.activeElement;
    if (!cur || !list.includes(cur)) { this.focus(list.find(e => e.closest('.hero')) || list.find(e => e.closest('main')) || list[0]); return; }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    const rects = list.filter(el => el !== cur).map(el => {
      const b = el.getBoundingClientRect();
      return { el, b, x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    const hGap = c => Math.max(0, Math.max(a.left, c.b.left) - Math.min(a.right, c.b.right));
    let best = null;
    if (dir === 'up' || dir === 'down') {
      let cands = rects.filter(c => (dir === 'down' ? c.y > ay + 8 : c.y < ay - 8));
      // the fixed header only counts when there's nothing else above (so rows scrolled off the top stay reachable)
      const inHeader = c => !!c.el.closest('.top');
      if (!cur.closest('.top') && cands.some(c => !inHeader(c))) cands = cands.filter(c => !inHeader(c));
      if (!cands.length) return;
      const nearest = Math.min(...cands.map(c => Math.abs(c.y - ay)));
      const row = cands.filter(c => Math.abs(c.y - ay) <= nearest + 18);
      row.sort((p, q) => (hGap(p) - hGap(q)) || (Math.abs(p.x - ax) - Math.abs(q.x - ax)));
      best = row[0];
    } else {
      const overlap = c => Math.min(a.bottom, c.b.bottom) - Math.max(a.top, c.b.top);
      const cands = rects.filter(c => (dir === 'right' ? c.x > ax + 4 : c.x < ax - 4) && overlap(c) >= Math.min(a.height, c.b.height) * 0.3);
      cands.sort((p, q) => Math.abs(p.x - ax) - Math.abs(q.x - ax));
      best = cands[0];
    }
    if (best) this.focus(best.el);
  },
  lastMove: 0,
};

document.addEventListener('keydown', e => {
  if (Player.active) { Player.active.keys(e); return; }
  const k = e.key;
  const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  const inInput = e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT';
  if (dirs[k]) {
    if (inInput && (k === 'ArrowLeft' || k === 'ArrowRight') && e.target.type !== 'range') return;
    e.preventDefault();
    document.documentElement.classList.add('remote');
    // holding a button down: steady pace instead of a pile-up of scrolls
    if (e.repeat && Date.now() - Nav.lastMove < 120) return;
    Nav.lastMove = Date.now();
    Nav.move(dirs[k]);
  } else if ((k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || (k === 'Backspace' && !inInput)) && !TV) {
    if (window.goatBack()) e.preventDefault();
  }
});
document.addEventListener('mousedown', () => document.documentElement.classList.remove('remote'));

// TV browsers: map their Back button (history back) onto goatBack
if (MODE === 'browser') {
  history.pushState({ goat: 1 }, '');
  window.addEventListener('popstate', () => { if (window.goatBack()) history.pushState({ goat: 1 }, ''); });
}

// ---------- click actions ----------
const actions = {
  page: el => go(el.dataset.page),
  folderFilter: el => { S.folderFilter = el.dataset.path; render(); },
  fixMatch: el => openFixMatch(el.dataset.key),
  open: el => openTitle(el.dataset.key),
  season: el => { closeOverlay(); const ov = openTitle(el.dataset.key, +el.dataset.season); const b = ov && ov.querySelector('.season-btn.on'); if (b) b.focus(); },
  closeOverlay: () => closeOverlay(),
  playTitle: el => { const t = S.titleMap.get(el.dataset.key); if (t) { closeAll(); play(t.kind === 'show' ? nextEpisodeToWatch(t) : t.items[0]); } },
  playItem: el => { const it = S.byId[el.dataset.id]; if (it) { closeAll(); play(it); } },
  resume: el => play(S.byId[el.dataset.id]),
  startOver: el => { closeAll(); play(S.byId[el.dataset.id], true); },
  external: el => playExternal(S.byId[el.dataset.id]),
  mylist: el => { const on = toggleMyList(el.dataset.key); el.innerHTML = on ? I.check : I.plus; },
  scroll: el => { const tr = el.parentElement.querySelector('.track'); tr.scrollBy({ left: +el.dataset.dir * tr.clientWidth * 0.85, behavior: 'smooth' }); },
  refresh: () => loadLibrary(),
  launchApp: el => {
    if (TV) { if (!window.GoatTV.launchApp(el.dataset.pkg)) toast('Opening the Play Store…'); }
    else if (DESKTOP) window.goatDesktop.openExternal(el.dataset.pcurl || el.dataset.url);
    else window.open(el.dataset.url, '_blank');
  },
  addFolder: () => addFolders(),
};
function closeAll() { while (overlays.length && !overlays[overlays.length - 1]._locked) closeOverlay(); }
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act] || settingsActions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el); }
});

// ---------- settings ----------
async function addFolders() {
  const paths = await window.goatDesktop.pickFolders();
  if (!paths || !paths.length) return;
  for (const p of paths) await api('/api/folders', 'POST', { add: p });
  toast('Scanning for movies…');
  watchScan();
  if (S.page === 'settings') renderSettings();
}
async function watchScan() {
  for (let i = 0; i < 600; i++) {
    await sleep(i < 5 ? 800 : 2000);
    let st;
    try { st = await api('/api/status'); } catch (e) { return; }
    if (!st.scanning) { await loadLibrary(true); toast(`Library ready — ${st.count} video${st.count === 1 ? '' : 's'}`); return; }
    if (i % 5 === 4) loadLibrary(true);
  }
}

async function renderSettings() {
  const box = $('#settings-body');
  if (!box) return;
  if (MODE !== 'desktop' && !IS_LOCALHOST) { box.innerHTML = remoteSettingsHTML(); return; }
  let s;
  try { s = S.settings = await api('/api/settings'); } catch (e) { box.innerHTML = `<p class="warn">${esc(e.message)}</p>`; return; }
  if (!$('#settings-body')) return;
  const keysOk = { gdrive: s.keys.google, dropbox: s.keys.dropbox, onedrive: s.keys.onedrive };
  const addr = s.addresses.map(a => `<code class="addr">http://${esc(a)}:${s.port}</code>`).join(' ');
  box.innerHTML = `
  <div class="sec"><h2>📁 Movie folders on this PC</h2>
    <p>Pick the folders Goat Stream plays from. Switch a folder <b>Off</b> to hide its videos without removing it.</p>
    ${s.folders.map(f => {
      const on = !s.disabledFolders.includes(f);
      const n = S.items.filter(i => i.folder === f).length;
      return `<div class="li"><div class="provider pc" style="${on ? '' : 'filter:grayscale(1);opacity:.5'}">📁</div>
        <div class="grow"><b>${esc(f.split(/[\\/]/).filter(Boolean).pop() || f)}</b><small>${esc(f)} · ${on ? `${n} video${n === 1 ? '' : 's'}` : 'off'}</small></div>
        <div class="seg"><button class="focusable ${on ? 'on' : ''}" data-act="toggleFolder" data-path="${esc(f)}" data-v="1">On</button><button class="focusable ${on ? '' : 'on'}" data-act="toggleFolder" data-path="${esc(f)}" data-v="0">Off</button></div>
        <button class="btn btn-dark btn-small focusable" data-act="removeFolder" data-path="${esc(f)}">Remove</button></div>`;
    }).join('') || '<p class="warn">No folders yet — add the folders where you keep your movies.</p>'}
    <div class="btns" style="margin-top:1rem">${DESKTOP ? `<button class="btn btn-play btn-small focusable" data-act="addFolder">${I.plus} Add folder</button>` : ''}
      <button class="btn btn-dark btn-small focusable" data-act="rescan">${s.scanning ? 'Scanning…' : 'Rescan library'}</button></div>
  </div>

  <div class="sec"><h2>☁️ Cloud drives</h2>
    <p>Sign in once here. Your Android TV gets access automatically when it links to this PC and then streams straight from the cloud — even when this PC is off.</p>
    ${s.accounts.map(a => `<div class="li">${providerIcon(a.provider)}
      <div class="grow"><b>${SOURCE_NAMES[a.provider]}</b><small>${esc(a.name)}${a.error ? ` · <span class="warn">${esc(a.error)}</span>` : ''}</small></div>
      <button class="btn btn-dark btn-small focusable" data-act="removeAccount" data-id="${esc(a.id)}">Disconnect</button></div>`).join('')}
    <div class="btns" style="margin-top:1rem">
      ${CLOUDS.map(c => `<button class="btn btn-play btn-small focusable" data-act="connect" data-provider="${SIGNIN[c]}" ${keysOk[c] ? '' : `disabled title="Add the ${SOURCE_NAMES[c]} app key below first"`}>Connect ${SOURCE_NAMES[c]}</button>`).join('')}
    </div>
    <div class="btns" style="margin-top:.6rem">
      ${CLOUDS.map(c => `<button class="btn btn-dark btn-small focusable" data-act="phoneSignIn" data-provider="${SIGNIN[c]}" ${keysOk[c] && s.phoneSignIn ? '' : 'disabled'}>📱 ${SOURCE_NAMES[c]} with my phone</button>`).join('')}
    </div>
    ${s.phoneSignIn ? '' : '<p style="color:#999;font-size:.85rem">📱 Phone sign-in (scan a QR code) turns on once the hand-off page is set up — see README.</p>'}
    <details class="keys" ${CLOUDS.every(c => keysOk[c]) ? '' : 'open'}><summary>App keys (one-time setup — see README)</summary>
      <div class="kv" style="margin-top:.8rem">
        <label>Google client ID</label><input class="input focusable" id="k-gid" value="${esc(s.google.clientId)}" placeholder="xxxx.apps.googleusercontent.com">
        <label>Google client secret</label><input class="input focusable" id="k-gsec" type="password" value="${esc(s.google.clientSecret)}">
        <label>OneDrive client ID</label><input class="input focusable" id="k-od" value="${esc(s.onedrive.clientId)}" placeholder="Application (client) ID from Azure">
        <label>Dropbox app key</label><input class="input focusable" id="k-dbx" value="${esc(s.dropbox.appKey)}">
        <label>Phone hand-off page</label><input class="input focusable" id="k-relay" value="${esc(s.oauthRelay)}" placeholder="${s.oauthRelayBuiltIn ? 'Using the built-in page' : 'https://you.github.io/goat-stream/oauth.html'}">
        <span></span><div><button class="btn btn-dark btn-small focusable" data-act="saveKeys">Save keys</button></div>
      </div>
      <p style="color:#999;font-size:.9rem">Redirect URLs to register: ${CLOUDS.map(c => `<code class="addr">http://localhost:${s.port}/oauth/${SIGNIN[c]}/callback</code> (${SOURCE_NAMES[c]})`).join(', ')} — plus your phone hand-off page for each.</p>
    </details>
  </div>

  <div class="sec"><h2>📺 TVs & devices</h2>
    <p><b>Android TV:</b> install the Goat Stream TV app — it finds this PC by itself; click <b>Allow</b> when the pop-up appears here.<br>
    <b>Any other TV / phone browser:</b> open ${addr || '<span class="warn">(not connected to a network)</span>'} and click Allow here.<br>
    <b>Apple TV:</b> <span class="pill gold">Coming soon</span> — for now, open the address above in Safari on an iPhone/iPad and AirPlay the movie to your Apple TV.</p>
    ${s.devices.map(d => `<div class="li"><div class="provider pc">${I.tv}</div><div class="grow"><b>${esc(d.name)}</b><small>${esc(d.ip || '')} · last seen ${d.lastSeen ? new Date(d.lastSeen).toLocaleString() : 'never'}</small></div>
      <button class="btn btn-dark btn-small focusable" data-act="removeDevice" data-id="${esc(d.id)}">Unlink</button></div>`).join('') || '<p>No devices linked yet.</p>'}
  </div>

  <div class="sec"><h2>🎬 Playback</h2>
    <div class="li"><div class="grow"><b>Player on this PC</b><small>The built-in player converts formats automatically. VLC handles everything natively, including Dolby/DTS surround.</small></div>
      <div class="seg"><button class="focusable ${s.player !== 'external' ? 'on' : ''}" data-act="setPlayer" data-v="builtin">Built-in</button><button class="focusable ${s.player === 'external' ? 'on' : ''}" data-act="setPlayer" data-v="external">VLC</button></div></div>
    <div class="li"><div class="grow"><b>Format converter</b><small>${s.ffmpeg ? `Ready — using ${esc(s.encoder || 'auto-detect on first use')}` : '<span class="warn">ffmpeg missing — run npm install</span>'}</small></div></div>
  </div>

  ${appsToggleHTML()}
  ${introToggleHTML()}
  ${updatesHTML(s.version)}

  <div class="sec"><h2>🔒 Privacy</h2>
    <p>Movies from this PC go straight to your TV over your home network — they never touch the internet, so your internet provider can't see them.
    The server refuses any connection from outside your home network.</p>
    <div class="li"><div class="grow"><b>Look up posters & descriptions</b><small>Sends movie titles (encrypted) to TMDB to get artwork. Turn off for maximum privacy.</small></div>
      <div class="seg"><button class="focusable ${s.metadata ? 'on' : ''}" data-act="setMeta" data-v="1">On</button><button class="focusable ${!s.metadata ? 'on' : ''}" data-act="setMeta" data-v="0">Off</button></div></div>
    <div class="kv" style="margin-top:.6rem"><label>TMDB API key</label><div style="display:flex;gap:.6rem"><input class="input focusable" id="k-tmdb" value="${esc(s.tmdbKey)}" placeholder="${s.tmdbBuiltIn ? 'Using the built-in key' : 'free at themoviedb.org'}"><button class="btn btn-dark btn-small focusable" data-act="saveTmdb">Save</button></div></div>
  </div>

  <div class="sec"><h2>⚙️ This PC</h2>
    <div class="kv"><label>Server name</label><div style="display:flex;gap:.6rem"><input class="input focusable" id="k-name" value="${esc(s.serverName)}"><button class="btn btn-dark btn-small focusable" data-act="saveName">Save</button></div></div>
    ${DESKTOP ? `<div class="li" style="margin-top:.6rem"><div class="grow"><b>Start Goat Stream with Windows</b><small>So your TV can always reach your movies.</small></div>
      <div class="seg"><button class="focusable" data-act="autostart" data-v="1" id="as-on">On</button><button class="focusable" data-act="autostart" data-v="0" id="as-off">Off</button></div></div>` : ''}
    <p style="color:#888;font-size:.85rem;margin-top:1rem">Goat Stream v${esc(s.version)} · ${s.count} videos</p>
  </div>
  <p class="credit">🐐 Goat Stream · Created by Santiago</p>`;
  if (DESKTOP) window.goatDesktop.getAutostart().then(on => { const b = $(on ? '#as-on' : '#as-off'); if (b) b.classList.add('on'); });
}

function remoteSettingsHTML() {
  const accs = TV ? store.get('accounts', []) : (S.cloudAccounts || []);
  return `<div class="sec"><h2>🖥️ Your PC</h2>
      <div class="li"><div class="provider pc">PC</div><div class="grow"><b>${esc(S.serverName || 'Goat Stream PC')}</b>
        <small>${S.online ? '<span class="ok">Connected</span>' : '<span class="warn">Offline</span>'} ${TV ? '· ' + esc(conn.base) : ''}</small></div></div>
      <div class="btns" style="margin-top:1rem"><button class="btn btn-play btn-small focusable" data-act="refresh">Refresh library</button>
      <button class="btn btn-dark btn-small focusable" data-act="unlink">Unlink this ${TV ? 'TV' : 'device'}</button></div></div>
    <div class="sec"><h2>☁️ Cloud drives</h2>
      <p>Add Google Drive, OneDrive or Dropbox right here: scan a QR code with your phone and sign in there.
      ${TV ? 'Cloud movies then stream straight from the cloud — even when your PC is off.' : ''}</p>
      ${accs.map(a => `<div class="li">${providerIcon(a.provider)}<div class="grow"><b>${SOURCE_NAMES[a.provider]}</b><small>${esc(a.name)}</small></div></div>`).join('') || '<p>None connected yet.</p>'}
      <div class="btns" style="margin-top:1rem"><button class="btn btn-play btn-small focusable" data-act="addCloud">${I.plus} Add cloud drive</button>
      ${TV && accs.length ? '<button class="btn btn-dark btn-small focusable" data-act="tvCloudScan">Rescan cloud from this TV</button>' : ''}</div></div>
    ${appsToggleHTML()}
    ${introToggleHTML()}
    ${updatesHTML()}
    ${TV ? `<div class="sec">${pcDownloadHTML()}</div>` : ''}
    <div class="sec"><h2>🔒 Privacy</h2><p>Movies from your PC play over your home network only — they never go through your internet provider.</p></div>
    <p class="credit">🐐 Goat Stream · Created by Santiago</p>`;
}

function appsToggleHTML() {
  return `<div class="sec"><h2>📺 Streaming apps</h2>
    <div class="li"><div class="grow"><b>Show Netflix, Hulu, Max & other streaming apps</b>
      <small>Turn off to hide the Streaming Apps tab and row, so Goat Stream only shows your own movies. Applies to every linked TV.</small></div>
      <div class="seg"><button class="focusable ${S.showApps ? 'on' : ''}" data-act="setApps" data-v="1">On</button><button class="focusable ${!S.showApps ? 'on' : ''}" data-act="setApps" data-v="0">Off</button></div></div>
  </div>`;
}

const settingsActions = {
  toggleFolder: async el => {
    const wantOn = el.dataset.v === '1';
    if (wantOn === !S.settings.disabledFolders.includes(el.dataset.path)) return;
    await api('/api/folders', 'POST', { toggle: el.dataset.path });
    toast(wantOn ? 'Folder on — scanning…' : 'Folder off — its videos are hidden');
    await watchScan();
    renderSettings();
  },
  removeFolder: async el => { await api('/api/folders', 'POST', { remove: el.dataset.path }); renderSettings(); watchScan(); },
  rescan: async () => { await api('/api/scan', 'POST', {}); toast('Rescanning…'); watchScan(); renderSettings(); },
  connect: async el => {
    const url = `http://127.0.0.1:${S.settings.port}/oauth/${el.dataset.provider}/start`;
    if (DESKTOP) window.goatDesktop.openExternal(url); else window.open(url, '_blank');
    toast('Finish signing in in your browser…', 6000);
    const before = S.settings.accounts.length;
    for (let i = 0; i < 90; i++) {
      await sleep(2000);
      const s = await api('/api/settings').catch(() => null);
      if (s && s.accounts.length > before) { toast('Connected! Scanning your cloud for movies…'); renderSettings(); watchScan(); return; }
    }
  },
  removeAccount: async el => { if (!confirm('Disconnect this cloud account?')) return; await api('/api/accounts/remove', 'POST', { id: el.dataset.id }); renderSettings(); loadLibrary(true); },
  saveKeys: async () => {
    await api('/api/settings', 'POST', {
      google: { clientId: $('#k-gid').value.trim(), clientSecret: $('#k-gsec').value.trim() }, dropbox: { appKey: $('#k-dbx').value.trim() },
      onedrive: { clientId: $('#k-od').value.trim() }, oauthRelay: $('#k-relay').value.trim(),
    });
    toast('Keys saved'); renderSettings();
  },
  saveTmdb: async () => { await api('/api/settings', 'POST', { tmdbKey: $('#k-tmdb').value.trim() }); toast('Saved — fetching artwork…'); await api('/api/scan', 'POST', {}); watchScan(); },
  saveName: async () => { await api('/api/settings', 'POST', { serverName: $('#k-name').value.trim() }); toast('Saved'); },
  setMeta: async el => { await api('/api/settings', 'POST', { metadata: el.dataset.v === '1' }); renderSettings(); },
  setApps: async el => {
    S.showApps = el.dataset.v === '1';
    store.set('showApps', S.showApps);
    try { await api('/api/prefs', 'POST', { showApps: S.showApps }); } catch (e) { toast('Saved on this TV — your PC is offline, so other screens update later.'); }
    toast(S.showApps ? 'Streaming apps shown' : 'Streaming apps hidden — only your movies now', 2500);
    render();
  },
  setPlayer: async el => { await api('/api/settings', 'POST', { player: el.dataset.v }); renderSettings(); },
  removeDevice: async el => { await api('/api/devices/remove', 'POST', { id: el.dataset.id }); renderSettings(); },
  autostart: async el => { await window.goatDesktop.setAutostart(el.dataset.v === '1'); renderSettings(); },
  unlink: () => { if (confirm('Unlink from your PC? You can link again any time.')) unlink(false); },
  tvCloudScan: () => tvCloudScan(),
  phoneSignIn: el => openPhoneSignIn(el.dataset.provider),
  addCloud: () => openCloudPicker(),
  checkUpdates: async () => {
    if (TV) return tvCheckUpdate(true);
    const s = await window.goatDesktop.checkForUpdates();
    S.update = s;
    const box = $('#upd-line');
    if (box) box.innerHTML = updateLine(s);
  },
  installUpdate: () => window.goatDesktop.installUpdate(),
  setIntro: el => { store.set('introAlways', el.dataset.v === '1'); renderSettings(); },
  replayIntro: () => { store.set('introSeen', false); playIntro(); },
};

// TV / browser: pick which cloud drive to add (big tiles), then sign in by phone
const CLOUD_TILE = {
  gdrive: { bg: '#fff', fg: '#1a73e8' }, onedrive: { bg: '#0078d4', fg: '#fff' }, dropbox: { bg: '#0061fe', fg: '#fff' },
};
async function openCloudPicker() {
  if (!S.online) { toast('Turn on Goat Stream on your PC first — it handles the sign-in.'); return; }
  let info;
  try { info = await api('/api/cloud/providers'); } catch (e) { toast(e.message); return; }
  S.cloudAccounts = info.accounts;
  const ov = openOverlay(`<div class="dialog" style="width:min(48rem,100%)">
    <h2>Add a cloud drive</h2>
    <p>Pick one — a QR code appears, scan it with your phone and sign in there.</p>
    <div class="cloud-tiles">${CLOUDS.map(c => {
      const ready = info.phoneSignIn && info.providers[SIGNIN[c]];
      const n = info.accounts.filter(a => a.provider === c).length;
      return `<button class="cloud-tile focusable" ${ready ? '' : 'disabled'} data-provider="${SIGNIN[c]}" style="--bg:${CLOUD_TILE[c].bg};--fg:${CLOUD_TILE[c].fg}">
        <span class="ct-logo">${PROVIDER_BADGE[c][1]}</span><b>${SOURCE_NAMES[c]}</b>
        <small>${ready ? (n ? `${n} connected · add another` : 'Scan with your phone') : 'Needs a one-time setup on your PC'}</small></button>`;
    }).join('')}</div>
    ${CLOUDS.some(c => !(info.phoneSignIn && info.providers[SIGNIN[c]])) ? `<p style="color:#999;font-size:.85rem;margin-top:1rem">Greyed out? On your PC open Goat Stream → Settings → Cloud drives → App keys (see the README).</p>` : ''}
    <div class="btns"><button class="btn btn-dark focusable" data-act="closeOverlay">Close</button></div></div>`);
  ov.addEventListener('click', e => {
    const b = e.target.closest('.cloud-tile');
    if (!b || b.disabled) return;
    closeOverlay(ov);
    openPhoneSignIn(b.dataset.provider);
  });
}

// Sign in to a cloud drive by scanning a QR code with your phone
async function openPhoneSignIn(provider) {
  const name = { google: 'Google Drive', dropbox: 'Dropbox', onedrive: 'OneDrive' }[provider];
  let link;
  try { link = await api('/api/oauth/phone', 'POST', { provider }); } catch (e) { toast(e.message, 6000); return; }
  const ov = openOverlay(`<div class="dialog" style="width:min(40rem,100%)">
    <h2>Connect ${name}</h2>
    <div class="getpc" style="margin-top:1rem">
      <div class="qr" style="width:13rem;height:13rem">${qrSvg(link.url)}</div>
      <div><ol style="font-size:1rem">
        <li>Open your phone's <b>camera</b> and point it at the code.</li>
        <li>Tap the link and sign in to ${name}.</li>
        <li>That's it — this screen updates by itself.</li></ol>
        <p style="color:#999;font-size:.85rem">Your phone must be on the same Wi-Fi as your PC.</p></div>
    </div>
    <p id="ps-status" style="margin-top:1rem"><span class="spinner" style="display:inline-block;width:1.2rem;height:1.2rem;vertical-align:middle;border-width:3px"></span>&nbsp; Waiting for you to sign in on your phone…</p>
    <div class="btns"><button class="btn btn-dark focusable" data-autofocus data-act="closeOverlay">Cancel</button></div></div>`);
  for (let i = 0; i < 400 && document.contains(ov); i++) {
    await sleep(2000);
    let st;
    try { st = await api('/api/oauth/phone/' + link.key); } catch (e) { st = { state: 'expired' }; }
    if (st.state === 'waiting') continue;
    const status = ov.querySelector('#ps-status');
    if (st.state === 'done') {
      status.innerHTML = `<span class="ok">✓ ${esc(name)} connected${st.name ? ' — ' + esc(st.name) : ''}</span>`;
      toast(`${name} connected! Finding your movies…`);
      setTimeout(() => closeOverlay(ov), 1500);
      if (S.page === 'settings') renderSettings();
      if (canAdmin()) watchScan();
      else { await sleep(4000); loadLibrary(true); }
      return;
    }
    status.innerHTML = `<span class="warn">${esc(st.error || 'This code expired.')} Close and try again.</span>`;
    return;
  }
}

// Scan cloud drives straight from the TV (works with the PC off)
async function tvCloudScan() {
  const accs = store.get('accounts', []);
  toast('Scanning your cloud drives…');
  const old = Object.fromEntries(S.items.map(i => [i.id, i]));
  const items = S.items.filter(i => !(i.cloud && accs.some(a => a.id === i.cloud.accountId)));
  for (const a of accs) {
    try {
      for (const it of await cloud.list(a)) items.push(Object.assign({}, old[it.id], it, { added: (old[it.id] && old[it.id].added) || it.added || Date.now() }));
    } catch (e) {
      toast(SOURCE_NAMES[a.provider] + ': ' + e.message);
      items.push(...S.items.filter(i => i.cloud && i.cloud.accountId === a.id));
    }
  }
  store.set('accounts', accs);
  S.items = items;
  store.set('lib', items);
  buildTitles();
  render();
  toast('Cloud library updated');
}

function unlink(expired) {
  conn.token = '';
  store.set('token', '');
  if (TV) { conn.base = ''; store.set('server', ''); }
  if (expired) toast('This device was unlinked from your PC. Link it again to keep watching.');
  onboarding();
}

// ---------- pairing (Android TV app + TV browsers) ----------
function onboarding() {
  const old = $('.onboard');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'onboard';
  el.innerHTML = `<div class="onboard-inner">
    <img class="logo" src="img/icon.png" alt="Goat Stream">
    <h1>Welcome to Goat Stream</h1>
    <div id="ob-step"></div></div>`;
  document.body.appendChild(el);
  if (TV) obSearch(); else obPair(location.origin);
}
function obStep(html) {
  const box = $('#ob-step');
  if (!box) return;
  box.innerHTML = html;
  const f = box.querySelector('[data-autofocus]') || box.querySelector('.focusable');
  if (f) f.focus();
}
// "Get Goat Stream for your PC" box with a QR code (TV setup screen + TV settings)
const GH_REPO = (window.GOAT_CONFIG && window.GOAT_CONFIG.githubRepo) || '';
const PC_URL = (window.GOAT_CONFIG && window.GOAT_CONFIG.pcDownloadUrl) || (GH_REPO ? `https://github.com/${GH_REPO}/releases/latest` : '');
function qrSvg(text) {
  try {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  } catch (e) { return ''; }
}
function pcDownloadHTML() {
  const steps = `<ol><li>On your Windows PC, ${PC_URL ? 'open the link below (or scan the code with your phone to send it to yourself)' : 'install Goat Stream for Windows'}.</li>
    <li>Install it and add your movie folders.</li><li>Come back here and choose <b>Search again</b>.</li></ol>`;
  return `<div class="getpc">
    ${PC_URL ? `<div class="qr">${qrSvg(PC_URL)}</div>` : ''}
    <div><b class="getpc-title">💻 Get Goat Stream for your PC</b>
      <p>Goat Stream on your PC holds your movies and connects your Google Drive, OneDrive & Dropbox. Your TV plays everything from it.</p>
      ${steps}
      ${PC_URL ? `<div class="getpc-url">${esc(PC_URL.replace(/^https?:\/\//, ''))}</div>` : ''}</div>
  </div>`;
}

function obSearch() {
  obStep(`<p>Looking for Goat Stream on your PC…</p><div class="spinner" style="margin:2rem auto"></div>`);
  window.goatDiscovered = json => {
    let list = [];
    try { list = JSON.parse(json); } catch (e) { /* none */ }
    if (list.length === 1 && !obSearch.retried) { obPair(`http://${list[0].host}:${list[0].port}`, list[0].name); return; }
    obStep(`<p>${list.length ? 'Pick your PC:' : 'Couldn\'t find your PC. Make sure Goat Stream is open on your PC and both are on the same Wi-Fi / network.'}</p>
      <div class="server-list">${list.map(s => `<button class="server focusable" data-ob="pick" data-url="http://${esc(s.host)}:${s.port}" data-name="${esc(s.name)}">${I.tv}<div><b>${esc(s.name)}</b><small>${esc(s.host)}</small></div></button>`).join('')}</div>
      <div class="btns" style="justify-content:center"><button class="btn btn-play focusable" data-ob="retry">Search again</button>
      <button class="btn btn-dark focusable" data-ob="manual">Enter PC address</button></div>
      ${list.length ? '' : pcDownloadHTML()}`);
  };
  window.GoatTV.discover();
}
async function obPair(base, name) {
  obStep(`<p>Connecting to <b>${esc(name || 'your PC')}</b>…</p><div class="spinner" style="margin:2rem auto"></div>`);
  const deviceName = TV ? window.GoatTV.deviceName() : guessDeviceName();
  const post = (path, data) => http('POST', base + path, { 'Content-Type': 'application/json' }, JSON.stringify(data));
  const r = await post('/api/pair/request', { deviceName });
  let req = null;
  try { req = JSON.parse(r.text); } catch (e) { /* bad reply */ }
  if (!req || !req.requestId) {
    obStep(`<p class="warn">Couldn't connect to ${esc(base)}.</p><div class="btns" style="justify-content:center">
      ${TV ? '<button class="btn btn-play focusable" data-ob="retry">Search again</button><button class="btn btn-dark focusable" data-ob="manual">Enter PC address</button>' : '<button class="btn btn-play focusable" data-ob="again">Try again</button>'}</div>`);
    return;
  }
  obStep(`<p style="font-size:1.3rem">On your PC, click <span class="code">Allow</span><br>to let <b>${esc(deviceName)}</b> watch your movies.</p>
    <div class="spinner" style="margin:2rem auto"></div><p style="color:#888">Goat Stream on your PC is showing a pop-up right now.</p>`);
  for (let i = 0; i < 100; i++) {
    await sleep(1500);
    if (!$('.onboard')) return;
    const s = await http('GET', base + '/api/pair/status/' + req.requestId);
    let st = null;
    try { st = JSON.parse(s.text); } catch (e) { continue; }
    if (st.state === 'approved') {
      conn.token = st.token;
      store.set('token', st.token);
      if (TV) { conn.base = base; store.set('server', base); }
      $('.onboard').remove();
      toast('Linked! Enjoy your movies 🐐');
      S.page = 'home';
      loadLibrary();
      return;
    }
    if (st.state === 'denied' || st.state === 'expired' || s.status === 404) break;
  }
  obStep(`<p class="warn">The request wasn't approved.</p><div class="btns" style="justify-content:center"><button class="btn btn-play focusable" data-ob="again" data-url="${esc(base)}">Try again</button>
    ${TV ? '<button class="btn btn-dark focusable" data-ob="retry">Search again</button>' : ''}</div>`);
}
function guessDeviceName() {
  const ua = navigator.userAgent;
  if (/Tizen/i.test(ua)) return 'Samsung TV';
  if (/Web0S|webOS/i.test(ua)) return 'LG TV';
  if (/Roku/i.test(ua)) return 'Roku TV';
  if (/PlayStation/i.test(ua)) return 'PlayStation';
  if (/Xbox/i.test(ua)) return 'Xbox';
  if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad';
  if (/Android/i.test(ua)) return 'Android device';
  return 'Web browser';
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ob]');
  if (!b) return;
  const a = b.dataset.ob;
  if (a === 'retry') { obSearch.retried = true; obSearch(); }
  else if (a === 'pick') obPair(b.dataset.url, b.dataset.name);
  else if (a === 'again') obPair(b.dataset.url || (TV ? conn.base : location.origin));
  else if (a === 'manual') {
    obStep(`<p>Type the address shown in Goat Stream on your PC (Settings → TVs & devices), like <span class="code">192.168.1.20</span></p>
      <div class="field"><input class="input focusable" id="ob-addr" data-autofocus placeholder="192.168.1.20" inputmode="decimal"><button class="btn btn-play focusable" data-ob="go">Connect</button></div>`);
  } else if (a === 'go') {
    let v = ($('#ob-addr').value || '').trim().replace(/\/+$/, '');
    if (!v) return;
    if (!/^https?:\/\//.test(v)) v = 'http://' + v;
    if (!/:\d+$/.test(v)) v += ':8787';
    obPair(v);
  }
});

// ---------- PC: approve TVs that ask to link ----------
const seenPairs = new Set();
async function pollPairRequests() {
  try {
    const { pending } = await api('/api/pair/pending');
    for (const p of pending) {
      if (seenPairs.has(p.id)) continue;
      seenPairs.add(p.id);
      const ov = openOverlay(`<div class="dialog"><div class="big-icon">📺</div>
        <h2>${esc(p.name)} wants to connect</h2>
        <p>Allow this device (${esc(p.ip)}) to watch movies from Goat Stream on this PC${'?'}</p>
        <div class="btns"><button class="btn btn-play focusable" data-autofocus data-pair="allow">Allow</button><button class="btn btn-dark focusable" data-pair="deny">Deny</button></div></div>`);
      ov.addEventListener('click', async e => {
        const b = e.target.closest('[data-pair]');
        if (!b) return;
        await api('/api/pair/answer', 'POST', { requestId: p.id, allow: b.dataset.pair === 'allow' }).catch(() => {});
        closeOverlay(ov);
        if (b.dataset.pair === 'allow') toast(p.name + ' is linked 🎉');
        if (S.page === 'settings') renderSettings();
      });
    }
  } catch (e) { /* server restarting */ }
}

// ---------- automatic updates ----------
const newer = (a, b) => {                       // is version a newer than b?
  const pa = String(a).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

// Android TV: look for a newer APK in the GitHub releases (twice a day at most, or when asked)
async function tvCheckUpdate(manual) {
  if (!TV || !GH_REPO) { if (manual) toast('Updates aren\'t set up for this TV app yet.'); return; }
  if (!manual && Date.now() - store.get('updChecked', 0) < 12 * 3600e3) return;
  store.set('updChecked', Date.now());
  const r = await http('GET', `https://api.github.com/repos/${GH_REPO}/releases/latest`, { Accept: 'application/vnd.github+json' });
  let rel = null;
  try { rel = JSON.parse(r.text); } catch (e) { /* offline */ }
  const apk = rel && (rel.assets || []).find(a => /\.apk$/i.test(a.name));
  const current = window.GoatTV.appVersion();
  if (!rel || !apk || !newer(rel.tag_name, current)) { if (manual) toast(rel ? `You have the latest version (${current}).` : 'Couldn\'t check for updates — are you online?'); return; }
  const ov = openOverlay(`<div class="dialog"><div class="big-icon">⬆️</div><h2>Goat Stream ${esc(rel.tag_name.replace(/^v/, ''))} is here</h2>
    <p>${esc((rel.body || 'New features and fixes.').split('\n').slice(0, 4).join(' '))}</p>
    <p id="upd-status" style="color:#999">You have ${esc(current)}.</p>
    <div class="btns"><button class="btn btn-play focusable" data-autofocus id="upd-go">Update now</button><button class="btn btn-dark focusable" data-act="closeOverlay">Later</button></div></div>`);
  ov.querySelector('#upd-go').addEventListener('click', () => {
    ov.querySelector('#upd-status').textContent = 'Downloading… 0%';
    window.goatUpdateProgress = (pct, msg) => {
      const st = ov.querySelector('#upd-status');
      if (!st) return;
      if (pct === -1 && msg === 'allow') st.innerHTML = 'Turn on <b>Allow from this source</b> for Goat Stream, press Back, then choose <b>Update now</b> again.';
      else if (pct === -1) st.innerHTML = `<span class="warn">Update failed: ${esc(msg)}</span>`;
      else if (pct >= 100) st.textContent = 'Opening the installer — choose Install.';
      else st.textContent = `Downloading… ${pct}%`;
    };
    window.GoatTV.installUpdate(apk.browser_download_url);
  });
}

// Windows app: updates download by themselves; offer a restart when one is ready
function desktopUpdates() {
  if (!DESKTOP || !window.goatDesktop.onUpdateState) return;
  const show = s => {
    S.update = s;
    if (s.state === 'ready' && !$('.update-bar')) {
      const bar = document.createElement('div');
      bar.className = 'update-bar';
      bar.innerHTML = `⬆️ Goat Stream ${esc(s.version)} is ready <button class="btn btn-play btn-small focusable" id="upd-restart">Restart & update</button><button class="icon-btn" id="upd-x" aria-label="Later">${I.close}</button>`;
      document.body.appendChild(bar);
      bar.querySelector('#upd-restart').onclick = () => window.goatDesktop.installUpdate();
      bar.querySelector('#upd-x').onclick = () => bar.remove();
    }
    const box = $('#upd-line');
    if (box) box.innerHTML = updateLine(s);
  };
  window.goatDesktop.onUpdateState(show);
  window.goatDesktop.updateState().then(show);
}
function updateLine(s) {
  s = s || {};
  return ({
    dev: 'Running from source — updates are off.', checking: 'Checking for updates…', latest: '<span class="ok">✓ You have the latest version.</span>',
    downloading: `Downloading ${esc(s.version || '')}… ${s.percent || 0}%`, ready: `<span class="ok">Version ${esc(s.version)} is ready — restart to install.</span>`,
    error: `<span class="warn">Couldn't check: ${esc(s.error || '')}</span>`,
  })[s.state] || 'Checks automatically every few hours.';
}
function updatesHTML(version) {
  if (DESKTOP) {
    return `<div class="sec"><h2>⬆️ Updates</h2>
      <div class="li"><div class="grow"><b>Goat Stream ${esc(version)}</b><small id="upd-line">${updateLine(S.update)}</small></div>
        <button class="btn btn-dark btn-small focusable" data-act="checkUpdates">Check now</button>
        ${S.update && S.update.state === 'ready' ? '<button class="btn btn-play btn-small focusable" data-act="installUpdate">Restart & update</button>' : ''}</div>
      <p style="color:#999;font-size:.85rem">New versions download in the background and install when Goat Stream restarts.</p></div>`;
  }
  if (TV) {
    return `<div class="sec"><h2>⬆️ Updates</h2>
      <div class="li"><div class="grow"><b>Goat Stream ${esc(window.GoatTV.appVersion())}</b><small>Checks for new versions automatically.</small></div>
        <button class="btn btn-dark btn-small focusable" data-act="checkUpdates">Check now</button></div></div>`;
  }
  return '';
}

// ---------- logo intro (first launch on each device, or every launch if switched on) ----------
function playIntro() {
  if (store.get('introSeen', false) && !store.get('introAlways', false)) return;
  store.set('introSeen', true);
  const vmax = Math.max(innerWidth, innerHeight);
  // sparks rush in from all around and meet at the logo
  const sparks = Array.from({ length: 36 }, () => {
    const a = Math.random() * Math.PI * 2, d = vmax * (0.45 + Math.random() * 0.35);
    return `<i style="--x:${Math.cos(a) * d}px;--y:${Math.sin(a) * d}px;animation-delay:${(0.2 + Math.random() * 0.25).toFixed(2)}s"></i>`;
  }).join('');
  // embers float up after the impact
  const embers = Array.from({ length: 40 }, () => {
    const x = (Math.random() - 0.5) * vmax * 0.9, rise = -(innerHeight * (0.35 + Math.random() * 0.45));
    return `<i style="left:${x.toFixed(0)}px;top:${(innerHeight * (0.1 + Math.random() * 0.4)).toFixed(0)}px;--x:${((Math.random() - 0.5) * 120).toFixed(0)}px;--y:${rise.toFixed(0)}px;animation-delay:${(1.1 + Math.random() * 1.6).toFixed(2)}s"></i>`;
  }).join('');
  const el = document.createElement('div');
  el.className = 'intro';
  el.innerHTML = `<div class="intro-world">
      <div class="intro-streak"></div><div class="intro-rays"></div><div class="intro-glow"></div>
      <div class="intro-ring"></div><div class="intro-ring r2"></div>
      <div class="intro-sparks">${sparks}</div><div class="intro-embers">${embers}</div>
      <div class="intro-stage">
        <div class="intro-goat-wrap"><img class="intro-goat" src="img/goat-mark.png" alt=""><div class="intro-glint"></div></div>
        <div class="intro-word"><img src="img/wordmark.png" alt="Goat Stream"></div>
        <div class="intro-credit">Created by Santiago</div>
      </div>
      <div class="intro-flash"></div>
    </div>
    <div class="intro-skip">${TV ? 'Press OK to skip' : 'Click to skip'}</div>`;
  document.body.appendChild(el);
  introSound();
  let gone = false;
  const done = () => { if (gone) return; gone = true; el.remove(); document.removeEventListener('keydown', skip, true); };
  const skip = e => { e.preventDefault(); e.stopPropagation(); el.style.animation = 'introOut .3s forwards'; setTimeout(done, 300); };
  el.addEventListener('click', skip);
  document.addEventListener('keydown', skip, true);
  setTimeout(done, 5050);
}
// Cinematic soundtrack, synthesized (no sound files): riser -> BOOM -> glint -> whoosh through.
// Silently skipped where the device doesn't allow sound before a tap.
function introSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.6;
    // a little room around everything
    const verb = ctx.createConvolver(), vlen = ctx.sampleRate * 2.2, ir = ctx.createBuffer(2, vlen, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < vlen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / vlen, 3); }
    verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    master.connect(ctx.destination); master.connect(verb).connect(wet).connect(ctx.destination);
    const noise = secs => {
      const len = Math.floor(ctx.sampleRate * secs), b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const s = ctx.createBufferSource(); s.buffer = b; return s;
    };
    const env = (g, t, peak, attack, release) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    };
    const sweep = (t, dur, f1, f2, peak) => {           // filtered-noise whoosh
      const n = noise(dur + 0.1), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
      n.connect(f).connect(g).connect(master); n.start(t); n.stop(t + dur + 0.1);
    };
    // 1. riser while the sparks rush in
    sweep(now + 0.1, 0.95, 300, 6000, 0.35);
    const rise = ctx.createOscillator(), rg = ctx.createGain();
    rise.type = 'sawtooth';
    rise.frequency.setValueAtTime(60, now + 0.2); rise.frequency.exponentialRampToValueAtTime(240, now + 1.05);
    const rlp = ctx.createBiquadFilter(); rlp.type = 'lowpass'; rlp.frequency.value = 900;
    rg.gain.setValueAtTime(0.0001, now + 0.2); rg.gain.exponentialRampToValueAtTime(0.12, now + 1.0); rg.gain.exponentialRampToValueAtTime(0.0001, now + 1.08);
    rise.connect(rlp).connect(rg).connect(master); rise.start(now + 0.2); rise.stop(now + 1.1);
    // 2. IMPACT: sub drop + punch + crash
    const t0 = now + 1.05;
    for (const [f, g] of [[48, 1.2], [72, 0.6], [96, 0.3]]) {
      const o = ctx.createOscillator(), v = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 2.2, t0); o.frequency.exponentialRampToValueAtTime(f, t0 + 0.3);
      env(v, t0, g, 0.015, 2.6);
      o.connect(v).connect(master); o.start(t0); o.stop(t0 + 2.8);
    }
    const crash = noise(2), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
    cf.type = 'lowpass'; cf.frequency.setValueAtTime(8000, t0); cf.frequency.exponentialRampToValueAtTime(400, t0 + 1.6);
    env(cg, t0, 0.5, 0.005, 1.6);
    crash.connect(cf).connect(cg).connect(master); crash.start(t0); crash.stop(t0 + 2);
    // 3. sunglasses glint "ting"
    const t2 = now + 2.12;
    for (const [f, g] of [[2637, 0.12], [3951, 0.07], [5274, 0.04]]) {
      const o = ctx.createOscillator(), v = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      env(v, t2, g, 0.005, 0.9);
      o.connect(v).connect(master); o.start(t2); o.stop(t2 + 1);
    }
    // 4. shimmer on the name, whoosh as we fly through the logo
    sweep(now + 2.4, 0.8, 3000, 10000, 0.08);
    sweep(now + 3.9, 0.9, 200, 3000, 0.45);
    setTimeout(() => ctx.close().catch(() => {}), 6500);
  } catch (e) { /* no audio — the animation still plays */ }
}

function introToggleHTML() {
  return `<div class="sec"><h2>✨ Logo intro</h2>
    <div class="li"><div class="grow"><b>Play the intro every time Goat Stream opens</b><small>Off = only the very first time on this ${TV ? 'TV' : 'device'}.</small></div>
      <div class="seg"><button class="focusable ${store.get('introAlways', false) ? 'on' : ''}" data-act="setIntro" data-v="1">Every time</button><button class="focusable ${store.get('introAlways', false) ? '' : 'on'}" data-act="setIntro" data-v="0">First time</button></div></div>
    <div class="btns" style="margin-top:.6rem"><button class="btn btn-dark btn-small focusable" data-act="replayIntro">▶ Watch it now</button></div></div>`;
}

// ---------- boot ----------
async function boot() {
  playIntro();
  if (TV) {
    try { S.installedApps = JSON.parse(window.GoatTV.installedApps(JSON.stringify(STREAMING_APPS.map(a => a.pkg).filter(Boolean)))); } catch (e) { S.installedApps = null; }
  }
  if (needsPairing()) {
    $('#app').innerHTML = '';
    onboarding();
    return;
  }
  await loadLibrary(MODE === 'desktop');
  desktopUpdates();
  if (TV) setTimeout(() => tvCheckUpdate(false), 6000);
  if (MODE === 'desktop' || IS_LOCALHOST) {
    api('/api/settings').then(s => { S.settings = s; }).catch(() => {});
    setInterval(pollPairRequests, 2000);
    if (S.scanning) watchScan();
  }
  // keep remote devices fresh when they come back to the app
  if (MODE !== 'desktop') document.addEventListener('visibilitychange', () => { if (!document.hidden && !Player.active && !needsPairing()) loadLibrary(true); });
}
window.goatResume = () => { if (!needsPairing() && !tvPlaying) loadLibrary(true); };
boot();
})();
