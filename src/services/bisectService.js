// BisectHosting / Pterodactyl Panel API Service

function normalizeArgs(panelUrlOrServerId, apiKeyOrConfig, maybeServerId) {
  // Fall 1: (panelUrl, apiKey, serverId)
  if (typeof panelUrlOrServerId === 'string' && (panelUrlOrServerId.includes('.') || panelUrlOrServerId.startsWith('http')) && typeof apiKeyOrConfig === 'string') {
    return {
      configOverride: { panelUrl: panelUrlOrServerId, apiKey: apiKeyOrConfig },
      serverId: maybeServerId || null
    };
  }

  // Fall 2: (serverId, configOverride)
  if (typeof apiKeyOrConfig === 'object' && apiKeyOrConfig !== null) {
    return {
      configOverride: apiKeyOrConfig,
      serverId: panelUrlOrServerId || null
    };
  }

  // Fall 3: (configOverride)
  if (typeof panelUrlOrServerId === 'object' && panelUrlOrServerId !== null) {
    return {
      configOverride: panelUrlOrServerId,
      serverId: panelUrlOrServerId.serverId || null
    };
  }

  return {
    configOverride: null,
    serverId: panelUrlOrServerId || null
  };
}

export const BisectService = {
  // Ruft alle Server des Accounts ab: getServers(panelUrl, apiKey) oder getServers(configOverride)
  async getServers(panelUrlOrConfig = null, maybeApiKey = null) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    
    let configOverride = null;
    if (typeof panelUrlOrConfig === 'string' && typeof maybeApiKey === 'string') {
      configOverride = { panelUrl: panelUrlOrConfig, apiKey: maybeApiKey };
    } else if (typeof panelUrlOrConfig === 'object') {
      configOverride = panelUrlOrConfig;
    }

    const res = await window.electronAPI.bisectApi({
      method: 'GET',
      endpoint: '/api/client',
      configOverride
    });
    if (!res.success) throw new Error(res.error || 'Server konnten nicht abgerufen werden');
    return res.data?.data || [];
  },

  // Details eines bestimmten Servers abrufen
  async getServerDetails(serverId, configOverride = null) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    const res = await window.electronAPI.bisectApi({
      method: 'GET',
      endpoint: `/api/client/servers/${serverId}`,
      configOverride
    });
    if (!res.success) throw new Error(res.error || 'Server-Details fehlgeschlagen');
    return res.data?.attributes || null;
  },

  // Live Ressourcen (CPU, RAM, Status): getServerResources(panelUrl, apiKey, serverId) oder getServerResources(serverId, configOverride)
  async getServerResources(arg1, arg2, arg3) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    const { configOverride, serverId } = normalizeArgs(arg1, arg2, arg3);
    const targetId = serverId || arg3 || arg1;

    const res = await window.electronAPI.bisectApi({
      method: 'GET',
      endpoint: `/api/client/servers/${targetId}/resources`,
      configOverride
    });
    if (!res.success) throw new Error(res.error || 'Ressourcen-Abfrage fehlgeschlagen');
    return res.data?.attributes || null;
  },

  // Server Power Actions (start, stop, restart, kill): sendPowerAction(panelUrl, apiKey, serverId, signal)
  async sendPowerAction(arg1, arg2, arg3, arg4) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    
    let targetId = arg1;
    let signal = arg2;
    let configOverride = null;

    if (typeof arg1 === 'string' && arg1.startsWith('http')) {
      configOverride = { panelUrl: arg1, apiKey: arg2 };
      targetId = arg3;
      signal = arg4;
    } else if (typeof arg3 === 'object') {
      configOverride = arg3;
    }

    const res = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${targetId}/power`,
      body: { signal },
      configOverride
    });
    if (!res.success) throw new Error(res.error || `Power-Action ${signal} fehlgeschlagen`);
    return true;
  },

  // Liste aller Dateien im Server /mods Ordner (oder beliebiges Verzeichnis)
  async listFiles(...args) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');

    let targetId = null;
    let dir = '/mods';
    let configOverride = null;

    if (args.length >= 3 && typeof args[0] === 'string' && (args[0].includes('.') || args[0].startsWith('http'))) {
      // (panelUrl, apiKey, serverId, dir)
      configOverride = { panelUrl: args[0], apiKey: args[1] };
      targetId = args[2];
      dir = args[3] || '/mods';
    } else {
      // (serverId, dir, configOverride) oder (serverId, configOverride)
      targetId = args[0];
      if (typeof args[1] === 'string') {
        dir = args[1];
        configOverride = (typeof args[2] === 'object' ? args[2] : null);
      } else if (typeof args[1] === 'object') {
        configOverride = args[1];
      }
    }

    const pathWithSlash = dir.startsWith('/') ? dir : `/${dir}`;
    const pathWithoutSlash = dir.replace(/^\/+/, '');

    // 1. Versuch: mit führendem Slash
    let res = await window.electronAPI.bisectApi({
      method: 'GET',
      endpoint: `/api/client/servers/${targetId}/files/list?directory=${encodeURIComponent(pathWithSlash)}`,
      configOverride
    });

    // 2. Versuch: ohne führenden Slash, falls erste Anfrage fehlschlug oder 404 lieferte
    if (!res.success && pathWithoutSlash !== '') {
      res = await window.electronAPI.bisectApi({
        method: 'GET',
        endpoint: `/api/client/servers/${targetId}/files/list?directory=${encodeURIComponent(pathWithoutSlash)}`,
        configOverride
      });
    }

    if (!res.success) throw new Error(res.error || 'Dateiliste konnte nicht geladen werden');
    const rawList = Array.isArray(res.data) ? res.data : (res.data?.data || []);
    return rawList.map(item => item.attributes || item);
  },

  // Alias für getModFiles
  async getModFiles(serverId, configOverride = null) {
    return this.listFiles(serverId, '/mods', configOverride);
  },

  // Lädt eine Mod-Datei per Download-URL direkt auf den Bisect-Server
  async pullModToServer(serverId, { url, filename }, configOverride = null) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    const res = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${serverId}/files/pull`,
      body: {
        url,
        directory: 'mods',
        filename
      },
      configOverride
    });
    if (!res.success) throw new Error(res.error || 'Mod konnte nicht auf den Server übertragen werden');
    return true;
  },

  // Installiert eine Modrinth-Mod direkt auf den Bisect-Server (Download -> Upload in /mods samt automatischer Abhängigkeiten)
  async installModrinthMod({ serverId, downloadUrl, filename, gameVersion = '26.3', loader = 'fabric' }, configOverride = null) {
    if (window.electronAPI?.bisectInstallModrinthMod) {
      const res = await window.electronAPI.bisectInstallModrinthMod({
        serverId,
        downloadUrl,
        filename,
        configOverride,
        gameVersion,
        loader
      });
      if (!res.success) throw new Error(res.error || 'Mod konnte nicht auf den Server übertragen werden');
      return res;
    }
    return this.pullModToServer(serverId, { url: downloadUrl, filename }, configOverride);
  },

  // Aktiviert KOKOTO WebChat (setzt enabled: true in config.yml und führt /kchat reload aus)
  async enableKokotoWebChat(serverId, configOverride = null, port = null) {
    if (window.electronAPI?.bisectEnableKokotoWebChat) {
      const res = await window.electronAPI.bisectEnableKokotoWebChat({ serverId, configOverride, port });
      if (!res.success) throw new Error(res.error || 'Aktivierung fehlgeschlagen');
      return true;
    }
    throw new Error('Electron API nicht verfügbar');
  },

  // Ruft die Netzwerk-Ports (Allocations) des Servers ab
  async getAllocations(serverId, configOverride = null) {
    if (window.electronAPI?.bisectGetAllocations) {
      const res = await window.electronAPI.bisectGetAllocations({ serverId, configOverride });
      if (res.success && res.allocations) return res.allocations;
    }
    return [];
  },

  // Liest den Text-Inhalt einer Datei auf dem Server (unterstützt BisectHosting Starbase POST & Pterodactyl GET)
  async getFileContents(serverId, filePath, configOverride = null) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    const pathWithoutSlash = filePath.replace(/^\/+/, '');
    const pathWithSlash = `/${pathWithoutSlash}`;

    // 1. Zuerst POST mit { file: '/...' } versuchen (BisectHosting Starbase Standard)
    let postRes = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${serverId}/files/contents`,
      body: { file: pathWithSlash },
      configOverride
    });

    if (postRes.success && postRes.data) {
      return typeof postRes.data === 'string' ? postRes.data : JSON.stringify(postRes.data, null, 2);
    }

    // 2. POST mit { file: '...' } ohne führenden Slash
    postRes = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${serverId}/files/contents`,
      body: { file: pathWithoutSlash },
      configOverride
    });

    if (postRes.success && postRes.data) {
      return typeof postRes.data === 'string' ? postRes.data : JSON.stringify(postRes.data, null, 2);
    }

    // 3. Fallback: GET (Standard Pterodactyl)
    const cleanPath = encodeURIComponent(pathWithSlash);
    const getRes = await window.electronAPI.bisectApi({
      method: 'GET',
      endpoint: `/api/client/servers/${serverId}/files/contents?file=${cleanPath}`,
      configOverride
    });

    if (getRes.success && getRes.data) {
      return typeof getRes.data === 'string' ? getRes.data : JSON.stringify(getRes.data, null, 2);
    }

    throw new Error(postRes.error || getRes.error || 'Datei konnte nicht geladen werden');
  },

  // Speichert Text in eine Datei auf dem Server (unterstützt BisectHosting Starbase JSON { file, content } & Pterodactyl query param)
  async writeFile(serverId, filePath, content, configOverride = null) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    const pathWithoutSlash = filePath.replace(/^\/+/, '');
    const pathWithSlash = `/${pathWithoutSlash}`;

    // 1. Zuerst Starbase JSON-Format: POST /files/write { file: '/...', content: '...' }
    let res = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${serverId}/files/write`,
      body: { file: pathWithSlash, content },
      configOverride
    });

    if (res.success) return true;

    // 2. Starbase JSON-Format ohne führenden Slash
    res = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${serverId}/files/write`,
      body: { file: pathWithoutSlash, content },
      configOverride
    });

    if (res.success) return true;

    // 3. Fallback: Pterodactyl Raw Text mit Query-Param
    const cleanPath = encodeURIComponent(pathWithoutSlash);
    res = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${serverId}/files/write?file=${cleanPath}`,
      body: content,
      configOverride
    });

    if (!res.success) throw new Error(res.error || 'Datei konnte nicht gespeichert werden');
    return true;
  },

  // Durchsucht rekursiv den /config-Ordner und das Hauptverzeichnis nach Konfigurationsdateien
  // Config-Dateien des Servers. Mit onPartial erscheinen die ersten Dateien sofort,
  // die Unterordner von /config werden danach (drei gleichzeitig) nachgeladen.
  async listConfigFiles(serverId, configOverride = null, onPartial = null) {
    const CONFIG_FILE = /\.(ya?ml|json|toml|properties|txt|cfg|conf)$/i;
    const isDirectory = (item) => Boolean(item.mode && item.mode.startsWith('d'));
    const byCategory = (a, b) => (a.category || '').localeCompare(b.category || '', 'de') || a.name.localeCompare(b.name, 'de');
    const configFiles = [];
    const emit = () => { if (onPartial) onPartial([...configFiles].sort(byCategory)); };

    // 1. Hauptdateien im Root und der /config-Ordner gleichzeitig
    const [rootFiles, configEntries] = await Promise.all([
      this.listFiles(serverId, '/', configOverride).catch(e => { console.warn('Root-Dateien konnten nicht geladen werden:', e); return []; }),
      this.listFiles(serverId, '/config', configOverride).catch(e => { console.warn('/config Ordner konnte nicht geladen werden:', e); return []; })
    ]);

    for (const f of rootFiles) {
      if (f.name === 'server.properties' || f.name.endsWith('.properties') || f.name === 'ops.json' || f.name === 'whitelist.json') {
        configFiles.push({ name: f.name, path: f.name, size: f.size, category: 'Server-Hauptdateien' });
      }
    }
    const folders = [];
    for (const item of configEntries) {
      if (isDirectory(item)) folders.push(item.name);
      else if (CONFIG_FILE.test(item.name)) {
        configFiles.push({ name: item.name, path: `config/${item.name}`, size: item.size, category: 'Allgemeine Mod-Configs' });
      }
    }
    emit();

    // 2. Unterordner von /config, drei gleichzeitig (das Panel begrenzt Anfragen)
    let next = 0;
    const worker = async () => {
      while (next < folders.length) {
        const folder = folders[next++];
        try {
          const subEntries = await this.listFiles(serverId, `/config/${folder}`, configOverride);
          for (const subItem of subEntries) {
            if (!isDirectory(subItem) && CONFIG_FILE.test(subItem.name)) {
              configFiles.push({ name: subItem.name, path: `config/${folder}/${subItem.name}`, size: subItem.size, category: folder });
            }
          }
          emit();
        } catch (errSub) {
          console.warn(`Unterordner config/${folder} konnte nicht geladen werden:`, errSub);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, folders.length) }, worker));

    return configFiles;
  },

  // Löscht Dateien vom Server: deleteFiles(panelUrl, apiKey, serverId, directory, filesArray)
  async deleteFiles(arg1, arg2, arg3, arg4, arg5) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');

    let targetId = arg1;
    let root = arg2 || 'mods';
    let files = arg3 || [];
    let configOverride = null;

    if (typeof arg1 === 'string' && arg1.startsWith('http')) {
      configOverride = { panelUrl: arg1, apiKey: arg2 };
      targetId = arg3;
      root = (arg4 || 'mods').replace(/^\/+/, '');
      files = Array.isArray(arg5) ? arg5 : [arg5];
    }

    const res = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${targetId}/files/delete`,
      body: {
        root,
        files: Array.isArray(files) ? files : [files]
      },
      configOverride
    });
    if (!res.success) throw new Error(res.error || 'Löschen fehlgeschlagen');
    return true;
  },

  // Alias für deleteModFromServer
  async deleteModFromServer(serverId, filename, configOverride = null) {
    return this.deleteFiles(serverId, 'mods', [filename], configOverride);
  },

  // Sendet einen Konsolenbefehl an den Minecraft-Server
  async sendCommand(serverId, command, configOverride = null) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    const res = await window.electronAPI.bisectApi({
      method: 'POST',
      endpoint: `/api/client/servers/${serverId}/command`,
      body: { command },
      configOverride
    });
    if (!res.success) throw new Error(res.error || 'Befehl konnte nicht gesendet werden');
    return true;
  },

  // Holt die WebSocket-Zugangsdaten für die Live-Serverkonsole
  async getWebsocketCredentials(serverId, configOverride = null) {
    if (!window.electronAPI?.bisectApi) throw new Error('Electron API nicht verfügbar');
    const res = await window.electronAPI.bisectApi({
      method: 'GET',
      endpoint: `/api/client/servers/${serverId}/websocket`,
      configOverride
    });
    if (!res.success) throw new Error(res.error || 'WebSocket-Daten konnten nicht abgerufen werden');
    return res.data?.data || null;
  }
};
