import React from 'react';
import { usePromptState, getSelectGlyph } from '../../utils/controllerPrompts';

// Im TV-Modus steht unten in der Seitenleiste, wie man die Tastenhinweise einblendet (statt der Themenkarte).
export default function TvSidebarHints() {
  const prompt = usePromptState();
  const keyboard = prompt.device === 'keyboard';
  const glyph = keyboard ? null : getSelectGlyph(prompt.platform);

  return (
    <div className="sidebar-season-pill" aria-label="Tastenhinweise">
      {glyph
        ? <img src={glyph} alt="" className="tv-hint-icon" draggable={false} style={{ height: '26px', flexShrink: 0 }} />
        : <kbd className="tv-side-key">F1</kbd>}
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>Tastenhinweise</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{keyboard ? 'F1 gedrückt halten' : 'Select gedrückt halten'}</div>
      </div>
    </div>
  );
}
