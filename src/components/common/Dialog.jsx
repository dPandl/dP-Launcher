import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Einheitlicher Dialog im Stil der App. Schließt per Klick neben den Dialog, solange nichts läuft.
export default function Dialog({ title, icon: Icon, onClose, children, busy = false, maxWidth = '520px' }) {
  return createPortal(
    <div className="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {Icon && <Icon size={20} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />}
            <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>{title}</h2>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy} aria-label="Schließen" style={{ padding: '6px', borderRadius: '999px', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
