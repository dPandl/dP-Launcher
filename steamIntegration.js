// Steam-Anbindung: erkennt ein Steam Deck, trägt den Launcher als Nicht-Steam-Spiel ein
// (shortcuts.vdf) und legt die Bilder (Poster, Grid, Banner, Icon, Logo) im Grid-Ordner ab.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { BrowserWindow } from 'electron';

const APP_NAME = 'dP Launcher';

// ─── Steam Deck erkennen ───────────────────────────────────────────────────
export function isSteamDeck() {
  if (process.platform !== 'linux') return false;
  if (process.env.SteamDeck === '1' || process.env.SteamOS === '1') return true;
  try {
    const vendor = fs.readFileSync('/sys/devices/virtual/dmi/id/board_vendor', 'utf8').trim();
    const board = fs.readFileSync('/sys/devices/virtual/dmi/id/board_name', 'utf8').trim();
    if (vendor === 'Valve' && /^(Jupiter|Galileo)/i.test(board)) return true;
  } catch { /* keine DMI-Daten */ }
  try {
    return /^ID=steamos/m.test(fs.readFileSync('/etc/os-release', 'utf8'));
  } catch { return false; }
}

// ─── Steam-Ordner finden ───────────────────────────────────────────────────
function readWindowsSteamPath() {
  return new Promise(resolve => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      const match = /SteamPath\s+REG_SZ\s+(.+)/i.exec(stdout);
      resolve(match ? path.normalize(match[1].trim()) : null);
    });
  });
}

async function findSteamDirs() {
  const candidates = [];
  if (process.platform === 'win32') {
    const fromRegistry = await readWindowsSteamPath();
    if (fromRegistry) candidates.push(fromRegistry);
    candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam');
  } else if (process.platform === 'linux') {
    const home = os.homedir();
    candidates.push(
      path.join(home, '.steam', 'steam'),
      path.join(home, '.local', 'share', 'Steam'),
      path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
      path.join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam')
    );
  }
  const seen = new Set();
  const found = [];
  for (const dir of candidates) {
    let real;
    try { real = fs.realpathSync(dir); } catch { continue; }
    if (seen.has(real) || !fs.existsSync(path.join(real, 'userdata'))) continue;
    seen.add(real);
    found.push(real);
  }
  return found;
}

// Alle Steam-Konten (userdata/<Nummer>), die schon einmal angemeldet waren
async function findUserDirs() {
  const dirs = [];
  for (const steamDir of await findSteamDirs()) {
    const userdata = path.join(steamDir, 'userdata');
    for (const entry of fs.readdirSync(userdata, { withFileTypes: true })) {
      if (entry.isDirectory() && /^\d+$/.test(entry.name) && entry.name !== '0') {
        dirs.push(path.join(userdata, entry.name));
      }
    }
  }
  return dirs;
}

// ─── Binäres VDF (shortcuts.vdf) ───────────────────────────────────────────
// Typen: 0 = Liste, 1 = Text, 2 = Zahl (32 Bit), 8 = Ende einer Liste
function parseVdf(buffer) {
  let pos = 0;
  const readString = () => {
    const end = buffer.indexOf(0, pos);
    if (end === -1) throw new Error('shortcuts.vdf ist beschädigt');
    const value = buffer.toString('utf8', pos, end);
    pos = end + 1;
    return value;
  };
  const readMap = () => {
    const map = [];
    while (pos < buffer.length) {
      const type = buffer[pos++];
      if (type === 8) return map;
      const key = readString();
      if (type === 0) map.push([key, readMap()]);
      else if (type === 1) map.push([key, readString()]);
      else if (type === 2) { map.push([key, { int: buffer.readInt32LE(pos) }]); pos += 4; }
      else throw new Error(`Unbekannter Typ ${type} in shortcuts.vdf`);
    }
    return map;
  };
  return readMap();
}

function serializeVdf(map) {
  const parts = [];
  const writeMap = list => {
    for (const [key, value] of list) {
      const name = Buffer.from(`${key}\0`, 'utf8');
      if (Array.isArray(value)) {
        parts.push(Buffer.from([0]), name);
        writeMap(value);
      } else if (typeof value === 'string') {
        parts.push(Buffer.from([1]), name, Buffer.from(`${value}\0`, 'utf8'));
      } else {
        const num = Buffer.alloc(4);
        num.writeInt32LE(value.int | 0);
        parts.push(Buffer.from([2]), name, num);
      }
    }
    parts.push(Buffer.from([8]));
  };
  writeMap(map);
  return Buffer.concat(parts);
}

const getField = (entry, name) => {
  const hit = entry.find(([key]) => key.toLowerCase() === name.toLowerCase());
  return hit ? hit[1] : undefined;
};

