// Modrinth REST API Client (v2)
// Offizielle API Docs: https://docs.modrinth.com/api-spec/

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'Electron-Minecraft-Launcher/1.0.0 (contact@github.com)';

const SUPPORTED_SIDES = ['required', 'optional'];

async function fetchJson(path, errorMessage) {
  const response = await fetch(`${MODRINTH_API_BASE}${path}`, {
    headers: { 'User-Agent': USER_AGENT }
  });
  if (!response.ok) throw new Error(`${errorMessage}: HTTP ${response.status}`);
  return await response.json();
}

async function postJson(path, body, errorMessage) {
  const response = await fetch(`${MODRINTH_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${errorMessage}: HTTP ${response.status}`);
  return await response.json();
}

// Client/Server-Filter wie auf modrinth.com: Nur eine Seite gewählt heißt "läuft nur dort"
function buildEnvironmentFacets(environments) {
  const client = environments.includes('client');
  const server = environments.includes('server');
  if (client === server && !client) return [];

  const facets = [];
  if (client) facets.push(SUPPORTED_SIDES.map(side => `client_side:${side}`));
  if (server) facets.push(SUPPORTED_SIDES.map(side => `server_side:${side}`));
  if (client && !server) facets.push(['server_side:unsupported']);
  if (server && !client) facets.push(['client_side:unsupported']);
  return facets;
}

let tagsPromise = null;

