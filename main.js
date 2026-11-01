import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import os from 'os';
import crypto from 'crypto';
import { execFile, exec, spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

// Standard-Gameverzeichnis: Eigenständiges Verzeichnis, damit normale .minecraft unberührt bleibt
const gameDir = path.join(app.getPath('appData'), '.server-minecraft-launcher');
const settingsPath = path.join(app.getPath('userData'), 'launcher-settings.json');

// Ordnerstruktur sicherstellen
['mods', 'resourcepacks', 'shaderpacks', 'config', 'logs'].forEach(folder => {
  const folderPath = path.join(gameDir, folder);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
});

// Standard-Einstellungen
const defaultSettings = {
  ramMin: 2,
  ramMax: 6,
  javaPath: '',
  username: 'Spieler',
  themeSeason: 'auto', // 'auto' | 'spring' | 'summer' | 'autumn' | 'winter'
  manifestUrl: '',
  serverIp: 'dein-server.bisecthosting.me:25565',
  autoSyncOnStart: true
};

function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return { ...defaultSettings, ...JSON.parse(data) };
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
    fs.writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (err) {
    console.error('Fehler beim Speichern der Einstellungen:', err);
    return null;
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

// Download Helfer mit Redirects
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = (currentUrl) => {
      const mod = currentUrl.startsWith('https') ? https : http;
      mod.get(currentUrl, { headers: { 'User-Agent': 'Electron-Minecraft-Launcher/1.0 (contact@github.com)' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} beim Herunterladen von ${currentUrl}`));
          return;
        }
        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (onProgress && totalBytes > 0) {
            onProgress(Math.round((downloadedBytes / totalBytes) * 100));
          }
        });
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
        file.on('error', reject);
        res.on('error', reject);
      }).on('error', reject);
    };
    request(url);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false, // Frameless für modernes Aussehen
    titleBarStyle: 'hidden',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, 'public', 'app-icon.png'),
  });

  mainWindow.setMenuBarVisibility(false);

  if (!app.isPackaged && process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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

// ─── Game & Directories ─────────────────────────────────────────────────────
ipcMain.handle('get-game-dir', () => gameDir);

ipcMain.handle('open-game-dir', async (event, subDir = '') => {
  const target = subDir ? path.join(gameDir, subDir) : gameDir;
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  await shell.openPath(target);
});

ipcMain.handle('get-installed-items', async (event, category = 'mods') => {
  const targetDir = path.join(gameDir, category);
  if (!fs.existsSync(targetDir)) return [];

  const files = fs.readdirSync(targetDir);
  const items = [];
  for (const filename of files) {
    const fullPath = path.join(targetDir, filename);
    const stat = fs.statSync(fullPath);
    if (!stat.isDirectory()) {
      items.push({
        filename,
        size: stat.size,
        modified: stat.mtimeMs,
        enabled: !filename.endsWith('.disabled')
      });
    }
  }
  return items;
});

ipcMain.handle('delete-item', async (event, { category, filename }) => {
  try {
    const filePath = path.join(gameDir, category, filename);
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
    const modsDir = path.join(gameDir, 'mods');
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
ipcMain.handle('get-settings', () => getSettings());

ipcMain.handle('save-settings', (event, newSettings) => {
  return saveSettings(newSettings);
});

ipcMain.handle('fetch-remote-manifest', async (event, url) => {
  if (!url || typeof url !== 'string' || !url.trim().startsWith('http')) {
    return null;
  }
  return new Promise((resolve) => {
    const request = (targetUrl) => {
      const mod = targetUrl.startsWith('https') ? https : http;
      mod.get(targetUrl, { headers: { 'User-Agent': 'MinecraftLauncher/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(null);
          }
        });
        res.on('error', () => resolve(null));
      }).on('error', () => resolve(null));
    };
    request(url.trim());
  });
});

// ─── Modrinth & Server Sync ────────────────────────────────────────────────
ipcMain.handle('download-modrinth-file', async (event, { url, filename, category = 'mods' }) => {
  try {
    const targetDir = path.join(gameDir, category);
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
  try {
    const modsDir = path.join(gameDir, 'mods');
    if (!fs.existsSync(modsDir)) fs.mkdirSync(modsDir, { recursive: true });

    const requiredMods = manifest.requiredMods || [];
    const total = requiredMods.length;
    let completed = 0;
    const syncedFiles = new Set();

    for (const mod of requiredMods) {
      const filename = mod.filename || `${mod.slug}.jar`;
      const targetPath = path.join(modsDir, filename);
      syncedFiles.add(filename);

      // Status an Renderer melden
      if (mainWindow) {
        mainWindow.webContents.send('sync-progress', {
          current: completed + 1,
          total,
          modName: mod.name || mod.slug,
          status: 'checking'
        });
      }

      // Prüfen ob Datei bereits existiert und SHA-1 übereinstimmt
      let needsDownload = true;
      if (fs.existsSync(targetPath)) {
        if (mod.hashes && mod.hashes.sha1) {
          const localHash = await getFileSha1(targetPath);
          if (localHash && localHash.toLowerCase() === mod.hashes.sha1.toLowerCase()) {
            needsDownload = false;
          }
        } else {
          // Falls kein Hash vorliegt, aber Datei existiert
          needsDownload = false;
        }
      }

      if (needsDownload) {
        if (mainWindow) {
          mainWindow.webContents.send('sync-progress', {
            current: completed + 1,
            total,
            modName: mod.name || mod.slug,
            status: 'downloading'
          });
        }
        await downloadFile(mod.downloadUrl, targetPath);
      }

      completed++;
    }

    // Optional: Aufräumen von alten Mods, die im Manifest nicht mehr gelistet sind
    if (manifest.cleanOldMods) {
      const existingFiles = fs.readdirSync(modsDir);
      for (const file of existingFiles) {
        if (file.endsWith('.jar') && !syncedFiles.has(file)) {
          try {
            fs.unlinkSync(path.join(modsDir, file));
          } catch (e) {
            console.warn('Alte Mod konnte nicht gelöscht werden:', file);
          }
        }
      }
    }

    if (mainWindow) {
      mainWindow.webContents.send('sync-progress', {
        current: total,
        total,
        status: 'completed'
      });
    }

    return { success: true, count: completed };
  } catch (err) {
    console.error('Sync Fehler:', err);
    return { success: false, error: err.message };
  }
});

// ─── Java Detection ────────────────────────────────────────────────────────
ipcMain.handle('detect-java', async () => {
  const javaPaths = [];
  
  // Standard-Pfade auf Windows
  const candidatePaths = [
    'java',
    'javaw',
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe') : null,
    'C:\\Program Files\\Eclipse Adoptium\\jre-21-hotspot\\bin\\javaw.exe',
    'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
    'C:\\Program Files\\Microsoft\\jdk-21.0.0\\bin\\javaw.exe'
  ].filter(Boolean);

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p) || p === 'java' || p === 'javaw') {
        javaPaths.push(p);
      }
    } catch (e) {}
  }

  return javaPaths.length > 0 ? javaPaths[0] : 'java';
});

// ─── Game Launch ───────────────────────────────────────────────────────────
ipcMain.handle('launch-game', async (event, launchConfig) => {
  try {
    const settings = getSettings();
    const javaPath = settings.javaPath || 'java';
    const ramMax = settings.ramMax || 4;

    // Log-Meldung an Renderer senden
    if (mainWindow) {
      mainWindow.webContents.send('game-log', `[Launcher] Starte Minecraft mit ${ramMax}GB RAM...`);
      mainWindow.webContents.send('game-log', `[Launcher] Server: ${settings.serverIp || 'Kein Server'}`);
      mainWindow.webContents.send('game-log', `[Launcher] Spielverzeichnis: ${gameDir}`);
    }

    return { success: true, message: 'Spielstart vorbereitet' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Auto-Update (GitHub Releases & Pages) ──────────────────────────────────
function unzipFile(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === 'win32') {
      const cmd = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`;
      exec(`powershell.exe -NoProfile -Command "${cmd}"`, (err) => {
        if (err) reject(err); else resolve();
      });
    } else {
      execFile('unzip', ['-o', zipPath, '-d', destDir], (err) => {
        if (err) reject(err); else resolve();
      });
    }
  });
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

ipcMain.handle('check-for-update', async (event, currentVersion) => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/dPandl/electron-minecraft-launcher/releases/latest',
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
            const asset = release.assets.find(a => a.name.includes(osKey) && a.name.endsWith('.zip'));
            if (asset) downloadUrl = asset.browser_download_url;
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
    const zipPath = path.join(tmpDir, 'mc-launcher-update.zip');
    const extractDir = path.join(tmpDir, 'mc-launcher-update-extracted');

    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });

    if (mainWindow) mainWindow.webContents.send('update-progress', 0);
    await downloadFile(downloadUrl, zipPath, (percent) => {
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
      exec(`start "" /b "${batPath}"`, { detached: true, windowsHide: true });
      app.quit();
    } else {
      copyDir(sourceDir, appDir);
      app.relaunch();
      app.quit();
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Utility IPC ───────────────────────────────────────────────────────────
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
});

ipcMain.handle('show-message', async (event, { type = 'info', message, title = 'Minecraft Launcher' }) => {
  return await dialog.showMessageBox(mainWindow, { type, message, title, buttons: ['OK'] });
});
