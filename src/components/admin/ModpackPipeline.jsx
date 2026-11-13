import React, { useState, useEffect, useMemo } from 'react';
import { FlaskConical, Zap, Rocket, RefreshCw, RotateCcw, RotateCw, Terminal, CheckCircle2, AlertCircle, Play, Square, FolderOpen, Shield, Sliders, Check, Search, FileText, Sparkles } from 'lucide-react';
import Dialog from '../common/Dialog';
import ServerConsoleView from './ServerConsoleView';
import { BisectService } from '../../services/bisectService';
import { diffManifests } from '../../services/modpackService';
import { bumpVersion, getManifestMods, isValidCustomVersion } from '../../../modpackUtils.js';
import { appConfirm, appAlert } from '../../utils/appDialog';
import { getLogLineColor } from '../../utils/logFormatter';
import { getSyncedConfigFiles } from './ConfigSyncCard';

function Step({ icon: Icon, title, children }) {
  return (
    <div className="glass-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <Icon size={20} style={{ color: 'var(--color-accent)' }} />
        <h2 style={{ fontSize: '16px', fontWeight: 700 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Notice({ type, children }) {
  const color = type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#10b981';
  const Icon = type === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div style={{ display: 'flex', gap: '8px', padding: '10px 12px', marginTop: '12px', background: `${color}1f`, border: `1px solid ${color}59`, borderRadius: '8px', color, fontSize: '13px' }}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
      <div>{children}</div>
    </div>
  );
}

const MAX_TEST_LOG_LINES = 200;

export default function ModpackPipeline({ draft, published, settings, onPublished, selectedServer = null, bisectConfig = null, isConnected = false }) {
  // Die Server-ID aus den Einstellungen, sonst die des verbundenen Servers im Panel
  const serverId = settings?.bisectConfig?.serverId || selectedServer?.attributes?.identifier;
  const [showConsole, setShowConsole] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);

  const [gameStatus, setGameStatus] = useState({ status: 'idle', message: '', percent: 0 });
  const [testError, setTestError] = useState(null);
  const [testLog, setTestLog] = useState([]);
  const [showTestLog, setShowTestLog] = useState(false);

  const [serverPlan, setServerPlan] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyLog, setApplyLog] = useState([]);
  const [applyProgress, setApplyProgress] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [backupInfo, setBackupInfo] = useState({ active: false });
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  const checkBackupInfo = async () => {
    if (window.electronAPI?.getServerBackupInfo) {
      const info = await window.electronAPI.getServerBackupInfo();
      setBackupInfo(info || { active: false });
    }
  };

  useEffect(() => {
    checkBackupInfo();
  }, [serverId]);

  const [bumpType, setBumpType] = useState('patch');
  const [customVersion, setCustomVersion] = useState('');
  const [changelog, setChangelog] = useState(draft?.changelog || '');
  const [changelogTitle, setChangelogTitle] = useState(draft?.changelogTitle || '');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);

  const handleChangelogChange = (val) => {
    setChangelog(val);
    if (onDraftChange) {
      onDraftChange({ ...draft, changelog: val });
    }
  };

  const diff = diffManifests(published, draft);
  // Das alte Format hat keine festen Versionen und muss einmal veröffentlicht werden
  const publishedIsPinned = Array.isArray(published?.mods);
  const isCustom = bumpType === 'custom';
  const customVersionValid = isValidCustomVersion(customVersion, published?.modpackVersion);
  // Auch eine geänderte Minecraft- oder Fabric-Version allein ist eine Änderung, die veröffentlicht werden darf
  const versionsChanged = publishedIsPinned && (
    (draft.gameVersion || '') !== (published?.gameVersion || '') || (draft.loaderVersion || '') !== (published?.loaderVersion || '')
  );
  const canPublish = draft.mods.length > 0 && (diff.total > 0 || versionsChanged || !publishedIsPinned) && (!isCustom || customVersionValid);
  const nextVersion = isCustom ? customVersion.trim() : bumpVersion(published?.modpackVersion, bumpType);
  const serverPending = serverPlan && (serverPlan.upload.length > 0 || serverPlan.remove.length > 0);

  const loadServerPlan = async () => {
    if (!serverId || !window.electronAPI) return;
    const res = await window.electronAPI.applyModpackToServer({ dryRun: true });
    if (res.success) {
      setServerPlan(res.plan);
      setPlanError(null);
    } else {
      setServerPlan(null);
      setPlanError(res.error);
    }
  };

  // Die Vorschau folgt jeder Änderung am gespeicherten Entwurf
  useEffect(() => {
    loadServerPlan();
  }, [draft, serverId]);

  useEffect(() => {
    if (!window.electronAPI?.onModpackServerLog) return undefined;
    return window.electronAPI.onModpackServerLog(line => setApplyLog(prev => [...prev, line]));
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onModpackServerProgress) return undefined;
    return window.electronAPI.onModpackServerProgress(setApplyProgress);
  }, []);

  useEffect(() => {
    if (!window.electronAPI?.onGameStatus) return undefined;
    window.electronAPI.getGameStatus().then(status => {
      if (status) setGameStatus(status);
    });
    const unsubscribeStatus = window.electronAPI.onGameStatus(setGameStatus);
    const logQueue = [];
    let logTimer = null;
    const unsubscribeLog = window.electronAPI.onGameLog(line => {
      logQueue.push(line);
      if (!logTimer) {
        logTimer = setTimeout(() => {
          logTimer = null;
          if (logQueue.length > 0) {
            const flushed = logQueue.splice(0, logQueue.length);
            setTestLog(prev => [...prev, ...flushed].slice(-MAX_TEST_LOG_LINES));
          }
        }, 100);
      }
    });
    return () => {
      if (logTimer) clearTimeout(logTimer);
      unsubscribeStatus();
      unsubscribeLog();
    };
  }, []);

  const isGameRunning = gameStatus.status === 'running';
  const isGameStarting = !isGameRunning && gameStatus.status !== 'idle';

  const handleStartTest = async () => {
    setTestError(null);
    setTestLog([]);
    const res = await window.electronAPI.launchModpackTest();
    if (!res.success) setTestError(res.error);
  };

  const handleStopTest = async () => {
    const res = await window.electronAPI.killGame();
    if (!res.success && res.error) setTestError(res.error);
  };

  const handleApply = async () => {
    const sure = await appConfirm(
      `Vor dem Anwenden sichert der Launcher automatisch alle aktuellen Mod-Dateien im Server /mods-Ordner lokal als Backup auf deinem PC (inklusive aller Server-Only Mods wie KOKOTO etc.).\n\n` +
      `• Test-Mods hochladen: ${serverPlan.upload.length}\n` +
      `• Mods entfernen: ${serverPlan.remove.length}\n\n` +
      `Möchtest du das automatische Backup erstellen und die Test-Mods aufspielen?\n` +
      `(Du kannst den Test danach jederzeit mit 1 Klick beenden und das Backup wiederherstellen.)`,
      {
        title: 'Test-Mods mit automatischem Backup aufspielen?',
        confirmLabel: 'Backup erstellen & Testen',
        cancelLabel: 'Abbrechen'
      }
    );
    if (!sure) return;
    setIsApplying(true);
    setApplyLog([]);
    setApplyProgress(null);
    setApplyResult(null);
    const res = await window.electronAPI.applyModpackToServer({ dryRun: false, target: 'draft' });
    setApplyResult(res);
    setApplyProgress(null);
    setIsApplying(false);
    await checkBackupInfo();
    loadServerPlan();
  };

  const handleRestoreBackup = async () => {
    const sure = await appConfirm(
      `Möchtest du den Test beenden und das vor dem Test gesicherte Server-Backup wiederherstellen?\n\n` +
      `• Alle für den Test hochgeladenen Mods werden vom Server gelöscht.\n` +
      `• Alle Original-Mods (auch Server-Only Mods wie KOKOTO etc.) werden 1:1 wiederhergestellt.\n\n` +
      `Der Server ist danach exakt im selben Zustand wie vor dem Test.`,
      {
        title: 'Server-Backup wiederherstellen?',
        confirmLabel: 'Jetzt wiederherstellen',
        cancelLabel: 'Abbrechen'
      }
    );
    if (!sure) return;
    setIsRestoringBackup(true);
    setApplyLog([]);
    try {
      const res = await window.electronAPI.restoreServerBackup();
      if (res.success) {
        setApplyResult({
          success: true,
          changed: res.removedCount + res.restoredCount,
          restarted: false
        });
        await checkBackupInfo();
        await loadServerPlan();
        const restartNow = await appConfirm('Möchtest du den Server jetzt neu starten, damit der alte Zustand aktiv wird?', {
          title: 'Server neu starten?',
          confirmLabel: 'Jetzt neu starten',
          cancelLabel: 'Später'
        });
        if (restartNow) {
          await handleRestart();
        }
      } else {
        appAlert(`Fehler bei Wiederherstellung: ${res.error}`, { warning: true });
      }
    } catch (err) {
      appAlert(`Fehler: ${err.message}`, { warning: true });
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleRestart = async () => {
    setIsRestarting(true);
    try {
      await BisectService.sendPowerAction(serverId, 'restart');
      setApplyResult(prev => ({ success: true, ...prev, changed: 0, restarted: true }));
    } catch (err) {
      appAlert(`Neustart fehlgeschlagen: ${err.message}`, { warning: true });
    } finally {
      setIsRestarting(false);
    }
  };

  const handleRestartClick = async () => {
    const sure = await appConfirm('Den Server jetzt neu starten? Spieler, die gerade online sind, werden getrennt.', {
      title: 'Server neu starten?',
      confirmLabel: 'Jetzt neu starten',
      cancelLabel: 'Abbrechen'
    });
    if (sure) await handleRestart();
  };

  const handlePublish = async () => {
    const sure = await appConfirm(`Modliste als Version v${nextVersion} für alle Spieler veröffentlichen?`, {
      title: 'Modpack veröffentlichen?',
      confirmLabel: 'Jetzt veröffentlichen',
      cancelLabel: 'Abbrechen'
    });
    if (!sure) return;
    setIsPublishing(true);
    setPublishResult(null);
    const res = await window.electronAPI.publishModpack({
      bumpType,
      customVersion: isCustom ? customVersion.trim() : '',
      changelog,
      title: changelogTitle,
      selectedConfigFiles: getSyncedConfigFiles()
    });
    setIsPublishing(false);
    setPublishResult(res);
    if (res.success) {
      setChangelog('');
      setChangelogTitle('');
      onPublished(res);
      // Mit dem Veröffentlichen ist der Server-Testmodus beendet, die Anzeige muss das übernehmen
      await checkBackupInfo();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Lokal testen */}
      <Step icon={FlaskConical} title="1. Lokal testen">
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Startet den Entwurf in einer eigenen Instanz im Hauptmenü. Deine normale Installation, die Spieler und der Server bleiben unverändert. Einstellungen und Welten der Testinstanz bleiben zwischen den Tests erhalten.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {isGameRunning ? (
            <button className="btn-secondary" onClick={handleStopTest} style={{ color: '#ef4444' }}>
              <Square size={15} fill="currentColor" /> Minecraft beenden
            </button>
          ) : (
            <button className="btn-primary" onClick={handleStartTest} disabled={isGameStarting || draft.mods.length === 0}>
              {isGameStarting ? <RefreshCw size={15} className="spin" /> : <Play size={15} fill="currentColor" />}
              <span>{isGameStarting ? 'Wird gestartet...' : 'Lokal testen'}</span>
            </button>
          )}
          <button className="btn-secondary" onClick={() => window.electronAPI.openTestInstanceDir()} title="Ordner der Testinstanz öffnen">
            <FolderOpen size={15} /> Ordner
          </button>
          {testLog.length > 0 && (
            <button className="btn-secondary" onClick={() => setShowTestLog(!showTestLog)}>
              {showTestLog ? 'Protokoll verbergen' : 'Protokoll anzeigen'}
            </button>
          )}
          {isGameRunning && (
            <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>Minecraft läuft</span>
          )}
        </div>

        {isGameStarting && (
          <div style={{ marginTop: '14px', padding: '12px 14px', background: 'var(--bg-well)', borderRadius: '12px', border: '1px solid var(--border-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '8px' }}>
              <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{gameStatus.message || 'Wird vorbereitet...'}</span>
              <span style={{ color: 'var(--color-primary)', fontWeight: 700, fontFamily: 'monospace' }}>{Math.max(5, gameStatus.percent || 0)}%</span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--bg-card)', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${Math.max(5, gameStatus.percent || 0)}%`,
                  height: '100%',
                  background: 'var(--color-primary)',
                  borderRadius: '999px',
                  transition: 'width 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                }}
              />
            </div>
          </div>
        )}

        {showTestLog && (
          <div
            className="selectable-text"
            style={{
              marginTop: '12px',
              padding: '10px 12px',
              background: '#070a10',
              borderRadius: '8px',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: '12px',
              lineHeight: 1.5,
              maxHeight: '220px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              cursor: 'text'
            }}
          >
            {testLog.map((line, i) => (
              <div key={i} style={{ color: getLogLineColor(line), userSelect: 'text', WebkitUserSelect: 'text' }}>
                {line}
              </div>
            ))}
          </div>
        )}
        {draft?.mods?.some(m => m.disabled) && (
          <Notice type="info">
            {draft.mods.filter(m => m.disabled).length} {draft.mods.filter(m => m.disabled).length === 1 ? 'Mod ist' : 'Mods sind'} im Entwurf deaktiviert und {draft.mods.filter(m => m.disabled).length === 1 ? 'wird' : 'werden'} beim Testen nicht geladen.
          </Notice>
        )}
        {testError && <Notice type="error">{testError}</Notice>}
      </Step>

      {/* 2. Auf Server anwenden */}
      <Step icon={Zap} title="2. Auf Server anwenden">
        {!serverId ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            Verbinde zuerst deinen BisectHosting-Server im Bereich „Server“.
          </p>
        ) : (
          <>
            {backupInfo.active && (
              <div style={{
                padding: '12px 16px',
                marginBottom: '14px',
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.05))',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Sparkles size={18} style={{ color: '#f59e0b' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#fbbf24' }}>
                      Server-Testmodus aktiv
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Backup vor dem Test gesichert ({backupInfo.count} Mods, inklusive aller Server-Only Mods).
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRestoreBackup}
                  disabled={isRestoringBackup}
                  style={{
                    padding: '7px 14px',
                    fontSize: '12.5px',
                    color: '#f59e0b',
                    borderColor: 'rgba(245, 158, 11, 0.4)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  title="Entfernt alle Test-Mods und stellt alle gesicherten Original-Mods wieder her"
                >
                  <RotateCcw size={14} className={isRestoringBackup ? 'spin' : ''} />
                  <span>{isRestoringBackup ? 'Wird wiederhergestellt...' : 'Test beenden & Backup wiederherstellen'}</span>
                </button>
              </div>
            )}

            {serverPlan && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                {serverPending
                  ? `Lädt ${serverPlan.upload.length} hoch, löscht ${serverPlan.remove.length}. ${serverPlan.unchanged} bleiben unverändert.`
                  : 'Der Server entspricht dem Entwurf.'}
              </p>
            )}
            {serverPlan?.upload.map(mod => (
              <div key={mod.filename} style={{ fontSize: '12px', color: '#10b981', fontFamily: 'monospace' }}>+ {mod.filename}</div>
            ))}
            {serverPlan?.remove.map(filename => (
              <div key={filename} style={{ fontSize: '12px', color: '#ef4444', fontFamily: 'monospace' }}>− {filename}</div>
            ))}
            {planError && <Notice type="error">{planError}</Notice>}

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              marginTop: '12px',
              marginBottom: '12px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '12px',
              fontSize: '12.5px',
              color: '#34d399'
            }}>
              <Shield size={16} style={{ flexShrink: 0, color: '#10b981' }} />
              <span>
                <strong>Automatisches Backup-Sicherheitsnetz:</strong> Vor der Übertragung werden automatisch die Mods im Server <code>/mods</code>-Ordner auf deinem PC gesichert, die dabei ersetzt oder entfernt werden (auch Server-Only Mods). Unveränderte Mods bleiben auf dem Server. Du kannst den Test danach jederzeit mit 1 Klick rückgängig machen.
              </span>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={handleApply} disabled={isApplying || !serverPending}>
                {isApplying ? <RefreshCw size={15} className="spin" /> : <Zap size={15} />}
                <span>{isApplying ? 'Sichere & wende an...' : 'Mit automatischem Backup auf Server anwenden'}</span>
              </button>
              {backupInfo.active && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleRestoreBackup}
                  disabled={isRestoringBackup}
                  style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}
                  title="Entfernt alle Test-Mods und stellt alle gesicherten Original-Mods (inklusive Server-Only Mods) wieder her"
                >
                  <RotateCcw size={15} className={isRestoringBackup ? 'spin' : ''} />
                  <span>{isRestoringBackup ? 'Wird wiederhergestellt...' : 'Test beenden & Backup wiederherstellen'}</span>
                </button>
              )}
              <button
                type="button"
                className="btn-secondary"
                onClick={handleRestartClick}
                disabled={isRestarting}
                style={applyResult?.changed > 0 ? { color: 'var(--color-primary)', borderColor: 'var(--color-primary)' } : undefined}
                title="Startet den Minecraft-Server neu, damit neue Mods geladen werden"
              >
                <RotateCw size={15} className={isRestarting ? 'spin' : ''} />
                <span>{isRestarting ? 'Wird neu gestartet...' : 'Server neu starten'}</span>
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowConsole(true)} title="Öffnet die Live-Konsole des Servers">
                <Terminal size={15} />
                <span>Server-Konsole öffnen</span>
              </button>
            </div>

            {isApplying && applyProgress && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '12.5px', fontWeight: 600, marginBottom: '6px' }}>
                  <span>{applyProgress.label}</span>
                  <span style={{ color: 'var(--color-primary)' }}>{applyProgress.percent}%</span>
                </div>
                <div style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-well)', overflow: 'hidden', border: '1px solid var(--border-card)' }}>
                  <div style={{ width: `${applyProgress.percent}%`, height: '100%', background: 'var(--color-primary)', borderRadius: '999px', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}

            {applyLog.length > 0 && (
              <div className="selectable-text" style={{ marginTop: '12px', padding: '10px 12px', background: '#070a10', borderRadius: '8px', fontFamily: 'Consolas, Monaco, monospace', fontSize: '12px', color: '#10b981', maxHeight: '160px', overflowY: 'auto' }}>
                {applyLog.map((line, i) => <div key={i}>{line}</div>)}
              </div>
            )}
            {applyResult?.restarted && <Notice type="success">Neustart wurde an den Server gesendet.</Notice>}
            {applyResult && !applyResult.success && <Notice type="error">{applyResult.error}</Notice>}

            {showConsole && (
              <Dialog title="Server-Konsole" icon={Terminal} onClose={() => setShowConsole(false)} maxWidth="1200px">
                <div style={{ height: '72vh', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <ServerConsoleView selectedServer={selectedServer} bisectConfig={bisectConfig} isConnected={isConnected} />
                </div>
              </Dialog>
            )}
          </>
        )}
      </Step>

      {/* 3. Veröffentlichen */}
      <Step icon={Rocket} title="3. Veröffentlichen">
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '10px' }}>
          {diff.total === 0 && !versionsChanged && 'Keine Änderungen gegenüber der veröffentlichten Liste.'}
          {versionsChanged && (
            <div style={{ color: '#38bdf8' }}>
              ~ Version: Minecraft {published?.gameVersion || '?'} → {draft.gameVersion || '?'}, Fabric {published?.loaderVersion || 'automatisch'} → {draft.loaderVersion || 'automatisch'}
            </div>
          )}
          {diff.added.map(mod => (
            <div key={mod.slug} style={{ color: '#10b981' }}>+ {mod.name} {mod.versionNumber}</div>
          ))}
          {diff.changed.map(mod => (
            <div key={mod.slug} style={{ color: '#38bdf8' }}>
              ~ {mod.name}: {mod.fromVersion || 'nicht festgeschrieben'} → {mod.versionNumber}
              {mod.fromSide !== (mod.side || 'both') ? ` (${mod.fromSide} → ${mod.side})` : ''}
            </div>
          ))}
          {diff.removed.map(mod => (
            <div key={mod.slug} style={{ color: '#ef4444' }}>− {mod.name || mod.slug}</div>
          ))}
          {diff.packs.map(pack => (
            <div key={`${pack.kind}:${pack.slug}`} style={{ color: pack.type === 'added' ? '#10b981' : pack.type === 'removed' ? '#ef4444' : '#38bdf8' }}>
              {pack.type === 'added' ? '+' : pack.type === 'removed' ? '−' : '~'} {pack.name} ({pack.kind})
              {pack.type === 'changed' ? `: ${pack.fromVersion || 'nicht festgeschrieben'} → ${pack.versionNumber}` : pack.type === 'added' && pack.versionNumber ? ` ${pack.versionNumber}` : ''}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: '6px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
            Server-Changelog für die Spieler:
          </label>
        </div>

        <input
          type="text"
          value={changelogTitle}
          onChange={(e) => {
            setChangelogTitle(e.target.value);
            if (onDraftChange) onDraftChange({ ...draft, changelogTitle: e.target.value });
          }}
          placeholder={`Titel des Updates (z. B. Server-Update v${nextVersion})`}
          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-card)', borderRadius: '12px', padding: '10px 14px', color: 'var(--text-main)', fontSize: '13px', outline: 'none', marginBottom: '8px', fontFamily: 'inherit' }}
        />

        <textarea
          value={changelog}
          onChange={(e) => handleChangelogChange(e.target.value)}
          placeholder="Beschreibe kurz die Änderungen für die Spieler (erscheint im Changelog-Tab)..."
          rows={4}
          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--border-card)', borderRadius: '14px', padding: '12px 14px', color: 'var(--text-main)', fontSize: '13.5px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
        />

        {/* Welche Configs mitgehen, wird im Reiter Entwurf > Configs festgelegt */}
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '12px 0 4px 0', lineHeight: 1.4 }}>
          Mitveröffentlichte Configs: <b>{getSyncedConfigFiles().length}</b>. Die Auswahl änderst du unter <b>Entwurf, Configs</b>.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '10px', fontSize: '13px', color: 'var(--text-main)', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="radio" name="modpack-bump" checked={bumpType === 'patch'} onChange={() => setBumpType('patch')} /> Patch
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="radio" name="modpack-bump" checked={bumpType === 'minor'} onChange={() => setBumpType('minor')} /> Minor
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="radio" name="modpack-bump" checked={bumpType === 'major'} onChange={() => setBumpType('major')} /> Major
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="radio" name="modpack-bump" checked={isCustom} onChange={() => setBumpType('custom')} /> Eigene
          </label>
          {isCustom && (
            <input
              type="text"
              value={customVersion}
              onChange={(e) => setCustomVersion(e.target.value)}
              placeholder="z. B. 0.0.1"
              maxLength={20}
              aria-invalid={customVersion !== '' && !customVersionValid}
              title={`Format 1.2.3, höher als die veröffentlichte Version v${published?.modpackVersion || '0.0.0'}`}
              style={{ width: '110px', borderColor: customVersion !== '' && !customVersionValid ? '#ef4444' : undefined }}
            />
          )}
          <span style={{ flex: 1 }} />
          <button className="btn-primary" onClick={handlePublish} disabled={isPublishing || !canPublish}>
            {isPublishing ? <RefreshCw size={15} className="spin" /> : <Rocket size={15} />}
            <span>{isPublishing ? 'Wird veröffentlicht...' : `Als v${nextVersion} veröffentlichen`}</span>
          </button>
        </div>

        {serverPending && (
          <Notice type="warning">
            Der Server entspricht noch nicht dem Entwurf. Spieler können sich nach dem Veröffentlichen eventuell nicht verbinden.
          </Notice>
        )}
        {draft?.mods?.some(m => m.disabled) && (
          <Notice type="info">
            Hinweis: {draft.mods.filter(m => m.disabled).length} deaktivierte {draft.mods.filter(m => m.disabled).length === 1 ? 'Mod wird' : 'Mods werden'} beim Veröffentlichen ausgeschlossen.
          </Notice>
        )}
        {getManifestMods(draft).length === 0 && <Notice type="warning">Ein leerer Entwurf kann nicht veröffentlicht werden.</Notice>}
        {publishResult?.success && <Notice type="success">v{publishResult.version} ist veröffentlicht. Die Spieler sehen das Update spätestens in 5 Minuten.</Notice>}
        {publishResult && !publishResult.success && <Notice type="error">{publishResult.error}</Notice>}
      </Step>
    </div>
  );
}
