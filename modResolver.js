// Findet für eine Mod die neueste Version, die zu einer festen Modliste passt.
// Modrinth nennt Abhängigkeiten meist ohne Version, die echten Grenzen stehen im fabric.mod.json der Datei.
import crypto from 'crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { getModSha1 } from './modpackUtils.js';

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
const MAX_CANDIDATES = 12;
const MAX_NESTED_DEPTH = 4;

// Spielversion und Loader sind schon durch die Modrinth-Filter und den Launcher festgelegt
const IGNORED_DEPENDENCY_IDS = new Set(['minecraft', 'java', 'fabricloader', 'fabric-loader', 'quilt_loader']);

// ─── Versionen und Fabric-Versionsangaben ───────────────────────────────────
function parseVersion(text) {
  const clean = String(text).trim().replace(/^v(?=\d)/, '').split('+')[0];
  const dash = clean.indexOf('-');
  const core = dash === -1 ? clean : clean.slice(0, dash);
  const parts = core.split('.');
  if (parts.length === 0 || !parts.every(part => /^(\d+|[xX*])$/.test(part))) return null;
  return {
    numbers: parts.map(part => (/^\d+$/.test(part) ? parseInt(part, 10) : null)),
    prerelease: dash === -1 ? null : clean.slice(dash + 1)
  };
}

