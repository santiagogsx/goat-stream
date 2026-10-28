# 🐐 Goat Stream
*Created by Santiago*

Your own Netflix-style movie app. Movies on your **PC**, **Google Drive** and **Dropbox** — on your **Windows PC**, your **Android TV**, and **any other TV or phone with a web browser**.

```
goat-stream/
├── web/          The app's look & feel (shared by every screen)
├── desktop/      Windows app + the media server that runs in the tray
├── android-tv/   Android TV app (native 4K player)
└── xbox/         Xbox app for the Microsoft Store (native 4K/HDR player)
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

## ☁️ Cloud sign-in for everyone (how it works)

For people using Goat Stream it's just: **TV → ☁️ Add cloud drive → pick Google Drive / OneDrive / Dropbox → scan the QR code → sign in on the phone → done.** No PC, no keys. The TV can even be used **without any PC** ("Use without a PC" on first start) — movies stream straight from the cloud.

How: the phone signs in on the provider's own page, the hand-off page (`relay/oauth.html`) passes the one-time code to that exact TV over an encrypted peer-to-peer link, and the TV finishes signing in (PKCE — the code is useless to anyone else). Passwords are only ever typed on the provider's page on the phone.

### One-time setup — app creator only (Santiago), never users
Google, Microsoft and Dropbox only allow sign-ins through a registered app. Register Goat Stream once (sections below), then:
1. **Sign-in helper (needed for Google only):** Google requires a private secret that must never be inside a downloadable app. Deploy `cloud-helper/` as a free Cloudflare Worker (`npx wrangler login`, then `npx wrangler deploy` in that folder) and add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ONEDRIVE_CLIENT_ID`, `DROPBOX_APP_KEY` in its settings. It stores nothing.
2. **Build the public IDs into every app:** GitHub → repository **Settings → Secrets → Actions** → secret `GOAT_CONFIG_JSON`:
   ```json
   { "google": { "clientId": "…apps.googleusercontent.com" }, "onedrive": { "clientId": "…" }, "dropbox": { "appKey": "…" },
     "tokenHelper": "https://goat-stream-signin.<you>.workers.dev" }
   ```
   Only these public IDs go into downloads — secrets never do.
3. Publish a new release. Every TV/PC copy now signs in by itself.

> **Google's rules:** while Goat Stream's Google app is in "Testing", only up to 100 Google accounts you list as test users can sign in, and Google asks them to sign in again every 7 days. Lifting that requires Google's app verification (Drive access is a "restricted" permission and needs a paid security review). OneDrive and Dropbox have no such limits.

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

## 4. Samsung, LG and Roku TV apps

Every release on <https://github.com/santiagogsx/goat-stream/releases/latest> includes:

| TV | File | What it is |
|---|---|---|
| **LG** (webOS) | `GoatStream-LG.ipk` | Ready to install |
| **Samsung** (Tizen) | `GoatStream-Samsung-project.zip` | Project to install with Tizen Studio (Samsung requires your own certificate) |
| **Roku** | `GoatStream-Roku.zip` | Ready to sideload |

All three find your PC by themselves (Roku) or by scanning your home network (Samsung/LG), link with one **Allow** on the PC, and play in 4K with the TV's own player. Samsung/LG also have chat-free **Watch Together** joining with a code. These steps install on **your own TVs**; to let anyone install from the TV app stores, submit the same packages to Samsung Seller Office, LG Seller Lounge or the Roku Developer Dashboard (free).

### LG TV
1. On the TV open **LG Content Store** → install **Developer Mode** → sign in with a free account from <https://webostv.developer.lge.com> → turn **Dev Mode Status** ON (the TV restarts) → turn **Key Server** ON and note the IP and passphrase.
2. On the PC:
   ```
   npm install -g @webos-tools/cli
   ares-setup-device -a tv -i "host=TV-IP" -i "port=9922" -i "username=prisoner"
   ares-novacom --device tv --getkey
   ares-install --device tv GoatStream-LG.ipk
   ```
3. Developer Mode lasts a limited time — open the Developer Mode app and press **Extend** now and then.

