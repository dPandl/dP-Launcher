// Modpack-Entwurf: Mods festschreiben, Abhängigkeiten auflösen und Änderungen vergleichen
import { ModrinthService } from './modrinthService.js';
import { getManifestMods, isPinnedMod, INITIAL_MODPACK_VERSION } from '../../modpackUtils.js';

export function deriveSide(clientSide, serverSide) {
  if (clientSide === 'unsupported') return 'server';
  if (serverSide === 'unsupported') return 'client';
  return 'both';
}

function pickVersion(versions) {
  return versions.find(v => v.version_type === 'release') || versions[0] || null;
}

function buildModEntry(project, version, autoDependency) {
  const file = version.files?.find(f => f.primary) || version.files?.[0];
  if (!file?.hashes?.sha1) {
    throw new Error(`${project.title}: Version ${version.version_number} hat keine Datei mit SHA-1`);
  }
  return {
    slug: project.slug,
    name: project.title,
    iconUrl: project.icon_url || null,
    side: deriveSide(project.client_side, project.server_side),
    projectId: project.id,
    versionId: version.id,
    versionNumber: version.version_number,
    filename: file.filename,
    downloadUrl: file.url,
    sha1: file.hashes.sha1,
    size: file.size,
    autoDependency,
    dependencies: [],
    addedAt: Date.now()
  };
}

async function fetchLatestVersion(ref, draft) {
  const versions = await ModrinthService.getProjectVersions(ref, {
    gameVersion: draft.gameVersion,
    loader: draft.loader
  });
  return pickVersion(versions);
}

// Trägt die Pflicht-Abhängigkeiten einer Version ein und liefert deren Projekt-IDs
async function addDependencies(version, ownerName, ownerSide, mods, draft, warnings) {
  const dependencyIds = [];
  for (const dep of version.dependencies || []) {
    if (dep.dependency_type === 'incompatible') {
      if (mods.some(m => m.projectId === dep.project_id)) {
        warnings.push(`${ownerName} ist laut Modrinth nicht mit einer Mod im Entwurf kompatibel.`);
      }
      continue;
    }
    if (dep.dependency_type !== 'required') continue;

    try {
      const projectId = dep.project_id || (dep.version_id && (await ModrinthService.getVersion(dep.version_id)).project_id);
      if (!projectId) {
        warnings.push(`${ownerName}: Abhängigkeit „${dep.file_name || 'unbekannt'}“ ist nicht auf Modrinth und muss von Hand geprüft werden.`);
        continue;
      }
      dependencyIds.push(projectId);
      await addProject(projectId, { autoDependency: true, versionId: dep.version_id, requiredBySide: ownerSide }, mods, draft, warnings);
    } catch (err) {
      warnings.push(`${ownerName}: Abhängigkeit konnte nicht aufgelöst werden (${err.message}).`);
    }
  }
  return dependencyIds;
}

async function addProject(ref, { autoDependency, versionId, requiredBySide }, mods, draft, warnings) {
  const findExisting = (id) => mods.findIndex(m => m.projectId === id || m.slug === id);
  let index = findExisting(ref);
  const project = index === -1 ? await ModrinthService.getProject(ref) : null;
  if (project) index = findExisting(project.id);

  if (index !== -1) {
    // Wenn eine Mod auf dem Client benötigt wird, darf eine vorhandene Abhängigkeit nicht nur auf Server stehen
    if (requiredBySide && requiredBySide !== 'server' && mods[index].side === 'server') {
      mods[index] = { ...mods[index], side: 'both' };
    }
    // Von Hand hinzugefügte Abhängigkeit bleibt ab jetzt auch ohne die andere Mod erhalten
    if (!autoDependency && mods[index].autoDependency) {
      mods[index] = { ...mods[index], autoDependency: false };
    }
    return;
  }

  const version = versionId
    ? await ModrinthService.getVersion(versionId)
    : await fetchLatestVersion(project.id, draft);
  if (!version) {
    throw new Error(`${project.title}: Keine Version für ${draft.gameVersion} (${draft.loader}) gefunden`);
  }

  const entry = buildModEntry(project, version, autoDependency);
  // Wenn die übergeordnete Mod auf dem Client läuft, muss auch die Abhängigkeit auf dem Client vorhanden sein
  if (requiredBySide && requiredBySide !== 'server' && entry.side === 'server') {
    entry.side = 'both';
  }

  mods.push(entry);
  entry.dependencies = await addDependencies(version, entry.name, entry.side, mods, draft, warnings);
}

// Entfernt automatisch hinzugefügte Abhängigkeiten, die keine eigenständige Mod mehr braucht
function pruneOrphans(mods) {
  const byId = new Map(mods.map(m => [m.projectId, m]));
  const reachable = new Set();
  const visit = (mod) => {
    if (!mod || reachable.has(mod)) return;
    reachable.add(mod);
    (mod.dependencies || []).forEach(id => visit(byId.get(id)));
  };
  mods.filter(m => !m.autoDependency).forEach(visit);
  return mods.filter(m => reachable.has(m));
}

