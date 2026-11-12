import React, { useEffect, useState } from 'react';
import { Server, CheckCircle2, AlertCircle, RefreshCw, Save } from 'lucide-react';
import { getAdminServer } from '../../utils/serverAddress';

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };

// Der Server, den du hier verwaltest. Das ist unabhängig von den Servern im Reiter "Server" zum Spielen.
export default function AdminServerCard({ settings }) {
  const server = getAdminServer(settings);
  const [name, setName] = useState(server.name);
  const [address, setAddress] = useState(server.address);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setName(server.name);
    setAddress(server.address);
  }, [server.name, server.address]);

  const dirty = name.trim() !== server.name || address.trim() !== server.address;

  const handleSave = async () => {
    if (!window.electronAPI?.saveAdminServer) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await window.electronAPI.saveAdminServer({ name, address });
      setResult(res?.success ? { success: true, text: 'Gespeichert.' } : { success: false, text: res?.error || 'Das hat nicht geklappt.' });
    } catch (err) {
      setResult({ success: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-card" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Server size={20} style={{ color: 'var(--color-primary)' }} />
        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Server, den du verwaltest</h3>
      </div>
      <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
        Entwurf, Veröffentlichung und Teilen gelten für diesen Server. Das hat nichts mit den Servern im Reiter „Server“ zu tun, die du zum Spielen eingetragen hast. Das GitHub-Repository gibst du darunter an. Ändert sich die Adresse, wird sie beim nächsten Veröffentlichen (Modpack oder Darstellung) auch bei allen Spielern übernommen.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="z. B. Dream Plaza" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>Server-Adresse</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="z. B. mc.beispiel.de:25565" style={{ width: '100%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={busy || !dirty}>
          {busy ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
          <span>Speichern</span>
        </button>
        {result && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: result.success ? '#059669' : '#dc2626' }}>
            {result.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {result.text}
          </span>
        )}
      </div>
    </div>
  );
}
