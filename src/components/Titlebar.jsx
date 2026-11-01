import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Flame, Snowflake, Flower2, Sun } from 'lucide-react';

const SEASON_ICONS = {
  autumn: Flame,
  winter: Snowflake,
  spring: Flower2,
  summer: Sun
};

export default function Titlebar({ activeSeason, currentVersion }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const SeasonIcon = SEASON_ICONS[activeSeason.id] || Flame;

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
        <SeasonIcon size={18} style={{ color: 'var(--color-accent)' }} />
        <span>Minecraft Server Launcher</span>
        <span className="badge badge-accent" style={{ fontSize: '11px', padding: '2px 8px' }}>
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
