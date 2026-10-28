# Goat Stream for Xbox
*Created by Santiago*

How to test and publish it: see **"🎮 Xbox app"** in the main [README](../README.md).

## How it's built
| Piece | What it does |
|---|---|
| `GoatStream/` | UWP app (C#, WinUI 2 **WebView2**, the way Microsoft's [Xbox media app samples](https://github.com/microsoft/Media-App-Samples-for-XBOX) do it). |
| `../web/` | The shared UI, copied into the package at build time and served from `https://goatstream.example/`. **Never change that address**: the console's PC link and settings are saved per address. |
| `MainPage.xaml.cs` | Bridge to the page (`chrome.webview` messages). `app.js` turns them into the same `GoatTV` object the Android TV app has, so `MODE === 'xbox'` reuses every Android TV path. Also: B/Back, opening other apps (Store search), and PC covers (`https://pc.goatstream.example/<ip:port>/…` → plain http on the home network only). |
| `MainPage.Player.cs` | Native player (MediaPlayerElement): hardware HEVC/4K (`hevcPlayback` capability), HDR10 + frame-rate matching through `HdmiDisplayInformation`, reports `{id,pos,dur,offset,reason}` back like the Android player. |
| `Net.cs` | HTTP without browser limits, PC discovery (UDP `GOATSTREAM_DISCOVER` on 8788, then an HTTP scan of the subnet on 8787 as a fallback). |
| `tools/make-assets.ps1` | Remakes the tiles/splash (`GoatStream/Assets`) and Store pictures (`store-art/`) from `web/img`. |

Builds: `.github/workflows/xbox.yml` (windows-2022). Run it by hand (Actions → **Xbox build** → *Run workflow*) for a test build, where the files appear under the run's *Artifacts*; `release.yml` also runs it on every release and attaches the files. It makes a test package signed with a throw-away certificate, plus the Store `.msixupload` once the repository variables `XBOX_IDENTITY_NAME` / `XBOX_PUBLISHER` / `XBOX_PUBLISHER_NAME` are set.

Testing in a browser without an Xbox: set `window.__goatXbox = {device, version}` and a fake `window.chrome.webview` (`postMessage` / `addEventListener('message')`) before `app.js` loads. **Mock the PC.** Don't point a simulation at the real app on port 8787.
