import React from 'react';
import { createPortal } from 'react-dom';
import { MousePointer2 } from 'lucide-react';

// Die virtuelle Maus des TV-Modus. Position und Zustand setzt tvNavigation direkt, ohne React-Render pro Frame.
export default function TvCursor() {
  // Direkt unter <body>, damit kein Elternelement die Ebene begrenzt und Dialoge nicht darüber liegen
  return createPortal(
    <div id="tv-cursor" className="tv-cursor" aria-hidden="true">
      <span className="tv-cursor-ring" />
      <MousePointer2 size={30} strokeWidth={2.2} className="tv-cursor-icon" />
    </div>,
    document.body
  );
}
