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
  // users never see these). Public IDs only — never secrets. (A GOAT_CONFIG_JSON GitHub secret, if set, overrides
  // them at release.) Google also needs the sign-in helper (cloud-helper/), which keeps Google's secret.
  cloud: {
    googleClientId: '659541422508-ej8c9be3l9feg7s40p4u8lhnros8md8a.apps.googleusercontent.com',
    onedriveClientId: '',
    dropboxAppKey: 'qzna177cgfusctb',
    tokenHelper: 'https://goat-stream-signin.rs-studio-tt.workers.dev',
  },
};
