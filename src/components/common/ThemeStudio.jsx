import React from 'react';
import { Check, Pipette, ArrowRight, Sparkles, Calendar, Flower2, Sun, Leaf, CloudSnow, Ban } from 'lucide-react';

const ACCENT_PRESETS = [
  { name: 'Blau', value: '#0284c7' },
  { name: 'Petrol', value: '#0d9488' },
  { name: 'Grün', value: '#16a34a' },
  { name: 'Violett', value: '#7c3aed' },
  { name: 'Pink', value: '#db2777' },
  { name: 'Rot', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Schiefer', value: '#475569' }
];

const GRADIENT_PRESETS = [
  { name: 'Goldgelb & Bernstein', color1: '#d97706', color2: '#facc15' },
  { name: 'Warmes Orange & Pfirsich', color1: '#ea580c', color2: '#fb923c' },
  { name: 'Himmelblau & Türkis', color1: '#0284c7', color2: '#14b8a6' },
  { name: 'Königsblau & Cyan', color1: '#1d4ed8', color2: '#06b6d4' },
  { name: 'Wald- & Apfelgrün', color1: '#15803d', color2: '#84cc16' },
  { name: 'Lila & Pink', color1: '#7c3aed', color2: '#ec4899' },
  { name: 'Erdbeerrot & Koralle', color1: '#e11d48', color2: '#f97316' },
  { name: 'Ozean & Petrol', color1: '#0f766e', color2: '#0284c7' }
];

// Jede Gruppe ist eine Richtung und ihre Umkehrung: Klick auf die aktive dreht um
const DIRECTIONS = [
  { main: 90, back: 270, mainLabel: 'Links nach Rechts', backLabel: 'Rechts nach Links', title: 'Horizontaler Verlauf' },
  { main: 180, back: 0, mainLabel: 'Oben nach Unten', backLabel: 'Unten nach Oben', title: 'Vertikaler Verlauf' },
  { main: 135, back: 315, mainLabel: 'Diagonal nach unten', backLabel: 'Diagonal nach oben', title: 'Diagonale nach unten rechts' },
  { main: 45, back: 225, mainLabel: 'Diagonal nach rechts', backLabel: 'Diagonal nach links', title: 'Diagonale nach oben rechts' }
];

const EFFECT_OPTIONS = [
  { id: 'sparks', name: 'Funken', hint: 'Schimmernde Lichtfunken im Hintergrund', icon: Sparkles },
  { id: 'seasonal', name: 'Saisonal', hint: 'Folgt automatisch der Jahreszeit: Schnee, Blätter, Blüten oder Glühwürmchen', icon: Calendar },
  { id: 'spring', name: 'Frühling', hint: 'Rosa Blütenblätter', icon: Flower2 },
  { id: 'summer', name: 'Sommer', hint: 'Schwebende Glühwürmchen', icon: Sun },
  { id: 'autumn', name: 'Herbst', hint: 'Taumelnde Herbstblätter', icon: Leaf },
  { id: 'winter', name: 'Winter', hint: 'Sanfter Schneefall', icon: CloudSnow },
  { id: 'none', name: 'Kein Effekt', hint: 'Ruhiger Hintergrund ohne Partikel', icon: Ban }
];

const DEFAULT_THEME = { mode: 'gradient', color1: '#38bdf8', color2: '#c084fc', color3: null, angle: 135 };

const sameColor = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

function ColorField({ label, value, onChange }) {
  return (
    <div className="ts-field">
      <span className="ts-label">{label}</span>
      <div className="ts-field-row">
        <input type="color" className="ts-color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        <span className="ts-hex">{value}</span>
      </div>
    </div>
  );
}

export default function ThemeStudio({ customTheme, onUpdate, effect = 'sparks', onEffectChange }) {
  const theme = { ...DEFAULT_THEME, ...(customTheme || {}) };
  const isGradient = theme.mode !== 'color';
  const angle = theme.angle ?? 135;
  const isPresetAccent = ACCENT_PRESETS.some(p => sameColor(p.value, theme.color1));

  // Änderungen am Verlauf gelten immer als 2-Farben-Verlauf
  const patchGradient = (patch) => onUpdate({ mode: 'gradient', color3: null, ...patch });

  return (
    <div className="ts-root">
      <section className="ts-section">
        <h3 className="ts-title">Akzentfarbe</h3>
        <p className="ts-hint">Die Farbe für Knöpfe, Auswahl und Hervorhebungen.</p>
        <div className="ts-swatches">
          {ACCENT_PRESETS.map(p => {
            const active = sameColor(p.value, theme.color1);
            return (
              <button
                key={p.value}
                type="button"
                title={p.name}
                aria-label={p.name}
                aria-pressed={active}
                className={`ts-swatch${active ? ' ts-swatch-on' : ''}`}
                style={{ background: p.value }}
                onClick={() => onUpdate({ color1: p.value })}
              >
                {active && <Check size={18} aria-hidden="true" />}
              </button>
            );
          })}
          <label
            className={`ts-swatch ts-swatch-custom${!isPresetAccent ? ' ts-swatch-on' : ''}`}
            title="Eigene Farbe"
          >
            <input
              type="color"
              value={theme.color1}
              onChange={(e) => onUpdate({ color1: e.target.value })}
              aria-label="Eigene Farbe"
            />
            <Pipette size={17} aria-hidden="true" />
          </label>
        </div>
      </section>

      <section className="ts-section">
        <h3 className="ts-title">Farbverlauf</h3>
        <p className="ts-hint">Hauptknöpfe und Akzente bekommen einen Verlauf von der Akzentfarbe zu einer zweiten Farbe.</p>

        <label className="ts-check">
          <input
            type="checkbox"
            checked={isGradient}
            onChange={(e) => onUpdate({ mode: e.target.checked ? 'gradient' : 'color', color3: null })}
          />
          <span>Farbverlauf einschalten</span>
        </label>

        {isGradient && (
          <div className="ts-gradient">
            <div>
              <span className="ts-label">Verlaufsvorlagen:</span>
              <div className="ts-presets">
                {GRADIENT_PRESETS.map(preset => {
                  const current = sameColor(theme.color1, preset.color1) && sameColor(theme.color2, preset.color2);
                  return (
                    <button
                      key={preset.name}
                      type="button"
                      title={preset.name}
                      aria-label={preset.name}
                      aria-pressed={current}
                      className={`ts-preset${current ? ' ts-preset-on' : ''}`}
                      style={{ background: `linear-gradient(135deg, ${preset.color1}, ${preset.color2})` }}
                      onClick={() => patchGradient({ color1: preset.color1, color2: preset.color2 })}
                    >
                      {current && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ts-colors">
              <ColorField label="Startfarbe" value={theme.color1} onChange={(v) => patchGradient({ color1: v })} />
              <ColorField label="Verlaufsfarbe" value={theme.color2} onChange={(v) => patchGradient({ color2: v })} />
            </div>

            <div>
              <div className="ts-dir-head">
                <span className="ts-label">Verlaufsrichtung</span>
                <span className="ts-dir-hint">Klick = Richtung umkehren</span>
              </div>
              <div className="ts-dirs">
                {DIRECTIONS.map(d => {
                  const active = angle === d.main || angle === d.back;
                  const isBack = angle === d.back;
                  const shown = isBack ? d.back : d.main;
                  return (
                    <button
                      key={d.main}
                      type="button"
                      title={`${d.title} (Klicken zum Umkehren)`}
                      className={`ts-dir${active ? ' ts-dir-on' : ''}`}
                      onClick={() => patchGradient({ angle: angle === d.main ? d.back : d.main })}
                    >
                      <ArrowRight
                        size={15}
                        strokeWidth={2.5}
                        aria-hidden="true"
                        style={{ transform: `rotate(${shown - 90}deg)`, transition: 'transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)', flexShrink: 0 }}
                      />
                      <span>{isBack ? d.backLabel : d.mainLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {onEffectChange && (
        <section className="ts-section">
          <h3 className="ts-title">Hintergrund-Effekt</h3>
          <p className="ts-hint">Wähle, welche Partikel im Hintergrund fallen, oder lass sie der Jahreszeit folgen.</p>
          <div className="ts-swatches" role="group" aria-label="Hintergrund-Effekt">
            {EFFECT_OPTIONS.map(opt => {
              const active = effect === opt.id;
              const EffectIcon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  title={opt.name}
                  aria-label={opt.name}
                  aria-pressed={active}
                  className={active ? 'ts-swatch ts-swatch-neutral ts-swatch-on' : 'ts-swatch ts-swatch-neutral'}
                  onClick={() => onEffectChange(opt.id)}
                >
                  <EffectIcon size={20} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          {(() => {
            const current = EFFECT_OPTIONS.find(o => o.id === effect) || EFFECT_OPTIONS[0];
            return (
              <div>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>{current.name}</span>
                <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{current.hint}</div>
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
}
