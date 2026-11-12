import React, { useState, useEffect } from 'react';
import { Play, RefreshCw, CheckCircle2, AlertCircle, Server, Terminal, FolderOpen, ShieldCheck, LogIn, Copy, Check, Square, Package, X } from 'lucide-react';
import { ModrinthService } from '../services/modrinthService';
import { compareVersions, getManifestMods } from '../../modpackUtils.js';
import { appAlert } from '../utils/appDialog';
import { getLogLineColor } from '../utils/logFormatter';
import { resolveServerAddress, getActiveServer } from '../utils/serverAddress';

// Feste Modlisten bestimmen die Spielversion, das alte Format folgt weiter dem Server
function getTargetGameVersion(manifest, serverPing) {
  if (manifest?.schemaVersion >= 2) return manifest.gameVersion;
  return serverPing?.version || manifest?.gameVersion || '26.3';
}

export default function PlayView({ manifest, activeSeason, settings, account, onOpenProfile, onRefreshManifest, onModpackSynced, autoLaunch = false, onAutoLaunchHandled }) {
  const activeServer = getActiveServer(settings);
  const openProfilePage = onOpenProfile;
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // { current, total, modName, status }
  const [syncCompleted, setSyncCompleted] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isPreparingLaunch, setIsPreparingLaunch] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [gameStatus, setGameStatus] = useState({ status: 'idle', message: '', percent: 0 });
  const [isStopping, setIsStopping] = useState(false);
  const [serverPing, setServerPing] = useState(null);
  const [userModNotices, setUserModNotices] = useState([]);

  const manifestMods = getManifestMods(manifest);
  const clientModCount = manifestMods.filter(mod => mod.side !== 'server').length;
  const hasModpackUpdate = compareVersions(manifest?.modpackVersion, settings?.lastSyncedModpackVersion) > 0;

  // Eine andere Modliste ist erst nach dem nächsten Abgleich aktuell
  useEffect(() => {
    setSyncCompleted(false);
  }, [manifest?.modpackVersion, manifestMods.length]);

  useEffect(() => {
    let timer = null;
    let cancelled = false;

    const fetchPing = async () => {
      if (document.hidden) return; // Im Hintergrund pausieren
      if (gameStatus.status === 'running') return; // Während Minecraft läuft, Pings pausieren
      if (window.electronAPI?.checkServerStatus) {
        try {
          const res = await window.electronAPI.checkServerStatus(resolveServerAddress(settings, manifest));
          if (!cancelled) setServerPing(res);
        } catch (e) {}
      }
    };

    fetchPing();
    timer = setInterval(fetchPing, 30000);

    const handleVisibility = () => {
      if (!document.hidden) fetchPing();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [settings?.serverIp]);

  useEffect(() => {
    let unsubscribeProgress = null;
    let unsubscribeLog = null;
    let unsubscribeGameStatus = null;

    if (window.electronAPI) {
      if (window.electronAPI.getGameStatus) {
        window.electronAPI.getGameStatus().then(status => {
          if (status) setGameStatus(status);
        });
      }

      unsubscribeProgress = window.electronAPI.onSyncProgress(data => {
        setSyncStatus(data);
        if (data.status === 'completed') {
          setIsSyncing(false);
          setSyncCompleted(true);
        }
      });

      const logQueue = [];
      let logTimer = null;

      unsubscribeLog = window.electronAPI.onGameLog(logLine => {
        logQueue.push(logLine);
        if (!logTimer) {
          logTimer = setTimeout(() => {
            logTimer = null;
            if (logQueue.length > 0) {
              const flushed = logQueue.splice(0, logQueue.length);
              setLogs(prev => [...prev, ...flushed].slice(-150));
            }
          }, 100);
        }
      });

      if (window.electronAPI.onGameStatus) {
        unsubscribeGameStatus = window.electronAPI.onGameStatus(status => {
          setGameStatus(status);
          if (status.status === 'running' || status.status === 'idle') {
            setIsPreparingLaunch(false);
            setIsStopping(false);
          }
        });
      }
    }

    return () => {
      if (unsubscribeProgress) unsubscribeProgress();
      if (unsubscribeLog) unsubscribeLog();
      if (unsubscribeGameStatus) unsubscribeGameStatus();
    };
  }, []);

  // Gleicht die lokalen Mods mit der Liste ab und meldet, ob alles geklappt hat
  const syncManifest = async (target) => {
    const mods = getManifestMods(target);
    setIsSyncing(true);
    setSyncCompleted(false);
    setSyncStatus({ current: 0, total: mods.length, status: 'Auflösen der Modrinth-Versionen...' });

    try {
      const resolvedMods = await ModrinthService.resolveRequiredMods(
        mods,
        getTargetGameVersion(target, serverPing),
        target?.loader || 'fabric'
      );

      if (!window.electronAPI) return false;

      const packComplete = resolvedMods.length === mods.length;
      const result = await window.electronAPI.syncServerMods({
        mods: resolvedMods,
        gameVersion: getTargetGameVersion(target, serverPing),
        loader: target?.loader || 'fabric',
        packComplete,
        // Fehlt eine Mod wegen eines Modrinth-Fehlers, darf nichts weggeräumt werden
        cleanOldMods: target?.cleanOldMods !== false && packComplete
      });

      if (result.userModNotices?.length > 0) {
        setUserModNotices(result.userModNotices);
      }

      if (!result.success) {
        appAlert(`Synchronisationsfehler: ${result.error}`, { warning: true });
        return false;
      }

      setSyncCompleted(true);
      if (target?.modpackVersion) {
        onModpackSynced?.(target.modpackVersion);
      }
      return true;
    } catch (err) {
      console.error(err);
      appAlert(`Fehler bei der Abfrage von Modrinth: ${err.message}`, { warning: true });
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const loadCurrentManifest = async () => {
    const latest = await onRefreshManifest?.();
    return latest || manifest;
  };

  const handleSyncMods = async () => {
    setIsSyncing(true);
    await syncManifest(await loadCurrentManifest());
  };

  const handleLaunch = async () => {
    if (!account) {
      if (openProfilePage) openProfilePage();
      return;
    }

    setIsPreparingLaunch(true);
    setIsSyncing(true);

    try {
      const target = await loadCurrentManifest();
      const synced = await syncManifest(target);
      if (!synced) {
        setIsPreparingLaunch(false);
        return;
      }

      if (window.electronAPI) {
        const res = await window.electronAPI.launchGame({
          serverAddress: resolveServerAddress(settings, target),
          serverName: target?.serverName,
          gameVersion: getTargetGameVersion(target, serverPing),
          loader: target?.loader || 'fabric',
          loaderVersion: target?.loaderVersion || '0.16.9'
        });

        if (res && !res.success) {
          setIsPreparingLaunch(false);
          appAlert(`Startfehler: ${res.error}`, { warning: true });
        }
      }
    } catch (err) {
      setIsPreparingLaunch(false);
      console.error(err);
      appAlert(`Fehler beim Spielstart: ${err.message}`, { warning: true });
    }
  };

  const handleKillGame = async () => {
    if (!window.electronAPI || !window.electronAPI.killGame) return;
    setIsStopping(true);
    try {
      const res = await window.electronAPI.killGame();
      if (!res.success && res.error) {
        appAlert(res.error, { warning: true });
        setIsStopping(false);
      }
    } catch (err) {
      console.error(err);
      setIsStopping(false);
    }
  };

  const handleOpenGameFolder = () => {
    if (window.electronAPI) {
      window.electronAPI.openGameDir();
    }
  };

  const progressPercent = syncStatus && syncStatus.total > 0
    ? Math.round((syncStatus.current / syncStatus.total) * 100)
    : 0;

  const handleCopyLogs = (e) => {
    e.stopPropagation();
    if (logs.length === 0) return;
    navigator.clipboard.writeText(logs.join('\n'));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const isLaunching = isPreparingLaunch || isSyncing || ['launching', 'preparing', 'downloading', 'starting'].includes(gameStatus.status);
  const isGameRunning = gameStatus.status === 'running';

  // Schnellstart von der Seite Spielen: gleich nach dem Öffnen abgleichen und starten
  useEffect(() => {
    if (!autoLaunch || !activeServer) return;
    onAutoLaunchHandled?.();
    handleLaunch();
  }, [autoLaunch, activeServer?.id]);

  if (!activeServer) {
    return (
      <div className="glass-card" style={{ textAlign: 'center', padding: '48px 32px', maxWidth: '640px', margin: '40px auto' }}>
        <h1 className="app-page-title" style={{ fontSize: '24px', marginBottom: '10px' }}>Noch kein Server</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14.5px', lineHeight: 1.6, marginBottom: '22px' }}>
          Lege im Reiter Server einen Server an oder importiere die Serverdatei (.dpmcserver), die du von einem Freund bekommen hast.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Saisonaler Hero-Banner */}
      <div
        className="glass-card"
        style={{
          background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '28px 32px'
        }}
      >
        <div>
          <div className="badge badge-accent" style={{ marginBottom: '10px' }}>
            <ShieldCheck size={14} /> Aktiver Server
          </div>
          <h1 className="app-page-title" style={{ fontSize: '26px', marginBottom: '6px' }}>
            {activeServer?.name || manifest?.serverName || 'Minecraft Server'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '520px', lineHeight: 1.5 }}>
            {activeSeason.tagline}. Alle benötigten Mods werden mit einem Klick direkt über Modrinth auf deinem PC synchronisiert.
          </p>
        </div>

        <div>
          {account ? (
            isGameRunning ? (
              <button
                className="btn-stop-hero"
                onClick={handleKillGame}
                disabled={isStopping}
                title="Minecraft-Prozess beenden"
              >
                <Square size={20} fill="#ffffff" />
                <span>{isStopping ? 'Wird beendet...' : 'BEENDEN'}</span>
              </button>
            ) : (
              <button
                className="btn-play-hero"
                onClick={handleLaunch}
                disabled={isLaunching}
              >
                {isLaunching ? (
                  <>
                    <RefreshCw size={22} className="spin" />
                    <span>Wird gestartet...</span>
                  </>
                ) : (
                  <>
                    <Play size={24} fill="#ffffff" />
                    <span>SPIELEN</span>
                  </>
                )}
              </button>
            )
          ) : (
            <button
              className="btn-play-hero"
              onClick={openProfilePage}
              title="Konto hinzufügen oder als Gast anmelden"
            >
              <LogIn size={22} />
              <span>ANMELDEN</span>
            </button>
          )}
        </div>
      </div>

      {/* Eigene Mods mussten an eine geänderte Modliste angepasst werden */}
      {userModNotices.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', padding: '14px 18px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: '16px', color: '#d97706', fontSize: '13px' }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px', color: '#d97706' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>Deine eigenen Mods wurden angepasst</div>
            {userModNotices.map((notice, index) => <div key={index}>{notice}</div>)}
          </div>
          <button type="button" className="mr-icon-button" onClick={() => setUserModNotices([])} title="Schließen">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Neue veröffentlichte Modliste */}
      {hasModpackUpdate && (
        <div style={{ display: 'flex', gap: '12px', padding: '14px 18px', background: 'var(--color-primary-soft)', border: '1px solid var(--color-primary-border)', borderRadius: '16px', color: 'var(--color-primary-text)', fontSize: '14px' }}>
          <Package size={18} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--color-primary)' }} />
          <div>
            <div style={{ fontWeight: 700 }}>Modpack-Update v{manifest.modpackVersion} verfügbar</div>
            {manifest.changelog && (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px', whiteSpace: 'pre-wrap' }}>{manifest.changelog}</div>
            )}
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px' }}>Wird beim nächsten Klick auf „Spielen“ automatisch installiert.</div>
          </div>
        </div>
      )}

      {/* Moderner Ladebalken während des Spielstarts oder laufendem Spiel */}
      {(isLaunching || isGameRunning) && (
        <div
          className="glass-card"
          style={{
            padding: '20px 24px',
            background: isGameRunning ? 'var(--color-primary-soft)' : 'var(--bg-card)',
            border: `1px solid ${isGameRunning ? 'var(--color-primary-border)' : 'var(--border-card)'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isGameRunning ? (
                <span className="badge" style={{ background: 'var(--color-primary)', color: '#ffffff', padding: '6px 14px', fontSize: '13px' }}>
                  <CheckCircle2 size={16} /> Minecraft läuft
                </span>
              ) : (
                <span className="badge badge-accent" style={{ padding: '6px 14px', fontSize: '13px' }}>
                  <RefreshCw size={15} className="spin" /> Spiel wird gestartet...
                </span>
              )}
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {gameStatus.message || (isGameRunning ? 'Spiel-Prozess ist aktiv.' : 'Bereite Spieldateien und Java vor...')}
              </span>
            </div>

            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-primary)' }}>
              {isGameRunning ? 'Bereit' : `${Math.max(5, gameStatus.percent || 15)}%`}
            </span>
          </div>

          {/* Animierter Fortschrittsbalken */}
          <div style={{ height: '8px', background: 'var(--bg-well)', borderRadius: '999px', overflow: 'hidden', border: '1px solid var(--border-card)' }}>
            <div
              style={{
                height: '100%',
                width: isGameRunning ? '100%' : `${Math.max(10, gameStatus.percent || 20)}%`,
                background: isGameRunning
                  ? '#10b981'
                  : 'var(--color-primary)',
                borderRadius: '999px',
                transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '12px' }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {isGameRunning
                ? 'Minecraft läuft. Du kannst das Spiel jederzeit mit dem roten Button „BEENDEN“ stoppen.'
                : 'Spieldateien, Mod-Synchronisation und Java 21 werden vorbereitet...'}
            </span>
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontFamily: 'inherit'
              }}
            >
              <Terminal size={13} />
              <span>{showLogs ? 'Protokoll verbergen' : 'Protokoll anzeigen'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Grid: Server-Status & Mod-Sync */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Server Info Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Server size={20} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)' }}>Server-Konfiguration</h2>
            </div>
            {serverPing && (
              <span
                className="badge"
                style={{
                  background: serverPing.online ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: serverPing.online ? '#10b981' : '#ef4444',
                  border: `1px solid ${serverPing.online ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`
                }}
              >
                {serverPing.online ? (
                  <>
                    <CheckCircle2 size={13} /> Online ({serverPing.players?.online || 0}/{serverPing.players?.max || 20})
                  </>
                ) : (
                  <>
                    <AlertCircle size={13} /> Offline
                  </>
                )}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Server-Adresse:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{resolveServerAddress(settings, manifest) || 'nicht festgelegt'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Minecraft Version:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{getTargetGameVersion(manifest, serverPing)}</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-card)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Modloader:</span>
              <span style={{ fontWeight: 700, color: 'var(--text-main)', textTransform: 'capitalize' }}>
                {manifest?.loader || 'fabric'} {manifest?.loaderVersion ? `(${manifest.loaderVersion})` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Erforderliche Mods:</span>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                {clientModCount} Mods
              </span>
            </div>
            {manifest?.modpackVersion && manifest.modpackVersion !== '0.0.0' && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Modpack-Version:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>v{manifest.modpackVersion}</span>
              </div>
            )}
          </div>
        </div>

        {/* Mod Sync Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RefreshCw size={20} className={isSyncing ? 'spin' : ''} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)' }}>Mod-Synchronisation</h2>
            </div>
            {syncCompleted && (
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                <CheckCircle2 size={13} /> Aktuell
              </span>
            )}
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
            Der Launcher gleicht deine lokalen Dateien mit dem Server-Manifest ab. Veraltete Mods werden ersetzt, neue direkt von Modrinth nachgeladen.
          </p>

          {isSyncing && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                <span>{syncStatus?.modName || syncStatus?.status || 'Lade herunter...'}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              className="btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleSyncMods}
              disabled={isSyncing}
            >
              <RefreshCw size={16} />
              <span>{isSyncing ? 'Wird geprüft...' : 'Jetzt aktualisieren'}</span>
            </button>
            <button
              className="btn-secondary"
              title="Spiel-Verzeichnis öffnen"
              onClick={handleOpenGameFolder}
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Launcher Logs (Terminal) - eingeklappt oder bei Klick geöffnet */}
      {(!isLaunching && !isGameRunning || showLogs) && (
        <div className="glass-card" style={{ padding: '18px 22px' }}>
          <div
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
            onClick={() => setShowLogs(!showLogs)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>
              <Terminal size={16} style={{ color: 'var(--color-primary)' }} />
              <span>Launcher Konsole & Protokoll {logs.length > 0 ? `(${logs.length} Einträge)` : ''}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyLogs}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: copiedLogs ? 'var(--color-primary-soft)' : 'var(--bg-well)',
                    border: `1px solid ${copiedLogs ? 'var(--color-primary-border)' : 'var(--border-card)'}`,
                    color: copiedLogs ? 'var(--color-primary-text)' : 'var(--text-main)',
                    padding: '5px 12px',
                    borderRadius: '999px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    fontFamily: 'inherit'
                  }}
                  title="Gesamte Konsole in die Zwischenablage kopieren"
                >
                  {copiedLogs ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedLogs ? 'Kopiert!' : 'Kopieren'}</span>
                </button>
              )}
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-primary)' }}>
                {showLogs ? 'Einklappen' : 'Anzeigen'}
              </span>
            </div>
          </div>

          {showLogs && (
            <div
              className="selectable-text"
              style={{
                marginTop: '14px',
                padding: '14px 16px',
                background: '#0f172a',
                borderRadius: '16px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '12px',
                maxHeight: '190px',
                overflowY: 'auto',
                lineHeight: 1.6,
                userSelect: 'text',
                WebkitUserSelect: 'text',
                cursor: 'text'
              }}
            >
              {logs.length === 0 ? (
                <span style={{ color: '#94a3b8', userSelect: 'none' }}>Noch keine Protokolleinträge vorhanden. Bereit zum Start.</span>
              ) : (
                logs.map((log, index) => (
                  <div key={index} style={{ color: getLogLineColor(log), userSelect: 'text', WebkitUserSelect: 'text' }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
