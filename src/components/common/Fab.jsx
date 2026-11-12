import React from 'react';

/**
 * Runder FAB (Floating Action Button) unten am Rand nach Kita-Portal Vorbild.
 * Beim Drüberfahren klappt das Label sanft auf.
 *
 * @param {Object} props
 * @param {React.ComponentType} [props.icon] Lucide Icon Komponente
 * @param {string} props.label Text, der beim Hover eingeblendet wird
 * @param {'left'|'right'} [props.side='right'] Seite des Bildschirms
 * @param {string} [props.className] Zusätzliche CSS-Klassen
 * @param {number|string|null} [props.badge] Optionales Badge
 * @param {() => void} [props.onClick] Klick-Handler
 */
export default function Fab({
  icon: Icon,
  label,
  side = 'right',
  className = '',
  badge = null,
  ...props
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`app-fab app-fab-${side} ${className}`.trim()}
      {...props}
    >
      {Icon && <Icon className="app-fab-icon" aria-hidden="true" size={22} />}
      <span className="app-fab-label">
        <span className="app-fab-label-text">{label}</span>
      </span>
      {badge != null && (
        <span className="app-fab-badge" aria-hidden="true">
          {badge}
        </span>
      )}
    </button>
  );
}

