import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, RefreshCw, ListChecks } from 'lucide-react';
import Dialog from '../common/Dialog';
import { ModrinthService } from '../../services/modrinthService';

const CHANNEL_LABEL = { release: 'Release', beta: 'Beta', alpha: 'Alpha' };
const CHANNEL_COLOR = { release: '#10b981', beta: '#f59e0b', alpha: '#ef4444' };

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('de-DE');
}

// Auswahl einer bestimmten Version, falls die neueste kaputt ist.
// Zeigt nur Versionen für die gewählte Minecraft-Version und den Loader.
export default function VersionPickDialog({
  project,
  gameVersion,
  loader,
  title = 'Version wählen',
  confirmLabel = 'Installieren',
  confirmIcon: ConfirmIcon = Download,
  currentVersionId = null,
  onConfirm,
  onClose
}) {
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [anyGameVersion, setAnyGameVersion] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    setError(null);
    ModrinthService.getProjectVersions(project.id || project.slug, {
      gameVersion: anyGameVersion ? '' : gameVersion,
      loader
    })
      .then(list => {
        if (cancelled) return;
        setVersions(list);
        const preferred = list.find(v => v.version_type === 'release') || list[0];
        setSelectedId(prev => (prev && list.some(v => v.id === prev) ? prev : preferred?.id || null));
      })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [project.id, project.slug, gameVersion, loader, anyGameVersion]);

  const selected = useMemo(() => (versions || []).find(v => v.id === selectedId) || null, [versions, selectedId]);

  return (
    <Dialog title={title} icon={ListChecks} onClose={onClose} maxWidth="560px">
      <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '2px', overflowWrap: 'anywhere' }}>{project.title}</div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        {anyGameVersion ? 'Alle Minecraft-Versionen' : `Minecraft ${gameVersion}`}{loader ? ` · ${loader}` : ''}
      </div>

      {!versions && !error && (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={16} className="spin" /> Versionen werden geladen...
        </div>
      )}
      {error && <div className="mr-notice mr-notice-error" style={{ marginBottom: '12px' }}>{error}</div>}
      {versions && versions.length === 0 && (
        <div style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '13.5px' }}>
          Für Minecraft {gameVersion} gibt es keine Version.
        </div>
      )}

      {versions && versions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '340px', overflowY: 'auto', paddingRight: '2px' }}>
          {versions.map(version => {
            const isSelected = version.id === selectedId;
            const channel = version.version_type || 'release';
            return (
              <button
                key={version.id}
                type="button"
                onClick={() => setSelectedId(version.id)}
                aria-pressed={isSelected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  textAlign: 'left',
                  padding: '9px 12px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  font: 'inherit',
                  color: 'inherit',
                  background: isSelected ? 'var(--bg-well)' : 'transparent',
                  border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-card)'}`
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '13.5px', overflowWrap: 'anywhere' }}>
                    {version.version_number}
                    {version.id === currentVersionId && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>aktuell</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {formatDate(version.date_published)}
                    {anyGameVersion && version.game_versions?.length ? ` · MC ${version.game_versions.slice(-2).join(', ')}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 700, color: CHANNEL_COLOR[channel] || 'var(--text-muted)' }}>
                  {CHANNEL_LABEL[channel] || channel}
                </span>
                {isSelected && <Check size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '12.5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
        <input type="checkbox" checked={anyGameVersion} onChange={(e) => setAnyGameVersion(e.target.checked)} style={{ accentColor: 'var(--color-primary)' }} />
        <span>Auch Versionen für andere Minecraft-Versionen zeigen</span>
      </label>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '18px' }}>
        <button type="button" className="btn-secondary" onClick={onClose}>Abbrechen</button>
        <button
          type="button"
          className="btn-primary"
          disabled={!selected}
          onClick={() => { const version = selected; onClose(); onConfirm(version); }}
        >
          <ConfirmIcon size={16} />
          <span>{confirmLabel}</span>
        </button>
      </div>
    </Dialog>
  );
}
