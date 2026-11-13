import React, { useState, useEffect, useMemo } from 'react';
import { FolderOpen, Trash2, ToggleLeft, ToggleRight, RefreshCw, Package, Sparkles, Palette, ShoppingBag, FolderArchive, Search, ArrowUpDown, Sliders, Box, Layers, Globe, ArrowUpCircle } from 'lucide-react';
import { appConfirm, appAlert } from '../utils/appDialog';
import ModrinthStoreView from './ModrinthStoreView';
import LocalConfigEditor from './LocalConfigEditor';
import Dropdown from './common/Dropdown';

const STORAGE_KEY_SORT = 'dp_launcher_installed_sort';

function getStoredSort() {
  try {
    return localStorage.getItem(STORAGE_KEY_SORT) || 'name-asc';
  } catch {
    return 'name-asc';
  }
}

const FILE_TABS = [
  { id: 'mods', label: 'Mods', icon: Box },
  { id: 'resourcepacks', label: 'Resourcepacks', icon: Layers },
  { id: 'shaderpacks', label: 'Shaderpacks', icon: Sparkles },
  { id: 'configs', label: 'Configs', icon: Sliders }
];

export default function ModsManagerView({ manifest, settings, initialInstanceId = null, initialTab = 'installed' }) {
  const servers = Array.isArray(settings?.servers) ? settings.servers : [];
  const instances = Array.isArray(settings?.instances) ? settings.instances : [];

  // Welche Instanz oder welchen Server diese Seite bearbeitet: "server:<id>" oder "instance:<id>"
  const [targetKey, setTargetKey] = useState(() => (
    initialInstanceId && instances.some(i => i.id === initialInstanceId)
      ? `instance:${initialInstanceId}`
      : `server:${settings?.activeServerId || ''}`
  ));
  const [targetReady, setTargetReady] = useState(!window.electronAPI);
  const targetInstance = targetKey.startsWith('instance:') ? instances.find(i => i.id === targetKey.slice(9)) : null;

  // Beim Verlassen der Seite wieder den aktiven Server bearbeiten, damit Abgleich und Start nicht verwechselt werden
  useEffect(() => () => { window.electronAPI?.setModsTarget?.(null); }, []);

  useEffect(() => {
    if (!window.electronAPI?.setModsTarget) return undefined;
    let cancelled = false;
    setTargetReady(false);
    (async () => {
      if (targetKey.startsWith('instance:')) {
        await window.electronAPI.setModsTarget({ kind: 'instance', id: targetKey.slice(9) });
      } else {
        await window.electronAPI.setModsTarget(null);
        const serverId = targetKey.slice(7);
        if (serverId && serverId !== settings?.activeServerId) await window.electronAPI.setActiveServer(serverId);
      }
      if (!cancelled) setTargetReady(true);
    })();
    return () => { cancelled = true; };
  }, [targetKey]);

  // Gelöschte Instanz: zurück zum aktiven Server
  useEffect(() => {
    if (targetKey.startsWith('instance:') && !targetInstance) setTargetKey(`server:${settings?.activeServerId || ''}`);
  }, [targetInstance, targetKey, settings?.activeServerId]);

  // Für den Store: eine Instanz hat keine Modliste, nur Version und Loader
  const storeManifest = targetInstance
    ? { gameVersion: targetInstance.gameVersion, loader: targetInstance.loader === 'vanilla' ? 'fabric' : targetInstance.loader, mods: [], serverName: targetInstance.name }
    : manifest;
  const [mainTab, setMainTab] = useState(initialTab); // 'installed' | 'store'
  const [category, setCategory] = useState('mods'); // 'mods' | 'shaderpacks' | 'resourcepacks' | 'configs'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updates, setUpdates] = useState({}); // filename -> { currentVersion, latestVersion, latestVersionId }
  const [updatingFile, setUpdatingFile] = useState(null);
  const [onlyUpdates, setOnlyUpdates] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState(getStoredSort); // 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'disabled'

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    try {
      localStorage.setItem(STORAGE_KEY_SORT, newSort);
    } catch {}
  };

  const loadItems = async (cat = category) => {
    if (cat === 'configs') return;
    setLoading(true);
    if (window.electronAPI) {
      try {
        const list = await window.electronAPI.getInstalledItems(cat);
        setItems(list || []);
      } catch (err) {
        console.error('Fehler beim Laden installierter Dateien:', err);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    if (targetReady && mainTab === 'installed' && category !== 'configs') {
      loadItems(category);
    }
  }, [category, mainTab, targetReady, targetKey]);

  // Nach Updates suchen, sobald die Liste da ist (Datei-Hash bei Modrinth nachschlagen)
  useEffect(() => {
    setUpdates({});
    if (mainTab !== 'installed' || category === 'configs' || items.length === 0 || !window.electronAPI?.checkItemUpdates) return undefined;
    let cancelled = false;
    window.electronAPI.checkItemUpdates({ category, gameVersion: storeManifest?.gameVersion || '', loader: storeManifest?.loader || '' })
      .then(res => { if (!cancelled && res?.success) setUpdates(res.updates || {}); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [items, category, mainTab]);

  const handleToggle = async (filename) => {
    if (window.electronAPI) {
      const res = await window.electronAPI.toggleMod(filename);
      if (res.success) {
        loadItems(category);
      }
    }
  };

  const handleUpdate = async (filename) => {
    const info = updates[filename];
    if (!info || !window.electronAPI?.applyItemUpdate) return;
    setUpdatingFile(filename);
    try {
      const res = await window.electronAPI.applyItemUpdate({ category, filename, versionId: info.latestVersionId });
      if (res?.success) loadItems(category);
      else appAlert(res?.error || 'Das Update ist fehlgeschlagen.', { warning: true });
    } finally {
      setUpdatingFile(null);
    }
  };

  const handleDelete = async (filename) => {
    const sure = await appConfirm(`Möchtest du "${filename}" wirklich löschen?`, {
      title: 'Datei löschen?',
      confirmLabel: 'Löschen',
      cancelLabel: 'Abbrechen',
      danger: true
    });
    if (!sure) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.deleteItem(category, filename);
      if (res.success) {
        loadItems(category);
      } else if (res.error) {
        appAlert(res.error, { warning: true });
      }
    }
  };

  const handleOpenFolder = () => {
    if (window.electronAPI) {
      window.electronAPI.openGameDir(category === 'configs' ? 'config' : category);
    }
  };

  // Klick auf eine installierte Datei: über den Datei-Hash das Modrinth-Projekt finden und die Detailseite öffnen
  const [openingFile, setOpeningFile] = useState(null);
  const [openRequest, setOpenRequest] = useState(null);

  const handleOpenDetail = async (item) => {
    if (!window.electronAPI?.resolveInstalledProject || openingFile || item.isDirectory) return;
    setOpeningFile(item.filename);
    try {
      const res = await window.electronAPI.resolveInstalledProject(category, item.filename);
      if (res?.success && res.projectId) {
        setOpenRequest({ ref: res.projectId, ts: Date.now() });
        setMainTab('store');
      } else {
        appAlert(res?.error || 'Die Modrinth-Seite konnte nicht gefunden werden.', { warning: true });
      }
    } finally {
      setOpeningFile(null);
    }
  };

  const handleSelectCategory = (id) => {
    setCategory(id);
    setStatusFilter('all');
    setSearchQuery('');
  };

  const categoryLabel = category === 'shaderpacks' ? 'Shaderpacks' : category === 'resourcepacks' ? 'Resourcepacks' : 'Mods';
  const disabledCount = items.filter(item => !item.enabled).length;
  const activeCount = items.length - disabledCount;

  const filteredAndSortedItems = useMemo(() => {
    let list = items;
    if (onlyUpdates) list = list.filter(item => updates[item.filename]);
    if (category === 'mods' && statusFilter !== 'all') {
      list = list.filter(item => (statusFilter === 'active' ? item.enabled : !item.enabled));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item =>
        (item.name || '').toLowerCase().includes(q) ||
        (item.filename || '').toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'name-asc') {
        const nameA = a.name || a.filename;
        const nameB = b.name || b.filename;
        return nameA.localeCompare(nameB, 'de', { sensitivity: 'base' });
      }
      if (sortBy === 'name-desc') {
        const nameA = a.name || a.filename;
        const nameB = b.name || b.filename;
        return nameB.localeCompare(nameA, 'de', { sensitivity: 'base' });
      }
      if (sortBy === 'date-desc') {
        return (b.modified || 0) - (a.modified || 0);
      }
      if (sortBy === 'date-asc') {
        return (a.modified || 0) - (b.modified || 0);
      }
      return 0;
    });
  }, [items, searchQuery, sortBy, statusFilter, category, onlyUpdates, updates]);

  const updateCount = Object.keys(updates).length;
  useEffect(() => { if (updateCount === 0) setOnlyUpdates(false); }, [updateCount]);

  const statusFilters = [
    { id: 'all', label: `Alle (${items.length})`, color: 'var(--color-primary-text)' },
    { id: 'active', label: `Aktiv (${activeCount})`, color: '#059669' },
    { id: 'disabled', label: `Deaktiviert (${disabledCount})`, color: '#ef4444' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, padding: 0, boxSizing: 'border-box', overflow: 'hidden' }}>
      {/* 1. KOPFBEREICH MIT TITEL & HAUPT-UMSCHALTER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', flexShrink: 0, marginBottom: '10px' }}>
        <div>
          <h1 className="app-page-title">
            Mods & Addons
          </h1>
          <p className="app-page-subtitle">
            Verwalte deine installierten Dateien oder entdecke neue Mods, Shader und Resourcepacks auf Modrinth.
          </p>
          {(servers.length > 0 || instances.length > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <Globe size={14} /> Bearbeiten für:
              </span>
              <Dropdown value={targetKey} onChange={(e) => setTargetKey(e.target.value)} aria-label="Instanz oder Server wählen" style={{ minWidth: '240px', height: '34px', fontSize: '12.5px' }}>
                {servers.length > 0 && (
                  <optgroup label="Server">
                    {servers.map(server => <option key={server.id} value={`server:${server.id}`}>{server.name}</option>)}
                  </optgroup>
                )}
                {instances.length > 0 && (
                  <optgroup label="Instanzen">
                    {instances.map(instance => <option key={instance.id} value={`instance:${instance.id}`}>{instance.name}</option>)}
                  </optgroup>
                )}
              </Dropdown>
            </div>
          )}
        </div>

        {/* Hauptreiter: Installiert vs. Modrinth Store */}
        <div className="segmented-control">
          <button
            type="button"
            onClick={() => setMainTab('installed')}
            className={`segmented-control-btn ${mainTab === 'installed' ? 'active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <FolderArchive size={15} />
            <span>Installierte Dateien</span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab('store')}
            className={`segmented-control-btn ${mainTab === 'store' ? 'active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <ShoppingBag size={15} />
            <span>Modrinth Store</span>
          </button>
        </div>
      </div>

      {/* 2. INHALT JE NACH REITER */}
      {mainTab === 'store' ? (
        <ModrinthStoreView key={targetKey} manifest={storeManifest} hideHeader={true} openRequest={openRequest} onReturnFromRequest={() => setMainTab('installed')} />
      ) : (
        <div className="glass-card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '16px 18px', overflow: 'hidden' }}>
          {/* Kategorie-Reiter im Stil der Entwurfsliste */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', borderBottom: '1px solid var(--border-card)', paddingBottom: '12px', flexShrink: 0 }}>
            {FILE_TABS.map(tab => {
              const TabIcon = tab.icon;
              const active = category === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleSelectCategory(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    padding: '7px 14px',
                    borderRadius: '9px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    background: active ? 'var(--color-primary)' : 'var(--bg-well)',
                    color: active ? '#ffffff' : 'var(--text-muted)',
                    fontWeight: active ? 700 : 500,
                    fontSize: '13px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <TabIcon size={15} />
                  <span>{tab.label}{active && tab.id !== 'configs' ? ` (${items.length})` : ''}</span>
                </button>
              );
            })}
          </div>

          {category === 'configs' ? (
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <LocalConfigEditor />
            </div>
          ) : (
            <>
              {/* Titel, Kurzinfo und Aktionen */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '14px', flexShrink: 0 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                      Installiert ({items.length} {categoryLabel})
                    </h2>
                    {category === 'mods' && disabledCount > 0 && (
                      <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600 }}>
                        {disabledCount} deaktiviert ({activeCount} aktiv)
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Lokaler Ordner deiner Minecraft-Instanz
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="btn-secondary" onClick={() => loadItems(category)} title="Aktualisieren" style={{ padding: '6px 12px', fontSize: '12.5px' }}>
                    <RefreshCw size={14} className={loading ? 'spin' : ''} />
                  </button>
                  <button className="btn-secondary" onClick={handleOpenFolder} style={{ padding: '6px 12px', fontSize: '12.5px', gap: '6px' }}>
                    <FolderOpen size={14} />
                    <span>Ordner öffnen</span>
                  </button>
                </div>
              </div>

              {/* Suche, Sortierung & Statusfilter */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    type="text"
                    placeholder={`${categoryLabel} durchsuchen...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ paddingLeft: '32px', width: '100%', height: '34px', fontSize: '12.5px' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ArrowUpDown size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <Dropdown
                    value={sortBy}
                    onChange={(e) => handleSortChange(e.target.value)}
                    style={{ minWidth: '185px', height: '34px', fontSize: '12.5px' }}
                  >
                    <option value="name-asc">Name (A → Z)</option>
                    <option value="name-desc">Name (Z → A)</option>
                    <option value="date-desc">Installationsdatum (Neueste)</option>
                    <option value="date-asc">Installationsdatum (Älteste)</option>
                  </Dropdown>
                </div>

                {updateCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setOnlyUpdates(v => !v)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 12px', fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer', borderRadius: '10px',
                      border: '1px solid ' + (onlyUpdates ? 'rgba(245, 158, 11, 0.6)' : 'var(--border-card)'),
                      background: onlyUpdates ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-well)',
                      color: onlyUpdates ? '#f59e0b' : 'var(--text-muted)', fontWeight: onlyUpdates ? 700 : 500
                    }}
                    title="Nur Einträge mit verfügbarem Update anzeigen"
                  >
                    <ArrowUpCircle size={14} />
                    Nur Updates ({updateCount})
                  </button>
                )}

                {category === 'mods' && disabledCount > 0 && (
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-well)', padding: '2px', borderRadius: '10px', border: '1px solid var(--border-card)' }}>
                    {statusFilters.map(f => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setStatusFilter(f.id)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11.5px',
                          borderRadius: '8px',
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          background: statusFilter === f.id ? 'var(--bg-card)' : 'transparent',
                          color: statusFilter === f.id ? f.color : 'var(--text-muted)',
                          fontWeight: statusFilter === f.id ? 700 : 500,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Dateiliste */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px', paddingBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
                    In diesem Ordner befinden sich derzeit noch keine Dateien.
                  </div>
                ) : filteredAndSortedItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)', fontSize: '14px' }}>
                    Keine Dateien gefunden, die zum Filter passen.
                  </div>
                ) : filteredAndSortedItems.map(item => {
                  const sizeMb = (item.size / (1024 * 1024)).toFixed(2);
                  const FallbackIcon = category === 'shaderpacks' ? Sparkles : (category === 'resourcepacks' ? Palette : Package);
                  const isDisabled = !item.enabled;
                  const dateText = item.modified
                    ? new Date(item.modified).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '';

                  return (
                    <div
                      key={item.filename}
                      title={item.description || item.filename}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        padding: '10px 16px',
                        background: isDisabled ? 'var(--bg-card)' : 'var(--bg-well)',
                        border: '1px solid',
                        borderColor: isDisabled ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-card)',
                        borderRadius: '12px',
                        opacity: isDisabled ? 0.65 : 1,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {category === 'mods' && (
                        <button
                          type="button"
                          onClick={() => handleToggle(item.filename)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, margin: 0, display: 'flex', alignItems: 'center', flexShrink: 0, color: isDisabled ? 'var(--text-muted)' : 'var(--color-primary)' }}
                          title={isDisabled ? 'Mod aktivieren' : 'Mod deaktivieren'}
                        >
                          {isDisabled ? <ToggleLeft size={26} /> : <ToggleRight size={26} />}
                        </button>
                      )}

                      <div
                        className="mod-clickable-info"
                        onClick={() => handleOpenDetail(item)}
                        title={item.isDirectory ? undefined : 'Modrinth-Detailseite öffnen'}
                        style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: 0, cursor: item.isDirectory ? 'default' : (openingFile ? 'progress' : 'pointer') }}
                      >
                      {item.icon ? (
                        <img
                          src={item.icon}
                          alt=""
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            objectFit: 'contain',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-card)',
                            flexShrink: 0,
                            filter: isDisabled ? 'grayscale(100%)' : 'none',
                            opacity: isDisabled ? 0.7 : 1
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            background: isDisabled ? 'var(--bg-card)' : 'var(--color-primary-soft)',
                            color: isDisabled ? 'var(--text-muted)' : 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid var(--border-card)',
                            flexShrink: 0
                          }}
                        >
                          <FallbackIcon size={19} />
                        </div>
                      )}

                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            className="mod-link-title"
                            style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              textDecoration: isDisabled ? 'line-through' : 'none',
                              color: isDisabled ? 'var(--text-muted)' : 'var(--text-main)'
                            }}
                          >
                            {item.name || item.filename}
                          </span>
                          {isDisabled && (
                            <span className="badge" style={{ color: '#94a3b8', fontSize: '11px', padding: '1px 8px' }}>deaktiviert</span>
                          )}
                          {updates[item.filename] && (
                            <span
                              className="badge"
                              style={{ color: '#f59e0b', fontSize: '11px', padding: '1px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title={`Neue Version verfügbar: ${updates[item.filename].currentVersion || 'installiert'} → ${updates[item.filename].latestVersion}`}
                            >
                              <ArrowUpCircle size={11} />
                              Update {updates[item.filename].latestVersion}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.version ? `${item.version} · ` : ''}{item.name ? `${item.filename} · ` : ''}{sizeMb} MB{dateText ? ` · ${dateText}` : ''}
                        </div>
                      </div>
                      </div>

                      {updates[item.filename] && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '6px 10px', color: '#f59e0b' }}
                          disabled={Boolean(updatingFile)}
                          onClick={() => handleUpdate(item.filename)}
                          title={`Auf ${updates[item.filename].latestVersion} aktualisieren`}
                        >
                          {updatingFile === item.filename ? <RefreshCw size={13} className="spin" /> : <ArrowUpCircle size={13} />}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ padding: '6px 10px', color: '#dc2626' }}
                        onClick={() => handleDelete(item.filename)}
                        title="Datei löschen"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
