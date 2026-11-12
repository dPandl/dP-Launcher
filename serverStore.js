// Server-Verwaltung: Datenform, Prüfung und Dateiformat (.dpmcserver).
// Dieses Modul kennt keinen konkreten Server. Alles kommt vom Nutzer oder aus einer importierten Datei.

import crypto from 'crypto';

export const SERVER_FILE_EXTENSION = 'dpmcserver';
export const SERVER_FILE_FORMAT = 'dpmcserver';
export const SERVER_FILE_VERSION = 1;

// Banner: PNG im Verhältnis 30:10 (3:1), als Data-URL in Serverdatei und Server-Eintrag
export const BANNER_MAX_BYTES = 3 * 1024 * 1024;
export const SERVER_FILE_MAX_CHARS = 6000000;
const BANNER_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function isPngBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE);
}

export function bannerToDataUrl(buffer) {
  return BANNER_PREFIX + buffer.toString('base64');
}

export function bannerFromDataUrl(value) {
  return Buffer.from(value.slice(BANNER_PREFIX.length), 'base64');
}

export function isValidBannerDataUrl(value) {
  if (typeof value !== 'string' || !value.startsWith(BANNER_PREFIX)) return false;
  const base64 = value.slice(BANNER_PREFIX.length);
  if (!base64 || base64.length > Math.ceil((BANNER_MAX_BYTES * 4) / 3) + 8) return false;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return false;
  return isPngBuffer(Buffer.from(base64.slice(0, 24), 'base64'));
}

export const SERVER_NAME_MAX = 60;
export const SERVER_DESCRIPTION_MAX = 140;
const NAME_MAX = SERVER_NAME_MAX;
const ADDRESS_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:\d{1,5})?$/;
const OWNER_REPO_RE = /^[A-Za-z0-9_.-]+$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]+$/;

function cleanText(value) {
  // Steuerzeichen entfernen, Leerraum zusammenfassen
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

// "owner/repo" oder eine GitHub-Adresse in Besitzer und Repository zerlegen
export function parseGithubRef(value) {
  const text = cleanText(value).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!text) return { owner: '', repo: '' };
  const [owner, repo, ...rest] = text.split('/');
  if (rest.length > 0 || !owner || !repo || !OWNER_REPO_RE.test(owner) || !OWNER_REPO_RE.test(repo)) return null;
  return { owner, repo };
}

// Adresse im Format host oder host:port
export function isValidServerAddress(value) {
  const address = String(value ?? '').trim();
  if (!ADDRESS_RE.test(address)) return false;
  const port = address.split(':')[1];
  return port === undefined || (Number(port) >= 1 && Number(port) <= 65535);
}

// Prüft Eingaben für einen Server (aus dem Formular oder einer Datei) und gibt eine bereinigte Fassung zurück
export function sanitizeServerInput(input) {
  const name = cleanText(input?.name).slice(0, NAME_MAX);
  if (!name) return { ok: false, error: 'Der Server braucht einen Namen.' };

  const address = cleanText(input?.address).toLowerCase();
  if (!address) return { ok: false, error: 'Die Server-Adresse fehlt.' };
  if (!ADDRESS_RE.test(address)) return { ok: false, error: 'Die Server-Adresse ist ungültig (Beispiel: mc.beispiel.de:25565).' };
  const portPart = address.split(':')[1];
  if (portPart !== undefined && (Number(portPart) < 1 || Number(portPart) > 65535)) {
    return { ok: false, error: 'Der Port der Server-Adresse ist ungültig.' };
  }

  let owner = '';
  let repo = '';
  const githubText = cleanText(input?.github);
  if (githubText) {
    const ref = parseGithubRef(githubText);
    if (!ref) return { ok: false, error: 'Das GitHub-Repository ist ungültig (Beispiel: besitzer/repository).' };
    owner = ref.owner;
    repo = ref.repo;
  } else if (input?.owner || input?.repo) {
    owner = cleanText(input.owner);
    repo = cleanText(input.repo);
    if (!OWNER_REPO_RE.test(owner) || !OWNER_REPO_RE.test(repo)) {
      return { ok: false, error: 'Das GitHub-Repository ist ungültig (Beispiel: besitzer/repository).' };
    }
  }

  const branch = cleanText(input?.branch) || 'main';
  if (!BRANCH_RE.test(branch) || branch.includes('..')) return { ok: false, error: 'Der GitHub-Branch ist ungültig.' };

  let chatPort = null;
  if (input?.chatPort !== undefined && input?.chatPort !== null && input?.chatPort !== '') {
    const port = Number(input.chatPort);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, error: 'Der Chat-Port ist ungültig.' };
    chatPort = port;
  }

  const description = cleanText(input?.description).slice(0, SERVER_DESCRIPTION_MAX);

  const banner = isValidBannerDataUrl(input?.banner) ? input.banner : '';

  return { ok: true, server: { name, description, banner, address, owner, repo, branch, chatPort } };
}