export const ModrinthService = {
  /**
   * Durchsucht Modrinth nach Projekten aller Typen
   * @param {Object} options
   * @param {string} options.query - Suchbegriff
   * @param {string} options.projectType - 'mod' | 'resourcepack' | 'datapack' | 'shader' | 'modpack' | 'plugin' | 'minecraft_java_server'
   * @param {string[]} options.gameVersions - z.B. ['26.3'], mehrere gelten als "eine davon"
   * @param {string[]} options.loaders - z.B. ['fabric'], mehrere gelten als "einer davon"
   * @param {string[]} options.categories - Jede gewählte Kategorie muss zutreffen
   * @param {string[]} options.environments - 'client' und/oder 'server'
   * @param {boolean} options.openSource - Nur Open-Source-Projekte
   * @param {string} options.sort - 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated'
   * @param {number} options.limit - Anzahl Ergebnisse (default 20)
   * @param {number} options.offset - Pagination Offset
   */
  async searchProjects({
    query = '',
    projectType = 'mod',
    gameVersions = [],
    loaders = [],
    categories = [],
    environments = [],
    openSource = false,
    sort = 'relevance',
    limit = 20,
    offset = 0
  } = {}) {
    const facets = [];
    if (projectType) {
      facets.push([`project_type:${projectType}`]);
    }
    if (gameVersions.length > 0) {
      facets.push(gameVersions.map(version => `versions:${version}`));
    }
    if (loaders.length > 0) {
      facets.push(loaders.map(loader => `categories:${loader.toLowerCase()}`));
    }
    categories.forEach(category => facets.push([`categories:${category}`]));
    facets.push(...buildEnvironmentFacets(environments));
    if (openSource) {
      facets.push(['open_source:true']);
    }

    const params = new URLSearchParams({
      query,
      limit: limit.toString(),
      offset: offset.toString(),
      index: sort
    });

    if (facets.length > 0) {
      params.append('facets', JSON.stringify(facets));
    }

    const response = await fetch(`${MODRINTH_API_BASE}/search?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) {
      throw new Error(`Modrinth Suche fehlgeschlagen: HTTP ${response.status}`);
    }

    return await response.json();
  },

  /**
   * Lädt Kategorien, Loader und Spielversionen für die Filter (einmal pro Sitzung)
   */
  getTags() {
    if (!tagsPromise) {
      tagsPromise = Promise.all([
        fetchJson('/tag/category', 'Kategorien konnten nicht geladen werden'),
        fetchJson('/tag/loader', 'Loader konnten nicht geladen werden'),
        fetchJson('/tag/game_version', 'Spielversionen konnten nicht geladen werden')
      ])
        .then(([categories, loaders, gameVersions]) => ({ categories, loaders, gameVersions }))
        .catch(err => {
          tagsPromise = null;
          throw err;
        });
    }
    return tagsPromise;
  },

  getProjectMembers(slugOrId) {
    return fetchJson(`/project/${slugOrId}/members`, 'Ersteller konnten nicht geladen werden');
  },

  getProjectDependencies(slugOrId) {
    return fetchJson(`/project/${slugOrId}/dependencies`, 'Abhängigkeiten konnten nicht geladen werden');
  },

  /**
   * Lädt Details zu mehreren Projekten in einem einzigen Request
   */
  async getProjects(ids = []) {
    if (!ids || ids.length === 0) return [];
    try {
      const response = await fetch(`${MODRINTH_API_BASE}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`, {
        headers: { 'User-Agent': USER_AGENT }
      });
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  },

  /**
   * Lädt Details zu einem bestimmten Projekt (per ID oder Slug)
   */
  async getProject(slugOrId) {
    const response = await fetch(`${MODRINTH_API_BASE}/project/${slugOrId}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!response.ok) throw new Error(`Projekt ${slugOrId} nicht gefunden`);
    return await response.json();
  },

  /**
   * Lädt alle Versionen eines Projekts mit Filter
   */
  async getProjectVersions(slugOrId, { gameVersion = '', loader = '' } = {}) {
    const params = new URLSearchParams();
    if (gameVersion) params.append('game_versions', JSON.stringify([gameVersion]));
    if (loader) params.append('loaders', JSON.stringify([loader.toLowerCase()]));

    const response = await fetch(`${MODRINTH_API_BASE}/project/${slugOrId}/version?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!response.ok) throw new Error(`Versionen für ${slugOrId} nicht gefunden`);
    return await response.json();
  },

  /**
   * Ordnet Datei-Hashes (SHA-1) ihren Versionen zu: { hash: version }
   */
  async getVersionsByHashes(hashes) {
    if (hashes.length === 0) return {};
    return postJson('/version_files', { hashes, algorithm: 'sha1' }, 'Versionen nicht ladbar');
  },

  /**
   * Neueste Version zu jedem Datei-Hash, passend zu Loadern und Spielversionen: { hash: version }
   */
  async getLatestVersionsByHashes(hashes, { loaders = [], gameVersions = [] } = {}) {
    if (hashes.length === 0) return {};
    return postJson('/version_files/update', {
      hashes, algorithm: 'sha1', loaders, ...(gameVersions.length ? { game_versions: gameVersions } : {})
    }, 'Updates nicht ladbar');
  },

  /**
   * Lädt Details einer konkreten Modrinth Versions-ID
   */
  async getVersion(versionId) {
    const response = await fetch(`${MODRINTH_API_BASE}/version/${versionId}`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!response.ok) throw new Error(`Version ID ${versionId} nicht gefunden`);
    return await response.json();
  },

  /**
   * Löst ein Mod-Manifest auf: Ermittelt für jede definierte Mod die exakte Datei-URL und Prüfsumme
   * Unterstützt sowohl Angabe von "versionId" als auch "versionNumber" oder einfach den neuesten kompatiblen Build.
   */
  async resolveRequiredMods(requiredModsList, defaultGameVersion = '1.21.1', defaultLoader = 'fabric') {
    const resolvedMods = [];

    for (const modConfig of requiredModsList) {
      // Festgeschriebene Mods werden unverändert übernommen
      if (modConfig.versionId && modConfig.sha1 && modConfig.downloadUrl && modConfig.filename) {
        resolvedMods.push(modConfig);
        continue;
      }

      try {
        let versionData = null;

        if (modConfig.versionId) {
          // Exakte ID angegeben
          versionData = await this.getVersion(modConfig.versionId);
        } else {
          // Nach passenden Versionen suchen
          const targetGameVer = modConfig.gameVersion || defaultGameVersion;
          const targetLoader = modConfig.loader || defaultLoader;
          const versions = await this.getProjectVersions(modConfig.slug, {
            gameVersion: targetGameVer,
            loader: targetLoader
          });

          if (!versions || versions.length === 0) {
            console.warn(`Keine passende Version für Mod ${modConfig.slug} gefunden`);
            continue;
          }

          if (modConfig.versionNumber) {
            versionData = versions.find(v => v.version_number === modConfig.versionNumber) || versions.find(v => v.version_type === 'release') || versions[0];
          } else {
            // Bevorzuge immer stabile Releases vor unfertigen Beta/Alpha-Versionen
            versionData = versions.find(v => v.version_type === 'release') || versions[0];
          }
        }

        // Primäre Datei aus der Version extrahieren
        const primaryFile = versionData.files.find(f => f.primary) || versionData.files[0];
        if (!primaryFile) continue;

        resolvedMods.push({
          projectId: versionData.project_id,
          slug: modConfig.slug,
          name: modConfig.name || versionData.name || modConfig.slug,
          versionId: versionData.id,
          versionNumber: versionData.version_number,
          filename: primaryFile.filename,
          downloadUrl: primaryFile.url,
          hashes: primaryFile.hashes, // { sha1, sha512 }
          size: primaryFile.size
        });
      } catch (err) {
        console.error(`Fehler beim Auflösen von Mod ${modConfig.slug || modConfig.name}:`, err);
      }
    }

    return resolvedMods;
  }
};
