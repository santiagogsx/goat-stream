'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('goatDesktop', {
  pickFolders: () => ipcRenderer.invoke('pick-folders'),
  openExternal: url => ipcRenderer.invoke('open-external', url),
  playExternal: id => ipcRenderer.invoke('play-external', id),
  setPlaying: on => ipcRenderer.send('set-playing', !!on),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: on => ipcRenderer.invoke('set-autostart', !!on),
  version: () => ipcRenderer.invoke('app-version'),
  updateState: () => ipcRenderer.invoke('update-state'),
  checkForUpdates: () => ipcRenderer.invoke('update-check'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  onUpdateState: fn => ipcRenderer.on('update-state', (e, s) => fn(s)),
});
