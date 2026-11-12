import React, { useState, useEffect, useMemo } from 'react';
import { Sliders, Search, RefreshCw, FileText, AlertCircle } from 'lucide-react';

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

function saveSyncedConfigFiles(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export default function ConfigSyncCard() {
  const [availableConfigs, setAvailableConfigs] = useState([]);
  const [selectedConfigs, setSelectedConfigsState] = useState(getSyncedConfigFiles);
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
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setExpanded(prev => !prev)}
          style={{ fontSize: '12px', padding: '4px 10px' }}
        >
          {expanded ? 'Auswahl zuklappen' : 'Auswahl anpassen'}
        </button>
      </div>

      <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '6px 0 0 0', lineHeight: 1.4 }}>
        Standardmäßig werden <b>keine</b> privaten Einstellungen oder Tastenbelegungen an Spieler übertragen. Beim Veröffentlichen werden nur die hier angehakten Mod-Configs geteilt.
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-secondary" onClick={loadConfigs} disabled={isLoading} title="Configs neu einlesen" style={{ fontSize: '11px', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <RefreshCw size={11} className={isLoading ? 'spin' : ''} />
                <span>Neu laden</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setSelectedConfigs(availableConfigs.filter(c => c.isRecommended).map(c => c.relPath))}
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                Nur empfohlene
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSelectedConfigs([])} style={{ fontSize: '11px', padding: '4px 8px' }}>
                Keine Configs teilen
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
