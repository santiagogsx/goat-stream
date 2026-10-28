# Goat Stream — next steps

Owner: Santiago. His installed PC app runs on port **8787** with a Fire TV linked — **never send test requests to
127.0.0.1:8787 or the PC's LAN address on 8787**; run test copies with `GOAT_PORT=8790 GOAT_DISCOVERY_PORT=8791`.
⚠️ Network-scanning simulations (Samsung/LG `webDiscover`, UDP discovery) WILL find the real app on the LAN — mock
discovery or block 8787 in any simulator. No git here; GitHub = santiagogsx/goat-stream. **Ask before pushing or tagging.**

## Done (2026-10-28) — published as v1.0.3 (owner asked; all 8 release files built)
- Unlink: in-app `askConfirm()` dialog replaces `window.confirm()` (Fire TV silently answered "no"); TV unlinking
  itself calls `POST /api/devices/forget` so the PC drops it; WebChromeClient added to the Android app.
- Watch Together sound: Web Audio 5.1→stereo mix (centre/dialogue ×1 in both ears, surrounds ×0.6, LFE off, limiter),
  host volume via a gain node (friends unaffected), Opus stereo + 510 kbit/s via `opusHiFi` sdpTransform on both ends,
  audio sender 256 kbit/s. Measured: voice equal in both ears, effects 10 dB below.
- Phone browsers: converted video as **HLS** for iPhone/Safari (`/hls/<sid>/…`, fmp4 segments, ffmpeg cwd = session dir),
  phones get 1080p + stereo when converting, real video track chosen (skips MKV cover pictures; probe v2 re-checks
  local files), H.264 4:4:4 / 10-bit detected per device.
- Android TV: new wide banner (xhdpi/xxhdpi/xxxhdpi), full-bleed square icon, adaptive icon.
- TV Settings decide by device type (not "is localhost"); all 16 TV Settings controls reachable by remote.
- Also unpublished from before: TV-only cloud sign-in (QR→phone→PeerJS→PKCE), "Use without a PC",
  `scripts/inject-keys.js` (public IDs only), `cloud-helper/` Worker.

## Xbox app (2026-10-28) — on GitHub main (owner OK'd a test build), NOT in a release yet
- `xbox/` UWP + WebView2 app; `MODE 'xbox'` in app.js (GoatTV bridge over chrome.webview, controller key codes 195–214,
  PC covers via `https://pc.goatstream.example/…`). Build = `.github/workflows/xbox.yml` (windows-2022): run by hand
  for a test build (files under the run's Artifacts); `release.yml` calls it with `release: true`.
- Tested in a browser simulation (mocked bridge + PC): pairing, library, controller, B de-dupe, player hand-off,
  resume point, error→remux. Compiles only on GitHub (no Visual Studio here). Not yet seen on a real Xbox:
  UDP discovery, the covers route, HDR/24 Hz, MKV/HEVC/Dolby.

## Waiting on Santiago
- Xbox: free individual Partner Center account → Dev Mode test → reserve "Goat Stream" → GitHub *variables*
  `XBOX_IDENTITY_NAME`, `XBOX_PUBLISHER`, `XBOX_PUBLISHER_NAME` → submit (README "🎮 Xbox app"). Needs a privacy-policy page.
- Register Google / Microsoft / Dropbox apps, deploy `cloud-helper/`, set the `GOAT_CONFIG_JSON` GitHub secret.
- Remove the stray "Web browser" device in Goat Stream → Settings → TVs & devices (left by a test on 2026-10-28).
