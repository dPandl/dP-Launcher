const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Account & Authentication
  loginMicrosoft: () => ipcRenderer.invoke('login-microsoft'),
  loginOffline: (username) => ipcRenderer.invoke('login-offline', username),
  logoutAccount: () => ipcRenderer.invoke('logout-account'),
  getAccount: () => ipcRenderer.invoke('get-account'),
  changeSkin: (options) => ipcRenderer.invoke('change-minecraft-skin', options),
  selectSkinFile: () => ipcRenderer.invoke('select-skin-file'),
  getSkinHistory: () => ipcRenderer.invoke('get-skin-history'),
  getCurrentSkin: () => ipcRenderer.invoke('get-current-skin'),
  listCustomSkins: () => ipcRenderer.invoke('custom-skins-list'),
  addCustomSkin: (options) => ipcRenderer.invoke('custom-skin-add', options),
  updateCustomSkin: (options) => ipcRenderer.invoke('custom-skin-update', options),
  deleteCustomSkin: (id) => ipcRenderer.invoke('custom-skin-delete', id),
  deleteSkinHistoryItem: (id) => ipcRenderer.invoke('delete-skin-history-item', id),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window-minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window-maximize'),
  closeWindow: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  // Game & Directories
  getGameDir: () => ipcRenderer.invoke('get-game-dir'),
  openGameDir: (subDir) => ipcRenderer.invoke('open-game-dir', subDir),
  openTestInstanceDir: () => ipcRenderer.invoke('open-test-instance-dir'),
  getInstalledItems: (category) => ipcRenderer.invoke('get-installed-items', category),
  deleteItem: (category, filename) => ipcRenderer.invoke('delete-item', { category, filename }),
  // Eigene Instanzen
  listInstances: () => ipcRenderer.invoke('instances-list'),
  createInstance: (input) => ipcRenderer.invoke('instances-create', input),
  updateInstance: (id, data) => ipcRenderer.invoke('instances-update', { id, data }),
  removeInstance: (id, deleteFiles) => ipcRenderer.invoke('instances-remove', { id, deleteFiles }),
  openInstanceFolder: (id) => ipcRenderer.invoke('instances-open-folder', id),
  launchInstance: (id) => ipcRenderer.invoke('instances-launch', id),
  setModsTarget: (target) => ipcRenderer.invoke('mods-target-set', target),
  getMinecraftVersions: () => ipcRenderer.invoke('minecraft-versions'),
  installMrpack: (options) => ipcRenderer.invoke('modpack-install-mrpack', options),
  onInstanceInstallProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('instance-install-progress', subscription);
    return () => ipcRenderer.removeListener('instance-install-progress', subscription);
  },
  onInstancesChanged: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('instances-changed', subscription);
    return () => ipcRenderer.removeListener('instances-changed', subscription);
  },
  // Server-Verwaltung
  listServers: () => ipcRenderer.invoke('servers-list'),
  addServer: (input) => ipcRenderer.invoke('servers-add', input),
  updateServer: (id, data) => ipcRenderer.invoke('servers-update', { id, data }),
  setActiveServer: (id) => ipcRenderer.invoke('servers-set-active', id),
  removeServer: (id, deleteFiles) => ipcRenderer.invoke('servers-remove', { id, deleteFiles }),
  saveAdminServer: (data) => ipcRenderer.invoke('admin-server-save', data),
  saveAdminPresentation: (data) => ipcRenderer.invoke('admin-presentation-save', data),
  onAdminServerChanged: (callback) => {
    const subscription = (event, adminServer) => callback(adminServer);
    ipcRenderer.on('admin-server-changed', subscription);
    return () => ipcRenderer.removeListener('admin-server-changed', subscription);
  },
  openServerFolder: (id) => ipcRenderer.invoke('servers-open-folder', id),
  exportServer: (id, name, description, banner) => ipcRenderer.invoke('servers-export', { id, name, description, banner }),
  pickServerBanner: () => ipcRenderer.invoke('server-banner-pick'),
  pickCustomMod: () => ipcRenderer.invoke('custom-mod-pick'),
  readBanner: (ownerId) => ipcRenderer.invoke('banner-read', ownerId),
  getFabricLoaderVersions: (gameVersion) => ipcRenderer.invoke('fabric-loader-versions', gameVersion),
  detectServerVersions: () => ipcRenderer.invoke('server-detect-versions'),
  resetGameStatus: () => ipcRenderer.invoke('reset-game-status'),
  updateServerPresentation: (options) => ipcRenderer.invoke('modpack-update-presentation', options),
  updateModpackVersion: (options) => ipcRenderer.invoke('modpack-update-version', options),
  pickServerFile: () => ipcRenderer.invoke('servers-import-pick'),
  takePendingServerFile: () => ipcRenderer.invoke('servers-take-pending-file'),
  onServersChanged: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('servers-changed', subscription);
    return () => ipcRenderer.removeListener('servers-changed', subscription);
  },
  onServerFileOpened: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('server-file-opened', subscription);
    return () => ipcRenderer.removeListener('server-file-opened', subscription);
  },
  applyItemUpdate: (options) => ipcRenderer.invoke('apply-item-update', options),
  checkItemUpdates: (options) => ipcRenderer.invoke('check-item-updates', options),
  resolveInstalledProject: (category, filename) => ipcRenderer.invoke('resolve-installed-project', { category, filename }),
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
  killGame: () => ipcRenderer.invoke('kill-game'),
  getGameStatus: () => ipcRenderer.invoke('get-game-status'),
  onGameStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('game-status', subscription);
    return () => ipcRenderer.removeListener('game-status', subscription);
  },
  onGameLog: (callback) => {
    const subscription = (event, log) => callback(log);
    ipcRenderer.on('game-log', subscription);
    return () => ipcRenderer.removeListener('game-log', subscription);
  },

  // Settings & Manifest
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Eigene Mods der Spieler, passend zur Modliste des Servers
  getUserMods: () => ipcRenderer.invoke('user-mods-list'),
  installUserMod: (options) => ipcRenderer.invoke('user-mods-install', options),
  removeUserMod: (projectId) => ipcRenderer.invoke('user-mods-remove', projectId),

  // Modpack-Workflow (Entwurf, Server, Veröffentlichung)
  getModpackDraft: () => ipcRenderer.invoke('modpack-get-draft'),
  saveModpackDraft: (draft) => ipcRenderer.invoke('modpack-save-draft', draft),
  fetchPublishedModpack: () => ipcRenderer.invoke('modpack-fetch-published'),
  fetchPublishedModpackAdmin: () => ipcRenderer.invoke('modpack-fetch-published-admin'),
  updateServerChangelog: (options) => ipcRenderer.invoke('modpack-update-changelog', options),
  publishModpack: (options) => ipcRenderer.invoke('modpack-publish', options),
  getAvailableModpackConfigs: () => ipcRenderer.invoke('modpack-get-available-configs'),
  applyModpackToServer: (options) => ipcRenderer.invoke('modpack-apply-server', options),
  getServerBackupInfo: () => ipcRenderer.invoke('modpack-get-server-backup-info'),
  restoreServerBackup: () => ipcRenderer.invoke('modpack-restore-server-backup'),
  launchModpackTest: () => ipcRenderer.invoke('modpack-launch-test'),
  onModpackServerLog: (callback) => {
    const subscription = (event, line) => callback(line);
    ipcRenderer.on('modpack-server-log', subscription);
    return () => ipcRenderer.removeListener('modpack-server-log', subscription);
  },
  onModpackServerProgress: (callback) => {
    const subscription = (event, progress) => callback(progress);
    ipcRenderer.on('modpack-server-progress', subscription);
    return () => ipcRenderer.removeListener('modpack-server-progress', subscription);
  },
  onModpackDraftUpdated: (callback) => {
    const subscription = (event, draft) => callback(draft);
    ipcRenderer.on('modpack-draft-updated', subscription);
    return () => ipcRenderer.removeListener('modpack-draft-updated', subscription);
  },
  getGithubConfig: () => ipcRenderer.invoke('github-get-config'),
  saveGithubConfig: (config) => ipcRenderer.invoke('github-save-config', config),
  testGithubConnection: () => ipcRenderer.invoke('github-test-connection'),

  // Handbuch & Mod-Guides
  getGuides: () => ipcRenderer.invoke('guides-get'),
  saveGuides: (guides) => ipcRenderer.invoke('guides-save', guides),
  uploadGuideImage: () => ipcRenderer.invoke('guides-upload-image'),
  publishGuides: () => ipcRenderer.invoke('guides-publish'),

  // Auto-Update (GitHub Pages & Releases)
  checkForUpdate: (currentVersion) => ipcRenderer.invoke('check-for-update', currentVersion),
  downloadAndInstallUpdate: (downloadUrl) => ipcRenderer.invoke('download-and-install-update', downloadUrl),
  onUpdateProgress: (callback) => {
    const subscription = (event, percent) => callback(percent);
    ipcRenderer.on('update-progress', subscription);
    return () => ipcRenderer.removeListener('update-progress', subscription);
  },

  // BisectHosting & Server Admin
  bisectApi: (options) => ipcRenderer.invoke('bisect-api', options),
  bisectUploadMod: (options) => ipcRenderer.invoke('bisect-upload-mod', options),
  bisectInstallModrinthMod: (options) => ipcRenderer.invoke('bisect-install-modrinth-mod', options),
  bisectEnableKokotoWebChat: (options) => ipcRenderer.invoke('bisect-enable-kokoto-webchat', options),
  bisectGetAllocations: (options) => ipcRenderer.invoke('bisect-get-allocations', options),
  selectModFile: () => ipcRenderer.invoke('select-mod-file'),
  checkServerStatus: (address) => ipcRenderer.invoke('check-server-status', address),

  // Live Server-Konsole & Remote Command Control
  serverConsoleConnect: (options) => ipcRenderer.invoke('server-console-connect', options),
  serverConsoleDisconnect: () => ipcRenderer.invoke('server-console-disconnect'),
  serverConsoleSend: (options) => ipcRenderer.invoke('server-console-send', options),
  onServerConsoleLine: (callback) => {
    const subscription = (event, line) => callback(line);
    ipcRenderer.on('server-console-line', subscription);
    return () => ipcRenderer.removeListener('server-console-line', subscription);
  },
  onServerConsoleStatus: (callback) => {
    const subscription = (event, status) => callback(status);
    ipcRenderer.on('server-console-status', subscription);
    return () => ipcRenderer.removeListener('server-console-status', subscription);
  },

  // Local Config Editor
  getLocalConfigFiles: (target) => ipcRenderer.invoke('local-config-list', target),
  readLocalConfigFile: (filePath, target) => ipcRenderer.invoke('local-config-read', filePath, target),
  saveLocalConfigFile: (filePath, content, target) => ipcRenderer.invoke('local-config-write', { path: filePath, content, target }),

  // Utilities
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showMessage: (options) => ipcRenderer.invoke('show-message', options)
});