// ─── Steam-Kennung des Eintrags ────────────────────────────────────────────
function crc32(text) {
  let crc = 0xFFFFFFFF;
  for (const byte of Buffer.from(text, 'utf8')) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Bilder und Eintrag brauchen dieselbe Kennung: CRC32 aus Programm und Name, oberstes Bit gesetzt
const shortcutAppId = exe => (crc32(`${exe}${APP_NAME}`) | 0x80000000) >>> 0;

// Das Programm, das Steam starten soll (AppImage: die Datei selbst, nicht der entpackte Ordner)
function launcherExecutable() {
  const exe = process.env.APPIMAGE || process.execPath;
  return `"${exe}"`;
}

// ─── Bilder erzeugen ───────────────────────────────────────────────────────
// Gezeichnet wird in einem unsichtbaren Fenster mit Canvas, so braucht es keine zusätzlichen Pakete.
async function renderArtwork(iconPath) {
  const iconData = `data:image/png;base64,${fs.readFileSync(iconPath).toString('base64')}`;
  const win = new BrowserWindow({ show: false, width: 100, height: 100, webPreferences: { offscreen: true } });
  try {
    await win.loadURL('data:text/html,<html></html>');
    const script = `(async () => {
      const icon = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = ${JSON.stringify(iconData)}; });
      const font = '800 %PX%px "Segoe UI", "Noto Sans", "DejaVu Sans", Arial, sans-serif';
      const make = (w, h, draw) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); draw(g, w, h);
        return c.toDataURL('image/png').split(',')[1];
      };
      const background = (g, w, h) => {
        const grad = g.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#0f172a'); grad.addColorStop(0.55, '#1e1b4b'); grad.addColorStop(1, '#4c1d95');
        g.fillStyle = grad; g.fillRect(0, 0, w, h);
      };
      const text = (g, x, y, px, align) => {
        g.font = font.replace('%PX%', px); g.textAlign = align; g.textBaseline = 'middle';
        g.fillStyle = '#ffffff'; g.fillText(${JSON.stringify(APP_NAME)}, x, y);
      };
      return {
        poster: make(600, 900, (g, w, h) => { background(g, w, h); g.drawImage(icon, 140, 190, 320, 320); text(g, w / 2, 620, 64, 'center'); }),
        grid: make(920, 430, (g, w, h) => { background(g, w, h); g.drawImage(icon, 70, 95, 240, 240); text(g, 340, h / 2, 76, 'left'); }),
        hero: make(1920, 620, (g, w, h) => { background(g, w, h); g.globalAlpha = 0.18; g.drawImage(icon, 1180, -140, 900, 900); g.globalAlpha = 1; }),
        icon: make(256, 256, (g, w, h) => { g.drawImage(icon, 0, 0, w, h); }),
        logo: make(960, 360, (g, w, h) => { g.drawImage(icon, 20, 60, 240, 240); text(g, 290, h / 2, 96, 'left'); })
      };
    })()`;
    const result = await win.webContents.executeJavaScript(script);
    return Object.fromEntries(Object.entries(result).map(([key, b64]) => [key, Buffer.from(b64, 'base64')]));
  } finally {
    win.destroy();
  }
}

// ─── Öffentliche Funktionen ────────────────────────────────────────────────
export async function getSteamInfo() {
  const users = await findUserDirs();
  const exe = launcherExecutable();
  const added = users.some(userDir => {
    try {
      const file = path.join(userDir, 'config', 'shortcuts.vdf');
      if (!fs.existsSync(file)) return false;
      const shortcuts = getField(parseVdf(fs.readFileSync(file)), 'shortcuts') || [];
      return shortcuts.some(([, entry]) => getField(entry, 'AppName') === APP_NAME && getField(entry, 'Exe') === exe);
    } catch { return false; }
  });
  return {
    supported: process.platform === 'win32' || process.platform === 'linux',
    isDeck: isSteamDeck(),
    steamFound: users.length > 0,
    added
  };
}

export async function addToSteam(iconPath) {
  const users = await findUserDirs();
  if (!users.length) {
    return { success: false, error: 'Steam wurde nicht gefunden. Starte Steam einmal und melde dich an.' };
  }
  const exe = launcherExecutable();
  const appId = shortcutAppId(exe);
  const artwork = await renderArtwork(iconPath);
  const startDir = `"${path.dirname(process.env.APPIMAGE || process.execPath)}"`;
  const imageFiles = {
    [`${appId}p.png`]: artwork.poster,
    [`${appId}.png`]: artwork.grid,
    [`${appId}_hero.png`]: artwork.hero,
    [`${appId}_logo.png`]: artwork.logo,
    [`${appId}_icon.png`]: artwork.icon
  };

  for (const userDir of users) {
    const configDir = path.join(userDir, 'config');
    const gridDir = path.join(configDir, 'grid');
    fs.mkdirSync(gridDir, { recursive: true });
    for (const [name, data] of Object.entries(imageFiles)) fs.writeFileSync(path.join(gridDir, name), data);

    const iconFile = path.join(gridDir, `${appId}_icon.png`);
    const file = path.join(configDir, 'shortcuts.vdf');
    let root = [['shortcuts', []]];
    if (fs.existsSync(file)) {
      root = parseVdf(fs.readFileSync(file));
      fs.copyFileSync(file, `${file}.bak`);
    }
    let list = getField(root, 'shortcuts');
    if (!list) { list = []; root.push(['shortcuts', list]); }
    // Alten Eintrag des Launchers ersetzen, andere Einträge bleiben unberührt
    const kept = list.map(([, entry]) => entry).filter(entry => getField(entry, 'AppName') !== APP_NAME);
    kept.push([
      ['appid', { int: appId | 0 }],
      ['AppName', APP_NAME],
      ['Exe', exe],
      ['StartDir', startDir],
      ['icon', iconFile],
      ['ShortcutPath', ''],
      ['LaunchOptions', ''],
      ['IsHidden', { int: 0 }],
      ['AllowDesktopConfig', { int: 1 }],
      ['AllowOverlay', { int: 1 }],
      ['OpenVR', { int: 0 }],
      ['Devkit', { int: 0 }],
      ['DevkitGameID', ''],
      ['DevkitOverrideAppID', { int: 0 }],
      ['LastPlayTime', { int: 0 }],
      ['FlatpakAppID', ''],
      ['tags', [['0', 'dP Launcher']]]
    ]);
    list.length = 0;
    kept.forEach((entry, index) => list.push([String(index), entry]));
    fs.writeFileSync(file, serializeVdf(root));
  }
  return { success: true, accounts: users.length };
}