function comparePrerelease(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const left = a.split('.');
  const right = b.split('.');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    if (left[i] === right[i]) continue;
    const bothNumeric = /^\d+$/.test(left[i]) && /^\d+$/.test(right[i]);
    if (bothNumeric) return parseInt(left[i], 10) - parseInt(right[i], 10);
    return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

function compareParsed(a, b) {
  const length = Math.max(a.numbers.length, b.numbers.length);
  for (let i = 0; i < length; i++) {
    const diff = (a.numbers[i] || 0) - (b.numbers[i] || 0);
    if (diff !== 0) return diff;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function matchesTerm(version, term) {
  if (term === '*') return true;
  const match = term.match(/^(>=|<=|>|<|=|\^|~)?(.+)$/);
  if (!match) return null;
  const [, operator = '=', target] = match;
  const parsedTarget = parseVersion(target);
  const parsedVersion = parseVersion(version);

  if (!parsedTarget || !parsedVersion) {
    // Freie Versionsnamen lassen sich nur auf Gleichheit prüfen
    return operator === '=' ? String(version).trim() === target ? true : null : null;
  }

  const wildcardAt = parsedTarget.numbers.indexOf(null);
  if (wildcardAt !== -1) {
    return parsedTarget.numbers.slice(0, wildcardAt).every((n, i) => (parsedVersion.numbers[i] || 0) === n);
  }

  const diff = compareParsed(parsedVersion, parsedTarget);
  switch (operator) {
    case '>=': return diff >= 0;
    case '<=': return diff <= 0;
    case '>': return diff > 0;
    case '<': return diff < 0;
    case '^': return diff >= 0 && (parsedVersion.numbers[0] || 0) === (parsedTarget.numbers[0] || 0);
    case '~':
      return diff >= 0
        && (parsedVersion.numbers[0] || 0) === (parsedTarget.numbers[0] || 0)
        && (parsedVersion.numbers[1] || 0) === (parsedTarget.numbers[1] || 0);
    default: return diff === 0;
  }
}

// true/false, oder null wenn sich die Angabe nicht auswerten lässt
export function versionSatisfies(version, predicate) {
  const alternatives = Array.isArray(predicate) ? predicate : [predicate];
  let unknown = false;
  for (const alternative of alternatives) {
    const terms = String(alternative).trim().split(/\s+/).filter(Boolean);
    const results = terms.map(term => matchesTerm(version, term));
    if (results.includes(false)) continue;
    if (results.includes(null)) {
      unknown = true;
      continue;
    }
    return true;
  }
  return unknown ? null : false;
}

function formatPredicate(predicate) {
  return Array.isArray(predicate) ? predicate.join(' oder ') : String(predicate);
}

// ─── Mod-Dateien auslesen ───────────────────────────────────────────────────
function normalizeFabricMeta(meta) {
  return {
    id: meta.id,
    name: meta.name || meta.id,
    version: String(meta.version ?? ''),
    provides: Array.isArray(meta.provides) ? meta.provides.filter(p => typeof p === 'string') : [],
    depends: meta.depends && typeof meta.depends === 'object' ? meta.depends : {},
    breaks: meta.breaks && typeof meta.breaks === 'object' ? meta.breaks : {}
  };
}

// Liefert die Mod und alle eingebetteten Mods. Der erste Eintrag ist die Mod selbst.
export function inspectJar(bytes, depth = 0) {
  const metaFiles = unzipSync(bytes, { filter: file => file.name === 'fabric.mod.json' });
  if (!metaFiles['fabric.mod.json']) return [];

  let meta;
  try {
    // Fabric erlaubt Zeilenumbrüche in Texten, JSON.parse nicht
    meta = JSON.parse(strFromU8(metaFiles['fabric.mod.json']).replace(/^﻿/, '').replace(/[\r\n\t]+/g, ' '));
  } catch (err) {
    return [];
  }
  if (!meta?.id) return [];

  const mods = [normalizeFabricMeta(meta)];
  const nestedNames = new Set((Array.isArray(meta.jars) ? meta.jars : []).map(jar => jar?.file).filter(Boolean));
  if (nestedNames.size > 0 && depth < MAX_NESTED_DEPTH) {
    const nested = unzipSync(bytes, { filter: file => nestedNames.has(file.name) });
    for (const data of Object.values(nested)) {
      mods.push(...inspectJar(data, depth + 1));
    }
  }
  return mods;
}

export function createModrinthIo({ userAgent, readInspectCache, writeInspectCache, findLocalFile }) {
  const inspectCache = readInspectCache?.() || {};

  const getJson = async (path) => {
    const res = await fetch(`${MODRINTH_API_BASE}${path}`, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(20000)
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Modrinth antwortet mit HTTP ${res.status}`);
    return res.json();
  };

  const loadBytes = async (mod, sha1) => {
    const local = findLocalFile?.(mod);
    if (local) {
      const hash = crypto.createHash('sha1').update(local).digest('hex');
      if (hash === sha1) return local;
    }
    const res = await fetch(mod.downloadUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(120000)
    });
    if (!res.ok) throw new Error(`${mod.filename} konnte nicht geladen werden (HTTP ${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (crypto.createHash('sha1').update(bytes).digest('hex') !== sha1) {
      throw new Error(`Prüfsumme von ${mod.filename} stimmt nicht`);
    }
    return bytes;
  };

  return {
    getProject: (ref) => getJson(`/project/${encodeURIComponent(ref)}`),
    getVersion: (id) => getJson(`/version/${encodeURIComponent(id)}`),
    getVersions: async (ref, { gameVersion, loader }) => {
      const params = new URLSearchParams({
        game_versions: JSON.stringify([gameVersion]),
        loaders: JSON.stringify([loader])
      });
      return (await getJson(`/project/${encodeURIComponent(ref)}/version?${params}`)) || [];
    },
    inspect: async (mod) => {
      const sha1 = getModSha1(mod);
      if (!sha1) return [];
      if (inspectCache[sha1]) return inspectCache[sha1];
      const mods = inspectJar(await loadBytes(mod, sha1));
      inspectCache[sha1] = mods;
      writeInspectCache?.(inspectCache);
      return mods;
    }
  };
}

// ─── Auflösung ──────────────────────────────────────────────────────────────
function sortCandidates(versions) {
  // Modrinth liefert neu nach alt; stabile Versionen haben Vorrang vor Beta und Alpha
  const stable = versions.filter(v => v.version_type === 'release');
  const others = versions.filter(v => v.version_type !== 'release');
  return [...stable, ...others].slice(0, MAX_CANDIDATES);
}

function providersOf(id, env) {
  const providers = [];
  for (const entry of env) {
    for (const mod of entry.bundle) {
      if (mod.id === id || mod.provides.includes(id)) {
        providers.push({ version: mod.version, owner: entry });
      }
    }
  }
  return providers;
}

function findBreakConflict(entry, env) {
  for (const other of env) {
    for (const [from, to] of [[entry, other], [other, entry]]) {
      for (const mod of from.bundle) {
        for (const [id, predicate] of Object.entries(mod.breaks)) {
          for (const target of to.bundle) {
            if ((target.id === id || target.provides.includes(id)) && versionSatisfies(target.version, predicate) === true) {
              return `${from.name} verträgt sich nicht mit ${to.name} ${target.version}`;
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Sucht die neueste Version von projectRef samt Abhängigkeiten, ohne die vorhandenen Mods zu ändern.
 * @param {Object} options
 * @param {string} options.projectRef - Projekt-ID oder Slug
 * @param {string} [options.versionId] - Nur genau diese Version zulassen
 * @param {Object[]} options.existing - Unveränderliche Mods (Modliste des Servers und andere Spieler-Mods)
 * @returns {{ ok: boolean, selected?: Object[], chosen?: Object, skipped: Object[], warnings: string[], reason?: string }}
 */
export async function resolveModInstall({ projectRef, versionId = null, existing, gameVersion, loader }, io) {
  const warnings = [];
  const env = [];

  for (const mod of existing) {
    env.push({
      fixed: true,
      projectId: mod.projectId,
      slug: mod.slug,
      name: mod.name || mod.slug,
      versionId: mod.versionId,
      versionNumber: mod.versionNumber,
      bundle: await io.inspect(mod)
    });
  }

  const tryCandidate = async (project, version, autoDependency) => {
    const file = version.files?.find(f => f.primary) || version.files?.[0];
    if (!file?.hashes?.sha1) return { ok: false, reason: 'Keine Datei mit Prüfsumme vorhanden' };

    const mod = {
      projectId: project.id,
      slug: project.slug,
      name: project.title,
      versionId: version.id,
      versionNumber: version.version_number,
      filename: file.filename,
      downloadUrl: file.url,
      sha1: file.hashes.sha1,
      size: file.size,
      autoDependency,
      dependencies: []
    };
    const entry = { ...mod, fixed: false, mod, bundle: await io.inspect(mod) };

    // Gleiche Mod unter anderem Projekt, z. B. ein Fork mit derselben Mod-ID
    const rootId = entry.bundle[0]?.id;
    const duplicate = rootId && env.find(other => other.bundle[0]?.id === rootId);
    if (duplicate) return { ok: false, reason: `Ist dieselbe Mod wie ${duplicate.name}` };

    const dependencyIds = new Set(entry.bundle.flatMap(m => Object.keys(m.depends)));
    const declaredByFile = (other) => other.bundle.some(m => dependencyIds.has(m.id) || m.provides.some(p => dependencyIds.has(p)));

    for (const dep of version.dependencies || []) {
      const other = dep.project_id && env.find(e => e.projectId === dep.project_id);
      if (dep.dependency_type === 'incompatible' && other) {
        return { ok: false, reason: `Laut Modrinth nicht kompatibel mit ${other.name}` };
      }
      // Die Angabe in der Datei ist genauer als Modrinths exakte Versionsbindung
      if (dep.dependency_type === 'required' && dep.version_id && other && other.versionId !== dep.version_id && !declaredByFile(other)) {
        return { ok: false, reason: `Braucht eine andere Version von ${other.name}, vorgegeben ist ${other.versionNumber}` };
      }
    }

    const conflict = findBreakConflict(entry, env);
    if (conflict) return { ok: false, reason: conflict };

    env.push(entry);

    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== 'required') continue;
      const projectId = dep.project_id || (dep.version_id && (await io.getVersion(dep.version_id))?.project_id);
      if (!projectId) {
        // Eingebettete Abhängigkeiten stehen ohne Projekt im Datei-Inhalt
        if (dep.file_name) return { ok: false, reason: `Braucht ${dep.file_name}, das nicht auf Modrinth liegt` };
        continue;
      }
      const result = await tryProject(projectId, { autoDependency: true, pinVersionId: dep.version_id });
      if (!result.ok) return { ok: false, reason: result.reason };
      mod.dependencies.push(result.projectId);
    }

    for (const bundled of entry.bundle) {
      for (const [id, predicate] of Object.entries(bundled.depends)) {
        if (IGNORED_DEPENDENCY_IDS.has(id)) continue;

        let providers = providersOf(id, env);
        if (providers.length === 0) {
          // Fabric-IDs entsprechen oft dem Modrinth-Slug
          const result = await tryProject(id, { autoDependency: true });
          if (!result.ok) return { ok: false, reason: `Braucht ${id} ${formatPredicate(predicate)}: ${result.reason}` };
          mod.dependencies.push(result.projectId);
          providers = providersOf(id, env);
          if (providers.length === 0) return { ok: false, reason: `Braucht ${id}, das nicht gefunden wurde` };
        }

        const results = providers.map(provider => versionSatisfies(provider.version, predicate));
        if (results.includes(true)) continue;
        if (results.includes(null)) {
          warnings.push(`${project.title}: Versionsangabe „${id} ${formatPredicate(predicate)}“ ließ sich nicht prüfen.`);
          continue;
        }
        const provider = providers[0];
        return {
          ok: false,
          reason: `Braucht ${provider.owner.name} ${formatPredicate(predicate)}, ${provider.owner.fixed ? 'vorgegeben' : 'gewählt'} ist ${provider.version}`
        };
      }
    }

    return { ok: true, entry };
  };

  const rootSkipped = [];

  async function tryProject(ref, { autoDependency, pinVersionId = null, collectSkipped = false }) {
    const present = env.find(e => e.projectId === ref || e.slug === ref);
    if (present) return { ok: true, projectId: present.projectId };

    const project = await io.getProject(ref);
    if (!project) return { ok: false, reason: `Projekt ${ref} gibt es nicht auf Modrinth` };

    const presentById = env.find(e => e.projectId === project.id);
    if (presentById) return { ok: true, projectId: presentById.projectId };

    let candidates;
    if (pinVersionId) {
      const pinned = await io.getVersion(pinVersionId);
      candidates = pinned ? [pinned] : [];
    } else {
      candidates = sortCandidates(await io.getVersions(project.id, { gameVersion, loader }));
    }
    if (candidates.length === 0) {
      return { ok: false, reason: `${project.title} hat keine Version für ${gameVersion} (${loader})` };
    }

    let firstReason = null;
    for (const version of candidates) {
      const mark = env.length;
      const warningMark = warnings.length;
      const result = await tryCandidate(project, version, autoDependency);
      if (result.ok) return { ok: true, projectId: project.id, entry: result.entry, project };

      env.length = mark;
      warnings.length = warningMark;
      firstReason = firstReason || result.reason;
      if (collectSkipped) rootSkipped.push({ versionNumber: version.version_number, reason: result.reason });
    }
    return { ok: false, reason: `${project.title}: ${firstReason}` };
  }

  const root = await tryProject(projectRef, { autoDependency: false, pinVersionId: versionId, collectSkipped: true });
  if (!root.ok) return { ok: false, reason: root.reason, skipped: rootSkipped, warnings };

  if (!root.entry) {
    return { ok: false, alreadyPresent: true, reason: 'Diese Mod ist bereits installiert oder Teil des Modpacks.', skipped: [], warnings };
  }

  return {
    ok: true,
    selected: env.filter(entry => !entry.fixed).map(entry => entry.mod),
    chosen: root.entry.mod,
    project: root.project,
    skipped: rootSkipped,
    warnings
  };
}
