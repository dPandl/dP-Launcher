import React, { useEffect, useState } from 'react';
import { Shield, Eye, EyeOff, HelpCircle, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { BisectService } from '../../services/bisectService';

const DEFAULT_PANEL_URL = 'https://games.bisecthosting.com';
const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };

// Anmeldedaten für das BisectHosting Starbase-Panel. Sie werden beim Verlassen des Feldes gespeichert.
export default function BisectCredentialsCard({ settings, onUpdateSettings }) {
  const stored = settings?.bisectConfig || {};
  const [panelUrl, setPanelUrl] = useState(stored.panelUrl || '');
  const [apiKey, setApiKey] = useState(stored.apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    setPanelUrl(stored.panelUrl || '');
    setApiKey(stored.apiKey || '');
  }, [stored.panelUrl, stored.apiKey]);

  const save = async () => {
    if (panelUrl === (stored.panelUrl || '') && apiKey === (stored.apiKey || '')) return;
    await onUpdateSettings?.({ bisectConfig: { ...stored, panelUrl, apiKey } });
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setResult({ success: false, error: 'Bitte gib zuerst einen Client API-Key ein.' });
      return;
    }
    setTesting(true);
    setResult(null);
    try {
      await save();
      const servers = await BisectService.getServers(panelUrl.trim() || DEFAULT_PANEL_URL, apiKey);
      setResult({
        success: true,
        count: servers.length,
        names: servers.map(s => s.attributes?.name || s.attributes?.identifier).filter(Boolean)
      });
    } catch (err) {
      setResult({ success: false, error: err.message || 'Verbindung fehlgeschlagen' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="glass-card" style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <Shield size={20} style={{ color: 'var(--color-primary)' }} />
        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>BisectHosting Starbase Anmeldedaten</h3>
      </div>
      <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
        Damit verbindet sich das Server-Admin mit deinem Starbase-Panel (Konsole, Mods auf dem Server, Server-Abgleich). Der Key wird verschlüsselt gespeichert.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={labelStyle}>Panel-URL:</label>
          <input
            type="text"
            value={panelUrl}
            onChange={(e) => setPanelUrl(e.target.value)}
            onBlur={save}
            placeholder={DEFAULT_PANEL_URL}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Client API-Key:</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onBlur={save}
              placeholder="ptlc_..."
              autoComplete="off"
              spellCheck={false}
              style={{ width: '100%', paddingRight: '46px' }}
            />
            <button
              type="button"
              onClick={() => setShowKey(prev => !prev)}
              title={showKey ? 'API-Key verbergen' : 'API-Key anzeigen'}
              aria-label={showKey ? 'API-Key verbergen' : 'API-Key anzeigen'}
              style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', padding: '4px' }}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '12.5px', color: 'var(--text-muted)' }}>
            <HelpCircle size={15} style={{ flexShrink: 0 }} />
            <span>Erstelle den Key in deinem Panel unter: <strong>Account Settings → API Credentials</strong>.</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px', flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" onClick={handleTest} disabled={testing}>
          <RefreshCw size={14} className={testing ? 'spin' : ''} />
          <span>{testing ? 'Teste Verbindung...' : 'Verbindung testen'}</span>
        </button>
        {result && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: result.success ? '#059669' : '#dc2626', overflowWrap: 'anywhere' }}>
            {result.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
            {result.success
              ? `Verbindung erfolgreich! ${result.count} Server gefunden${result.names.length > 0 ? ` (${result.names.join(', ')})` : ''}`
              : result.error}
          </span>
        )}
      </div>
    </div>
  );
}
