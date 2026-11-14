import React from 'react';
import { usePromptState, getHints } from '../../utils/controllerPrompts';

// Hinweisleiste unten. Sie erscheint nur, solange Select (am Controller) oder F1 (an der Tastatur) gehalten wird,
// und kurz beim Start des TV-Modus. Die Symbole passen zum Controller, der gerade benutzt wird.
export default function TvHints() {
  const prompt = usePromptState();
  const hints = getHints(prompt);

  return (
    <div className={`tv-hints ${prompt.hints ? 'tv-hints-on' : ''}`} aria-hidden="true">
      {hints.map((hint, index) => (
        <span key={hint.label} className="tv-hint" style={{ '--i': index }}>
          {hint.icons.filter(Boolean).map((src, index) => (
            <img key={index} src={src} alt="" className="tv-hint-icon" draggable={false} />
          ))}
          {hint.label}
        </span>
      ))}
    </div>
  );
}

