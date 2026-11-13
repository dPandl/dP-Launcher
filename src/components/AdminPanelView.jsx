import React, { useState, useEffect, useRef } from 'react';
import {
  Server, Shield, RotateCcw, Play, Square, Skull, Cpu, HardDrive,
  Trash2, CheckCircle2, RefreshCw, LogOut, Upload, Sparkles,
  Box, Check, Activity, HelpCircle, Package, Search, Rocket, GitBranch, Sliders, Terminal, Settings, FileText, AlertCircle
} from 'lucide-react';
import { BisectService } from '../services/bisectService';
import { createDraftFromManifest } from '../services/modpackService';
import { ModrinthService } from '../services/modrinthService';
import { ProjectIcon } from './modrinth/modrinthUi';
import ModpackEditor from './admin/ModpackEditor';
import ModpackDiscover from './admin/ModpackDiscover';
import ModpackPipeline from './admin/ModpackPipeline';
import GithubSettingsCard from './admin/GithubSettingsCard';
import ServerPresentationCard from './admin/ServerPresentationCard';
import ServerChangelog from './ServerChangelog';
import ServerConfigEditor from './admin/ServerConfigEditor';
import ServerConsoleView from './admin/ServerConsoleView';
import { appConfirm, appAlert } from '../utils/appDialog';
import { resolveServerAddress, getAdminServer } from '../utils/serverAddress';
import AdminServerCard from './admin/AdminServerCard';
import BisectCredentialsCard from './admin/BisectCredentialsCard';
import GameVersionCard from './admin/GameVersionCard';

