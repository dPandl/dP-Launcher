import React, { useEffect, useState } from 'react';
import { Layers, RefreshCw, Save, DownloadCloud, CheckCircle2, AlertCircle } from 'lucide-react';
import Dropdown from '../common/Dropdown';
import { appConfirm } from '../../utils/appDialog';

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };
const VERSION_RE = /^[0-9A-Za-z._-]{1,32}$/;

// Minecraft- und Fabric-Version, mit der die Spieler starten. Sie gelten für den Entwurf und stehen nach dem Veröffentlichen im Manifest.
export default function GameVersionCard({ draft, published, onDraftChange }) {
  const [gameVersion, setGameVersion] = useState(draft?.gameVersion || '');
  const [loaderVersion, setLoaderVersion] = useState(draft?.loaderVersion || '');
  const [loaders, setLoaders] = useState([]);
  const [loadersError, setLoadersError] = useState('');
  const [loadingLoaders, setLoadingLoaders] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  // Draft von außen (Zurücksetzen, anderer Server) übernehmen
  useEffect(() => {
    setGameVersion(draft?.gameVersion || '');
    setLoaderVersion(draft?.loaderVersion || '');
  }, [draft?.gameVersion, draft?.loaderVersion]);

  // Verfügbare Fabric-Versionen für die gewählte Minecraft-Version
  useEffect(() => {
    const version = gameVersion.trim();
    if (!VERSION_RE.test(version) || !window.electronAPI?.getFabricLoaderVersions) {
      setLoaders([]);
      setLoadersError('');
      return undefined;
    }
    let cancelled = false;
    setLoadingLoaders(true);
    const timer = setTimeout(async () => {
      const res = await window.electronAPI.getFabricLoaderVersions(version);
      if (cancelled) return;
      setLoadingLoaders(false);
      if (res?.success) {
        setLoaders(res.versions);
        setLoadersError(res.versions.length === 0 ? `Für Minecraft ${version} gibt es keine Fabric-Version.` : '');
      } else {
        setLoaders([]);
        setLoadersError(res?.error || 'Die Fabric-Versionen konnten nicht geladen werden.');
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [gameVersion]);

  const dirty = gameVersion.trim() !== (draft?.gameVersion || '') || loaderVersion !== (draft?.loaderVersion || '');
  const valid = VERSION_RE.test(gameVersion.trim());
  const loaderKnown = !loaderVersion || loaders.length === 0 || loaders.some(entry => entry.version === loaderVersion);

  const handleDetect = async () => {
    setDetecting(true);
    setResult(null);
    try {
      const res = await window.electronAPI.detectServerVersions();
      if (!res?.success) {
        setResult({ success: false, text: res?.error || 'Es wurde nichts gefunden.' });
        return;
      }
      if (res.gameVersion) setGameVersion(res.gameVersion);
      if (res.loaderVersion) setLoaderVersion(res.loaderVersion);
      setResult({
        success: true,
        text: `Vom Server gelesen:${res.gameVersion ? ` Minecraft ${res.gameVersion}` : ''}${res.loaderVersion ? ` · Fabric ${res.loaderVersion}` : ''}. Mit „Speichern“ übernehmen.`
      });
    } catch (err) {
      setResult({ success: false, text: err.message });
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = async () => {
    const nextGame = gameVersion.trim();
    if (nextGame !== (draft?.gameVersion || '') && (draft?.mods?.length || 0) > 0) {
      const sure = await appConfirm(
        `Die Mods im Entwurf sind für Minecraft ${draft.gameVersion || '?'} festgeschrieben. Bei Minecraft ${nextGame} musst du sie neu wählen, sonst starten die Spieler mit Mods einer anderen Version.\n\nTrotzdem ändern?`,
        { title: 'Minecraft-Version ändern?', confirmLabel: 'Ändern', cancelLabel: 'Abbrechen' }
      );
      if (!sure) return;
    }
    setSaving(true);
    setResult(null);
    try {
      await onDraftChange({ ...draft, gameVersion: nextGame, loaderVersion });
      setResult({ success: true, text: 'Gespeichert. Die Spieler bekommen die Werte nach dem nächsten Veröffentlichen.' });
    } catch (err) {
      setResult({ success: false, text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Layers size={20} style={{ color: 'var(--color-primary)' }} />
        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>Minecraft- und Fabric-Version</h3>
      </div>
      <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
        Mit diesen Versionen starten deine Spieler. Wählst du bei Fabric „Automatisch“, nehmen sie die neueste stabile Version. Eine feste Version passt zu der auf deinem Server.
        {published?.gameVersion ? ` Veröffentlicht ist aktuell Minecraft ${published.gameVersion}${published.loaderVersion ? ` mit Fabric ${published.loaderVersion}` : ' mit automatischer Fabric-Version'}.` : ''}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Minecraft-Version</label>
          <input
            type="text"
            value={gameVersion}
            onChange={(e) => setGameVersion(e.target.value)}
            placeholder="z. B. 1.21.1"
            style={{ width: '100%', borderColor: gameVersion && !valid ? '#ef4444' : undefined }}
          />
        </div>
        <div>
          <label style={labelStyle}>Fabric-Version {loadingLoaders && <RefreshCw size={12} className="spin" style={{ marginLeft: '6px' }} />}</label>
          <Dropdown value={loaderVersion} onChange={(e) => setLoaderVersion(e.target.value)} style={{ width: '100%' }}>
            <option value="">Automatisch (neueste stabile)</option>
            {!loaderKnown && <option value={loaderVersion}>{loaderVersion} (nicht für diese Minecraft-Version)</option>}
            {loaders.map(entry => (
              <option key={entry.version} value={entry.version}>{entry.version}{entry.stable ? '' : ' (nicht stabil)'}</option>
            ))}
          </Dropdown>
        </div>
      </div>
      {loadersError && <div style={{ fontSize: '12.5px', color: '#d97706', marginTop: '8px' }}>{loadersError}</div>}
      {!loaderKnown && <div style={{ fontSize: '12.5px', color: '#d97706', marginTop: '8px' }}>Diese Fabric-Version gibt es für Minecraft {gameVersion} nicht. Beim Start nehmen die Spieler dann die neueste stabile.</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" onClick={handleDetect} disabled={detecting} title="Liest Minecraft- und Fabric-Version von deinem BisectHosting-Server">
          {detecting ? <RefreshCw size={15} className="spin" /> : <DownloadCloud size={15} />}
          <span>Vom Server auslesen</span>
        </button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !dirty || !valid}>
          {saving ? <RefreshCw size={15} className="spin" /> : <Save size={15} />}
          <span>Speichern</span>
        </button>
        {result && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: result.success ? '#059669' : '#dc2626', overflowWrap: 'anywhere' }}>
            {result.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {result.text}
          </span>
        )}
      </div>
    </div>
  );
}
