// Eigene Instanzen: Datenform, Prüfung und das Lesen von Modrinth-Modpacks (.mrpack).
// Eine Instanz gehört zu keinem Server. Sie hat einen Namen, eine Minecraft-Version und einen Loader.

import crypto from 'crypto';
import { folderNameFor } from './serverStore.js';

export const SUPPORTED_LOADERS = ['fabric', 'vanilla'];

const NAME_MAX = 60;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

// Laut Modrinth-Format dürfen Dateien nur von diesen Hosts geladen werden
const MRPACK_ALLOWED_HOSTS = new Set(['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']);

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeInstanceInput(input) {
  const name = cleanText(input?.name).slice(0, NAME_MAX);
  if (!name) return { ok: false, error: 'Die Instanz braucht einen Namen.' };

  const gameVersion = cleanText(input?.gameVersion);
  if (!VERSION_RE.test(gameVersion)) return { ok: false, error: 'Die Minecraft-Version ist ungültig.' };

  const loader = cleanText(input?.loader).toLowerCase() || 'fabric';
  if (!SUPPORTED_LOADERS.includes(loader)) return { ok: false, error: 'Dieser Loader wird nicht unterstützt (Fabric oder Vanilla).' };

  let ramMax = null;
  if (input?.ramMax !== undefined && input?.ramMax !== null && input?.ramMax !== '') {
    const value = Number(input.ramMax);
    if (!Number.isInteger(value) || value < 1 || value > 64) return { ok: false, error: 'Der Arbeitsspeicher muss zwischen 1 und 64 GB liegen.' };
    ramMax = value;
  }

  return { ok: true, instance: { name, gameVersion, loader, ramMax } };
}

export function createInstanceRecord(clean, takenFolders, extra = {}) {
  return {
    id: crypto.randomUUID(),
    name: clean.name,
    folder: folderNameFor(clean.name, takenFolders),
    gameVersion: clean.gameVersion,
    loader: clean.loader,
    loaderVersion: '',
    ramMax: clean.ramMax ?? null,
    modpack: null,
    createdAt: new Date().toISOString(),
    lastPlayedAt: null,
    ...extra
  };
}

// Relativer Pfad innerhalb einer Instanz. Verhindert Ausbrüche aus dem Ordner.
export function isSafeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.length > 300) return false;
  if (value.includes('\0') || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  const parts = value.split('/');
  return parts.every(part => part !== '' && part !== '.' && part !== '..' && !/[<>:"|?*]/.test(part));
}

export function isAllowedMrpackUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && MRPACK_ALLOWED_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

// Prüft den Inhalt von modrinth.index.json und gibt alles Nötige für die Installation zurück
export function parseMrpackIndex(index) {
  if (!index || typeof index !== 'object') return { ok: false, error: 'Das Modpack hat keine gültige Beschreibung.' };
  if (index.formatVersion !== 1) return { ok: false, error: 'Dieses Modpack-Format wird nicht unterstützt.' };
  if (index.game !== 'minecraft') return { ok: false, error: 'Dieses Modpack ist nicht für Minecraft.' };

  const deps = index.dependencies || {};
  const gameVersion = cleanText(deps.minecraft);
  if (!VERSION_RE.test(gameVersion)) return { ok: false, error: 'Dem Modpack fehlt die Minecraft-Version.' };

  let loader = 'vanilla';
  let loaderVersion = '';
  if (deps['fabric-loader']) {
    loader = 'fabric';
    loaderVersion = cleanText(deps['fabric-loader']);
  } else if (deps['quilt-loader'] || deps.forge || deps.neoforge) {
    const name = deps['quilt-loader'] ? 'Quilt' : deps.neoforge ? 'NeoForge' : 'Forge';
    return { ok: false, error: `Dieses Modpack braucht ${name}. Der Launcher unterstützt bisher nur Fabric-Modpacks.` };
  }

  const files = [];
  for (const file of Array.isArray(index.files) ? index.files : []) {
    if (file?.env?.client === 'unsupported') continue; // reine Server-Dateien
    if (!isSafeRelativePath(file?.path)) return { ok: false, error: `Das Modpack enthält einen ungültigen Dateipfad: ${cleanText(file?.path).slice(0, 80)}` };
    const downloads = (Array.isArray(file.downloads) ? file.downloads : []).filter(isAllowedMrpackUrl);
    if (downloads.length === 0) return { ok: false, error: `Für ${file.path} gibt es keine erlaubte Download-Adresse.` };
    const sha1 = String(file?.hashes?.sha1 || '').toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(sha1)) return { ok: false, error: `Für ${file.path} fehlt die Prüfsumme.` };
    files.push({ path: file.path, sha1, downloads, size: Number(file.fileSize) || 0 });
  }

  return {
    ok: true,
    name: cleanText(index.name).slice(0, NAME_MAX) || 'Modpack',
    gameVersion,
    loader,
    loaderVersion,
    files
  };
}
