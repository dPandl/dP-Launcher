import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Pipette, Check } from 'lucide-react';

// Eigener Farbwähler für Normal- und TV-Modus: Farbfläche, Reglerleisten, Hex-Feld und Schnellfarben.
// Alles lässt sich mit Maus, virtuellem Zeiger, Tastatur und Controller bedienen (Regler und Felder sind echte Elemente).
const QUICK = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#0ea5e9', '#6366f1', '#a855f7', '#ec4899', '#ffffff', '#94a3b8', '#0f172a'];
const HEX = /^#[0-9a-f]{6}$/i;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function hexToHsv(hex) {
  const value = HEX.test(hex) ? hex : '#000000';
  const r = parseInt(value.slice(1, 3), 16) / 255;
  const g = parseInt(value.slice(3, 5), 16) / 255;
  const b = parseInt(value.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? delta / max : 0, v: max };
}

function hsvToHex({ h, s, v }) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}

function PickerDialog({ value, label, onChange, onClose }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const areaRef = useRef(null);
  const draggingRef = useRef(false);

  const apply = (next) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexText(hex);
    onChange(hex);
  };

  const fromPointer = (event) => {
    const rect = areaRef.current.getBoundingClientRect();
    apply({ ...hsv, s: clamp((event.clientX - rect.left) / rect.width, 0, 1), v: 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1) });
  };

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const onAreaKey = (event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const moves = { ArrowLeft: { s: -step }, ArrowRight: { s: step }, ArrowUp: { v: step }, ArrowDown: { v: -step } };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    apply({ ...hsv, s: clamp(hsv.s + (move.s || 0), 0, 1), v: clamp(hsv.v + (move.v || 0), 0, 1) });
  };

  const onHex = (text) => {
    setHexText(text);
    const normalized = text.startsWith('#') ? text : `#${text}`;
    if (HEX.test(normalized)) {
      const next = hexToHsv(normalized);
      // Der Farbton bleibt bei Grautönen erhalten
      setHsv({ h: next.s ? next.h : hsv.h, s: next.s, v: next.v });
      onChange(normalized.toLowerCase());
    }
  };

  const current = hsvToHex(hsv);
  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return createPortal(
    <div className="modal-overlay" aria-modal="true" role="dialog" aria-label={label} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content cp-dialog">
        <h2 className="cp-title">{label}</h2>
        <div
          ref={areaRef}
          className="cp-area"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
          tabIndex={0}
          role="slider"
          aria-label="Sättigung und Helligkeit"
          aria-valuetext={`Sättigung ${Math.round(hsv.s * 100)} Prozent, Helligkeit ${Math.round(hsv.v * 100)} Prozent`}
          onKeyDown={onAreaKey}
          onPointerDown={(e) => { draggingRef.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e); }}
          onPointerMove={(e) => { if (draggingRef.current) fromPointer(e); }}
          onPointerUp={() => { draggingRef.current = false; }}
          onPointerCancel={() => { draggingRef.current = false; }}
        >
          <span className="cp-handle" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: current }} />
        </div>

        <label className="cp-slider-row">
          <span>Farbton</span>
          <input type="range" min="0" max="359" step="1" value={Math.round(hsv.h)} className="cp-range cp-range-hue"
            onChange={(e) => apply({ ...hsv, h: Number(e.target.value) })} />
        </label>
        <label className="cp-slider-row">
          <span>Sättigung</span>
          <input type="range" min="0" max="100" step="1" value={Math.round(hsv.s * 100)} className="cp-range"
            style={{ background: `linear-gradient(to right, ${hsvToHex({ ...hsv, s: 0 })}, ${hsvToHex({ ...hsv, s: 1 })})` }}
            onChange={(e) => apply({ ...hsv, s: Number(e.target.value) / 100 })} />
        </label>
        <label className="cp-slider-row">
          <span>Helligkeit</span>
          <input type="range" min="0" max="100" step="1" value={Math.round(hsv.v * 100)} className="cp-range"
            style={{ background: `linear-gradient(to right, #000, ${hsvToHex({ ...hsv, v: 1 })})` }}
            onChange={(e) => apply({ ...hsv, v: Number(e.target.value) / 100 })} />
        </label>

        <div className="cp-row">
          <span className="cp-preview" style={{ background: current }} aria-hidden="true" />
          <input type="text" className="cp-hex" value={hexText} maxLength={7} spellCheck={false} aria-label="Hex-Farbwert"
            onChange={(e) => onHex(e.target.value)} />
        </div>

        <div className="cp-quick">
          {QUICK.map(color => (
            <button key={color} type="button" className="cp-quick-swatch" style={{ background: color }} aria-label={color} title={color}
              onClick={() => { setHsv(hexToHsv(color)); setHexText(color); onChange(color); }} />
          ))}
        </div>

        <div className="cp-actions">
          <button type="button" className="btn-primary" onClick={onClose}><Check size={16} /> Fertig</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// variant "field": runder Farbknopf wie im Verlaufsfeld. variant "swatch": Regenbogen-Knopf mit Pipette (Akzentfarbe).
export default function ColorPicker({ value, onChange, label = 'Farbe', variant = 'field', active = false }) {
  const [open, setOpen] = useState(false);
  const safe = HEX.test(value) ? value : '#000000';
  return (
    <>
      {variant === 'swatch' ? (
        <button type="button" className={`ts-swatch ts-swatch-custom${active ? ' ts-swatch-on' : ''}`} title="Eigene Farbe" aria-label={label} onClick={() => setOpen(true)}>
          <Pipette size={17} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className="ts-color cp-field-button" aria-label={label} title={label} onClick={() => setOpen(true)}>
          <span className="cp-field-dot" style={{ background: safe }} />
        </button>
      )}
      {open && <PickerDialog value={safe} label={label} onChange={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}
