'use strict';
/* Goat Stream media server — runs inside the Windows app.
 * - Scans movie folders, reads Google Drive / Dropbox, fetches artwork (TMDB, optional)
 * - Streams original files with range requests (direct play, full 4K quality)
 * - Converts formats a device can't play with ffmpeg (audio-only "remux" keeps the original picture)
 * - Lets TVs find it (UDP broadcast) and link with one click
 * - Only answers devices on your home network */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const dgram = require('dgram');
const { Readable } = require('stream');
const { EventEmitter } = require('events');
const { execFile, spawn } = require('child_process');

const PORT = 8787;
const DISCOVERY_PORT = 8788;
const VIDEO_TYPES = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.ts': 'video/mp2t', '.m2ts': 'video/mp2t', '.wmv': 'video/x-ms-wmv',
};
const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};

const ffmpegPath = (() => {
  try { return require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'); } catch (e) { return null; }
})();

const rand = n => crypto.randomBytes(n).toString('hex');
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = s => crypto.createHash('sha1').update(s).digest('hex');

// Home-network addresses only: 10/8, 172.16/12, 192.168/16, 169.254/16, loopback, IPv6 ULA/link-local
function isPrivateIp(ip) {
  ip = String(ip || '').replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.')) return true;
  if (/^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe80:/i.test(ip)) return true;
  return false;
}
const isLoopback = ip => { ip = String(ip || '').replace(/^::ffff:/, ''); return ip === '::1' || ip.startsWith('127.'); };

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && isPrivateIp(a.address)) out.push(a.address);
  }
  return out;
}

