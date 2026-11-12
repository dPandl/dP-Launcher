// Server-Verwaltung: Datenform, Prüfung und Dateiformat (.dpmcserver).
// Dieses Modul kennt keinen konkreten Server. Alles kommt vom Nutzer oder aus einer importierten Datei.

import crypto from 'crypto';

export const SERVER_FILE_EXTENSION = 'dpmcserver';
export const SERVER_FILE_FORMAT = 'dpmcserver';
export const SERVER_FILE_VERSION = 1;

const NAME_MAX = 60;
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

  return { ok: true, server: { name, address, owner, repo, branch, chatPort } };
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
export function buildServerFile(server, nameOverride) {
  const name = cleanText(nameOverride || server.name).slice(0, NAME_MAX) || server.name;
  const file = {
    format: SERVER_FILE_FORMAT,
    version: SERVER_FILE_VERSION,
    name,
    address: server.address
  };
  if (server.owner && server.repo) {
    file.modpack = { github: `${server.owner}/${server.repo}`, branch: server.branch || 'main' };
  }
  if (server.chatPort) file.chatPort = server.chatPort;
  return JSON.stringify(file, null, 2) + '\n';
}

// Liest und prüft den Text einer .dpmcserver-Datei
export function parseServerFile(text) {
  if (typeof text !== 'string' || text.length > 20000) return { ok: false, error: 'Die Datei ist zu groß oder leer.' };
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
    address: data.address,
    github: data.modpack?.github,
    branch: data.modpack?.branch,
    chatPort: data.chatPort
  });
}
