/* Goat Stream app-wide settings, baked into every build (PC app, Android TV app, Samsung/LG apps, browsers). */
window.GOAT_CONFIG = {
  // Where people download Goat Stream for Windows. Shown (with a QR code) on the TV app's setup screen
  // and in its Settings. Leave empty to use the latest GitHub release.
  pcDownloadUrl: '',

  // Your GitHub repository ("username/goat-stream"). The TV app checks its Releases for automatic updates,
  // and the download link above defaults to its latest release.
  githubRepo: 'santiagogsx/goat-stream',

  // Public page that hands a phone sign-in over to the TV (relay/oauth.html on GitHub Pages).
  oauthRelay: 'https://santiagogsx.github.io/goat-stream/relay/oauth.html',

  // Goat Stream's own app registrations with Google / Microsoft / Dropbox (made once by the app's creator —
  // users never see these). Public IDs only — never secrets. The release build fills them in from the GitHub
  // secret GOAT_CONFIG_JSON. Google also needs the sign-in helper (cloud-helper/), which keeps Google's secret.
  cloud: {
    googleClientId: '',
    onedriveClientId: '',
    dropboxAppKey: '',
    tokenHelper: '',
  },
};
