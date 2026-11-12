import React, { useState, useEffect, useRef } from 'react';
import LandingPage from './components/LandingPage';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import PlayView from './components/PlayView';
import ModrinthStoreView from './components/ModrinthStoreView';
import ModsManagerView from './components/ModsManagerView';
import SettingsView from './components/SettingsView';
import ProfileView from './components/ProfileView';
import ServerChatView from './components/ServerChatView';
import SkinStudioView from './components/SkinStudioView';
import AdminPanelView from './components/AdminPanelView';
import GuidesView from './components/GuidesView';
import ChangelogModal from './components/ChangelogModal';
import UpdateModal from './components/UpdateModal';
import SeasonalEffects from './components/effects/SeasonalEffects';
import { applySeasonTheme, getActiveSeasonConfig, getCurrentSeason, subscribeSystemTheme } from './services/seasonManager';
import { getAdminServer, getActiveServer } from './utils/serverAddress';
import { releaseNotes } from './releaseNotes';

// Fallback Manifest falls noch kein Server existiert
import { defaultManifest as defaultLocalManifest } from './defaultManifest';
import ServersView from './components/ServersView';
import InstancesView from './components/InstancesView';
import GlobalBackButton from './components/common/GlobalBackButton';
import ServerImportModal from './components/ServerImportModal';

const CURRENT_VERSION = releaseNotes[0]?.version || '0.1.0';
const MANIFEST_POLL_INTERVAL_MS = 5 * 60 * 1000;