// Ordnername im Instanz-Verzeichnis: der Servername, bereinigt und eindeutig
export function folderNameFor(name, takenFolders = [], reserved = ['modpack-test']) {
  const base = cleanText(name)
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 40)
    .trim() || 'Server';
  const taken = new Set([...takenFolders, ...reserved].map(f => f.toLowerCase()));
  // Auf Windows sind einige Namen für Geräte reserviert
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(base)) return folderNameFor(`${base} Server`, takenFolders, reserved);
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} ${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${crypto.randomUUID().slice(0, 6)}`;
}

export function createServerRecord(clean, takenFolders) {
  return {
    id: crypto.randomUUID(),
    name: clean.name,
    description: clean.description || '',
    banner: clean.banner || '',
    folder: folderNameFor(clean.name, takenFolders),
    address: clean.address,
    owner: clean.owner,
    repo: clean.repo,
    branch: clean.branch,
    chatPort: clean.chatPort,
    addedAt: new Date().toISOString()
  };
}

// Inhalt einer .dpmcserver-Datei. Enthält nie Tokens oder Zugangsdaten.
export function buildServerFile(server, nameOverride, descriptionOverride, bannerOverride) {
  const name = cleanText(nameOverride || server.name).slice(0, NAME_MAX) || server.name;
  const description = cleanText(descriptionOverride ?? server.description).slice(0, SERVER_DESCRIPTION_MAX);
  const file = {
    format: SERVER_FILE_FORMAT,
    version: SERVER_FILE_VERSION,
    name,
    address: server.address
  };
  if (description) file.description = description;
  const banner = bannerOverride ?? server.banner;
  if (isValidBannerDataUrl(banner)) file.banner = banner;
  if (server.owner && server.repo) {
    file.modpack = { github: `${server.owner}/${server.repo}`, branch: server.branch || 'main' };
  }
  if (server.chatPort) file.chatPort = server.chatPort;
  return JSON.stringify(file, null, 2) + '\n';
}

// Liest und prüft den Text einer .dpmcserver-Datei
export function parseServerFile(text) {
  if (typeof text !== 'string' || text.length > SERVER_FILE_MAX_CHARS) return { ok: false, error: 'Die Datei ist zu groß oder leer.' };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Die Datei ist kein gültiges JSON.' };
  }
  if (!data || typeof data !== 'object' || data.format !== SERVER_FILE_FORMAT) {
    return { ok: false, error: 'Das ist keine dP-Launcher-Serverdatei.' };
  }
  if (Number(data.version) > SERVER_FILE_VERSION) {
    return { ok: false, error: 'Die Datei stammt von einer neueren Version des Launchers. Bitte aktualisiere ihn.' };
  }
  return sanitizeServerInput({
    name: data.name,
    description: data.description,
    banner: data.banner,
    address: data.address,
    github: data.modpack?.github,
    branch: data.modpack?.branch,
    chatPort: data.chatPort
  });
}
