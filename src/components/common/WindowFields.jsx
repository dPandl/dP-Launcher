import React from 'react';
import Dropdown from './Dropdown';

const labelStyle = { display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };

export const WINDOW_MODE_LABELS = {
  default: 'Standard von Minecraft',
  custom: 'Eigene Größe',
  fullscreen: 'Vollbild'
};

const digits = (value) => String(value ?? '').replace(/[^0-9]/g, '');

export function describeWindow(settings) {
  const mode = settings?.windowMode || 'default';
  if (mode === 'custom') return `${settings.windowWidth || 1280} × ${settings.windowHeight || 720}`;
  return WINDOW_MODE_LABELS[mode] || WINDOW_MODE_LABELS.default;
}

/**
 * Fenster beim Spielstart. Mit `inherit` kann ein Server oder eine Instanz
 * die Einstellung des Launchers übernehmen (leerer Modus).
 */
export default function WindowFields({ values, onChange, inherit = false, globalSettings }) {
  const mode = values.windowMode || '';
  const showSize = mode === 'custom';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <label style={labelStyle}>Fenster beim Start</label>
        <Dropdown value={mode} onChange={(e) => onChange('windowMode', e.target.value)} style={{ width: '100%' }}>
          {inherit && <option value="">{`Wie in den Einstellungen (${describeWindow(globalSettings)})`}</option>}
          <option value="default">{WINDOW_MODE_LABELS.default}</option>
          <option value="custom">{WINDOW_MODE_LABELS.custom}</option>
          <option value="fullscreen">{WINDOW_MODE_LABELS.fullscreen}</option>
        </Dropdown>
      </div>
      {showSize && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Breite in Pixel</label>
            <input type="text" inputMode="numeric" value={values.windowWidth ?? ''} onChange={(e) => onChange('windowWidth', digits(e.target.value))} placeholder="1280" style={{ width: '100%' }} />
          </div>
          <div>
            <label style={labelStyle}>Höhe in Pixel</label>
            <input type="text" inputMode="numeric" value={values.windowHeight ?? ''} onChange={(e) => onChange('windowHeight', digits(e.target.value))} placeholder="720" style={{ width: '100%' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// Werte für die Formulare von Server und Instanz (null wird zu leerem Text)
export function launchFormValues(source) {
  return {
    ramMax: source?.ramMax ? String(source.ramMax) : '',
    windowMode: source?.windowMode || '',
    windowWidth: source?.windowWidth ? String(source.windowWidth) : '',
    windowHeight: source?.windowHeight ? String(source.windowHeight) : ''
  };
}

// Zurück in die Form fürs Speichern: leer = Einstellung des Launchers
export function launchPayload(values) {
  const num = (value) => (value === '' || value === undefined || value === null ? null : Number(value));
  return {
    ramMax: num(values.ramMax),
    windowMode: values.windowMode || null,
    windowWidth: values.windowMode === 'custom' ? num(values.windowWidth) : null,
    windowHeight: values.windowMode === 'custom' ? num(values.windowHeight) : null
  };
}
