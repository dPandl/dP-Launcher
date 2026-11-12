import React from 'react';

/**
 * Zurück-Knopf nach Kita-Portal Vorbild:
 * Schwebt links unten neben der Seitenleiste.
 * Im Ruhezustand ein runder Pfeil-Knopf, beim Hover fährt der Text per
 * 520ms Fluid-Deceleration butterweich auf seine echte Inhaltsbreite auf.
 */
export default function BackButton({ label = 'Zurück zum Spielen', onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`app-back ${className}`.trim()}
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      <span className="app-fab-label">
        <span className="app-fab-label-text">{label}</span>
      </span>
    </button>
  );
}
