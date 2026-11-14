import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Ab hier (letztes Drittel des Bereichs) bleibt dem System kaum noch Arbeitsspeicher
export function isRiskyRam(value, min, max) {
  return max > min && value > min + (max - min) * (2 / 3);
}

/**
 * RAM-Slider. Das letzte Drittel der Leiste ist rot, bei einem Wert dort erscheint eine Warnung.
 */
export default function RamSlider({ value, min = 2, max, onChange, dimmed = false }) {
  const safeMax = Math.max(max, min);
  const risky = isRiskyRam(value, min, safeMax);
  return (
    <div>
      <div className="ram-slider" style={{ opacity: dimmed ? 0.6 : 1 }}>
        <div className="ram-slider-track" />
        <input
          type="range"
          min={min}
          max={safeMax}
          step="1"
          value={Math.min(Math.max(value, min), safeMax)}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
        />
      </div>
      {risky && (
        <div className="ram-slider-warning">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>Das ist fast der gesamte Arbeitsspeicher. Windows, Linux und andere Programme bekommen dann zu wenig, der PC kann langsam werden und das Spiel ruckeln oder abstürzen.</span>
        </div>
      )}
    </div>
  );
}
