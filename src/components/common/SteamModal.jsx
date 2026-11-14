import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Gamepad2, Check, X } from 'lucide-react';
import { appAlert } from '../../utils/appDialog';

const ARTWORK = ['Poster', 'Grid', 'Banner', 'Icon', 'Logo'];

// Trägt den Launcher in Steam ein. Gibt true zurück, wenn es geklappt hat.
export async function addLauncherToSteam() {
  const res = await window.electronAPI?.addToSteam?.();
  if (res?.success) {
    await appAlert('Der Launcher steht jetzt in deiner Steam-Bibliothek unter „Nicht-Steam-Spiele“, mit Poster, Grid, Banner, Icon und Logo.\n\nStarte Steam neu, damit der Eintrag erscheint.', { title: 'Zu Steam hinzugefügt' });
    return true;
  }
  await appAlert(res?.error || 'Der Launcher konnte nicht zu Steam hinzugefügt werden.', { warning: true });
  return false;
}

export default function SteamModal({ onClose }) {
  const [busy, setBusy] = useState(false);
  const handleAdd = async () => {
    setBusy(true);
    const ok = await addLauncherToSteam();
    setBusy(false);
    if (ok) onClose();
  };
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '12px', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gamepad2 size={20} />
            </div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-main)' }}>Zu Steam hinzufügen?</h2>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={busy} aria-label="Schließen"><X size={18} /></button>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: '12px' }}>
          Auf dem Steam Deck startest du den Launcher am bequemsten aus der Steam-Bibliothek. Er wird als Nicht-Steam-Spiel eingetragen, mit diesen Bildern:
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
          {ARTWORK.map(name => (
            <span key={name} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px', background: 'var(--bg-well)', color: 'var(--text-main)' }}>
              <Check size={13} style={{ color: 'var(--color-primary)' }} />{name}
            </span>
          ))}
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '18px' }}>
          Das geht auch später unter Einstellungen. Danach Steam neu starten.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Nicht jetzt</button>
          <button className="btn-primary" onClick={handleAdd} disabled={busy}>{busy ? 'Wird hinzugefügt …' : 'Zu Steam hinzufügen'}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
