# 🐐 Goat Stream
*Created by Santiago*

Your own Netflix-style movie app. Movies on your **PC**, **Google Drive** and **Dropbox** — on your **Windows PC**, your **Android TV**, and **any other TV or phone with a web browser**.

```
goat-stream/
├── web/          The app's look & feel (shared by every screen)
├── desktop/      Windows app + the media server that runs in the tray
└── android-tv/   Android TV app (native 4K player)
```

---

## 1. Windows app (do this first)

Needs Node.js (already installed on this PC).

```bash
cd desktop
npm install
npm start
```

- **Add a movie folder** → Goat Stream finds every movie and show inside it (sub-folders too).
- Closing the window keeps Goat Stream **running in the tray** (the goat icon near the clock) so your TVs can always play. Right-click it → **Quit** to really close.
- Settings → **Start Goat Stream with Windows** = always ready.
- The first time, Windows asks to allow Goat Stream on your network → tick **Private networks** and click **Allow**. (Without this, TVs can't find the PC.)

**Make an installer** (`Goat Stream Setup.exe` in `desktop/dist`):

```bash
npm run dist
```

### Share the PC app with other people
`npm run dist` makes `desktop/dist/Goat Stream-1.0.0-win.zip` (unzip → run **Goat Stream.exe**).

1. Upload the zip somewhere public — GitHub Releases, a Google Drive / Dropbox share link, or your website.
2. Paste that link into `web/js/config.js` → `pcDownloadUrl`.
3. Rebuild the TV app. Now when someone installs the TV app and it can't find a PC, it shows the link **and a QR code** to get Goat Stream for Windows (also in the TV's Settings).

> **Windows may block the app** because it isn't code-signed yet: most PCs show *"Windows protected your PC" → More info → Run anyway*; PCs with **Smart App Control** on block it completely.
> Fix: sign the app with a code-signing certificate (e.g. Microsoft *Azure Trusted Signing*, ~$10/month) — then it installs cleanly everywhere and `npm run dist` can make a normal installer again.

---

## 2. Connect Google Drive & Dropbox (one-time setup, ~10 minutes)

