/* Goat Stream · Watch Together — friend side. The link looks like …/watch/#goatstream-abc123 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REACTIONS = ['😂', '😮', '🔥', '❤️', '👏', '🐐'];
  // Ask for full stereo movie sound (up to 510 kbit/s) instead of mono call audio — same as the host's side.
  function opusHiFi(sdp) {
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/i);
    if (!m) return sdp;
    const pt = m[1];
    const extra = 'stereo=1;sprop-stereo=1;maxaveragebitrate=510000';
    const fmtp = new RegExp('(a=fmtp:' + pt + ' )([^\\r\\n]*)');
    if (fmtp.test(sdp)) return sdp.replace(fmtp, (all, head, params) => head + (params.includes('stereo=1') ? params : params + ';' + extra));
    return sdp.replace(m[0], m[0] + '\r\na=fmtp:' + pt + ' ' + extra);
  }
  const hostId = decodeURIComponent(location.hash.slice(1));
  const video = $('v');
  // ?embedded=1: shown inside the Goat Stream app (TV / PC) rather than as a web page
  const params = new URLSearchParams(location.search);
  const EMBEDDED = params.has('embedded');
  if (EMBEDDED) document.documentElement.classList.add('embedded');
  const leave = () => { if (EMBEDDED) window.parent.postMessage({ goatWatch: 'close' }, '*'); };
  let peer = null, conn = null, myName = '';

  try { $('name').value = localStorage.getItem('goat.wt.name') || params.get('name') || ''; } catch (e) { $('name').value = params.get('name') || ''; }
  if (!/^goatstream-[a-z0-9]+$/.test(hostId)) {
    $('join-text').textContent = EMBEDDED ? 'That code doesn\'t look right — check it with your friend.' : 'This invite link looks incomplete. Ask your friend to copy it again from Goat Stream.';
    $('go').classList.add('hidden'); $('name').classList.add('hidden');
  }
  if (EMBEDDED) setTimeout(() => $('go').focus(), 50);
  // Back / Esc inside the app closes the viewer; the app tells us when it's closing so we hang up cleanly
  document.addEventListener('keydown', e => { if (EMBEDDED && (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack')) leave(); });
  window.addEventListener('message', e => { if (e.data && e.data.goatWatch === 'leave' && peer) peer.destroy(); });

  function message(text, spinner) {
    $('msg').classList.toggle('hidden', !text);
    $('msg-text').textContent = text || '';
    $('msg').querySelector('.spin').classList.toggle('hidden', !spinner);
  }
  function chat(line, sys) {
    const d = document.createElement('div');
    if (sys) d.className = 'sys';
    d.textContent = line;
    $('chat').appendChild(d);
    while ($('chat').children.length > 6) $('chat').firstChild.remove();
    setTimeout(() => d.remove(), 15000);
  }
  function floatEmoji(e) {
    const f = document.createElement('div');
    f.className = 'float'; f.textContent = e; f.style.left = (55 + Math.random() * 35) + '%';
    $('stage').appendChild(f);
    setTimeout(() => f.remove(), 2600);
  }

  $('go').addEventListener('click', join);
  $('name').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

  function join() {
    myName = ($('name').value.trim() || 'Friend').slice(0, 24);
    try { localStorage.setItem('goat.wt.name', myName); } catch (e) { /* ignore */ }
    $('join').classList.add('hidden');
    $('stage').classList.add('on');
    message('Connecting to your friend…', true);
    peer = new window.Peer({ config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } });
    peer.on('open', () => {
      conn = peer.connect(hostId, { metadata: { name: myName }, reliable: true });
      conn.on('open', () => message('Connected! Waiting for the movie to start…', true));
      conn.on('data', onData);
      conn.on('close', () => message('The session has ended. Thanks for watching! 🐐'));
    });
    peer.on('call', call => {
      call.answer(undefined, { sdpTransform: opusHiFi }); // we only receive — in full-quality stereo
      window.__wtCall = call;                          // handy when troubleshooting from the browser console
      call.on('stream', stream => {
        if (video.srcObject === stream) return;        // PeerJS reports the same stream once per track
        video.srcObject = stream;
        message('Starting the movie…', true);
        video.play().catch(err => { if (err && err.name === 'NotAllowedError') message('Tap the screen to start the sound'); });
      });
    });
    peer.on('error', e => {
      if (e.type === 'peer-unavailable') message('Your friend isn\'t hosting right now. Ask them to open Watch Together again.');
      else if (e.type === 'network' || e.type === 'server-error') message('Can\'t connect — check your internet and try again.');
      else message('Connection problem: ' + (e.message || e.type));
    });
  }

  function onData(d) {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'info') { $('title').textContent = d.title || 'Watch Together'; $('sub').textContent = d.sub ? String(d.sub) : ''; document.title = `${d.title} · Watch Together`; }
    else if (d.t === 'chat') chat(`${d.from}: ${d.text}`);
    else if (d.t === 'react') floatEmoji(d.e);
    else if (d.t === 'paused') message(d.text || 'Paused');
    else if (d.t === 'full') message(`This room is full (${d.max || 'max'} friends). Ask your friend to allow more.`);
    else if (d.t === 'count') $('count').textContent = `👥 ${d.n + 1} watching`;
    else if (d.t === 'end') { message('Your friend ended the session. Thanks for watching! 🐐'); video.srcObject = null; }
  }

  video.addEventListener('playing', () => message(''));
  $('stage').addEventListener('click', e => { if (e.target === video && video.paused) video.play().then(() => message('')); });

  // controls
  $('react').innerHTML = REACTIONS.map(e => `<button data-e="${esc(e)}">${esc(e)}</button>`).join('');
  $('react').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b || !conn) return;
    conn.send({ t: 'react', e: b.dataset.e });
    floatEmoji(b.dataset.e);
  });
  $('say').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !conn) return;
    const text = e.target.value.trim().slice(0, 300);
    if (!text) return;
    conn.send({ t: 'chat', text });
    chat(`You: ${text}`);
    e.target.value = '';
  });
  $('vol').addEventListener('input', e => { video.volume = +e.target.value; video.muted = false; $('mute').textContent = '🔊'; });
  $('mute').addEventListener('click', () => { video.muted = !video.muted; $('mute').textContent = video.muted ? '🔇' : '🔊'; });
  $('fs').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else $('stage').requestFullscreen().catch(() => {}); });

  let idle;
  const wake = () => { $('stage').classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => { if (document.activeElement !== $('say')) $('stage').classList.add('idle'); }, 3500); };
  ['mousemove', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, wake, { passive: true }));
  wake();
})();
