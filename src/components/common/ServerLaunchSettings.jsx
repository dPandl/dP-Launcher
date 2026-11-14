import React, { useState } from 'react';
import { SlidersHorizontal, Check, RotateCcw } from 'lucide-react';
import Dialog from './Dialog';
import WindowFields, { launchFormValues, launchPayload } from './WindowFields';
import useSystemMemory from './useSystemMemory';
import RamSlider from './RamSlider';
import { appAlert } from '../../utils/appDialog';

// Spielstart-Einstellungen eines Servers: Arbeitsspeicher und Fenster. Leer = Einstellung des Launchers.
export default function ServerLaunchSettings({ server, settings, onClose }) {
  const [values, setValues] = useState(() => launchFormValues(server));
  const [busy, setBusy] = useState(false);
  const memory = useSystemMemory();
  const globalRam = Math.min(settings?.ramMax || 6, memory.maxGb);
  const ownRam = values.ramMax !== '';
  const set = (key, value) => setValues(prev => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!window.electronAPI?.updateServer) return;
    setBusy(true);
    try {
      const res = await window.electronAPI.updateServer(server.id, launchPayload(values));
      if (!res?.success) {
        appAlert(res?.error || 'Das hat nicht geklappt.', { warning: true });
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Starteinstellungen: ${server.name}`} icon={SlidersHorizontal} onClose={onClose} busy={busy}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '14px' }}>
            <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Maximaler RAM</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>
                {ownRam ? `${values.ramMax} GB` : `${globalRam} GB (Einstellung)`}
              </span>
              {ownRam && (
                <button type="button" className="btn-secondary" onClick={() => set('ramMax', '')} title="Wie in den Einstellungen" style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                  <RotateCcw size={12} /> Zurücksetzen
                </button>
              )}
            </span>
          </div>
          <RamSlider
            value={ownRam ? Math.min(Number(values.ramMax), memory.maxGb) : globalRam}
            max={memory.maxGb}
            dimmed={!ownRam}
            onChange={(ram) => set('ramMax', String(ram))}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            <span>2 GB</span>
            {memory.totalGb && <span>Dein PC hat {memory.totalGb} GB</span>}
            <span>{memory.maxGb} GB</span>
          </div>
        </div>

        <WindowFields values={values} onChange={set} inherit globalSettings={settings} />

        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
          Was du hier nicht änderst, übernimmt die Einstellung des Launchers.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
        <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Abbrechen</button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>
          <Check size={16} />
          <span>Speichern</span>
        </button>
      </div>
    </Dialog>
  );
}