export async function addModToDraft(draft, project, { versionId } = {}) {
  const ref = typeof project === 'string' ? project : (project.project_id || project.id || project.slug);
  const mods = [...draft.mods];
  const warnings = [];
  await addProject(ref, { autoDependency: false, versionId }, mods, draft, warnings);
  return { draft: { ...draft, mods }, warnings };
}

export function removeModFromDraft(draft, slug) {
  const target = draft.mods.find(m => m.slug === slug);
  const remaining = draft.mods.filter(m => m.slug !== slug);
  const mods = pruneOrphans(remaining);
  const warnings = mods
    .filter(m => target && (m.dependencies || []).includes(target.projectId))
    .map(m => `${m.name} braucht ${target.name} weiterhin als Abhängigkeit.`);
  return { draft: { ...draft, mods }, warnings };
}

// Hebt eine Mod gezielt auf eine gewählte oder die neueste passende Version
export async function updateModInDraft(draft, slug, { versionId } = {}) {
  const current = draft.mods.find(m => m.slug === slug);
  if (!current) throw new Error(`${slug} ist nicht im Entwurf`);

  const project = await ModrinthService.getProject(current.projectId || slug);
  const version = versionId
    ? await ModrinthService.getVersion(versionId)
    : await fetchLatestVersion(project.id, draft);
  if (!version) throw new Error(`${current.name}: Keine Version für ${draft.gameVersion} gefunden`);
  if (version.id === current.versionId) return { draft, updated: false, warnings: [] };

  const warnings = [];
  const entry = {
    ...buildModEntry(project, version, current.autoDependency),
    side: current.side
  };
  const mods = draft.mods.map(m => (m.slug === slug ? entry : m));
  entry.dependencies = await addDependencies(version, entry.name, entry.side, mods, draft, warnings);
  return { draft: { ...draft, mods: pruneOrphans(mods) }, updated: true, warnings };
}

export function setModSide(draft, slug, side) {
  return { ...draft, mods: draft.mods.map(m => (m.slug === slug ? { ...m, side } : m)) };
}

export function toggleModInDraft(draft, slug) {
  const target = draft.mods.find(m => m.slug === slug);
  if (!target) return { draft, warnings: [] };

  const willDisable = !target.disabled;
  const mods = draft.mods.map(m => (m.slug === slug ? { ...m, disabled: willDisable } : m));

  const warnings = [];
  if (willDisable) {
    const dependentActive = mods.filter(m => !m.disabled && (m.dependencies || []).includes(target.projectId));
    for (const dep of dependentActive) {
      warnings.push(`${dep.name} benötigt ${target.name} als Abhängigkeit (wurde aber deaktiviert).`);
    }
  }

  return { draft: { ...draft, mods }, warnings };
}

export function diffManifests(published, draft) {
  const before = new Map(getManifestMods(published).map(m => [m.slug, m]));
  const after = new Map(getManifestMods(draft).map(m => [m.slug, m]));

  const added = [...after.values()].filter(m => !before.has(m.slug));
  const removed = [...before.values()].filter(m => !after.has(m.slug));
  const changed = [...after.values()]
    .filter(m => before.has(m.slug))
    .filter(m => {
      const old = before.get(m.slug);
      return old.versionId !== m.versionId 
        || (old.side || 'both') !== (m.side || 'both')
        || Boolean(old.disabled) !== Boolean(m.disabled);
    })
    .map(m => ({ 
      ...m, 
      fromVersion: before.get(m.slug).versionNumber || null, 
      fromSide: before.get(m.slug).side || 'both',
      fromDisabled: Boolean(before.get(m.slug).disabled)
    }));

  return { added, removed, changed, total: added.length + removed.length + changed.length };
}

function createEmptyDraft(manifest) {
  return {
    schemaVersion: 2,
    baseVersion: manifest?.modpackVersion || INITIAL_MODPACK_VERSION,
    serverName: manifest?.serverName,
    serverAddress: manifest?.serverAddress,
    gameVersion: manifest?.gameVersion,
    loader: manifest?.loader || 'fabric',
    loaderVersion: manifest?.loaderVersion,
    cleanOldMods: manifest?.cleanOldMods !== false,
    mods: [],
    resourcepacks: Array.isArray(manifest?.resourcepacks) ? [...manifest.resourcepacks] : [],
    shaderpacks: Array.isArray(manifest?.shaderpacks) ? [...manifest.shaderpacks] : [],
    defaultShader: manifest?.defaultShader || null,
    configs: manifest?.configs || {}
  };
}

// Baut einen Eintrag für Ressourcen- oder Shaderpakete
function buildPackEntry(project, version) {
  const file = version.files?.find(f => f.primary) || version.files?.[0];
  if (!file?.hashes?.sha1) {
    throw new Error(`${project.title}: Version ${version.version_number} hat keine Datei mit SHA-1`);
  }
  return {
    slug: project.slug,
    name: project.title,
    iconUrl: project.icon_url || null,
    projectId: project.id,
    versionId: version.id,
    versionNumber: version.version_number,
    filename: file.filename,
    downloadUrl: file.url,
    sha1: file.hashes.sha1,
    size: file.size,
    active: true,
    addedAt: Date.now()
  };
}

