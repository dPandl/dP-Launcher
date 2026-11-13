import React, { useState, useEffect, useMemo } from 'react';
import { Sliders, Search, RefreshCw, FileText, AlertCircle, UploadCloud } from 'lucide-react';
import { appConfirm, appAlert } from '../../utils/appDialog';

const STORAGE_KEY = 'dp_launcher_config_sync_selection';
const DEFAULT_SELECTION = ['wover/client.json'];

// Auswahl der Config-Dateien, die beim Veröffentlichen an alle Spieler gehen (bleibt zwischen Neustarts erhalten)
export function getSyncedConfigFiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_SELECTION;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_SELECTION;
  } catch {
    return DEFAULT_SELECTION;
  }
}

const FORCE_KEY = 'dp_launcher_config_force_selection';

// Configs, die bei den Spielern bei jedem Start überschrieben werden (alle anderen nur beim ersten Start)
export function getForcedConfigFiles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FORCE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveForcedConfigFiles(list) {
  try {
    localStorage.setItem(FORCE_KEY, JSON.stringify(list));
  } catch {}
}

function saveSyncedConfigFiles(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export default function ConfigSyncCard() {
  const [availableConfigs, setAvailableConfigs] = useState([]);
  const [selectedConfigs, setSelectedConfigsState] = useState(getSyncedConfigFiles);
  const [forcedConfigs, setForcedConfigs] = useState(getForcedConfigFiles);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const setSelectedConfigs = (updater) => {
    setSelectedConfigsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveSyncedConfigFiles(next);
      return next;
    });
  };

  const [isUploading, setIsUploading] = useState(false);
  const handleUpload = async () => {
    const sure = await appConfirm(
      `${selectedConfigs.length} Config-Datei(en) aus der Testinstanz werden direkt ins Modpack hochgeladen, ohne neue Modpack-Version und ohne Changelog. Bei den Spielern gelten sie beim nächsten Start (nur beim ersten Mal, außer „Immer überschreiben“ ist gesetzt).`,
      { title: 'Configs jetzt hochladen?', confirmLabel: 'Hochladen', cancelLabel: 'Abbrechen' }
    );
    if (!sure) return;
    setIsUploading(true);
    try {
      const res = await window.electronAPI.updateModpackConfigs({ selected: selectedConfigs, forced: forcedConfigs });
      if (res?.success) {
        appAlert(`${res.count} Config-Datei(en) hochgeladen${res.forced ? `, ${res.forced} davon bei jedem Start überschrieben` : ''}.`);
      } else {
        appAlert(res?.error || 'Die Configs konnten nicht hochgeladen werden.', { warning: true });
      }
    } catch (err) {
      appAlert(err.message, { warning: true });
    } finally {
      setIsUploading(false);
    }
  };

  const toggleForced = (relPath, on) => {
    setForcedConfigs(prev => {
      const next = on ? [...prev.filter(p => p !== relPath), relPath] : prev.filter(p => p !== relPath);
      saveForcedConfigFiles(next);
      return next;
    });
  };

  // Alle / keine der gerade angezeigten (gefilterten) Dateien
  const selectShown = (on) => {
    const shown = filtered.map(c => c.relPath);
    setSelectedConfigs(prev => (on ? [...new Set([...prev, ...shown])] : prev.filter(p => !shown.includes(p))));
    if (!on) {
      setForcedConfigs(prev => {
        const next = prev.filter(p => !shown.includes(p));
        saveForcedConfigFiles(next);
        return next;
      });
    }
  };

  const forceShown = (on) => {
    const shown = filtered.map(c => c.relPath).filter(rel => selectedConfigs.includes(rel));
    setForcedConfigs(prev => {
      const next = on ? [...new Set([...prev, ...shown])] : prev.filter(p => !shown.includes(p));
      saveForcedConfigFiles(next);
      return next;
    });
  };

  const loadConfigs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (window.electronAPI?.getAvailableModpackConfigs) {
        const res = await window.electronAPI.getAvailableModpackConfigs();
        if (res?.success && Array.isArray(res.configs)) {
          setAvailableConfigs(res.configs);
        } else if (res?.error) {
          setError(res.error);
        }
      } else {
        setError('Schnittstelle wird nach einem vollständigen Neustart von "npm run dev" aktiv.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const filtered = useMemo(() => {
    if (!filter.trim()) return availableConfigs;
    const q = filter.toLowerCase();
    return availableConfigs.filter(c => c.relPath.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [availableConfigs, filter]);

  const shownSelected = filtered.filter(c => selectedConfigs.includes(c.relPath));
  const allShownForced = shownSelected.length > 0 && shownSelected.every(c => forcedConfigs.includes(c.relPath));

  return (
    <div style={{ background: 'var(--bg-well)', border: '1px solid var(--border-card)', borderRadius: '14px', padding: '12px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Sliders size={16} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)' }}>
            Configs für Spieler teilen (Config-Sync)
          </span>
          <span className="badge badge-accent" style={{ fontSize: '11px', padding: '2px 8px' }}>
            {selectedConfigs.length} {selectedConfigs.length === 1 ? 'Datei' : 'Dateien'} ausgewählt
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleUpload}
          disabled={isUploading || selectedConfigs.length === 0}
          title="Die ausgewählten Configs direkt hochladen, ohne neue Modpack-Version"
          style={{ fontSize: '12px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          {isUploading ? <RefreshCw size={13} className="spin" /> : <UploadCloud size={13} />}
          Jetzt hochladen
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setExpanded(prev => !prev)}
          style={{ fontSize: '12px', padding: '4px 10px' }}
        >
          {expanded ? 'Auswahl zuklappen' : 'Auswahl anpassen'}
        </button>
        </div>
      </div>

      <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
        Standardmäßig werden <b>keine</b> privaten Einstellungen oder Tastenbelegungen an Spieler übertragen. Beim Veröffentlichen werden nur die hier angehakten Mod-Configs geteilt. Sie gelten bei den Spielern <b>nur beim ersten Start</b>, danach gehören sie dem Spieler. Mit „Immer überschreiben“ wird eine einzelne Datei bei jedem Start wieder auf deinen Stand gesetzt.
      </p>

      {expanded && (
        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-card)', paddingTop: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: '180px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Config suchen (z. B. wover, splinecart)..."
                style={{ width: '100%', padding: '6px 12px 6px 32px', fontSize: '12px', background: 'var(--bg-input)', border: '1px solid var(--border-card)', borderRadius: '999px', color: 'var(--text-main)', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={loadConfigs} disabled={isLoading} title="Configs neu einlesen" style={{ padding: '4px 8px', display: 'inline-flex', alignItems: 'center' }}>
                <RefreshCw size={12} className={isLoading ? 'spin' : ''} />
              </button>
              <button type="button" className="btn-secondary" onClick={() => selectShown(true)} style={{ fontSize: '11px', padding: '4px 10px' }}>Alle</button>
              <button type="button" className="btn-secondary" onClick={() => selectShown(false)} style={{ fontSize: '11px', padding: '4px 10px' }}>Keine</button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedConfigs(availableConfigs.filter(c => c.isRecommended).map(c => c.relPath))}
                title="Nur die empfohlenen Configs auswählen"
                style={{ fontSize: '11px', padding: '4px 10px' }}
              >
                Empfohlene
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => forceShown(!allShownForced)}
                disabled={shownSelected.length === 0}
                title="Bei allen ausgewählten, angezeigten Dateien umschalten, ob sie bei jedem Start überschrieben werden"
                style={{ fontSize: '11px', padding: '4px 10px', color: allShownForced ? '#f59e0b' : undefined }}
              >
                {allShownForced ? 'Nicht mehr überschreiben' : 'Immer überschreiben'}
              </button>
            </div>
          </div>

          {isLoading && (
            <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <RefreshCw size={13} className="spin" />
              <span>Lade Config-Dateien aus der Testinstanz...</span>
            </div>
          )}

          {error && (
            <div style={{ display: 'flex', gap: '8px', padding: '10px 12px', marginBottom: '8px', background: '#f59e0b1f', border: '1px solid #f59e0b59', borderRadius: '8px', color: '#f59e0b', fontSize: '13px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>{error}</div>
            </div>
          )}

          {!isLoading && (
            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', paddingRight: '4px' }}>
              {filtered.map(cfg => {
                const isChecked = selectedConfigs.includes(cfg.relPath);
                return (
                  <label
                    key={cfg.relPath}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: '8px',
                      background: isChecked ? 'var(--color-primary-soft)' : 'transparent',
                      border: `1px solid ${isChecked ? 'var(--color-primary-border)' : 'transparent'}`,
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          setSelectedConfigs(prev => (e.target.checked ? [...prev, cfg.relPath] : prev.filter(p => p !== cfg.relPath)));
                        }}
                      />
                      <FileText size={14} style={{ color: isChecked ? 'var(--color-primary)' : 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ fontWeight: isChecked ? 600 : 400, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {cfg.relPath}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {isChecked && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleForced(cfg.relPath, !forcedConfigs.includes(cfg.relPath)); }}
                          title="Bei jedem Start der Spieler wieder auf deinen Stand setzen (sonst nur beim ersten Start)"
                          style={{
                            fontSize: '10.5px', padding: '1px 8px', borderRadius: '999px', cursor: 'pointer', fontFamily: 'inherit',
                            border: '1px solid ' + (forcedConfigs.includes(cfg.relPath) ? '#f59e0b' : 'var(--border-card)'),
                            background: forcedConfigs.includes(cfg.relPath) ? '#f59e0b26' : 'transparent',
                            color: forcedConfigs.includes(cfg.relPath) ? '#f59e0b' : 'var(--text-muted)',
                            fontWeight: forcedConfigs.includes(cfg.relPath) ? 700 : 500
                          }}
                        >
                          Immer überschreiben
                        </button>
                      )}
                      {cfg.category === 'shader' && (
                        <span className="badge badge-accent" style={{ fontSize: '10px', padding: '1px 6px' }}>Shader-Optionen</span>
                      )}
                      {cfg.isRecommended && cfg.category !== 'shader' && (
                        <span className="badge badge-success" style={{ fontSize: '10px', padding: '1px 6px' }}>Empfohlen (BetterX Fix)</span>
                      )}
                      {cfg.isPersonal && (
                        <span className="badge" style={{ fontSize: '10px', padding: '1px 6px', opacity: 0.7 }}>Privat</span>
                      )}
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{(cfg.size / 1024).toFixed(1)} KB</span>
                    </div>
                  </label>
                );
              })}

              {filtered.length === 0 && !error && (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Keine passenden Config-Dateien in der Testinstanz gefunden.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