function start({ dataDir, webDir, appKeys, version }) {
  const events = new EventEmitter();
  const GoatCloud = require(path.join(webDir, 'js', 'cloud-core.js'));
  const thumbsDir = path.join(dataDir, 'thumbs');
  fs.mkdirSync(thumbsDir, { recursive: true });

  // ---------- storage ----------
  const storeFile = path.join(dataDir, 'goat-store.json');
  const defaults = () => ({
    settings: {
      folders: [], disabledFolders: [], tmdbKey: (appKeys.tmdb || ''), metadata: true, serverName: os.hostname(), player: 'builtin', showApps: true,
      google: { clientId: '', clientSecret: '' }, dropbox: { appKey: '' }, onedrive: { clientId: '' },
    },
    accounts: [], devices: {}, items: {}, meta: {}, progress: {}, mylist: {},
  });
  let db = (() => {
    try {
      const j = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
      const d = defaults();
      return Object.assign(d, j, { settings: Object.assign(d.settings, j.settings) });
    } catch (e) { return defaults(); }
  })();
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const tmp = storeFile + '.tmp';
      fs.writeFile(tmp, JSON.stringify(db), err => { if (!err) fs.rename(tmp, storeFile, () => {}); });
    }, 400);
  }
  const keys = () => ({
    googleId: db.settings.google.clientId || (appKeys.google && appKeys.google.clientId) || '',
    googleSecret: db.settings.google.clientSecret || (appKeys.google && appKeys.google.clientSecret) || '',
    dropboxKey: db.settings.dropbox.appKey || (appKeys.dropbox && appKeys.dropbox.appKey) || '',
    onedriveId: db.settings.onedrive.clientId || (appKeys.onedrive && appKeys.onedrive.clientId) || '',
  });

  const cloud = GoatCloud.create(async (method, url, headers, body) => {
    try {
      const r = await fetch(url, { method, headers, body: body == null ? undefined : body });
      return { status: r.status, text: await r.text() };
    } catch (e) { return { status: 0, text: String(e.message || e) }; }
  });

  // ---------- library scan ----------
  let scanning = false, scanAgain = false;
  async function walk(dir, out, depth, root) {
    if (depth > 14) return;
    let ents;
    try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      if (e.name.startsWith('.') || e.name.startsWith('$')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(p, out, depth + 1, root); continue; }
      if (!VIDEO_TYPES[path.extname(e.name).toLowerCase()]) continue;
      const st = await fsp.stat(p).catch(() => null);
      if (!st) continue;
      if (/\bsample\b/i.test(e.name) && st.size < 300 * 1048576) continue;
      const id = 'l_' + sha(p.toLowerCase()).slice(0, 16);
      out[id] = Object.assign(GoatCloud.parseName(e.name, path.basename(dir), path.basename(path.dirname(dir))), {
        id, source: 'local', name: e.name, path: p, folder: root, size: st.size, modified: st.mtimeMs, added: st.birthtimeMs || st.mtimeMs,
      });
    }
  }

  async function scan() {
    if (scanning) { scanAgain = true; return; }
    scanning = true;
    try {
      const found = {};
      // folders switched off in Settings stay listed but aren't played from
      for (const f of db.settings.folders) if (!db.settings.disabledFolders.includes(f)) await walk(f, found, 0, f);
      for (const acc of db.accounts) {
        try {
          for (const it of await cloud.list(acc)) found[it.id] = it;
          acc.error = null;
        } catch (e) {
          acc.error = e.message;
          for (const [id, it] of Object.entries(db.items)) if (it.cloud && it.cloud.accountId === acc.id) found[id] = it;
        }
      }
      const items = {};
      for (const [id, it] of Object.entries(found)) {
        const old = db.items[id];
        items[id] = Object.assign({}, it, {
          added: (old && old.added) || it.added || Date.now(),
          thumb: it.thumb || (old && old.thumb) || null,
          probe: old && old.size === it.size ? old.probe : undefined,
        });
      }
      db.items = items;
      save();
      await enrich();
    } catch (e) {
      console.error('scan failed', e);
    } finally {
      scanning = false;
      save();
      if (scanAgain) { scanAgain = false; scan(); }
    }
  }

  // ---------- ffmpeg: thumbnails + format probing ----------
  function runFfmpeg(args, timeout) {
    return new Promise(res => {
      if (!ffmpegPath) return res({ ok: false, err: '' });
      execFile(ffmpegPath, args, { timeout: timeout || 60000, windowsHide: true, maxBuffer: 8 * 1048576 },
        (err, so, se) => res({ ok: !err, err: String(se || '') }));
    });
  }
  function parseProbe(text) {
    const pr = {};
    const d = text.match(/Duration: (\d+):(\d+):(\d+\.?\d*)/);
    if (d) pr.duration = Math.round(+d[1] * 3600 + +d[2] * 60 + +d[3]);
    const v = text.match(/Stream #\d+:\d+[^:]*: Video: (\w+)[^\n]*?(\d{3,5})x(\d{3,5})/);
    if (v) { pr.vcodec = v[1]; pr.width = +v[2]; pr.height = +v[3]; }
    const vline = (text.match(/Stream #\d+:\d+[^:]*: Video:[^\n]*/) || [''])[0];
    pr.hdr = /smpte2084|arib-std-b67|bt2020/.test(vline);
    if (/dovi|dolby vision/i.test(text)) pr.dv = true;
    const a = text.match(/Stream #\d+:\d+[^:]*: Audio: ([\w-]+)[^\n]*?(\d+\.\d|stereo|mono)?/);
    if (a) pr.acodec = a[1].replace(/^pcm_.*/, 'pcm');
    if (/TrueHD|truehd/.test(text) && /Atmos/i.test(text)) pr.atmos = true;
    return pr;
  }
  async function probeAndThumb(it) {
    const out = path.join(thumbsDir, it.id + '.jpg');
    let r = await runFfmpeg(['-hide_banner', '-ss', '300', '-i', it.path, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', '-y', out]);
    const probe = parseProbe(r.err);
    if (!fs.existsSync(out) && probe.duration) {
      r = await runFfmpeg(['-hide_banner', '-ss', String(Math.floor(probe.duration * 0.15)), '-i', it.path, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '4', '-y', out]);
    }
    it.probe = probe;
    if (fs.existsSync(out)) it.thumb = '/thumb/' + it.id;
  }

  // ---------- Movie covers & details from TMDB (themoviedb.org) ----------
  const META_VERSION = 2;
  const tmdbKey = () => (db.settings.tmdbKey || '').trim() || (appKeys.tmdb || '').trim();
  async function tmdb(q) {
    const key = tmdbKey();
    const bearer = key.length > 40;
    const url = 'https://api.themoviedb.org/3' + q + (bearer ? '' : (q.includes('?') ? '&' : '?') + 'api_key=' + encodeURIComponent(key));
    const r = await fetch(url, { headers: bearer ? { Authorization: 'Bearer ' + key } : {} });
    if (!r.ok) throw Object.assign(new Error('TMDB ' + r.status), { status: r.status });
    return r.json();
  }
  const img = (p, size) => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);
  const metaKey = it => (it.show ? 's|' + it.show : 'm|' + it.title + '|' + (it.year || '')).toLowerCase();
  const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
  const resultYear = r => +(r.release_date || r.first_air_date || '').slice(0, 4) || null;

  // Best match: exact title (+ year) beats popularity
  function pick(results, title, year) {
    const t = norm(title);
    let best = null, bestScore = -1;
    results.slice(0, 10).forEach((r, i) => {
      const names = [r.title, r.name, r.original_title, r.original_name].map(norm);
      let score = 10 - i;
      if (names.includes(t)) score += 50;
      else if (names.some(n => n.startsWith(t) || t.startsWith(n))) score += 15;
      const y = resultYear(r);
      if (year && y) score += y === year ? 30 : Math.abs(y - year) === 1 ? 15 : -10;
      if (r.poster_path) score += 5;
      score += Math.min(10, (r.popularity || 0) / 10);
      if (score > bestScore) { bestScore = score; best = r; }
    });
    return best;
  }

  async function search(title, year, wantTv) {
    const q = encodeURIComponent(title);
    const tries = wantTv
      ? [`/search/tv?query=${q}`, `/search/multi?query=${q}`]
      : [year && `/search/movie?query=${q}&year=${year}`, `/search/movie?query=${q}`, `/search/multi?query=${q}`].filter(Boolean);
    for (const path of tries) {
      const d = await tmdb(path);
      const results = (d.results || []).filter(r => r.media_type !== 'person');
      if (results.length) {
        const r = pick(results, title, year);
        return { id: r.id, type: r.media_type || (wantTv ? 'tv' : 'movie') };
      }
    }
    // "The.Movie.Name.Extended.Cut" → keep dropping the last word
    const words = title.split(' ');
    if (words.length > 2) return search(words.slice(0, -1).join(' '), year, wantTv);
    return null;
  }

  // Full details: cover, backdrop, title logo, cast, director, runtime, age rating
  async function details(type, id) {
    const extra = type === 'tv' ? 'credits,content_ratings,images' : 'credits,release_dates,images';
    const d = await tmdb(`/${type}/${id}?append_to_response=${extra}&include_image_language=en,null`);
    let cert = '';
    if (type === 'tv') cert = ((d.content_ratings && d.content_ratings.results) || []).find(c => c.iso_3166_1 === 'US')?.rating || '';
    else {
      const us = ((d.release_dates && d.release_dates.results) || []).find(c => c.iso_3166_1 === 'US');
      cert = us ? (us.release_dates.find(x => x.certification) || {}).certification || '' : '';
    }
    const crew = (d.credits && d.credits.crew) || [];
    const directors = type === 'tv' ? (d.created_by || []).map(c => c.name) : crew.filter(c => c.job === 'Director').map(c => c.name);
    const logo = ((d.images && d.images.logos) || []).find(l => l.iso_639_1 === 'en') || ((d.images && d.images.logos) || [])[0];
    return {
      v: META_VERSION, id: d.id, type, title: d.title || d.name, year: resultYear(d), tagline: d.tagline || '',
      overview: d.overview, poster: img(d.poster_path, 'w500'), backdrop: img(d.backdrop_path, 'w780'), backdropHi: img(d.backdrop_path, 'w1280'),
      logo: logo ? img(logo.file_path, 'w500') : null,
      rating: d.vote_average ? Math.round(d.vote_average * 10) / 10 : null,
      genres: (d.genres || []).map(g => g.name),
      runtime: d.runtime || (d.episode_run_time && d.episode_run_time[0]) || null,
      cert, directors: directors.slice(0, 3),
      cast: ((d.credits && d.credits.cast) || []).slice(0, 8).map(c => c.name),
      seasons: d.number_of_seasons || null,
    };
  }

  async function lookup(it) {
    const found = await search(it.show || it.title, it.year, !!it.show);
    if (!found) return { none: true, t: Date.now() };
    return details(found.type, found.id);
  }
  async function seasonInfo(tvId, season) {
    const k = `ep|${tvId}|${season}`;
    if (db.meta[k]) return db.meta[k];
    const d = await tmdb(`/tv/${tvId}/season/${season}`);
    const eps = {};
    for (const e of d.episodes || []) eps[e.episode_number] = { name: e.name, overview: e.overview, still: img(e.still_path, 'w300') };
    return (db.meta[k] = eps);
  }

  async function enrich() {
    if (db.settings.metadata && tmdbKey()) {
      const seen = new Set();
      let n = 0;
      for (const it of Object.values(db.items)) {
        const k = metaKey(it);
        if (seen.has(k)) continue;
        seen.add(k);
        const cur = db.meta[k];
        try {
          if (!cur || (cur.none && Date.now() - (cur.t || 0) > 7 * 864e5)) db.meta[k] = await lookup(it);
          else if (!cur.none && cur.v !== META_VERSION) db.meta[k] = Object.assign(await details(cur.type || (it.show ? 'tv' : 'movie'), cur.id), { fixed: cur.fixed });
        } catch (e) { if (e.status === 401) { console.warn('TMDB key rejected'); break; } continue; }
        if (++n % 10 === 0) save();
        const m = db.meta[k];
        if (it.show && m && m.id && m.type === 'tv') {
          const seasons = new Set(Object.values(db.items).filter(x => x.show === it.show).map(x => x.season));
          for (const s of seasons) { try { await seasonInfo(m.id, s); } catch (e) { /* missing season */ } }
        }
      }
      save();
    }
    await cacheAllArt();
    // local thumbnails + codec info, two at a time
    const todo = Object.values(db.items).filter(it => it.source === 'local' && !it.probe);
    let i = 0;
    const worker = async () => { while (i < todo.length) { const it = todo[i++]; await probeAndThumb(it); if (i % 5 === 0) save(); } };
    await Promise.all([worker(), worker()]);
  }

  // ---------- artwork saved on the PC: works with the internet down, and TVs never contact outside sites ----------
  const artDir = path.join(dataDir, 'art');
  fs.mkdirSync(artDir, { recursive: true });
  const artHave = new Set(fs.readdirSync(artDir));
  const artName = url => sha(url).slice(0, 20) + (/\.png(\?|$)/i.test(url) ? '.png' : '.jpg');
  const art = url => (url && /^https?:/.test(url) && artHave.has(artName(url)) ? '/art/' + artName(url) : url);
  async function cacheArt(url) {
    if (!url || !/^https:/.test(url)) return;
    const name = artName(url);
    if (artHave.has(name)) return;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') || 'image/')) return;
      const buf = Buffer.from(await r.arrayBuffer());
      await fsp.writeFile(path.join(artDir, name), buf);
      artHave.add(name);
    } catch (e) { /* offline or gone — try again next scan */ }
  }
  async function cacheAllArt() {
    const urls = new Set();
    for (const m of Object.values(db.meta)) {
      if (!m || m.none) continue;
      for (const f of ['poster', 'backdrop', 'backdropHi', 'logo']) if (m[f]) urls.add(m[f]);
      for (const ep of Object.values(m)) if (ep && typeof ep === 'object' && ep.still) urls.add(ep.still);   // episode stills
    }
    for (const it of Object.values(db.items)) if (it.source !== 'local' && it.thumb) urls.add(it.thumb);
    const list = [...urls].filter(u => !artHave.has(artName(u)));
    let i = 0;
    const worker = async () => { while (i < list.length) await cacheArt(list[i++]); };
    await Promise.all([worker(), worker(), worker(), worker()]);
  }

  function publicItem(it) {
    const o = {
      id: it.id, source: it.source, name: it.name, title: it.title, year: it.year, show: it.show, season: it.season, episode: it.episode,
      quality: it.quality, hdr: it.hdr, size: it.size, added: it.added, thumb: art(it.thumb), duration: it.duration, cloud: it.cloud,
      folder: it.folder,
    };
    if (it.probe) {
      const p = it.probe;
      o.probe = { vcodec: p.vcodec, acodec: p.acodec, width: p.width, height: p.height, duration: p.duration };
      if (p.width >= 3200 || p.height >= 1800) o.quality = '4K'; else if (!o.quality && (p.width >= 1200 || p.height >= 700)) o.quality = 'HD';
      if (p.hdr || p.dv) o.hdr = true;
      if (!o.duration) o.duration = p.duration;
    }
    const m = db.settings.metadata ? db.meta[metaKey(it)] : null;
    if (m && !m.none) {
      Object.assign(o, {
        tmdbId: m.id, metaTitle: m.title, poster: art(m.poster), backdrop: art(m.backdrop), backdropHi: art(m.backdropHi),
        overview: m.overview, genres: m.genres, rating: m.rating, year: o.year || m.year,
        logo: art(m.logo), tagline: m.tagline, cast: m.cast, directors: m.directors, runtime: m.runtime, cert: m.cert, metaType: m.type,
      });
      if (it.show) {
        const ep = (db.meta[`ep|${m.id}|${it.season}`] || {})[it.episode];
        if (ep) Object.assign(o, { epName: ep.name, epOverview: ep.overview, still: art(ep.still) });
      }
    }
    return o;
  }

  // ---------- format conversion ----------
  let encoder = null;
  async function pickEncoder() {
    if (encoder) return encoder;
    const cands = [
      ['h264_nvenc', ['-preset', 'p5', '-rc', 'vbr', '-cq', '19', '-b:v', '0']],
      ['h264_qsv', ['-preset', 'medium', '-global_quality', '20']],
      ['h264_amf', ['-quality', 'quality', '-rc', 'cqp', '-qp_i', '19', '-qp_p', '21']],
    ];
    for (const [name, opts] of cands) {
      const r = await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=black:s=1280x720:d=0.3', '-c:v', name, '-f', 'null', '-'], 20000);
      if (r.ok) return (encoder = { name, args: ['-c:v', name, ...opts], hw: true });
    }
    return (encoder = { name: 'libx264', args: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-tune', 'film'], hw: false });
  }

  // mode 'remux': keep the original video untouched, convert only the audio  (cheap, full 4K/HDR quality)
  // mode 'transcode': re-encode video to H.264 with the GPU when available
  async function convert(req, res, input, inputHeaders, it, mode, startSec) {
    if (!ffmpegPath) return sendJson(res, 501, { error: 'Format converter (ffmpeg) is missing on the PC.' });
    const args = ['-hide_banner', '-loglevel', 'error'];
    if (startSec > 0) args.push('-ss', String(startSec));
    if (inputHeaders && Object.keys(inputHeaders).length) {
      args.push('-headers', Object.entries(inputHeaders).map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n');
    }
    args.push('-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn', '-map_chapters', '-1');
    if (mode === 'remux') {
      args.push('-c:v', 'copy');
      if (it.probe && it.probe.vcodec === 'hevc') args.push('-tag:v', 'hvc1');
    } else {
      const enc = await pickEncoder();
      const maxH = enc.hw ? 2160 : 1080;      // software can't convert 4K in real time
      args.push(...enc.args, '-vf', `scale=-2:min(ih\\,${maxH}),format=yuv420p`, '-g', '96');
    }
    // audio: keep surround (up to 5.1) at high bitrate
    args.push('-c:a', 'aac', '-b:a', '640k', '-af', 'aformat=channel_layouts=5.1|stereo|mono',
      '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', 'pipe:1');
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store', 'X-Goat-Mode': mode });
    proc.stdout.pipe(res);
    proc.stderr.on('data', d => console.warn('[ffmpeg]', String(d).trim()));
    proc.on('close', () => res.end());
    res.on('close', () => { try { proc.kill('SIGKILL'); } catch (e) { /* already gone */ } });
  }

  // ---------- HTTP helpers ----------
  function sendJson(res, code, obj) {
    if (res.headersSent) return res.end();
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(body);
  }
  function readJson(req) {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on('data', c => { size += c.length; if (size > 2e6) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { resolve({}); } });
      req.on('error', reject);
    });
  }
  function sendFile(req, res, file, type, cacheable) {
    fs.stat(file, (err, st) => {
      if (err) return sendJson(res, 404, { error: 'File not found — was it moved?' });
      const size = st.size;
      let start = 0, end = size - 1, code = 200;
      // artwork never changes under the same name: let TVs keep it (shows even when the PC is off)
      const headers = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cacheable ? 'private, max-age=31536000, immutable' : 'no-cache' };
      const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (m) {
        if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], size - 1); }
        else if (m[2]) { start = Math.max(0, size - +m[2]); }
        if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
        code = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      }
      headers['Content-Length'] = end - start + 1;
      res.writeHead(code, headers);
      if (req.method === 'HEAD') return res.end();
      // big read buffer = smooth 4K over the network
      const s = fs.createReadStream(file, { start, end, highWaterMark: 4 * 1048576 });
      s.pipe(res);
      res.on('close', () => s.destroy());
      s.on('error', () => res.destroy());
    });
  }

  async function stream(req, res, id, u) {
    const it = db.items[id];
    if (!it) return sendJson(res, 404, { error: 'Not in library' });
    const mode = u.searchParams.get('mode') || 'direct';
    const startSec = Math.max(0, +u.searchParams.get('start') || 0);
    let input = it.path, inputHeaders = null, info = null;
    if (it.source !== 'local') {
      const acc = db.accounts.find(a => a.id === it.cloud.accountId);
      if (!acc) return sendJson(res, 404, { error: 'Cloud account disconnected' });
      info = await cloud.playInfo(acc, it);
      save();
      input = info.url; inputHeaders = info.headers;
    }
    if (mode === 'remux' || mode === 'transcode') return convert(req, res, input, inputHeaders, it, mode, startSec);
    if (it.source === 'local') return sendFile(req, res, it.path, VIDEO_TYPES[path.extname(it.path).toLowerCase()] || 'application/octet-stream');
    if (it.source === 'dropbox' || it.source === 'onedrive') { res.writeHead(302, { Location: info.url, 'Cache-Control': 'no-store' }); return res.end(); }
    // Google Drive: proxy with auth header, passing range through so seeking works
    const ac = new AbortController();
    res.on('close', () => ac.abort());
    const headers = Object.assign({}, info.headers);
    if (req.headers.range) headers.Range = req.headers.range;
    const r = await fetch(info.url, { headers, signal: ac.signal });
    const out = { 'Content-Type': VIDEO_TYPES[path.extname(it.name).toLowerCase()] || r.headers.get('content-type') || 'video/mp4', 'Accept-Ranges': 'bytes' };
    for (const h of ['content-length', 'content-range']) if (r.headers.get(h)) out[h] = r.headers.get(h);
    res.writeHead(r.status, out);
    if (!r.body || req.method === 'HEAD') return res.end();
    Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res);
  }

  // ---------- OAuth: sign in to cloud drives ----------
  // Two ways in:
  //  - on the PC: browser -> provider -> http://localhost:8787/oauth/<p>/callback
  //  - by phone (QR code): phone -> /oauth/<p>/phone?k=… on the PC's home-network address -> provider ->
  //    public hand-off page (relay/oauth.html, https) -> back to the PC's home-network address /oauth/<p>/callback
  //    (Google/Dropbox only return to https or localhost, never to a home-network IP — hence the hand-off page)
  const oauthPending = new Map();   // state -> { provider, verifier, redirect, phoneKey, t }
  const phoneLinks = new Map();     // one-time QR codes: k -> { provider, host, t, state, name, error }
  const relayUrl = () => (db.settings.oauthRelay || appKeys.oauthRelay || '').trim();
  const localRedirect = provider => `http://localhost:${PORT}/oauth/${provider}/callback`;
  const PROVIDER_NAMES = { google: 'Google Drive', dropbox: 'Dropbox', onedrive: 'OneDrive' };
  const hasKeys = provider => {
    const k = keys();
    return provider === 'google' ? !!(k.googleId && k.googleSecret) : provider === 'onedrive' ? !!k.onedriveId : !!k.dropboxKey;
  };
  function authUrl(provider, redirect, state, challenge) {
    const k = keys();
    if (provider === 'onedrive') {
      return 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' + new URLSearchParams({
        client_id: k.onedriveId, redirect_uri: redirect, response_type: 'code', response_mode: 'query',
        scope: GoatCloud.ONEDRIVE_SCOPE, prompt: 'select_account',
        code_challenge: challenge, code_challenge_method: 'S256', state,
      });
    }
    if (provider === 'google') {
      return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: k.googleId, redirect_uri: redirect, response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive.readonly openid email', access_type: 'offline', prompt: 'consent',
        code_challenge: challenge, code_challenge_method: 'S256', state,
      });
    }
    return 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams({
      client_id: k.dropboxKey, redirect_uri: redirect, response_type: 'code',
      token_access_type: 'offline', code_challenge: challenge, code_challenge_method: 'S256', state,
    });
  }
  // the address a phone on the home Wi-Fi can reach this PC at
  function phoneHost(req) {
    const h = String(req.headers.host || '');
    const ip = h.replace(/:\d+$/, '');
    if (/^[\d.]+$/.test(ip) && isPrivateIp(ip) && !isLoopback(ip)) return `${ip}:${PORT}`;
    const lan = lanAddresses()[0];
    return lan ? `${lan}:${PORT}` : null;
  }
  function createPhoneLink(req, provider) {
    if (!hasKeys(provider)) throw new Error(`Add the ${PROVIDER_NAMES[provider]} app keys in Settings on the PC first`);
    if (!relayUrl()) throw new Error('Phone sign-in needs the hand-off page — see README, "Sign in with your phone"');
    const host = phoneHost(req);
    if (!host) throw new Error('This PC isn\'t connected to a home network');
    for (const [key, l] of phoneLinks) if (Date.now() - l.t > 20 * 60000) phoneLinks.delete(key);
    const key = rand(12);
    phoneLinks.set(key, { provider, host, t: Date.now(), state: 'waiting' });
    return { key, url: `http://${host}/oauth/${provider}/phone?k=${key}` };
  }
  const doneHtml = (ok, msg) => `<!doctype html><meta charset="utf-8"><title>Goat Stream</title>
    <body style="background:#070707;color:#fff;font-family:Segoe UI,Arial;display:grid;place-items:center;height:100vh;margin:0;text-align:center">
    <div><img src="/img/icon.png" width="140" style="border-radius:22%"><h1 style="color:${ok ? '#ffd978' : '#ff8a7a'}">${ok ? '✓ ' : ''}${msg}</h1>
    <p style="color:#aaa">${ok ? 'You can close this tab and go back to Goat Stream.' : 'Close this tab and try again from Goat Stream.'}</p></div>`;
  async function oauth(req, res, u, local) {
    const [, , provider, step] = u.pathname.split('/');
    if (!PROVIDER_NAMES[provider]) return sendJson(res, 404, { error: 'Unknown provider' });
    const k = keys();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (step === 'start' || step === 'phone') {
      let redirect = localRedirect(provider), phoneKey = null, prefix = '';
      if (step === 'phone') {
        const link = phoneLinks.get(u.searchParams.get('k'));
        if (!link || link.provider !== provider || link.state !== 'waiting' || Date.now() - link.t > 20 * 60000) {
          return res.end(doneHtml(false, 'This QR code has expired — make a new one in Goat Stream'));
        }
        redirect = relayUrl();
        phoneKey = u.searchParams.get('k');
        prefix = `${link.host}~${provider}~`;     // tells the hand-off page where to send the phone back to
      } else if (!local) {
        return res.end(doneHtml(false, 'Use the QR code to sign in from your phone'));
      }
      if (!hasKeys(provider)) return res.end(doneHtml(false, `Add your ${PROVIDER_NAMES[provider]} app keys in Settings first`));
      const state = prefix + rand(16), verifier = b64url(crypto.randomBytes(48));
      const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
      for (const [s, pd] of oauthPending) if (Date.now() - pd.t > 30 * 60000) oauthPending.delete(s);
      oauthPending.set(state, { provider, verifier, redirect, phoneKey, t: Date.now() });
      res.writeHead(302, { Location: authUrl(provider, redirect, state, challenge) });
      return res.end();
    }
    // callback
    const state = u.searchParams.get('state');
    const pend = oauthPending.get(state);
    if (!local && !(pend && pend.phoneKey)) return res.end(doneHtml(false, 'Sign-in link not recognised'));
    oauthPending.delete(state);
    const link = pend && pend.phoneKey ? phoneLinks.get(pend.phoneKey) : null;
    const fail = msg => { if (link) { link.state = 'error'; link.error = msg; } return res.end(doneHtml(false, msg)); };
    if (!pend || pend.provider !== provider || u.searchParams.get('error')) return fail('Sign-in was cancelled');
    const code = u.searchParams.get('code');
    try {
      let acc;
      if (provider === 'google') {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: k.googleId, client_secret: k.googleSecret, redirect_uri: pend.redirect, grant_type: 'authorization_code', code_verifier: pend.verifier }),
        });
        const d = await r.json();
        if (!d.refresh_token) throw new Error(d.error_description || d.error || 'No refresh token');
        const claims = JSON.parse(Buffer.from(d.id_token.split('.')[1], 'base64url').toString());
        acc = { id: 'g' + sha(claims.email).slice(0, 10), provider: 'gdrive', name: claims.email, clientId: k.googleId, clientSecret: k.googleSecret, refreshToken: d.refresh_token, accessToken: d.access_token, expiresAt: Date.now() + d.expires_in * 1000 };
      } else if (provider === 'onedrive') {
        const r = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: k.onedriveId, redirect_uri: pend.redirect, grant_type: 'authorization_code', code_verifier: pend.verifier, scope: GoatCloud.ONEDRIVE_SCOPE }),
        });
        const d = await r.json();
        if (!d.refresh_token) throw new Error(d.error_description || d.error || 'No refresh token');
        const me = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,userPrincipalName,mail,displayName', { headers: { Authorization: 'Bearer ' + d.access_token } }).then(x => x.json()).catch(() => ({}));
        const who = me.mail || me.userPrincipalName || me.displayName || 'OneDrive';
        acc = { id: 'o' + sha(me.id || who).slice(0, 10), provider: 'onedrive', name: who, clientId: k.onedriveId, refreshToken: d.refresh_token, accessToken: d.access_token, expiresAt: Date.now() + d.expires_in * 1000 };
      } else {
        const r = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: k.dropboxKey, redirect_uri: pend.redirect, grant_type: 'authorization_code', code_verifier: pend.verifier }),
        });
        const d = await r.json();
        if (!d.refresh_token) throw new Error(d.error_description || d.error || 'No refresh token');
        const me = await fetch('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST', headers: { Authorization: 'Bearer ' + d.access_token } }).then(x => x.json()).catch(() => ({}));
        acc = { id: 'd' + sha(d.account_id).slice(0, 10), provider: 'dropbox', name: me.email || (me.name && me.name.display_name) || 'Dropbox', clientId: k.dropboxKey, refreshToken: d.refresh_token, accessToken: d.access_token, expiresAt: Date.now() + d.expires_in * 1000 };
      }
      db.accounts = db.accounts.filter(a => a.id !== acc.id).concat(acc);
      save();
      scan();
      events.emit('account-added', acc.provider);
      if (link) { link.state = 'done'; link.name = acc.name; }
      res.end(doneHtml(true, PROVIDER_NAMES[provider] + ' connected'));
    } catch (e) {
      fail('Sign-in failed: ' + e.message);
    }
  }

  // ---------- pairing ----------
  const pairs = new Map();
  const tokenId = t => sha(t).slice(0, 10);

  // ---------- routes ----------
  async function route(req, res) {
    const ip = req.socket.remoteAddress;
    if (!isPrivateIp(ip)) { req.socket.destroy(); return; }      // home network only
    const u = new URL(req.url, 'http://local');
    const p = u.pathname;
    const local = isLoopback(ip);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'x-goat-token, content-type, range');
    res.setHeader('Access-Control-Expose-Headers', 'content-range, content-length, x-goat-mode');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    // public on the LAN
    if (p === '/api/info') return sendJson(res, 200, { app: 'goatstream', name: db.settings.serverName, version });
    if (p === '/api/pair/request' && req.method === 'POST') {
      const body = await readJson(req);
      for (const [id, pr] of pairs) if (Date.now() - pr.t > 180000) pairs.delete(id);
      if ([...pairs.values()].filter(x => x.state === 'pending').length > 8) return sendJson(res, 429, { error: 'Too many requests' });
      const id = rand(8);
      const pr = { id, name: String(body.deviceName || 'TV').slice(0, 60), ip: ip.replace(/^::ffff:/, ''), t: Date.now(), state: 'pending' };
      pairs.set(id, pr);
      events.emit('pair-request', pr);
      return sendJson(res, 200, { requestId: id, serverName: db.settings.serverName });
    }
    if (p.startsWith('/api/pair/status/')) {
      const pr = pairs.get(p.split('/').pop());
      if (!pr) return sendJson(res, 404, { state: 'expired' });
      if (pr.state === 'pending' && Date.now() - pr.t > 180000) pr.state = 'expired';
      const out = { state: pr.state, serverName: db.settings.serverName };
      if (pr.state === 'approved') { out.token = pr.token; pairs.delete(pr.id); }
      return sendJson(res, 200, out);
    }
    if (p.startsWith('/oauth/')) return oauth(req, res, u, local);

    const isApi = p.startsWith('/api/') || p.startsWith('/stream/') || p.startsWith('/thumb/') || p.startsWith('/art/');
    if (!isApi) return serveStatic(req, res, p);

    const token = req.headers['x-goat-token'] || u.searchParams.get('t');
    const device = token && db.devices[token];
    if (!local && !device) return sendJson(res, 401, { error: 'This device isn\'t linked' });
    if (device && Date.now() - (device.lastSeen || 0) > 60000) { device.lastSeen = Date.now(); device.ip = ip.replace(/^::ffff:/, ''); save(); }

    if (p.startsWith('/stream/')) return stream(req, res, decodeURIComponent(p.slice(8)), u);
    if (p.startsWith('/art/')) {
      const name = p.slice(5).replace(/[^\w.]/g, '');
      return sendFile(req, res, path.join(artDir, name), name.endsWith('.png') ? 'image/png' : 'image/jpeg', true);
    }
    if (p.startsWith('/thumb/')) {
      const id = p.slice(7).replace(/[^\w]/g, '');
      return sendFile(req, res, path.join(thumbsDir, id + '.jpg'), 'image/jpeg', true);
    }
    if (p === '/api/library') {
      return sendJson(res, 200, { serverName: db.settings.serverName, scanning, showApps: db.settings.showApps, items: Object.values(db.items).map(publicItem) });
    }
    if (p === '/api/prefs' && req.method === 'POST') {
      // household preferences any linked screen may change
      const b = await readJson(req);
      if (typeof b.showApps === 'boolean') db.settings.showApps = b.showApps;
      save();
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/status') return sendJson(res, 200, { scanning, count: Object.keys(db.items).length });
    if (p === '/api/userdata') {
      if (req.method === 'POST') {
        const body = await readJson(req);
        for (const kind of ['progress', 'mylist']) {
          for (const [k, v] of Object.entries(body[kind] || {})) {
            if (!v || typeof v.t !== 'number') continue;
            if (!db[kind][k] || db[kind][k].t < v.t) db[kind][k] = v;
          }
        }
        save();
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 200, { progress: db.progress, mylist: db.mylist });
    }
    if (p === '/api/cloud/accounts') {
      // linked TVs stream straight from the cloud with these (works even when the PC is off later)
      return sendJson(res, 200, { accounts: db.accounts.map(a => ({ id: a.id, provider: a.provider, name: a.name, clientId: a.clientId, clientSecret: a.clientSecret, refreshToken: a.refreshToken, root: a.root })) });
    }

    // QR-code sign-in: the PC or a linked TV asks for a one-time link, a phone opens it
    if (p === '/api/oauth/phone' && req.method === 'POST') {
      const b = await readJson(req);
      if (!PROVIDER_NAMES[b.provider]) return sendJson(res, 400, { error: 'Unknown provider' });
      try { return sendJson(res, 200, createPhoneLink(req, b.provider)); } catch (e) { return sendJson(res, 400, { error: e.message }); }
    }
    if (p.startsWith('/api/oauth/phone/')) {
      const l = phoneLinks.get(p.split('/').pop());
      if (!l) return sendJson(res, 404, { state: 'expired' });
      return sendJson(res, 200, { state: l.state, name: l.name, error: l.error });
    }

    // ---- PC-only admin ----
    if (!local) return sendJson(res, 403, { error: 'Only on the PC' });
    if (p === '/api/settings' && req.method === 'GET') {
      const k = keys();
      return sendJson(res, 200, {
        version, port: PORT, addresses: lanAddresses(), scanning, count: Object.keys(db.items).length,
        folders: db.settings.folders, disabledFolders: db.settings.disabledFolders, tmdbKey: db.settings.tmdbKey, tmdbBuiltIn: !!(appKeys.tmdb || '').trim(),
        oauthRelay: db.settings.oauthRelay || '', oauthRelayBuiltIn: !!(appKeys.oauthRelay || '').trim(), phoneSignIn: !!relayUrl(), metadata: db.settings.metadata, serverName: db.settings.serverName,
        player: db.settings.player, showApps: db.settings.showApps, google: db.settings.google, dropbox: db.settings.dropbox,
        keys: { google: hasKeys('google'), dropbox: hasKeys('dropbox'), onedrive: hasKeys('onedrive') }, onedrive: db.settings.onedrive,
        ffmpeg: !!ffmpegPath, encoder: encoder && encoder.name,
        accounts: db.accounts.map(a => ({ id: a.id, provider: a.provider, name: a.name, error: a.error })),
        devices: Object.entries(db.devices).map(([t, d]) => ({ id: tokenId(t), name: d.name, ip: d.ip, added: d.added, lastSeen: d.lastSeen })),
      });
    }
    if (p === '/api/settings' && req.method === 'POST') {
      const b = await readJson(req);
      if (typeof b.tmdbKey === 'string') { db.settings.tmdbKey = b.tmdbKey; for (const k of Object.keys(db.meta)) if (db.meta[k] && db.meta[k].none) delete db.meta[k]; }
      if (typeof b.metadata === 'boolean') db.settings.metadata = b.metadata;
      if (typeof b.oauthRelay === 'string') db.settings.oauthRelay = /^https:\/\/\S+$/.test(b.oauthRelay.trim()) ? b.oauthRelay.trim() : '';
      if (typeof b.serverName === 'string' && b.serverName) db.settings.serverName = b.serverName.slice(0, 60);
      if (b.player === 'builtin' || b.player === 'external') db.settings.player = b.player;
      if (b.google) db.settings.google = { clientId: String(b.google.clientId || ''), clientSecret: String(b.google.clientSecret || '') };
      if (b.dropbox) db.settings.dropbox = { appKey: String(b.dropbox.appKey || '') };
      if (b.onedrive) db.settings.onedrive = { clientId: String(b.onedrive.clientId || '') };
      save();
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/folders' && req.method === 'POST') {
      const b = await readJson(req);
      if (b.add && !db.settings.folders.includes(b.add)) db.settings.folders.push(b.add);
      if (b.remove) {
        db.settings.folders = db.settings.folders.filter(f => f !== b.remove);
        db.settings.disabledFolders = db.settings.disabledFolders.filter(f => f !== b.remove);
      }
      if (b.toggle) {
        const off = db.settings.disabledFolders.includes(b.toggle);
        db.settings.disabledFolders = off ? db.settings.disabledFolders.filter(f => f !== b.toggle) : db.settings.disabledFolders.concat(b.toggle);
      }
      save();
      scan();
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/scan' && req.method === 'POST') { scan(); return sendJson(res, 200, { ok: true }); }
    // "Fix match": search TMDB by hand and pin the right movie/show to a title
    if (p === '/api/meta/search') {
      if (!tmdbKey()) return sendJson(res, 400, { error: 'Add a TMDB key in Settings → Privacy first' });
      const d = await tmdb(`/search/multi?query=${encodeURIComponent(u.searchParams.get('q') || '')}`);
      return sendJson(res, 200, {
        results: (d.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').slice(0, 12).map(r => ({
          id: r.id, type: r.media_type, title: r.title || r.name, year: resultYear(r), poster: img(r.poster_path, 'w185'), overview: r.overview,
        })),
      });
    }
    if (p === '/api/meta/fix' && req.method === 'POST') {
      const b = await readJson(req);
      const it = db.items[b.itemId];
      if (!it || !['movie', 'tv'].includes(b.type)) return sendJson(res, 400, { error: 'Bad request' });
      const m = await details(b.type, +b.tmdbId);
      m.fixed = true;
      db.meta[metaKey(it)] = m;
      cacheAllArt().then(save);
      if (it.show && b.type === 'tv') {
        for (const s of new Set(Object.values(db.items).filter(x => x.show === it.show).map(x => x.season))) {
          delete db.meta[`ep|${m.id}|${s}`];
          try { await seasonInfo(m.id, s); } catch (e) { /* no such season */ }
        }
      }
      save();
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/accounts/remove' && req.method === 'POST') {
      const b = await readJson(req);
      db.accounts = db.accounts.filter(a => a.id !== b.id);
      for (const [id, it] of Object.entries(db.items)) if (it.cloud && it.cloud.accountId === b.id) delete db.items[id];
      save();
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/pair/pending') return sendJson(res, 200, { pending: [...pairs.values()].filter(x => x.state === 'pending' && Date.now() - x.t < 180000) });
    if (p === '/api/pair/answer' && req.method === 'POST') {
      const b = await readJson(req);
      const pr = pairs.get(b.requestId);
      if (!pr) return sendJson(res, 404, { error: 'Request expired' });
      if (b.allow) {
        pr.token = rand(24);
        db.devices[pr.token] = { name: pr.name, ip: pr.ip, added: Date.now(), lastSeen: Date.now() };
        pr.state = 'approved';
        save();
      } else pr.state = 'denied';
      return sendJson(res, 200, { ok: true });
    }
    if (p === '/api/devices/remove' && req.method === 'POST') {
      const b = await readJson(req);
      for (const t of Object.keys(db.devices)) if (tokenId(t) === b.id) delete db.devices[t];
      save();
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: 'Not found' });
  }

  function serveStatic(req, res, p) {
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(webDir, decodeURIComponent(p)));
    if (!file.startsWith(path.normalize(webDir))) return sendJson(res, 403, { error: 'no' });
    fs.readFile(file, (err, buf) => {
      if (err) return sendJson(res, 404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': STATIC_TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch(e => { console.error(e); if (!res.headersSent) sendJson(res, 500, { error: e.message }); else res.destroy(); });
  });
  server.keepAliveTimeout = 65000;
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '0.0.0.0', resolve);
  });

  // TVs find this PC by broadcasting "GOATSTREAM_DISCOVER"
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('message', (msg, rinfo) => {
    if (msg.toString().trim() !== 'GOATSTREAM_DISCOVER' || !isPrivateIp(rinfo.address)) return;
    udp.send(Buffer.from(JSON.stringify({ app: 'goatstream', name: db.settings.serverName, port: PORT })), rinfo.port, rinfo.address);
  });
  udp.on('error', e => console.warn('discovery:', e.message));
  udp.bind(DISCOVERY_PORT);

  ready.then(() => scan());
  // pick up new files every 30 minutes
  const timer = setInterval(scan, 30 * 60 * 1000);

  return {
    events, port: PORT, ready,
    getItem: id => db.items[id],
    getSettings: () => db.settings,
    close() { clearInterval(timer); try { udp.close(); } catch (e) { /* closed */ } server.close(); },
  };
}

module.exports = { start, PORT };
