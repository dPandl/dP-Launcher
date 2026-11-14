import React from 'react';
import { MousePointer2 } from 'lucide-react';

// Die virtuelle Maus des TV-Modus. Position und Zustand setzt tvNavigation direkt, ohne React-Render pro Frame.
export default function TvCursor() {
  return (
    <div id="tv-cursor" className="tv-cursor" aria-hidden="true">
      <span className="tv-cursor-ring" />
      <MousePointer2 size={30} strokeWidth={2.2} className="tv-cursor-icon" />
    </div>
  );
}
