import React, { useState } from 'react';
import { ImagePlus, Trash2, AlertCircle, RefreshCw } from 'lucide-react';

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };

// Auswahl eines Server-Banners: PNG im Verhältnis 30:10 (3:1). Der Hauptprozess prüft und verkleinert das Bild.
export default function ServerBannerField({ value, onPick, onRemove, label = 'Banner (optional)', hint }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [info, setInfo] = useState(null);

  const handlePick = async () => {
    if (!window.electronAPI?.pickServerBanner) return;
    setBusy(true);
    setError('');
    try {
      const res = await window.electronAPI.pickServerBanner();
      if (res?.canceled) return;
      if (!res?.success) {
        setError(res?.error || 'Das Bild konnte nicht übernommen werden.');
        return;
      }
      setPreviewFailed(false);
      // Gespeichert wird höchstens 1920 x 640 Pixel (Full HD) und 3 MB. Zeigen, was davon übrig bleibt.
      const reduced = res.width < Math.min(res.originalWidth, 1920);
      setInfo({ text: `${res.width} x ${res.height} Pixel, ${Math.round(res.bytes / 1024)} KB`, reduced });
      onPick(res.dataUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const showPreview = Boolean(value) && !previewFailed;

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div
          style={{
            width: '240px',
            maxWidth: '100%',
            aspectRatio: '3 / 1',
            borderRadius: '12px',
            border: '1px dashed var(--border-card)',
            background: 'var(--bg-well)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '12px',
            flexShrink: 0
          }}
        >
          {showPreview
            ? <img src={value} alt="Banner-Vorschau" onError={() => setPreviewFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            : <span>Kein Banner</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
          <button type="button" className="btn-secondary" onClick={handlePick} disabled={busy}>
            {busy ? <RefreshCw size={15} className="spin" /> : <ImagePlus size={15} />}
            <span>{value ? 'Anderes PNG wählen' : 'PNG wählen'}</span>
          </button>
          {value && (
            <button type="button" className="btn-secondary" onClick={() => { setError(''); onRemove(); }} style={{ color: '#ef4444' }}>
              <Trash2 size={15} />
              <span>Entfernen</span>
            </button>
          )}
        </div>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '8px', lineHeight: 1.5 }}>
        {hint || 'PNG im Verhältnis 30:10 (3:1), bis 1920 x 640 Pixel (Full HD) und 3 MB. Ein passendes Bild wird unverändert übernommen, größere werden verkleinert. Das Bild ersetzt den Servernamen.'}
      </div>
      {info && value && (
        <div style={{ fontSize: '12.5px', marginTop: '6px', color: info.reduced ? '#d97706' : 'var(--text-muted)', lineHeight: 1.5 }}>
          Gespeichert als {info.text}.{info.reduced ? ' Das Bild war für die Größengrenze zu detailreich und wurde stärker verkleinert. Ein Bild mit weniger Verläufen bleibt schärfer.' : ''}
        </div>
      )}
      {error && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '8px', fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>
          <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