export default function AdminPanelView({
  settings,
  manifest,
  publishedManifest,
  manifestReady,
  draft,
  onUpdateSettings,
  onDraftChange,
  onPublished,
  onRefreshManifest
}) {
  // Hauptbereich: 'modpack' | 'server'
  const [section, setSection] = useState('modpack');
  // Modpack-Unterbereich: 'draft' | 'discover' | 'pipeline' | 'github'
  const [modpackView, setModpackView] = useState('draft');
  // Server-Unterbereich: 'overview' | 'configs'
  const [serverSubView, setServerSubView] = useState('overview');
  const [discoverRequest, setDiscoverRequest] = useState(null);
  const [draftWarnings, setDraftWarnings] = useState([]);
  const isLoadingDraft = useRef(false);

  const [bisectConfig, setBisectConfig] = useState(settings?.bisectConfig || {
    panelUrl: 'https://games.bisecthosting.com',
    apiKey: '',
    serverId: ''
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [servers, setServers] = useState([]);
  const [selectedServer, setSelectedServer] = useState(null);
  const [serverStats, setServerStats] = useState(null);
  const [serverPing, setServerPing] = useState(null);
  const [installedServerMods, setInstalledServerMods] = useState([]);
  const [serverModMeta, setServerModMeta] = useState({});
  const [isLoadingMods, setIsLoadingMods] = useState(false);
  const [loadModsError, setLoadModsError] = useState(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState(null);

  // Beim ersten Öffnen die veröffentlichte Liste in einen Entwurf übernehmen
  const buildDraftFromPublished = async () => {
    if (isLoadingDraft.current) return;
    isLoadingDraft.current = true;
    try {
      const result = await createDraftFromManifest(publishedManifest);
      await onDraftChange(result.draft);
      setDraftWarnings(result.warnings);
    } catch (err) {
      appAlert(`Entwurf konnte nicht erstellt werden: ${err.message}`, { warning: true });
    } finally {
      isLoadingDraft.current = false;
    }
  };

  const adminServer = getAdminServer(settings);
  const hasRepo = Boolean(adminServer.owner && adminServer.repo);

  useEffect(() => {
    if (manifestReady && !draft && hasRepo) {
      buildDraftFromPublished();
    }
  }, [manifestReady, draft, hasRepo]);

  // Name, Adresse, Repository und Darstellung des verwalteten Servers
  const repositoryPanel = (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', paddingBottom: '14px' }}>
      <AdminServerCard settings={settings} />

      {draft && <GameVersionCard draft={draft} published={publishedManifest} onDraftChange={onDraftChange} onRefreshManifest={onRefreshManifest} />}
      <BisectCredentialsCard settings={settings} onUpdateSettings={onUpdateSettings} />
      <GithubSettingsCard />
      <ServerPresentationCard settings={settings} manifest={publishedManifest} onRefreshManifest={onRefreshManifest} />
    </div>
  );

  // Zu den Zugangsdaten springen: Modpack, Reiter "Server & Repository"
  const openCredentials = () => {
    setSection('modpack');
    setModpackView('repository');
  };

  const handleResetDraft = async () => {
    const sure = await appConfirm('Entwurf verwerfen und durch die veröffentlichte Liste ersetzen?', {
      title: 'Entwurf verwerfen?',
      confirmLabel: 'Verwerfen',
      cancelLabel: 'Abbrechen',
      danger: true
    });
    if (sure) {
      buildDraftFromPublished();
    }
  };

  // Prüfen ob bereits ein API Key gespeichert ist
  useEffect(() => {
    if (settings?.bisectConfig?.apiKey) {
      setBisectConfig(settings.bisectConfig);
      testConnection(settings.bisectConfig);
    }
  }, [settings?.bisectConfig]);

  // Live Ping zum Minecraft Server
  useEffect(() => {
    const fetchPing = async () => {
      if (window.electronAPI?.checkServerStatus) {
        try {
          const res = await window.electronAPI.checkServerStatus(getAdminServer(settings)?.address || resolveServerAddress(settings, manifest));
          setServerPing(res);
        } catch (e) { }
      }
    };
    fetchPing();
    const interval = setInterval(fetchPing, 10000);
    return () => clearInterval(interval);
  }, [settings?.serverIp]);

  // Starbase Stats Polling (wenn verbunden)
  useEffect(() => {
    let interval = null;
    if (isConnected && selectedServer && bisectConfig.apiKey) {
      const fetchStats = async () => {
        try {
          const stats = await BisectService.getServerResources(
            bisectConfig.panelUrl,
            bisectConfig.apiKey,
            selectedServer.attributes.identifier
          );
          setServerStats(stats);
        } catch (err) {
          console.warn('Fehler beim Abruf der Server-Stats:', err);
        }
      };
      fetchStats();
      interval = setInterval(fetchStats, 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isConnected, selectedServer, bisectConfig]);

  // Verbindung testen
  const testConnection = async (config) => {
    setIsConnecting(true);
    try {
      const serverList = await BisectService.getServers(config.panelUrl, config.apiKey);
      setServers(serverList);
      setIsConnected(true);

      const target = serverList.find(s => s.attributes.identifier === config.serverId) || serverList[0];
      if (target) {
        setSelectedServer(target);
        if (!config.serverId) {
          setBisectConfig(prev => ({ ...prev, serverId: target.attributes.identifier }));
        }
      }
    } catch (err) {
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setSelectedServer(null);
    setServerStats(null);
  };

  const handlePowerAction = async (signal) => {
    if (!selectedServer) return;
    try {
      await BisectService.sendPowerAction(
        bisectConfig.panelUrl,
        bisectConfig.apiKey,
        selectedServer.attributes.identifier,
        signal
      );
      setActionSuccessMessage(`Befehl "${signal.toUpperCase()}" erfolgreich gesendet!`);
      setTimeout(() => setActionSuccessMessage(null), 4000);
    } catch (err) {
      appAlert(`Fehler beim Senden des Power-Befehls: ${err.message}`, { warning: true });
    }
  };

  const loadServerMods = async (serverOverride = null) => {
    const target = serverOverride || selectedServer;
    if (!target) return;
    setIsLoadingMods(true);
    setLoadModsError(null);
    try {
      const files = await BisectService.listFiles(
        bisectConfig.panelUrl,
        bisectConfig.apiKey,
        target.attributes.identifier,
        '/mods'
      );
      setInstalledServerMods(files.filter(f => f && (f.name?.endsWith('.jar') || f.name?.endsWith('.jar.disabled'))));
    } catch (err) {
      console.error('Fehler beim Laden der Server-Mods:', err);
      setLoadModsError(err.message || 'Verbindung zum Server-Dateisystem fehlgeschlagen.');
    } finally {
      setIsLoadingMods(false);
    }
  };

  // Server-Mods automatisch abrufen, sobald ein Server aktiv ist
  useEffect(() => {
    if (isConnected && selectedServer) {
      loadServerMods();
    }
  }, [isConnected, selectedServer?.attributes?.identifier]);

  const handleOpenModrinthProject = (slugOrRef) => {
    if (!slugOrRef) return;
    setDiscoverRequest({ ref: slugOrRef, ts: Date.now() });
    setSection('modpack');
    setModpackView('discover');
  };

  // Mod-Icons und Namen für installierte Server-Mods auflösen
  useEffect(() => {
    if (!installedServerMods || installedServerMods.length === 0) return;

    let cancelled = false;

    const resolveIcons = async () => {
      const knownMods = [
        ...(draft?.mods || []),
        ...(publishedManifest?.mods || []),
        ...(manifest?.mods || [])
      ];

      const newMeta = { ...serverModMeta };
      const toFetch = [];

      // Bekannte Aliasse für Mod-Dateien, deren Jar-Name vom Modrinth-Slug abweicht
      const ALIASES = {
        'voicechat': 'simple-voice-chat',
        'kchat': 'kokoto-webchat',
        'papi': 'placeholder-api',
        'placeholder': 'placeholder-api'
      };

      for (const file of installedServerMods) {
        if (newMeta[file.name]?.iconUrl) continue;

        const fn = file.name.toLowerCase();

        // 1. Zuerst im Manifest nach exaktem Dateinamen oder Slug suchen
        let matched = knownMods.find(m => m.filename && m.filename.toLowerCase() === fn);
        if (!matched) {
          matched = knownMods.find(m => m.slug && (fn.startsWith(m.slug.toLowerCase()) || fn.includes(m.slug.toLowerCase())));
        }
        if (!matched && fn.startsWith('voicechat')) {
          matched = knownMods.find(m => m.slug === 'simple-voice-chat');
        }

        if (matched) {
          if (matched.iconUrl || matched.icon_url) {
            newMeta[file.name] = {
              iconUrl: matched.iconUrl || matched.icon_url,
              name: matched.name || matched.title || file.name,
              slug: matched.slug || null
            };
          } else {
            toFetch.push({
              file,
              slugOrId: matched.projectId || matched.slug,
              fallbackName: matched.name || file.name
            });
          }
        } else {
          // Unbekannte Server-Datei -> sauberen Slug ermitteln
          const rawName = file.name.replace(/\.(jar|disabled)$/i, '');
          let cleanSlug = rawName
            .split(/[-_](fabric|forge|quilt|v?\d+\.)/i)[0]
            .replace(/[-_]v?\d+.*$/i, '')
            .toLowerCase();

          if (ALIASES[cleanSlug]) {
            cleanSlug = ALIASES[cleanSlug];
          }

          toFetch.push({
            file,
            slugOrId: cleanSlug,
            fallbackName: file.name
          });
        }
      }

      if (Object.keys(newMeta).length > Object.keys(serverModMeta).length) {
        setServerModMeta({ ...newMeta });
      }

      if (toFetch.length === 0) return;

      // 2. Batch-Abruf für alle ermittelten Projekt-IDs / Slugs
      const idsToBatch = toFetch.map(item => item.slugOrId).filter(Boolean);
      let batchResults = [];
      try {
        batchResults = await ModrinthService.getProjects(idsToBatch);
      } catch { }

      const projectMap = new Map();
      for (const p of batchResults) {
        if (p.id) projectMap.set(p.id, p);
        if (p.slug) projectMap.set(p.slug.toLowerCase(), p);
      }

      const remaining = [];
      for (const item of toFetch) {
        const found = projectMap.get(item.slugOrId) || projectMap.get(item.slugOrId?.toLowerCase());
        if (found) {
          newMeta[item.file.name] = {
            iconUrl: found.icon_url || null,
            name: found.title || found.name || item.fallbackName,
            slug: found.slug || found.id || null
          };
        } else {
          remaining.push(item);
        }
      }

      if (Object.keys(newMeta).length > Object.keys(serverModMeta).length) {
        setServerModMeta({ ...newMeta });
      }

      // 3. Für verbleibende Einzelfälle gezielte Suche
      for (const item of remaining) {
        if (cancelled) break;
        try {
          let project = null;
          try {
            project = await ModrinthService.getProject(item.slugOrId);
          } catch (e) {
            const searchRes = await ModrinthService.searchProjects({
              query: item.slugOrId.replace(/[-_]/g, ' '),
              limit: 3
            });
            if (searchRes?.hits && searchRes.hits.length > 0) {
              const exactHit = searchRes.hits.find(h =>
                h.slug?.toLowerCase() === item.slugOrId.toLowerCase() ||
                h.title?.toLowerCase() === item.slugOrId.toLowerCase()
              );
              project = exactHit || searchRes.hits[0];
            }
          }

          if (project && !cancelled) {
            setServerModMeta(prev => ({
              ...prev,
              [item.file.name]: {
                iconUrl: project.icon_url || null,
                name: project.title || project.name || item.fallbackName,
                slug: project.slug || project.id || null
              }
            }));
          }
        } catch { }
      }
    };

    resolveIcons();

    return () => {
      cancelled = true;
    };
  }, [installedServerMods, draft?.mods, publishedManifest?.mods]);

  const handleDeleteServerMod = async (filename) => {
    const sure = await appConfirm(`Soll die Datei "${filename}" wirklich unwiderruflich vom Server gelöscht werden?`, {
      title: 'Datei vom Server löschen?',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      danger: true
    });
    if (!sure) return;
    try {
      await BisectService.deleteFiles(
        bisectConfig.panelUrl,
        bisectConfig.apiKey,
        selectedServer.attributes.identifier,
        '/mods',
        [filename]
      );
      setActionSuccessMessage(`"${filename}" vom Server gelöscht!`);
      setTimeout(() => setActionSuccessMessage(null), 3000);
      loadServerMods();
    } catch (err) {
      appAlert(`Fehler beim Löschen: ${err.message}`, { warning: true });
    }
  };

  const [isRestoringLive, setIsRestoringLive] = useState(false);
  const [backupInfo, setBackupInfo] = useState({ active: false });

  const checkBackupInfo = async () => {
    if (window.electronAPI?.getServerBackupInfo) {
      const info = await window.electronAPI.getServerBackupInfo();
      setBackupInfo(info || { active: false });
    }
  };

  useEffect(() => {
    if (isConnected && selectedServer) {
      checkBackupInfo();
    }
  }, [isConnected, selectedServer?.attributes?.identifier]);

  const handleRestoreServerToLive = async () => {
    if (backupInfo.active) {
      const sure = await appConfirm(
        `Es existiert ein lokales Backup vor dem letzten Test (${backupInfo.count} Mods gesichert).\n\n` +
        `Möchtest du das Backup wiederherstellen? Alle hinzugefügten Test-Mods werden entfernt und alle Original-Mods (inklusive Server-Only Mods) 1:1 wiederhergestellt.`,
        {
          title: 'Server-Backup wiederherstellen?',
          confirmLabel: 'Jetzt wiederherstellen',
          cancelLabel: 'Abbrechen'
        }
      );
      if (!sure) return;
      setIsRestoringLive(true);
      try {
        const res = await window.electronAPI.restoreServerBackup();
        if (res.success) {
          setActionSuccessMessage(`Server-Backup erfolgreich wiederhergestellt! (${res.removedCount} Test-Mods entfernt, ${res.restoredCount} Original-Dateien wiederhergestellt)`);
          setTimeout(() => setActionSuccessMessage(null), 4000);
          await loadServerMods();
          await checkBackupInfo();
          const restartNow = await appConfirm('Möchtest du den Server jetzt neu starten, damit der alte Zustand aktiv wird?', {
            title: 'Server neu starten?',
            confirmLabel: 'Jetzt neu starten',
            cancelLabel: 'Später'
          });
          if (restartNow) {
            await handlePowerAction('restart');
          }
        } else {
          appAlert(`Fehler bei Wiederherstellung: ${res.error}`, { warning: true });
        }
      } catch (err) {
        appAlert(`Fehler: ${err.message}`, { warning: true });
      } finally {
        setIsRestoringLive(false);
      }
      return;
    }

    const pubVersion = publishedManifest?.modpackVersion || manifest?.modpackVersion || '0.1.0';
    const planRes = await window.electronAPI?.applyModpackToServer?.({ dryRun: true, target: 'published' });
    if (!planRes?.success) {
      appAlert(`Vorschau fehlgeschlagen: ${planRes?.error || 'Unbekannter Fehler'}`, { warning: true });
      return;
    }
    const p = planRes.plan;
    if (p.upload.length === 0 && p.remove.length === 0) {
      appAlert(`Der Server entspricht bereits exakt der Live-Version (v${pubVersion}). Keine Test-Mods vorhanden.`, { title: 'Server ist aktuell' });
      return;
    }
    const sure = await appConfirm(
      `Möchtest du alle Test-Mods vom Server entfernen und ihn auf die veröffentlichte Version (v${pubVersion}) zurücksetzen?\n\n` +
      `• Zu entfernende Test-Mods: ${p.remove.length}\n` +
      `• Fehlende Live-Mods: ${p.upload.length}\n\n` +
      `Alle Test-Mods werden entfernt, sodass alle Spieler wieder ohne Mod-Fehler beitreten können.`,
      {
        title: `Server auf Live-Stand (v${pubVersion}) zurücksetzen?`,
        confirmLabel: 'Jetzt zurücksetzen',
        cancelLabel: 'Abbrechen'
      }
    );
    if (!sure) return;
    setIsRestoringLive(true);
    try {
      const res = await window.electronAPI.applyModpackToServer({ dryRun: false, target: 'published' });
      if (res.success) {
        setActionSuccessMessage(`Server erfolgreich auf Live-Stand v${pubVersion} zurückgesetzt! (${res.changed} Datei(en) geändert)`);
        setTimeout(() => setActionSuccessMessage(null), 4000);
        await loadServerMods();
        const restartNow = await appConfirm('Möchtest du den Server jetzt neu starten, damit die Änderungen wirksam werden?', {
          title: 'Server neu starten?',
          confirmLabel: 'Jetzt neu starten',
          cancelLabel: 'Später'
        });
        if (restartNow) {
          await handlePowerAction('restart');
        }
      } else {
        appAlert(`Fehler beim Zurücksetzen: ${res.error}`, { warning: true });
      }
    } catch (err) {
      appAlert(`Fehler: ${err.message}`, { warning: true });
    } finally {
      setIsRestoringLive(false);
    }
  };

  const [isUploadingMod, setIsUploadingMod] = useState(false);
  const [isEnablingKokoto, setIsEnablingKokoto] = useState(false);

  const handleEnableKokoto = async () => {
    if (!selectedServer) return;
    setIsEnablingKokoto(true);
    try {
      await BisectService.enableKokotoWebChat(selectedServer.attributes.identifier, bisectConfig);
      setActionSuccessMessage('KOKOTO WebChat wurde aktiviert (enabled: true) und per /kchat reload neu geladen!');
      setTimeout(() => setActionSuccessMessage(null), 5000);
    } catch (err) {
      appAlert(`Fehler beim Aktivieren: ${err.message}`, { warning: true });
    } finally {
      setIsEnablingKokoto(false);
    }
  };

  const handleUploadLocalMod = async (specificPath = null) => {
    if (!selectedServer) {
      appAlert('Bitte wähle zuerst einen Server aus.', { warning: true });
      return;
    }

    let filePath = specificPath;
    if (!filePath && window.electronAPI?.selectModFile) {
      filePath = await window.electronAPI.selectModFile();
    }

    if (!filePath) return;

    setIsUploadingMod(true);
    try {
      if (window.electronAPI?.bisectUploadMod) {
        const res = await window.electronAPI.bisectUploadMod({
          filePath,
          serverId: selectedServer.attributes.identifier,
          targetDir: 'mods'
        });
        if (res.success) {
          setActionSuccessMessage(`Mod "${res.fileName}" erfolgreich auf den Server hochgeladen!`);
          setTimeout(() => setActionSuccessMessage(null), 4000);
          loadServerMods();
        } else {
          appAlert(`Upload-Fehler: ${res.error}`, { warning: true });
        }
      }
    } catch (err) {
      appAlert(`Fehler beim Hochladen: ${err.message}`, { warning: true });
    } finally {
      setIsUploadingMod(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxHeight: '100%', gap: '14px', flex: 1, minHeight: 0, overflow: 'hidden', padding: 0, boxSizing: 'border-box' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <span className="badge badge-accent" style={{ padding: '3px 8px', fontSize: '11px' }}>
              <Shield size={13} /> BisectHosting Starbase Panel
            </span>
            {isConnected && (
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.16)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.35)', padding: '3px 8px', fontSize: '11px' }}>
                <CheckCircle2 size={12} /> Verbunden {selectedServer?.attributes?.name ? `(${selectedServer.attributes.name})` : ''}
              </span>
            )}
          </div>
          <h1 className="app-page-title" style={{ margin: 0, fontSize: '20px' }}>
            BisectHosting Server-Management
          </h1>
          <p className="app-page-subtitle" style={{ margin: '2px 0 0 0', fontSize: '12.5px' }}>
            Stelle die Modliste zusammen, teste sie lokal, spiele sie auf den Server und veröffentliche sie für alle Spieler.
          </p>
        </div>

        {isConnected && section === 'server' && (
          <button className="btn-secondary" onClick={handleDisconnect} title="Verbindung trennen" style={{ padding: '6px 12px', fontSize: '12px' }}>
            <LogOut size={14} /> Trennen
          </button>
        )}
      </div>

      {/* Erfolgsbanner */}
      {actionSuccessMessage && (
        <div style={{
          padding: '10px 16px',
          background: 'rgba(16, 185, 129, 0.15)',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          borderRadius: '14px',
          color: '#34d399',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          flexShrink: 0
        }}>
          <CheckCircle2 size={16} />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* Hauptbereiche: Modpack vs. Server & Subtabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flexShrink: 0 }}>
        <div className="segmented-control" style={{ alignSelf: 'flex-start' }}>
          <button
            type="button"
            onClick={() => setSection('modpack')}
            className={`segmented-control-btn ${section === 'modpack' ? 'active' : ''}`}
          >
            <Package size={15} /> Modpack
          </button>

          <button
            type="button"
            onClick={() => { setSection('server'); loadServerMods(); }}
            className={`segmented-control-btn ${section === 'server' ? 'active' : ''}`}
          >
            <Server size={15} /> Server
          </button>
        </div>

        {section === 'modpack' && (draft || !hasRepo) && (
          <div className="mr-type-tabs" style={{ margin: 0 }}>
            {[
              { id: 'draft', label: `Entwurf (${draft?.mods?.length ?? 0})`, icon: Package },
              { id: 'discover', label: 'Mods entdecken', icon: Search },
              { id: 'pipeline', label: 'Testen & Veröffentlichen', icon: Rocket },
              { id: 'changelog', label: 'Changelog', icon: FileText },
              { id: 'repository', label: 'Server & Repository', icon: GitBranch }
            ].filter(entry => hasRepo || entry.id === 'repository').map(entry => {
              const Icon = entry.icon;
              return (
                <button key={entry.id} type="button" className={`mr-type-tab ${modpackView === entry.id ? 'active' : ''}`} onClick={() => setModpackView(entry.id)}>
                  <Icon size={15} />
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {section === 'modpack' ? (
        !draft && !hasRepo ? (
          <>
            <div style={{ padding: '10px 16px', marginBottom: '8px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#d97706', fontSize: '13px', flexShrink: 0 }}>
              Trage hier Name, Adresse und das GitHub-Repository deines Servers ein. Danach entsteht der Entwurf aus der veröffentlichten Modliste.
            </div>
            {repositoryPanel}
          </>
        ) : !draft ? (
          <div className="glass-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '10px', color: 'var(--color-primary)' }} />
            <div>Entwurf wird vorbereitet, Versionen werden festgeschrieben...</div>
          </div>
        ) : (
          <>
            {modpackView === 'draft' && (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                <ModpackEditor
                  draft={draft}
                  published={publishedManifest}
                  warnings={draftWarnings}
                  onDraftChange={onDraftChange}
                  onWarnings={setDraftWarnings}
                  onResetDraft={handleResetDraft}
                  onOpenProject={(slug) => {
                    setDiscoverRequest({ ref: slug, ts: Date.now() });
                    setModpackView('discover');
                  }}
                />
              </div>
            )}

            {/* Bleibt eingehängt, damit Suche und Filter beim Wechsel erhalten bleiben */}
            <div style={{ display: modpackView === 'discover' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', height: '100%' }}>
              {draftWarnings.length > 0 && (
                <div style={{ padding: '8px 14px', marginBottom: '8px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', color: '#fbbf24', fontSize: '12.5px', flexShrink: 0 }}>
                  {draftWarnings.map((warning, i) => <div key={i}>{warning}</div>)}
                </div>
              )}
              <ModpackDiscover
                active={modpackView === 'discover'}
                draft={draft}
                openRequest={discoverRequest}
                onDraftChange={onDraftChange}
                onWarnings={setDraftWarnings}
                selectedServer={selectedServer}
                bisectConfig={bisectConfig}
                isConnected={isConnected}
                installedServerMods={installedServerMods}
                onRefreshServerMods={loadServerMods}
              />
            </div>

            {modpackView === 'repository' && repositoryPanel}

            {modpackView === 'changelog' && (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', paddingBottom: '14px' }}>
                <ServerChangelog manifest={publishedManifest} isAdmin onRefreshManifest={onRefreshManifest} />
              </div>
            )}

            {modpackView === 'pipeline' && (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', paddingBottom: '14px' }}>
                <ModpackPipeline
                  draft={draft}
                  published={publishedManifest}
                  settings={settings}
                  onPublished={onPublished}
                />
              </div>
            )}
          </>
        )
      ) : !isConnected ? (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
          <div className="glass-card" style={{ maxWidth: '640px', margin: '40px auto', width: '100%', padding: '36px 32px', textAlign: 'center' }}>
            {!bisectConfig?.apiKey ? (
              <>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
                  <Server size={28} />
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                  Keine BisectHosting-Zugangsdaten hinterlegt
                </h2>
                <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 24px', lineHeight: 1.5 }}>
                  Trage Panel-URL und API-Key deines BisectHosting Starbase-Panels unter Modpack, Reiter „Server &amp; Repository“ ein.
                </p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={openCredentials}
                  style={{ margin: '0 auto', padding: '10px 20px', gap: '8px' }}
                >
                  <Settings size={16} />
                  <span>Zugangsdaten eintragen</span>
                </button>
              </>
            ) : (
              <>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: isConnecting ? 'var(--color-primary-soft)' : 'rgba(239, 68, 68, 0.14)',
                  color: isConnecting ? 'var(--color-primary)' : '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 18px'
                }}>
                  {isConnecting ? <RefreshCw size={28} className="spin" /> : <Server size={28} />}
                </div>
                <h2 style={{ fontSize: '19px', fontWeight: 800, color: 'var(--text-main)', marginBottom: '8px' }}>
                  {isConnecting ? 'Verbinde mit BisectHosting...' : 'Nicht mit BisectHosting verbunden'}
                </h2>
                <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 24px', lineHeight: 1.5 }}>
                  {isConnecting
                    ? 'Server-Liste und Status werden von deinem Panel abgerufen...'
                    : 'Die Verbindung zum Starbase-Panel konnte mit den hinterlegten Zugangsdaten nicht hergestellt werden.'}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => testConnection(bisectConfig)}
                    disabled={isConnecting}
                    style={{ padding: '10px 20px', gap: '8px' }}
                  >
                    <RefreshCw size={16} className={isConnecting ? 'spin' : ''} />
                    <span>{isConnecting ? 'Verbinde...' : 'Erneut verbinden'}</span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={openCredentials}
                    style={{ padding: '10px 18px', gap: '8px' }}
                  >
                    <Settings size={16} />
                    <span>Zugangsdaten anpassen</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {/* Sub-Navigation: Status & Mods vs. Live-Konsole vs. Config-Editor */}
          <div className="mr-type-tabs" style={{ marginBottom: '12px', flexShrink: 0 }}>
            <button
              type="button"
              className={`mr-type-tab ${serverSubView === 'overview' ? 'active' : ''}`}
              onClick={() => setServerSubView('overview')}
            >
              <Server size={15} />
              <span>Status & Mods</span>
            </button>
            <button
              type="button"
              className={`mr-type-tab ${serverSubView === 'console' ? 'active' : ''}`}
              onClick={() => setServerSubView('console')}
            >
              <Terminal size={15} />
              <span>Live-Konsole</span>
            </button>
            <button
              type="button"
              className={`mr-type-tab ${serverSubView === 'configs' ? 'active' : ''}`}
              onClick={() => setServerSubView('configs')}
            >
              <Sliders size={15} />
              <span>Config-Editor</span>
            </button>
          </div>

          {serverSubView === 'console' ? (
            <div style={{ flex: 1, minHeight: 0, paddingRight: '6px', paddingBottom: 0 }}>
              <ServerConsoleView
                selectedServer={selectedServer}
                bisectConfig={bisectConfig}
                isConnected={isConnected}
              />
            </div>
          ) : serverSubView === 'configs' ? (
            <div style={{ flex: 1, minHeight: 0, paddingRight: '6px', paddingBottom: 0, display: 'flex', flexDirection: 'column' }}>
              <ServerConfigEditor
                selectedServer={selectedServer}
                bisectConfig={bisectConfig}
                isConnected={isConnected}
                onServerPowerAction={handlePowerAction}
              />
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '6px', paddingBottom: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Live Server Dashboard & Schnell-Controls */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px' }}>
                {/* Server Übersicht & Power */}
                <div className="glass-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Server size={20} style={{ color: 'var(--color-primary)' }} />
                      <div>
                        <h2 style={{ fontSize: '16.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                          {selectedServer?.attributes?.name || 'Minecraft Server'}
                        </h2>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          ID: {selectedServer?.attributes?.identifier} · IP: {getAdminServer(settings)?.address || resolveServerAddress(settings, manifest) || 'nicht festgelegt'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {serverStats?.current_state === 'running' ? (
                        <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                          <Activity size={13} /> Läuft
                        </span>
                      ) : serverStats?.current_state === 'starting' ? (
                        <span className="badge badge-accent">
                          <RefreshCw size={13} className="spin" /> Startet
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                          <Square size={13} /> Offline
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Power Control Buttons */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
                    <button
                      className="btn-secondary"
                      onClick={() => handlePowerAction('start')}
                      style={{ justifyContent: 'center', color: '#059669' }}
                      title="Server starten"
                    >
                      <Play size={15} fill="currentColor" /> Start
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => handlePowerAction('restart')}
                      style={{ justifyContent: 'center', color: 'var(--color-primary)' }}
                      title="Server neu starten"
                    >
                      <RotateCcw size={15} /> Neustart
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => handlePowerAction('stop')}
                      style={{ justifyContent: 'center', color: '#d97706' }}
                      title="Server regulär herunterfahren"
                    >
                      <Square size={15} fill="currentColor" /> Stopp
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => handlePowerAction('kill')}
                      style={{ justifyContent: 'center', color: '#dc2626' }}
                      title="Server sofort abbrechen"
                    >
                      <Skull size={15} /> Kill
                    </button>
                  </div>

                  {/* Live Ressourcen Gauges */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    <div style={{ background: 'var(--bg-well)', border: '1px solid var(--border-card)', padding: '14px', borderRadius: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Cpu size={14} /> CPU Auslastung
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginTop: '6px' }}>
                        {serverStats ? `${(serverStats.resources?.cpu_absolute || 0).toFixed(1)}%` : '--'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-well)', border: '1px solid var(--border-card)', padding: '14px', borderRadius: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <HardDrive size={14} /> RAM Speicher
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginTop: '6px' }}>
                        {serverStats ? formatBytes(serverStats.resources?.memory_bytes) : '--'}
                      </div>
                    </div>

                    <div style={{ background: 'var(--bg-well)', border: '1px solid var(--border-card)', padding: '14px', borderRadius: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Box size={14} /> Festplatte
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)', marginTop: '6px' }}>
                        {serverStats ? formatBytes(serverStats.resources?.disk_bytes) : '--'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Minecraft Ping & Versions-Check */}
                <div className="glass-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <Activity size={20} style={{ color: 'var(--color-primary)' }} />
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)' }}>Minecraft Status & Spielversion</h2>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13.5px' }}>
                    {(() => {
                      const isRunning = Boolean(serverPing?.online || serverStats?.current_state === 'running');
                      const isStarting = serverStats?.current_state === 'starting';
                      const isStopping = serverStats?.current_state === 'stopping';

                      // Version, die der Server selbst meldet. Ohne Antwort bleibt sie leer, es wird nichts erraten.
                      const serverVersion = serverPing?.version || '';
                      const packVersion = manifest?.gameVersion || '';
                      const packLoader = manifest?.loader ? manifest.loader.charAt(0).toUpperCase() + manifest.loader.slice(1) : '';
                      const versionsMatch = Boolean(serverVersion && packVersion && serverVersion.includes(packVersion));
                      const pingFailed = isRunning && !serverPing?.version;

                      return (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                            <span style={{
                              fontWeight: 700,
                              color: isRunning ? '#059669' : isStarting ? 'var(--color-primary)' : isStopping ? '#d97706' : '#dc2626'
                            }}>
                              {isRunning
                                ? 'Online (Erreichbar & Läuft)'
                                : isStarting
                                  ? 'Server startet...'
                                  : isStopping
                                    ? 'Wird heruntergefahren...'
                                    : 'Offline / Nicht erreichbar'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Server Version:</span>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                              {serverVersion || (pingFailed ? 'nicht abrufbar' : '–')}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Modpack der Spieler:</span>
                            <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
                              {packVersion ? `${packVersion}${packLoader ? ` · ${packLoader}${manifest?.loaderVersion ? ` ${manifest.loaderVersion}` : ''}` : ''}` : '–'}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Kompatibilität:</span>
                            {isRunning && versionsMatch ? (
                              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                                <Check size={12} /> Passt: Minecraft {packVersion}
                              </span>
                            ) : isRunning && serverVersion ? (
                              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.4)' }}>
                                <AlertCircle size={12} /> Server {serverVersion}, Modpack {packVersion || '?'}
                              </span>
                            ) : isRunning ? (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Server läuft, Version nicht abrufbar</span>
                            ) : isStarting ? (
                              <span className="badge badge-accent">
                                <RefreshCw size={12} className="spin" /> Server startet...
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Server offline</span>
                            )}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Spieler Online:</span>
                            <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                              {serverPing?.players ? `${serverPing.players.online} / ${serverPing.players.max} Spieler` : '–'}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Auf dem Server installierte Mods */}
              <div className="glass-card">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Dateien im Server /mods Ordner</h2>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Lade reine Server-Mods (.jar) direkt hoch – ohne sie ins Modpack der Spieler aufnehmen zu müssen.
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {installedServerMods.some(f => f.name.toLowerCase().includes('kokoto')) && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleEnableKokoto}
                          disabled={isEnablingKokoto}
                          style={{
                            padding: '8px 16px',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#16a34a',
                            borderColor: 'rgba(34, 197, 94, 0.4)',
                            background: 'rgba(34, 197, 94, 0.12)'
                          }}
                          title="Schaltet enabled: true in config/KOKOTO-WebChat/config.yml und führt /kchat reload aus"
                        >
                          <Sparkles size={14} className={isEnablingKokoto ? 'spin' : ''} />
                          <span>{isEnablingKokoto ? 'Wird aktiviert...' : 'WebChat aktivieren'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setServerSubView('configs')}
                          style={{
                            padding: '8px 14px',
                            fontSize: '13px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                          title="Öffnet den visuellen Config-Editor für KOKOTO WebChat"
                        >
                          <Sliders size={14} />
                          <span>Config bearbeiten</span>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setSection('modpack');
                        setModpackView('discover');
                      }}
                      style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Search size={14} />
                      <span>Mod aus Modrinth installieren</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => handleUploadLocalMod()}
                      disabled={isUploadingMod}
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                      <Upload size={14} className={isUploadingMod ? 'spin' : ''} />
                      <span>{isUploadingMod ? 'Wird hochgeladen...' : '+ Mod (.jar) hochladen'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => loadServerMods()}
                      disabled={isLoadingMods}
                      style={{ padding: '8px 14px', fontSize: '13px' }}
                    >
                      <RefreshCw size={14} className={isLoadingMods ? 'spin' : ''} />
                      <span>Aktualisieren</span>
                    </button>
                    {backupInfo.active && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleRestoreServerToLive}
                        disabled={isRestoringLive}
                        style={{
                          padding: '8px 14px',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#f59e0b',
                          borderColor: 'rgba(245, 158, 11, 0.4)'
                        }}
                        title="Löscht alle Test-Mods und stellt das vor dem Test gesicherte Server-Backup wieder her (inklusive aller Server-Only Mods)"
                      >
                        <RotateCcw size={14} className={isRestoringLive ? 'spin' : ''} />
                        <span>{isRestoringLive ? 'Wird wiederhergestellt...' : 'Test beenden & Backup wiederherstellen'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {isLoadingMods ? (
                  <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    <RefreshCw size={18} className="spin" style={{ display: 'block', margin: '0 auto 8px', color: 'var(--color-primary)' }} />
                    <span>Lade Server-Dateien...</span>
                  </div>
                ) : loadModsError ? (
                  <div style={{ textAlign: 'center', padding: '28px', color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                    <div style={{ fontWeight: 600, marginBottom: '6px' }}>Fehler beim Abruf der Server-Dateien</div>
                    <div style={{ fontSize: '13px', marginBottom: '12px', opacity: 0.9 }}>{loadModsError}</div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => loadServerMods()}
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      Erneut versuchen
                    </button>
                  </div>
                ) : installedServerMods.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    Keine Mod-Dateien im Server-Verzeichnis gefunden.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {installedServerMods.map(file => {
                      const meta = serverModMeta[file.name] || {};
                      const iconUrl = meta.iconUrl || null;
                      const displayName = meta.name || file.name;
                      const slug = meta.slug || null;

                      return (
                        <div
                          key={file.name}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 16px',
                            background: 'var(--bg-well)',
                            borderRadius: '12px',
                            border: '1px solid var(--border-card)',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                flexShrink: 0,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                cursor: slug ? 'pointer' : 'default'
                              }}
                              onClick={() => slug && handleOpenModrinthProject(slug)}
                              title={slug ? `${displayName} auf Modrinth öffnen` : displayName}
                            >
                              <ProjectIcon url={iconUrl} size={38} />
                            </div>

                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {slug ? (
                                  <button
                                    type="button"
                                    className="mr-link-title"
                                    style={{ fontSize: '13.5px', fontWeight: 700, padding: 0, border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer' }}
                                    onClick={() => handleOpenModrinthProject(slug)}
                                    title="Detailseite öffnen"
                                  >
                                    {displayName}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                                    {displayName}
                                  </span>
                                )}
                                {file.size && (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                    {formatBytes(file.size)}
                                  </span>
                                )}
                              </div>
                              {displayName !== file.name && (
                                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {file.name}
                                </div>
                              )}
                            </div>
                          </div>

                          <button
                            className="btn-secondary"
                            onClick={() => handleDeleteServerMod(file.name)}
                            style={{ padding: '6px 12px', color: '#dc2626' }}
                            title="Vom Server entfernen"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
