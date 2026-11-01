const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Game & Directories
  getGameDir: () => ipcRenderer.invoke('get-game-dir'),
  openGameDir: (subDir) => ipcRenderer.invoke('open-game-dir', subDir),
  getInstalledItems: (category) => ipcRenderer.invoke('get-installed-items', category),
  deleteItem: (category, filename) => ipcRenderer.invoke('delete-item', { category, filename }),
  toggleMod: (filename) => ipcRenderer.invoke('toggle-mod', filename),

  // Modrinth & Sync Engine
  downloadModrinthFile: (options) => ipcRenderer.invoke('download-modrinth-file', options),
  syncServerMods: (manifest) => ipcRenderer.invoke('sync-server-mods', manifest),
  onSyncProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('sync-progress', subscription);
    return () => ipcRenderer.removeListener('sync-progress', subscription);
  },

  // Game Launch & Logs
  detectJava: () => ipcRenderer.invoke('detect-java'),
  launchGame: (options) => ipcRenderer.invoke('launch-game', options),
  onGameLog: (callback) => {
    const subscription = (event, log) => callback(log);
    ipcRenderer.on('game-log', subscription);
    return () => ipcRenderer.removeListener('game-log', subscription);
  },

  // Settings & Manifest
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  fetchRemoteManifest: (url) => ipcRenderer.invoke('fetch-remote-manifest', url),

  // Auto-Update (GitHub Pages & Releases)
  checkForUpdate: (currentVersion) => ipcRenderer.invoke('check-for-update', currentVersion),
  downloadAndInstallUpdate: (downloadUrl) => ipcRenderer.invoke('download-and-install-update', downloadUrl),
  onUpdateProgress: (callback) => {
    const subscription = (event, percent) => callback(percent);
    ipcRenderer.on('update-progress', subscription);
    return () => ipcRenderer.removeListener('update-progress', subscription);
  },

  // Utilities
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showMessage: (options) => ipcRenderer.invoke('show-message', options)
});