export async function addResourcepackToDraft(draft, ref, versionId = null) {
  const packs = Array.isArray(draft.resourcepacks) ? [...draft.resourcepacks] : [];
  const project = typeof ref === 'string' ? await ModrinthService.getProject(ref) : ref;
  if (packs.some(p => p.projectId === project.id || p.slug === project.slug)) {
    return { draft, warnings: [`${project.title} ist bereits im Entwurf.`] };
  }
  let version = null;
  if (versionId) {
    version = await ModrinthService.getVersion(versionId);
  } else {
    const versions = await ModrinthService.getProjectVersions(project.id, { gameVersion: draft.gameVersion });
    version = (versions && versions.length > 0) ? pickVersion(versions) : (await ModrinthService.getProjectVersions(project.id))?.[0];
  }
  if (!version) {
    throw new Error(`${project.title}: Keine kompatible Version gefunden.`);
  }
  const entry = buildPackEntry(project, version);
  return {
    draft: { ...draft, resourcepacks: [...packs, entry] },
    warnings: []
  };
}

export function removeResourcepackFromDraft(draft, slug) {
  const packs = (draft.resourcepacks || []).filter(p => p.slug !== slug && p.projectId !== slug);
  return { ...draft, resourcepacks: packs };
}

export function toggleResourcepackActive(draft, slug) {
  const packs = (draft.resourcepacks || []).map(p => {
    if (p.slug === slug || p.projectId === slug) {
      return { ...p, active: !p.active };
    }
    return p;
  });
  return { ...draft, resourcepacks: packs };
}

export async function addShaderpackToDraft(draft, ref, versionId = null) {
  const packs = Array.isArray(draft.shaderpacks) ? [...draft.shaderpacks] : [];
  const project = typeof ref === 'string' ? await ModrinthService.getProject(ref) : ref;
  if (packs.some(p => p.projectId === project.id || p.slug === project.slug)) {
    return { draft, warnings: [`${project.title} ist bereits im Entwurf.`] };
  }
  let version = null;
  if (versionId) {
    version = await ModrinthService.getVersion(versionId);
  } else {
    const versions = await ModrinthService.getProjectVersions(project.id, { gameVersion: draft.gameVersion });
    version = (versions && versions.length > 0) ? pickVersion(versions) : (await ModrinthService.getProjectVersions(project.id))?.[0];
  }
  if (!version) {
    throw new Error(`${project.title}: Keine kompatible Version gefunden.`);
  }
  const entry = buildPackEntry(project, version);
  const hasActive = packs.some(p => p.active);
  entry.active = !hasActive;
  return {
    draft: {
      ...draft,
      shaderpacks: [...packs, entry],
      defaultShader: draft.defaultShader || entry.filename
    },
    warnings: []
  };
}

export function removeShaderpackFromDraft(draft, slug) {
  const packs = (draft.shaderpacks || []).filter(p => p.slug !== slug && p.projectId !== slug);
  const defaultShader = draft.defaultShader === slug ? (packs[0]?.filename || null) : draft.defaultShader;
  return { ...draft, shaderpacks: packs, defaultShader };
}

export function toggleShaderpackActive(draft, slug) {
  let newDefault = draft.defaultShader;
  const packs = (draft.shaderpacks || []).map(p => {
    if (p.slug === slug || p.projectId === slug) {
      const willBeActive = !p.active;
      if (willBeActive) newDefault = p.filename;
      return { ...p, active: willBeActive };
    }
    return p;
  });
  return { ...draft, shaderpacks: packs, defaultShader: newDefault };
}

export function setDefaultShaderpack(draft, filenameOrSlug) {
  const packs = (draft.shaderpacks || []).map(p => ({
    ...p,
    active: p.filename === filenameOrSlug || p.slug === filenameOrSlug
  }));
  const match = packs.find(p => p.active);
  return { ...draft, shaderpacks: packs, defaultShader: match?.filename || filenameOrSlug };
}

// Altes Format (nur Slugs) → Entwurf mit festgeschriebenen Versionen
export async function migrateLegacyManifest(manifest) {
  let draft = createEmptyDraft(manifest);
  const warnings = [];
  for (const mod of manifest?.requiredMods || []) {
    try {
      const result = await addModToDraft(draft, mod.slug);
      draft = result.draft;
      warnings.push(...result.warnings);
    } catch (err) {
      warnings.push(`${mod.name || mod.slug} wurde nicht übernommen: ${err.message}`);
    }
  }
  return { draft, warnings };
}

export async function createDraftFromManifest(manifest) {
  const mods = getManifestMods(manifest);
  if (Array.isArray(manifest?.mods) && mods.every(isPinnedMod)) {
    return {
      draft: {
        ...createEmptyDraft(manifest),
        mods: [...mods],
        resourcepacks: Array.isArray(manifest?.resourcepacks) ? [...manifest.resourcepacks] : [],
        shaderpacks: Array.isArray(manifest?.shaderpacks) ? [...manifest.shaderpacks] : [],
        defaultShader: manifest?.defaultShader || null,
        configs: manifest?.configs || {}
      },
      warnings: []
    };
  }
  return migrateLegacyManifest(manifest);
}
