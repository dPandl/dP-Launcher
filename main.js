import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, nativeImage, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import os from 'os';
import crypto from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { execFile, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Auth } from 'msmc';
import pkgMCLC from 'minecraft-launcher-core';
const { Client: MCLCClient } = pkgMCLC;
import net from 'net';
import dns from 'dns';
import { unzipSync, strFromU8 } from 'fflate';
import {
  SERVER_FILE_EXTENSION,
  sanitizeServerInput,
  BANNER_MAX_BYTES,
  SERVER_NAME_MAX,
  SERVER_DESCRIPTION_MAX,
  isValidServerAddress,
  normalizeMapUrl,
  SERVER_FILE_MAX_CHARS,
  isPngBuffer,
  bannerToDataUrl,
  bannerFromDataUrl,
  isValidBannerDataUrl,
  createServerRecord,
  folderNameFor,
  buildServerFile,
  parseServerFile
} from './serverStore.js';
import {
  sanitizeInstanceInput,
  createInstanceRecord,
  parseMrpackIndex,
  isSafeRelativePath
} from './instanceStore.js';

// Threadpool für asynchrone I/O-Tasks auf 16 erhöhen, um Freezes zu verhindern
process.env.UV_THREADPOOL_SIZE = '16';

// MCLC Performance-Patch: Vorhandene Assets und Bibliotheken nicht bei jedem Start erneut per SHA-1 hashen
try {
  const req = createRequire(import.meta.url);
  const Handler = req('minecraft-launcher-core/components/handler');
  if (Handler && Handler.prototype && Handler.prototype.checkSum) {
    const origCheckSum = Handler.prototype.checkSum;
    Handler.prototype.checkSum = function (hash, file) {
      try {
        if (file && fs.existsSync(file)) {
          const stat = fs.statSync(file);
          if (stat.size > 0) {
            // Assets und Bibliotheken sind bereits vorhanden und intakt
            return Promise.resolve(true);
          }
        }
      } catch (e) {}
      return origCheckSum.call(this, hash, file);
    };
  }
} catch (e) {
  console.warn('MCLC CheckSum Patch konnte nicht geladen werden:', e);
}
import {
  INITIAL_MODPACK_VERSION,
  bumpVersion,
  compareVersions,
  isValidCustomVersion,
  getManifestMods,
  getModSha1,
  isAllowedModUrl,
  isPinnedMod,
  isSafeModFilename,
  isSafePackFilename,
  isValidManifest,
  planServerSync
} from './modpackUtils.js';
import { createModrinthIo, resolveModInstall, inspectJar } from './modResolver.js';
import { applyClientDefaults } from './clientDefaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

// Für automatische Tests: eigener Datenordner, damit die echten Daten unberührt bleiben
if (process.env.DP_LAUNCHER_TEST_ROOT) {
  app.setPath('appData', process.env.DP_LAUNCHER_TEST_ROOT);
  app.setPath('userData', path.join(process.env.DP_LAUNCHER_TEST_ROOT, 'electron-minecraft-launcher'));
}

// Standard-Gameverzeichnis: Eigenständiges Verzeichnis, damit normale .minecraft unberührt bleibt
const gameDir = path.join(app.getPath('appData'), '.server-minecraft-launcher');
const testInstanceSubDir = path.join('instances', 'modpack-test');
const settingsPath = path.join(app.getPath('userData'), 'launcher-settings.json');
const modInspectCachePath = path.join(app.getPath('userData'), 'mod-inspect-cache.json');

// Standard-Einstellungen
const defaultSettings = {
  enableAdminMode: false,
  ramMin: 2,
  ramMax: 6,
  javaPath: '',
  username: 'Spieler',
  account: null,
  skinHistory: [],
  customSkins: [], // eigene Skins der Bibliothek: Name und Modell, die PNG liegt im Ordner custom-skins
  themeSeason: 'auto', // 'auto' | 'spring' | 'summer' | 'autumn' | 'winter'
  manifestUrl: '',
  servers: undefined, // Liste der angelegten Server (wird beim ersten Start angelegt)
  activeServerId: null,
  adminServer: undefined, // Server des Server-Admins: Name, Adresse, Repository. Unabhängig von der Spielliste.
  instances: undefined, // eigene Instanzen ohne Server
  serverIp: '', // veraltet: früher die Adresse des einen Servers
  autoSyncOnStart: true,
  bisectConfig: {
    panelUrl: 'https://games.bisecthosting.com',
    apiKey: '',
    serverId: ''
  },
  githubConfig: {
    token: '' // Besitzer, Repository und Branch gehören zum jeweiligen Server
  },
  lastSyncedModpackVersion: null,
  graphicsBackend: 'keep', // 'keep' | 'vulkan' | 'opengl'
  gameLaunchBehavior: 'hide' // 'hide' | 'minimize' | 'close' | 'keep'
};

// Geheimnisse (Tokens, API-Keys) werden mit dem Betriebssystem-Schlüsselbund (safeStorage) verschlüsselt.
// Alte Klartext-Dateien bleiben lesbar und werden beim nächsten Speichern verschlüsselt.
const SECRET_PATHS = [['account', 'token'], ['bisectConfig', 'apiKey'], ['githubConfig', 'token']];

function canEncrypt() {
  try {
    return app.isReady() && safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptSecrets(settings) {
  if (!canEncrypt()) return settings;
  const out = JSON.parse(JSON.stringify(settings));
  for (const [group, key] of SECRET_PATHS) {
    const value = out[group]?.[key];
    if (value === undefined || value === null || value === '') continue;
    out[group][key] = { __enc: safeStorage.encryptString(JSON.stringify(value)).toString('base64') };
  }
  return out;
}

function decryptSecrets(settings) {
  for (const [group, key] of SECRET_PATHS) {
    const value = settings[group]?.[key];
    if (value && typeof value === 'object' && typeof value.__enc === 'string') {
      try {
        settings[group][key] = JSON.parse(safeStorage.decryptString(Buffer.from(value.__enc, 'base64')));
      } catch (err) {
        console.error(`Geheimnis ${group}.${key} konnte nicht entschlüsselt werden:`, err.message);
        settings[group][key] = key === 'token' && group === 'account' ? null : '';
      }
    }
  }
  return settings;
}

function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return decryptSecrets({ ...defaultSettings, ...JSON.parse(data) });
    }
  } catch (err) {
    console.error('Fehler beim Laden der Einstellungen:', err);
  }
  return defaultSettings;
}

function saveSettings(newSettings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...newSettings };
    fs.writeFileSync(settingsPath, JSON.stringify(encryptSecrets(updated), null, 2), 'utf8');
    return updated;
  } catch (err) {
    console.error('Fehler beim Speichern der Einstellungen:', err);
    return null;
  }
}


// ─── Server-Verwaltung ─────────────────────────────────────────────────────
// Jeder Server hat eine eigene Instanz (Mods, Configs, Resourcepacks, Shader) und eigene Daten
// (Modliste-Zwischenspeicher, Entwurf, Spieler-Mods). Assets, Bibliotheken, Versionen und Java sind geteilt.
const NO_SERVER_INSTANCE = '_ohne-server';
const INSTANCE_FOLDERS = ['mods', 'resourcepacks', 'shaderpacks', 'config', 'logs'];

function getServers() {
  const list = getSettings().servers;
  return Array.isArray(list) ? list : [];
}

// Das Server-Admin hat einen eigenen Server (Einstellung adminServer), unabhängig von der Spielliste.
// Admin-Aufrufe laufen in diesem Kontext, dort liefert getActiveServer() den Admin-Server.
const ADMIN_SERVER_ID = '_admin';
const adminContext = new AsyncLocalStorage();

function storedAdminServer() {
  return {
    name: '', address: '', owner: '', repo: '', branch: 'main', description: '', banner: '', mapUrl: '',
    ...(getSettings().adminServer || {})
  };
}

function getAdminServer() {
  return { id: ADMIN_SERVER_ID, folder: ADMIN_SERVER_ID, ...storedAdminServer() };
}

function getActiveServer() {
  if (adminContext.getStore()) return getAdminServer();
  const settings = getSettings();
  return getServers().find(server => server.id === settings.activeServerId) || null;
}

// Wie ipcMain.handle, aber der Aufruf gilt für den Admin-Server
function handleAdmin(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => adminContext.run({}, () => handler(event, ...args)));
}

// ─── Banner als Dateien ─────────────────────────────────────────────────────
// Banner liegen als PNG im Ordner "banners". In den Einstellungen steht nur ein kurzer Hash.
// So bleibt die Einstellungsdatei klein, auch bei Bildern in Full HD.
function bannerFilePath(ownerId) {
  return path.join(app.getPath('userData'), 'banners', `${String(ownerId).replace(/[^A-Za-z0-9_-]/g, '_')}.png`);
}

function writeBannerFile(ownerId, dataUrl) {
  const buffer = bannerFromDataUrl(dataUrl);
  fs.mkdirSync(path.dirname(bannerFilePath(ownerId)), { recursive: true });
  fs.writeFileSync(bannerFilePath(ownerId), buffer);
  return crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 8);
}

function readBannerDataUrl(ownerId) {
  try {
    const file = bannerFilePath(ownerId);
    return fs.existsSync(file) ? bannerToDataUrl(fs.readFileSync(file)) : '';
  } catch (_e) {
    return '';
  }
}

function deleteBannerFile(ownerId) {
  try { fs.rmSync(bannerFilePath(ownerId), { force: true }); } catch (_e) { /* nichts zu löschen */ }
}

ipcMain.handle('banner-read', (event, ownerId) => readBannerDataUrl(ownerId));

function getInstanceDir(server = getActiveServer()) {
  return path.join(gameDir, 'instances', server ? server.folder : NO_SERVER_INSTANCE);
}

function ensureInstanceFolders(dir = getInstanceDir()) {
  for (const folder of INSTANCE_FOLDERS) {
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
  }
}

function serverDataDir(server = getActiveServer()) {
  const dir = path.join(app.getPath('userData'), 'servers', server ? server.id : '_none');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function modpackDraftPath() { return path.join(serverDataDir(), 'modpack-draft.json'); }
function manifestCachePath() { return path.join(serverDataDir(), 'manifest-cache.json'); }
function modpackServerStatePath() { return path.join(serverDataDir(), 'modpack-server-state.json'); }
function serverTestBackupStatePath() { return path.join(serverDataDir(), 'server-test-backup-state.json'); }
function serverBackupsDir() { return path.join(serverDataDir(), 'server-backups'); }
function userModsPath() {
  const instance = getEditInstance();
  return path.join(instance ? instanceDataDir(instance) : serverDataDir(), 'user-mods.json');
}
function modpackGuidesPath() { return path.join(serverDataDir(), 'modpack-guides.json'); }

function saveServers(servers, activeServerId) {
  return saveSettings({ servers, activeServerId });
}

// Frühere Versionen kannten nur einen Server. Dessen Einstellungen und Dateien werden einmalig übernommen.
// Das Server-Admin hatte früher keinen eigenen Server, sondern nutzte den aktiven. Dessen Angaben und Daten werden einmalig übernommen.
function migrateAdminServer() {
  try {
    const settings = getSettings();
    if (settings.adminServer) return;
    const source = getServers().find(server => server.id === settings.activeServerId && server.owner && server.repo);
    if (!source) return;
    saveSettings({
      adminServer: {
        name: source.name || '', address: source.address || '', owner: source.owner, repo: source.repo,
        branch: source.branch || 'main', description: source.description || '', banner: source.banner || '', mapUrl: source.mapUrl || ''
      }
    });
    // Liegt das Banner des Servers schon als Datei vor, bekommt es auch der Admin-Server
    if (source.banner && !isValidBannerDataUrl(source.banner)) {
      try { fs.copyFileSync(bannerFilePath(source.id), bannerFilePath(ADMIN_SERVER_ID)); } catch (_e) { /* ohne Banner weiter */ }
    }
    const from = path.join(app.getPath('userData'), 'servers', source.id);
    const to = path.join(app.getPath('userData'), 'servers', ADMIN_SERVER_ID);
    if (fs.existsSync(from) && !fs.existsSync(to)) fs.cpSync(from, to, { recursive: true });
  } catch (err) {
    console.warn('Admin-Server konnte nicht übernommen werden:', err.message);
  }
}

function migrateBannersToFiles() {
  try {
    const settings = getSettings();
    const patch = {};
    let serversChanged = false;
    const servers = getServers().map(server => {
      if (!isValidBannerDataUrl(server.banner)) return server;
      serversChanged = true;
      return { ...server, banner: writeBannerFile(server.id, server.banner) };
    });
    if (serversChanged) patch.servers = servers;
    const admin = settings.adminServer;
    if (admin && isValidBannerDataUrl(admin.banner)) {
      patch.adminServer = { ...admin, banner: writeBannerFile(ADMIN_SERVER_ID, admin.banner) };
    }
    if (Object.keys(patch).length > 0) saveSettings(patch);
  } catch (err) {
    console.warn('Banner konnten nicht in Dateien umgewandelt werden:', err.message);
  }
}

function migrateLegacySetup() {
  try {
    const stored = readJsonFile(settingsPath, {}) || {};
    if (Array.isArray(stored.servers)) return;

    const legacyAddress = String(stored.serverIp || '').trim();
    const legacyGithub = stored.githubConfig || {};
    const legacyManifest = readJsonFile(path.join(app.getPath('userData'), 'manifest-cache.json'));
    const address = legacyAddress || legacyManifest?.serverAddress || '';
    const legacyModsExist = fs.existsSync(path.join(gameDir, 'mods')) && fs.readdirSync(path.join(gameDir, 'mods')).length > 0;

    if (!address || (!legacyAddress && !legacyModsExist)) {
      saveServers([], null);
      return;
    }

    const clean = sanitizeServerInput({
      name: legacyManifest?.serverName || 'Mein Server',
      address,
      owner: legacyGithub.owner,
      repo: legacyGithub.repo,
      branch: legacyGithub.branch
    });
    if (!clean.ok) {
      saveServers([], null);
      return;
    }

    // Sicherheitskopie der Einstellungen, falls bei der Übernahme etwas schiefgeht
    try { fs.copyFileSync(settingsPath, `${settingsPath}.vor-server-umbau.bak`); } catch (_e) {}

    const record = createServerRecord(clean.server, []);
    const instanceDir = getInstanceDir(record);
    fs.mkdirSync(instanceDir, { recursive: true });

    for (const entry of ['mods', 'resourcepacks', 'shaderpacks', 'config', 'saves', 'screenshots', 'options.txt', 'servers.dat', 'logs']) {
      const from = path.join(gameDir, entry);
      const to = path.join(instanceDir, entry);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        try { fs.renameSync(from, to); } catch (err) { console.warn(`${entry} konnte nicht verschoben werden:`, err.message); }
      }
    }

    const dataDir = serverDataDir(record);
    for (const file of ['manifest-cache.json', 'modpack-draft.json', 'modpack-server-state.json', 'server-test-backup-state.json', 'user-mods.json', 'modpack-guides.json', 'server-backups']) {
      const from = path.join(app.getPath('userData'), file);
      const to = path.join(dataDir, file);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        try { fs.renameSync(from, to); } catch (err) { console.warn(`${file} konnte nicht verschoben werden:`, err.message); }
      }
    }

    saveSettings({
      servers: [record],
      activeServerId: record.id,
      serverIp: '',
      githubConfig: { token: legacyGithub.token || '' }
    });
  } catch (err) {
    console.error('Übernahme der bisherigen Einrichtung fehlgeschlagen:', err);
  }
}


// ─── Eigene Instanzen (ohne Server) ────────────────────────────────────────
function getInstances() {
  const list = getSettings().instances;
  return Array.isArray(list) ? list : [];
}

function getInstanceById(id) {
  return getInstances().find(instance => instance.id === id) || null;
}

function instanceDirFor(instance) {
  return path.join(gameDir, 'instances', instance.folder);
}

function instanceDataDir(instance) {
  const dir = path.join(app.getPath('userData'), 'instances-data', instance.id);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveInstances(instances) {
  return saveSettings({ instances });
}

function allTakenFolders() {
  return [...getServers().map(server => server.folder), ...getInstances().map(instance => instance.folder)];
}

// Welche Instanz die Mods-Seite gerade bearbeitet. Gilt nur, solange diese Seite offen ist.
let editTarget = null;

function getEditInstance() {
  return editTarget?.kind === 'instance' ? getInstanceById(editTarget.id) : null;
}

// Ordner, den die Mods-Seite und die Config-Editoren bearbeiten: eine eigene Instanz oder der aktive Server
function getEditInstanceDir() {
  const instance = getEditInstance();
  return instance ? instanceDirFor(instance) : getInstanceDir();
}

function markPlayed(kind, id) {
  const now = new Date().toISOString();
  if (kind === 'server') {
    saveServers(getServers().map(server => (server.id === id ? { ...server, lastPlayedAt: now } : server)), getSettings().activeServerId);
  } else {
    saveInstances(getInstances().map(instance => (instance.id === id ? { ...instance, lastPlayedAt: now } : instance)));
  }
}

// SHA-1 Berechnung für Dateien
function getFileSha1(filePath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) return resolve(null);
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', err => reject(err));
  });
}

// High-Performance Download-Agenten mit TCP/TLS Keep-Alive
const downloadHttpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16, timeout: 35000 });
const downloadHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 16, timeout: 35000 });

// Download Helfer mit Redirects, Keep-Alive, 1MB Stream Buffer und IPC-Throttling
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    let file = null;
    const request = (currentUrl) => {
      try {
        const parsed = new URL(currentUrl);
        const isHttps = parsed.protocol === 'https:';
        const mod = isHttps ? https : http;
        const agent = isHttps ? downloadHttpsAgent : downloadHttpAgent;

        const req = mod.get(currentUrl, {
          agent,
          headers: {
            'User-Agent': 'Electron-Minecraft-Launcher/1.0 (contact@github.com)',
            'Accept-Encoding': 'identity'
          }
        }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const nextUrl = new URL(res.headers.location, currentUrl).href;
            request(nextUrl);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} beim Herunterladen von ${currentUrl}`));
            return;
          }

          // 1 MB Buffer für volle Leitungsgeschwindigkeit ohne TCP Backpressure
          file = fs.createWriteStream(destPath, { highWaterMark: 1024 * 1024 });
          const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
          let downloadedBytes = 0;
          let lastReportedPct = -1;
          let lastReportedTime = 0;

          res.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (onProgress && totalBytes > 0) {
              const pct = Math.round((downloadedBytes / totalBytes) * 100);
              const now = Date.now();
              // IPC Throttling: Max alle 80ms melden, um den Event Loop nicht zu blockieren
              if (pct === 100 || (pct !== lastReportedPct && now - lastReportedTime > 80)) {
                lastReportedPct = pct;
                lastReportedTime = now;
                onProgress(pct);
              }
            }
          });

          res.pipe(file);
          file.on('finish', () => file.close(resolve));
          file.on('error', (err) => {
            if (file) file.close();
            reject(err);
          });
          res.on('error', (err) => {
            if (file) file.close();
            reject(err);
          });
        });

        req.setTimeout(35000, () => {
          req.destroy(new Error(`Download-Timeout bei ${currentUrl}`));
        });

        req.on('error', reject);
      } catch (e) {
        reject(e);
      }
    };
    request(url);
  });
}

// ─── Download mit mehreren Verbindungen ─────────────────────────────────────
// GitHub drosselt einzelne Verbindungen oft auf unter 1 MB/s. Mit mehreren gleichzeitigen Teil-Downloads (Range)
// steigt das Tempo auf ein Vielfaches. Ohne Range-Unterstützung läuft der normale Download.
const PARALLEL_DOWNLOAD_HEADERS = { 'User-Agent': 'Electron-Minecraft-Launcher/1.0', 'Accept-Encoding': 'identity' };

// Folgt den Weiterleitungen und fragt nach dem ersten Byte: liefert die endgültige Adresse und die Gesamtgröße,
// oder null, wenn der Server keine Teil-Downloads kann.
function probeRangeSupport(url, hops = 0) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch (_e) { return resolve(null); }
    if (parsed.protocol !== 'https:') return resolve(null);
    const req = https.get(url, { headers: { ...PARALLEL_DOWNLOAD_HEADERS, Range: 'bytes=0-0' } }, (res) => {
      res.resume();
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 5) {
        probeRangeSupport(new URL(res.headers.location, url).href, hops + 1).then(resolve);
        return;
      }
      const total = Number(String(res.headers['content-range'] || '').split('/')[1]);
      resolve(res.statusCode === 206 && Number.isFinite(total) && total > 0 ? { finalUrl: url, total } : null);
    });
    req.setTimeout(15000, () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

// Holt einen Teil der Datei. onBytes meldet laufend die empfangenen Bytes.
function fetchRange(finalUrl, from, to, onBytes) {
  return new Promise((resolve, reject) => {
    const req = https.get(finalUrl, { headers: { ...PARALLEL_DOWNLOAD_HEADERS, Range: `bytes=${from}-${to}` } }, (res) => {
      if (res.statusCode !== 206) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const parts = [];
      let received = 0;
      res.on('data', (chunk) => { parts.push(chunk); received += chunk.length; onBytes(chunk.length); });
      res.on('end', () => (received === to - from + 1
        ? resolve({ buffer: Buffer.concat(parts), received })
        : reject(Object.assign(new Error('Teil unvollständig'), { received }))));
      res.on('error', (err) => reject(Object.assign(err, { received })));
    });
    req.setTimeout(30000, () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
  });
}

async function downloadFileParallel(url, destPath, onProgress, { connections = 6, chunkSize = 4 * 1024 * 1024 } = {}) {
  const probe = await probeRangeSupport(url);
  if (!probe) return downloadFile(url, destPath, onProgress);

  let { finalUrl } = probe;
  const { total } = probe;
  const chunks = [];
  for (let position = 0; position < total; position += chunkSize) {
    chunks.push([position, Math.min(position + chunkSize, total) - 1]);
  }

  const fd = fs.openSync(destPath, 'w');
  let done = 0;
  let lastPercent = -1;
  let lastTime = 0;
  const report = () => {
    if (!onProgress) return;
    const percent = Math.min(100, Math.round((done / total) * 100));
    const now = Date.now();
    if (percent === 100 || (percent !== lastPercent && now - lastTime > 80)) {
      lastPercent = percent;
      lastTime = now;
      onProgress(percent);
    }
  };

  let nextChunk = 0;
  const worker = async () => {
    while (nextChunk < chunks.length) {
      const [from, to] = chunks[nextChunk++];
      for (let attempt = 1; ; attempt++) {
        let counted = 0;
        try {
          const { buffer } = await fetchRange(finalUrl, from, to, (bytes) => { counted += bytes; done += bytes; report(); });
          fs.writeSync(fd, buffer, 0, buffer.length, from);
          break;
        } catch (err) {
          done -= counted; // Fehlversuch zählt nicht zum Fortschritt
          if (attempt >= 4) throw err;
          // Die signierte Adresse kann ablaufen: neu auflösen
          if (attempt === 2) {
            const again = await probeRangeSupport(url);
            if (again) finalUrl = again.finalUrl;
          }
          await new Promise(resolve => setTimeout(resolve, 400 * attempt));
        }
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(connections, chunks.length) }, worker));
  } finally {
    fs.closeSync(fd);
  }
  if (fs.statSync(destPath).size !== total) throw new Error('Die heruntergeladene Datei ist unvollständig.');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'dP Launcher',
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false, // Frameless für modernes Aussehen
    titleBarStyle: 'hidden',
    backgroundColor: '#e9edf3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
    icon: path.join(__dirname, 'public', process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png'),
  });

  mainWindow.setMenuBarVisibility(false);

  if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

app.on('second-instance', (event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  const file = findServerFileArg(argv);
  if (file) handleOpenedServerFile(file);
});

// macOS: Datei per Doppelklick geöffnet
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath.toLowerCase().endsWith(`.${SERVER_FILE_EXTENSION}`)) handleOpenedServerFile(filePath);
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  migrateLegacySetup();
  migrateAdminServer();
  migrateBannersToFiles();
  if (!Array.isArray(getSettings().instances)) saveInstances([]);
  ensureInstanceFolders();
  const startFile = findServerFileArg(process.argv);
  if (startFile) handleOpenedServerFile(startFile);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  destroyTray();
});

// ─── Window Controls ────────────────────────────────────────────────────────
ipcMain.handle('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ─── Account & Authentication ───────────────────────────────────────────────
ipcMain.handle('login-microsoft', async () => {
  try {
    const authManager = new Auth('select_account');
    const xboxManager = await authManager.launch('electron');
    if (!xboxManager) {
      return { success: false, error: 'Anmeldung abgebrochen' };
    }

    const mc = await xboxManager.getMinecraft();
    if (!mc || !mc.profile) {
      return { success: false, error: 'Minecraft-Profil konnte nicht abgerufen werden.' };
    }

    const account = {
      name: mc.profile.name,
      uuid: mc.profile.id,
      type: 'microsoft',
      token: mc.mclc(true),
      skinUrl: `https://crafthead.net/helm/${mc.profile.id}`
    };

    saveSettings({ account });
    return { success: true, account };
  } catch (err) {
    console.error('Microsoft Auth Fehler:', err);
    if (err === 'error.gui.closed' || err?.message === 'error.gui.closed') {
      return { success: false, error: 'Das Anmeldefenster wurde geschlossen.' };
    }
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('login-offline', async (event, username) => {
  if (!username || !username.trim()) {
    return { success: false, error: 'Bitte gib einen Spielernamen ein.' };
  }
  const cleanName = username.trim().substring(0, 16);
  const account = {
    name: cleanName,
    uuid: crypto.randomUUID(),
    type: 'offline',
    skinUrl: `https://crafthead.net/helm/${cleanName}`
  };
  saveSettings({ account });
  return { success: true, account };
});

ipcMain.handle('logout-account', async () => {
  saveSettings({ account: null });
  return { success: true };
});

function isTokenExpiredOrExpiringSoon(account) {
  if (!account || account.type !== 'microsoft') return false;
  const exp = account.token?.meta?.exp;
  if (!exp) return true;
  // Wenn weniger als 5 Minuten übrig sind
  return (exp - Date.now()) < 5 * 60 * 1000;
}

async function refreshMicrosoftAccount(account) {
  if (!account || account.type !== 'microsoft' || !account.token?.meta?.refresh) {
    return account;
  }
  try {
    const authManager = new Auth('select_account');
    const xbl = await authManager.refresh(account.token.meta.refresh);
    const mc = await xbl.getMinecraft();
    if (mc && mc.profile) {
      const refreshedAccount = {
        ...account,
        name: mc.profile.name,
        uuid: mc.profile.id,
        token: mc.mclc(true),
        skinUrl: `https://crafthead.net/helm/${mc.profile.id}`
      };
      saveSettings({ account: refreshedAccount });
      return refreshedAccount;
    }
  } catch (err) {
    console.error('Fehler beim Aktualisieren des Microsoft-Tokens:', err);
    throw new Error('Deine Microsoft-Sitzung ist abgelaufen. Bitte melde dich im Launcher einmal neu mit Microsoft an.');
  }
  return account;
}

async function ensureFreshAccount(account) {
  if (account && account.type === 'microsoft' && isTokenExpiredOrExpiringSoon(account)) {
    return await refreshMicrosoftAccount(account);
  }
  return account;
}

ipcMain.handle('get-account', async () => {
  const settings = getSettings();
  if (settings.account && settings.account.type === 'microsoft' && isTokenExpiredOrExpiringSoon(settings.account)) {
    try {
      const refreshed = await refreshMicrosoftAccount(settings.account);
      return refreshed;
    } catch (e) {
      return settings.account;
    }
  }
  return settings.account || null;
});

ipcMain.handle('change-minecraft-skin', async (event, { variant = 'classic', skinUrl, filePath, skinName, dataUrl }) => {
  try {
    const settings = getSettings();
    let account = settings.account;
    if (!account) {
      return { success: false, error: 'Kein Account angemeldet.' };
    }
    account = await ensureFreshAccount(account);

    if (account.type === 'microsoft' && account.token?.access_token) {
      const accessToken = account.token.access_token;

      if (skinUrl) {
        // Mojang JSON URL Upload
        const response = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ variant, url: skinUrl })
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Mojang API (${response.status}): ${errText}`);
        }
      } else if ((filePath && fs.existsSync(filePath)) || /^data:image\/png;base64,/.test(String(dataUrl || ''))) {
        // Multipart Upload für lokale PNG-Dateien und im Launcher mitgelieferte Skins
        const fileData = filePath && fs.existsSync(filePath)
          ? fs.readFileSync(filePath)
          : Buffer.from(String(dataUrl).replace(/^data:image\/png;base64,/, ''), 'base64');
        const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');

        let body = `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="variant"\r\n\r\n${variant}\r\n`;
        body += `--${boundary}\r\n`;
        body += `Content-Disposition: form-data; name="file"; filename="skin.png"\r\n`;
        body += `Content-Type: image/png\r\n\r\n`;

        const payload = Buffer.concat([
          Buffer.from(body, 'utf8'),
          fileData,
          Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')
        ]);

        const response = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
          },
          body: payload
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Mojang API (${response.status}): ${errText}`);
        }
      }
    }

    // Account-Einstellungen aktualisieren
    const updatedAccount = {
      ...account,
      skinUrl: `https://crafthead.net/helm/${account.uuid || account.name}?t=${Date.now()}`
    };

    // In Skin-Historie speichern
    let history = settings.skinHistory || [];
    const newEntry = {
      id: 'skin-' + Date.now(),
      name: skinName || 'Skin ' + new Date().toLocaleDateString('de-DE'),
      variant,
      textureUrl: skinUrl || null,
      dataUrl: dataUrl || null,
      date: new Date().toLocaleDateString('de-DE') + ' ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    };
    history = [newEntry, ...history.filter(h => (skinUrl && h.textureUrl === skinUrl) ? false : true)].slice(0, 30);

    saveSettings({ account: updatedAccount, skinHistory: history });
    currentSkinCache.clear();

    return { success: true, account: updatedAccount, history };
  } catch (err) {
    console.error('Skin-Update Fehler:', err);
    return { success: false, error: err.message };
  }
});

