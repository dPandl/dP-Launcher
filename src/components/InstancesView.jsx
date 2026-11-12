import React, { useState, useEffect } from 'react';
import { Play, Plus, Package, Pencil, FolderOpen, Trash2, Check, Box, Zap, Download, RefreshCw, Square, ArrowLeft, AlertCircle } from 'lucide-react';
import { appAlert } from '../utils/appDialog';
import { getServers, getActiveServer } from '../utils/serverAddress';
import { ModrinthService } from '../services/modrinthService';
import { registerBackHandler } from '../utils/navigation';
import Dropdown from './common/Dropdown';
import Dialog from './common/Dialog';
import ModrinthBrowser from './modrinth/ModrinthBrowser';

const labelStyle = { display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };
const PAGE_SIZE = 30;
const LOADERS = [{ id: 'fabric', label: 'Fabric' }, { id: 'vanilla', label: 'Vanilla (ohne Mods)' }];

function formatDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function lastPlayedServer(settings) {
  const servers = getServers(settings);
  const played = servers.filter(server => server.lastPlayedAt).sort((a, b) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)));
  return played[0] || getActiveServer(settings) || servers[0] || null;
}

// Eingabefelder für Name, Version, Loader und Speicher einer Instanz
function InstanceFields({ values, setValues, versions, loadingVersions }) {
  const set = (key, value) => setValues(prev => ({ ...prev, [key]: value }));
  const versionOptions = versions.includes(values.gameVersion) || !values.gameVersion ? versions : [values.gameVersion, ...versions];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={labelStyle}>Name (so heißt auch der Ordner)</label>
        <input type="text" value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={60} placeholder="z. B. Mein Survival" style={{ width: '100%' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <label style={labelStyle}>Minecraft-Version</label>
          <Dropdown value={values.gameVersion} onChange={(e) => set('gameVersion', e.target.value)} disabled={loadingVersions && versionOptions.length === 0} style={{ width: '100%' }}>
            {versionOptions.length === 0 && <option value="">{loadingVersions ? 'Lädt...' : 'Keine Versionen'}</option>}
            {versionOptions.map(version => <option key={version} value={version}>{version}</option>)}
          </Dropdown>
        </div>
        <div>
          <label style={labelStyle}>Loader</label>
          <Dropdown value={values.loader} onChange={(e) => set('loader', e.target.value)} style={{ width: '100%' }}>
            {LOADERS.map(loader => <option key={loader.id} value={loader.id}>{loader.label}</option>)}
          </Dropdown>
        </div>
      </div>
      <div>
        <label style={labelStyle}>Arbeitsspeicher in GB (leer = Einstellung des Launchers)</label>
        <input type="text" inputMode="numeric" value={values.ramMax} onChange={(e) => set('ramMax', e.target.value.replace(/[^0-9]/g, ''))} placeholder="z. B. 6" style={{ width: '100%' }} />
      </div>
    </div>
  );
}

function useMinecraftVersions(enabled) {
  const [state, setState] = useState({ versions: [], latest: '', loading: false });
  useEffect(() => {
    if (!enabled || !window.electronAPI?.getMinecraftVersions) return undefined;
    let cancelled = false;
    setState(prev => ({ ...prev, loading: true }));
    window.electronAPI.getMinecraftVersions().then(res => {
      if (cancelled) return;
      setState({ versions: res?.success ? res.releases : [], latest: res?.latest || '', loading: false });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
}

// Modpacks wie im Modrinth-Store: Karten mit Hover, Detailseite mit Bildern und Versionen
function ModpackStore({ onBack, onInstalled }) {
  const [busyKey, setBusyKey] = useState(null);
  const [progress, setProgress] = useState(null);
  const [notice, setNotice] = useState(null);
  const [picker, setPicker] = useState(null); // { project, versions, versionId, name, loading }

  useEffect(() => {
    if (!window.electronAPI?.onInstanceInstallProgress) return undefined;
    return window.electronAPI.onInstanceInstallProgress(setProgress);
  }, []);

  // Auf der Karte oder oben auf der Detailseite: erst die Version wählen
  const openPicker = async (project) => {
    setNotice(null);
    setPicker({ project, versions: [], versionId: '', name: project.title, loading: true });
    try {
      const versions = await ModrinthService.getProjectVersions(project.id, { loader: 'fabric' });
      const best = versions.find(version => version.version_type === 'release') || versions[0];
      setPicker(prev => (prev ? { ...prev, versions, versionId: best?.id || '', loading: false } : prev));
    } catch (err) {
      setPicker(null);
      setNotice(err.message);
    }
  };

  const install = async (project, versionId, key, instanceName) => {
    if (!window.electronAPI?.installMrpack) {
      setNotice('Das geht nur in der App.');
      return;
    }
    setBusyKey(key);
    setNotice(null);
    setProgress(null);
    try {
      let id = versionId;
      if (!id) {
        const versions = await ModrinthService.getProjectVersions(project.id, { loader: 'fabric' });
        const best = versions.find(version => version.version_type === 'release') || versions[0];
        if (!best) throw new Error('Für dieses Modpack gibt es keine Fabric-Version.');
        id = best.id;
      }
      const res = await window.electronAPI.installMrpack({
        versionId: id,
        projectId: project.id,
        projectTitle: project.title,
        iconUrl: project.icon_url || '',
        instanceName
      });
      if (!res?.success) throw new Error(res?.error || 'Die Installation hat nicht geklappt.');
      onInstalled(res.instance);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  // versionId gesetzt: genau diese Version (Reiter Versionen). Sonst öffnet sich die Versionswahl.
  const renderButton = (project, versionId, key, primary) => {
    const isBusy = busyKey === key;
    return (
      <button
        type="button"
        className={`mr-action-button ${primary ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => (versionId ? install(project, versionId, key) : openPicker(project))}
        disabled={Boolean(busyKey)}
      >
        {isBusy ? <RefreshCw size={13} className="spin" /> : <Download size={13} />}
        <span>{isBusy ? 'Wird installiert...' : (versionId ? 'Diese Version installieren' : 'Als Instanz installieren')}</span>
      </button>
    );
  };

  const percent = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {busyKey && (
        <div className="glass-card" style={{ padding: '12px 18px', flexShrink: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', overflowWrap: 'anywhere' }}>
            {progress?.text || 'Modpack wird vorbereitet...'}{progress?.phase === 'files' ? ` (${progress.current}/${progress.total})` : ''}
          </div>
          <div style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-well)', overflow: 'hidden' }}>
            <div style={{ width: `${progress?.phase === 'files' ? percent : 8}%`, height: '100%', background: 'var(--color-primary)', transition: 'width .2s ease' }} />
          </div>
        </div>
      )}
      {notice && (
        <div className="mr-notice mr-notice-error" style={{ flexShrink: 0 }}>
          <AlertCircle size={18} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>Das Modpack konnte nicht installiert werden</div>
            <div className="mr-notice-line">{notice}</div>
          </div>
        </div>
      )}
      {picker && (
        <Dialog title="Modpack installieren" icon={Package} onClose={() => setPicker(null)}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '16px' }}>
            {picker.project.icon_url
              ? <img src={picker.project.icon_url} alt="" style={{ width: '52px', height: '52px', borderRadius: '12px', flexShrink: 0 }} />
              : <div style={{ width: '52px', height: '52px', borderRadius: '12px', background: 'var(--bg-well)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={22} /></div>}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: '16px', overflowWrap: 'anywhere' }}>{picker.project.title}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Wird als neue Instanz mit allen Mods installiert.</div>
            </div>
          </div>

          <label style={labelStyle}>Version</label>
          <Dropdown value={picker.versionId} onChange={(e) => setPicker(prev => ({ ...prev, versionId: e.target.value }))} disabled={picker.loading || picker.versions.length === 0} style={{ width: '100%' }}>
            {picker.versions.length === 0 && <option value="">{picker.loading ? 'Versionen werden geladen...' : 'Keine Fabric-Version gefunden'}</option>}
            {picker.versions.map(version => (
              <option key={version.id} value={version.id}>
                {version.version_number} (Minecraft {version.game_versions?.[0] || '?'}{version.version_type !== 'release' ? `, ${version.version_type}` : ''})
              </option>
            ))}
          </Dropdown>

          <label style={{ ...labelStyle, marginTop: '14px' }}>Name der Instanz</label>
          <input type="text" value={picker.name} onChange={(e) => setPicker(prev => ({ ...prev, name: e.target.value }))} maxLength={60} style={{ width: '100%' }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={() => setPicker(null)}>Abbrechen</button>
            <button
              type="button"
              className="btn-primary"
              disabled={!picker.versionId || !picker.name.trim()}
              onClick={() => {
                const { project, versionId, name } = picker;
                setPicker(null);
                install(project, versionId, project.id, name.trim());
              }}
            >
              <Download size={16} />
              <span>Installieren</span>
            </button>
          </div>
        </Dialog>
      )}
      <ModrinthBrowser
        projectTypes={['modpack']}
        lockedLoader="fabric"
        lockedLabel="Nur Fabric-Modpacks"
        renderAction={(project) => renderButton(project, null, project.id, true)}
        renderVersionAction={(project, version) => renderButton(project, version.id, version.id, false)}
      />
    </div>
  );
}

// Reiter Spielen: eigene Instanzen ohne Server und der Schnellstart zum zuletzt gespielten Server
export default function InstancesView({ settings, onQuickStart, onOpenMods }) {
  const instances = Array.isArray(settings?.instances) ? settings.instances : [];
  const server = lastPlayedServer(settings);
  const hasApp = Boolean(window.electronAPI);

  const [dialog, setDialog] = useState(null); // { type: 'create' | 'edit' | 'remove', ... }
  const [view, setView] = useState('list'); // 'list' | 'modpacks'
  const [notice, setNotice] = useState(null);
  const [values, setValues] = useState({ name: '', gameVersion: '', loader: 'fabric', ramMax: '' });
  const [busy, setBusy] = useState(false);
  const [gameStatus, setGameStatus] = useState({ status: 'idle', message: '', percent: 0 });
  const [isStopping, setIsStopping] = useState(false);

  // Auf der Modpack-Seite bringt der schwebende Zurück-Knopf zur Übersicht
  useEffect(() => {
    if (view !== 'modpacks') return undefined;
    return registerBackHandler(() => setView('list'), 'Zurück zu Spielen');
  }, [view]);

  const { versions, latest, loading: loadingVersions } = useMinecraftVersions(dialog?.type === 'create' || dialog?.type === 'edit');

  useEffect(() => {
    if (!window.electronAPI) return undefined;
    window.electronAPI.getGameStatus?.().then(status => status && setGameStatus(status));
    return window.electronAPI.onGameStatus?.(setGameStatus);
  }, []);

  const gameBusy = gameStatus.status !== 'idle';
  const gameRunning = gameStatus.status === 'running';

  const failed = (res) => appAlert(res?.error || 'Das hat nicht geklappt.', { warning: true });

  const openCreate = () => {
    setValues({ name: '', gameVersion: latest || '', loader: 'fabric', ramMax: '' });
    setDialog({ type: 'create' });
  };

  useEffect(() => {
    if (dialog?.type === 'create' && !values.gameVersion && latest) setValues(prev => ({ ...prev, gameVersion: latest }));
  }, [latest, dialog?.type]);

  const openEdit = (instance) => {
    setValues({ name: instance.name, gameVersion: instance.gameVersion, loader: instance.loader, ramMax: instance.ramMax ? String(instance.ramMax) : '' });
    setDialog({ type: 'edit', instance });
  };

  const submit = async () => {
    if (!hasApp) return appAlert('Das geht nur in der App.', { warning: true });
    setBusy(true);
    try {
      const payload = { ...values, ramMax: values.ramMax || null };
      const res = dialog.type === 'create'
        ? await window.electronAPI.createInstance(payload)
        : await window.electronAPI.updateInstance(dialog.instance.id, payload);
      if (!res?.success) return failed(res);
      setDialog(null);
    } finally {
      setBusy(false);
    }
  };

  const submitRemove = async () => {
    if (!hasApp) return;
    setBusy(true);
    try {
      const res = await window.electronAPI.removeInstance(dialog.instance.id, dialog.deleteFiles);
      if (!res?.success) return failed(res);
      setDialog(null);
      if (res.warning) appAlert(res.warning, { warning: true });
    } finally {
      setBusy(false);
    }
  };

  const play = async (instance) => {
    if (!hasApp) return appAlert('Das geht nur in der App.', { warning: true });
    const res = await window.electronAPI.launchInstance(instance.id);
    if (!res?.success) failed(res);
  };

  const stop = async () => {
    setIsStopping(true);
    try {
      await window.electronAPI.killGame?.();
    } finally {
      setIsStopping(false);
    }
  };

  const valid = values.name.trim() && values.gameVersion;

  if (view === 'modpacks') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0, flexWrap: 'wrap' }}>
          <div>
            <h1 className="app-page-title" style={{ margin: 0 }}>Modpack von Modrinth</h1>
            <p className="app-page-subtitle" style={{ margin: '2px 0 0' }}>Wähle ein Modpack. Es wird als neue Instanz mit allen Mods installiert.</p>
          </div>
        </div>
        <ModpackStore
          onBack={() => setView('list')}
          onInstalled={(instance) => {
            setNotice(`${instance.name} wurde als Instanz installiert.`);
            setView('list');
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
      {notice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '13.5px', fontWeight: 600 }}>
          <Check size={16} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{notice}</span>
          <button type="button" className="btn-secondary" onClick={() => setNotice(null)} style={{ padding: '3px 10px', fontSize: '12px' }}>OK</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 className="app-page-title">Spielen</h1>
          <p className="app-page-subtitle">Eigene Instanzen ohne Server. Mit Schnellstart zu deinem zuletzt gespielten Server.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" onClick={() => setView('modpacks')}>
            <Package size={16} />
            <span>Modpack von Modrinth</span>
          </button>
          <button type="button" className="btn-primary" onClick={openCreate}>
            <Plus size={16} />
            <span>Instanz erstellen</span>
          </button>
        </div>
      </div>

      {/* Läuft gerade etwas? */}
      {gameBusy && (
        <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 20px', flexWrap: 'wrap' }}>
          <RefreshCw size={18} className={gameRunning ? undefined : 'spin'} style={{ color: 'var(--color-primary)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>{gameRunning ? 'Minecraft läuft' : 'Minecraft wird gestartet'}</div>
            {gameStatus.message && <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>{gameStatus.message}</div>}
          </div>
          {gameRunning && (
            <button type="button" className="btn-secondary" onClick={stop} disabled={isStopping} style={{ color: '#ef4444' }}>
              <Square size={14} />
              <span>{isStopping ? 'Wird beendet...' : 'Beenden'}</span>
            </button>
          )}
        </div>
      )}

      {/* Schnellstart zum zuletzt gespielten Server */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '18px 22px', background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))' }}>
        <div style={{ width: '46px', height: '46px', borderRadius: '14px', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Zap size={22} />
        </div>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-primary-text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Schnellstart</div>
          {server ? (
            <>
              <div style={{ fontSize: '17px', fontWeight: 800 }}>{server.name}</div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                {server.lastPlayedAt ? `Zuletzt gespielt am ${formatDate(server.lastPlayedAt)}` : 'Noch nicht gespielt'} · {server.address}
              </div>
            </>
          ) : (
            <div style={{ fontSize: '13.5px', color: 'var(--text-muted)' }}>Noch kein Server. Lege im Reiter Server einen an oder importiere die Datei eines Freundes.</div>
          )}
        </div>
        {server && (
          <button type="button" className="btn-primary" onClick={() => onQuickStart(server.id)} disabled={gameBusy}>
            <Play size={16} fill="currentColor" />
            <span>Server starten</span>
          </button>
        )}
      </div>

      {/* Eigene Instanzen */}
      {instances.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '44px 28px' }}>
          <Box size={34} style={{ color: 'var(--color-primary)', opacity: 0.7, marginBottom: '12px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Noch keine eigene Instanz</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, maxWidth: '480px', margin: '0 auto 20px' }}>
            Eine Instanz ist eine eigene Minecraft-Installation mit eigenen Mods. Lege sie selbst an oder installiere ein fertiges Modpack von Modrinth.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => setView('modpacks')}><Package size={16} /><span>Modpack von Modrinth</span></button>
            <button type="button" className="btn-primary" onClick={openCreate}><Plus size={16} /><span>Instanz erstellen</span></button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {instances.map(instance => (
            <div key={instance.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '18px' }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                {instance.modpack?.iconUrl
                  ? <img src={instance.modpack.iconUrl} alt="" style={{ width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0 }} />
                  : <div style={{ width: '52px', height: '52px', borderRadius: '14px', background: 'var(--bg-well)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Box size={24} /></div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, overflowWrap: 'anywhere' }}>{instance.name}</div>
                  <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                    Minecraft {instance.gameVersion} · {instance.loader === 'fabric' ? 'Fabric' : 'Vanilla'}{instance.ramMax ? ` · ${instance.ramMax} GB` : ''}
                  </div>
                  {instance.modpack && (
                    <div style={{ fontSize: '12px', color: 'var(--color-primary-text)', marginTop: '2px' }}>
                      Modpack: {instance.modpack.title} {instance.modpack.versionNumber}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {instance.lastPlayedAt ? `Zuletzt gespielt am ${formatDate(instance.lastPlayedAt)}` : 'Noch nicht gespielt'}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: 'auto' }}>
                <button type="button" className="btn-primary" onClick={() => play(instance)} disabled={gameBusy} style={{ flex: '1 1 120px', padding: '9px 16px', fontSize: '13px' }}>
                  <Play size={14} fill="currentColor" />
                  <span>Spielen</span>
                </button>
                <button type="button" className="btn-secondary" title="Mods dieser Instanz" onClick={() => onOpenMods(instance.id)} style={{ padding: '9px 12px' }}>
                  <Package size={15} />
                </button>
                <button type="button" className="btn-secondary" title="Bearbeiten" onClick={() => openEdit(instance)} style={{ padding: '9px 12px' }}>
                  <Pencil size={15} />
                </button>
                <button type="button" className="btn-secondary" title="Ordner öffnen" onClick={() => hasApp && window.electronAPI.openInstanceFolder(instance.id)} style={{ padding: '9px 12px' }}>
                  <FolderOpen size={15} />
                </button>
                <button type="button" className="btn-secondary" title="Entfernen" onClick={() => setDialog({ type: 'remove', instance, deleteFiles: false })} style={{ padding: '9px 12px', color: '#ef4444' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Instanz erstellen oder bearbeiten */}
      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <Dialog title={dialog.type === 'create' ? 'Instanz erstellen' : 'Instanz bearbeiten'} icon={Box} onClose={() => setDialog(null)} busy={busy}>
          <InstanceFields values={values} setValues={setValues} versions={versions} loadingVersions={loadingVersions} />
          {dialog.type === 'edit' && dialog.instance.modpack && (
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '12px 0 0' }}>
              Diese Instanz stammt aus einem Modpack. Eine andere Minecraft-Version passt meist nicht zu seinen Mods.
            </p>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={() => setDialog(null)} disabled={busy}>Abbrechen</button>
            <button type="button" className="btn-primary" onClick={submit} disabled={busy || !valid}>
              <Check size={16} />
              <span>{dialog.type === 'create' ? 'Erstellen' : 'Speichern'}</span>
            </button>
          </div>
        </Dialog>
      )}

      {/* Instanz entfernen */}
      {dialog?.type === 'remove' && (
        <Dialog title="Instanz entfernen?" icon={Trash2} onClose={() => setDialog(null)} busy={busy}>
          <p style={{ fontSize: '14px', lineHeight: 1.6, margin: '0 0 14px' }}>
            <strong>{dialog.instance.name}</strong> wird aus der Liste entfernt.
          </p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13.5px', cursor: 'pointer', lineHeight: 1.5 }}>
            <input type="checkbox" checked={dialog.deleteFiles} onChange={(e) => setDialog(prev => ({ ...prev, deleteFiles: e.target.checked }))} style={{ marginTop: '3px' }} />
            <span>Auch den Ordner mit Mods, Einstellungen und Welten löschen. Das kann nicht rückgängig gemacht werden.</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={() => setDialog(null)} disabled={busy}>Abbrechen</button>
            <button type="button" className="btn-primary" onClick={submitRemove} disabled={busy} style={{ background: '#dc2626' }}>
              <Trash2 size={16} />
              <span>Entfernen</span>
            </button>
          </div>
        </Dialog>
      )}

    </div>
  );
}
