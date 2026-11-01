import React, { useState, useEffect } from 'react';
import { Play, RefreshCw, CheckCircle2, AlertCircle, Server, Terminal, FolderOpen, ShieldCheck } from 'lucide-react';
import { ModrinthService } from '../services/modrinthService';

export default function PlayView({ manifest, activeSeason, settings }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // { current, total, modName, status }
  const [syncCompleted, setSyncCompleted] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    let unsubscribeProgress = null;
    let unsubscribeLog = null;

    if (window.electronAPI) {
      unsubscribeProgress = window.electronAPI.onSyncProgress(data => {
        setSyncStatus(data);
        if (data.status === 'completed') {
          setIsSyncing(false);
          setSyncCompleted(true);
        }
      });

      unsubscribeLog = window.electronAPI.onGameLog(logLine => {
        setLogs(prev => [...prev.slice(-100), logLine]);
      });
    }

    return () => {
      if (unsubscribeProgress) unsubscribeProgress();
      if (unsubscribeLog) unsubscribeLog();
    };
  }, []);

  // Synchronisation starten
  const handleSyncMods = async () => {
    if (!manifest || !manifest.requiredMods) return;
    setIsSyncing(true);
    setSyncCompleted(false);
    setSyncStatus({ current: 0, total: manifest.requiredMods.length, status: 'Auflösen der Modrinth-Versionen...' });

    try {
      // 1. Modrinth API: Exakte Download-URLs & Hashes abfragen
      const resolvedMods = await ModrinthService.resolveRequiredMods(
        manifest.requiredMods,
        manifest.gameVersion || '1.21.1',
        manifest.loader || 'fabric'
      );

      // 2. An Electron Main Process zur Prüfung & Download übergeben
      if (window.electronAPI) {
        const result = await window.electronAPI.syncServerMods({
          requiredMods: resolvedMods,
          cleanOldMods: manifest.cleanOldMods !== false
        });

        if (result.success) {
          setSyncCompleted(true);
        } else {
          alert(`Synchronisationsfehler: ${result.error}`);
        }
      }
    } catch (err) {
      console.error(err);
      alert(`Fehler bei der Abfrage von Modrinth: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLaunch = async () => {
    setIsPlaying(true);
    if (!syncCompleted) {
      await handleSyncMods();
    }

    if (window.electronAPI) {
      await window.electronAPI.launchGame({
        serverAddress: manifest?.serverAddress || settings?.serverIp,
        gameVersion: manifest?.gameVersion || '1.21.1',
        loader: manifest?.loader || 'fabric'
      });
    }

    setTimeout(() => {
      setIsPlaying(false);
    }, 3000);
  };

  const handleOpenGameFolder = () => {
    if (window.electronAPI) {
      window.electronAPI.openGameDir();
    }
  };

  const progressPercent = syncStatus && syncStatus.total > 0
    ? Math.round((syncStatus.current / syncStatus.total) * 100)
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Saisonaler Hero-Banner */}
      <div
        className="glass-card"
        style={{
          background: `linear-gradient(135deg, rgba(17, 24, 39, 0.9), rgba(15, 23, 42, 0.7)), radial-gradient(circle at top right, var(--color-glow), transparent 70%)`,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '32px'
        }}
      >
        <div>
          <div className="badge badge-accent" style={{ marginBottom: '12px' }}>
            <ShieldCheck size={14} /> Bisect Community Edition
          </div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', marginBottom: '8px' }}>
            {manifest?.serverName || 'Minecraft Server'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', maxWidth: '480px' }}>
            {activeSeason.tagline}. Alle benötigten Mods werden mit einem Klick direkt über Modrinth auf deinem PC synchronisiert.
          </p>
        </div>

        <div>
          <button
            className="btn-play-hero"
            onClick={handleLaunch}
            disabled={isSyncing || isPlaying}
          >
            <Play size={24} fill="#ffffff" />
            <span>{isPlaying ? 'Wird gestartet...' : isSyncing ? 'Synchronisiere...' : 'SPIELEN'}</span>
          </button>
        </div>
      </div>

      {/* Grid: Server-Status & Mod-Sync */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Server Info Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Server size={20} style={{ color: 'var(--color-accent)' }} />
            <h2 style={{ fontSize: '17px', fontWeight: 600 }}>Server-Konfiguration</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Server-Adresse:</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>{manifest?.serverAddress || settings?.serverIp}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Minecraft Version:</span>
              <span style={{ fontWeight: 600, color: '#fff' }}>{manifest?.gameVersion || '1.21.1'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Modloader:</span>
              <span style={{ fontWeight: 600, color: '#fff', textTransform: 'capitalize' }}>
                {manifest?.loader || 'fabric'} {manifest?.loaderVersion ? `(${manifest.loaderVersion})` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Erforderliche Mods:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
                {manifest?.requiredMods?.length || 0} Mods
              </span>
            </div>
          </div>
        </div>

        {/* Mod Sync Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <RefreshCw size={20} className={isSyncing ? 'spin' : ''} style={{ color: 'var(--color-accent)' }} />
              <h2 style={{ fontSize: '17px', fontWeight: 600 }}>Mod-Synchronisation</h2>
            </div>
            {syncCompleted && (
              <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
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

      {/* Launcher Logs (Terminal) */}
      <div className="glass-card" style={{ padding: '16px 20px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setShowLogs(!showLogs)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)' }}>
            <Terminal size={16} />
            <span>Launcher Konsole & Protokoll {logs.length > 0 ? `(${logs.length} Einträge)` : ''}</span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--color-accent)' }}>
            {showLogs ? 'Einklappen' : 'Anzeigen'}
          </span>
        </div>

        {showLogs && (
          <div
            style={{
              marginTop: '12px',
              padding: '12px',
              background: '#070a10',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '12px',
              maxHeight: '160px',
              overflowY: 'auto',
              color: '#10b981',
              lineHeight: 1.6
            }}
          >
            {logs.length === 0 ? (
              <span style={{ color: 'var(--text-muted)' }}>Noch keine Protokolleinträge vorhanden. Bereit zum Start.</span>
            ) : (
              logs.map((log, index) => <div key={index}>{log}</div>)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
