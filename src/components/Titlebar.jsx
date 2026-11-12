import React, { useState, useEffect } from 'react';
import { Minus, Square, X } from 'lucide-react';

export default function Titlebar({ activeSeason, currentVersion }) {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized);
    }
  }, []);

  const handleMinimize = () => {
    if (window.electronAPI) window.electronAPI.minimizeWindow();
  };

  const handleMaximize = async () => {
    if (window.electronAPI) {
      await window.electronAPI.maximizeWindow();
      const max = await window.electronAPI.isMaximized();
      setIsMaximized(max);
    }
  };

  const handleClose = () => {
    if (window.electronAPI) window.electronAPI.closeWindow();
  };

  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <img
          src={`${import.meta.env.BASE_URL}app-icon.png`}
          alt="dP Launcher"
          style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 6px var(--color-glow))' }}
        />
        <span>dP Launcher</span>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '999px',
            background: 'var(--color-primary-soft)',
            color: 'var(--color-primary-text)',
            border: '1px solid var(--color-primary-border)'
          }}
        >
          v{currentVersion} • {activeSeason.name}
        </span>
      </div>

      <div className="titlebar-controls">
        <button
          className="titlebar-btn"
          title="Minimieren"
          onClick={handleMinimize}
        >
          <Minus size={14} />
        </button>
        <button
          className="titlebar-btn"
          title={isMaximized ? "Verkleinern" : "Maximieren"}
          onClick={handleMaximize}
        >
          <Square size={12} />
        </button>
        <button
          className="titlebar-btn close"
          title="Schließen"
          onClick={handleClose}
        >
          <X size={15} />
        </button>
      </div>
    </header>
  );
}