// Aktueller Skin des Kontos samt Modell (Classic oder Slim), wie Mojang ihn kennt
const currentSkinCache = new Map();

async function fetchCurrentSkin(account) {
  // 1. Eigenes Profil bei Mojang (mit Anmeldung)
  try {
    const fresh = await ensureFreshAccount(account);
    const token = fresh?.token?.access_token;
    if (token) {
      const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });
      if (res.ok) {
        const profile = await res.json();
        const skin = (profile.skins || []).find(s => s.state === 'ACTIVE') || profile.skins?.[0];
        if (skin) return { success: true, variant: String(skin.variant).toUpperCase() === 'SLIM' ? 'slim' : 'classic', url: skin.url || null };
      }
    }
  } catch (err) {
    console.warn('Aktueller Skin über das Profil nicht lesbar:', err.message);
  }
  // 2. Öffentliche Profildaten (ohne Anmeldung)
  try {
    const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${String(account.uuid).replace(/-/g, '')}`, { signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const profile = await res.json();
      const prop = (profile.properties || []).find(p => p.name === 'textures');
      const textures = prop ? JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8')) : null;
      const skin = textures?.textures?.SKIN;
      if (skin) return { success: true, variant: skin.metadata?.model === 'slim' ? 'slim' : 'classic', url: skin.url || null };
    }
  } catch (err) {
    console.warn('Aktueller Skin über den Session-Server nicht lesbar:', err.message);
  }
  return { success: false };
}

ipcMain.handle('get-current-skin', async () => {
  const account = getSettings().account;
  if (!account || account.type !== 'microsoft' || !account.uuid) return { success: false };
  const cached = currentSkinCache.get(account.uuid);
  if (cached && Date.now() - cached.at < 60000) return cached.value;
  const value = await fetchCurrentSkin(account);
  if (value.success) currentSkinCache.set(account.uuid, { at: Date.now(), value });
  return value;
});

// ─── Eigene Skins (Bibliothek) ─────────────────────────────────────────────
// Die PNG-Dateien liegen im Ordner "custom-skins", in den Einstellungen stehen nur Name und Modell.
const customSkinsDir = () => path.join(app.getPath('userData'), 'custom-skins');
const isCustomSkinId = (id) => /^cs-[a-z0-9]{4,24}$/.test(String(id || ''));
const customSkinFile = (id) => path.join(customSkinsDir(), `${id}.png`);

function toCustomSkinView(entry) {
  const filePath = customSkinFile(entry.id);
  if (!fs.existsSync(filePath)) return null;
  return {
    ...entry,
    filePath,
    dataUrl: `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`
  };
}

function listCustomSkins() {
  return (getSettings().customSkins || []).map(toCustomSkinView).filter(Boolean);
}

function cleanSkinName(name) {
  return String(name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 40);
}

ipcMain.handle('custom-skins-list', () => listCustomSkins());

ipcMain.handle('custom-skin-add', (event, { name, variant, dataUrl } = {}) => {
  try {
    const cleanName = cleanSkinName(name);
    if (!cleanName) throw new Error('Gib dem Skin einen Namen.');
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!match) throw new Error('Das ist keine PNG-Datei.');
    const buffer = Buffer.from(match[1], 'base64');
    const isPng = buffer.length > 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!isPng || buffer.length > 1024 * 1024) throw new Error('Das ist keine gültige Skin-Datei.');
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width !== 64 || (height !== 64 && height !== 32)) throw new Error(`Ein Skin muss 64×64 Pixel groß sein (die Datei hat ${width}×${height}).`);

    const id = `cs-${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;
    fs.mkdirSync(customSkinsDir(), { recursive: true });
    fs.writeFileSync(customSkinFile(id), buffer);
    const entry = { id, name: cleanName, variant: variant === 'slim' ? 'slim' : 'classic', createdAt: new Date().toISOString() };
    saveSettings({ customSkins: [entry, ...(getSettings().customSkins || [])] });
    return { success: true, skin: toCustomSkinView(entry), skins: listCustomSkins() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('custom-skin-update', (event, { id, name, variant } = {}) => {
  try {
    if (!isCustomSkinId(id)) throw new Error('Ungültiger Skin.');
    const skins = getSettings().customSkins || [];
    if (!skins.some(s => s.id === id)) throw new Error('Skin nicht gefunden.');
    let cleanName = null;
    if (name !== undefined) {
      cleanName = cleanSkinName(name);
      if (!cleanName) throw new Error('Gib dem Skin einen Namen.');
    }
    saveSettings({
      customSkins: skins.map(s => (s.id === id
        ? { ...s, ...(cleanName ? { name: cleanName } : {}), ...(variant ? { variant: variant === 'slim' ? 'slim' : 'classic' } : {}) }
        : s))
    });
    return { success: true, skins: listCustomSkins() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('custom-skin-delete', (event, id) => {
  try {
    if (!isCustomSkinId(id)) throw new Error('Ungültiger Skin.');
    saveSettings({ customSkins: (getSettings().customSkins || []).filter(s => s.id !== id) });
    fs.rmSync(customSkinFile(id), { force: true });
    return { success: true, skins: listCustomSkins() };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-skin-history', () => {
  const settings = getSettings();
  return settings.skinHistory || [];
});

ipcMain.handle('delete-skin-history-item', (event, id) => {
  const settings = getSettings();
  const history = (settings.skinHistory || []).filter(h => h.id !== id);
  saveSettings({ skinHistory: history });
  return history;
});

ipcMain.handle('select-skin-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Minecraft Skin (.png) auswählen',
    filters: [{ name: 'Minecraft Skin (*.png)', extensions: ['png'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const fileBuffer = fs.readFileSync(filePath);
  const dataUrl = `data:image/png;base64,${fileBuffer.toString('base64')}`;
  return { filePath, dataUrl };
});

// ─── Game & Directories ─────────────────────────────────────────────────────
ipcMain.handle('get-game-dir', () => getEditInstanceDir());

ipcMain.handle('open-game-dir', async (event, subDir = '') => {
  const instanceDir = getEditInstanceDir();
  const target = subDir ? path.join(instanceDir, subDir) : instanceDir;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  await shell.openPath(target);
});

// Ordner der Testinstanz (Entwurf lokal testen). Er liegt unter dem Spielverzeichnis, nicht im Ordner eines Servers.
ipcMain.handle('open-test-instance-dir', async () => {
  const target = path.join(gameDir, testInstanceSubDir);
  fs.mkdirSync(target, { recursive: true });
  const error = await shell.openPath(target);
  return error ? { success: false, error } : { success: true, path: target };
});

// ─── Local Config Files (Spieler Config-Editor) ──────────────────────────────
// target 'test': der Ordner der Testinstanz, in dem die Mods des Entwurfs laufen (Server-Admin).
// Sonst der Ordner des Spielers, also der aktive Server oder eine eigene Instanz.
function getConfigBaseDir(target) {
  return target === 'test' ? path.join(gameDir, testInstanceSubDir) : getEditInstanceDir();
}

function safeResolveLocalConfigPath(relPath, target) {
  if (!relPath || typeof relPath !== 'string') throw new Error('Ungültiger Pfad');
  const cleanRel = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleanRel.includes('..')) throw new Error('Ungültiger Pfad (Traversal)');
  const baseDir = getConfigBaseDir(target);
  const resolved = path.resolve(baseDir, cleanRel);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error('Zugriff verweigert: Pfad liegt außerhalb des Spielverzeichnisses');
  }
  return resolved;
}

ipcMain.handle('local-config-list', async (event, target) => {
  try {
    const baseDir = getConfigBaseDir(target);
    const configDir = path.join(baseDir, 'config');
    const result = [];

    // 1. options.txt im Hauptverzeichnis
    const optionsPath = path.join(baseDir, 'options.txt');
    if (fs.existsSync(optionsPath)) {
      const stat = fs.statSync(optionsPath);
      result.push({
        name: 'options.txt',
        path: 'options.txt',
        size: stat.size,
        modified: stat.mtimeMs,
        category: 'Minecraft Grundeinstellungen'
      });
    }

    // 2. config-Verzeichnis rekursiv scannen
    if (fs.existsSync(configDir)) {
      function scanDir(dir, relPrefix = '', depth = 0) {
        if (depth > 4) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const ent of entries) {
          const fullPath = path.join(dir, ent.name);
          const currentRel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;

          if (ent.isDirectory()) {
            scanDir(fullPath, currentRel, depth + 1);
          } else if (/\.(ya?ml|json|toml|properties|txt|cfg|conf|ini)$/i.test(ent.name)) {
            const stat = fs.statSync(fullPath);
            let category = 'Allgemeine Mod-Configs';
            if (relPrefix) {
              category = relPrefix.split('/')[0];
            }
            result.push({
              name: ent.name,
              path: `config/${currentRel}`,
              size: stat.size,
              modified: stat.mtimeMs,
              category
            });
          }
        }
      }

      scanDir(configDir);
    }

    return { success: true, files: result };
  } catch (err) {
    console.error('Fehler bei local-config-list:', err);
    return { success: false, error: err.message, files: [] };
  }
});

ipcMain.handle('local-config-read', async (event, relPath, target) => {
  try {
    const targetPath = safeResolveLocalConfigPath(relPath, target);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Datei nicht gefunden: ${relPath}`);
    }
    const content = fs.readFileSync(targetPath, 'utf8');
    return { success: true, content, path: relPath };
  } catch (err) {
    console.error(`Fehler beim Lesen von ${relPath}:`, err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('local-config-write', async (event, { path: relPath, content, target }) => {
  try {
    const targetPath = safeResolveLocalConfigPath(relPath, target);
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(targetPath, content, 'utf8');
    return { success: true };
  } catch (err) {
    console.error(`Fehler beim Schreiben von ${relPath}:`, err);
    return { success: false, error: err.message };
  }
});

const itemMetadataCache = new Map();

function getItemMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function extractItemMetadata(filePath, filename, stat, category) {
  const cacheKey = `${filePath}:${stat.mtimeMs}:${stat.size}`;
  if (itemMetadataCache.has(cacheKey)) {
    return itemMetadataCache.get(cacheKey);
  }

  const cleanName = filename.replace(/\.disabled$/, '');
  const meta = { name: null, description: null, version: null, icon: null };

  try {
    if (category === 'mods' && (cleanName.endsWith('.jar') || cleanName.endsWith('.zip'))) {
      const buf = fs.readFileSync(filePath);
      const unzipped = unzipSync(buf, {
        filter: f => f.name === 'fabric.mod.json' || f.name === 'quilt.mod.json' || f.name === 'META-INF/mods.toml'
      });

      const modJsonBytes = unzipped['fabric.mod.json'] || unzipped['quilt.mod.json'];
      if (modJsonBytes) {
        try {
          const jsonText = strFromU8(modJsonBytes).replace(/^﻿/, '').replace(/[\r\n\t]+/g, ' ');
          const data = JSON.parse(jsonText);
          meta.name = data.name || data.id || null;
          meta.description = data.description || null;
          meta.version = data.version || null;

          let iconPath = null;
          if (typeof data.icon === 'string') {
            iconPath = data.icon;
          } else if (data.icon && typeof data.icon === 'object') {
            iconPath = data.icon['128'] || data.icon['64'] || data.icon['32'] || Object.values(data.icon)[0];
          }

          if (iconPath) {
            const cleanIconPath = iconPath.replace(/^(\.\/|\/)/, '');
            const iconZip = unzipSync(buf, {
              filter: f => f.name === cleanIconPath || f.name === iconPath
            });
            const imgBytes = iconZip[cleanIconPath] || iconZip[iconPath];
            if (imgBytes) {
              meta.icon = `data:${getItemMimeType(cleanIconPath)};base64,${Buffer.from(imgBytes).toString('base64')}`;
            }
          }
        } catch {}
      } else if (unzipped['META-INF/mods.toml']) {
        try {
          const tomlText = strFromU8(unzipped['META-INF/mods.toml']);
          const nameMatch = tomlText.match(/displayName\s*=\s*["']([^"']+)["']/i);
          const versionMatch = tomlText.match(/version\s*=\s*["']([^"']+)["']/i);
          const logoMatch = tomlText.match(/logoFile\s*=\s*["']([^"']+)["']/i);
          if (nameMatch) meta.name = nameMatch[1];
          if (versionMatch) meta.version = versionMatch[1];
          if (logoMatch) {
            const logoPath = logoMatch[1].replace(/^(\.\/|\/)/, '');
            const logoZip = unzipSync(buf, { filter: f => f.name === logoPath });
            const logoBytes = logoZip[logoPath];
            if (logoBytes) {
              meta.icon = `data:${getItemMimeType(logoPath)};base64,${Buffer.from(logoBytes).toString('base64')}`;
            }
          }
        } catch {}
      }
    } else if ((category === 'resourcepacks' || category === 'shaderpacks') && (cleanName.endsWith('.zip') || cleanName.endsWith('.jar'))) {
      const buf = fs.readFileSync(filePath);
      const unzipped = unzipSync(buf, {
        filter: f => f.name.toLowerCase() === 'pack.png' || f.name === 'pack.mcmeta'
      });
      const packPng = unzipped['pack.png'] || unzipped['Pack.png'];
      if (packPng) {
        meta.icon = `data:image/png;base64,${Buffer.from(packPng).toString('base64')}`;
      }
      if (unzipped['pack.mcmeta']) {
        try {
          const mcmeta = JSON.parse(strFromU8(unzipped['pack.mcmeta']));
          if (mcmeta.pack?.description) {
            meta.description = typeof mcmeta.pack.description === 'string'
              ? mcmeta.pack.description
              : mcmeta.pack.description.text || null;
          }
        } catch {}
      }
    } else if (category === 'resourcepacks' || category === 'shaderpacks') {
      const folderPackPng = path.join(filePath, 'pack.png');
      if (fs.existsSync(folderPackPng)) {
        try {
          const imgBytes = fs.readFileSync(folderPackPng);
          meta.icon = `data:image/png;base64,${imgBytes.toString('base64')}`;
        } catch {}
      }
    }
  } catch (err) {
    console.warn(`Fehler beim Extrahieren von Metadaten für ${filename}:`, err.message);
  }

  itemMetadataCache.set(cacheKey, meta);
  return meta;
}

ipcMain.handle('get-installed-items', async (event, category = 'mods') => {
  const targetDir = path.join(getEditInstanceDir(), category);
  if (!fs.existsSync(targetDir)) return [];

  const files = fs.readdirSync(targetDir);
  const items = [];
  for (const filename of files) {
    const fullPath = path.join(targetDir, filename);
    const stat = fs.statSync(fullPath);
    const isDir = stat.isDirectory();
    // Bei Resourcepacks und Shaderpacks sind auch entpackte Verzeichnisse gültige Packs
    if (!isDir || category === 'resourcepacks' || category === 'shaderpacks') {
      const meta = extractItemMetadata(fullPath, filename, stat, category);
      items.push({
        filename,
        name: meta.name || null,
        description: meta.description || null,
        version: meta.version || null,
        icon: meta.icon || null,
        size: stat.size,
        modified: stat.mtimeMs,
        enabled: !filename.endsWith('.disabled'),
        isDirectory: isDir
      });
    }
  }
  return items;
});

// Ordnet eine installierte Datei über ihren SHA-1 einem Modrinth-Projekt zu (für die Detailseite)
const installedProjectCache = new Map();

ipcMain.handle('resolve-installed-project', async (event, { category, filename }) => {
  try {
    const fullPath = path.join(getEditInstanceDir(), category, filename);
    if (path.dirname(fullPath) !== path.join(getEditInstanceDir(), category)) {
      return { success: false, error: 'Ungültiger Dateiname' };
    }
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
      return { success: false, error: 'Diese Datei ist ein Ordner und hat keine Modrinth-Seite.' };
    }

    const hash = await getFileSha1(fullPath);
    if (installedProjectCache.has(hash)) return installedProjectCache.get(hash);

    const res = await fetch(`https://api.modrinth.com/v2/version_file/${hash}?algorithm=sha1`, {
      headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (res.status === 404) {
      return { success: false, error: 'Diese Datei ist auf Modrinth nicht bekannt (vermutlich von einer anderen Quelle).' };
    }
    if (!res.ok) return { success: false, error: `Modrinth antwortet mit HTTP ${res.status}.` };

    const version = await res.json();
    const result = { success: true, projectId: version.project_id };
    installedProjectCache.set(hash, result);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Sucht über die Datei-Hashes bei Modrinth, ob es zu installierten Mods, Resourcepacks oder Shadern eine neuere Version gibt
ipcMain.handle('check-item-updates', async (event, { category, gameVersion = '', loader = '' } = {}) => {
  try {
    if (!['mods', 'resourcepacks', 'shaderpacks'].includes(category)) return { success: true, updates: {} };
    const dir = path.join(getEditInstanceDir(), category);
    if (!fs.existsSync(dir)) return { success: true, updates: {} };

    const byHash = new Map();
    for (const filename of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, filename);
      if (fs.statSync(fullPath).isDirectory()) continue;
      const hash = await getFileSha1(fullPath);
      if (hash) byHash.set(hash, filename);
    }
    if (byHash.size === 0) return { success: true, updates: {} };

    const loaders = category === 'mods'
      ? (loader && loader !== 'vanilla' ? [loader] : ['fabric'])
      : (category === 'resourcepacks' ? ['minecraft'] : ['iris', 'optifine', 'canvas', 'vanilla']);
    const hashes = [...byHash.keys()];
    const headers = { 'User-Agent': 'Electron-Minecraft-Launcher/1.0', 'Content-Type': 'application/json' };
    const post = async (endpoint, body) => {
      const res = await fetch(`https://api.modrinth.com/v2/${endpoint}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`Modrinth antwortet mit HTTP ${res.status}.`);
      return res.json();
    };

    const latest = await post('version_files/update', {
      hashes, algorithm: 'sha1', loaders, ...(gameVersion ? { game_versions: [gameVersion] } : {})
    });
    const current = await post('version_files', { hashes, algorithm: 'sha1' });

    const updates = {};
    for (const [hash, filename] of byHash) {
      const next = latest[hash];
      const now = current[hash];
      if (!next || !now || next.id === now.id) continue;
      // Nie auf eine ältere Version "aktualisieren"
      if (new Date(next.date_published) <= new Date(now.date_published)) continue;
      // Wer eine fertige Version nutzt, bekommt keine Beta oder Alpha vorgeschlagen
      if (now.version_type === 'release' && next.version_type !== 'release') continue;
      updates[filename] = { currentVersion: now.version_number || '', latestVersion: next.version_number || '', latestVersionId: next.id, projectId: next.project_id };
    }
    return { success: true, updates };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Ersetzt eine installierte Datei durch die gewählte neue Modrinth-Version
ipcMain.handle('apply-item-update', async (event, { category, filename, versionId } = {}) => {
  try {
    if (!['mods', 'resourcepacks', 'shaderpacks'].includes(category)) throw new Error('Ungültige Kategorie.');
    if (!/^[A-Za-z0-9]{6,16}$/.test(String(versionId || ''))) throw new Error('Ungültige Version.');
    const dir = path.join(getEditInstanceDir(), category);
    const oldPath = path.join(dir, filename);
    if (path.dirname(oldPath) !== dir || !fs.existsSync(oldPath)) throw new Error('Datei nicht gefunden.');

    const res = await fetch(`https://api.modrinth.com/v2/version/${versionId}`, { headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Modrinth antwortet mit HTTP ${res.status}.`);
    const version = await res.json();
    const file = version.files?.find(f => f.primary) || version.files?.[0];
    const safeName = category === 'mods' ? isSafeModFilename(file?.filename) : isSafePackFilename(file?.filename);
    if (!file || !safeName || !isAllowedModUrl(file.url)) throw new Error('Die neue Version hat keine passende Datei.');

    const wasDisabled = filename.endsWith('.disabled');
    const newPath = path.join(dir, file.filename + (wasDisabled ? '.disabled' : ''));
    if (newPath !== oldPath && fs.existsSync(newPath)) throw new Error(`${file.filename} existiert schon im Ordner.`);

    await downloadVerified(file.url, newPath, file.hashes?.sha1);
    if (newPath !== oldPath) fs.rmSync(oldPath, { force: true });

    // Mods, die der Spieler selbst installiert hat, bekommen auch ihren Eintrag aktualisiert
    if (category === 'mods') {
      const baseName = filename.replace(/\.disabled$/, '');
      const state = loadUserModsState();
      if (state.mods.some(mod => mod.filename === baseName)) {
        saveUserModsState({
          ...state,
          mods: state.mods.map(mod => (mod.filename === baseName
            ? { ...mod, filename: file.filename, versionId: version.id, versionNumber: version.version_number, sha1: file.hashes?.sha1, downloadUrl: file.url, size: file.size }
            : mod))
        });
      }
    }
    return { success: true, filename: path.basename(newPath) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('delete-item', async (event, { category, filename }) => {
  try {
    // Spieler-Mods nehmen ihre nicht mehr gebrauchten Abhängigkeiten mit
    if (category === 'mods') {
      const baseName = filename.replace(/\.disabled$/, '');
      const userMod = loadUserModsState().mods.find(mod => mod.filename === baseName);
      if (userMod) return removeUserMod(userMod.projectId);
    }

    const filePath = path.join(getEditInstanceDir(), category, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: 'Datei nicht gefunden' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('toggle-mod', async (event, filename) => {
  try {
    const modsDir = path.join(getEditInstanceDir(), 'mods');
    const oldPath = path.join(modsDir, filename);
    let newFilename = '';
    if (filename.endsWith('.disabled')) {
      newFilename = filename.replace(/\.disabled$/, '');
    } else {
      newFilename = filename + '.disabled';
    }
    const newPath = path.join(modsDir, newFilename);
    fs.renameSync(oldPath, newPath);
    return { success: true, newFilename };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Settings & Manifest ───────────────────────────────────────────────────
// Das GitHub-Token bleibt im Main-Prozess und erreicht den Renderer nie
function toRendererSettings(settings) {
  if (!settings) return settings;
  const { githubConfig, ...rendererSettings } = settings;
  return rendererSettings;
}

ipcMain.handle('get-settings', () => toRendererSettings(getSettings()));

ipcMain.handle('save-settings', (event, newSettings) => {
  const { githubConfig, servers, activeServerId, adminServer, instances, ...allowedSettings } = newSettings || {};
  return toRendererSettings(saveSettings(allowedSettings));
});

// ─── Modpack: Entwurf, Veröffentlichung & Server-Abgleich ──────────────────
const MANIFEST_FILE = 'server-manifest.json';
const GUIDES_FILE = 'guides.json';

function ensureWoverWelcomeDisabled(configDir) {
  try {
    const woverDir = path.join(configDir, 'wover');
    const clientJson = path.join(woverDir, 'client.json');
    if (!fs.existsSync(clientJson)) {
      if (!fs.existsSync(woverDir)) fs.mkdirSync(woverDir, { recursive: true });
      const defaultWover = {
        create_version: '26.302.1',
        internal: { did_present_welcome_screen: true },
        general: {
          check_for_new_versions: false,
          prefere_modrinth: false,
          survives_on_hint: true,
          speech_bubble_scale: 1.0,
          show_relationship_popups: true,
          force_betterx_world_type: true
        },
        loading: { disable_experimental_warning: true },
        modify_version: '26.302.1'
      };
      fs.writeFileSync(clientJson, JSON.stringify(defaultWover, null, 2), 'utf8');
    } else {
      try {
        const parsed = JSON.parse(fs.readFileSync(clientJson, 'utf8'));
        if (!parsed.internal) parsed.internal = {};
        if (!parsed.internal.did_present_welcome_screen) {
          parsed.internal.did_present_welcome_screen = true;
          fs.writeFileSync(clientJson, JSON.stringify(parsed, null, 2), 'utf8');
        }
      } catch (_) {}
    }
  } catch (e) {
    console.warn('Wover Welcome Screen konnte nicht automatisch deaktiviert werden:', e);
  }
}

function collectModpackConfigs(configDir) {
  const configs = {};
  if (!fs.existsSync(configDir)) return configs;

  // Stellt vor dem Einsammeln sicher, dass Wover Welcome Screen in der Quelle deaktiviert ist
  ensureWoverWelcomeDisabled(configDir);

  const ignoredPatterns = [
    /username-cache\.json$/i,
    /usercache\.json$/i,
    /voicechat[\\/].*/i,
    /crash_assistant[\\/].*/i,
    /\.log$/i,
    /\.tmp$/i,
    /\.bak$/i
  ];

  function scan(dir, relPath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
      const normalizedRel = rel.replace(/\\/g, '/');

      if (ignoredPatterns.some(p => p.test(normalizedRel))) continue;

      if (entry.isDirectory()) {
        scan(full, rel);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.json', '.json5', '.jsonc', '.toml', '.properties', '.txt', '.cfg', '.conf', '.yaml', '.yml'].includes(ext)) {
          try {
            const stat = fs.statSync(full);
            if (stat.size <= 1024 * 1024) {
              configs[normalizedRel] = fs.readFileSync(full, 'utf8');
            }
          } catch (e) {
            console.warn('Config konnte nicht gelesen werden:', full, e);
          }
        }
      }
    }
  }

  try {
    scan(configDir);
  } catch (e) {
    console.warn('Fehler beim Scannen der Mod-Configs:', e);
  }

  return configs;
}

function applyModpackConfigs(configs, targetConfigDir, targetGameDir = null) {
  if (!configs || typeof configs !== 'object') return;
  try {
    const gameBase = targetGameDir || path.resolve(targetConfigDir, '..');
    if (!fs.existsSync(targetConfigDir)) {
      fs.mkdirSync(targetConfigDir, { recursive: true });
    }
    for (const [relPath, content] of Object.entries(configs)) {
      if (!relPath || typeof content !== 'string') continue;
      const safeRel = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
      const normalized = safeRel.replace(/\\/g, '/');
      let targetFile;
      if (normalized.startsWith('shaderpacks/') || normalized === 'options.txt' || normalized.startsWith('config/')) {
        targetFile = path.join(gameBase, safeRel);
      } else {
        targetFile = path.join(targetConfigDir, safeRel);
      }
      const parentDir = path.dirname(targetFile);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(targetFile, content, 'utf8');
    }
    ensureWoverWelcomeDisabled(targetConfigDir);
  } catch (e) {
    console.error('Fehler beim Anwenden der Modpack-Configs:', e);
  }
}

function applyDefaultShader(targetGameDir, defaultShaderFilename) {
  if (!defaultShaderFilename) return;
  try {
    const irisConfigPath = path.join(targetGameDir, 'config', 'iris.properties');
    let content = '';
    if (fs.existsSync(irisConfigPath)) {
      content = fs.readFileSync(irisConfigPath, 'utf8');
    }

    const lines = content ? content.split(/\r?\n/) : [];
    let hasEnableShaders = false;
    let hasShaderPack = false;
    const newLines = lines.map(line => {
      if (line.startsWith('enableShaders=')) {
        hasEnableShaders = true;
        return 'enableShaders=true';
      }
      if (line.startsWith('shaderPack=')) {
        hasShaderPack = true;
        return `shaderPack=${defaultShaderFilename}`;
      }
      return line;
    });

    if (!hasEnableShaders) newLines.push('enableShaders=true');
    if (!hasShaderPack) newLines.push(`shaderPack=${defaultShaderFilename}`);

    const configDir = path.dirname(irisConfigPath);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(irisConfigPath, newLines.join('\n') + '\n', 'utf8');
    console.log(`[ShaderSync] Standard-Shader aktiviert: ${defaultShaderFilename}`);
  } catch (err) {
    console.warn('[ShaderSync] Konnte iris.properties nicht aktualisieren:', err.message);
  }
}

function readJsonFile(filePath, fallback = null) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (err) {
    console.warn(`Konnte ${filePath} nicht lesen:`, err.message);
  }
  return fallback;
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getGithubConfig() {
  const server = getActiveServer();
  const stored = getSettings().githubConfig || {};
  return {
    owner: server?.owner || '',
    repo: server?.repo || '',
    branch: server?.branch || 'main',
    token: stored.token || ''
  };
}

// Ohne erreichbare Modliste gibt es nur diese leere, neutrale Liste. Im Programm steckt kein Server.
function getBundledManifest() {
  return {
    schemaVersion: 2,
    serverName: '',
    serverAddress: '',
    gameVersion: '1.21.1',
    loader: 'fabric',
    loaderVersion: '',
    modpackVersion: '0.0.0',
    cleanOldMods: false,
    admins: [],
    mods: []
  };
}

async function fetchManifestFromUrl(url, headers = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0', ...headers },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const manifest = await res.json();
    return isValidManifest(manifest) ? manifest : null;
  } catch (err) {
    return null;
  }
}

function resolveManifestTarget(userInput, fallbackConfig) {
  const trimmed = (userInput || '').trim();
  if (!trimmed) {
    return {
      type: 'github',
      owner: fallbackConfig.owner,
      repo: fallbackConfig.repo,
      branch: fallbackConfig.branch || 'main'
    };
  }

  // 1. Direktlink zu einer Raw-Datei oder beliebiges JSON
  if (/\.json(\?.*)?$/i.test(trimmed)) {
    return { type: 'url', url: trimmed };
  }

  // 2. GitHub-Blob Link: https://github.com/owner/repo/blob/main/server-manifest.json
  const ghBlobMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/i);
  if (ghBlobMatch) {
    return {
      type: 'url',
      url: `https://raw.githubusercontent.com/${ghBlobMatch[1]}/${ghBlobMatch[2]}/${ghBlobMatch[3]}/${ghBlobMatch[4]}`
    };
  }

  // 3. GitHub-Repository URL: https://github.com/owner/repo
  const ghRepoMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git|\/)?$/i);
  if (ghRepoMatch) {
    return {
      type: 'github',
      owner: ghRepoMatch[1],
      repo: ghRepoMatch[2],
      branch: fallbackConfig.branch || 'main'
    };
  }

  // 4. Kurzform: owner/repo
  const shortMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (shortMatch) {
    return {
      type: 'github',
      owner: shortMatch[1],
      repo: shortMatch[2],
      branch: fallbackConfig.branch || 'main'
    };
  }

  // 5. Beliebige sonstige URL
  if (/^https?:\/\//i.test(trimmed)) {
    return { type: 'url', url: trimmed };
  }

  return {
    type: 'github',
    owner: fallbackConfig.owner,
    repo: fallbackConfig.repo,
    branch: fallbackConfig.branch || 'main'
  };
}

// GitHub-API (immer aktuell) → Rohdatei (bis ca. 5 Minuten Cache) → lokaler Cache → mitgelieferte Datei
// Ändert sich die Adresse im Manifest des Repositorys, übernimmt der Spiel-Server sie.
// Nur für Server mit Repository und nur aus einem frisch geladenen Manifest. Liefert die Änderung oder null.
function syncServerAddressFromManifest(manifest) {
  const server = getActiveServer();
  const address = String(manifest?.serverAddress || '').trim();
  if (!server || !server.owner || !server.repo || !address || !isValidServerAddress(address) || address.toLowerCase() === String(server.address).toLowerCase()) return null;
  saveServers(getServers().map(item => (item.id === server.id ? { ...item, address } : item)), getSettings().activeServerId);
  return { serverId: server.id, serverName: server.name, from: server.address, to: address };
}

async function fetchPublishedModpack() {
  const settings = getSettings();
  const { owner, repo, branch } = getGithubConfig();
  const customUrl = (settings.manifestUrl || '').trim();
  const cached = readJsonFile(manifestCachePath());

  let manifest = null;
  let source = null;

  const target = resolveManifestTarget(customUrl, { owner, repo, branch });
  if (target.type === 'url') {
    manifest = await fetchManifestFromUrl(target.url);
    source = manifest && 'custom';
  } else {
    manifest = await fetchManifestFromUrl(
      `https://api.github.com/repos/${target.owner}/${target.repo}/contents/${MANIFEST_FILE}?ref=${encodeURIComponent(target.branch)}`,
      { Accept: 'application/vnd.github.raw+json' }
    );
    source = manifest && 'github';

    if (!manifest) {
      const raw = await fetchManifestFromUrl(`https://raw.githubusercontent.com/${target.owner}/${target.repo}/${target.branch}/${MANIFEST_FILE}`);
      // Die zwischengespeicherte Rohdatei darf eine neuere Liste nicht zurückdrehen
      if (raw && !(isValidManifest(cached) && compareVersions(raw.modpackVersion, cached.modpackVersion) < 0)) {
        manifest = raw;
        source = 'raw';
      }
    }
  }

  if (manifest) {
    try {
      writeJsonFile(manifestCachePath(), manifest);
    } catch (err) {
      console.warn('Manifest-Cache konnte nicht geschrieben werden:', err.message);
    }
    // Im Admin-Kontext gilt der Admin-Server, dort wird nichts am Spiel-Server geändert
    const addressChanged = !adminContext.getStore() && (source === 'github' || source === 'raw')
      ? syncServerAddressFromManifest(manifest)
      : null;
    return { manifest, source, addressChanged };
  }

  if (isValidManifest(cached)) return { manifest: cached, source: 'cache' };
  return { manifest: getBundledManifest(), source: 'bundled' };
}

ipcMain.handle('modpack-fetch-published', () => fetchPublishedModpack());
handleAdmin('modpack-fetch-published-admin', () => fetchPublishedModpack());

handleAdmin('modpack-get-draft', () => readJsonFile(modpackDraftPath()));

handleAdmin('modpack-save-draft', (event, draft) => {
  try {
    if (!isValidManifest(draft)) throw new Error('Ungültiger Entwurf');
    writeJsonFile(modpackDraftPath(), draft);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

function getManagedServerFiles() {
  return readJsonFile(modpackServerStatePath(), {}).managedFiles || [];
}

function addManagedServerFiles(filenames) {
  const managedFiles = [...new Set([...getManagedServerFiles(), ...filenames])];
  writeJsonFile(modpackServerStatePath(), { managedFiles });
}

async function listServerMods(serverId, configOverride = null) {
  const res = await bisectRequest({
    endpoint: `/api/client/servers/${serverId}/files/list?directory=mods`,
    configOverride
  });
  if (res.status === 404) return [];
  if (!res.success) throw new Error(res.error || 'Server-Mods konnten nicht geladen werden');
  return (res.data?.data || []).map(item => item.attributes);
}

function isModOnServer(files, mod) {
  const file = files.find(f => f.name === mod.filename);
  return Boolean(file) && (!mod.size || file.size === mod.size);
}

handleAdmin('modpack-apply-server', async (event, { dryRun = false, target = 'draft' } = {}) => {
  try {
    const published = readJsonFile(manifestCachePath()) || getBundledManifest();
    let sourceMods;
    let sourceName;

    if (target === 'published') {
      sourceMods = getManifestMods(published);
      if (!sourceMods || sourceMods.length === 0) {
        throw new Error('Keine veröffentlichten Mods in der Live-Version gefunden.');
      }
      sourceName = `Live-Version v${published.modpackVersion || '0.1.0'}`;
    } else {
      const draft = readJsonFile(modpackDraftPath());
      if (!draft?.mods) throw new Error('Es gibt noch keinen Entwurf.');
      sourceMods = draft.mods.filter(mod => !mod.disabled);
      sourceName = 'Entwurf';
    }

    const serverId = getSettings().bisectConfig?.serverId;
    if (!serverId) throw new Error('Es ist kein BisectHosting-Server verbunden.');

    const invalid = sourceMods.find(mod => !isPinnedMod(mod) || !isSafeModFilename(mod.filename) || !isAllowedModUrl(mod.downloadUrl));
    if (invalid) throw new Error(`${invalid.name || invalid.slug} ist nicht sauber festgeschrieben.`);

    const draft = readJsonFile(modpackDraftPath());
    const draftFiles = (draft?.mods || []).map(mod => mod.filename);
    const managedFiles = [
      ...getManagedServerFiles(),
      ...getManifestMods(published).map(mod => mod.filename).filter(Boolean),
      ...draftFiles
    ];

    const serverFiles = await listServerMods(serverId);
    const plan = planServerSync(sourceMods, serverFiles, managedFiles);
    plan.remove = plan.remove.filter(isSafeModFilename);

    if (dryRun) return { success: true, plan };

    const log = [];
    const addLog = (line) => {
      log.push(line);
      if (mainWindow) mainWindow.webContents.send('modpack-server-log', line);
    };
    const failed = [];

    // Vor dem ersten Upload merken, damit auch ein abgebrochener Lauf verwaltet bleibt
    addManagedServerFiles(managedFiles);

    // Vor dem Aufspielen von Test-Mods automatisches Snapshot-Backup aller Server-Dateien anlegen
    if (target === 'draft') {
      try {
        // Nur sichern, was ersetzt oder gelöscht wird. Unveränderte Mods bleiben auf dem Server, dort ändert sich nichts.
        const affected = new Set([...plan.remove, ...plan.upload.filter(mod => mod.replace).map(mod => mod.filename)]);
        const bState = await backupServerMods(serverId, addLog, affected);
        bState.addedTestFiles = plan.upload.map(mod => mod.filename);
        writeJsonFile(serverTestBackupStatePath(), bState);
      } catch (backupErr) {
        console.warn('Automatisches Server-Backup fehlgeschlagen:', backupErr);
        addLog(`⚠ Server-Backup Hinweis: ${backupErr.message}`);
      }
    }

    // Viele Mods in wenigen Anfragen: erst lokal laden, dann gebündelt hochladen.
    // Das Panel begrenzt Anfragen, ein Paket kostet nur eine Panel-Anfrage statt einer pro Mod.
    const onPanelWait = (seconds) => addLog(`⏳ Das Panel bremst gerade, weiter in ${seconds} s...`);
    // Fortschrittsbalken in der Oberfläche: Herunterladen ist die erste, Hochladen die zweite Hälfte
    const sendProgress = (stage, label, percent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('modpack-server-progress', { stage, label, percent: Math.max(0, Math.min(100, Math.round(percent))) });
      }
    };

    if (plan.upload.length > 0) {
      const replaced = plan.upload.filter(mod => mod.replace).map(mod => mod.filename);
      if (replaced.length > 0) {
        const del = await deleteServerMods(serverId, replaced, onPanelWait);
        if (!del.success) {
          addLog(`✖ Alte Dateien konnten nicht ersetzt werden (${del.error})`);
          replaced.forEach(name => failed.push(name));
          plan.upload = plan.upload.filter(mod => !mod.replace);
        }
      }
    }

    if (plan.upload.length > 0) {
      const cacheDir = path.join(app.getPath('userData'), 'server-upload-cache');
      fs.mkdirSync(cacheDir, { recursive: true });

      addLog(`⬇ Lade ${plan.upload.length} Mod(s) lokal herunter...`);
      const ready = [];
      let nextIndex = 0;
      let doneCount = 0;
      const worker = async () => {
        while (nextIndex < plan.upload.length) {
          const mod = plan.upload[nextIndex++];
          const localPath = path.join(cacheDir, mod.filename);
          try {
            const cachedOk = fs.existsSync(localPath) && (!mod.sha1 || (await getFileSha1(localPath))?.toLowerCase() === mod.sha1.toLowerCase());
            if (!cachedOk) await downloadVerified(mod.downloadUrl, localPath, mod.sha1);
            ready.push({ mod, localPath, size: fs.statSync(localPath).size });
          } catch (err) {
            failed.push(mod.filename);
            addLog(`✖ ${mod.filename}: Download fehlgeschlagen (${err.message})`);
          }
          doneCount++;
          sendProgress('download', `Mods werden lokal geladen (${doneCount}/${plan.upload.length})`, (doneCount / plan.upload.length) * 50);
          if (doneCount % 10 === 0 || doneCount === plan.upload.length) addLog(`⬇ ${doneCount}/${plan.upload.length} geladen`);
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));

      // Pakete bilden: höchstens 40 Dateien und etwa 60 MB je Upload
      const MAX_FILES = 40;
      const MAX_BYTES = 60 * 1024 * 1024;
      const packages = [];
      let current = [];
      let currentBytes = 0;
      for (const item of ready) {
        if (current.length > 0 && (current.length >= MAX_FILES || currentBytes + item.size > MAX_BYTES)) {
          packages.push(current);
          current = [];
          currentBytes = 0;
        }
        current.push(item);
        currentBytes += item.size;
      }
      if (current.length > 0) packages.push(current);

      let uploadedCount = 0;
      for (let p = 0; p < packages.length; p++) {
        const pkg = packages[p];
        sendProgress('upload', `Paket ${p + 1}/${packages.length} wird hochgeladen (${uploadedCount}/${ready.length} Mods)`, 50 + (uploadedCount / ready.length) * 50);
        const mb = (pkg.reduce((sum, item) => sum + item.size, 0) / (1024 * 1024)).toFixed(1);
        addLog(`⬆ Paket ${p + 1}/${packages.length} (${pkg.length} Mod(s), ${mb} MB) wird hochgeladen...`);

        let uploaded = false;
        let lastError = '';
        for (let attempt = 1; attempt <= 2 && !uploaded; attempt++) {
          try {
            const files = pkg.map(item => ({ name: item.mod.filename, data: fs.readFileSync(item.localPath) }));
            const res = await uploadFilesToBisect(files, serverId, 'mods', null, onPanelWait);
            if (!res.success) throw new Error(res.error);
            uploaded = true;
          } catch (err) {
            lastError = err.message;
            if (attempt < 2) addLog(`⚠ Paket ${p + 1} wird nochmal versucht (${err.message})`);
          }
        }

        if (!uploaded) {
          pkg.forEach(item => {
            failed.push(item.mod.filename);
            addLog(`✖ ${item.mod.filename}: ${lastError}`);
          });
          continue;
        }

        // Prüfen, was wirklich auf dem Server angekommen ist
        const onServer = await listServerMods(serverId);
        for (const item of pkg) {
          if (isModOnServer(onServer, item.mod)) {
            addLog(`✔ ${item.mod.filename} ist auf dem Server`);
            fs.rmSync(item.localPath, { force: true });
            uploadedCount++;
          } else {
            failed.push(item.mod.filename);
            addLog(`✖ ${item.mod.filename}: Datei ist nach dem Upload nicht vollständig auf dem Server`);
          }
        }
        sendProgress('upload', `Paket ${p + 1}/${packages.length} fertig (${uploadedCount}/${ready.length} Mods)`, 50 + (uploadedCount / ready.length) * 50);
      }
    }

    if (plan.remove.length > 0) {
      const removed = await deleteServerMods(serverId, plan.remove, onPanelWait);
      if (removed.success) {
        plan.remove.forEach(filename => addLog(`🗑 ${filename} gelöscht`));
      } else {
        plan.remove.forEach(filename => failed.push(filename));
        addLog(`✖ Löschen fehlgeschlagen: ${removed.error}`);
      }
    }

    if (plan.upload.length === 0 && plan.remove.length === 0) {
      addLog(`Der Server entspricht bereits ${target === 'published' ? 'der Live-Version' : 'dem Entwurf'}.`);
    }

    return {
      success: failed.length === 0,
      log,
      failed,
      changed: plan.upload.length + plan.remove.length - failed.length,
      error: failed.length > 0 ? `${failed.length} Datei(en) sind fehlgeschlagen.` : undefined
    };
  } catch (err) {
    console.error('Server-Abgleich fehlgeschlagen:', err);
    return { success: false, error: err.message, log: [] };
  }
});

function deleteServerMods(serverId, filenames, onWait = null) {
  return bisectRequest({
    method: 'POST',
    endpoint: `/api/client/servers/${serverId}/files/delete`,
    body: { root: 'mods', files: filenames },
    onWait
  });
}

function deleteServerMod(serverId, filename) {
  return bisectRequest({
    method: 'POST',
    endpoint: `/api/client/servers/${serverId}/files/delete`,
    body: { root: 'mods', files: [filename] }
  });
}

// ─── Server Mod Backup & Snapshot System ──────────────────────────────
async function downloadServerFile(serverId, remotePath) {
  const cleanPath = remotePath.startsWith('/') ? remotePath : `/${remotePath}`;
  let res = await bisectRequest({
    method: 'GET',
    endpoint: `/api/client/servers/${serverId}/files/download?file=${encodeURIComponent(cleanPath)}`
  });
  if (!res.success || !res.data?.attributes?.url) {
    res = await bisectRequest({
      method: 'GET',
      endpoint: `/api/client/servers/${serverId}/files/download?file=${encodeURIComponent(cleanPath.replace(/^\/+/, ''))}`
    });
  }
  if (!res.success || !res.data?.attributes?.url) {
    throw new Error(res.error || `Download-URL für ${remotePath} konnte nicht abgerufen werden`);
  }
  const downloadUrl = res.data.attributes.url;
  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) {
    throw new Error(`Download von ${remotePath} fehlgeschlagen (HTTP ${fileRes.status})`);
  }
  return Buffer.from(await fileRes.arrayBuffer());
}

// onlyNames: nur diese Mods wirklich herunterladen (die, die ersetzt oder gelöscht werden). Alle anderen bleiben
// unangetastet und stehen nur in der Liste, damit die Wiederherstellung weiß, was zum Stand gehört.
async function backupServerMods(serverId, addLog = () => {}, onlyNames = null) {
  const backupDir = path.join(serverBackupsDir(), serverId, 'snapshot');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  addLog(onlyNames
    ? `📦 Sichere die ${onlyNames.size} Mod(s), die ersetzt oder entfernt werden...`
    : '📦 Erstelle lokales Backup aller aktuellen Mod-Dateien im Server /mods-Ordner...');
  const serverFiles = await listServerMods(serverId);
  const jarFiles = serverFiles.filter(f => f.name && f.name.endsWith('.jar'));

  const savedFiles = [];
  for (const file of jarFiles) {
    if (onlyNames && !onlyNames.has(file.name)) {
      savedFiles.push({ name: file.name, size: file.size });
      continue;
    }
    const localFilePath = path.join(backupDir, file.name);
    let needDownload = true;
    if (fs.existsSync(localFilePath)) {
      try {
        const stats = fs.statSync(localFilePath);
        if (stats.size === file.size) {
          needDownload = false;
        }
      } catch (_e) {}
    }

    if (needDownload) {
      addLog(`⬇ Sichere ${file.name}...`);
      try {
        const buffer = await downloadServerFile(serverId, `/mods/${file.name}`);
        fs.writeFileSync(localFilePath, buffer);
      } catch (err) {
        console.warn(`Backup von ${file.name} fehlgeschlagen:`, err.message);
        addLog(`⚠ ${file.name} konnte nicht heruntergeladen werden: ${err.message}`);
      }
    } else {
      addLog(`✔ ${file.name} (bereits lokal gesichert)`);
    }

    savedFiles.push({ name: file.name, size: file.size });
  }

  const state = {
    active: true,
    timestamp: new Date().toISOString(),
    serverId,
    savedFiles,
    backupDir,
    addedTestFiles: []
  };
  writeJsonFile(serverTestBackupStatePath(), state);
  addLog(onlyNames
    ? `✅ Backup erfolgreich: ${onlyNames.size} betroffene Mod(s) gesichert, ${savedFiles.length} Mod(s) auf dem Server insgesamt.`
    : `✅ Backup erfolgreich: ${savedFiles.length} Mod(s) lokal gesichert.`);
  return state;
}

handleAdmin('modpack-get-server-backup-info', () => {
  const state = readJsonFile(serverTestBackupStatePath(), null);
  if (state && state.active) {
    return {
      active: true,
      timestamp: state.timestamp,
      count: (state.savedFiles || []).length,
      files: state.savedFiles || [],
      addedTestFiles: state.addedTestFiles || []
    };
  }
  return { active: false };
});

handleAdmin('modpack-restore-server-backup', async () => {
  try {
    const state = readJsonFile(serverTestBackupStatePath(), null);
    if (!state || !state.active || !state.serverId) {
      throw new Error('Kein aktiver Server-Teststand vorhanden.');
    }

    const serverId = state.serverId;
    const backupDir = state.backupDir;
    const log = [];
    const addLog = (line) => {
      log.push(line);
      if (mainWindow) mainWindow.webContents.send('modpack-server-log', line);
    };

    addLog('↺ Stelle vorheriges Server-Backup wieder her...');
    const currentFiles = await listServerMods(serverId);
    const currentByName = new Map(currentFiles.map(f => [f.name, f]));
    const savedByName = new Map((state.savedFiles || []).map(f => [f.name, f]));

    // 1. Alle Dateien löschen, die NICHT im gesicherten Backup waren (Test-Mods)
    let removedCount = 0;
    for (const file of currentFiles) {
      if (file.name.endsWith('.jar') && !savedByName.has(file.name)) {
        addLog(`🗑 Entferne Test-Mod ${file.name}...`);
        const delRes = await deleteServerMod(serverId, file.name);
        if (delRes.success) {
          removedCount++;
        } else {
          addLog(`✖ Fehler beim Löschen von ${file.name}: ${delRes.error}`);
        }
      }
    }

    // 2. Alle Dateien wiederherstellen, die im Backup waren, aber auf dem Server fehlen oder verändert wurden
    let restoredCount = 0;
    for (const saved of (state.savedFiles || [])) {
      const existing = currentByName.get(saved.name);
      if (!existing || existing.size !== saved.size) {
        const localPath = path.join(backupDir, saved.name);
        if (fs.existsSync(localPath)) {
          addLog(`⬆ Lade Original-Mod ${saved.name} hoch...`);
          const buffer = fs.readFileSync(localPath);
          const uploadRes = await uploadBufferToBisect(buffer, saved.name, serverId, 'mods');
          if (uploadRes.success) {
            restoredCount++;
          } else {
            addLog(`✖ Fehler beim Hochladen von ${saved.name}: ${uploadRes.error}`);
          }
        }
      }
    }

    // Test-Status als wiederhergestellt markieren
    writeJsonFile(serverTestBackupStatePath(), { active: false, lastRestored: new Date().toISOString() });
    addLog(`✅ Server erfolgreich wiederhergestellt! (${removedCount} Test-Mods entfernt, ${restoredCount} Original-Dateien wiederhergestellt)`);

    return {
      success: true,
      removedCount,
      restoredCount,
      log
    };
  } catch (err) {
    console.error('Wiederherstellung fehlgeschlagen:', err);
    return { success: false, error: err.message };
  }
});

async function githubRequest(endpoint, { method = 'GET', body = null } = {}) {
  const { token } = getGithubConfig();
  const res = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Electron-Minecraft-Launcher/1.0',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

function describeGithubError(res, { owner, repo, branch }) {
  if (res.status === 401) return 'Das GitHub-Token ist ungültig oder abgelaufen.';
  if (res.status === 403) return 'Das GitHub-Token darf dieses Repo nicht ändern (benötigt: Contents Read and write).';
  if (res.status === 404) return `Repo ${owner}/${repo} oder Branch „${branch}“ wurde nicht gefunden.`;
  if (res.status === 409) return 'Die Datei wurde gerade auf GitHub geändert. Bitte versuche es erneut.';
  return res.data?.message || `GitHub antwortet mit HTTP ${res.status}.`;
}

handleAdmin('github-get-config', () => {
  const { token, ...config } = getGithubConfig();
  return { ...config, hasToken: Boolean(token) };
});

// Ohne Token-Feld bleibt das gespeicherte Token erhalten
handleAdmin('github-save-config', (event, { owner, repo, branch, token }) => {
  const current = getGithubConfig();
  const githubConfig = {
    owner: (owner || current.owner).trim(),
    repo: (repo || current.repo).trim(),
    branch: (branch || current.branch).trim(),
    token: token === undefined ? current.token : token.trim()
  };
  // Das Token gilt für alle Server, Repository und Branch gehören zum Admin-Server
  const admin = storedAdminServer();
  const repoChanged = githubConfig.owner !== admin.owner || githubConfig.repo !== admin.repo || githubConfig.branch !== admin.branch;
  saveSettings({
    githubConfig: { token: githubConfig.token },
    ...(repoChanged ? { adminServer: { ...admin, owner: githubConfig.owner, repo: githubConfig.repo, branch: githubConfig.branch } } : {})
  });
  if (repoChanged) notifyServersChanged();
  const { token: savedToken, ...config } = githubConfig;
  return { ...config, hasToken: Boolean(savedToken) };
});

// Ein leeres Repository hat noch keinen Branch. GitHub antwortet auf die Commit-Liste dann mit 409.
async function isGithubRepoEmpty(config) {
  const res = await githubRequest(`/repos/${config.owner}/${config.repo}/commits?per_page=1`);
  return res.status === 409;
}

handleAdmin('github-test-connection', async () => {
  const config = getGithubConfig();
  if (!config.token) return { success: false, error: 'Es ist noch kein GitHub-Token hinterlegt.' };
  try {
    const res = await githubRequest(`/repos/${config.owner}/${config.repo}/branches/${encodeURIComponent(config.branch)}`);
    if (res.ok) return { success: true };

    // Repo ist da, aber leer: Der Branch entsteht mit der ersten Veröffentlichung
    if (res.status === 404) {
      const repoRes = await githubRequest(`/repos/${config.owner}/${config.repo}`);
      if (repoRes.ok && repoRes.data?.permissions?.push === false) {
        return { success: false, error: 'Das GitHub-Token darf in dieses Repo nicht schreiben (benötigt: Contents Read and write).' };
      }
      if (repoRes.ok && await isGithubRepoEmpty(config)) {
        return { success: true, note: 'Das Repository ist noch leer. Der Branch wird bei der ersten Veröffentlichung angelegt.' };
      }
    }
    return { success: false, error: describeGithubError(res, config) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

handleAdmin('modpack-get-available-configs', async () => {
  try {
    const candidateBases = [
      path.join(gameDir, testInstanceSubDir),
      getInstanceDir(),
      path.join(process.cwd(), 'instances', 'modpack-test'),
      process.cwd()
    ];

    let baseDir = null;
    for (const b of candidateBases) {
      if (fs.existsSync(b)) {
        baseDir = b;
        break;
      }
    }

    if (!baseDir) {
      console.log('[Config-Sync] Kein Spielverzeichnis gefunden unter:', candidateBases);
      return { success: true, configs: [] };
    }

    const targetConfigDir = path.join(baseDir, 'config');
    if (fs.existsSync(targetConfigDir)) {
      ensureWoverWelcomeDisabled(targetConfigDir);
    }

    const list = [];
    const ignoredPatterns = [
      /username-cache/i,
      /usercache/i,
      /voicechat/i,
      /crash_assistant/i,
      /\.log$/i,
      /\.tmp$/i,
      /\.bak$/i
    ];

    // 1. Scanne config/ Ordner
    if (fs.existsSync(targetConfigDir)) {
      function scan(dir, relPath = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          const rel = relPath ? `${relPath}/${entry.name}` : entry.name;
          const normalizedRel = rel.replace(/\\/g, '/');

          if (ignoredPatterns.some(p => p.test(normalizedRel))) continue;

          if (entry.isDirectory()) {
            scan(full, rel);
          } else if (/\.(json|json5|jsonc|toml|yaml|yml|cfg|txt|properties)$/i.test(entry.name)) {
            const stat = fs.statSync(full);
            const isShaderConfig = /iris\.properties/i.test(entry.name);
            const isPersonal = /options\.txt|sodium-options/i.test(entry.name) && !isShaderConfig;
            const isRecommended = /wover[\/\\]client\.json/i.test(normalizedRel) || isShaderConfig;

            list.push({
              relPath: normalizedRel,
              name: entry.name,
              folder: relPath ? relPath.replace(/\\/g, '/') : 'config',
              size: stat.size,
              isPersonal,
              isRecommended,
              category: isShaderConfig ? 'shader' : 'config'
            });
          }
        }
      }
      scan(targetConfigDir);
    }

    // 2. Scanne shaderpacks/ Ordner nach Shader-Optionen (*.txt)
    const shaderDir = path.join(baseDir, 'shaderpacks');
    if (fs.existsSync(shaderDir)) {
      try {
        const entries = fs.readdirSync(shaderDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.txt')) {
            const full = path.join(shaderDir, entry.name);
            const stat = fs.statSync(full);
            list.push({
              relPath: `shaderpacks/${entry.name}`,
              name: entry.name,
              folder: 'shaderpacks',
              size: stat.size,
              isPersonal: false,
              isRecommended: true,
              category: 'shader'
            });
          }
        }
      } catch (_) {}
    }

    // 3. options.txt im Basisverzeichnis (falls vorhanden)
    const optionsTxtPath = path.join(baseDir, 'options.txt');
    if (fs.existsSync(optionsTxtPath)) {
      try {
        const stat = fs.statSync(optionsTxtPath);
        list.push({
          relPath: 'options.txt',
          name: 'options.txt',
          folder: 'Minecraft',
          size: stat.size,
          isPersonal: true,
          isRecommended: false,
          category: 'options'
        });
      } catch (_) {}
    }

    list.sort((a, b) => {
      if (a.isRecommended && !b.isRecommended) return -1;
      if (!a.isRecommended && b.isRecommended) return 1;
      return a.relPath.localeCompare(b.relPath);
    });

    console.log(`[Config-Sync] Gefunden: ${list.length} Dateien in ${baseDir}`);
    return { success: true, configs: list };
  } catch (err) {
    console.error('Fehler beim Abrufen der Modpack-Configs:', err);
    return { success: false, error: err.message, configs: [] };
  }
});

handleAdmin('modpack-publish', async (event, { bumpType = 'patch', customVersion = '', changelog = '', title = '', selectedConfigFiles = null } = {}) => {
  const config = getGithubConfig();
  try {
    if (!config.token) throw new Error('Es ist noch kein GitHub-Token hinterlegt.');

    const draft = readJsonFile(modpackDraftPath());
    if (!draft?.mods?.length) throw new Error('Der Entwurf enthält keine Mods.');
    const activeMods = draft.mods.filter(mod => !mod.disabled);
    if (!activeMods.length) throw new Error('Der Entwurf enthält keine aktiven Mods zum Veröffentlichen.');
    const invalid = activeMods.find(mod => !isPinnedMod(mod) || !isSafeModFilename(mod.filename) || !isAllowedModUrl(mod.downloadUrl));
    if (invalid) throw new Error(`${invalid.name || invalid.slug} ist nicht sauber festgeschrieben.`);

    const endpoint = `/repos/${config.owner}/${config.repo}/contents/${MANIFEST_FILE}`;
    const current = await githubRequest(`${endpoint}?ref=${encodeURIComponent(config.branch)}`);
    if (!current.ok && current.status !== 404) {
      throw new Error(describeGithubError(current, config));
    }

    const remote = current.ok
      ? JSON.parse(Buffer.from(current.data.content, 'base64').toString('utf8'))
      : getBundledManifest();
    const remoteVersion = remote?.modpackVersion || INITIAL_MODPACK_VERSION;
    const baseVersion = draft.baseVersion || INITIAL_MODPACK_VERSION;

    if (compareVersions(remoteVersion, baseVersion) !== 0) {
      throw new Error(`Auf GitHub liegt v${remoteVersion}, dein Entwurf basiert auf v${baseVersion}. Setze den Entwurf zurück, damit nichts überschrieben wird.`);
    }

    let nextVersion;
    if (bumpType === 'custom') {
      if (!isValidCustomVersion(customVersion, remoteVersion)) {
        throw new Error(`Die Versionsnummer muss das Format 1.2.3 haben und höher als v${remoteVersion} sein.`);
      }
      nextVersion = String(customVersion).trim();
    } else {
      nextVersion = bumpVersion(remoteVersion, bumpType);
    }
    const history = Array.isArray(remote?.changelogHistory) ? [...remote.changelogHistory] : [];
    const cleanChangelog = String(changelog || '').trim();

    // Ermittelt automatisch die genauen Mod-Änderungen für die Changelog-Historie
    const remoteModsList = remote?.mods || remote?.requiredMods || [];
    const remoteModsMap = new Map(remoteModsList.map(m => [m.slug, m]));
    const activeModsMap = new Map(activeMods.map(m => [m.slug, m]));

    const modChangesAdded = activeMods
      .filter(m => !remoteModsMap.has(m.slug))
      .map(m => ({ name: m.name || m.slug, version: m.versionNumber || '' }));

    const modChangesRemoved = remoteModsList
      .filter(m => !activeModsMap.has(m.slug))
      .map(m => ({ name: m.name || m.slug }));

    const modChangesUpdated = activeMods
      .filter(m => remoteModsMap.has(m.slug))
      .filter(m => remoteModsMap.get(m.slug).versionId !== m.versionId || remoteModsMap.get(m.slug).versionNumber !== m.versionNumber)
      .map(m => ({
        name: m.name || m.slug,
        fromVersion: remoteModsMap.get(m.slug).versionNumber || '',
        toVersion: m.versionNumber || ''
      }));

    // Ressourcen- und Shaderpakete landen in denselben Listen, mit dem Typ als Zusatz
    const packChanges = { added: [], updated: [], removed: [] };
    for (const [key, kind] of [['resourcepacks', 'Ressourcenpaket'], ['shaderpacks', 'Shader']]) {
      const before = new Map((Array.isArray(remote?.[key]) ? remote[key] : []).map(p => [p.slug, p]));
      const after = (draft[key] || []).filter(p => !p.disabled);
      const afterMap = new Map(after.map(p => [p.slug, p]));
      after.filter(p => !before.has(p.slug)).forEach(p => packChanges.added.push({ name: p.name || p.slug, version: p.versionNumber || '', kind }));
      after.filter(p => before.has(p.slug) && before.get(p.slug).versionId !== p.versionId)
        .forEach(p => packChanges.updated.push({ name: p.name || p.slug, fromVersion: before.get(p.slug).versionNumber || '', toVersion: p.versionNumber || '', kind }));
      [...before.values()].filter(p => !afterMap.has(p.slug)).forEach(p => packChanges.removed.push({ name: p.name || p.slug, kind }));
    }

    const newEntry = {
      version: nextVersion,
      date: new Date().toLocaleDateString('de-DE'),
      title: title ? String(title).trim() : `Server-Update v${nextVersion}`,
      changelog: cleanChangelog,
      publishedAt: new Date().toISOString(),
      modChanges: {
        added: [...modChangesAdded, ...packChanges.added],
        updated: [...modChangesUpdated, ...packChanges.updated],
        removed: [...modChangesRemoved, ...packChanges.removed]
      }
    };
    const existIdx = history.findIndex(h => h.version === nextVersion);
    if (existIdx >= 0) {
      history[existIdx] = { ...history[existIdx], ...newEntry };
    } else {
      history.unshift(newEntry);
    }

    // Gezielte Config-Dateien einsammeln: NUR was der Admin explizit ausgewählt hat!
    const candidateBases = [
      path.join(gameDir, testInstanceSubDir),
      getInstanceDir(),
      path.join(process.cwd(), 'instances', 'modpack-test'),
      process.cwd()
    ];
    let baseDir = null;
    for (const d of candidateBases) {
      if (fs.existsSync(d)) {
        baseDir = d;
        break;
      }
    }
    const targetConfigDir = baseDir ? path.join(baseDir, 'config') : null;
    const collectedConfigs = {};

    if (Array.isArray(selectedConfigFiles) && baseDir) {
      for (const rel of selectedConfigFiles) {
        if (!rel || typeof rel !== 'string') continue;
        const safeRel = path.normalize(rel).replace(/^(\.\.[\/\\])+/, '');
        const normalized = safeRel.replace(/\\/g, '/');
        let fullPath;
        if (normalized.startsWith('shaderpacks/') || normalized === 'options.txt' || normalized.startsWith('config/')) {
          fullPath = path.join(baseDir, safeRel);
        } else {
          fullPath = path.join(baseDir, 'config', safeRel);
        }
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          try {
            collectedConfigs[normalized] = fs.readFileSync(fullPath, 'utf8');
          } catch (e) {
            console.warn(`Config ${safeRel} konnte nicht gelesen werden:`, e);
          }
        }
      }
    } else if (selectedConfigFiles === null && targetConfigDir && fs.existsSync(targetConfigDir)) {
      // Wenn der Parameter gar nicht übergeben wurde: NUR Wover Welcome Screen absichern, sonst nichts
      const woverPath = path.join(targetConfigDir, 'wover', 'client.json');
      if (fs.existsSync(woverPath)) {
        try {
          collectedConfigs['wover/client.json'] = fs.readFileSync(woverPath, 'utf8');
        } catch (_) {}
      }
    }

    const manifest = {
      schemaVersion: 2,
      serverName: remote?.serverName ?? draft.serverName,
      ...(remote?.serverDescription ? { serverDescription: remote.serverDescription } : {}),
      ...(remote?.serverMapUrl ? { serverMapUrl: remote.serverMapUrl } : {}),
      ...(remote?.serverBanner ? { serverBanner: remote.serverBanner, serverBannerVersion: remote.serverBannerVersion || '' } : {}),
      serverAddress: getAdminServer().address || remote?.serverAddress || draft.serverAddress || '',
      gameVersion: draft.gameVersion,
      loader: draft.loader,
      loaderVersion: draft.loaderVersion,
      modpackVersion: nextVersion,
      publishedAt: new Date().toISOString(),
      changelog: cleanChangelog,
      changelogHistory: history,
      admins: remote?.admins || [],
      cleanOldMods: draft.cleanOldMods !== false,
      configs: collectedConfigs,
      mods: activeMods,
      resourcepacks: (draft.resourcepacks || []).filter(r => !r.disabled),
      shaderpacks: (draft.shaderpacks || []).filter(s => !s.disabled),
      defaultShader: draft.defaultShader || null
    };
    const content = JSON.stringify(manifest, null, 2) + '\n';

    // In einem leeren Repository gibt es den Branch noch nicht, dann legt GitHub den Standard-Branch selbst an
    const repoIsEmpty = !current.ok && current.status === 404 && await isGithubRepoEmpty(config);
    const put = await githubRequest(endpoint, {
      method: 'PUT',
      body: {
        message: `modpack: v${nextVersion}`,
        content: Buffer.from(content, 'utf8').toString('base64'),
        ...(repoIsEmpty ? {} : { branch: config.branch }),
        ...(current.ok ? { sha: current.data.sha } : {})
      }
    });
    if (!put.ok) throw new Error(describeGithubError(put, config));

    // Ab hier ist die Liste veröffentlicht, lokale Fehler dürfen das nicht mehr als Fehlschlag melden
    const updatedDraft = { ...draft, baseVersion: nextVersion };
    try {
      writeJsonFile(manifestCachePath(), manifest);
      writeJsonFile(modpackDraftPath(), updatedDraft);
      // Entfernte Mods müssen beim nächsten Server-Abgleich noch als verwaltet gelten
      addManagedServerFiles(
        [...getManifestMods(remote), ...draft.mods].map(mod => mod.filename).filter(isSafeModFilename)
      );
    } catch (err) {
      console.warn('Lokale Manifest-Dateien konnten nicht aktualisiert werden:', err.message);
    }
    // Nach Veröffentlichung ist der Test-Zustand offiziell übernommen, auch wenn oben etwas schiefging
    try {
      writeJsonFile(serverTestBackupStatePath(), { active: false, publishedAt: new Date().toISOString() });
    } catch (_e) {}

    return { success: true, manifest, draft: updatedDraft, version: nextVersion };
  } catch (err) {
    console.error('Veröffentlichen fehlgeschlagen:', err);
    return { success: false, error: err.message };
  }
});

// ─── Darstellung des Servers (Name, Beschreibung, Banner) auf GitHub ──────
const PRESENTATION_BANNER_FILE = 'server-banner.png';

async function githubPutRepoFile(config, filePath, buffer, message) {
  const endpoint = `/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const current = await githubRequest(`${endpoint}?ref=${encodeURIComponent(config.branch)}`);
  if (!current.ok && current.status !== 404) throw new Error(describeGithubError(current, config));
  const repoIsEmpty = !current.ok && await isGithubRepoEmpty(config);
  const put = await githubRequest(endpoint, {
    method: 'PUT',
    body: {
      message,
      content: buffer.toString('base64'),
      ...(repoIsEmpty ? {} : { branch: config.branch }),
      ...(current.ok ? { sha: current.data.sha } : {})
    }
  });
  if (!put.ok) throw new Error(describeGithubError(put, config));
}

async function githubDeleteRepoFile(config, filePath, message) {
  const endpoint = `/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const current = await githubRequest(`${endpoint}?ref=${encodeURIComponent(config.branch)}`);
  if (current.status === 404) return;
  if (!current.ok) throw new Error(describeGithubError(current, config));
  const del = await githubRequest(endpoint, { method: 'DELETE', body: { message, sha: current.data.sha, branch: config.branch } });
  if (!del.ok) throw new Error(describeGithubError(del, config));
}

function cleanPresentationText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// bannerAction: 'keep' | 'set' | 'remove'. Name und Beschreibung leer = nicht gesetzt (dann gilt die Serverdatei).
// Fabric-Version direkt im Manifest ändern, ohne neue Modpack-Version und ohne Changelog.
// Die Minecraft-Version bleibt dabei gleich: ein Wechsel braucht neue Mods und geht nur mit dem Modpack.
handleAdmin('modpack-update-version', async (event, { gameVersion = '', loaderVersion = '' } = {}) => {
  const config = getGithubConfig();
  try {
    if (!config.token) throw new Error('Es ist noch kein GitHub-Token hinterlegt.');
    const versionRe = /^[0-9A-Za-z._-]{1,32}$/;
    const wantedGame = String(gameVersion || '').trim();
    const wantedLoader = String(loaderVersion || '').trim();
    if (!versionRe.test(wantedGame)) throw new Error('Ungültige Minecraft-Version.');
    if (wantedLoader && !versionRe.test(wantedLoader)) throw new Error('Ungültige Fabric-Version.');

    const endpoint = `/repos/${config.owner}/${config.repo}/contents/${MANIFEST_FILE}`;
    const current = await githubRequest(`${endpoint}?ref=${encodeURIComponent(config.branch)}`);
    if (current.status === 404) throw new Error('Im Repository gibt es noch kein Manifest. Veröffentliche zuerst das Modpack.');
    if (!current.ok) throw new Error(describeGithubError(current, config));
    const remote = JSON.parse(Buffer.from(current.data.content, 'base64').toString('utf8'));

    if (remote.gameVersion && remote.gameVersion !== wantedGame) {
      throw new Error(`Die Minecraft-Version ändert sich (${remote.gameVersion} → ${wantedGame}). Dafür brauchen die Spieler neue Mods, das geht nur über „Testen & Veröffentlichen“.`);
    }

    const manifest = { ...remote, gameVersion: wantedGame, loaderVersion: wantedLoader };
    if (!wantedLoader) delete manifest.loaderVersion;
    const put = await githubRequest(endpoint, {
      method: 'PUT',
      body: {
        message: 'server: Fabric-Version',
        content: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8').toString('base64'),
        branch: config.branch,
        sha: current.data.sha
      }
    });
    if (!put.ok) throw new Error(describeGithubError(put, config));

    try {
      writeJsonFile(manifestCachePath(), manifest);
    } catch (err) {
      console.warn('Manifest-Cache konnte nicht geschrieben werden:', err.message);
    }
    return { success: true, manifest };
  } catch (err) {
    console.error('Version veröffentlichen fehlgeschlagen:', err);
    return { success: false, error: err.message };
  }
});

handleAdmin('modpack-update-presentation', async (event, { serverName = '', serverDescription = '', bannerAction = 'keep', banner = '', serverMapUrl = '' } = {}) => {
  const config = getGithubConfig();
  try {
    if (!config.token) throw new Error('Es ist noch kein GitHub-Token hinterlegt.');

    const name = cleanPresentationText(serverName, 60);
    const description = cleanPresentationText(serverDescription, 140);
    const mapUrl = normalizeMapUrl(serverMapUrl);
    if (String(serverMapUrl || '').trim() && !mapUrl) throw new Error('Die Karten-Adresse ist ungültig (Beispiel: http://mc.beispiel.de:8100).');

    let bannerBuffer = null;
    if (bannerAction === 'set') {
      if (!isValidBannerDataUrl(banner)) throw new Error('Das Banner-Bild ist ungültig.');
      bannerBuffer = bannerFromDataUrl(banner);
    }

    const endpoint = `/repos/${config.owner}/${config.repo}/contents/${MANIFEST_FILE}`;
    const current = await githubRequest(`${endpoint}?ref=${encodeURIComponent(config.branch)}`);
    if (!current.ok && current.status !== 404) throw new Error(describeGithubError(current, config));
    const remote = current.ok
      ? JSON.parse(Buffer.from(current.data.content, 'base64').toString('utf8'))
      : getBundledManifest();

    // Die Adresse des Admin-Servers geht mit, damit sich eine geänderte IP bei allen Spielern aktualisiert
    const adminAddress = storedAdminServer().address;
    const manifest = { ...remote, serverName: name, serverDescription: description, ...(adminAddress ? { serverAddress: adminAddress } : {}) };

    if (bannerAction === 'set') {
      const bannerHash = crypto.createHash('sha1').update(bannerBuffer).digest('hex').slice(0, 8);
      // Liegt dasselbe Bild schon auf GitHub, wird nichts neu hochgeladen
      const alreadyPublished = remote.serverBanner === PRESENTATION_BANNER_FILE && remote.serverBannerVersion === bannerHash;
      if (!alreadyPublished) {
        await githubPutRepoFile(config, PRESENTATION_BANNER_FILE, bannerBuffer, 'server: Banner');
      }
      manifest.serverBanner = PRESENTATION_BANNER_FILE;
      manifest.serverBannerVersion = bannerHash;
    } else if (bannerAction === 'remove') {
      await githubDeleteRepoFile(config, PRESENTATION_BANNER_FILE, 'server: Banner entfernt');
      delete manifest.serverBanner;
      delete manifest.serverBannerVersion;
    }
    if (!manifest.serverDescription) delete manifest.serverDescription;
    if (mapUrl) manifest.serverMapUrl = mapUrl;
    else delete manifest.serverMapUrl;

    // Das Manifest wird erst nach dem Banner geschrieben, damit es nie auf eine fehlende Datei zeigt
    const repoIsEmpty = !current.ok && await isGithubRepoEmpty(config);
    const put = await githubRequest(endpoint, {
      method: 'PUT',
      body: {
        message: 'server: Name und Beschreibung',
        content: Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8').toString('base64'),
        ...(repoIsEmpty ? {} : { branch: config.branch }),
        ...(current.ok ? { sha: current.data.sha } : {})
      }
    });
    if (!put.ok) throw new Error(describeGithubError(put, config));

    try {
      writeJsonFile(manifestCachePath(), manifest);
    } catch (err) {
      console.warn('Manifest-Cache konnte nicht geschrieben werden:', err.message);
    }
    // Beschreibung und Banner auch lokal merken, damit die Serverdatei dieselben Angaben nutzt
    const storedAdmin = storedAdminServer();
    let localBanner = storedAdmin.banner || '';
    if (bannerAction === 'set') {
      localBanner = writeBannerFile(ADMIN_SERVER_ID, banner);
    } else if (bannerAction === 'remove') {
      deleteBannerFile(ADMIN_SERVER_ID);
      localBanner = '';
    }
    saveSettings({
      adminServer: {
        ...storedAdmin,
        displayName: name,
        description,
        banner: localBanner,
        bannerRemove: false,
        mapUrl
      }
    });
    notifyAdminServerChanged();
    return { success: true, manifest };
  } catch (err) {
    console.error('Darstellung veröffentlichen fehlgeschlagen:', err);
    return { success: false, error: err.message };
  }
});

handleAdmin('modpack-update-changelog', async (event, { changelog, version, title }) => {
  const currentManifest = readJsonFile(manifestCachePath()) || getBundledManifest();
  const targetVer = version || currentManifest?.modpackVersion || '1.0.0';
  const cleanText = String(changelog || '').trim();

  const history = Array.isArray(currentManifest?.changelogHistory) ? [...currentManifest.changelogHistory] : [];
  const existingIdx = history.findIndex(h => h.version === targetVer);
  const entry = {
    version: targetVer,
    date: history[existingIdx]?.date || new Date().toLocaleDateString('de-DE'),
    title: title ? String(title).trim() : (history[existingIdx]?.title || `Server-Update v${targetVer}`),
    changelog: cleanText,
    updatedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    history[existingIdx] = { ...history[existingIdx], ...entry };
  } else {
    history.unshift(entry);
  }

  const updatedManifest = {
    ...currentManifest,
    changelog: cleanText,
    changelogHistory: history
  };

  const config = getGithubConfig();
  let pushedToGithub = false;
  let githubError = null;

  if (config.token) {
    try {
      const endpoint = `/repos/${config.owner}/${config.repo}/contents/${MANIFEST_FILE}`;
      const current = await githubRequest(endpoint, {
        headers: { 'If-None-Match': '' }
      });
      const content = JSON.stringify(updatedManifest, null, 2) + '\n';
      const put = await githubRequest(endpoint, {
        method: 'PUT',
        body: {
          message: `changelog: v${targetVer}`,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch: config.branch,
          ...(current.ok ? { sha: current.data.sha } : {})
        }
      });
      if (put.ok) {
        pushedToGithub = true;
      } else {
        githubError = describeGithubError(put, config);
      }
    } catch (err) {
      githubError = err.message;
    }
  }

  writeJsonFile(manifestCachePath(), updatedManifest);

  return { success: true, manifest: updatedManifest, pushedToGithub, githubError };
});

// ─── Modpack Handbuch & Anleitungen ─────────────────────────────────────────

function getDefaultGuides() {
  return [
    {
      id: 'splinecart',
      modSlug: 'pw_splinecart',
      title: 'Splinecart (Achterbahnen & Fahrgeschäfte)',
      iconUrl: 'https://cdn.modrinth.com/data/8k5WFoGm/3b2d8e3bf6bef7c2f42d34324e61f9469e2065af_96.webp',
      summary: 'Erschaffe spektakuläre Achterbahnen, Loopings und Fahrgeschäfte mit stufenlosen Kurven und physikalischen Neigungen.',
      chapters: [
        {
          id: 'spline-1',
          title: '1. Schnellstart & Gleise verlegen',
          content: `## Willkommen bei Splinecart!

Mit **Splinecart** kannst du auf unserem Server echte, geschmeidige Achterbahnen und Hochgeschwindigkeitsstrecken bauen – ganz ohne abgehackte Vanilla-Gleise!

### Erste Schritte:
1. **Gleisanker platzieren:** Setze einen Gleisanker (*Track Anchor*) an den Startpunkt deiner geplanten Strecke.
2. **Gleisbauer-Werkzeug nutzen:** Klicke mit der rechten Maustaste auf den Startanker und gehe zum nächsten Punkt.
3. **Streckenverlauf bestimmen:** Klicke erneut, um den nächsten Anker zu verbinden. Das Gleis biegt sich automatisch in einer sanften Bézier-Kurve.

### Steilkurven & Neigung (Banking):
- Halte die **Shift-Taste** gedrückt, während du die Neigung des Gleises justierst.
- In schnellen Kurven sorgt ein Schräglagen-Winkel von **20° bis 45°** dafür, dass die Lore physikalisch stabil bleibt und nicht entgleist!`,
          images: []
        },
        {
          id: 'spline-2',
          title: '2. Antriebe, Bremsen & Stationen',
          content: `### Geschwindigkeit kontrollieren

Eine Achterbahn lebt vom Wechselspiel aus Geschwindigkeit und Nervenkitzel. Splinecart bietet dafür spezialisierte Gleistypen:

- **Kettenlift (Chain Lift):** Zieht die Lore mit konstanter Geschwindigkeit steile Anstiege hinauf. Perfekt für den ersten Lifthill!
- **Booster-Gleis (Powered Track):** Beschleunigt die Lore blitzschnell vor Steilkurven oder Loopings.
- **Bremsschiene (Brake Track):** Reduziert sanft die Geschwindigkeit vor scharfen Kurven oder im Einfahrtsbereich des Bahnhofs.
- **Stationsgleis:** Hält die Lore automatisch an. Durch ein **Redstone-Signal** (z. B. Knopf oder Hebel) oder wenn ein Spieler einsteigt, startet die Fahrt.`,
          images: []
        },
        {
          id: 'spline-3',
          title: '3. Loopings, Korkenzieher & Tuning',
          content: `### Meisterklasse: Loopings & Inversionen

Du möchtest Fahrgäste kopfüber schicken? Kein Problem!

1. Setze Ankerpunkte in einer vertikalen Schleife nach oben.
2. Achte darauf, dass vor dem Looping ausreichend **Schwung** vorhanden ist (z. B. durch einen Drop oder Booster-Gleise).
3. Verwende Korkenzieher-Kurven (Roll-Winkel bis 180°), um nahtlose Übergänge zwischen Loopings und Steilstrecken zu erzeugen.

> **Sicherheits-Tipp:** Teste deine Strecke immer erst mit einer leeren Lore, bevor du Passagiere einsteigen lässt!`,
          images: []
        }
      ]
    },
    {
      id: 'saros-money',
      modSlug: 'saros-money',
      title: "Saro's Money (Wirtschaft & Münzen)",
      iconUrl: 'https://cdn.modrinth.com/data/vRkO4kGw/27d54e7dcb39a0161b75e5795d9c602ca9202927_96.webp',
      summary: 'Das Währungssystem auf unserem Server: Verdiene Münzen, eröffne Shops und handle mit anderen Spielern.',
      chapters: [
        {
          id: 'money-1',
          title: '1. Münzstufen & Währung',
          content: `## Unser Wirtschaftssystem

Auf unserem Server nutzen wir physische Münzen als stabiles Zahlungsmittel:

- **Kupfermünze:** Die kleinste Einheit für den täglichen Bedarf.
- **Silbermünze:** Wert = 10 Kupfermünzen.
- **Goldmünze:** Wert = 10 Silbermünzen (= 100 Kupfermünzen).
- **Platinmünze:** Wert = 10 Goldmünzen (= 1.000 Kupfermünzen) für Großprojekte und seltene Güter.

### Münzen wechseln:
Du kannst Münzen in der Werkbank (Crafting Table) jederzeit in höhere oder niedrigere Einheiten umwandeln (z. B. 10 Kupfer = 1 Silber und umgekehrt).`,
          images: []
        },
        {
          id: 'money-2',
          title: '2. Geld verdienen & Handeln',
          content: `### Wie komme ich an Geld?

1. **Quests & Kopfgelder:** Erfülle Aufgaben an Schwarzen Brettern in Dörfern.
2. **Rohstoff-Verkauf:** Verkaufe überschüssige Erze, Holz oder Nahrung an andere Spieler.
3. **Eigene Shops eröffnen:** Baue eine Verkaufs-Kiste auf dem Marktplatz und biete Waren automatisch an.
4. **Dienstleistungen:** Lass dich für Bauarbeiten, Transporte oder Streckennetze bezahlen.`,
          images: []
        },
        {
          id: 'money-3',
          title: '3. Tresore & Sicherheit',
          content: `### Schütze dein Vermögen!

- Bewahre deine wertvollen Münzen in einem **gesperrten Tresor** oder deiner Ender-Kiste auf.
- Verliere deine Geldbörse nicht im Kampf – halte immer nur das Geld bei dir, das du für den Einkauf benötigst!`,
          images: []
        }
      ]
    },
    {
      id: 'reliable-gliders',
      modSlug: 'reliable-gliders',
      title: 'Reliable Gliders (Gleitschirme)',
      iconUrl: 'https://cdn.modrinth.com/data/pVIWsXir/5bd0978079f226fe04e6e6ed92daa3f8de503d62.png',
      summary: 'Gleite sicher von Bergen, nutze thermische Aufwinde und reise schnell über die Welt.',
      chapters: [
        {
          id: 'glider-1',
          title: '1. Gleiter craften & Ausrüsten',
          content: `## Sanftes Gleiten statt Fallschaden!

Der Gleitschirm (*Glider*) ist dein treuer Begleiter zur Erkundung hoher Berge und weiter Landschaften.

### Herstellung:
- **Holz-Gleiter:** Der Einstieg. Benötigt Leder, Stöcke und Stoff/Wolle.
- **Verstärkter Gleiter:** Hält deutlich länger und bietet bessere Flugeigenschaften.

### Ausrüsten:
Platziere den Gleiter in deinem Brustpanzer-Slot oder im Curios/Trinkets-Slot. Alternativ reicht es, ihn in der Hand zu halten und in der Luft Rechtsklick zu drücken.`,
          images: []
        },
        {
          id: 'glider-2',
          title: '2. Flugtechnik & Thermik',
          content: `### Steuerung in der Luft:
- **Blick nach unten:** Schneller Flug, steilerer Sinkflug.
- **Blick zum Horizont:** Maximaler Gleitwinkel, weite Distanz.
- **Lagerfeuer & Lava-Aufwinde:** Wenn du über einem **Lagerfeuer (Campfire)** oder einem Lava-See fliegst, erzeugt die heiße Luft thermischen Auftrieb und trägt dich wieder nach oben!`,
          images: []
        }
      ]
    },
    {
      id: 'gravestones',
      modSlug: 'pneumono_gravestones',
      title: 'Gravestones (Grabsteine)',
      iconUrl: 'https://cdn.modrinth.com/data/Heh3BbSv/e10b4d60fb1d7eb24044b8c40f0eec4346e5894a_96.webp',
      summary: 'Kein Item-Verlust beim Tod: Deine Ausrüstung wird sicher in einem Grabstein verwahrt.',
      chapters: [
        {
          id: 'grave-1',
          title: '1. Automatisches Sichern beim Tod',
          content: `## Keine Panik bei Missgeschicken!

Wenn du auf unserem Server das Zeitliche segnest, verschwinden deine Items nicht im Nirgendwo und despawnen auch nicht nach 5 Minuten:

1. An deinem Todesort entsteht sofort ein **Grabstein**.
2. Alle getragenen Rüstungen, Werkzeuge und dein gesamtes Inventar werden sicher darin verstaut.
3. Im Chat erhältst du die genauen **Koordinaten** und die Dimension deines Grabes.`,
          images: []
        },
        {
          id: 'grave-2',
          title: '2. Grab bergen & Ausrüsten',
          content: `### Items wiederholen:
- Gehe zum Todespunkt zurück.
- Klicke mit der rechten Maustaste (oder sneak-klicke) auf den Grabstein.
- Deine Rüstung wird sofort wieder angezogen und die Items wandern in genau die gleichen Inventar-Slots zurück wie vor deinem Ableben!
- Der Grabstein verschwindet danach automatisch.`,
          images: []
        }
      ]
    }
  ];
}

ipcMain.handle('guides-get', async () => {
  try {
    let localGuides = readJsonFile(modpackGuidesPath(), null);
    const config = getGithubConfig();

    if ((!localGuides || !localGuides.length) && config?.owner && config?.repo) {
      try {
        const endpoint = `/repos/${config.owner}/${config.repo}/contents/${GUIDES_FILE}?ref=${encodeURIComponent(config.branch || 'main')}`;
        const res = await githubRequest(endpoint);
        if (res.ok && res.data?.content) {
          const parsed = JSON.parse(Buffer.from(res.data.content, 'base64').toString('utf8'));
          if (Array.isArray(parsed) && parsed.length > 0) {
            localGuides = parsed;
            writeJsonFile(modpackGuidesPath(), localGuides);
          }
        }
      } catch (ghErr) {
        console.warn('Guides konnten nicht von GitHub geladen werden:', ghErr.message);
      }
    }

    if (!localGuides || !Array.isArray(localGuides) || localGuides.length === 0) {
      localGuides = getDefaultGuides();
      writeJsonFile(modpackGuidesPath(), localGuides);
    }

    return { success: true, guides: localGuides };
  } catch (err) {
    console.error('Fehler beim Laden der Anleitungen:', err);
    return { success: false, guides: getDefaultGuides(), error: err.message };
  }
});

ipcMain.handle('guides-save', async (event, guides) => {
  try {
    if (!Array.isArray(guides)) throw new Error('Ungültiges Format für Anleitungen.');
    writeJsonFile(modpackGuidesPath(), guides);
    return { success: true };
  } catch (err) {
    console.error('Fehler beim Speichern der Anleitungen:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('guides-upload-image', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Bild für Anleitung auswählen',
      properties: ['openFile'],
      filters: [
        { name: 'Bilder (*.png, *.jpg, *.jpeg, *.webp, *.gif)', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }
      ]
    });

    if (result.canceled || !result.filePaths.length) {
      return { success: false, canceled: true };
    }

    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    const mime = ext === 'jpg' ? 'image/jpeg' : (ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : (ext === 'gif' ? 'image/gif' : 'image/png')));
    const data = fs.readFileSync(filePath);
    const base64 = data.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    return {
      success: true,
      dataUrl,
      fileName: path.basename(filePath)
    };
  } catch (err) {
    console.error('Fehler beim Bild-Upload:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('guides-publish', async () => {
  const config = getGithubConfig();
  try {
    if (!config.token) throw new Error('Es ist noch kein GitHub-Token hinterlegt.');
    const guides = readJsonFile(modpackGuidesPath(), getDefaultGuides());
    const endpoint = `/repos/${config.owner}/${config.repo}/contents/${GUIDES_FILE}`;

    const existing = await githubRequest(`${endpoint}?ref=${encodeURIComponent(config.branch || 'main')}`);
    const sha = existing.ok ? existing.data?.sha : undefined;

    const content = JSON.stringify(guides, null, 2) + '\n';
    const put = await githubRequest(endpoint, {
      method: 'PUT',
      body: {
        message: 'docs: Update mod guides',
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch: config.branch || 'main',
        ...(sha ? { sha } : {})
      }
    });

    if (!put.ok) throw new Error(describeGithubError(put, config));

    return { success: true, guides };
  } catch (err) {
    console.error('Fehler beim Veröffentlichen der Anleitungen:', err);
    return { success: false, error: err.message };
  }
});

// ─── BisectHosting & Server Admin API ──────────────────────────────────────
ipcMain.handle('bisect-api', (event, options) => bisectRequest(options));

// Das Panel begrenzt Anfragen ("Too Many Attempts", HTTP 429). Dann wird gewartet und neu versucht.
const BISECT_MAX_RATE_LIMIT_RETRIES = 8;

async function bisectRequest({ method = 'GET', endpoint = '/api/client', body = null, configOverride = null, onWait = null }) {
  const settings = getSettings();
  const baseConfig = settings.bisectConfig || {};
  
  let config = { ...baseConfig };
  if (configOverride && typeof configOverride === 'object') {
    if (configOverride.panelUrl) config.panelUrl = configOverride.panelUrl;
    if (configOverride.apiKey) config.apiKey = configOverride.apiKey;
    if (configOverride.serverId) config.serverId = configOverride.serverId;
  }

  let panelUrl = (config.panelUrl || 'https://games.bisecthosting.com').trim().replace(/\/+$/, '');
  if (!panelUrl.startsWith('http')) {
    panelUrl = 'https://' + panelUrl;
  }
  const apiKey = (config.apiKey || '').trim();

  if (!apiKey) {
    return { success: false, error: 'Kein BisectHosting API-Schlüssel hinterlegt.' };
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${panelUrl}${cleanEndpoint}`;

  try {
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'User-Agent': 'Electron-Minecraft-Launcher/1.0'
      }
    };

    if (body !== null && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(fetchOptions.method)) {
      if (typeof body === 'string') {
        fetchOptions.headers['Content-Type'] = 'text/plain';
        fetchOptions.body = body;
      } else {
        fetchOptions.body = JSON.stringify(body);
      }
    }

    let res;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(fullUrl, fetchOptions);
      if (res.status !== 429 || attempt >= BISECT_MAX_RATE_LIMIT_RETRIES) break;
      const retryAfter = Number(res.headers.get('retry-after'));
      const base = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 10 * (attempt + 1);
      const waitSeconds = Math.min(Math.max(base, 3), 90);
      if (onWait) onWait(waitSeconds, attempt + 1);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    }
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok) {
      let errorMsg = `HTTP ${res.status} (${res.statusText})`;
      try {
        if (contentType.includes('application/json')) {
          const errJson = await res.json();
          if (errJson.errors && Array.isArray(errJson.errors)) {
            errorMsg = errJson.errors.map(e => e.detail || e.code || e.message).join(', ');
          }
        } else {
          const text = await res.text();
          if (text) errorMsg = text.slice(0, 200);
        }
      } catch (e) {}
      return { success: false, status: res.status, error: errorMsg };
    }

    if (contentType.includes('application/json')) {
      const data = await res.json();
      return { success: true, status: res.status, data };
    }

    const textData = await res.text();
    return { success: true, status: res.status, data: textData };
  } catch (err) {
    console.error('Bisect API Error:', fullUrl, err);
    const causeStr = err.cause ? ` (${err.cause.code || err.cause.message || err.cause})` : '';
    const detail = `${err.message}${causeStr} beim Aufruf von: ${fullUrl}`;
    return { success: false, error: detail };
  }
}

// ─── Direkter Mod-Upload auf den Server (Reine Server-Mods) ────────────────
ipcMain.handle('select-mod-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Mod-Datei (.jar) für den Server auswählen',
    filters: [{ name: 'Minecraft Mods (*.jar)', extensions: ['jar'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// Lädt eine oder mehrere Dateien in einer einzigen Upload-Anfrage hoch (eine Panel-Anfrage für die signierte URL)
async function uploadFilesToBisect(files, targetServerId, targetDir = 'mods', configOverride = null, onWait = null) {
  const signedRes = await bisectRequest({
    method: 'GET',
    endpoint: `/api/client/servers/${targetServerId}/files/upload`,
    configOverride,
    onWait
  });
  if (!signedRes.success || !signedRes.data?.attributes?.url) {
    return { success: false, error: signedRes.error || 'Upload-URL konnte nicht vom Panel abgerufen werden' };
  }

  let uploadUrl = signedRes.data.attributes.url;
  const sep = uploadUrl.includes('?') ? '&' : '?';
  uploadUrl = `${uploadUrl}${sep}directory=${encodeURIComponent(targetDir.startsWith('/') ? targetDir : `/${targetDir}`)}`;

  const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
  const parts = [];
  for (const file of files) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${file.name}"\r\nContent-Type: application/java-archive\r\n\r\n`,
      'utf8'
    ));
    parts.push(file.data);
    parts.push(Buffer.from('\r\n', 'utf8'));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));

  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(parts)
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    throw new Error(`Panel Upload Fehler (${uploadResponse.status}): ${errText}`);
  }

  return { success: true };
}

async function uploadBufferToBisect(fileData, fileName, targetServerId, targetDir = 'mods', configOverride = null) {
  const res = await uploadFilesToBisect([{ name: fileName, data: fileData }], targetServerId, targetDir, configOverride);
  return res.success ? { success: true, fileName } : res;
}

ipcMain.handle('bisect-upload-mod', async (event, { filePath, serverId, targetDir = 'mods' }) => {
  try {
    const settings = getSettings();
    const config = settings.bisectConfig || {};
    const targetServerId = serverId || config.serverId;
    if (!targetServerId) return { success: false, error: 'Keine Server-ID ausgewählt' };
    if (!filePath || !fs.existsSync(filePath)) return { success: false, error: 'Datei nicht gefunden' };

    const fileData = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    return await uploadBufferToBisect(fileData, fileName, targetServerId, targetDir);
  } catch (err) {
    return { success: false, error: err.message };
  }
});

const IGNORED_SERVER_DEPENDENCY_IDS = new Set(['minecraft', 'java', 'fabricloader', 'fabric-loader', 'quilt_loader']);

async function resolveAndInstallServerDependencies(fileData, targetServerId, targetGameVersion = '26.3', targetLoader = 'fabric', configOverride = null) {
  const installedDependencies = [];
  try {
    const bundle = inspectJar(fileData);
    const requiredSlugs = new Set();

    for (const mod of bundle) {
      if (mod.depends) {
        for (const depId of Object.keys(mod.depends)) {
          if (!IGNORED_SERVER_DEPENDENCY_IDS.has(depId.toLowerCase())) {
            requiredSlugs.add(depId);
          }
        }
      }
    }

    if (requiredSlugs.size === 0) return installedDependencies;

    const currentFiles = await listServerMods(targetServerId, configOverride);
    const currentNames = currentFiles.map(f => (f.name || '').toLowerCase());

    for (const depSlug of requiredSlugs) {
      const cleanSlug = depSlug.toLowerCase().replace(/[^a-z0-9]/g, '');
      const alreadyPresent = currentNames.some(name => {
        const cleanName = name.replace(/[^a-z0-9]/g, '');
        return cleanName.includes(cleanSlug);
      });

      if (alreadyPresent) continue;

      console.log(`[ServerModInstall] Fehlende Abhängigkeit erkannt: "${depSlug}" - suche auf Modrinth...`);
      let versionsRes = await fetch(
        `https://api.modrinth.com/v2/project/${encodeURIComponent(depSlug)}/version?game_versions=${encodeURIComponent(JSON.stringify([targetGameVersion]))}&loaders=${encodeURIComponent(JSON.stringify([targetLoader]))}`,
        { headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0.0' } }
      );

      let versions = null;
      if (versionsRes.ok) {
        versions = await versionsRes.json();
      }

      if (!versions || versions.length === 0) {
        versionsRes = await fetch(
          `https://api.modrinth.com/v2/project/${encodeURIComponent(depSlug)}/version`,
          { headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0.0' } }
        );
        if (versionsRes.ok) {
          versions = await versionsRes.json();
        }
      }

      if (!versions || versions.length === 0) {
        console.warn(`[ServerModInstall] Keine Modrinth-Version für Abhängigkeit "${depSlug}" gefunden.`);
        continue;
      }

      const depVersion = versions[0];
      const depFile = depVersion.files?.find(f => f.primary) || depVersion.files?.[0];
      if (!depFile || !depFile.url) continue;

      console.log(`[ServerModInstall] Lade Abhängigkeit ${depFile.filename} herunter und übertrage auf Server...`);
      const depDownloadRes = await fetch(depFile.url, {
        headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0.0' }
      });
      if (!depDownloadRes.ok) continue;

      const depArrayBuf = await depDownloadRes.arrayBuffer();
      const depBuffer = Buffer.from(depArrayBuf);

      await uploadBufferToBisect(depBuffer, depFile.filename, targetServerId, 'mods', configOverride);
      installedDependencies.push(depFile.filename);
      currentNames.push(depFile.filename.toLowerCase());
    }
  } catch (err) {
    console.warn('[ServerModInstall] Fehler bei Abhängigkeitsprüfung:', err);
  }

  return installedDependencies;
}

// Lädt eine Mod von Modrinth herunter und lädt sie direkt auf den Bisect-Server in den /mods-Ordner
ipcMain.handle('bisect-install-modrinth-mod', async (event, { serverId, downloadUrl, filename, configOverride, gameVersion = '26.3', loader = 'fabric' }) => {
  try {
    const settings = getSettings();
    const config = { ...settings.bisectConfig, ...(configOverride || {}) };
    const targetServerId = serverId || config.serverId;
    if (!targetServerId) return { success: false, error: 'Keine Server-ID ausgewählt' };
    if (!downloadUrl) return { success: false, error: 'Keine Download-URL angegeben' };

    let targetFilename = filename;
    if (!targetFilename) {
      try {
        targetFilename = path.basename(new URL(downloadUrl).pathname);
      } catch (e) {
        targetFilename = 'mod.jar';
      }
    }

    const downloadRes = await fetch(downloadUrl, {
      headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0.0' }
    });
    if (!downloadRes.ok) {
      throw new Error(`Download von Modrinth fehlgeschlagen (HTTP ${downloadRes.status})`);
    }
    const arrayBuffer = await downloadRes.arrayBuffer();
    const fileData = Buffer.from(arrayBuffer);

    // 1. Automatische Erkennung und Installation aller in fabric.mod.json geforderten Abhängigkeiten (z.B. fabric-api)
    const installedDependencies = await resolveAndInstallServerDependencies(fileData, targetServerId, gameVersion, loader, configOverride);

    // 2. Haupt-Mod hochladen
    const uploadRes = await uploadBufferToBisect(fileData, targetFilename, targetServerId, 'mods', configOverride);
    if (!uploadRes.success) return uploadRes;

    return { success: true, fileName: targetFilename, installedDependencies };
  } catch (err) {
    console.error('bisect-install-modrinth-mod Error:', err);
    return { success: false, error: err.message };
  }
});

// Aktiviert KOKOTO WebChat auf dem Server (enabled: true in config.yml und /kchat reload)
ipcMain.handle('bisect-enable-kokoto-webchat', async (event, options = {}) => {
  try {
    const { serverId, configOverride, port: portOverride } = (options || {});
    const settings = getSettings();
    const config = { ...settings.bisectConfig, ...(configOverride || {}) };
    const targetServerId = serverId || config.serverId;
    if (!targetServerId) return { success: false, error: 'Kein Server ausgewählt.' };

    const targetFilePath = 'config/KOKOTO-WebChat/config.yml';

    // 1. Datei einlesen (versuche POST und GET)
    let getRes = await bisectRequest({
      method: 'POST',
      endpoint: `/api/client/servers/${targetServerId}/files/contents`,
      body: { file: `/${targetFilePath}` },
      configOverride
    });
    if (!getRes.success) {
      getRes = await bisectRequest({
        method: 'POST',
        endpoint: `/api/client/servers/${targetServerId}/files/contents`,
        body: { file: targetFilePath },
        configOverride
      });
    }
    if (!getRes.success) {
      getRes = await bisectRequest({
        method: 'GET',
        endpoint: `/api/client/servers/${targetServerId}/files/contents?file=${encodeURIComponent('/' + targetFilePath)}`,
        configOverride
      });
    }

    let content = '';
    if (getRes.success) {
      if (typeof getRes.data === 'string') {
        content = getRes.data;
      } else if (getRes.data && typeof getRes.data === 'object') {
        content = getRes.data.content || getRes.data.data || getRes.data.file || '';
      }
    }

    if (!content || !content.trim()) {
      content = `# KOKOTO WebChat Configuration\nconfig-version: "5.3.0"\nrelease-version: "5.3.3"\nenabled: true\n\nhttp:\n  host: "0.0.0.0"\n  port: ${portOverride || 8899}\n  public-prefix: ""\n\nui:\n  language: "en-US"\n`;
    } else {
      // 1. enabled auf true setzen
      if (/enabled:\s*false/i.test(content)) {
        content = content.replace(/enabled:\s*false/i, 'enabled: true');
      } else if (!/enabled:\s*true/i.test(content)) {
        content = 'enabled: true\n' + content;
      }

      // 2. config-version fest auf 5.3.0 setzen, damit KOKOTO WebChat keine Auto-Migration durchführt!
      if (/config-version:/i.test(content)) {
        content = content.replace(/config-version:\s*["']?[^"'\r\n]+["']?/i, 'config-version: "5.3.0"');
      } else {
        content = 'config-version: "5.3.0"\n' + content;
      }

      // 3. release-version sicherstellen
      if (/release-version:/i.test(content)) {
        content = content.replace(/release-version:\s*["']?[^"'\r\n]+["']?/i, 'release-version: "5.3.3"');
      } else {
        content = 'release-version: "5.3.3"\n' + content;
      }

      // 4. Port anpassen falls nötig
      if (portOverride) {
        if (/port:\s*\d+/i.test(content)) {
          content = content.replace(/port:\s*\d+/i, `port: ${portOverride}`);
        }
      }
    }

    // 2. Datei mit enabled: true schreiben (Starbase Format: POST /files/write { file, content })
    let writeRes = await bisectRequest({
      method: 'POST',
      endpoint: `/api/client/servers/${targetServerId}/files/write`,
      body: { file: `/${targetFilePath}`, content },
      configOverride
    });

    if (!writeRes.success) {
      writeRes = await bisectRequest({
        method: 'POST',
        endpoint: `/api/client/servers/${targetServerId}/files/write`,
        body: { file: targetFilePath, content },
        configOverride
      });
    }

    if (!writeRes.success) {
      writeRes = await bisectRequest({
        method: 'POST',
        endpoint: `/api/client/servers/${targetServerId}/files/write?file=${encodeURIComponent(targetFilePath)}`,
        body: content,
        configOverride
      });
    }

    if (!writeRes.success) {
      return { success: false, error: writeRes.error || 'config.yml konnte nicht geschrieben werden.' };
    }

    // 3. /kchat reload Befehl an die Server-Konsole senden
    await bisectRequest({
      method: 'POST',
      endpoint: `/api/client/servers/${targetServerId}/command`,
      body: { command: 'kchat reload' },
      configOverride
    });

    return { success: true };
  } catch (err) {
    console.error('Fehler beim Aktivieren von KOKOTO WebChat:', err);
    return { success: false, error: err.message };
  }
});

// Ruft alle Netzwerk-Allokationen (Ports) des Servers ab
ipcMain.handle('bisect-get-allocations', async (event, { serverId, configOverride } = {}) => {
  try {
    const settings = getSettings();
    const config = { ...settings.bisectConfig, ...(configOverride || {}) };
    const targetServerId = serverId || config.serverId;
    if (!targetServerId) return { success: false, error: 'Kein Server ausgewählt.' };

    const res = await bisectRequest({
      method: 'GET',
      endpoint: `/api/client/servers/${targetServerId}/network/allocations`,
      configOverride
    });

    if (res.success && res.data?.data) {
      const allocations = res.data.data.map(item => item.attributes || item);
      return { success: true, allocations };
    }

    const serverDetails = await bisectRequest({
      method: 'GET',
      endpoint: `/api/client/servers/${targetServerId}`,
      configOverride
    });
    const allocs = serverDetails.data?.attributes?.relationships?.allocations?.data?.map(i => i.attributes) || [];
    return { success: true, allocations: allocs };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Live Server-Konsole WebSocket & Command Handlers ──────────────────────────
let currentConsoleSessionId = 0;
let activeConsoleWs = null;
let activeConsoleServerId = null;
let activeConsoleConfig = null;
let consoleReconnectTimer = null;

function cleanupConsoleWebSocket() {
  currentConsoleSessionId++;
  if (consoleReconnectTimer) {
    clearTimeout(consoleReconnectTimer);
    consoleReconnectTimer = null;
  }
  if (activeConsoleWs) {
    try {
      activeConsoleWs.onopen = null;
      activeConsoleWs.onmessage = null;
      activeConsoleWs.onerror = null;
      activeConsoleWs.onclose = null;
      activeConsoleWs.close();
    } catch (e) {}
    activeConsoleWs = null;
  }
  activeConsoleServerId = null;
  activeConsoleConfig = null;
}

ipcMain.handle('server-console-connect', async (event, { serverId, configOverride } = {}) => {
  cleanupConsoleWebSocket();
  const thisSessionId = currentConsoleSessionId;

  const settings = getSettings();
  const config = { ...settings.bisectConfig, ...(configOverride || {}) };
  const targetServerId = serverId || config.serverId;
  if (!targetServerId) {
    return { success: false, error: 'Keine Server-ID angegeben.' };
  }

  activeConsoleServerId = targetServerId;
  activeConsoleConfig = configOverride;

  try {
    const wsCreds = await bisectRequest({
      method: 'GET',
      endpoint: `/api/client/servers/${targetServerId}/websocket`,
      configOverride
    });

    // Falls in der Zwischenzeit ein neuer Connect oder Disconnect aufgerufen wurde: abbrechen!
    if (thisSessionId !== currentConsoleSessionId) {
      return { success: false, aborted: true };
    }

    if (!wsCreds.success || !wsCreds.data?.data) {
      return { success: false, error: wsCreds.error || 'WebSocket-Zugang konnte nicht abgerufen werden.' };
    }

    const { token, socket } = wsCreds.data.data;
    if (!socket || !token) {
      return { success: false, error: 'Ungültige WebSocket-Verbindungsdaten von BisectHosting erhalten.' };
    }

    if (activeConsoleWs) {
      try { activeConsoleWs.close(); } catch (e) {}
      activeConsoleWs = null;
    }

    const ws = new WebSocket(socket);
    activeConsoleWs = ws;

    ws.onopen = () => {
      if (thisSessionId !== currentConsoleSessionId) {
        try { ws.close(); } catch (e) {}
        return;
      }
      try {
        ws.send(JSON.stringify({ event: 'auth', args: [token] }));
      } catch (e) {
        console.error('Fehler beim Senden des Auth-Tokens an Wings:', e);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-console-status', { connected: true, state: 'authenticating' });
      }
    };

    ws.onmessage = async (msgEvent) => {
      if (thisSessionId !== currentConsoleSessionId) {
        try { ws.close(); } catch (e) {}
        return;
      }
      try {
        const raw = typeof msgEvent.data === 'string' ? msgEvent.data : msgEvent.data.toString();
        const parsed = JSON.parse(raw);

        if (parsed.event === 'auth success') {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('server-console-status', { connected: true, state: 'ready' });
          }
          try {
            ws.send(JSON.stringify({ event: 'send logs', args: [null] }));
          } catch (e) {}
        } else if (parsed.event === 'console output') {
          if (Array.isArray(parsed.args) && mainWindow && !mainWindow.isDestroyed()) {
            for (const line of parsed.args) {
              mainWindow.webContents.send('server-console-line', line);
            }
          }
        } else if (parsed.event === 'status') {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('server-console-status', { connected: true, serverStatus: parsed.args?.[0] });
          }
        } else if (parsed.event === 'token expiring') {
          try {
            const refreshRes = await bisectRequest({
              method: 'GET',
              endpoint: `/api/client/servers/${targetServerId}/websocket`,
              configOverride
            });
            if (refreshRes.success && refreshRes.data?.data?.token && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: 'auth', args: [refreshRes.data.data.token] }));
            }
          } catch (refErr) {
            console.warn('Konnte WebSocket-Token nicht aktualisieren:', refErr);
          }
        } else if (parsed.event === 'token expired') {
          cleanupConsoleWebSocket();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('server-console-status', { connected: false, state: 'token_expired' });
          }
        }
      } catch (parseErr) {
        if (mainWindow && !mainWindow.isDestroyed() && typeof msgEvent.data === 'string') {
          mainWindow.webContents.send('server-console-line', msgEvent.data);
        }
      }
    };

    ws.onerror = (err) => {
      if (thisSessionId !== currentConsoleSessionId) return;
      console.warn('Server-Konsole WebSocket Fehler:', err?.message || err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-console-status', { connected: false, error: err?.message || 'WebSocket-Verbindungsfehler' });
      }
    };

    ws.onclose = (closeEvent) => {
      if (thisSessionId !== currentConsoleSessionId) return;
      activeConsoleWs = null;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-console-status', { connected: false, code: closeEvent.code, reason: closeEvent.reason });
      }
    };

    return { success: true };
  } catch (err) {
    console.error('Fehler beim Verbinden mit der Server-Konsole:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('server-console-disconnect', () => {
  cleanupConsoleWebSocket();
  return { success: true };
});

ipcMain.handle('server-console-send', async (event, { serverId, command, configOverride } = {}) => {
  const cleanCmd = (command || '').trim();
  if (!cleanCmd) return { success: false, error: 'Kein Befehl angegeben.' };

  const settings = getSettings();
  const config = { ...settings.bisectConfig, ...(configOverride || {}) };
  const targetServerId = serverId || activeConsoleServerId || config.serverId;

  // 1. WebSocket bevorzugen - Wings schickt den eingegebenen Befehl automatisch selbst als Logzeile zurück!
  if (activeConsoleWs && activeConsoleWs.readyState === WebSocket.OPEN) {
    try {
      activeConsoleWs.send(JSON.stringify({ event: 'send command', args: [cleanCmd] }));
      return { success: true, method: 'websocket' };
    } catch (wsErr) {
      console.warn('WebSocket-Senden fehlgeschlagen, wechsle auf REST-Fallback:', wsErr);
    }
  }

  // 2. REST API Fallback
  if (!targetServerId) {
    return { success: false, error: 'Kein Ziel-Server bekannt.' };
  }

  try {
    const res = await bisectRequest({
      method: 'POST',
      endpoint: `/api/client/servers/${targetServerId}/command`,
      body: { command: cleanCmd },
      configOverride: configOverride || activeConsoleConfig
    });
    if (!res.success) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-console-line', `[FEHLER] Befehl konnte nicht ausgeführt werden: ${res.error}`);
      }
      return { success: false, error: res.error, method: 'rest' };
    }
    return { success: true, method: 'rest' };
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server-console-line', `[FEHLER] ${err.message}`);
    }
    return { success: false, error: err.message, method: 'rest' };
  }
});

// ─── Live Server Status (MC Direct TCP Ping & Version Check) ─────────────
const PROTOCOL_MAP = {
  767: '1.21.1',
  766: '1.20.6',
  765: '1.20.4',
  764: '1.20.2',
  763: '1.20.1',
  762: '1.19.4',
  761: '1.19.3',
  760: '1.19.2',
  759: '1.19',
  758: '1.18.2'
};

function readVarIntFromBuffer(buf, offset = 0) {
  let value = 0;
  let size = 0;
  let b;
  while (true) {
    if (offset + size >= buf.length) return null;
    b = buf[offset + size];
    value |= (b & 0x7F) << (size * 7);
    size++;
    if ((b & 0x80) === 0) break;
    if (size > 5) return null;
  }
  return { value, size };
}

function formatServerPingResult(parsed) {
  const rawName = parsed.version?.name ? String(parsed.version.name).trim() : '';
  const proto = parsed.version?.protocol;
  // Der Server bestimmt die Version (z. B. "26.3" oder "1.21.1")
  const mcVersion = rawName || (proto && PROTOCOL_MAP[proto]) || '';

  return {
    online: true,
    version: mcVersion,
    rawVersion: rawName,
    protocol: proto,
    players: {
      online: parsed.players?.online || 0,
      max: parsed.players?.max || 20
    },
    motd: typeof parsed.description === 'string'
      ? [parsed.description]
      : [parsed.description?.text || 'Minecraft Server']
  };
}

function pingMinecraftServer(host, port = 25565, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let hasResponded = false;
    let dataBuffer = Buffer.alloc(0);

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      try {
        const hostBuf = Buffer.from(host, 'utf8');
        const portBuf = Buffer.alloc(2);
        portBuf.writeUInt16BE(port, 0);

        const writeVarInt = (val) => {
          const bytes = [];
          while (true) {
            if ((val & ~0x7F) === 0) {
              bytes.push(val);
              return Buffer.from(bytes);
            }
            bytes.push((val & 0x7F) | 0x80);
            val >>>= 7;
          }
        };

        const packetData = Buffer.concat([
          Buffer.from([0x00]),
          writeVarInt(767),
          writeVarInt(hostBuf.length),
          hostBuf,
          portBuf,
          Buffer.from([0x01])
        ]);

        const handshake = Buffer.concat([writeVarInt(packetData.length), packetData]);
        const statusRequest = Buffer.from([0x01, 0x00]);
        socket.write(Buffer.concat([handshake, statusRequest]));
      } catch (e) {
        socket.destroy();
        resolve(null);
      }
    });

    socket.on('data', (chunk) => {
      dataBuffer = Buffer.concat([dataBuffer, chunk]);

      // 1. Präziser VarInt-Protokoll-Parser
      try {
        const packetLen = readVarIntFromBuffer(dataBuffer, 0);
        if (packetLen) {
          let offset = packetLen.size;
          const packetId = readVarIntFromBuffer(dataBuffer, offset);
          if (packetId && packetId.value === 0x00) {
            offset += packetId.size;
            const strLen = readVarIntFromBuffer(dataBuffer, offset);
            if (strLen && dataBuffer.length >= offset + strLen.size + strLen.value) {
              offset += strLen.size;
              const jsonStr = dataBuffer.toString('utf8', offset, offset + strLen.value);
              const parsed = JSON.parse(jsonStr);
              hasResponded = true;
              socket.destroy();
              resolve(formatServerPingResult(parsed));
              return;
            }
          }
        }
      } catch (e) {}

      // 2. Robuster Fallback-Parser über JSON-Klammern
      const str = dataBuffer.toString('utf8');
      const jsonStart = str.indexOf('{');
      const jsonEnd = str.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        try {
          const jsonStr = str.substring(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(jsonStr);
          if (parsed && (parsed.version || parsed.players)) {
            hasResponded = true;
            socket.destroy();
            resolve(formatServerPingResult(parsed));
          }
        } catch (e) {}
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      if (!hasResponded) resolve(null);
    });

    socket.on('error', () => {
      socket.destroy();
      if (!hasResponded) resolve(null);
    });

    socket.on('close', () => {
      if (!hasResponded) resolve(null);
    });

    try {
      socket.connect(port, host);
    } catch (e) {
      resolve(null);
    }
  });
}


// ─── Server: Liste, Anlegen, Auswählen, Exportieren, Importieren ───────────
function notifyServersChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('servers-changed');
}

function notifyAdminServerChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('admin-server-changed', getSettings().adminServer || null);
}

// Entwurf der Darstellung (Name, Beschreibung, Banner) lokal speichern, unabhängig vom Veröffentlichen
ipcMain.handle('admin-presentation-save', (event, { displayName = '', description = '', banner, bannerRemove = false, mapUrl = '' } = {}) => {
  const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const stored = storedAdminServer();
  let bannerHash = stored.banner || '';
  if (banner === '') {
    deleteBannerFile(ADMIN_SERVER_ID);
    bannerHash = '';
  } else if (isValidBannerDataUrl(banner)) {
    bannerHash = writeBannerFile(ADMIN_SERVER_ID, banner);
  }
  saveSettings({
    adminServer: {
      ...stored,
      displayName: clean(displayName, SERVER_NAME_MAX),
      description: clean(description, SERVER_DESCRIPTION_MAX),
      banner: bannerHash,
      bannerRemove: Boolean(bannerRemove),
      // Eine ungültige Adresse wird nicht gespeichert, die Oberfläche zeigt sie rot an
      mapUrl: normalizeMapUrl(mapUrl) || (String(mapUrl || '').trim() ? stored.mapUrl || '' : '')
    }
  });
  notifyAdminServerChanged();
  return { success: true };
});

ipcMain.handle('admin-server-save', (event, { name, address } = {}) => {
  const cleanName = String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SERVER_NAME_MAX);
  const cleanAddress = String(address ?? '').trim();
  if (cleanAddress && !isValidServerAddress(cleanAddress)) {
    return { success: false, error: 'Die Server-Adresse ist ungültig (Beispiel: mc.beispiel.de:25565).' };
  }
  saveSettings({ adminServer: { ...storedAdminServer(), name: cleanName, address: cleanAddress } });
  notifyAdminServerChanged();
  return { success: true, adminServer: getSettings().adminServer };
});

function notifyInstancesChanged() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('instances-changed');
}

function serverBusyError() {
  if (activeMinecraftProcess || currentGameStatus.status !== 'idle') {
    return 'Minecraft läuft oder startet gerade. Bitte beende es zuerst.';
  }
  return null;
}

ipcMain.handle('servers-list', () => ({
  servers: getServers(),
  activeServerId: getSettings().activeServerId || null,
  adminServer: getSettings().adminServer || null
}));

ipcMain.handle('servers-add', (event, input) => {
  const clean = sanitizeServerInput(input);
  if (!clean.ok) return { success: false, error: clean.error };

  const servers = getServers();
  const record = createServerRecord(clean.server, servers.map(server => server.folder));
  record.banner = clean.server.banner ? writeBannerFile(record.id, clean.server.banner) : '';
  ensureInstanceFolders(getInstanceDir(record));
  const nextActive = getSettings().activeServerId && servers.some(s => s.id === getSettings().activeServerId)
    ? getSettings().activeServerId
    : record.id;
  saveServers([...servers, record], nextActive);
  notifyServersChanged();
  return { success: true, server: record, activeServerId: nextActive };
});

ipcMain.handle('servers-update', (event, { id, data }) => {
  const servers = getServers();
  const current = servers.find(server => server.id === id);
  if (!current) return { success: false, error: 'Server nicht gefunden.' };

  const clean = sanitizeServerInput({ ...current, ...data, github: data?.github ?? `${current.owner}/${current.repo}` });
  if (!clean.ok) return { success: false, error: clean.error };

  const updated = {
    ...current,
    name: clean.server.name,
    description: clean.server.description,
    mapUrl: clean.server.mapUrl,
    address: clean.server.address,
    owner: clean.server.owner,
    repo: clean.server.repo,
    branch: clean.server.branch,
    chatPort: clean.server.chatPort
  };

  // Der Ordner trägt den Namen des Servers. Bei einer Umbenennung wird er mit umbenannt.
  if (clean.server.name !== current.name) {
    const busy = serverBusyError();
    if (busy) return { success: false, error: busy };
    const newFolder = folderNameFor(clean.server.name, servers.filter(s => s.id !== id).map(s => s.folder));
    const from = getInstanceDir(current);
    const to = getInstanceDir({ folder: newFolder });
    try {
      if (fs.existsSync(from) && newFolder !== current.folder) fs.renameSync(from, to);
      updated.folder = newFolder;
    } catch (err) {
      return { success: false, error: `Der Ordner konnte nicht umbenannt werden: ${err.message}` };
    }
  }

  saveServers(servers.map(server => (server.id === id ? updated : server)), getSettings().activeServerId);
  notifyServersChanged();
  return { success: true, server: updated };
});

ipcMain.handle('servers-set-active', (event, id) => {
  const server = getServers().find(item => item.id === id);
  if (!server) return { success: false, error: 'Server nicht gefunden.' };
  const busy = serverBusyError();
  if (busy) return { success: false, error: busy };
  saveServers(getServers(), id);
  ensureInstanceFolders();
  notifyServersChanged();
  return { success: true };
});

ipcMain.handle('servers-remove', async (event, { id, deleteFiles = false }) => {
  const servers = getServers();
  const server = servers.find(item => item.id === id);
  if (!server) return { success: false, error: 'Server nicht gefunden.' };
  const busy = serverBusyError();
  if (busy) return { success: false, error: busy };

  const rest = servers.filter(item => item.id !== id);
  const wasActive = getSettings().activeServerId === id;
  saveServers(rest, wasActive ? (rest[0]?.id || null) : getSettings().activeServerId);
  deleteBannerFile(id);

  if (deleteFiles) {
    try {
      fs.rmSync(getInstanceDir(server), { recursive: true, force: true });
      fs.rmSync(serverDataDir(server), { recursive: true, force: true });
    } catch (err) {
      notifyServersChanged();
      return { success: true, warning: `Der Server wurde entfernt, aber nicht alle Dateien: ${err.message}` };
    }
  }
  notifyServersChanged();
  return { success: true };
});

ipcMain.handle('servers-open-folder', async (event, id) => {
  const server = getServers().find(item => item.id === id);
  if (!server) return { success: false, error: 'Server nicht gefunden.' };
  const dir = getInstanceDir(server);
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return { success: true };
});

ipcMain.handle('servers-export', async (event, { id, name, description, banner }) => {
  const isAdminServer = id === ADMIN_SERVER_ID;
  let server = isAdminServer ? getAdminServer() : getServers().find(item => item.id === id);
  if (!server) return { success: false, error: 'Server nicht gefunden.' };
  if (isAdminServer && ((!name && !server.name) || !server.address)) {
    return { success: false, error: 'Trage im Server-Admin zuerst die Adresse des Servers ein (Karte „Server, den du verwaltest“).' };
  }
  // Beschreibung und Banner bleiben am Server gespeichert, damit sie auch bei dir angezeigt werden.
  // Banner: Data-URL = neues Bild, leer = entfernen, nichts = das gespeicherte behalten.
  let bannerHash = server.banner || '';
  if (banner === '') {
    deleteBannerFile(id);
    bannerHash = '';
  } else if (isValidBannerDataUrl(banner)) {
    bannerHash = writeBannerFile(id, banner);
  }
  let nextDescription = server.description || '';
  if (description !== undefined) {
    const clean = sanitizeServerInput({ ...server, banner: '', github: `${server.owner}/${server.repo}`, description });
    if (clean.ok) nextDescription = clean.server.description;
  }
  if (nextDescription !== (server.description || '') || bannerHash !== (server.banner || '')) {
    server = { ...server, description: nextDescription, banner: bannerHash };
    if (isAdminServer) {
      saveSettings({ adminServer: { ...storedAdminServer(), description: nextDescription, banner: bannerHash } });
      notifyAdminServerChanged();
    } else {
      saveServers(getServers().map(item => (item.id === id ? server : item)), getSettings().activeServerId);
      notifyServersChanged();
    }
  }

  // Banner für die Datei: das gewählte oder gespeicherte, sonst (nur Admin) eines, das schon auf GitHub liegt
  let fileBanner = isValidBannerDataUrl(banner) ? banner : (bannerHash ? readBannerDataUrl(id) : '');
  if (!fileBanner && isAdminServer && banner === undefined && server.owner && server.repo) {
    try {
      const res = await fetch(
        `https://raw.githubusercontent.com/${server.owner}/${server.repo}/${server.branch || 'main'}/${PRESENTATION_BANNER_FILE}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        if (isPngBuffer(buffer) && buffer.length <= BANNER_MAX_BYTES) fileBanner = bannerToDataUrl(buffer);
      }
    } catch (_e) { /* ohne Banner weiter */ }
  }
  const fileName = `${folderNameFor(name || server.name, [], [])}.${SERVER_FILE_EXTENSION}`;
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Server-Datei speichern',
    defaultPath: path.join(app.getPath('documents'), fileName),
    filters: [{ name: 'dP Launcher Server', extensions: [SERVER_FILE_EXTENSION] }]
  });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  try {
    fs.writeFileSync(result.filePath, buildServerFile(server, name, server.description, fileBanner), 'utf8');
    return { success: true, filePath: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Server-Banner (PNG im Verhältnis 30:10) ──────────────────────────────
const BANNER_RATIO = 3;
const BANNER_RATIO_TOLERANCE = 0.09;
const BANNER_MIN_WIDTH = 300;
const BANNER_MAX_WIDTH = 1920; // Full HD: 1920 x 640

// Prüft das Bild, verkleinert es auf höchstens 1920x640 (Full HD) und hält die Datei unter der Grenze
function prepareBannerPng(buffer) {
  if (!isPngBuffer(buffer)) return { ok: false, error: 'Das ist keine PNG-Datei.' };
  const image = nativeImage.createFromBuffer(buffer);
  if (image.isEmpty()) return { ok: false, error: 'Das Bild konnte nicht gelesen werden.' };
  const { width, height } = image.getSize();
  if (Math.abs(width / height - BANNER_RATIO) > BANNER_RATIO_TOLERANCE) {
    return { ok: false, error: `Das Bild muss das Seitenverhältnis 30:10 (3:1) haben, zum Beispiel 900 x 300 Pixel. Dieses hat ${width} x ${height}.` };
  }
  if (width < BANNER_MIN_WIDTH) {
    return { ok: false, error: `Das Bild ist zu klein (mindestens ${BANNER_MIN_WIDTH} Pixel breit, dieses hat ${width}).` };
  }
  // Passt das Bild schon (höchstens 1920 Pixel breit, klein genug), bleibt die Datei unverändert.
  // Neu kodiert würde ein optimiertes PNG größer und müsste dann stärker verkleinert werden.
  if (width <= BANNER_MAX_WIDTH && buffer.length <= BANNER_MAX_BYTES) {
    return { ok: true, dataUrl: bannerToDataUrl(buffer), width, height, bytes: buffer.length, originalWidth: width };
  }

  // In kleinen Schritten verkleinern, damit so viel Auflösung wie möglich bleibt
  for (const target of [1920, 1600, 1280, 1080, 900, 720, 600, 450, 300]) {
    const outWidth = Math.min(width, target);
    const outHeight = Math.round(outWidth / BANNER_RATIO);
    const png = image.resize({ width: outWidth, height: outHeight, quality: 'best' }).toPNG();
    if (png.length <= BANNER_MAX_BYTES) {
      return { ok: true, dataUrl: bannerToDataUrl(png), width: outWidth, height: outHeight, bytes: png.length, originalWidth: width };
    }
  }
  return { ok: false, error: `Das Bild ist auch verkleinert größer als ${Math.round(BANNER_MAX_BYTES / (1024 * 1024))} MB. Nimm ein einfacheres Bild mit weniger Verläufen.` };
}

ipcMain.handle('server-banner-pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Server-Banner wählen (PNG, 30:10)',
    properties: ['openFile'],
    filters: [{ name: 'PNG-Bild', extensions: ['png'] }]
  });
  if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
  try {
    const filePath = result.filePaths[0];
    if (fs.statSync(filePath).size > 20 * 1024 * 1024) return { success: false, error: 'Das Bild ist zu groß (höchstens 20 MB).' };
    const prepared = prepareBannerPng(fs.readFileSync(filePath));
    return prepared.ok
      ? { success: true, dataUrl: prepared.dataUrl, width: prepared.width, height: prepared.height, bytes: prepared.bytes, originalWidth: prepared.originalWidth }
      : { success: false, error: prepared.error };
  } catch (err) {
    return { success: false, error: `Das Bild konnte nicht gelesen werden: ${err.message}` };
  }
});

function readServerFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size > SERVER_FILE_MAX_CHARS) return { ok: false, error: 'Die Datei ist zu groß für eine Serverdatei.' };
    const parsed = parseServerFile(fs.readFileSync(filePath, 'utf8'));
    return { ...parsed, fileName: path.basename(filePath) };
  } catch (err) {
    return { ok: false, error: `Die Datei konnte nicht gelesen werden: ${err.message}` };
  }
}

// Wählt eine Datei aus und liefert die geprüften Daten. Hinzugefügt wird erst nach der Bestätigung im Fenster.
ipcMain.handle('servers-import-pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Server-Datei öffnen',
    properties: ['openFile'],
    filters: [{ name: 'dP Launcher Server', extensions: [SERVER_FILE_EXTENSION] }]
  });
  if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
  const parsed = readServerFile(result.filePaths[0]);
  return parsed.ok
    ? { success: true, server: parsed.server, fileName: parsed.fileName }
    : { success: false, error: parsed.error };
});

// Serverdatei, die per Doppelklick oder Kommandozeile geöffnet wurde
let pendingServerFile = null;

function findServerFileArg(argv = []) {
  return argv.find(arg => typeof arg === 'string' && arg.toLowerCase().endsWith(`.${SERVER_FILE_EXTENSION}`) && fs.existsSync(arg));
}

function handleOpenedServerFile(filePath) {
  const parsed = readServerFile(filePath);
  pendingServerFile = parsed.ok
    ? { success: true, server: parsed.server, fileName: parsed.fileName }
    : { success: false, error: parsed.error, fileName: parsed.fileName };
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('server-file-opened', pendingServerFile);
  }
}

ipcMain.handle('servers-take-pending-file', () => {
  const pending = pendingServerFile;
  pendingServerFile = null;
  return pending;
});


// ─── Instanzen: Liste, Anlegen, Ändern, Entfernen, Starten ─────────────────
ipcMain.handle('instances-list', () => ({ instances: getInstances() }));

ipcMain.handle('instances-create', (event, input) => {
  const clean = sanitizeInstanceInput(input);
  if (!clean.ok) return { success: false, error: clean.error };
  const record = createInstanceRecord(clean.instance, allTakenFolders());
  ensureInstanceFolders(instanceDirFor(record));
  saveInstances([...getInstances(), record]);
  notifyInstancesChanged();
  return { success: true, instance: record };
});

ipcMain.handle('instances-update', (event, { id, data }) => {
  const instances = getInstances();
  const current = instances.find(instance => instance.id === id);
  if (!current) return { success: false, error: 'Instanz nicht gefunden.' };
  const clean = sanitizeInstanceInput({ ...current, ...data });
  if (!clean.ok) return { success: false, error: clean.error };

  const updated = { ...current, name: clean.instance.name, gameVersion: clean.instance.gameVersion, loader: clean.instance.loader, ramMax: clean.instance.ramMax };
  if (clean.instance.gameVersion !== current.gameVersion || clean.instance.loader !== current.loader) updated.loaderVersion = '';

  if (clean.instance.name !== current.name) {
    const busy = serverBusyError();
    if (busy) return { success: false, error: busy };
    const newFolder = folderNameFor(clean.instance.name, [...getServers().map(s => s.folder), ...instances.filter(i => i.id !== id).map(i => i.folder)]);
    try {
      const from = instanceDirFor(current);
      if (fs.existsSync(from) && newFolder !== current.folder) fs.renameSync(from, instanceDirFor({ folder: newFolder }));
      updated.folder = newFolder;
    } catch (err) {
      return { success: false, error: `Der Ordner konnte nicht umbenannt werden: ${err.message}` };
    }
  }

  saveInstances(instances.map(instance => (instance.id === id ? updated : instance)));
  notifyInstancesChanged();
  return { success: true, instance: updated };
});

ipcMain.handle('instances-remove', (event, { id, deleteFiles = false }) => {
  const instance = getInstanceById(id);
  if (!instance) return { success: false, error: 'Instanz nicht gefunden.' };
  const busy = serverBusyError();
  if (busy) return { success: false, error: busy };
  saveInstances(getInstances().filter(item => item.id !== id));
  if (editTarget?.id === id) editTarget = null;
  if (deleteFiles) {
    try {
      fs.rmSync(instanceDirFor(instance), { recursive: true, force: true });
      fs.rmSync(path.join(app.getPath('userData'), 'instances-data', instance.id), { recursive: true, force: true });
    } catch (err) {
      notifyInstancesChanged();
      return { success: true, warning: `Die Instanz wurde entfernt, aber nicht alle Dateien: ${err.message}` };
    }
  }
  notifyInstancesChanged();
  return { success: true };
});

ipcMain.handle('instances-open-folder', async (event, id) => {
  const instance = getInstanceById(id);
  if (!instance) return { success: false, error: 'Instanz nicht gefunden.' };
  const dir = instanceDirFor(instance);
  fs.mkdirSync(dir, { recursive: true });
  await shell.openPath(dir);
  return { success: true };
});

ipcMain.handle('instances-launch', (event, id) => {
  const instance = getInstanceById(id);
  if (!instance) return { success: false, error: 'Instanz nicht gefunden.' };
  const dir = instanceDirFor(instance);
  ensureInstanceFolders(dir);
  markPlayed('instance', instance.id);
  notifyInstancesChanged();
  return launchMinecraft({
    instanceDir: dir,
    noAutoJoin: true,
    gameVersion: instance.gameVersion,
    loader: instance.loader,
    loaderVersion: instance.loaderVersion,
    ramMax: instance.ramMax || undefined
  });
});

// Die Mods-Seite wählt, welche Instanz sie bearbeitet (null = der aktive Server)
ipcMain.handle('mods-target-set', (event, target) => {
  if (!target) {
    editTarget = null;
    return { success: true };
  }
  if (target.kind === 'instance' && getInstanceById(target.id)) {
    editTarget = { kind: 'instance', id: target.id };
    return { success: true };
  }
  return { success: false, error: 'Instanz nicht gefunden.' };
});

// Liste der Minecraft-Release-Versionen (zehn Minuten zwischengespeichert)
let minecraftVersionsCache = null;
ipcMain.handle('minecraft-versions', async () => {
  try {
    if (minecraftVersionsCache && Date.now() - minecraftVersionsCache.time < 10 * 60 * 1000) return minecraftVersionsCache.data;
    const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json', { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.json();
    const data = {
      success: true,
      latest: manifest.latest?.release || '',
      releases: manifest.versions.filter(version => version.type === 'release').map(version => version.id)
    };
    minecraftVersionsCache = { time: Date.now(), data };
    return data;
  } catch (err) {
    return { success: false, error: `Die Versionsliste konnte nicht geladen werden: ${err.message}` };
  }
});

// ─── Modrinth-Modpack (.mrpack) als neue Instanz installieren ──────────────
async function runPool(items, limit, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

ipcMain.handle('modpack-install-mrpack', async (event, { versionId, projectId, projectTitle, iconUrl, instanceName }) => {
  if (!/^[A-Za-z0-9]{6,12}$/.test(String(versionId))) return { success: false, error: 'Ungültige Modpack-Version.' };
  const sendProgress = (phase, current, total, text) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('instance-install-progress', { phase, current, total, text });
  };

  let instanceDir = null;
  let tempFile = null;
  try {
    sendProgress('prepare', 0, 1, 'Modpack-Version wird abgefragt...');
    const versionRes = await fetch(`https://api.modrinth.com/v2/version/${versionId}`, {
      headers: { 'User-Agent': 'dPandl/electron-minecraft-launcher' },
      signal: AbortSignal.timeout(20000)
    });
    if (!versionRes.ok) throw new Error(`Modrinth antwortet mit HTTP ${versionRes.status}.`);
    const version = await versionRes.json();
    const file = (version.files || []).find(f => f.primary) || version.files?.[0];
    if (!file || !isAllowedModUrl(file.url) || !/\.mrpack$/i.test(file.filename || '')) {
      throw new Error('Diese Version hat keine installierbare Modpack-Datei.');
    }
    if (Number(file.size) > 150 * 1024 * 1024) throw new Error('Die Modpack-Datei ist zu groß.');

    tempFile = path.join(os.tmpdir(), `dp-mrpack-${crypto.randomUUID()}.mrpack`);
    sendProgress('download', 0, 1, 'Modpack wird heruntergeladen...');
    await downloadVerified(file.url, tempFile, file.hashes?.sha1);

    const zip = unzipSync(new Uint8Array(fs.readFileSync(tempFile)));
    const indexBytes = zip['modrinth.index.json'];
    if (!indexBytes) throw new Error('Die Datei ist kein Modrinth-Modpack.');
    const parsed = parseMrpackIndex(JSON.parse(strFromU8(indexBytes)));
    if (!parsed.ok) throw new Error(parsed.error);

    const clean = sanitizeInstanceInput({ name: instanceName || projectTitle || parsed.name, gameVersion: parsed.gameVersion, loader: parsed.loader });
    if (!clean.ok) throw new Error(clean.error);
    const record = createInstanceRecord(clean.instance, allTakenFolders(), {
      loaderVersion: parsed.loaderVersion,
      modpack: {
        projectId: String(projectId || version.project_id || ''),
        versionId: String(versionId),
        versionNumber: String(version.version_number || ''),
        title: String(projectTitle || parsed.name),
        iconUrl: /^https:\/\/cdn\.modrinth\.com\//.test(String(iconUrl || '')) ? String(iconUrl) : ''
      }
    });
    instanceDir = instanceDirFor(record);
    ensureInstanceFolders(instanceDir);
    const root = path.resolve(instanceDir) + path.sep;

    // Dateien des Modpacks laden und prüfen
    let done = 0;
    await runPool(parsed.files, 4, async (item) => {
      const target = path.resolve(instanceDir, item.path);
      if (!target.startsWith(root)) throw new Error(`Ungültiger Dateipfad im Modpack: ${item.path}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      let lastError = null;
      for (const url of item.downloads) {
        try {
          await downloadVerified(url, target, item.sha1);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (lastError) throw new Error(`${item.path}: ${lastError.message}`);
      done += 1;
      sendProgress('files', done, parsed.files.length, item.path);
    });

    // Eigene Dateien des Modpacks (Configs, Resourcepacks usw.)
    sendProgress('overrides', 0, 1, 'Einstellungen des Modpacks werden eingerichtet...');
    for (const prefix of ['overrides/', 'client-overrides/']) {
      for (const [name, data] of Object.entries(zip)) {
        if (!name.startsWith(prefix) || name.endsWith('/')) continue;
        const relative = name.slice(prefix.length);
        if (!isSafeRelativePath(relative)) continue;
        const target = path.resolve(instanceDir, relative);
        if (!target.startsWith(root)) continue;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, Buffer.from(data));
      }
    }

    saveInstances([...getInstances(), record]);
    notifyInstancesChanged();
    sendProgress('done', 1, 1, 'Fertig');
    return { success: true, instance: record };
  } catch (err) {
    if (instanceDir) {
      try { fs.rmSync(instanceDir, { recursive: true, force: true }); } catch (_e) {}
    }
    return { success: false, error: err.message };
  } finally {
    if (tempFile) {
      try { fs.rmSync(tempFile, { force: true }); } catch (_e) {}
    }
  }
});

// Löst eine Adresse so auf wie der Minecraft-Client: Ohne Port wird der SRV-Eintrag _minecraft._tcp.<Host> gelesen
// (viele Hoster nutzen damit einen anderen Port als 25565). Mit Port oder IP bleibt es bei der Eingabe.
async function resolveMinecraftAddress(address) {
  const raw = String(address || '').trim();
  const colon = raw.lastIndexOf(':');
  const hasPort = colon > -1 && /^\d{1,5}$/.test(raw.slice(colon + 1));
  let host = hasPort ? raw.slice(0, colon) : raw;
  let port = hasPort ? parseInt(raw.slice(colon + 1), 10) : 25565;

  if (!hasPort && host && !net.isIP(host)) {
    try {
      const records = await Promise.race([
        dns.promises.resolveSrv(`_minecraft._tcp.${host}`),
        new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), 3000))
      ]);
      if (Array.isArray(records) && records.length > 0) {
        records.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
        host = records[0].name.replace(/\.$/, '');
        port = records[0].port;
      }
    } catch (_e) { /* kein SRV-Eintrag: Standardport */ }
  }
  return { host, port };
}

ipcMain.handle('check-server-status', async (event, targetAddress) => {
  const settings = getSettings();
  const address = targetAddress || getActiveServer()?.address || settings.serverIp;
  if (!address) {
    return { success: false, online: false, error: 'Keine Server-Adresse hinterlegt' };
  }
  const { host, port } = await resolveMinecraftAddress(address);

  // 1. Zuerst direkter Minecraft TCP-Ping vom Rechner des Spielers
  try {
    const directResult = await pingMinecraftServer(host, port, 3500);
    if (directResult && directResult.online) {
      return {
        success: true,
        online: true,
        ip: host,
        port: port,
        version: directResult.version || '',
        rawVersion: directResult.rawVersion,
        protocol: directResult.protocol || null,
        players: directResult.players || null,
        motd: directResult.motd || [],
        software: ''
      };
    }
  } catch (directErr) {
    console.warn('Direkter TCP-Ping fehlgeschlagen:', directErr.message);
  }

  // 2. Fallback: BisectHosting API Live Container Status (sofort & ohne Cache-Verzögerung)
  if (settings.bisectConfig?.apiKey && settings.bisectConfig?.serverId) {
    try {
      const panelUrl = (settings.bisectConfig.panelUrl || 'https://games.bisecthosting.com').replace(/\/+$/, '');
      const serverId = settings.bisectConfig.serverId;
      const res = await fetch(`${panelUrl}/api/client/servers/${serverId}/resources`, {
        headers: {
          'Authorization': `Bearer ${settings.bisectConfig.apiKey}`,
          'Accept': 'application/json',
          'User-Agent': 'Electron-Minecraft-Launcher/1.0'
        },
        signal: AbortSignal.timeout(3500)
      });
      if (res.ok) {
        const json = await res.json();
        const state = json.attributes?.current_state;
        if (state === 'running' || state === 'starting') {
          return {
            success: true,
            online: true,
            state: state,
            ip: host,
            port: port,
            // Laut Panel läuft der Container, per Ping war der Server aber nicht abfragbar: Version und Spieler sind unbekannt
            version: '',
            protocol: null,
            players: null,
            motd: [],
            software: '',
            pingFailed: true
          };
        }
      }
    } catch (bisectErr) {
      console.warn('Bisect Live-Status Check fehlgeschlagen:', bisectErr.message);
    }
  }

  // 3. Fallback über mcsrvstat.us
  try {
    const res = await fetch(`https://api.mcsrvstat.us/3/${encodeURIComponent(address.trim())}`, {
      headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0' },
      signal: AbortSignal.timeout(4000)
    });
    if (res.ok) {
      const data = await res.json();
      const protoVer = typeof data.protocol === 'number' ? data.protocol : data.protocol?.version;
      const protoName = data.protocol?.name || '';
      const rawVersion = typeof data.version === 'string' ? data.version.trim() : '';
      const mcVersion = rawVersion || (protoVer && PROTOCOL_MAP[protoVer]) || protoName || '';

      if (data.online) {
        return {
          success: true,
          online: true,
          ip: data.ip || host,
          port: data.port || port,
          version: mcVersion,
          rawVersion: rawVersion,
          protocol: protoVer,
          software: data.software || '',
          players: data.players || null,
          motd: data.motd ? (data.motd.clean || data.motd.raw || []) : []
        };
      }
    }
  } catch (apiErr) {}

  // 4. Server ist wirklich offline
  return {
    success: true,
    online: false,
    ip: host,
    port: port,
    version: '',
    players: null
  };
});

// ─── Modrinth & Server Sync ────────────────────────────────────────────────
ipcMain.handle('download-modrinth-file', async (event, { url, filename, category = 'mods' }) => {
  try {
    const targetDir = path.join(getEditInstanceDir(), category);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const destPath = path.join(targetDir, filename);

    await downloadFile(url, destPath);
    return { success: true, path: destPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Server-Sync: Lädt die im Manifest angegebenen Modrinth-Dateien herunter
ipcMain.handle('sync-server-mods', async (event, manifest) => {
  let userModNotices = [];
  // Ohne vollständige Modliste lässt sich nicht beurteilen, was zu ihr passt
  if (manifest.packComplete) {
    try {
      userModNotices = await reconcileUserMods(getManifestMods(manifest), manifest);
    } catch (err) {
      // Bleibt der Abgleich aus, wird er beim nächsten Start nachgeholt
      console.warn('Spieler-Mods konnten nicht geprüft werden:', err.message);
    }
  }
  const keepFiles = new Set(loadUserModsState().mods.map(mod => mod.filename));
  const result = await syncModsToDir(manifest, path.join(getInstanceDir(), 'mods'), keepFiles);
  return { ...result, userModNotices };
});

// ─── Spieler-Mods: eigene Mods passend zur festen Modliste des Servers ──────
const modrinthIo = createModrinthIo({
  userAgent: 'dPandl/electron-minecraft-launcher',
  readInspectCache: () => readJsonFile(modInspectCachePath, {}),
  writeInspectCache: (cache) => writeJsonFile(modInspectCachePath, cache),
  findLocalFile: (mod) => {
    if (!isSafeModFilename(mod.filename)) return null;
    const localPath = path.join(getEditInstanceDir(), 'mods', mod.filename);
    return fs.existsSync(localPath) ? fs.readFileSync(localPath) : null;
  }
});

function userModPaths(filename) {
  const base = path.join(getEditInstanceDir(), 'mods', filename);
  return [base, `${base}.disabled`];
}

function pruneOrphanUserMods(mods) {
  const byId = new Map(mods.map(mod => [mod.projectId, mod]));
  const reachable = new Set();
  const visit = (mod) => {
    if (!mod || reachable.has(mod)) return;
    reachable.add(mod);
    (mod.dependencies || []).forEach(id => visit(byId.get(id)));
  };
  mods.filter(mod => !mod.autoDependency).forEach(visit);
  return mods.filter(mod => reachable.has(mod));
}

// Von Hand gelöschte Dateien zählen als entfernt
function loadUserModsState() {
  const state = readJsonFile(userModsPath(), {});
  const present = (state.mods || []).filter(mod => userModPaths(mod.filename).some(p => fs.existsSync(p)));
  return { mods: pruneOrphanUserMods(present), packFingerprint: state.packFingerprint ?? null };
}

function saveUserModsState(state) {
  writeJsonFile(userModsPath(), state);
}

function getClientPackMods(packMods) {
  return packMods.filter(mod => mod.side !== 'server');
}

function getPackFingerprint(packMods, gameVersion) {
  const versions = getClientPackMods(packMods).map(mod => mod.versionId || mod.filename).sort();
  return `${gameVersion}|${versions.join(',')}`;
}

async function downloadUserMods(mods) {
  const invalid = mods.find(mod => !isSafeModFilename(mod.filename) || !isAllowedModUrl(mod.downloadUrl));
  if (invalid) throw new Error(`${invalid.name}: Ungültige Datei oder Download-Adresse`);

  fs.mkdirSync(path.join(getEditInstanceDir(), 'mods'), { recursive: true });
  const downloaded = [];
  try {
    for (const mod of mods) {
      const [targetPath] = userModPaths(mod.filename);
      await downloadVerified(mod.downloadUrl, targetPath, mod.sha1);
      downloaded.push(targetPath);
    }
  } catch (err) {
    downloaded.forEach(file => fs.rmSync(file, { force: true }));
    throw err;
  }
}

function deleteUserModFiles(mod) {
  userModPaths(mod.filename).forEach(file => fs.rmSync(file, { force: true }));
}

ipcMain.handle('user-mods-list', () => {
  const state = loadUserModsState();
  saveUserModsState(state);
  return state.mods;
});

ipcMain.handle('user-mods-install', async (event, { projectId, versionId, packMods, gameVersion, loader }) => {
  try {
    const state = loadUserModsState();

    // Eine schon vorhandene Abhängigkeit wird damit zur eigenen Mod
    const asDependency = state.mods.find(mod => mod.projectId === projectId && mod.autoDependency);
    if (asDependency && !versionId) {
      asDependency.autoDependency = false;
      saveUserModsState(state);
      return { success: true, chosen: asDependency, installed: [], skipped: [], warnings: [], mods: state.mods };
    }

    const result = await resolveModInstall({
      projectRef: projectId,
      versionId,
      existing: [...getClientPackMods(packMods), ...state.mods],
      gameVersion,
      loader
    }, modrinthIo);

    if (!result.ok) {
      return { success: false, reason: result.reason, skipped: result.skipped, warnings: result.warnings };
    }

    await downloadUserMods(result.selected);

    const warnings = [...result.warnings];
    if (result.project?.server_side === 'required') {
      warnings.push(`${result.project.title} muss laut Modrinth auch auf dem Server installiert sein. Ohne das kannst du dich eventuell nicht verbinden.`);
    }

    const mods = [...state.mods, ...result.selected];
    saveUserModsState({ ...state, mods });
    return {
      success: true,
      chosen: result.chosen,
      installed: result.selected,
      skipped: result.skipped,
      warnings,
      mods
    };
  } catch (err) {
    console.error('Mod-Installation fehlgeschlagen:', err);
    return { success: false, error: err.message, skipped: [], warnings: [] };
  }
});

function removeUserMod(projectId) {
  try {
    const state = loadUserModsState();
    const target = state.mods.find(mod => mod.projectId === projectId);
    if (!target) return { success: false, error: 'Diese Mod ist nicht installiert.' };

    const remaining = pruneOrphanUserMods(state.mods.filter(mod => mod !== target));
    const dependent = remaining.find(mod => (mod.dependencies || []).includes(projectId));
    if (dependent) return { success: false, error: `${target.name} wird noch von ${dependent.name} gebraucht.` };

    state.mods.filter(mod => !remaining.includes(mod)).forEach(deleteUserModFiles);
    saveUserModsState({ ...state, mods: remaining });
    return { success: true, mods: remaining };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

ipcMain.handle('user-mods-remove', (event, projectId) => removeUserMod(projectId));

// Ändert sich die Modliste des Servers, müssen die Spieler-Mods weiter dazu passen
async function reconcileUserMods(packMods, { gameVersion, loader }) {
  const state = loadUserModsState();
  const packFingerprint = getPackFingerprint(packMods, gameVersion);
  if (state.packFingerprint === packFingerprint) return [];
  if (state.mods.length === 0) {
    saveUserModsState({ ...state, packFingerprint });
    return [];
  }

  const clientPack = getClientPackMods(packMods);
  const accepted = [];
  const notices = [];

  for (const mod of state.mods.filter(entry => !entry.autoDependency)) {
    if (clientPack.some(packMod => packMod.projectId === mod.projectId)) {
      notices.push(`${mod.name} gehört jetzt zur Modliste des Servers.`);
      continue;
    }

    const existing = [...clientPack, ...accepted];
    const options = { projectRef: mod.projectId, existing, gameVersion, loader };
    let result = await resolveModInstall({ ...options, versionId: mod.versionId }, modrinthIo);
    if (result.alreadyPresent) {
      const asDependency = accepted.find(entry => entry.projectId === mod.projectId);
      if (asDependency) asDependency.autoDependency = false;
      continue;
    }
    if (!result.ok) result = await resolveModInstall(options, modrinthIo);

    if (!result.ok) {
      notices.push(`${mod.name} wurde entfernt, weil sie nicht mehr zur Modliste des Servers passt: ${result.reason}`);
      continue;
    }
    if (result.chosen.versionId !== mod.versionId) {
      notices.push(`${mod.name} wurde auf ${result.chosen.versionNumber} geändert, damit sie zur Modliste des Servers passt.`);
    }
    accepted.push(...result.selected);
  }

  const keptIds = new Set(state.mods.map(mod => mod.versionId));
  await downloadUserMods(accepted.filter(mod => !keptIds.has(mod.versionId)));

  const keptFiles = new Set([...accepted.map(mod => mod.filename), ...clientPack.map(mod => mod.filename)]);
  state.mods.filter(mod => !keptFiles.has(mod.filename)).forEach(deleteUserModFiles);

  saveUserModsState({ mods: accepted, packFingerprint });
  return notices;
}

// Ersetzt die Zieldatei erst nach erfolgreicher Prüfung
async function downloadVerified(url, targetPath, expectedSha1, onProgress) {
  const partPath = `${targetPath}.part`;
  try {
    await downloadFile(url, partPath, onProgress);
    if (expectedSha1) {
      const downloadedHash = await getFileSha1(partPath);
      if (!downloadedHash || downloadedHash.toLowerCase() !== expectedSha1.toLowerCase()) {
        throw new Error(`Prüfsumme von ${path.basename(targetPath)} stimmt nicht`);
      }
    }
    fs.renameSync(partPath, targetPath);
  } finally {
    fs.rmSync(partPath, { force: true });
  }
}

// ─── Pre-Launch JAR-Inspektion & automatische Abhängigkeits-Reparatur ─────────
const IGNORED_CLIENT_DEPENDENCY_IDS = new Set([
  'minecraft', 'java', 'fabricloader', 'fabric-loader', 'quilt_loader'
]);

const localJarInspectCache = new Map(); // key: fullPath, val: { mtimeMs, size, mods }

function getJarModsCached(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const cached = localJarInspectCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.mods;
    }
    const bytes = fs.readFileSync(filePath);
    const mods = inspectJar(bytes);
    localJarInspectCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, mods });
    return mods;
  } catch (err) {
    console.warn(`[PreLaunchCheck] Konnte ${path.basename(filePath)} nicht prüfen:`, err.message);
    return [];
  }
}

async function fetchModrinthVersionForDep(depId, gameVersion, loader) {
  const headers = { 'User-Agent': 'Electron-Minecraft-Launcher/1.0.0' };

  // 1. Direkt per Projekt-ID oder Slug
  try {
    const res = await fetch(
      `https://api.modrinth.com/v2/project/${encodeURIComponent(depId)}/version?game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}&loaders=${encodeURIComponent(JSON.stringify([loader]))}`,
      { headers }
    );
    if (res.ok) {
      const versions = await res.json();
      if (Array.isArray(versions) && versions.length > 0) {
        return { projectRef: depId, version: versions.find(v => v.version_type === 'release') || versions[0] };
      }
    }
  } catch {}

  // 2. Direkt per Projekt-ID oder Slug ohne strikten Versionsfilter
  try {
    const res = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(depId)}/version`, { headers });
    if (res.ok) {
      const versions = await res.json();
      if (Array.isArray(versions) && versions.length > 0) {
        return { projectRef: depId, version: versions.find(v => v.version_type === 'release') || versions[0] };
      }
    }
  } catch {}

  // 3. Fallback: Suche nach depId
  try {
    const searchRes = await fetch(
      `https://api.modrinth.com/v2/search?query=${encodeURIComponent(depId)}&limit=5`,
      { headers }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.hits && searchData.hits.length > 0) {
        const cleanDep = depId.toLowerCase().replace(/[^a-z0-9]/g, '');
        const hit = searchData.hits.find(h => {
          const hSlug = (h.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const hTitle = (h.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return hSlug === cleanDep || hTitle.includes(cleanDep);
        }) || searchData.hits[0];

        if (hit) {
          const vRes = await fetch(
            `https://api.modrinth.com/v2/project/${encodeURIComponent(hit.project_id || hit.slug)}/version?game_versions=${encodeURIComponent(JSON.stringify([gameVersion]))}&loaders=${encodeURIComponent(JSON.stringify([loader]))}`,
            { headers }
          );
          if (vRes.ok) {
            const vData = await vRes.json();
            if (Array.isArray(vData) && vData.length > 0) {
              return { projectRef: hit.slug || hit.project_id, version: vData.find(v => v.version_type === 'release') || vData[0] };
            }
          }
        }
      }
    }
  } catch {}

  return null;
}

async function verifyAndAutoRepairLocalDependencies(manifest, modsDir) {
  const gameVersion = manifest?.gameVersion || '26.3';
  const loader = manifest?.loader || 'fabric';
  const autoInstalled = [];
  const MAX_REPAIR_ROUNDS = 3;

  for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
    if (!fs.existsSync(modsDir)) break;
    const jarFiles = fs.readdirSync(modsDir)
      .filter(f => f.endsWith('.jar') && !f.endsWith('.disabled'))
      .map(f => path.join(modsDir, f));

    const installedModIds = new Set();
    const allModDefinitions = [];

    for (const jarPath of jarFiles) {
      const jarMods = getJarModsCached(jarPath);
      for (const m of jarMods) {
        if (!m.id) continue;
        installedModIds.add(m.id.toLowerCase());
        (m.provides || []).forEach(p => {
          if (typeof p === 'string') installedModIds.add(p.toLowerCase());
        });
        allModDefinitions.push({ ...m, jarFile: path.basename(jarPath) });
      }
    }

    const missing = [];
    const missingDepIds = new Set();

    for (const m of allModDefinitions) {
      if (!m.depends) continue;
      for (const [depId, constraint] of Object.entries(m.depends)) {
        const lowerId = depId.toLowerCase();
        if (IGNORED_CLIENT_DEPENDENCY_IDS.has(lowerId)) continue;
        if (!installedModIds.has(lowerId) && !missingDepIds.has(lowerId)) {
          missingDepIds.add(lowerId);
          missing.push({
            requiredBy: m.id,
            requiredByName: m.name || m.id,
            depId,
            constraint
          });
        }
      }
    }

    if (missing.length === 0) {
      break;
    }

    let repairedAny = false;
    for (const item of missing) {
      console.log(`[PreLaunchCheck] Fehlende Mod-Abhängigkeit entdeckt: "${item.depId}" (wird von "${item.requiredBy}" benötigt)`);
      setGameStatus('preparing', `Lade fehlende Abhängigkeit "${item.depId}"...`, 93);
      if (mainWindow) {
        mainWindow.webContents.send('sync-progress', {
          modName: `Abhängigkeit: ${item.depId}`,
          status: 'downloading'
        });
      }

      const match = await fetchModrinthVersionForDep(item.depId, gameVersion, loader);
      if (!match) {
        console.warn(`[PreLaunchCheck] Keine passende Version auf Modrinth für "${item.depId}" gefunden.`);
        continue;
      }

      const { projectRef, version } = match;
      const depFile = version.files?.find(f => f.primary) || version.files?.[0];
      if (!depFile || !depFile.url) continue;

      const targetPath = path.join(modsDir, depFile.filename);
      console.log(`[PreLaunchCheck] Lade "${depFile.filename}" herunter...`);

      try {
        await downloadVerified(depFile.url, targetPath, depFile.hashes?.sha1);
        autoInstalled.push(depFile.filename);
        repairedAny = true;
        console.log(`[PreLaunchCheck] "${depFile.filename}" erfolgreich installiert!`);

        // Falls ein lokaler Entwurf aktiv ist, diesen synchron halten
        try {
          if (fs.existsSync(modpackDraftPath())) {
            const draft = readJsonFile(modpackDraftPath());
            if (draft && Array.isArray(draft.mods)) {
              const existingIdx = draft.mods.findIndex(m =>
                (m.projectId && m.projectId === version.project_id) ||
                (m.slug && m.slug.toLowerCase() === projectRef.toLowerCase()) ||
                (m.filename && m.filename === depFile.filename)
              );

              if (existingIdx !== -1) {
                if (draft.mods[existingIdx].side === 'server') {
                  draft.mods[existingIdx] = { ...draft.mods[existingIdx], side: 'both' };
                  writeJsonFile(modpackDraftPath(), draft);
                  if (mainWindow) mainWindow.webContents.send('modpack-draft-updated', draft);
                }
              } else {
                let projectTitle = projectRef;
                let iconUrl = null;
                try {
                  const pRes = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(version.project_id || projectRef)}`, {
                    headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0.0' }
                  });
                  if (pRes.ok) {
                    const pData = await pRes.json();
                    projectTitle = pData.title || projectTitle;
                    iconUrl = pData.icon_url || null;
                  }
                } catch {}

                draft.mods.push({
                  slug: projectRef,
                  name: projectTitle,
                  iconUrl,
                  side: 'both',
                  projectId: version.project_id || projectRef,
                  versionId: version.id,
                  versionNumber: version.version_number,
                  filename: depFile.filename,
                  downloadUrl: depFile.url,
                  sha1: depFile.hashes?.sha1,
                  size: depFile.size,
                  autoDependency: true,
                  dependencies: [],
                  addedAt: Date.now()
                });
                writeJsonFile(modpackDraftPath(), draft);
                if (mainWindow) mainWindow.webContents.send('modpack-draft-updated', draft);
              }
            }
          }
        } catch (draftErr) {
          console.warn('[PreLaunchCheck] Konnte Entwurf nicht aktualisieren:', draftErr.message);
        }
      } catch (dlErr) {
        console.warn(`[PreLaunchCheck] Download von "${depFile.filename}" fehlgeschlagen:`, dlErr.message);
      }
    }

    if (!repairedAny) break;
  }

  return autoInstalled;
}

async function syncPacksToDir(packs, targetDir, packTypeName) {
  if (!Array.isArray(packs) || packs.length === 0) return;
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  for (let i = 0; i < packs.length; i++) {
    const pack = packs[i];
    if (pack.disabled) continue;
    const filename = pack.filename;
    if (!filename || !isSafePackFilename(filename)) continue;
    if (!isAllowedModUrl(pack.downloadUrl)) continue;

    const targetPath = path.join(targetDir, filename);
    const expectedSha1 = pack.hashes?.sha1 || pack.sha1;
    let needsDownload = true;

    if (fs.existsSync(targetPath)) {
      try {
        const stat = fs.statSync(targetPath);
        if (pack.size && stat.size === pack.size) {
          needsDownload = false;
        } else if (expectedSha1) {
          const localHash = await getFileSha1(targetPath);
          if (localHash && localHash.toLowerCase() === expectedSha1.toLowerCase()) {
            needsDownload = false;
          }
        } else if (stat.size > 0) {
          needsDownload = false;
        }
      } catch (_) {}
    }

    if (needsDownload) {
      setGameStatus('downloading', `Lade ${packTypeName} ${pack.name || filename}...`, 90);
      try {
        await downloadVerified(pack.downloadUrl, targetPath, expectedSha1);
      } catch (err) {
        console.warn(`[PackSync] Konnte ${packTypeName} "${filename}" nicht herunterladen:`, err.message);
      }
    }
  }
}

async function syncModsToDir(manifest, modsDir, keepFiles = new Set()) {
  try {
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

    // Reine Server-Mods und deaktivierte Mods gehören nicht auf den Client
    const clientMods = getManifestMods(manifest).filter(mod => mod.side !== 'server' && !mod.disabled);
    const total = clientMods.length;
    let completed = 0;
    const syncedFiles = new Set();

    for (const mod of clientMods) {
      const filename = mod.filename || `${mod.slug}.jar`;
      if (!isSafeModFilename(filename)) {
        throw new Error(`Ungültiger Dateiname im Manifest: ${filename}`);
      }
      if (!isAllowedModUrl(mod.downloadUrl)) {
        throw new Error(`Ungültige Download-Adresse für ${mod.name || mod.slug}`);
      }
      const targetPath = path.join(modsDir, filename);
      const expectedSha1 = getModSha1(mod);
      syncedFiles.add(filename);

      const basePercent = total > 0 ? Math.round((completed / total) * 90) : 0;
      setGameStatus('preparing', `Prüfe ${mod.name || mod.slug} (${completed + 1}/${total})...`, basePercent);

      // Status an Renderer melden
      if (mainWindow) {
        mainWindow.webContents.send('sync-progress', {
          current: completed + 1,
          total,
          modName: mod.name || mod.slug,
          status: 'checking'
        });
      }

      // Prüfen ob Datei bereits existiert und intakt ist (Fast-Check per Dateigröße)
      let needsDownload = true;
      if (fs.existsSync(targetPath)) {
        try {
          const stat = fs.statSync(targetPath);
          if (mod.size && stat.size === mod.size) {
            // Exakte Bytegröße stimmt überein -> Fast Path ohne Festplatten-Hashing
            needsDownload = false;
          } else if (expectedSha1) {
            const localHash = await getFileSha1(targetPath);
            if (localHash && localHash.toLowerCase() === expectedSha1.toLowerCase()) {
              needsDownload = false;
            }
          } else if (stat.size > 0) {
            needsDownload = false;
          }
        } catch (_) {}
      }

      if (needsDownload) {
        setGameStatus('downloading', `Lade ${mod.name || mod.slug} (${completed + 1}/${total})...`, basePercent);
        if (mainWindow) {
          mainWindow.webContents.send('sync-progress', {
            current: completed + 1,
            total,
            modName: mod.name || mod.slug,
            status: 'downloading'
          });
        }
        await downloadVerified(mod.downloadUrl, targetPath, expectedSha1, (pct) => {
          const itemPercent = total > 0 ? Math.round(((completed + (pct / 100)) / total) * 90) : pct;
          setGameStatus('downloading', `Lade ${mod.name || mod.slug} (${completed + 1}/${total}): ${pct}%`, itemPercent);
        });
      }

      completed++;
    }

    // Optional: Aufräumen von alten Mods, die im Manifest nicht mehr gelistet sind
    if (manifest.cleanOldMods) {
      const existingFiles = fs.readdirSync(modsDir);
      for (const file of existingFiles) {
        if (file.endsWith('.jar') && !syncedFiles.has(file) && !keepFiles.has(file)) {
          try {
            fs.unlinkSync(path.join(modsDir, file));
          } catch (e) {
            console.warn('Alte Mod konnte nicht gelöscht werden:', file);
          }
        }
      }
    }

    // Pre-Launch Dependency Check: fabric.mod.json aller JARs gegenprüfen & fehlende Abhängigkeiten automatisch reparieren
    setGameStatus('preparing', 'Überprüfe Mod-Abhängigkeiten (Pre-Launch Check)...', 92);
    const autoInstalled = await verifyAndAutoRepairLocalDependencies(manifest, modsDir);
    if (autoInstalled && autoInstalled.length > 0) {
      console.log(`[PreLaunchCheck] ${autoInstalled.length} fehlende Abhängigkeit(en) automatisch nachgeladen:`, autoInstalled);
    }

    // Pack-Sync: Ressourcenpakete & Shader abgleichen
    const gameBaseDir = path.resolve(modsDir, '..');
    const resourcepacks = (manifest.resourcepacks || []).filter(r => !r.disabled);
    const shaderpacks = (manifest.shaderpacks || []).filter(s => !s.disabled);

    if (resourcepacks.length > 0) {
      const rpDir = path.join(gameBaseDir, 'resourcepacks');
      await syncPacksToDir(resourcepacks, rpDir, 'Ressourcenpaket');
    }

    if (shaderpacks.length > 0) {
      const spDir = path.join(gameBaseDir, 'shaderpacks');
      await syncPacksToDir(shaderpacks, spDir, 'Shader');
    }

    if (manifest.defaultShader) {
      applyDefaultShader(gameBaseDir, manifest.defaultShader);
    }

    // Config-Sync: Vordefinierte Mod-Konfigurationen schreiben & Wover Welcome-Screen deaktivieren
    const targetConfigDir = path.resolve(modsDir, '..', 'config');
    if (manifest.configs && typeof manifest.configs === 'object' && Object.keys(manifest.configs).length > 0) {
      setGameStatus('preparing', 'Mod-Konfigurationen werden abgeglichen...', 94);
      applyModpackConfigs(manifest.configs, targetConfigDir, gameBaseDir);
    } else {
      ensureWoverWelcomeDisabled(targetConfigDir);
    }

    setGameStatus('preparing', 'Spieldateien vorbereitet...', 95);

    if (mainWindow) {
      mainWindow.webContents.send('sync-progress', {
        current: total,
        total,
        status: 'completed'
      });
    }

    return { success: true, count: completed, autoInstalled };
  } catch (err) {
    console.error('Sync Fehler:', err);
    return { success: false, error: err.message };
  }
}

// ─── Java 21 Detection & Auto-Runtime ─────────────────────────────────────
let activeMinecraftProcess = null;
let currentGameStatus = { status: 'idle', message: '', percent: 0 };
let lastGameStatusTime = 0;

function setGameStatus(status, message = '', percent = 0) {
  currentGameStatus = { status, message, percent };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('game-status', currentGameStatus);
  }
}

// Gedrosseltes Senden von Logs an das Fenster, um Freezes durch IPC-Überlastung zu verhindern
let gameLogBuffer = [];
let gameLogFlushTimer = null;

function emitGameLog(line) {
  if (!line) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    gameLogBuffer.push(String(line));
    if (!gameLogFlushTimer) {
      gameLogFlushTimer = setTimeout(() => {
        gameLogFlushTimer = null;
        if (mainWindow && !mainWindow.isDestroyed() && gameLogBuffer.length > 0) {
          const batch = gameLogBuffer.splice(0, gameLogBuffer.length);
          for (const item of batch) {
            mainWindow.webContents.send('game-log', item);
          }
        }
      }, 80);
    }
  }
}
const DEFAULT_JAVA_CMD = process.platform === 'win32' ? 'javaw' : 'java';

function findJavaExecutable(dir) {
  if (!fs.existsSync(dir)) return null;
  const isWin = process.platform === 'win32';
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findJavaExecutable(full);
        if (found) return found;
      } else {
        const lower = entry.name.toLowerCase();
        if (isWin) {
          if (lower === 'javaw.exe' || lower === 'java.exe') return full;
        } else {
          if (entry.name === 'java') {
            try { fs.chmodSync(full, 0o755); } catch (e) {}
            return full;
          }
        }
      }
    }
  } catch (e) {}
  return null;
}
const findJavaw = findJavaExecutable;

function extractArchive(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    const isTarGz = archivePath.endsWith('.tar.gz') || archivePath.endsWith('.tgz');

    if (isTarGz) {
      if (process.platform === 'win32') {
        execFile('tar.exe', ['-xzf', archivePath, '-C', destDir], { windowsHide: true }, (err) => {
          if (err) reject(err); else resolve();
        });
      } else {
        execFile('tar', ['-xzf', archivePath, '-C', destDir], (err) => {
          if (err) reject(err); else resolve();
        });
      }
      return;
    }

    if (process.platform === 'win32') {
      execFile('tar.exe', ['-xf', archivePath, '-C', destDir], { windowsHide: true }, (tarErr) => {
        if (!tarErr) return resolve();
        // Pfade über Umgebungsvariablen übergeben, damit keine Sonderzeichen in den Befehl geraten
        const cmd = 'Expand-Archive -LiteralPath $env:MCL_ARCHIVE -DestinationPath $env:MCL_DEST -Force';
        execFile('powershell.exe', ['-NoProfile', '-Command', cmd], {
          windowsHide: true,
          env: { ...process.env, MCL_ARCHIVE: archivePath, MCL_DEST: destDir }
        }, (err) => {
          if (err) reject(err); else resolve();
        });
      });
    } else {
      execFile('unzip', ['-o', archivePath, '-d', destDir], (unzipErr) => {
        if (!unzipErr) return resolve();
        execFile('tar', ['-xf', archivePath, '-C', destDir], (tarErr) => {
          if (!tarErr) return resolve();
          try {
            const buf = fs.readFileSync(archivePath);
            const unzipped = unzipSync(buf);
            for (const [relPath, fileData] of Object.entries(unzipped)) {
              const fullOut = path.join(destDir, relPath);
              if (relPath.endsWith('/')) {
                fs.mkdirSync(fullOut, { recursive: true });
              } else {
                fs.mkdirSync(path.dirname(fullOut), { recursive: true });
                fs.writeFileSync(fullOut, Buffer.from(fileData));
              }
            }
            resolve();
          } catch (fflateErr) {
            reject(new Error(`Konnte Archiv nicht entpacken: ${unzipErr.message}`));
          }
        });
      });
    }
  });
}

function getJavaVersion(javaExecutable) {
  return new Promise((resolve) => {
    if (!javaExecutable) return resolve(null);
    execFile(javaExecutable, ['-version'], { timeout: 8000, windowsHide: true }, (err, stdout, stderr) => {
      const out = (stderr || '') + ' ' + (stdout || '');
      const match = out.match(/version\s+"(\d+)/i) || out.match(/build\s+(\d+)/i) || out.match(/openjdk\s+(\d+)/i);
      if (match && match[1]) {
        resolve(parseInt(match[1], 10));
      } else {
        resolve(null);
      }
    });
  });
}

// Java-Pfad Caching, um wiederholte langwierige System-Scans und exec-Aufrufe zu vermeiden
const javaVersionCache = new Map();

function getRequiredJavaVersion(gameVersion) {
  if (!gameVersion) return 25;
  const v = String(gameVersion).trim();
  if (v.startsWith('26') || v.startsWith('25') || v.startsWith('24')) return 25;
  if (v.startsWith('1.21') || v.startsWith('1.20.5') || v.startsWith('1.20.6')) return 21;
  if (v.startsWith('1.18') || v.startsWith('1.19') || v.startsWith('1.20')) return 17;
  return 25;
}

async function findJavaForVersion(requiredVersion, configuredPath) {
  const cacheKey = `${requiredVersion}:${configuredPath || ''}`;
  if (javaVersionCache.has(cacheKey)) {
    const cached = javaVersionCache.get(cacheKey);
    if (cached === 'javaw' || cached === 'java' || fs.existsSync(cached)) {
      return cached;
    }
    javaVersionCache.delete(cacheKey);
  }

  // 1. Lokales Launcher-Runtime-Verzeichnis prüfen (schnellster Treffer)
  const localRuntimeDir = path.join(gameDir, 'runtime', `java-${requiredVersion}`);
  const localJava = findJavaExecutable(localRuntimeDir);
  if (localJava && fs.existsSync(localJava)) {
    javaVersionCache.set(cacheKey, localJava);
    return localJava;
  }

  // 2. Explizit konfigurierten Pfad aus den Einstellungen prüfen
  if (configuredPath && configuredPath !== 'java' && configuredPath !== 'javaw' && fs.existsSync(configuredPath)) {
    const v = await getJavaVersion(configuredPath);
    if (v === requiredVersion || (requiredVersion === 25 && v >= 25)) {
      javaVersionCache.set(cacheKey, configuredPath);
      return configuredPath;
    }
  }

  // 3. System-Pfad javaw / java prüfen (z. B. installiertes Java)
  if (process.platform === 'win32') {
    const pathVersion = await getJavaVersion('javaw');
    if (pathVersion === requiredVersion || (requiredVersion === 25 && pathVersion >= 25)) {
      javaVersionCache.set(cacheKey, 'javaw');
      return 'javaw';
    }
  }
  const javaPathVersion = await getJavaVersion('java');
  if (javaPathVersion === requiredVersion || (requiredVersion === 25 && javaPathVersion >= 25)) {
    javaVersionCache.set(cacheKey, 'java');
    return 'java';
  }

  // 4. Standard-Pfade des jeweiligen Betriebssystems durchsuchen
  const isWin = process.platform === 'win32';
  const searchBases = isWin ? [
    'C:\\Program Files\\Eclipse Adoptium',
    'C:\\Program Files\\Java',
    'C:\\Program Files\\Microsoft',
    'C:\\Program Files\\BellSoft',
    'C:\\Program Files\\Amazon Corretto',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Eclipse Adoptium'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Common', 'Java')
  ] : [
    '/usr/lib/jvm',
    '/usr/java',
    '/opt/java',
    '/opt/jdk',
    path.join(os.homedir(), '.jdks'),
    path.join(os.homedir(), '.sdkman', 'candidates', 'java')
  ];

  for (const base of searchBases) {
    if (fs.existsSync(base)) {
      try {
        const dirs = fs.readdirSync(base);
        for (const dir of dirs) {
          if (dir.includes(String(requiredVersion))) {
            const candidate = isWin
              ? path.join(base, dir, 'bin', 'javaw.exe')
              : path.join(base, dir, 'bin', 'java');
            if (fs.existsSync(candidate)) {
              const v = await getJavaVersion(candidate);
              if (v === requiredVersion || (requiredVersion === 25 && v >= 25)) {
                javaVersionCache.set(cacheKey, candidate);
                return candidate;
              }
            }
          }
        }
      } catch (e) {}
    }
  }

  return null;
}

async function ensureJavaForGameVersion(gameVersion, configuredPath) {
  const reqVer = getRequiredJavaVersion(gameVersion);
  const existing = await findJavaForVersion(reqVer, configuredPath);
  if (existing) {
    return existing;
  }

  const sendLog = (msg) => {
    if (mainWindow) mainWindow.webContents.send('game-log', msg);
  };

  sendLog(`[Launcher] Für Minecraft ${gameVersion} wird Java ${reqVer} benötigt.`);
  sendLog(`[Launcher] Lade offizielles Eclipse Adoptium Temurin ${reqVer} JRE herunter...`);

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const osType = isWin ? 'windows' : (isMac ? 'mac' : 'linux');
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const ext = isWin ? 'zip' : 'tar.gz';

  const runtimeDir = path.join(gameDir, 'runtime', `java-${reqVer}`);
  const tempArchive = path.join(gameDir, 'runtime', `jre-${reqVer}.${ext}`);
  fs.mkdirSync(path.join(gameDir, 'runtime'), { recursive: true });

  setGameStatus('preparing', `Lade Java ${reqVer} JRE herunter...`, 10);

  const downloadUrl = `https://api.adoptium.net/v3/binary/latest/${reqVer}/ga/${osType}/${arch}/jre/hotspot/normal/eclipse`;

  let lastPercent = -1;
  const onProgress = (percent) => {
    setGameStatus('preparing', `Lade Java ${reqVer} JRE herunter (${percent}%)...`, percent);
    if (percent !== lastPercent && percent % 10 === 0) {
      lastPercent = percent;
      sendLog(`[Download] Java ${reqVer} JRE: ${percent}%`);
    }
  };

  await downloadFileParallel(downloadUrl, tempArchive, onProgress);

  setGameStatus('preparing', `Entpacke Java ${reqVer}...`, 85);
  sendLog(`[Launcher] Entpacke Java ${reqVer}...`);
  if (fs.existsSync(runtimeDir)) {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
  fs.mkdirSync(runtimeDir, { recursive: true });

  await extractArchive(tempArchive, runtimeDir);
  try { fs.unlinkSync(tempArchive); } catch (e) {}

  const extractedJava = findJavaExecutable(runtimeDir);
  if (!extractedJava) {
    throw new Error(`Java-Executable wurde im entpackten Java ${reqVer} Verzeichnis nicht gefunden.`);
  }

  setGameStatus('preparing', `Java ${reqVer} eingerichtet.`, 95);
  sendLog(`[Launcher] Java ${reqVer} erfolgreich eingerichtet: ${extractedJava}`);
  return extractedJava;
}

ipcMain.handle('detect-java', async () => {
  const settings = getSettings();
  const existing = await findJavaForVersion(25, settings.javaPath) || await findJavaForVersion(21, settings.javaPath);
  if (existing) return existing;
  return DEFAULT_JAVA_CMD;
});

// ─── Fabric & Game Launch Helper ───────────────────────────────────────────
// Bereits installierte Fabric-Version für diese Minecraft-Version (Rückfall ohne Internet)
function findInstalledFabricLoader(gameVersion) {
  try {
    const prefix = 'fabric-loader-';
    const suffix = `-${gameVersion}`;
    const found = fs.readdirSync(path.join(gameDir, 'versions'))
      .filter(name => name.startsWith(prefix) && name.endsWith(suffix))
      .map(name => name.slice(prefix.length, name.length - suffix.length))
      .sort();
    return found[found.length - 1] || '';
  } catch (_e) {
    return '';
  }
}

// Fabric-Loader-Versionen für eine Minecraft-Version (neueste zuerst) von meta.fabricmc.net
async function fetchFabricLoaderList(gameVersion) {
  const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(gameVersion)}`, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`meta.fabricmc.net antwortet mit HTTP ${res.status}`);
  const list = await res.json();
  return Array.isArray(list) ? list.filter(entry => entry?.loader?.version) : [];
}

// Nimmt die Fabric-Version aus dem Manifest. Ohne Angabe oder wenn es sie für diese Minecraft-Version nicht gibt,
// gilt die neueste stabile Version.
async function prepareFabricVersionJson(gameVersion, loaderVersion = '') {
  const wanted = String(loaderVersion || '').trim();
  let effectiveLoader = '';
  try {
    const loaders = await fetchFabricLoaderList(gameVersion);
    if (loaders.length > 0) {
      if (wanted && loaders.some(entry => entry.loader.version === wanted)) {
        effectiveLoader = wanted;
      } else {
        if (wanted) emitGameLog(`[Launcher] Fabric ${wanted} gibt es für Minecraft ${gameVersion} nicht, die neueste stabile Version wird genommen.`);
        effectiveLoader = (loaders.find(entry => entry.loader.stable) || loaders[0]).loader.version;
      }
    }
  } catch (_e) { /* ohne Verbindung geht es unten weiter */ }

  if (!effectiveLoader) effectiveLoader = wanted || findInstalledFabricLoader(gameVersion);
  if (!effectiveLoader) throw new Error('Die Fabric-Version konnte nicht ermittelt werden (keine Verbindung zu meta.fabricmc.net).');

  const customVersion = `fabric-loader-${effectiveLoader}-${gameVersion}`;
  const versionDir = path.join(gameDir, 'versions', customVersion);
  if (!fs.existsSync(versionDir)) fs.mkdirSync(versionDir, { recursive: true });

  const targetJsonPath = path.join(versionDir, `${customVersion}.json`);
  if (fs.existsSync(targetJsonPath)) {
    return { versionId: customVersion, jsonPath: targetJsonPath };
  }

  // 1. Mojang Version Manifest abrufen
  const metaRes = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
  const meta = await metaRes.json();
  const vEntry = meta.versions.find(v => v.id === gameVersion);
  if (!vEntry) throw new Error(`Minecraft Version ${gameVersion} nicht bei Mojang gefunden.`);

  const mojangJson = await (await fetch(vEntry.url)).json();

  // 2. Fabric Loader Profile von meta.fabricmc.net abrufen
  const fabricUrl = `https://meta.fabricmc.net/v2/versions/loader/${gameVersion}/${effectiveLoader}/profile/json`;
  const fabricRes = await fetch(fabricUrl);
  if (!fabricRes.ok) throw new Error(`Fabric Profile konnte nicht von meta.fabricmc.net geladen werden.`);
  const fabricJson = await fabricRes.json();

  // 3. Beide Manifeste für MCLC kombinieren
  const merged = {
    ...mojangJson,
    id: fabricJson.id,
    mainClass: fabricJson.mainClass,
    libraries: [...fabricJson.libraries, ...mojangJson.libraries]
  };

  fs.writeFileSync(targetJsonPath, JSON.stringify(merged, null, 2), 'utf8');
  return { versionId: customVersion, jsonPath: targetJsonPath };
}

ipcMain.handle('fabric-loader-versions', async (event, gameVersion) => {
  const version = String(gameVersion || '').trim();
  if (!/^[0-9A-Za-z._-]{1,32}$/.test(version)) return { success: false, error: 'Ungültige Minecraft-Version.' };
  try {
    const loaders = await fetchFabricLoaderList(version);
    return { success: true, versions: loaders.map(entry => ({ version: entry.loader.version, stable: Boolean(entry.loader.stable) })) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Versionen vom BisectHosting-Server auslesen (Fabric-Loader und Minecraft), soweit das Panel sie in den Dateien verrät
ipcMain.handle('server-detect-versions', async () => {
  const serverId = getSettings().bisectConfig?.serverId;
  if (!serverId) return { success: false, error: 'Keine Verbindung zu BisectHosting. Trage die Zugangsdaten ein und teste die Verbindung.' };

  const list = async (dir) => {
    const res = await bisectRequest({ endpoint: `/api/client/servers/${serverId}/files/list?directory=${encodeURIComponent(dir)}` });
    return res.success ? (res.data?.data || []).map(item => item.attributes) : null;
  };
  const folderNames = (entries) => (entries || []).filter(entry => entry && entry.is_file === false).map(entry => entry.name);
  const newest = (names) => [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop() || '';

  try {
    const checked = [];
    // Fabric-Loader: der Server legt ihn unter libraries/net/fabricmc/fabric-loader/<Version> ab
    const loaderFolders = folderNames(await list('/libraries/net/fabricmc/fabric-loader'));
    checked.push('libraries/net/fabricmc/fabric-loader');
    const loaderVersion = newest(loaderFolders.filter(name => /^\d+\.\d+\.\d+/.test(name)));

    // Minecraft: versions/<Version> (Mojang-Starter) oder libraries/net/minecraft/server/<Version>
    let gameVersion = '';
    for (const dir of ['/versions', '/libraries/net/minecraft/server']) {
      checked.push(dir.slice(1));
      const names = folderNames(await list(dir)).map(name => name.split('-')[0]).filter(name => /^\d+(\.\d+){1,2}$/.test(name));
      if (names.length > 0) { gameVersion = newest(names); break; }
    }

    if (!loaderVersion && !gameVersion) {
      return { success: false, error: `Auf dem Server wurde keine Version gefunden (geprüft: ${checked.join(', ')}). Trage sie von Hand ein.` };
    }
    return { success: true, loaderVersion, gameVersion };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── System Tray & Game Process Lifecycle ──────────────────────────────────
let appTray = null;

function createOrUpdateTray() {
  if (appTray) return;
  try {
    const iconPath = path.join(__dirname, 'public', process.platform === 'win32' ? 'app-icon.ico' : 'app-icon.png');
    if (!fs.existsSync(iconPath)) return;

    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    appTray = new Tray(trayIcon);
    appTray.setToolTip('dP Launcher – Minecraft läuft (Launcher pausiert)');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'dP Launcher anzeigen',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
      {
        label: 'Minecraft beenden',
        click: () => {
          killMinecraftProcess();
        }
      },
      { type: 'separator' },
      {
        label: 'Launcher beenden',
        click: () => {
          destroyTray();
          app.quit();
        }
      }
    ]);

    appTray.setContextMenu(contextMenu);

    appTray.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (!mainWindow.isVisible()) {
          mainWindow.show();
          mainWindow.focus();
        } else if (mainWindow.isMinimized()) {
          mainWindow.restore();
          mainWindow.focus();
        } else {
          mainWindow.focus();
        }
      }
    });
  } catch (err) {
    console.warn('Tray konnte nicht initialisiert werden:', err);
  }
}

function destroyTray() {
  if (appTray) {
    try {
      appTray.destroy();
    } catch (_) {}
    appTray = null;
  }
}

// Fragt unter Windows ab, ob der Prozess schon ein Fenster hat (MainWindowHandle ungleich 0)
function minecraftHasWindow(pid) {
  return new Promise(resolve => {
    if (process.platform !== 'win32' || !Number.isInteger(pid)) return resolve(false);
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).MainWindowHandle`],
      { windowsHide: true, timeout: 5000 },
      (err, stdout) => resolve(!err && Number(String(stdout).trim()) > 0)
    );
  });
}

let minecraftReady = false;
let minecraftWatchTimer = null;
const MINECRAFT_WINDOW_TIMEOUT_MS = 3 * 60 * 1000;

function stopWatchingMinecraft() {
  if (minecraftWatchTimer) {
    clearInterval(minecraftWatchTimer);
    minecraftWatchTimer = null;
  }
}

// Minecraft ist gestartet, aber das Fenster ist noch nicht da: Startanzeige bleibt bis dahin sichtbar
function handleMinecraftStarted(proc) {
  activeMinecraftProcess = proc;
  minecraftReady = false;
  stopWatchingMinecraft();
  setGameStatus('starting', 'Minecraft öffnet sich...', 98);
  emitGameLog(`[Launcher] Minecraft-Prozess läuft (PID: ${proc.pid}), warte auf das Spielfenster...`);

  const startedAt = Date.now();
  let checking = false;
  minecraftWatchTimer = setInterval(async () => {
    if (minecraftReady || activeMinecraftProcess !== proc) return stopWatchingMinecraft();
    if (Date.now() - startedAt > MINECRAFT_WINDOW_TIMEOUT_MS) {
      emitGameLog('[Launcher] Kein Spielfenster erkannt, der Prozess läuft aber. Startanzeige wird beendet.');
      return markMinecraftReady();
    }
    if (checking) return;
    checking = true;
    try {
      if (await minecraftHasWindow(proc.pid)) markMinecraftReady();
    } finally {
      checking = false;
    }
  }, 1500);
}

// Das Spielfenster ist offen: erst jetzt gilt Minecraft als gestartet
function markMinecraftReady() {
  if (minecraftReady || !activeMinecraftProcess) return;
  minecraftReady = true;
  stopWatchingMinecraft();
  setGameStatus('running', 'Minecraft läuft', 100);
  emitGameLog(`[Launcher] Minecraft ist offen (PID: ${activeMinecraftProcess.pid})`);

  const settings = getSettings();
  const behavior = settings.gameLaunchBehavior || 'hide';

  if (behavior === 'hide') {
    emitGameLog('[Launcher] Launcher pausiert und ausgeblendet, um maximale Systemressourcen für Minecraft freizugeben.');
    createOrUpdateTray();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setAudioMuted(true);
      mainWindow.hide();
    }
  } else if (behavior === 'minimize') {
    emitGameLog('[Launcher] Launcher in Taskleiste minimiert.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.minimize();
    }
  } else if (behavior === 'close') {
    emitGameLog('[Launcher] Launcher wird nach Spielstart geschlossen.');
    destroyTray();
    app.quit();
  }
}

function handleMinecraftStopped(code = 0) {
  stopWatchingMinecraft();
  minecraftReady = false;
  activeMinecraftProcess = null;
  setGameStatus('idle', '', 0);
  destroyTray();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setAudioMuted(false);
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    } else if (mainWindow.isMinimized()) {
      mainWindow.restore();
      mainWindow.focus();
    }
  }
}

function killMinecraftProcess() {
  if (activeMinecraftProcess && activeMinecraftProcess.pid) {
    try {
      const pid = activeMinecraftProcess.pid;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('game-log', `[Launcher] Beende Minecraft-Prozess (PID: ${pid})...`);
      }
      setGameStatus('idle', 'Minecraft wird beendet...', 0);

      if (process.platform === 'win32') {
        execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, (err) => {
          if (err) console.warn('Taskkill-Fehler:', err);
        });
      } else {
        activeMinecraftProcess.kill('SIGKILL');
      }

      handleMinecraftStopped(0);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, error: 'Kein laufender Minecraft-Prozess gefunden' };
}

// ─── Game Launch & Process Management ──────────────────────────────────────
ipcMain.handle('get-game-status', () => {
  return currentGameStatus;
});

// Nach einem reinen Abgleich der Mods (ohne Spielstart) darf der Status nicht auf "wird gestartet" stehen bleiben
ipcMain.handle('reset-game-status', () => {
  if (!activeMinecraftProcess) setGameStatus('idle', '', 0);
  return currentGameStatus;
});

ipcMain.handle('kill-game', async () => {
  return killMinecraftProcess();
});

ipcMain.handle('launch-game', (event, launchConfig) => {
  const server = getActiveServer();
  if (!server) return { success: false, error: 'Es ist kein Server ausgewählt. Lege im Reiter Server einen an.' };
  ensureInstanceFolders();
  markPlayed('server', server.id);
  return launchMinecraft({ ...launchConfig, instanceDir: getInstanceDir() });
});

// Startet den gespeicherten Entwurf in einer eigenen Instanz. Assets, Bibliotheken und
// Versionen werden geteilt, Mods, Einstellungen und Welten liegen getrennt.
handleAdmin('modpack-launch-test', async () => {
  if (activeMinecraftProcess || currentGameStatus.status !== 'idle') {
    return { success: false, error: 'Minecraft läuft bereits oder wird gerade gestartet.' };
  }

  const draft = readJsonFile(modpackDraftPath());
  if (!draft?.mods?.length) {
    return { success: false, error: 'Der Entwurf enthält keine Mods.' };
  }

  setGameStatus('preparing', 'Mods der Testinstanz werden abgeglichen...', 5);
  const instanceDir = path.join(gameDir, testInstanceSubDir);
  const sync = await syncModsToDir({ ...draft, cleanOldMods: true }, path.join(instanceDir, 'mods'));
  if (!sync.success) {
    setGameStatus('idle', '', 0);
    return sync;
  }

  return launchMinecraft({
    instanceDir,
    isTestInstance: true,
    serverName: draft.serverName || getActiveServer()?.name,
    listedServerAddress: getActiveServer()?.address || draft.serverAddress,
    gameVersion: draft.gameVersion,
    loader: draft.loader,
    loaderVersion: draft.loaderVersion
  });
});

async function launchMinecraft(launchConfig = {}) {
  try {
    if (activeMinecraftProcess) {
      return { success: false, error: 'Minecraft läuft bereits.' };
    }

    const settings = getSettings();
    let account = settings.account;
    if (!account) {
      return { success: false, error: 'Kein Minecraft-Account angemeldet. Bitte melde dich zuerst an.' };
    }

    setGameStatus('preparing', 'Vorbereitung...', 5);

    // Microsoft-Session validieren und bei Bedarf automatisch mit Refresh-Token erneuern
    if (account.type === 'microsoft' && isTokenExpiredOrExpiringSoon(account)) {
      emitGameLog('[Launcher] Microsoft-Sitzung wird automatisch aktualisiert...');
      try {
        account = await refreshMicrosoftAccount(account);
        emitGameLog('[Launcher] Microsoft-Sitzung erfolgreich erneuert.');
      } catch (authErr) {
        setGameStatus('idle', authErr.message, 0);
        emitGameLog(`[Fehler] ${authErr.message}`);
        return { success: false, error: authErr.message };
      }
    }

    const ramMax = launchConfig.ramMax || settings.ramMax || 6;
    const ramMin = Math.min(settings.ramMin || 2, ramMax);
    const gameVersion = launchConfig.gameVersion || '26.3';
    const loader = (launchConfig.loader || 'fabric').toLowerCase();
    // Leer = neueste stabile Fabric-Version. Fest eingetragen ist nichts mehr.
    const loaderVersion = launchConfig.loaderVersion || '';
    // Die Testinstanz startet im Hauptmenü, der Server muss noch nicht zum Entwurf passen
    const serverAddress = (launchConfig.isTestInstance || launchConfig.noAutoJoin) ? null : (launchConfig.serverAddress || getActiveServer()?.address || settings.serverIp);

    if (mainWindow) {
      if (launchConfig.instanceDir) {
        emitGameLog(`[Launcher] Eigene Instanz: ${launchConfig.instanceDir}`);
      }
      emitGameLog(`[Launcher] Bereite Minecraft ${gameVersion} (${loader}) vor...`);
      emitGameLog(`[Launcher] Spieler: ${account.name} (${account.type})`);
      emitGameLog(`[Launcher] Speicher: ${ramMin}G Min / ${ramMax}G Max`);
      emitGameLog(`[Launcher] Überprüfe Java-Laufzeitumgebung...`);
    }

    await new Promise(r => setImmediate(r));

    let finalJavaPath = DEFAULT_JAVA_CMD;
    try {
      finalJavaPath = await ensureJavaForGameVersion(gameVersion, settings.javaPath);
      emitGameLog(`[Launcher] Java aktiv für ${gameVersion}: ${finalJavaPath}`);
    } catch (javaErr) {
      console.warn('Java Vorbereitung fehlgeschlagen:', javaErr);
      emitGameLog(`[Warnung] Java-Laufzeitumgebung: ${javaErr.message}. Versuche System-Java...`);
      finalJavaPath = settings.javaPath || DEFAULT_JAVA_CMD;
    }

    await new Promise(r => setImmediate(r));

    setGameStatus('preparing', 'Prüfe Fabric Loader...', 25);

    // Fabric Loader Profile vorbereiten
    let customVersion = null;
    if (loader === 'fabric') {
      try {
        emitGameLog(`[Launcher] Prüfe Fabric Loader Konfiguration...`);
        const fabricInfo = await prepareFabricVersionJson(gameVersion, loaderVersion);
        customVersion = fabricInfo.versionId;
      } catch (err) {
        console.warn('Fabric Version JSON Fehler:', err);
        emitGameLog(`[Warnung] Fabric Version konnte nicht geladen werden: ${err.message}`);
      }
    }

    await new Promise(r => setImmediate(r));

    // Authentifizierung vorbereiten
    let authObj = null;
    if (account.token && account.token.access_token) {
      authObj = account.token;
    } else {
      authObj = {
        access_token: '0',
        client_token: '0',
        uuid: account.uuid || crypto.randomUUID().replace(/-/g, ''),
        name: account.name,
        user_properties: '{}'
      };
    }

    // Server-Direktverbindung vorbereiten
    let quickPlayOpt = undefined;
    if (serverAddress && serverAddress.trim() && !serverAddress.includes('dein-server')) {
      quickPlayOpt = {
        type: 'multiplayer',
        identifier: serverAddress.trim()
      };
    }

    // Deutsche Sprache und Server in der Liste, auch in der Testinstanz
    applyClientDefaults(launchConfig.instanceDir || getInstanceDir(), {
      name: launchConfig.serverName,
      address: launchConfig.listedServerAddress || serverAddress
    }, { graphicsBackend: settings.graphicsBackend }).forEach(note => {
      emitGameLog(`[Warnung] ${note}`);
    });

    await new Promise(r => setImmediate(r));

    const launcher = new MCLCClient();

    let lastProgressPct = -1;
    let lastProgressTime = 0;

    launcher.on('debug', (e) => {
      const str = String(e || '');
      // Wichtige Debug-Infos loggen, unzählige Hash- oder Byte-Detailzeilen drosseln
      if (str.includes('[MCLC]:') || str.includes('Launching') || str.includes('Error') || str.includes('Exception')) {
        emitGameLog(str);
      }
    });

    launcher.on('data', (e) => {
      emitGameLog(`[Minecraft] ${e}`);
      // Zusätzliches Signal neben der Fensterprüfung: Rendering ist initialisiert
      if (!minecraftReady && activeMinecraftProcess && /OpenAL initialized|Created: \d+x\d+x\d+ minecraft:textures\/atlas/.test(String(e))) {
        markMinecraftReady();
      }
    });

    launcher.on('progress', (e) => {
      const pct = e.total > 0 ? Math.round((e.current / e.total) * 100) : 0;
      const now = Date.now();
      // Throttling: Max alle 120ms oder bei min 2% Sprung oder bei 100%
      if (pct === 100 || Math.abs(pct - lastProgressPct) >= 2 || (now - lastProgressTime > 120)) {
        lastProgressPct = pct;
        lastProgressTime = now;
        setGameStatus('downloading', `${e.type}: ${e.task}`, pct);
      }
    });

    launcher.on('close', (code) => {
      handleMinecraftStopped(code);
      emitGameLog(`[Launcher] Minecraft wurde beendet (Exit-Code: ${code})`);
    });

    const launchOpts = {
      authorization: authObj,
      root: gameDir,
      version: {
        number: gameVersion,
        type: 'release',
        custom: customVersion
      },
      memory: {
        max: `${ramMax}G`,
        min: `${ramMin}G`
      },
      javaPath: finalJavaPath,
      quickPlay: quickPlayOpt,
      ...(launchConfig.instanceDir ? { overrides: { gameDirectory: launchConfig.instanceDir } } : {})
    };

    setGameStatus('starting', 'Minecraft wird gestartet...', 95);
    emitGameLog(`[Launcher] Starte Minecraft-Prozess...`);

    // Event Loop noch einmal atmen lassen vor dem eigentlichen Prozessstart
    await new Promise(r => setImmediate(r));

    // Asynchron starten und Prozess-Referenz erfassen
    launcher.launch(launchOpts)
      .then(proc => {
        if (proc && proc.pid) {
          handleMinecraftStarted(proc);

          proc.on('close', (code) => {
            handleMinecraftStopped(code);
          });
        }
      })
      .catch(err => {
        handleMinecraftStopped(-1);
        setGameStatus('idle', `Fehler: ${err.message}`, 0);
        console.error('MCLC Launch Error:', err);
        emitGameLog(`[Fehler beim Start] ${err.message}`);
      });

    return { success: true, message: 'Minecraft wird gestartet' };
  } catch (err) {
    handleMinecraftStopped(-1);
    setGameStatus('idle', `Fehler: ${err.message}`, 0);
    console.error('Launch Error:', err);
    return { success: false, error: err.message };
  }
}

// ─── Auto-Update (GitHub Releases & Pages) ──────────────────────────────────
function unzipFile(zipPath, destDir) {
  return extractArchive(zipPath, destDir);
}

function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Prüft, ob die App per NSIS-Installer installiert wurde (Uninstaller liegt im App-Ordner)
function isInstalledNsis() {
  if (process.platform !== 'win32') return false;
  const appDir = path.dirname(process.execPath);
  return ['Uninstall dP Launcher.exe', 'uninstall.exe', 'unins000.exe']
    .some(f => fs.existsSync(path.join(appDir, f)));
}

ipcMain.handle('check-for-update', async (event, currentVersion) => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/dPandl/dP-Launcher/releases/latest',
      headers: { 'User-Agent': 'minecraft-launcher-updater' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          const rawTag = release.tag_name || '';
          const latestVersion = rawTag.replace(/^v/, '');

          const parseVer = (v) => v.split('.').map(Number);
          const cur = parseVer(currentVersion);
          const lat = parseVer(latestVersion);
          let hasUpdate = false;
          for (let i = 0; i < Math.max(cur.length, lat.length); i++) {
            const a = cur[i] || 0, b = lat[i] || 0;
            if (b > a) { hasUpdate = true; break; }
            if (a > b) break;
          }

          let osKey = '';
          if (process.platform === 'win32') osKey = 'win';
          else if (process.platform === 'linux') osKey = 'linux';

          let downloadUrl = null;
          if (hasUpdate && osKey && release.assets) {
            // Installierte Windows-Version: NSIS-Setup (.exe) bevorzugen
            if (osKey === 'win' && isInstalledNsis()) {
              const installer = release.assets.find(a => a.name.toLowerCase().endsWith('.exe') && !a.name.includes('blockmap'));
              if (installer) downloadUrl = installer.browser_download_url;
            }
            // Portable / Linux / Fallback: ZIP
            if (!downloadUrl) {
              const asset = release.assets.find(a => a.name.includes(osKey) && a.name.endsWith('.zip'));
              if (asset) downloadUrl = asset.browser_download_url;
            }
          }

          resolve({ hasUpdate, latestVersion, downloadUrl, releaseNotes: release.body || '' });
        } catch (e) {
          resolve({ hasUpdate: false, latestVersion: null, downloadUrl: null });
        }
      });
      res.on('error', () => resolve({ hasUpdate: false, latestVersion: null, downloadUrl: null }));
    }).on('error', () => resolve({ hasUpdate: false, latestVersion: null, downloadUrl: null }));
  });
});

ipcMain.handle('download-and-install-update', async (event, downloadUrl) => {
  try {
    const tmpDir = os.tmpdir();

    // Nur Downloads von GitHub zulassen
    let host = '';
    try { host = new URL(String(downloadUrl)).hostname; } catch { /* ungültig */ }
    if (!/(^|\.)github\.com$|(^|\.)githubusercontent\.com$/.test(host)) {
      return { success: false, error: 'Ungültige Update-URL.' };
    }

    if (String(downloadUrl).toLowerCase().endsWith('.exe')) {
      // Installierte Version: Setup herunterladen, still ausführen, App startet danach neu
      const installerPath = path.join(tmpDir, 'dp-launcher-setup-update.exe');
      if (mainWindow) mainWindow.webContents.send('update-progress', 0);
      await downloadFileParallel(downloadUrl, installerPath, (percent) => {
        if (mainWindow) mainWindow.webContents.send('update-progress', percent);
      });
      if (mainWindow) mainWindow.webContents.send('update-progress', 100);
      spawn(installerPath, ['/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      app.quit();
      return { success: true };
    }

    const zipPath = path.join(tmpDir, 'mc-launcher-update.zip');
    const extractDir = path.join(tmpDir, 'mc-launcher-update-extracted');

    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });

    if (mainWindow) mainWindow.webContents.send('update-progress', 0);
    await downloadFileParallel(downloadUrl, zipPath, (percent) => {
      if (mainWindow) mainWindow.webContents.send('update-progress', percent);
    });

    await unzipFile(zipPath, extractDir);

    const appDir = path.dirname(process.execPath);
    const entries = fs.readdirSync(extractDir);
    let sourceDir = extractDir;
    if (entries.length === 1) {
      const single = path.join(extractDir, entries[0]);
      if (fs.statSync(single).isDirectory()) {
        sourceDir = single;
      }
    }

    if (process.platform === 'win32') {
      const batPath = path.join(tmpDir, 'mc-launcher-update.bat');
      const batContent = [
        '@echo off',
        'timeout /t 2 /nobreak > nul',
        `xcopy /E /Y /I "${sourceDir}\\*" "${appDir}\\" > nul 2>&1`,
        `start "" "${process.execPath}"`,
        'del "%~f0"'
      ].join('\r\n');
      fs.writeFileSync(batPath, batContent, 'utf8');
      spawn('cmd.exe', ['/c', batPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
      app.quit();
    } else {
      const shPath = path.join(tmpDir, 'mc-launcher-update.sh');
      const shContent = [
        '#!/bin/sh',
        'sleep 2',
        `cp -rf "${sourceDir}/." "${appDir}/"`,
        `"${process.execPath}" &`,
        'rm -f "$0"'
      ].join('\n');
      fs.writeFileSync(shPath, shContent, { mode: 0o755 });
      const updater = spawn('sh', [shPath], { detached: true, stdio: 'ignore' });
      updater.unref();
      app.quit();
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Utility IPC ───────────────────────────────────────────────────────────
ipcMain.handle('open-external', async (event, url) => {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return { success: false, error: 'Ungültige URL' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { success: false, error: 'Nur http(s)-Links erlaubt' };
  }
  await shell.openExternal(parsed.href);
});

ipcMain.handle('show-message', async (event, { type = 'info', message, title = 'dP Launcher' }) => {
  return await dialog.showMessageBox(mainWindow, { type, message, title, buttons: ['OK'] });
});
