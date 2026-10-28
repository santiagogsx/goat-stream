/* Goat Stream app-wide settings, baked into every build (PC app, Android TV app, browsers). */
window.GOAT_CONFIG = {
  // Where people download Goat Stream for Windows. Shown (with a QR code) on the TV app's setup screen
  // and in its Settings. Upload "Goat Stream Setup.exe" somewhere public (GitHub Releases, a Google Drive
  // or Dropbox share link, your website…) and paste the link here, then rebuild the TV app.
  pcDownloadUrl: '',

  // Your GitHub repository ("username/goat-stream"). The TV app checks its Releases for automatic updates,
  // and the download link above defaults to its latest release.
  githubRepo: 'santiagogsx/goat-stream',
};
