// Gemeinsame Modpack-Helfer für Main-Prozess und Renderer (ohne Electron- oder DOM-Abhängigkeiten)

export const INITIAL_MODPACK_VERSION = '0.0.0';

function parseVersion(version) {
  const parts = String(version || INITIAL_MODPACK_VERSION).split('.').map(n => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

// Vergleicht zwei Modpack-Versionen: < 0 wenn a älter ist, > 0 wenn a neuer ist
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

// Die erste Veröffentlichung wird immer 1.0.0, danach Patch, Minor oder Major
export function bumpVersion(current, type = 'patch') {
  const [major, minor, patch] = parseVersion(current);
  if (major === 0 && minor === 0 && patch === 0) return '1.0.0';
  if (type === 'major') return `${major + 1}.0.0`;
  if (type === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Liest neues (mods) und altes (requiredMods) Manifest-Format
export function getManifestMods(manifest) {
  return manifest?.mods || manifest?.requiredMods || [];
}

export function getManifestResourcepacks(manifest) {
  return Array.isArray(manifest?.resourcepacks) ? manifest.resourcepacks : [];
}

export function getManifestShaderpacks(manifest) {
  return Array.isArray(manifest?.shaderpacks) ? manifest.shaderpacks : [];
}

export function isValidManifest(manifest) {
  return Boolean(manifest) && typeof manifest === 'object'
    && (Array.isArray(manifest.mods) || Array.isArray(manifest.requiredMods));
}

export function getModSha1(mod) {
  return mod?.sha1 || mod?.hashes?.sha1 || null;
}

export function isPinnedMod(mod) {
  return Boolean(mod?.versionId && mod?.filename && mod?.downloadUrl && getModSha1(mod));
}

// Manifeste kommen aus dem Netz: Der Dateiname darf den Mods-Ordner nicht verlassen
export function isSafeModFilename(filename) {
  return typeof filename === 'string'
    && filename.endsWith('.jar')
    && !filename.includes('..')
    && !/[\\/:*?"<>|\x00-\x1f]/.test(filename);
}

// Sichere Dateinamen für Ressourcen- und Shaderpakete (.zip oder .jar)
export function isSafePackFilename(filename) {
  return typeof filename === 'string'
    && (filename.endsWith('.zip') || filename.endsWith('.jar'))
    && !filename.includes('..')
    && !/[\\/:*?"<>|\x00-\x1f]/.test(filename);
}

export function isAllowedModUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'cdn.modrinth.com';
  } catch (e) {
    return false;
  }
}

// Offline-Konten zählen nie, weil dort beliebige Namen und UUIDs möglich sind
export function isAdminAccount(account, manifest) {
  if (account?.type !== 'microsoft' || !account.uuid) return false;
  const normalize = (uuid) => String(uuid).replace(/-/g, '').toLowerCase();
  return (manifest?.admins || []).map(normalize).includes(normalize(account.uuid));
}

// Abgleich Entwurf ↔ Server-/mods: Nur Dateien aus managedFiles dürfen gelöscht werden
export function planServerSync(mods, serverFiles, managedFiles) {
  const desired = mods.filter(mod => mod.side !== 'client' && !mod.disabled);
  const desiredNames = new Set(desired.map(mod => mod.filename));
  const managed = new Set(managedFiles);
  const serverJars = serverFiles.filter(file => file.name.endsWith('.jar'));
  const serverByName = new Map(serverJars.map(file => [file.name, file]));

  const upload = [];
  let unchanged = 0;
  for (const mod of desired) {
    const existing = serverByName.get(mod.filename);
    if (!existing) {
      upload.push({ ...mod, replace: false });
    } else if (mod.size && existing.size !== mod.size) {
      upload.push({ ...mod, replace: true });
    } else {
      unchanged++;
    }
  }

  const remove = serverJars
    .map(file => file.name)
    .filter(name => managed.has(name) && !desiredNames.has(name));

  return { upload, remove, unchanged };
}