### Samsung TV
1. Install **Tizen Studio** (<https://developer.tizen.org>) and, in its Package Manager → Extension SDK, **Samsung TV Extensions** and **Samsung Certificate Extension**.
2. On the TV: **Apps** → press **1 2 3 4 5** on the remote → turn **Developer mode** ON → enter your PC's IP → restart the TV.
3. Tizen Studio → **Device Manager** → add the TV's IP → connect.
4. **Certificate Manager** → new **Samsung** certificate (sign in with a free Samsung account; it adds your TV automatically).
5. Unzip `GoatStream-Samsung-project.zip` → **File → Import → Tizen → Tizen Project** → pick the folder → right-click the project → **Run As → Tizen Web Application**. Goat Stream appears in the TV's apps.

### Roku
1. With the Roku remote press **Home ×3, Up ×2, Right, Left, Right, Left, Right** → **Enable installer** and set a password (the Roku restarts).
2. On the PC open `http://ROKU-IP` → sign in as `rokudev` with that password → **Upload** `GoatStream-Roku.zip` → **Install**.

## 🎮 Xbox app (Microsoft Store)

The Xbox app is in `xbox/`. It is a small Xbox app with **the same Goat Stream screens** inside (Microsoft's Edge "WebView2", which Microsoft offers for Xbox media apps). Movies play in the **Xbox's own video player**: 4K, HDR10, MP4 and MKV, H.264 and HEVC, and Dolby/DTS sound sent out the way your Xbox audio settings say. It works like the Android TV app:

- finds your PC by itself, then you click **Allow** on the PC;
- the controller does everything: **D-pad / left stick** move, **A** selects, **B** goes back, **LB / RB** jump along a row, **☰ Menu** opens Settings, **⧉ View** opens Search;
- while a movie plays: **LB** goes back 10 s, **RB** skips 30 s, **X** pauses or plays, **B** stops;
- **Use without a PC** and phone sign-in to Google Drive / OneDrive / Dropbox work as on the other TVs;
- the Microsoft Store keeps it up to date (no "Update now" pop-up like Android).

**Good to know:** to get **24 Hz** (smooth films) and **HDR**, the Xbox's *Settings → General → TV & display options → Video modes* must allow **24Hz** and **HDR10**. Dolby Vision files play in their HDR10 form. If a file won't play, the Xbox asks your PC to convert it, like the other TVs do.

### Try it on your own Xbox first (Developer Mode, free)
1. On the Xbox, install the free **Xbox Dev Mode** app from the Store, open it and follow the steps. The first time you need a free sign-in at <https://partner.microsoft.com/dashboard> (see "Publish" step 1 below), where you type the code the Xbox shows. The Xbox restarts into **Dev Home**. (Your games and normal apps don't run in Dev Mode. Switch back to *Retail* in Dev Home whenever you like.)
2. In Dev Home, turn on **Remote Access** (Xbox Device Portal) and set a username and password. Note the address it shows, like `https://192.168.1.30:11443`.
3. On the PC, download **`GoatStream-Xbox-test.zip`** from the latest GitHub release and unzip it. (Between releases: GitHub → **Actions → Xbox build → Run workflow**, then download **GoatStream-Xbox** under *Artifacts* on that run's page. You must be signed in to GitHub.)
4. Open the Xbox's address in a PC web browser (accept the security warning) → **Add** → choose the `.msix` file → tick **"I want to specify optional packages"** → add every file in the `Dependencies\x64` folder → **Start**.
5. Goat Stream appears in Dev Home's app list. Highlight it, press **View** (⧉) → *View details* → set **App type: App** (not Game), then open it.

<details><summary>Or build it yourself with Visual Studio</summary>

Install **Visual Studio 2022** (free Community edition) with the **Universal Windows Platform development** workload, open `xbox/GoatStream.Xbox.sln`, choose **Release | x64**, and set *Debug → Remote Machine* to the Xbox's IP with *Authentication: Universal (Unencrypted)*. Press F5 and type the PIN from Dev Home. Pressing F5 with *Local Machine* runs it on the PC.
</details>

### Publish it on the Xbox Store (so anyone can download it)
1. **Developer account (free for one person):** go to <https://storedeveloper.microsoft.com> → sign up as an **Individual** with your Microsoft account → confirm your ID (photo of your ID + a selfie). Microsoft stopped charging individuals in Sept 2025. A *company* account costs a one-time $99.
2. **Reserve the name:** Partner Center → **Apps and games → New product → App** → name it **Goat Stream** (pick another name if it's taken).
3. **Copy the app's identity into GitHub:** in the new product open **Product management → Product identity**. In GitHub → repository **Settings → Secrets and variables → Actions → *Variables*** add:
   - `XBOX_IDENTITY_NAME` = *Package/Identity/Name* (looks like `12345Santiago.GoatStream`)
   - `XBOX_PUBLISHER` = *Package/Identity/Publisher* (looks like `CN=1A2B3C4D-…`)
   - `XBOX_PUBLISHER_NAME` = *Package/Properties/PublisherDisplayName* (your publisher name)

   These aren't secret. The next release then also contains **`GoatStream-Xbox.msixupload`**, the file the Store wants.
4. **Start a submission** (Partner Center → Goat Stream → *Start your submission*):
   - **Pricing and availability:** Free; pick the countries.
   - **Properties:** category *Entertainment*; under device families tick **Xbox** only.
   - **Age ratings:** fill in the free questionnaire (IARC). It's a video player: no violence, no in-app purchases, users can't chat (Watch Together chat → answer yes to "users can interact/share content" if asked). You'll most likely get "Everyone / 3+".
   - **Packages:** upload `GoatStream-Xbox.msixupload`.
   - **Store listing:** description (e.g. *"Watch your own movies from your PC, Google Drive, OneDrive and Dropbox on your Xbox. Created by Santiago."*), at least one **screenshot** of the app on Xbox (1920×1080; in Dev Mode press the Xbox button → *Capture*), plus the ready-made pictures in `xbox/store-art/`: `hero-1920x1080.png` (Super hero art), `box-art-1080x1080.png` (box art), `poster-720x1080.png` (poster art), `store-logo-300x300.png`.
   - **Privacy policy link:** required because the app uses the internet. A short page on GitHub Pages is fine ("Goat Stream collects nothing; movies stay between your devices; sign-ins go straight to Google/Microsoft/Dropbox").
   - **Submission options → restricted capabilities:** the app asks for `hevcPlayback`. Explain: *"Video player for the user's own 4K HEVC movies on Xbox."*
   - **Notes for certification:** tell the testers they need Goat Stream for Windows on a PC on the same network, or they can use **Use without a PC** with a cloud drive. Add a link to the Windows download.
5. **Submit.** Microsoft tests it on a real Xbox (usually a few days). If they find a problem, they send a report. Fix it and submit again.
6. **Updates later:** each new GitHub release makes a new `.msixupload` → Partner Center → *Update* → upload → submit. The Xbox updates people's copies by itself.

## 5. Any other TV (Fire TV browser, phones, older TVs…)

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
