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

export const WINDOW_MODES = ['default', 'custom', 'fullscreen'];

function cleanInt(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return undefined;
  return number;
}

// Arbeitsspeicher und Fenster eines Servers oder einer Instanz. null = Einstellung des Launchers.
export function sanitizeLaunchOverrides(input) {
  const ramMax = cleanInt(input?.ramMax, 1, 64);
  if (ramMax === undefined) return { ok: false, error: 'Der Arbeitsspeicher muss zwischen 1 und 64 GB liegen.' };

  const mode = String(input?.windowMode ?? '').toLowerCase();
  const windowMode = WINDOW_MODES.includes(mode) ? mode : null;
  const windowWidth = cleanInt(input?.windowWidth, 320, 16000);
  const windowHeight = cleanInt(input?.windowHeight, 240, 16000);
  if (windowWidth === undefined || windowHeight === undefined) return { ok: false, error: 'Die Fenstergröße ist ungültig (mindestens 320 × 240).' };
  if (windowMode === 'custom' && (!windowWidth || !windowHeight)) return { ok: false, error: 'Gib für ein eigenes Fenster Breite und Höhe an.' };

  return { ok: true, launch: { ramMax, windowMode, windowWidth, windowHeight } };
}

// Wie viel Arbeitsspeicher Minecraft höchstens bekommen kann: der gesamte eingebaute RAM (mindestens 2, höchstens 64 GB)
export function maxAllocatableRamGb(totalBytes) {
  const totalGb = Number(totalBytes) / (1024 ** 3);
  if (!Number.isFinite(totalGb) || totalGb <= 0) return 16;
  return Math.max(2, Math.min(64, Math.floor(totalGb)));
}

// Wirksame Werte: eigene Werte des Servers/der Instanz gehen vor den globalen Einstellungen
export function resolveLaunchOptions(settings, overrides) {
  const pick = (key, fallback) => (overrides?.[key] ? overrides[key] : (settings?.[key] || fallback));
  const windowMode = overrides?.windowMode || (WINDOW_MODES.includes(settings?.windowMode) ? settings.windowMode : 'default');
  const customSource = overrides?.windowMode ? overrides : settings;
  return {
    ramMax: pick('ramMax', 6),
    windowMode,
    windowWidth: Number(customSource?.windowWidth) || 1280,
    windowHeight: Number(customSource?.windowHeight) || 720
  };
}

export function sanitizeInstanceInput(input) {
  const name = cleanText(input?.name).slice(0, NAME_MAX);
  if (!name) return { ok: false, error: 'Die Instanz braucht einen Namen.' };

  const gameVersion = cleanText(input?.gameVersion);
  if (!VERSION_RE.test(gameVersion)) return { ok: false, error: 'Die Minecraft-Version ist ungültig.' };

  const loader = cleanText(input?.loader).toLowerCase() || 'fabric';
  if (!SUPPORTED_LOADERS.includes(loader)) return { ok: false, error: 'Dieser Loader wird nicht unterstützt (Fabric oder Vanilla).' };

  const launch = sanitizeLaunchOverrides(input);
  if (!launch.ok) return launch;

  return { ok: true, instance: { name, gameVersion, loader, ...launch.launch } };
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
    windowMode: clean.windowMode ?? null,
    windowWidth: clean.windowWidth ?? null,
    windowHeight: clean.windowHeight ?? null,
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