export default function App() {
  const isElectron = typeof window !== 'undefined' && Boolean(window.electronAPI);
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const forceLauncher = urlParams?.get('launcher') === '1';

  if (!isElectron && !forceLauncher) {
    return <LandingPage />;
  }

  const [currentTab, setCurrentTab] = useState('play');
  const [tabHistory, setTabHistory] = useState(['play']);
  // Die Vorschau auf der Webseite kann die Jahreszeit per Adresse vorgeben (?season=winter)
  const seasonParam = urlParams?.get('season');
  const initialSeason = ['default', 'auto', 'spring', 'summer', 'autumn', 'winter'].includes(seasonParam) ? seasonParam : 'default';

  const [settings, setSettings] = useState({
    // Nur in der Vorschau im Browser (ohne Electron): ein erfundener Beispiel-Server
    ...(!isElectron ? {
      servers: [{ id: 'beispiel', name: 'Beispiel-Server', folder: 'Beispiel-Server', address: 'mc.beispiel.de:25565', owner: '', repo: '', branch: 'main', chatPort: null }],
      activeServerId: 'beispiel'
    } : {}),
    themeSeason: initialSeason,
    customTheme: {
      mode: 'gradient',
      color1: '#38bdf8',
      color2: '#c084fc',
      color3: '#ec4899',
      angle: 135
    },
    darkMode: 'system',
    ramMax: 6,
    serverIp: '',
    manifestUrl: '',
    enableAdminMode: false
  });
  const [publishedManifest, setPublishedManifest] = useState(defaultLocalManifest);
  const [incomingServerFile, setIncomingServerFile] = useState(null);
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [modsInstanceId, setModsInstanceId] = useState(null);
  const [manifestReady, setManifestReady] = useState(!window.electronAPI);
  const [draft, setDraft] = useState(null);
  // Modliste und Entwurf des Admin-Servers, unabhängig vom Server der Spielliste
  const [adminManifest, setAdminManifest] = useState(defaultLocalManifest);
  const [adminReady, setAdminReady] = useState(!window.electronAPI);
  const [activeSeason, setActiveSeason] = useState(getActiveSeasonConfig(initialSeason));
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [account, setAccount] = useState(null);
  const [contentScrolled, setContentScrolled] = useState(false);
  const contentAreaRef = useRef(null);

  const isAdmin = Boolean(settings?.enableAdminMode);
  const manifest = publishedManifest;

  const handleTabChange = (nextTab) => {
    if (nextTab === currentTab) return;
    setTabHistory(prev => {
      const filtered = prev.filter(t => t !== nextTab);
      return [...filtered, nextTab];
    });
    setCurrentTab(nextTab);
  };

  // Bei jedem Tabwechsel nach oben scrollen und oberen Fade zurücksetzen
  useEffect(() => {
    if (contentAreaRef.current) {
      contentAreaRef.current.scrollTop = 0;
      contentAreaRef.current.parentElement?.style.setProperty('--scroll-top-opacity', '0');
    }
  }, [currentTab]);

  const handleContentScroll = (e) => {
    const top = e.currentTarget.scrollTop;
    // Sanft proportional zwischen 0px und 45px Scrolltiefe einblenden
    const progress = Math.min(Math.max(top / 45, 0), 1);
    e.currentTarget.parentElement?.style.setProperty('--scroll-top-opacity', progress.toFixed(3));
  };

  // Holt die veröffentlichte Liste und liefert sie zurück
  const refreshManifest = async () => {
    let latest = null;
    try {
      const result = await window.electronAPI.fetchPublishedModpack();
      latest = result?.manifest || null;
      if (latest) setPublishedManifest(latest);
    } catch (err) {
      console.warn('Modliste konnte nicht geladen werden:', err);
    }
    setManifestReady(true);
    return latest;
  };

  const updateSettings = async (patch) => {
    setSettings(prev => ({ ...prev, ...patch }));
    await window.electronAPI?.saveSettings(patch);
  };

  const handleDraftChange = async (nextDraft) => {
    const result = await window.electronAPI.saveModpackDraft(nextDraft);
    if (!result.success) throw new Error(result.error);
    setDraft(nextDraft);
  };

  const adminSharesRepoWithPlay = () => {
    const admin = getAdminServer(settings);
    const play = getActiveServer(settings);
    return Boolean(admin.owner && admin.repo && play
      && play.owner === admin.owner && play.repo === admin.repo && (play.branch || 'main') === (admin.branch || 'main'));
  };

  // Modliste und Entwurf des Admin-Servers laden. Der Entwurf wird erst gebaut, wenn beides da ist.
  const loadAdminData = async () => {
    if (!window.electronAPI) return;
    setAdminReady(false);
    setDraft(null);
    try {
      const [result, savedDraft] = await Promise.all([
        window.electronAPI.fetchPublishedModpackAdmin(),
        window.electronAPI.getModpackDraft()
      ]);
      setAdminManifest(result?.manifest || defaultLocalManifest);
      setDraft(savedDraft || null);
    } catch (err) {
      console.warn('Admin-Daten konnten nicht geladen werden:', err);
    }
    setAdminReady(true);
  };

  const refreshAdminManifest = async () => {
    let latest = null;
    try {
      const result = await window.electronAPI.fetchPublishedModpackAdmin();
      latest = result?.manifest || null;
      if (latest) setAdminManifest(latest);
    } catch (err) {
      console.warn('Modliste des Admin-Servers konnte nicht geladen werden:', err);
    }
    // Liegt das Modpack im selben Repository wie der Spiel-Server, bleibt die Spielansicht aktuell
    if (adminSharesRepoWithPlay()) refreshManifest();
    return latest;
  };

  const handlePublished = ({ manifest: published, draft: updatedDraft }) => {
    setAdminManifest(published);
    if (adminSharesRepoWithPlay()) setPublishedManifest(published);
    setDraft(updatedDraft);
  };

  // Der Admin-Tab verschwindet, sobald kein Admin-Konto mehr angemeldet ist
  useEffect(() => {
    if (!isAdmin && currentTab === 'admin') setCurrentTab('play');
  }, [isAdmin, currentTab]);

  // Veröffentlichte Modliste beim Start und danach alle 5 Minuten abfragen
  useEffect(() => {
    if (!window.electronAPI) return undefined;
    loadAdminData();
    const unsubDraft = window.electronAPI.onModpackDraftUpdated?.((newDraft) => {
      if (newDraft) setDraft(newDraft);
    });
    refreshManifest();
    const interval = setInterval(refreshManifest, MANIFEST_POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      unsubDraft?.();
    };
  }, []);

  // Server hinzugefügt, gewechselt oder entfernt: Einstellungen, Modliste und Entwurf des aktiven Servers neu laden
  useEffect(() => {
    if (!window.electronAPI?.onServersChanged) return undefined;
    return window.electronAPI.onServersChanged(async () => {
      const list = await window.electronAPI.listServers();
      setSettings(prev => ({ ...prev, servers: list.servers, activeServerId: list.activeServerId, adminServer: list.adminServer }));
      setPublishedManifest(defaultLocalManifest);
      refreshManifest();
      loadAdminData();
    });
  }, []);

  // Name, Adresse oder Beschreibung des Admin-Servers geändert
  useEffect(() => {
    if (!window.electronAPI?.onAdminServerChanged) return undefined;
    return window.electronAPI.onAdminServerChanged((adminServer) => {
      setSettings(prev => ({ ...prev, adminServer }));
    });
  }, []);

  // Schnellstart: den Server wählen, zur Server-Ansicht wechseln und dort sofort spielen
  const handleQuickStart = async (serverId) => {
    if (window.electronAPI) {
      const res = await window.electronAPI.setActiveServer(serverId);
      if (!res?.success) return;
      const list = await window.electronAPI.listServers();
      setSettings(prev => ({ ...prev, servers: list.servers, activeServerId: list.activeServerId }));
    }
    setAutoLaunch(true);
    handleTabChange('servers');
  };

  // Die vorgewählte Instanz der Mods-Seite gilt nur für einen Besuch
  useEffect(() => {
    if (currentTab !== 'mods' && currentTab !== 'modrinth') setModsInstanceId(null);
  }, [currentTab]);

  // Eigene Instanzen: Liste aktuell halten
  useEffect(() => {
    if (!window.electronAPI?.onInstancesChanged) return undefined;
    const reload = async () => {
      const [{ instances }, list] = await Promise.all([window.electronAPI.listInstances(), window.electronAPI.listServers()]);
      setSettings(prev => ({ ...prev, instances, servers: list.servers }));
    };
    return window.electronAPI.onInstancesChanged(reload);
  }, []);

  // Serverdatei per Doppelklick oder Kommandozeile geöffnet
  useEffect(() => {
    if (!window.electronAPI?.takePendingServerFile) return undefined;
    window.electronAPI.takePendingServerFile().then(pending => {
      if (pending) {
        setIncomingServerFile(pending);
        setCurrentTab('servers');
      }
    });
    return window.electronAPI.onServerFileOpened((data) => {
      window.electronAPI.takePendingServerFile();
      setIncomingServerFile(data);
      setCurrentTab('servers');
    });
  }, []);

  // Initialisierung beim Start
  useEffect(() => {
    // 1. Einstellungen & Account laden
    if (window.electronAPI) {
      window.electronAPI.getAccount().then(acc => {
        if (acc) setAccount(acc);
      });

      window.electronAPI.getSettings().then(loadedSettings => {
        if (loadedSettings) {
          setSettings(loadedSettings);
          if (loadedSettings.account) setAccount(loadedSettings.account);
          const seasonConfig = applySeasonTheme(
            loadedSettings.themeSeason || 'default',
            loadedSettings.darkMode || 'system',
            loadedSettings.customTheme
          );
          setActiveSeason(seasonConfig);
        }
      });

      // 2. Auto-Update Prüfung (wie in Griddly CSV)
      window.electronAPI.checkForUpdate(CURRENT_VERSION)
        .then(result => {
          if (result && result.hasUpdate) {
            setUpdateInfo(result);
            setShowUpdateModal(true);
          }
        })
        .catch(err => console.warn('Update-Prüfung fehlgeschlagen:', err));
    } else {
      // Browser Dev-Modus
      const seasonConfig = applySeasonTheme('default', 'system');
      setActiveSeason(seasonConfig);
    }
  }, []);

  // Theme & Dark Mode aktualisieren wenn sich Einstellungen ändern
  useEffect(() => {
    const seasonConfig = applySeasonTheme(
      settings.themeSeason || 'default',
      settings.darkMode || 'system',
      settings.customTheme
    );
    setActiveSeason(seasonConfig);
  }, [settings.themeSeason, settings.darkMode, settings.customTheme]);

  // Wenn auf 'system' gestellt ist: live auf OS Theme-Änderungen reagieren
  useEffect(() => {
    if (!settings.darkMode || settings.darkMode === 'system') {
      return subscribeSystemTheme(() => {
        const seasonConfig = applySeasonTheme(
          settings.themeSeason || 'default',
          'system',
          settings.customTheme
        );
        setActiveSeason(seasonConfig);
      });
    }
  }, [settings.themeSeason, settings.darkMode, settings.customTheme]);

  // Beim eigenen Design wählt der Nutzer den Effekt: Funken, immer saisonal (Kalender), eine feste Jahreszeit oder keiner
  let effectSeason = activeSeason?.id;
  // Das dP-Hologramm-Design hat eigene Farben, die Effekte folgen aber der Jahreszeit
  if (!settings.themeSeason || settings.themeSeason === 'default') effectSeason = getCurrentSeason();
  if (settings.themeSeason === 'custom') {
    const choice = settings.customEffect || 'sparks';
    if (choice === 'seasonal') effectSeason = getCurrentSeason();
    else if (choice === 'sparks') effectSeason = 'custom';
    else effectSeason = choice;
  }

  return (
    <div className="app-container">
      {/* Saisonale Partikeleffekte (Schneefall, Herbstblätter, Blüten & Glühwürmchen) */}
      <SeasonalEffects
        season={effectSeason}
        enabled={settings.seasonalEffects !== false && effectSeason !== 'none'}
        isDark={activeSeason?.isDark}
      />

      {/* Frameless Titlebar */}
      <Titlebar
        activeSeason={activeSeason}
        currentVersion={CURRENT_VERSION}
      />

      {/* Haupt-Layout */}
      <div className="main-layout">
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={handleTabChange}
          activeSeason={activeSeason}
          account={account}
          isAdmin={isAdmin}
        />

        <div
          className={`content-viewport ${currentTab === 'skins' || currentTab === 'profile' || currentTab === 'chat' || currentTab === 'mods' || currentTab === 'play' || currentTab === 'admin' || currentTab === 'guides' ? 'no-scroll' : ''}`}
          data-scrolled={contentScrolled ? 'true' : 'false'}
        >
          <div className="content-scroll-fade top" aria-hidden="true" />
          <main
            ref={contentAreaRef}
            onScroll={handleContentScroll}
            className={`content-area ${currentTab === 'skins' || currentTab === 'profile' || currentTab === 'chat' || currentTab === 'mods' || currentTab === 'play' || currentTab === 'admin' || currentTab === 'guides' ? 'no-scroll' : ''}`}
          >
            <div key={currentTab} className="app-page-enter">
              {currentTab === 'servers' && (
                <ServersView
                  settings={settings}
                  isAdmin={isAdmin}
                  onImportFile={setIncomingServerFile}
                  playViewProps={{
                    manifest,
                    activeSeason,
                    settings,
                    account,
                    autoLaunch,
                    onAutoLaunchHandled: () => setAutoLaunch(false),
                    onOpenProfile: () => handleTabChange('profile'),
                    onRefreshManifest: refreshManifest,
                    onModpackSynced: (version) => updateSettings({ lastSyncedModpackVersion: version })
                  }}
                />
              )}

              {currentTab === 'play' && (
                <InstancesView
                  settings={settings}
                  onQuickStart={handleQuickStart}
                  onOpenMods={(instanceId) => {
                    setModsInstanceId(instanceId);
                    handleTabChange('mods');
                  }}
                />
              )}

              {currentTab === 'guides' && (
                <GuidesView
                  isAdmin={isAdmin}
                  manifest={manifest}
                />
              )}

              {currentTab === 'chat' && (
                <ServerChatView
                  account={account}
                  settings={settings}
                  manifest={manifest}
                  onOpenProfile={() => handleTabChange('profile')}
                />
              )}

              {currentTab === 'admin' && isAdmin && (
                <AdminPanelView
                  settings={settings}
                  manifest={adminManifest}
                  publishedManifest={adminManifest}
                  manifestReady={adminReady}
                  draft={draft}
                  onUpdateSettings={setSettings}
                  onDraftChange={handleDraftChange}
                  onPublished={handlePublished}
                  onRefreshManifest={refreshAdminManifest}
                />
              )}

              {(currentTab === 'profile' || currentTab === 'skins') && (
                <ProfileView
                  account={account}
                  onAccountChange={setAccount}
                  isAdmin={isAdmin}
                />
              )}

              {(currentTab === 'mods' || currentTab === 'modrinth') && (
                <ModsManagerView
                  manifest={manifest}
                  settings={settings}
                  initialInstanceId={modsInstanceId}
                  initialTab={currentTab === 'modrinth' ? 'store' : 'installed'}
                />
              )}

              {currentTab === 'settings' && (
                <SettingsView
                  settings={settings}
                  setSettings={setSettings}
                />
              )}

              {currentTab === 'changelog' && (
                <ChangelogModal />
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Zurück-Knopf unten links für Unteransichten */}
      <GlobalBackButton />

      {/* Serverdatei importieren */}
      {incomingServerFile && (
        <ServerImportModal
          data={incomingServerFile}
          onClose={() => setIncomingServerFile(null)}
          onImported={() => {
            setIncomingServerFile(null);
            handleTabChange('servers');
          }}
        />
      )}

      {/* Auto-Update Modal */}
      {showUpdateModal && updateInfo && (
        <UpdateModal
          updateInfo={updateInfo}
          onClose={() => setShowUpdateModal(false)}
        />
      )}
    </div>
  );
}
