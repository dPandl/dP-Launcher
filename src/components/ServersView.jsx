import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Globe, Plus, FileDown, FileUp, Pencil, FolderOpen, Trash2, Check, X, Share2, FileText, ChevronDown } from 'lucide-react';
import { appAlert } from '../utils/appDialog';
import { getServers, getActiveServer } from '../utils/serverAddress';
import Dropdown from './common/Dropdown';
import PlayView from './PlayView';
import ServerChangelog from './ServerChangelog';

const labelStyle = { display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' };

function Dialog({ title, icon: Icon, onClose, children, busy }) {
  return createPortal(
    <div className="modal-overlay" onClick={(e) => { if (!busy && e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0 }}>{title}</h2>
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} aria-label="Schließen" style={{ padding: '6px', borderRadius: '999px', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

const EMPTY_FORM = { name: '', address: '', github: '', branch: 'main', chatPort: '' };

// Reiter Server: die Startseite des gewählten Servers, oben mit der Auswahl aller Server
export default function ServersView({ settings, isAdmin = false, onImportFile, playViewProps }) {
  const servers = getServers(settings);
  const activeServer = getActiveServer(settings);
  const hasApp = Boolean(window.electronAPI);

  const [form, setForm] = useState(null); // { mode: 'add' | 'edit', id?, values }
  const [exportFor, setExportFor] = useState(null); // { server, name }
  const [removeFor, setRemoveFor] = useState(null); // { server, deleteFiles }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [showChangelog, setShowChangelog] = useState(false);

  const showNotice = (text) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 4000);
  };

  const failed = (res) => {
    appAlert(res?.error || 'Das hat nicht geklappt.', { warning: true });
  };

  const handleSelect = async (id) => {
    if (!hasApp) return showNotice('Das geht nur in der App.');
    const res = await window.electronAPI.setActiveServer(id);
    if (!res?.success) failed(res);
  };

  const openAdd = () => setForm({ mode: 'add', values: { ...EMPTY_FORM } });

  const openEdit = (server) => setForm({
    mode: 'edit',
    id: server.id,
    values: {
      name: server.name,
      address: server.address,
      github: server.owner && server.repo ? `${server.owner}/${server.repo}` : '',
      branch: server.branch || 'main',
      chatPort: server.chatPort || ''
    }
  });

  const submitForm = async () => {
    if (!hasApp) return showNotice('Das geht nur in der App.');
    setBusy(true);
    try {
      const values = { ...form.values, chatPort: form.values.chatPort || null };
      const res = form.mode === 'add'
        ? await window.electronAPI.addServer(values)
        : await window.electronAPI.updateServer(form.id, values);
      if (!res?.success) {
        failed(res);
        return;
      }
      if (form.mode === 'add' && res.server && res.activeServerId !== res.server.id) {
        await window.electronAPI.setActiveServer(res.server.id);
      }
      setForm(null);
      showNotice(form.mode === 'add' ? 'Server hinzugefügt.' : 'Änderungen gespeichert.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!hasApp) return showNotice('Das geht nur in der App.');
    const res = await window.electronAPI.pickServerFile();
    if (res?.canceled) return;
    onImportFile?.(res.success ? { success: true, server: res.server, fileName: res.fileName } : { success: false, error: res.error });
  };

  const submitExport = async () => {
    if (!hasApp) return showNotice('Das geht nur in der App.');
    setBusy(true);
    try {
      const res = await window.electronAPI.exportServer(exportFor.server.id, exportFor.name);
      if (res?.canceled) return;
      if (!res?.success) {
        failed(res);
        return;
      }
      setExportFor(null);
      showNotice(`Gespeichert: ${res.filePath}`);
    } finally {
      setBusy(false);
    }
  };

  const submitRemove = async () => {
    if (!hasApp) return showNotice('Das geht nur in der App.');
    setBusy(true);
    try {
      const res = await window.electronAPI.removeServer(removeFor.server.id, removeFor.deleteFiles);
      if (!res?.success) {
        failed(res);
        return;
      }
      setRemoveFor(null);
      if (res.warning) appAlert(res.warning, { warning: true });
      else showNotice('Server entfernt.');
    } finally {
      setBusy(false);
    }
  };

  const setField = (key, value) => setForm(prev => ({ ...prev, values: { ...prev.values, [key]: value } }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Auswahl und Verwaltung der Server */}
      <div className="glass-card" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 16px' }}>
        <Globe size={20} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />

        {servers.length > 0 ? (
          <Dropdown
            value={activeServer?.id || ''}
            onChange={(e) => handleSelect(e.target.value)}
            aria-label="Server auswählen"
            style={{ minWidth: '260px', flex: '1 1 260px', maxWidth: '420px' }}
          >
            {servers.map(server => (
              <option key={server.id} value={server.id}>{server.name}</option>
            ))}
          </Dropdown>
        ) : (
          <span style={{ fontSize: '14px', color: 'var(--text-muted)', flex: '1 1 200px' }}>Noch kein Server</span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
          {activeServer && (
            <>
              <button type="button" className="btn-secondary" title="Als Datei teilen" onClick={() => setExportFor({ server: activeServer, name: activeServer.name })} style={{ padding: '8px 10px' }}>
                <Share2 size={15} />
              </button>
              <button type="button" className="btn-secondary" title="Server bearbeiten" onClick={() => openEdit(activeServer)} style={{ padding: '8px 10px' }}>
                <Pencil size={15} />
              </button>
              <button type="button" className="btn-secondary" title="Ordner öffnen" onClick={() => hasApp && window.electronAPI.openServerFolder(activeServer.id)} style={{ padding: '8px 10px' }}>
                <FolderOpen size={15} />
              </button>
              <button type="button" className="btn-secondary" title="Server entfernen" onClick={() => setRemoveFor({ server: activeServer, deleteFiles: false })} style={{ padding: '8px 10px', color: '#ef4444' }}>
                <Trash2 size={15} />
              </button>
            </>
          )}
          <button type="button" className="btn-secondary" onClick={handleImport} style={{ padding: '8px 14px', fontSize: '13px' }}>
            <FileUp size={15} />
            <span>Importieren</span>
          </button>
          <button type="button" className="btn-primary" onClick={openAdd} style={{ padding: '8px 16px', fontSize: '13px' }}>
            <Plus size={15} />
            <span>Server hinzufügen</span>
          </button>
        </div>
      </div>

      {notice && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '13.5px', fontWeight: 600, wordBreak: 'break-all' }}>
          <Check size={16} style={{ flexShrink: 0 }} />
          <span>{notice}</span>
        </div>
      )}

      {activeServer ? (
        <>
          <PlayView {...playViewProps} />

          {/* Changelog dieses Servers (Modpack-Versionen) */}
          <div className="glass-card" style={{ padding: '4px 20px' }}>
            <button
              type="button"
              onClick={() => setShowChangelog(prev => !prev)}
              aria-expanded={showChangelog}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%', padding: '14px 0', background: 'none', border: 0, color: 'var(--text-main)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
            >
              <FileText size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <span style={{ fontSize: '16px', fontWeight: 700, flex: 1 }}>Changelog von {activeServer.name}</span>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-primary-text)' }}>{showChangelog ? 'Ausblenden' : 'Anzeigen'}</span>
              <ChevronDown size={16} style={{ color: 'var(--text-muted)', transform: showChangelog ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
            </button>
            {showChangelog && (
              <div style={{ paddingBottom: '18px' }}>
                <ServerChangelog manifest={playViewProps.manifest} isAdmin={isAdmin} onRefreshManifest={playViewProps.onRefreshManifest} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="glass-card" style={{ textAlign: 'center', padding: '48px 28px' }}>
          <Globe size={34} style={{ color: 'var(--color-primary)', opacity: 0.7, marginBottom: '12px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>Noch kein Server</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, maxWidth: '460px', margin: '0 auto 20px' }}>
            Importiere die Datei (.dpmcserver), die du von einem Freund bekommen hast, oder lege einen Server selbst an.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={handleImport}><FileUp size={16} /><span>Serverdatei importieren</span></button>
            <button type="button" className="btn-primary" onClick={openAdd}><Plus size={16} /><span>Server hinzufügen</span></button>
          </div>
        </div>
      )}

      {/* Server anlegen oder bearbeiten */}
      {form && (
        <Dialog title={form.mode === 'add' ? 'Server hinzufügen' : 'Server bearbeiten'} icon={Globe} onClose={() => setForm(null)} busy={busy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={labelStyle}>Name (so heißt auch der Ordner des Servers)</label>
              <input type="text" value={form.values.name} onChange={(e) => setField('name', e.target.value)} maxLength={60} placeholder="z. B. Survival mit Freunden" style={{ width: '100%' }} />
            </div>
            <div>
              <label style={labelStyle}>Server-Adresse</label>
              <input type="text" value={form.values.address} onChange={(e) => setField('address', e.target.value)} placeholder="z. B. mc.beispiel.de:25565" style={{ width: '100%' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Modpack auf GitHub (optional)</label>
                <input type="text" value={form.values.github} onChange={(e) => setField('github', e.target.value)} placeholder="besitzer/repository" style={{ width: '100%' }} />
              </div>
              <div>
                <label style={labelStyle}>Branch</label>
                <input type="text" value={form.values.branch} onChange={(e) => setField('branch', e.target.value)} style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Chat-Port (optional)</label>
              <input type="text" inputMode="numeric" value={form.values.chatPort} onChange={(e) => setField('chatPort', e.target.value)} placeholder="Standard: 8899" style={{ width: '100%' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={() => setForm(null)} disabled={busy}>Abbrechen</button>
            <button type="button" className="btn-primary" onClick={submitForm} disabled={busy || !form.values.name.trim() || !form.values.address.trim()}>
              <Check size={16} />
              <span>{form.mode === 'add' ? 'Hinzufügen' : 'Speichern'}</span>
            </button>
          </div>
        </Dialog>
      )}

      {/* Serverdatei erstellen */}
      {exportFor && (
        <Dialog title="Als Datei teilen" icon={FileDown} onClose={() => setExportFor(null)} busy={busy}>
          <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 14px' }}>
            Die Datei enthält die Server-Adresse und das Modpack auf GitHub, aber keine Zugangsdaten. Wer sie importiert, hat den Server sofort im Launcher.
          </p>
          <label style={labelStyle}>Name in der Datei</label>
          <input type="text" value={exportFor.name} onChange={(e) => setExportFor(prev => ({ ...prev, name: e.target.value }))} maxLength={60} style={{ width: '100%' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={() => setExportFor(null)} disabled={busy}>Abbrechen</button>
            <button type="button" className="btn-primary" onClick={submitExport} disabled={busy || !exportFor.name.trim()}>
              <FileDown size={16} />
              <span>Datei speichern</span>
            </button>
          </div>
        </Dialog>
      )}

      {/* Server entfernen */}
      {removeFor && (
        <Dialog title="Server entfernen?" icon={Trash2} onClose={() => setRemoveFor(null)} busy={busy}>
          <p style={{ fontSize: '14px', lineHeight: 1.6, margin: '0 0 14px' }}>
            <strong>{removeFor.server.name}</strong> wird aus der Liste entfernt.
          </p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13.5px', cursor: 'pointer', lineHeight: 1.5 }}>
            <input type="checkbox" checked={removeFor.deleteFiles} onChange={(e) => setRemoveFor(prev => ({ ...prev, deleteFiles: e.target.checked }))} style={{ marginTop: '3px' }} />
            <span>Auch den Ordner mit Mods, Einstellungen und Welten löschen. Das kann nicht rückgängig gemacht werden.</span>
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
            <button type="button" className="btn-secondary" onClick={() => setRemoveFor(null)} disabled={busy}>Abbrechen</button>
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
