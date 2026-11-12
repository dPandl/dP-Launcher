import React, { useEffect, useRef, useState } from 'react';
import { Palette, CheckCircle2, AlertCircle, RefreshCw, UploadCloud, FileDown } from 'lucide-react';
import ServerBannerField from '../common/ServerBannerField';
import { resolveServerPresentation } from '../common/ServerHeading';
import { getAdminServer } from '../../utils/serverAddress';

const labelStyle = { display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };

// Name, Beschreibung und Banner für alle Spieler. Sie stehen im Manifest auf GitHub und gelten vor der Serverdatei.
// Eingaben werden lokal gespeichert, auch wenn sie noch nicht veröffentlicht sind.
export default function ServerPresentationCard({ settings, manifest, onRefreshManifest }) {
  const server = getAdminServer(settings);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [bannerData, setBannerData] = useState(''); // lokal gewähltes Bild (Data-URL)
  const [bannerDirty, setBannerDirty] = useState(false); // Bild wurde in dieser Sitzung neu gewählt oder entfernt
  const [bannerRemove, setBannerRemove] = useState(false); // Banner von GitHub beim Veröffentlichen entfernen
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const lastSaved = useRef('');
  const ready = useRef(false);

  const githubBanner = resolveServerPresentation(manifest, server).githubBanner;

  // Start: lokal Gespeichertes zuerst, sonst der Stand von GitHub
  useEffect(() => {
    const neverEdited = server.displayName === undefined;
    const initial = {
      name: neverEdited ? (manifest?.serverName || '') : server.displayName,
      description: neverEdited ? (manifest?.serverDescription || server.description || '') : server.description,
      banner: server.banner || '',
      bannerRemove: server.bannerRemove === true
    };
    setName(initial.name);
    setDescription(initial.description);
    setBannerData('');
    setBannerDirty(false);
    setBannerRemove(initial.bannerRemove);
    if (initial.banner && window.electronAPI?.readBanner) {
      window.electronAPI.readBanner(server.id).then(url => setBannerData(url || ''));
    }
    lastSaved.current = JSON.stringify({ name: initial.name, description: initial.description, bannerDirty: false, bannerLen: 0, bannerRemove: initial.bannerRemove });
    ready.current = true;
    // Absichtlich nur beim Wechsel des Repositorys neu einlesen, sonst würden Eingaben überschrieben
  }, [server.owner, server.repo]);

  // Jede Änderung wird kurz danach lokal gespeichert
  useEffect(() => {
    if (!ready.current || !window.electronAPI?.saveAdminPresentation) return undefined;
    const serialized = JSON.stringify({ name, description, bannerDirty, bannerLen: bannerDirty ? bannerData.length : 0, bannerRemove });
    if (serialized === lastSaved.current) return undefined;
    const timer = setTimeout(async () => {
      // Das Bild geht nur mit, wenn es neu gewählt oder entfernt wurde. Sonst bleibt die gespeicherte Datei.
      await window.electronAPI.saveAdminPresentation({
        displayName: name,
        description,
        banner: bannerDirty ? bannerData : undefined,
        bannerRemove
      });
      lastSaved.current = JSON.stringify({ name, description, bannerDirty: false, bannerLen: 0, bannerRemove });
      setBannerDirty(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [name, description, bannerData, bannerDirty, bannerRemove]);

  const previewValue = bannerData || (bannerRemove ? '' : githubBanner);

  const handlePublish = async () => {
    if (!window.electronAPI?.updateServerPresentation) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await window.electronAPI.updateServerPresentation({
        serverName: name,
        serverDescription: description,
        bannerAction: bannerData ? 'set' : bannerRemove ? 'remove' : 'keep',
        banner: bannerData
      });
      if (res?.success) {
        setBannerRemove(false);
        setResult({ success: true, text: 'Veröffentlicht. Die Spieler sehen die Änderung beim nächsten Abgleich.' });
        await onRefreshManifest?.();
      } else {
        setResult({ success: false, text: res?.error || 'Das hat nicht geklappt.' });
      }
    } catch (err) {
      setResult({ success: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  // Die Serverdatei nimmt dieselben Angaben wie die Darstellung oben. Leer lässt den Wert des Admin-Servers gelten.
  const handleExport = async () => {
    if (!window.electronAPI?.exportServer) return;
    setExportBusy(true);
    setExportResult(null);
    try {
      const res = await window.electronAPI.exportServer(
        server.id,
        name.trim() || server.name,
        description.trim(),
        // undefined = gespeichertes Banner (sonst das von GitHub), leer = ohne Banner, sonst das neu gewählte Bild
        bannerDirty ? bannerData : undefined
      );
      if (res?.canceled) return;
      setExportResult(res?.success
        ? { success: true, text: `Gespeichert: ${res.filePath}` }
        : { success: false, text: res?.error || 'Die Datei konnte nicht gespeichert werden.' });
    } catch (err) {
      setExportResult({ success: false, text: err.message });
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div className="glass-card" style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Palette size={20} style={{ color: 'var(--color-primary)' }} />
        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Darstellung für alle Spieler (GitHub)</h3>
      </div>
      <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
        Name, Beschreibung und Banner stehen im Manifest deines Repositorys. Was hier eingetragen ist, ersetzt die Angaben aus der geteilten Serverdatei bei allen Spielern. Leere Felder lassen die Serverdatei gelten. Eine neue Modpack-Version entsteht dabei nicht. Deine Eingaben bleiben gespeichert, auch bevor du sie veröffentlichst.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={labelStyle}><span>Name</span></label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Leer = Name aus der Serverdatei" style={{ width: '100%' }} />
        </div>
        <div>
          <label style={labelStyle}>
            <span>Beschreibung</span>
            <span>{description.length}/140</span>
          </label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value.replace(/\s+/g, ' '))} maxLength={140} rows={2} placeholder="Leer = Beschreibung aus der Serverdatei" style={{ width: '100%', resize: 'none' }} />
        </div>
        <ServerBannerField
          label="Banner"
          value={previewValue}
          onPick={(dataUrl) => { setBannerData(dataUrl); setBannerDirty(true); setBannerRemove(false); }}
          onRemove={() => { setBannerData(''); setBannerDirty(true); setBannerRemove(Boolean(githubBanner)); }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
        <button type="button" className="btn-primary" onClick={handlePublish} disabled={busy || !(server.owner && server.repo)}>
          {busy ? <RefreshCw size={15} className="spin" /> : <UploadCloud size={15} />}
          <span>Auf GitHub veröffentlichen</span>
        </button>
        {result && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: result.success ? '#059669' : '#dc2626', overflowWrap: 'anywhere' }}>
            {result.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {result.text}
          </span>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border-card)', marginTop: '20px', paddingTop: '16px' }}>
        <div style={{ fontSize: '14.5px', fontWeight: 700, marginBottom: '4px' }}>Server-Datei für Mitspieler (.dpmcserver)</div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 12px' }}>
          Speichert eine Datei mit Name, Beschreibung, Banner, Server-Adresse und Repository von oben. Schick sie deinen Mitspielern: Sie importieren sie im Reiter „Server“ (oder klicken sie doppelt an) und haben den Server sofort im Launcher. Es sind keine Zugangsdaten enthalten. Was auf GitHub veröffentlicht ist, hat bei den Spielern Vorrang.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={handleExport} disabled={exportBusy}>
            {exportBusy ? <RefreshCw size={15} className="spin" /> : <FileDown size={15} />}
            <span>Server-Datei speichern</span>
          </button>
          {exportResult && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: exportResult.success ? '#059669' : '#dc2626', overflowWrap: 'anywhere' }}>
              {exportResult.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {exportResult.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
