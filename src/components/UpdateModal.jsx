import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownCircle, RefreshCw, X } from 'lucide-react';
import { appAlert } from '../utils/appDialog';

export default function UpdateModal({ updateInfo, onClose }) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let unsubscribe = null;
    if (window.electronAPI) {
      unsubscribe = window.electronAPI.onUpdateProgress(percent => {
        setProgress(percent);
      });
    }
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleInstall = async () => {
    if (!updateInfo.downloadUrl) {
      appAlert('Keine Download-Datei für dein Betriebssystem gefunden.', { warning: true });
      return;
    }
    setDownloading(true);
    if (window.electronAPI) {
      const res = await window.electronAPI.downloadAndInstallUpdate(updateInfo.downloadUrl);
      if (!res.success) {
        appAlert(`Update fehlgeschlagen: ${res.error}`, { warning: true });
        setDownloading(false);
      }
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={(e) => { if (!downloading && e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowDownCircle size={20} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>Neues Launcher-Update</h2>
          </div>
          {!downloading && (
            <button
              type="button"
              onClick={onClose}
              style={{ width: '32px', height: '32px', borderRadius: '999px', background: 'var(--bg-well)', border: '1px solid var(--border-card)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          Eine neue Version (<strong style={{ color: 'var(--text-main)' }}>v{updateInfo.latestVersion}</strong>) des dP Launchers ist verfügbar!
        </p>

        {updateInfo.releaseNotes && (
          <div
            style={{
              padding: '14px 16px',
              background: 'var(--bg-well)',
              border: '1px solid var(--border-card)',
              borderRadius: '16px',
              fontSize: '12.5px',
              color: 'var(--text-main)',
              maxHeight: '150px',
              overflowY: 'auto',
              marginBottom: '18px',
              whiteSpace: 'pre-line',
              lineHeight: 1.5
            }}
          >
            {updateInfo.releaseNotes}
          </div>
        )}

        {downloading ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              <span>Lade Launcher-Update herunter...</span>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{progress}%</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '6px' }}>
              Die App startet nach dem Download automatisch neu.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button className="btn-secondary" onClick={onClose}>
              Später
            </button>
            <button className="btn-primary" onClick={handleInstall}>
              <RefreshCw size={15} /> Jetzt aktualisieren
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
