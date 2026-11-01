import React, { useState, useEffect } from 'react';
import { ArrowDownCircle, RefreshCw, X } from 'lucide-react';

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
      alert('Keine Download-Datei für dein Betriebssystem gefunden.');
      return;
    }
    setDownloading(true);
    if (window.electronAPI) {
      const res = await window.electronAPI.downloadAndInstallUpdate(updateInfo.downloadUrl);
      if (!res.success) {
        alert(`Update fehlgeschlagen: ${res.error}`);
        setDownloading(false);
      }
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ArrowDownCircle size={22} style={{ color: 'var(--color-accent)' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#fff' }}>Neues Launcher-Update</h2>
          </div>
          {!downloading && (
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={18} />
            </button>
          )}
        </div>

        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Eine neue Version (<strong style={{ color: '#fff' }}>v{updateInfo.latestVersion}</strong>) des Minecraft Launchers ist verfügbar!
        </p>

        {updateInfo.releaseNotes && (
          <div
            style={{
              padding: '12px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              maxHeight: '140px',
              overflowY: 'auto',
              marginBottom: '16px',
              whiteSpace: 'pre-line'
            }}
          >
            {updateInfo.releaseNotes}
          </div>
        )}

        {downloading ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              <span>Lade Launcher-Update herunter...</span>
              <span>{progress}%</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '6px' }}>
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
    </div>
  );
}
