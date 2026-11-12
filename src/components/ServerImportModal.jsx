import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Globe, X, Check } from 'lucide-react';
import { appAlert } from '../utils/appDialog';

const labelStyle = { display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };

// Zeigt den Inhalt einer .dpmcserver-Datei und fragt, ob der Server hinzugefügt werden soll
export default function ServerImportModal({ data, onClose, onImported }) {
  const [name, setName] = useState(data?.server?.name || '');
  const [makeActive, setMakeActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const server = data?.server;
  const hasModpack = Boolean(server?.owner && server?.repo);

  const handleImport = async () => {
    setBusy(true);
    try {
      const added = await window.electronAPI.addServer({ ...server, github: hasModpack ? `${server.owner}/${server.repo}` : '', name });
      if (!added.success) {
        appAlert(added.error || 'Der Server konnte nicht hinzugefügt werden.', { warning: true });
        return;
      }
      if (makeActive && added.activeServerId !== added.server.id) {
        await window.electronAPI.setActiveServer(added.server.id);
      }
      onImported?.(added.server);
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Globe size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>
              {data?.success ? 'Server hinzufügen?' : 'Serverdatei nicht lesbar'}
            </h2>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} aria-label="Schließen" style={{ padding: '6px', borderRadius: '999px', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>

        {!data?.success ? (
          <>
            <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.14)', color: '#ef4444', fontSize: '13.5px' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
              <div>{data?.error || 'Die Datei ist ungültig.'}</div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button type="button" className="btn-primary" onClick={onClose}>OK</button>
            </div>
          </>
        ) : (
          <>
            {data.fileName && (
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 14px' }}>Aus der Datei {data.fileName}</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Name (so heißt der Ordner dieses Servers)</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={{ width: '100%' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13.5px', borderTop: '1px solid var(--border-card)', paddingTop: '12px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Server-Adresse</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{server.address}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13.5px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Modpack</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>
                  {hasModpack ? `${server.owner}/${server.repo} (${server.branch})` : 'keines'}
                </span>
              </div>
            </div>

            {hasModpack && (
              <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', marginTop: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706', fontSize: '12.5px', lineHeight: 1.5 }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>Der Launcher lädt die Mods dieses Servers herunter und startet sie auf deinem Rechner. Füge nur Server von Leuten hinzu, denen du vertraust.</div>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', fontSize: '13.5px', cursor: 'pointer' }}>
              <input type="checkbox" checked={makeActive} onChange={(e) => setMakeActive(e.target.checked)} />
              Gleich als aktiven Server verwenden
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Abbrechen</button>
              <button type="button" className="btn-primary" onClick={handleImport} disabled={busy || !name.trim()}>
                <Check size={16} />
                <span>Server hinzufügen</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
