/* Goat Stream cloud core — shared by the PC server (Node) and the TV app (WebView).
 * Lists videos in Google Drive / Dropbox and turns a file into a direct, playable stream URL.
 * The caller supplies http(method, url, headers, body) -> Promise<{status, text}>,
 * so the same code works with Node's fetch and with the Android native bridge. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GoatCloud = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VIDEO_EXT = ['mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'ts', 'm2ts', 'wmv'];
  const isVideoName = n => VIDEO_EXT.includes(String(n).split('.').pop().toLowerCase());

  // ---------- filename -> title / year / episode ----------
  const JUNK = /\b(2160p|1080p|720p|480p|4k|uhd|hdr10\+?|hdr|dv|dolby[ .]?vision|blu-?ray|brrip|bdrip|webrip|web-?dl|web|hdtv|dvdrip|remux|x26[45]|h ?26[45]|hevc|avc|10bit|aac|e?ac3|dts(-hd)?|truehd|atmos|ddp?5 1|5 1|7 1|proper|repack|extended|unrated|imax|yts|rarbg|amzn|nf|dsnp|hmax)\b/i;

  function tidy(t) {
    return String(t || '').replace(/\s*[\[(][^\])]*$/, '').replace(/[\[\]()]/g, ' ')
      .replace(/[\s\-–:]+$/, '').replace(/^[\s\-–]+/, '').replace(/\s+/g, ' ').trim();
  }

  function parseOne(raw) {
    const base = String(raw).replace(/\.[a-z0-9]{2,4}$/i, '');
    const lower = base.toLowerCase();
    const quality = /2160p|\b4k\b|\buhd\b/.test(lower) ? '4K' : /1080p|720p/.test(lower) ? 'HD' : '';
    const hdr = /\bhdr|dolby.?vision|\bdv\b/.test(lower);
    const s = base.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
    const out = { title: '', year: null, show: null, season: null, episode: null, quality, hdr };
    const ep = s.match(/^(.*?)[\s\-\[(]*\bs(\d{1,2}) ?e(\d{1,3})\b/i) || s.match(/^(.*?)[\s\-]*\b(\d{1,2})x(\d{2})\b/);
    if (ep) {
      out.season = +ep[2]; out.episode = +ep[3];
      if (tidy(ep[1])) {
        out.show = tidy(tidy(ep[1]).replace(/\b(19|20)\d\d$/, '')) || tidy(ep[1]);
        out.title = out.show;
      } else out.bareEpisode = true;     // "S01E01.mkv" — the show name comes from the folder
      return out;
    }
    const ym = s.match(/^(.*?)[\s(\[]*\b(19[2-9]\d|20[0-4]\d)\b/);
    if (ym && tidy(ym[1])) { out.title = tidy(ym[1]); out.year = +ym[2]; }
    else { const j = s.search(JUNK); out.title = tidy(j > 0 ? s.slice(0, j) : s); }
    if (!out.title) out.title = s;
    return out;
  }

  // parentFolder helps with "The Matrix (1999)/movie.mkv" style libraries
  function parseName(fileName, parentFolder, grandFolder) {
    const p = parseOne(fileName);
    if (p.bareEpisode) {
      delete p.bareEpisode;
      // "Show Name (2022)/S01E01.mkv" or "Show Name/Season 1/S01E01.mkv"
      const isSeasonDir = n => /^(season|series|staffel|temporada|saison)\s*\d+$/i.test(String(n || '').trim());
      const showDir = isSeasonDir(parentFolder) ? grandFolder : parentFolder;
      const f = showDir ? parseOne(showDir) : null;
      p.show = (f && (f.show || f.title)) || 'Unknown show';
      p.title = p.show;
      return p;
    }
    if (!p.show && !p.year && parentFolder) {
      const f = parseOne(parentFolder);
      if (f.year) { p.title = f.title; p.year = f.year; p.quality = p.quality || f.quality; p.hdr = p.hdr || f.hdr; }
    }
    return p;
  }

  const TOKEN_URLS = {
    gdrive: 'https://oauth2.googleapis.com/token',
    dropbox: 'https://api.dropboxapi.com/oauth2/token',
    onedrive: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
  };
  const ONEDRIVE_SCOPE = 'offline_access Files.Read.All User.Read';

  function form(obj) {
    return Object.keys(obj).filter(k => obj[k] != null && obj[k] !== '')
      .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k])).join('&');
  }

  function create(http) {
    async function json(method, url, headers, body) {
      const r = await http(method, url, headers || {}, body == null ? null : body);
      let data = null;
      try { data = r.text ? JSON.parse(r.text) : null; } catch (e) { /* not json */ }
      if (!r.status || r.status >= 400) {
        const msg = (data && (data.error_description || data.error_summary || (data.error && data.error.message) || data.error)) || String(r.text || 'network error').slice(0, 200);
        const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
        err.status = r.status;
        throw err;
      }
      return data;
    }

    // account: {id, provider, clientId, clientSecret, refreshToken, accessToken, expiresAt, root}
    async function accessToken(acc) {
      if (acc.accessToken && acc.expiresAt > Date.now() + 5 * 60 * 1000) return acc.accessToken;
      const url = TOKEN_URLS[acc.provider];
      const d = await json('POST', url, { 'Content-Type': 'application/x-www-form-urlencoded' }, form({
        grant_type: 'refresh_token', refresh_token: acc.refreshToken, client_id: acc.clientId, client_secret: acc.clientSecret,
        scope: acc.provider === 'onedrive' ? ONEDRIVE_SCOPE : null,
      }));
      acc.accessToken = d.access_token;
      acc.expiresAt = Date.now() + (d.expires_in || 3600) * 1000;
      if (d.refresh_token) acc.refreshToken = d.refresh_token;      // Microsoft hands out a fresh one each time
      return acc.accessToken;
    }

    async function listGoogle(acc) {
      const out = [];
      let pageToken = null;
      const q = "(mimeType contains 'video/' or name contains '.mkv' or name contains '.m2ts') and trashed = false";
      const fields = 'nextPageToken,files(id,name,size,mimeType,modifiedTime,createdTime,thumbnailLink,videoMediaMetadata(width,height,durationMillis))';
      do {
        const token = await accessToken(acc);
        const url = 'https://www.googleapis.com/drive/v3/files?pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives'
          + '&q=' + encodeURIComponent(q) + '&fields=' + encodeURIComponent(fields) + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
        const d = await json('GET', url, { Authorization: 'Bearer ' + token });
        for (const f of d.files || []) {
          if (!isVideoName(f.name) && !/^video\//.test(f.mimeType || '')) continue;
          const p = parseName(f.name);
          const vm = f.videoMediaMetadata || {};
          if (vm.width >= 3200 || vm.height >= 1800) p.quality = '4K';
          else if (!p.quality && (vm.width >= 1200 || vm.height >= 700)) p.quality = 'HD';
          out.push(Object.assign(p, {
            id: 'g_' + f.id, source: 'gdrive', name: f.name, size: +f.size || 0,
            modified: Date.parse(f.modifiedTime) || 0, added: Date.parse(f.createdTime) || 0,
            thumb: f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+$/, '=s640') : null,
            duration: vm.durationMillis ? Math.round(vm.durationMillis / 1000) : null,
            cloud: { accountId: acc.id, fileId: f.id },
          }));
        }
        pageToken = d.nextPageToken;
      } while (pageToken);
      return out;
    }

    async function listDropbox(acc) {
      const out = [];
      const call = async (endpoint, body) => json('POST', 'https://api.dropboxapi.com/2/files/' + endpoint, {
        Authorization: 'Bearer ' + await accessToken(acc), 'Content-Type': 'application/json',
      }, JSON.stringify(body));
      let d = await call('list_folder', { path: acc.root || '', recursive: true, limit: 2000 });
      for (;;) {
        for (const e of d.entries || []) {
          if (e['.tag'] !== 'file' || !isVideoName(e.name)) continue;
          const parts = e.path_display.split('/');
          const p = parseName(e.name, parts[parts.length - 2], parts[parts.length - 3]);
          out.push(Object.assign(p, {
            id: 'd_' + e.id.replace(/^id:/, ''), source: 'dropbox', name: e.name, size: e.size || 0,
            modified: Date.parse(e.server_modified) || 0, thumb: null,
            cloud: { accountId: acc.id, fileId: e.id, path: e.path_lower },
          }));
        }
        if (!d.has_more) break;
        d = await call('list_folder/continue', { cursor: d.cursor });
      }
      return out;
    }

    // OneDrive: walk the whole drive with Microsoft Graph "delta" (one paged list of every file)
    async function listOneDrive(acc) {
      const out = [];
      let url = 'https://graph.microsoft.com/v1.0/me/drive/root/delta?$select=id,name,size,file,video,parentReference,createdDateTime,lastModifiedDateTime,deleted';
      while (url) {
        const d = await json('GET', url, { Authorization: 'Bearer ' + await accessToken(acc) });
        for (const f of d.value || []) {
          if (!f.file || f.deleted || !isVideoName(f.name)) continue;
          const dirs = ((f.parentReference && f.parentReference.path) || '').split('/').map(d => { try { return decodeURIComponent(d); } catch (e) { return d; } });
          const p = parseName(f.name, dirs[dirs.length - 1], dirs[dirs.length - 2]);
          const v = f.video || {};
          if (v.width >= 3200 || v.height >= 1800) p.quality = '4K';
          else if (!p.quality && (v.width >= 1200 || v.height >= 700)) p.quality = 'HD';
          out.push(Object.assign(p, {
            id: 'o_' + f.id.replace(/[^\w]/g, '_'), source: 'onedrive', name: f.name, size: f.size || 0,
            modified: Date.parse(f.lastModifiedDateTime) || 0, added: Date.parse(f.createdDateTime) || 0, thumb: null,
            duration: v.duration ? Math.round(v.duration / 1000) : null,
            cloud: { accountId: acc.id, fileId: f.id },
          }));
        }
        url = d['@odata.nextLink'] || null;
      }
      return out;
    }

    function list(acc) {
      if (acc.provider === 'gdrive') return listGoogle(acc);
      if (acc.provider === 'onedrive') return listOneDrive(acc);
      return listDropbox(acc);
    }

    // -> { url, headers } that a player can stream directly (supports range requests / seeking)
    async function playInfo(acc, item) {
      const token = await accessToken(acc);
      if (acc.provider === 'gdrive') {
        return {
          url: 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(item.cloud.fileId) + '?alt=media&supportsAllDrives=true&acknowledgeAbuse=true',
          headers: { Authorization: 'Bearer ' + token },
        };
      }
      if (acc.provider === 'onedrive') {
        // a pre-signed link (valid ~1 hour, supports seeking) — no headers needed
        const d = await json('GET', 'https://graph.microsoft.com/v1.0/me/drive/items/' + encodeURIComponent(item.cloud.fileId) + '?$select=id,@microsoft.graph.downloadUrl',
          { Authorization: 'Bearer ' + token });
        return { url: d['@microsoft.graph.downloadUrl'], headers: {} };
      }
      const d = await json('POST', 'https://api.dropboxapi.com/2/files/get_temporary_link', {
        Authorization: 'Bearer ' + token, 'Content-Type': 'application/json',
      }, JSON.stringify({ path: item.cloud.fileId }));
      return { url: d.link, headers: {} };
    }

    return { accessToken, list, playInfo };
  }

  return { create, parseName, isVideoName, VIDEO_EXT, ONEDRIVE_SCOPE };
});
