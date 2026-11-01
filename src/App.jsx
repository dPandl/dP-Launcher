import React, { useState, useEffect } from 'react';
import Titlebar from './components/Titlebar';
import Sidebar from './components/Sidebar';
import PlayView from './components/PlayView';
import ModrinthStoreView from './components/ModrinthStoreView';
import ModsManagerView from './components/ModsManagerView';
import SettingsView from './components/SettingsView';
import ChangelogModal from './components/ChangelogModal';
import UpdateModal from './components/UpdateModal';
import { applySeasonTheme, getActiveSeasonConfig } from './services/seasonManager';
import { releaseNotes } from './releaseNotes';

// Fallback Manifest falls noch kein Server existiert
import defaultLocalManifest from '../server-manifest.json';

const CURRENT_VERSION = releaseNotes[0]?.version || '0.1.0';

export default function App() {
  const [currentTab, setCurrentTab] = useState('play');
  const [settings, setSettings] = useState({
    themeSeason: 'auto',
    ramMax: 6,
    serverIp: 'dein-server.bisecthosting.me:25565',
    manifestUrl: ''
  });
  const [manifest, setManifest] = useState(defaultLocalManifest);
  const [activeSeason, setActiveSeason] = useState(getActiveSeasonConfig('auto'));
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  // Initialisierung beim Start
  useEffect(() => {
    // 1. Einstellungen laden
    if (window.electronAPI) {
      window.electronAPI.getSettings().then(loadedSettings => {
        if (loadedSettings) {
          setSettings(loadedSettings);
          const seasonConfig = applySeasonTheme(loadedSettings.themeSeason || 'auto');
          setActiveSeason(seasonConfig);

          // Remote Manifest laden falls konfiguriert
          if (loadedSettings.manifestUrl) {
            window.electronAPI.fetchRemoteManifest(loadedSettings.manifestUrl)
              .then(remoteManifest => {
                if (remoteManifest) setManifest(remoteManifest);
              })
              .catch(err => console.warn('Konnte remote Manifest nicht laden:', err));
          }
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
      const seasonConfig = applySeasonTheme('auto');
      setActiveSeason(seasonConfig);
    }
  }, []);

  // Theme aktualisieren wenn sich Einstellungen ändern
  useEffect(() => {
    const seasonConfig = applySeasonTheme(settings.themeSeason || 'auto');
    setActiveSeason(seasonConfig);
  }, [settings.themeSeason]);

  return (
    <div className="app-container">
      {/* Frameless Titlebar */}
      <Titlebar
        activeSeason={activeSeason}
        currentVersion={CURRENT_VERSION}
      />

      {/* Haupt-Layout */}
      <div className="main-layout">
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          activeSeason={activeSeason}
        />

        <main className="content-area">
          {currentTab === 'play' && (
            <PlayView
              manifest={manifest}
              activeSeason={activeSeason}
              settings={settings}
            />
          )}

          {currentTab === 'modrinth' && (
            <ModrinthStoreView
              manifest={manifest}
            />
          )}

          {currentTab === 'mods' && (
            <ModsManagerView />
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
        </main>
      </div>

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
