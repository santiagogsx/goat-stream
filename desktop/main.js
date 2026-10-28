'use strict';
/* Goat Stream for Windows — app window + tray. The media server keeps running in the tray so TVs can play anytime. */
const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, shell, Notification, powerSaveBlocker, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Hardware HEVC (4K) decoding in the built-in player where the GPU supports it
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,PlatformHEVCEncoderSupport');
app.setAppUserModelId('com.goatstream.desktop');

const ICON = path.join(__dirname, 'icon.png');
const webDir = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'web');
const appKeys = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch (e) { return {}; } })();
const startHidden = process.argv.includes('--hidden');

let win = null, tray = null, server = null, quitting = false, blocker = null, toldAboutTray = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  app.whenReady().then(main);
}

async function main() {
  server = require('./server').start({ dataDir: app.getPath('userData'), webDir, appKeys, version: app.getVersion() });
  try {
    await server.ready;
  } catch (e) {
    dialog.showErrorBox('Goat Stream', `Couldn't start the media server on port ${server.port}.\nIs Goat Stream already running?\n\n${e.message}`);
    app.quit();
    return;
  }
  server.events.on('pair-request', pr => {
    showWindow();
    if (Notification.isSupported()) new Notification({ title: 'Goat Stream', body: `${pr.name} wants to connect — click Allow`, icon: ICON }).show();
  });
  server.events.on('account-added', () => showWindow());

  createTray();
  if (!startHidden) createWindow();
  setupUpdates();
}

// ---------- automatic updates (GitHub Releases) ----------
// Checks at start-up and every 6 hours, downloads quietly, installs on restart (or when Goat Stream quits).
let updater = null, updateState = { state: 'idle' };
function setupUpdates() {
  if (!app.isPackaged) { updateState = { state: 'dev' }; return; }
  try { updater = require('electron-updater').autoUpdater; } catch (e) { return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  const tell = () => { if (win && !win.isDestroyed()) win.webContents.send('update-state', updateState); };
  updater.on('checking-for-update', () => { updateState = { state: 'checking' }; tell(); });
  updater.on('update-not-available', () => { updateState = { state: 'latest' }; tell(); });
  updater.on('update-available', info => { updateState = { state: 'downloading', version: info.version, percent: 0 }; tell(); });
  updater.on('download-progress', p => { updateState = { state: 'downloading', version: updateState.version, percent: Math.round(p.percent) }; tell(); });
  updater.on('update-downloaded', info => {
    updateState = { state: 'ready', version: info.version };
    tell();
    if (Notification.isSupported()) new Notification({ title: 'Goat Stream update ready', body: `Version ${info.version} installs next time Goat Stream restarts.`, icon: ICON }).show();
  });
  updater.on('error', e => { updateState = { state: 'error', error: String(e.message || e).split('\n')[0] }; tell(); });
  const check = () => updater.checkForUpdates().catch(() => {});
  setTimeout(check, 8000);
  setInterval(check, 6 * 3600 * 1000);
}
ipcMain.handle('update-state', () => updateState);
ipcMain.handle('update-check', async () => {
  if (!updater) return updateState;
  try { await updater.checkForUpdates(); } catch (e) { updateState = { state: 'error', error: e.message }; }
  return updateState;
});
ipcMain.handle('update-install', () => { if (updater && updateState.state === 'ready') { quitting = true; updater.quitAndInstall(false, true); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 560,
    backgroundColor: '#070707', icon: ICON, title: 'Goat Stream', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.loadURL(`http://127.0.0.1:${server.port}/`);
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', e => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true;
      new Notification({ title: 'Goat Stream is still running', body: 'Your TVs can keep playing movies. Right-click the goat in the tray to quit.', icon: ICON }).show();
    }
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('Goat Stream — serving your movies');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Goat Stream', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
}

app.on('before-quit', () => { quitting = true; if (server) server.close(); });
app.on('window-all-closed', () => { /* keep serving from the tray */ });

// ---------- IPC for the UI ----------
ipcMain.handle('pick-folders', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose movie folders', properties: ['openDirectory', 'multiSelections'] });
  return r.canceled ? [] : r.filePaths;
});
// web links, plus Windows' Films & TV app (where Microsoft Store movie purchases play)
ipcMain.handle('open-external', (e, url) => { if (/^https?:\/\//.test(url) || url === 'mswindowsvideo:') shell.openExternal(url); });
ipcMain.on('set-playing', (e, on) => {
  if (on && blocker == null) blocker = powerSaveBlocker.start('prevent-display-sleep');
  if (!on && blocker != null) { powerSaveBlocker.stop(blocker); blocker = null; }
});
ipcMain.handle('app-version', () => app.getVersion());
ipcMain.handle('get-autostart', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('set-autostart', (e, on) => { app.setLoginItemSettings({ openAtLogin: !!on, args: ['--hidden'] }); return true; });

// External player (VLC / mpv / MPC-HC) — plays every codec and bitstreams Dolby Atmos / DTS:X to a receiver
function findPlayer() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  return [
    path.join(pf, 'VideoLAN', 'VLC', 'vlc.exe'),
    path.join(pf86, 'VideoLAN', 'VLC', 'vlc.exe'),
    path.join(pf, 'mpv', 'mpv.exe'),
    path.join(local, 'Programs', 'mpv', 'mpv.exe'),
    path.join(pf, 'MPC-HC', 'mpc-hc64.exe'),
  ].find(p => fs.existsSync(p));
}
ipcMain.handle('play-external', (e, id) => {
  const player = findPlayer();
  if (!player) { shell.openExternal('https://www.videolan.org/vlc/'); return { ok: false, error: 'VLC isn\'t installed — opening the download page.' }; }
  const it = server.getItem(id);
  if (!it) return { ok: false, error: 'Not found' };
  const target = it.source === 'local' ? it.path : `http://127.0.0.1:${server.port}/stream/${encodeURIComponent(id)}`;
  const args = /vlc\.exe$/i.test(player) ? ['--fullscreen', '--meta-title=' + (it.title || it.name), target] : [target];
  spawn(player, args, { detached: true, stdio: 'ignore' }).unref();
  return { ok: true };
});