Google and Dropbox only let an app read your files if the app has its own keys. You make them once, paste them into **Settings → Cloud drives → App keys**, then **Connect** is one click forever after. (Or put them in `desktop/config.json` so they're built in.)

### Google Drive
1. Go to <https://console.cloud.google.com/> → create a project called **Goat Stream**.
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** → External → app name *Goat Stream*, your email → under **Test users** add every Google account you'll connect.
4. **Credentials → Create credentials → OAuth client ID** → type **Web application** → under **Authorized redirect URIs** add:
   - `http://localhost:8787/oauth/google/callback`
   - your hand-off page address (see *Sign in with your phone* below), e.g. `https://YOUR-NAME.github.io/goat-stream/oauth.html`
5. Copy the **Client ID** and **Client secret** into Goat Stream.

### Dropbox
1. Go to <https://www.dropbox.com/developers/apps> → **Create app** → *Scoped access* → *Full Dropbox* → name it.
2. **Permissions** tab → tick `files.metadata.read` and `files.content.read` → **Submit**.
3. **Settings** tab → **Redirect URIs** → add `http://localhost:8787/oauth/dropbox/callback` **and** your hand-off page address.
4. Copy the **App key** into Goat Stream.

### OneDrive
1. Go to <https://portal.azure.com> (sign in with any Microsoft account) → **App registrations** → **New registration**.
2. Name *Goat Stream* → **Supported account types**: *Accounts in any organizational directory and personal Microsoft accounts* → **Register**.
3. **Authentication** → **Add a platform** → **Mobile and desktop applications** → add custom redirect URIs:
   - `http://localhost:8787/oauth/onedrive/callback`
   - your hand-off page address (for phone sign-in)
4. On the same page set **Allow public client flows** → *Yes* → **Save**. (No client secret needed.)
5. **API permissions** → *Add* → *Microsoft Graph* → *Delegated* → `Files.Read.All`, `User.Read`, `offline_access`.
6. Copy the **Application (client) ID** from *Overview* into Goat Stream (**OneDrive client ID**).

Then press **Connect Google Drive / OneDrive / Dropbox**, sign in in your browser — done. Every video in the drive appears in Goat Stream.

### 🎬 Movies you bought from Microsoft
Microsoft Store movies are copy-protected, so only Microsoft's own app may play them — Goat Stream can't pull them in. Instead the **Streaming Apps** row has **Microsoft Movies & TV** (opens Windows' *Films & TV* app on the PC) and **Movies Anywhere** — in the US, link your Microsoft account there to watch many of those purchases on Android TV, Fire TV, Roku and more.

### 📱 Sign in with your phone (scan a QR code)
Press **📱 Google Drive with my phone** on the PC — or **📱 Connect Google Drive** in the TV app's Settings — and scan the QR code with your phone's camera. Sign in on the phone and the PC/TV updates by itself. (The phone must be on your home Wi-Fi.)

One-time setup: Google and Dropbox only send your phone back to a public **https** page, so Goat Stream uses a tiny hand-off page (`relay/oauth.html`) that forwards your phone to your PC at home. It stores nothing.
1. Put `relay/oauth.html` online — free with **GitHub Pages**: make a repository called `goat-stream`, upload the file, then *Settings → Pages → Deploy from branch*. Its address is `https://YOUR-NAME.github.io/goat-stream/oauth.html`.
2. Add that address as a redirect URL for Google and Dropbox (steps above).
3. Paste it in **Settings → Cloud drives → App keys → Phone hand-off page** (or `desktop/config.json` → `"oauthRelay"`).

### Movie covers & details (automatic)
Goat Stream looks up every movie and show — on your PC **and** in Google Drive / Dropbox — on TMDB (The Movie Database) and adds the cover, backdrop, title logo, description, cast, director, runtime, age rating, genres, rating and episode names.

1. Make a free account at <https://www.themoviedb.org/signup>, then get an API key at <https://www.themoviedb.org/settings/api>.
2. Put it in `desktop/config.json` → `"tmdb"` (built in for everyone who installs your app), **or** paste it in **Settings → Privacy → TMDB API key**.

Wrong cover? Open the movie → **Fix match** → search → pick the right one (it stays fixed). File names like `Movie Name (2019).mkv` or `Show.Name.S01E02.mkv` match best.

---

## 3. Android TV app

### Build the APK (once)
1. Install **Android Studio** from <https://developer.android.com/studio>.
2. **Open** the `android-tv` folder. Let it finish "Gradle sync".
3. **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
   The APK lands in `android-tv/app/build/outputs/apk/debug/app-debug.apk`.

### Put it on the TV
- **Easiest:** copy the APK to a USB stick → plug into the TV → open it with a file manager (e.g. *File Commander*), allow "install unknown apps".
- **Or** with the TV's *Developer options → USB/Network debugging* on: `adb connect <tv-ip>` then `adb install app-debug.apk`.

### First launch
The TV app **finds your PC by itself**. A pop-up appears on the PC → click **Allow**. That's it — the TV also receives your Google Drive / Dropbox access, so **cloud movies play straight from the cloud even when the PC is off**.

---

## 4. Any other TV (Samsung, LG, Roku, Fire TV browser, phones…)

Open the TV's web browser and go to the address shown in **Settings → TVs & devices**, e.g. `http://192.168.1.20:8787`. Click **Allow** on the PC. Use the remote's arrows to move around.

---

## ⬆️ Automatic updates (GitHub — free)

Everyone's Goat Stream updates itself from your GitHub **Releases**: the PC app downloads new versions in the background and installs on restart; the TV app shows *"Goat Stream 1.x is here → Update now"*. Browser users get updates automatically (the PC serves them).

**One-time setup**
1. ✅ Done: the code lives at <https://github.com/santiagogsx/goat-stream> (public), the app points at it (`desktop/package.json` → `publish`, `web/js/config.js` → `githubRepo`), and GitHub Pages serves the phone hand-off page at <https://santiagogsx.github.io/goat-stream/relay/oauth.html>.
2. To send later changes up, install **GitHub Desktop** (or git) and use this folder as the repository.
3. **TV signing key** (so updates install over the old app — do this once, keep the file safe forever). In a terminal with Android Studio installed:
   ```
   "C:\Program Files\Android\Android Studio\jbr\bin\keytool" -genkey -v -keystore goat.jks -keyalg RSA -keysize 2048 -validity 10000 -alias goat
   ```
   Then in GitHub → repository **Settings → Secrets and variables → Actions** add:
   `GOAT_KEYSTORE_BASE64` (the file as base64: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("goat.jks"))` in PowerShell), `GOAT_KEYSTORE_PASSWORD`, `GOAT_KEY_ALIAS` (= `goat`), `GOAT_KEY_PASSWORD`.

> 🔐 **Keep your keys out of GitHub.** Leave `desktop/config.json` empty in the repository. To build keys into released apps, add a secret **`GOAT_CONFIG_JSON`** containing your filled-in `config.json` — the release build writes it in.

**Releasing a new version** — push a tag:
```
git tag v1.1.0
git push origin v1.1.0
```
GitHub builds the Windows installer and the TV APK in the cloud (`.github/workflows/release.yml`) and publishes them on the release page — which is also the public download link the TV app shows.

## 🍎 Apple TV — coming soon

The app shows Apple TV as *Coming soon*. Building it needs a **Mac with Xcode** and an **Apple Developer account** ($99/year). The plan: a tvOS app that reuses this same design and talks to the same PC server, with Apple's native 4K/Dolby Vision/Atmos player. Until then: open Goat Stream in **Safari on an iPhone/iPad** and **AirPlay** to the Apple TV.

## 🎬 Quality & formats

| Where | How it plays |
|---|---|
| **Android TV** | **Direct play** of the original file — H.264, HEVC, VP9, AV1, **4K HDR10 / HLG / Dolby Vision** (if the TV supports it). **Dolby Atmos / TrueHD / DTS-HD / E-AC3** go straight to your soundbar or receiver (passthrough). Big buffer for smooth 4K, and the TV switches to the movie's frame rate (24p, no judder). |
| **PC & browsers** | Plays the original when the screen can. If not, the PC converts **only what's needed**: usually just the audio (picture stays untouched, full 4K), or the whole video using your **NVIDIA GPU** (NVENC) — fast and full quality. |
| **PC + VLC** | Settings → Playback → **VLC** plays every format natively and sends Atmos/DTS bit-perfect to a receiver. |

Local network = best quality: a 4K remux needs ~50–100 Mbit/s. Wired Ethernet or 5 GHz Wi-Fi recommended. Cloud 4K depends on your internet speed.

## 👥 Watch Together

Watch with friends anywhere — they don't need an account, a cloud sign-in or even the app.

1. On the PC, play a movie and press **👥** in the player. Set **Friends allowed** (1–8).
2. Share it:
   - **Link / QR code** → your friend opens it in any browser (phone, laptop, TV browser);
   - **Code** (like `VYYY-553K`) → friends with the Goat Stream **TV or PC app** press **👥** at the top and type it.
3. Chat and emoji reactions show up for everyone; you control play/pause/seek for the whole group.

**Quality:** sharp 1080p sent straight from your PC, up to 16 Mbit/s per friend (less per friend as more join). It needs your internet's *upload* speed: about 8 Mbit/s per friend for good HD.
**Privacy:** the picture and sound go directly from your PC to each friend, **encrypted end to end** (WebRTC). Your internet provider sees encrypted traffic to your friend's address — not the movie or its title. The free PeerJS service only introduces the two devices; video never passes through it. Your home server stays closed to the internet. The room ends when you press *End session* or close Goat Stream.
**Hosting** works from the Windows app (or a PC browser); TVs and phones join.
**Copyright:** only share what you have the right to share (your own videos, public-domain or licensed films). Live-streaming a commercial movie to people outside your home can count as a public performance even though nothing is copied — when in doubt, have each friend own the movie too.

## 📴 No internet? Still works

When the internet is down, everything on your home network keeps going: the PC app, the TV app and TV browsers play every movie on your PC. Covers, backgrounds, title logos and episode pictures are **saved on the PC** (and kept by each TV), so the library still looks complete. Only Google Drive / Dropbox movies need the internet — they come back by themselves when it does.

## 🔒 Privacy

- Movies from your PC go **PC → router → TV**. They never leave your home, so your internet provider can't see them.
- The server **refuses every connection from outside your home network**, even if a router port is opened by mistake.
- Every device must be approved on the PC (unlink any time in Settings).
- Cloud movies travel encrypted (HTTPS): your provider sees "Google"/"Dropbox", not what you're watching.
- Poster lookup (TMDB) is optional and can be switched off in Settings → Privacy.
- No ads, no tracking, no accounts.

## 📺 Netflix, Hulu, Max, Disney+, Prime Video, Apple TV, Paramount+…

Those services lock their movies with copy protection (DRM), so no other app is allowed to play them. Goat Stream has a **Streaming Apps** row that **opens their official apps** on Android TV (or offers to install them) and their websites on PC/browsers — one remote for everything.

## Troubleshooting

- **TV can't find the PC** → same Wi-Fi/network? Goat Stream open (tray)? Windows Firewall allowed (*Private*)? Or type the PC address on the TV ("Enter PC address").
- **Movie missing** → Settings → **Rescan library**.
- **A video stutters on Wi-Fi** → try Ethernet, or move the router closer; 4K remuxes are huge.
