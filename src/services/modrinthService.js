// Modrinth REST API Client (v2)
// Offizielle API Docs: https://docs.modrinth.com/api-spec/

const MODRINTH_API_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'Electron-Minecraft-Launcher/1.0.0 (contact@github.com)';

export const ModrinthService = {
  /**
   * Durchsucht Modrinth nach Mods, Resourcepacks oder Shadern
   * @param {Object} options
   * @param {string} options.query - Suchbegriff
   * @param {string} options.projectType - 'mod' | 'resourcepack' | 'shader'
   * @param {string} options.gameVersion - z.B. '1.21.1'
   * @param {string} options.loader - 'fabric' | 'neoforge' | 'forge' | 'quilt'
   * @param {number} options.limit - Anzahl Ergebnisse (default 20)
   * @param {number} options.offset - Pagination Offset
   */
  async searchProjects({ query = '', projectType = 'mod', gameVersion = '', loader = '', limit = 20, offset = 0 } = {}) {
    const facets = [];
    if (projectType) {
      facets.push([`project_type:${projectType}`]);
    }
    if (gameVersion) {
      facets.push([`versions:${gameVersion}`]);
    }
    if (loader && projectType === 'mod') {
      facets.push([`categories:${loader.toLowerCase()}`]);
    }

    const params = new URLSearchParams({
      query,
      limit: limit.toString(),
      offset: offset.toString(),
      index: 'relevance'
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
            versionData = versions.find(v => v.version_number === modConfig.versionNumber) || versions[0];
          } else {
            // Neueste Version nehmen
            versionData = versions[0];
          }
        }

        // Primäre Datei aus der Version extrahieren
        const primaryFile = versionData.files.find(f => f.primary) || versionData.files[0];
        if (!primaryFile) continue;

        resolvedMods.push({
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
