import React, { useState, useEffect, useRef } from 'react';
import { GitBranch, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

const inputStyle = {
  width: '100%',
  background: 'var(--bg-input)',
  border: '1px solid var(--border-card)',
  borderRadius: '999px',
  padding: '10px 16px',
  color: 'var(--text-main)',
  fontSize: '13.5px',
  outline: 'none',
  fontFamily: 'inherit'
};

const labelStyle = { display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };

export default function GithubSettingsCard() {
  const [repoPath, setRepoPath] = useState('');
  const [branch, setBranch] = useState('');
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState(null);

  const loadedRef = useRef({ repoPath: '', branch: '' });
  const latestRef = useRef({ repoPath: '', branch: '', token: '' });
  latestRef.current = { repoPath, branch, token };

  useEffect(() => {
    if (!window.electronAPI?.getGithubConfig) return;
    window.electronAPI.getGithubConfig().then(config => {
      const loadedPath = `${config.owner}/${config.repo}`;
      loadedRef.current = { repoPath: loadedPath, branch: config.branch };
      setRepoPath(loadedPath);
      setBranch(config.branch);
      setHasToken(config.hasToken);
    });
  }, []);

  // Automatisch speichern, sobald die Seite verlassen wird (Token ist dafür nicht nötig)
  useEffect(() => {
    return () => {
      const { repoPath: path, branch: br, token: tk } = latestRef.current;
      const loaded = loadedRef.current;
      if (!window.electronAPI?.saveGithubConfig) return;
      if (path === loaded.repoPath && br === loaded.branch && !tk.trim()) return;
      const [owner, repo] = path.split('/').map(part => part.trim());
      window.electronAPI.saveGithubConfig({ owner, repo, branch: br, token: tk.trim() ? tk : undefined });
    };
  }, []);

  const saveConfig = async () => {
    const [owner, repo] = repoPath.split('/').map(part => part.trim());
    const saved = await window.electronAPI.saveGithubConfig({
      owner,
      repo,
      branch,
      // Ein leeres Feld behält das gespeicherte Token
      token: token.trim() ? token : undefined
    });
    loadedRef.current = { repoPath, branch };
    setHasToken(saved.hasToken);
    setToken('');
  };

  const handleTest = async () => {
    setIsTesting(true);
    setResult(null);
    try {
      await saveConfig();
      setResult(await window.electronAPI.testGithubConnection());
    } catch (err) {
      setResult({ success: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleRemoveToken = async () => {
    const saved = await window.electronAPI.saveGithubConfig({ token: '' });
    setHasToken(saved.hasToken);
    setResult(null);
  };

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <GitBranch size={20} style={{ color: 'var(--color-primary)' }} />
        <div>
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Server-Modpack Repository (GitHub)</h2>
          <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
            Wohin der Launcher die Modliste (server-manifest.json) und Server-Changelogs für alle Spieler veröffentlicht.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '14px' }}>
        <div>
          <label style={labelStyle}>Repo:</label>
          <input type="text" value={repoPath} onChange={(e) => setRepoPath(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Branch:</label>
          <input type="text" value={branch} onChange={(e) => setBranch(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <label style={labelStyle}>Fine-grained Token (nur Contents: Read and write):</label>
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder={hasToken ? 'Token ist gespeichert. Zum Ersetzen neu eintragen.' : 'github_pat_...'}
        style={{ ...inputStyle, fontFamily: 'monospace' }}
      />

      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
        <button className="btn-primary" onClick={handleTest} disabled={isTesting}>
          {isTesting ? <RefreshCw size={15} className="spin" /> : <CheckCircle2 size={15} />}
          <span>Verbindung testen</span>
        </button>
        {hasToken && (
          <button className="btn-secondary" onClick={handleRemoveToken}>Token entfernen</button>
        )}
      </div>

      {result && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', fontSize: '13.5px', fontWeight: 600, color: result.success ? '#059669' : '#dc2626' }}>
          {result.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{result.success ? (result.note || 'Repo und Branch sind erreichbar.') : result.error}</span>
        </div>
      )}
    </div>
  );
}
