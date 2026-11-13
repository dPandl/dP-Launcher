import React, { useState, useEffect, useMemo } from 'react';
import { Trash2, RefreshCw, ArrowUpCircle, RotateCcw, AlertCircle, ToggleLeft, ToggleRight, Search, ArrowUpDown, Copy, Check, Sparkles, Layers, Box, Star, Sliders } from 'lucide-react';
import {
  removeModFromDraft,
  updateModInDraft,
  toggleModInDraft,
  setModSide,
  diffManifests,
  removeResourcepackFromDraft,
  toggleResourcepackActive,
  removeShaderpackFromDraft,
  toggleShaderpackActive,
  setDefaultShaderpack,
  findDraftUpdates,
  updatePackInDraft
} from '../../services/modpackService';
import { ModrinthService } from '../../services/modrinthService';
import { ProjectIcon } from '../modrinth/modrinthUi';
import Dropdown from '../common/Dropdown';
import { appAlert } from '../../utils/appDialog';
import LocalConfigEditor from '../LocalConfigEditor';
import ConfigSyncCard from './ConfigSyncCard';

const SIDE_OPTIONS = [
  { id: 'both', label: 'Beide' },
  { id: 'client', label: 'Client' },
  { id: 'server', label: 'Server' }
];

function StatusBadge({ color, title, children }) {
  return (
    <span
      className="badge"
      title={title}
      style={{
        background: `${color}26`,
        color,
        border: `1px solid ${color}4d`,
        fontSize: '11px',
        padding: '2px 8px',
        cursor: title ? 'help' : 'default'
      }}
    >
      {children}
    </span>
  );
}

const STORAGE_KEY_SORT = 'dp_launcher_draft_sort';

function getStoredSort() {
  try {
    return localStorage.getItem(STORAGE_KEY_SORT) || 'name-asc';
  } catch {
    return 'name-asc';
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(0)} KB`;
}

export default function ModpackEditor({ draft, published, warnings, onDraftChange, onWarnings, onResetDraft, onOpenProject }) {
  const [activeTab, setActiveTab] = useState('mods'); // 'mods' | 'resourcepacks' | 'shaderpacks' | 'configs'
  const [busyKey, setBusyKey] = useState(null);
  const [iconMap, setIconMap] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'disabled'
  const [sortBy, setSortBy] = useState(getStoredSort); // 'name-asc' | 'name-desc' | 'date-desc' | 'date-asc'
  const [copiedList, setCopiedList] = useState(false);
  const [availableUpdates, setAvailableUpdates] = useState({}); // 'mods:slug' -> { versionId, versionNumber }
  const [onlyUpdates, setOnlyUpdates] = useState(false);
  const updateCount = Object.keys(availableUpdates).length;
  const countFor = (kind) => Object.keys(availableUpdates).filter(key => key.startsWith(`${kind}:`)).length;
  useEffect(() => { if (updateCount === 0) setOnlyUpdates(false); }, [updateCount]);

  const resourcepacks = draft?.resourcepacks || [];
  const shaderpacks = draft?.shaderpacks || [];

  const handleCopyModList = () => {
    if (!draft?.mods?.length) return;
    const lines = [
      `Minecraft Modliste (${draft.mods.length} Mods) - Version ${draft.gameVersion || '26.3'} (${draft.loader || 'Fabric'}):`,
      ''
    ];

    const sorted = [...draft.mods].sort((a, b) => (a.name || a.slug).localeCompare(b.name || b.slug, 'de', { sensitivity: 'base' }));

    sorted.forEach(m => {
      const parts = [`• ${m.name || m.slug}`];
      if (m.versionNumber) parts.push(`v${m.versionNumber}`);
      if (m.side) parts.push(`[${m.side.toUpperCase()}]`);
      if (m.disabled) parts.push('[DEAKTIVIERT]');
      lines.push(parts.join(' '));
    });

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedList(true);
    setTimeout(() => setCopiedList(false), 2000);
  };

  const handleSortChange = (newSort) => {
    setSortBy(newSort);
    try {
      localStorage.setItem(STORAGE_KEY_SORT, newSort);
    } catch {}
  };

  const diff = diffManifests(published, draft);
  const addedSlugs = new Set(diff.added.map(m => m.slug));
  const changedSlugs = new Set(diff.changed.map(m => m.slug));

  const totalMods = draft?.mods?.length || 0;
  const disabledCount = (draft?.mods || []).filter(m => m.disabled).length;
  const activeCount = totalMods - disabledCount;

  // Ermittelt für jede Mod, von welchen anderen Mods sie als Abhängigkeit benötigt wird
  const dependencyParentMap = useMemo(() => {
    const map = new Map();
    (draft?.mods || []).forEach(parentMod => {
      (parentMod.dependencies || []).forEach(depId => {
        if (!map.has(depId)) map.set(depId, []);
        map.get(depId).push(parentMod.name || parentMod.slug);
      });
    });
    return map;
  }, [draft?.mods]);

  // Lädt fehlende Mod-Icons automatisch im Hintergrund von Modrinth nach
  useEffect(() => {
    if (!draft?.mods) return;
    const missing = draft.mods
      .filter(m => !m.iconUrl && !iconMap[m.slug] && !iconMap[m.projectId])
      .map(m => m.projectId || m.slug);

    if (missing.length === 0) return;

    let cancelled = false;
    ModrinthService.getProjects(missing)
      .then(projects => {
        if (cancelled || !Array.isArray(projects)) return;
        const updates = {};
        for (const p of projects) {
          if (p.icon_url) {
            if (p.slug) updates[p.slug] = p.icon_url;
            if (p.id) updates[p.id] = p.icon_url;
          }
        }
        setIconMap(prev => ({ ...prev, ...updates }));
      })
      .catch(() => { });

    return () => { cancelled = true; };
  }, [draft.mods]);

  // Sucht im Hintergrund, ob es zu den Einträgen im Entwurf neuere Versionen gibt
  const updateSignature = [draft?.gameVersion, draft?.loader, ...(draft?.mods || []).map(m => m.sha1), ...(draft?.resourcepacks || []).map(p => p.sha1), ...(draft?.shaderpacks || []).map(p => p.sha1)].join('|');
  useEffect(() => {
    if (!draft) return undefined;
    let cancelled = false;
    findDraftUpdates(draft)
      .then(found => { if (!cancelled) setAvailableUpdates(found); })
      .catch(() => { if (!cancelled) setAvailableUpdates({}); });
    return () => { cancelled = true; };
  }, [updateSignature]);

  const runChange = async (key, change) => {
    setBusyKey(key);
    try {
      const result = await change();
      if (result.draft !== draft) await onDraftChange(result.draft);
      onWarnings(result.warnings || []);
    } catch (err) {
      appAlert(err.message, { warning: true });
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggle = (mod) => runChange(`toggle:${mod.slug}`, async () => {
    return toggleModInDraft(draft, mod.slug);
  });

  const handleUpdate = (mod) => runChange(`update:${mod.slug}`, async () => {
    const result = await updateModInDraft(draft, mod.slug, { versionId: availableUpdates[`mods:${mod.slug}`]?.versionId });
    if (!result.updated) {
      return { draft, warnings: [`${mod.name} ist bereits auf der neuesten passenden Version.`] };
    }
    return result;
  });

  const handleUpdatePack = (kind, pack) => runChange(`update-pack:${kind}:${pack.slug}`, async () => ({
    draft: await updatePackInDraft(draft, kind, pack.slug, availableUpdates[`${kind}:${pack.slug}`].versionId)
  }));

  const handleToggleResourcepack = (pack) => runChange(`toggle-rp:${pack.slug}`, async () => ({
    draft: toggleResourcepackActive(draft, pack.projectId || pack.slug)
  }));

  const handleRemoveResourcepack = (pack) => runChange(`remove-rp:${pack.slug}`, async () => ({
    draft: removeResourcepackFromDraft(draft, pack.projectId || pack.slug)
  }));

  const handleToggleShaderpack = (pack) => runChange(`toggle-sp:${pack.slug}`, async () => ({
    draft: toggleShaderpackActive(draft, pack.projectId || pack.slug)
  }));

  const handleRemoveShaderpack = (pack) => runChange(`remove-sp:${pack.slug}`, async () => ({
    draft: removeShaderpackFromDraft(draft, pack.projectId || pack.slug)
  }));

  const handleSetDefaultShader = (pack) => runChange(`default-sp:${pack.slug}`, async () => ({
    draft: setDefaultShaderpack(draft, pack.filename)
  }));

  // Filterung und Sortierung der Mods
  const filteredAndSortedMods = useMemo(() => {
    const rawMods = (draft?.mods || []).map((mod, originalIndex) => ({
      ...mod,
      _originalIndex: originalIndex
    }));

    const filtered = rawMods.filter(mod => {
      if (onlyUpdates && !availableUpdates[`mods:${mod.slug}`]) return false;
      if (statusFilter === 'active' && mod.disabled) return false;
      if (statusFilter === 'disabled' && !mod.disabled) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = (mod.name || '').toLowerCase().includes(q);
        const slugMatch = (mod.slug || '').toLowerCase().includes(q);
        const filenameMatch = (mod.filename || '').toLowerCase().includes(q);
        return nameMatch || slugMatch || filenameMatch;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'name-asc') {
        return (a.name || a.slug).localeCompare(b.name || b.slug, 'de', { sensitivity: 'base' });
      }
      if (sortBy === 'name-desc') {
        return (b.name || b.slug).localeCompare(a.name || a.slug, 'de', { sensitivity: 'base' });
      }
      if (sortBy === 'date-desc') {
        const timeA = a.addedAt || a._originalIndex;
        const timeB = b.addedAt || b._originalIndex;
        return timeB - timeA;
      }
      if (sortBy === 'date-asc') {
        const timeA = a.addedAt || a._originalIndex;
        const timeB = b.addedAt || b._originalIndex;
        return timeA - timeB;
      }
      return 0;
    });
  }, [draft?.mods, statusFilter, searchQuery, sortBy, onlyUpdates, availableUpdates]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
      {/* Entwurfsliste als fester Container mit fixiertem Header & flüssigem internen Scrollen wie in Mods & Addons */}
      <div className="glass-card" style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', padding: '16px 18px', overflow: 'hidden' }}>
        
        {/* Haupt-Tabs: Mods, Ressourcenpakete, Shader */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', borderBottom: '1px solid var(--border-card)', paddingBottom: '12px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setActiveTab('mods')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 14px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'mods' ? 'var(--color-primary)' : 'var(--bg-well)',
              color: activeTab === 'mods' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: activeTab === 'mods' ? 700 : 500,
              fontSize: '13px',
              transition: 'all 0.15s ease'
            }}
          >
            <Box size={15} />
            <span>Mods ({totalMods})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('resourcepacks')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 14px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'resourcepacks' ? 'var(--color-primary)' : 'var(--bg-well)',
              color: activeTab === 'resourcepacks' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: activeTab === 'resourcepacks' ? 700 : 500,
              fontSize: '13px',
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={15} />
            <span>Ressourcenpakete ({resourcepacks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('shaderpacks')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 14px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'shaderpacks' ? 'var(--color-primary)' : 'var(--bg-well)',
              color: activeTab === 'shaderpacks' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: activeTab === 'shaderpacks' ? 700 : 500,
              fontSize: '13px',
              transition: 'all 0.15s ease'
            }}
          >
            <Sparkles size={15} />
            <span>Shader ({shaderpacks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('configs')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              padding: '7px 14px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              background: activeTab === 'configs' ? 'var(--color-primary)' : 'var(--bg-well)',
              color: activeTab === 'configs' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: activeTab === 'configs' ? 700 : 500,
              fontSize: '13px',
              transition: 'all 0.15s ease'
            }}
          >
            <Sliders size={15} />
            <span>Configs</span>
          </button>
        </div>

        {/* Tab 1: Mods */}
        {activeTab === 'mods' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexShrink: 0 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                    Entwurf ({totalMods} Mods)
                  </h2>
                  {disabledCount > 0 && (
                    <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', fontWeight: 600 }}>
                      {disabledCount} deaktiviert ({activeCount} aktiv)
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Veröffentlicht: v{published?.modpackVersion || '0.0.0'} · Entwurf: {diff.total} {diff.total === 1 ? 'Änderung' : 'Änderungen'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleCopyModList}
                  title="Komplette Modliste für KI oder Notizen in die Zwischenablage kopieren"
                  style={{ padding: '6px 12px', fontSize: '12.5px', gap: '6px' }}
                >
                  {copiedList ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                  <span>{copiedList ? 'Kopiert!' : 'Modliste kopieren'}</span>
                </button>
                <button className="btn-secondary" onClick={onResetDraft} disabled={Boolean(busyKey)} title="Entwurf durch die veröffentlichte Liste ersetzen" style={{ padding: '6px 12px', fontSize: '12.5px' }}>
                  <RotateCcw size={14} /> Zurücksetzen
                </button>
              </div>
            </div>

            {/* Suchfeld, Sortierung & Filterleiste */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px', flexShrink: 0, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Mods im Entwurf suchen (z. B. nach Crash-Verdächtigen)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ paddingLeft: '32px', width: '100%', height: '34px', fontSize: '12.5px' }}
                />
              </div>

              {/* Sortierung: A-Z und Installationsdatum */}
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

              {disabledCount > 0 && (
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-well)', padding: '2px', borderRadius: '10px', border: '1px solid var(--border-card)' }}>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      background: statusFilter === 'all' ? 'var(--bg-card)' : 'transparent',
                      color: statusFilter === 'all' ? 'var(--color-primary-text)' : 'var(--text-muted)',
                      fontWeight: statusFilter === 'all' ? 700 : 500,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Alle ({totalMods})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('active')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      background: statusFilter === 'active' ? 'var(--bg-card)' : 'transparent',
                      color: statusFilter === 'active' ? '#059669' : 'var(--text-muted)',
                      fontWeight: statusFilter === 'active' ? 700 : 500,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Aktiv ({activeCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('disabled')}
                    style={{
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      background: statusFilter === 'disabled' ? 'var(--bg-card)' : 'transparent',
                      color: statusFilter === 'disabled' ? '#ef4444' : 'var(--text-muted)',
                      fontWeight: statusFilter === 'disabled' ? 700 : 500,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Deaktiviert ({disabledCount})
                  </button>
                </div>
              )}
              {countFor('mods') > 0 && (
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
                  Nur Updates ({countFor('mods')})
                </button>
              )}
            </div>

            {warnings.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', padding: '10px 14px', marginBottom: '12px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', color: '#fbbf24', fontSize: '12.5px', flexShrink: 0 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px', color: '#fbbf24' }} />
                <div>{warnings.map((warning, i) => <div key={i}>{warning}</div>)}</div>
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px', paddingBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {filteredAndSortedMods.map(mod => {
                const iconUrl = mod.iconUrl || iconMap[mod.slug] || iconMap[mod.projectId];
                const isDisabled = Boolean(mod.disabled);
                const requiredBy = dependencyParentMap.get(mod.projectId) || dependencyParentMap.get(mod.slug) || [];

                return (
                  <div
                    key={mod.slug}
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
                    <button
                      type="button"
                      onClick={() => handleToggle(mod)}
                      disabled={Boolean(busyKey)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        margin: 0,
                        color: isDisabled ? 'var(--text-muted)' : 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'all 0.15s ease',
                        flexShrink: 0
                      }}
                      title={isDisabled ? 'Mod aktivieren' : 'Mod deaktivieren (wird beim Testen und Starten übersprungen)'}
                    >
                      {isDisabled ? <ToggleLeft size={26} /> : <ToggleRight size={26} />}
                    </button>

                    <div
                      className="mod-clickable-info"
                      onClick={() => onOpenProject(mod.slug)}
                      title="Detailseite öffnen"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flex: 1,
                        minWidth: 0,
                        cursor: 'pointer'
                      }}
                    >
                      <ProjectIcon
                        url={iconUrl}
                        size={38}
                        style={{
                          filter: isDisabled ? 'grayscale(100%)' : 'none',
                          opacity: isDisabled ? 0.7 : 1,
                          flexShrink: 0
                        }}
                      />

                      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            className="mod-link-title"
                            style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              textDecoration: isDisabled ? 'line-through' : 'none',
                              color: isDisabled ? 'var(--text-muted)' : 'var(--text-main)',
                              transition: 'color 0.15s ease'
                            }}
                          >
                            {mod.name}
                          </span>
                          {isDisabled && <StatusBadge color="#94a3b8">deaktiviert</StatusBadge>}
                          {availableUpdates[`mods:${mod.slug}`] && <StatusBadge color="#f59e0b" title={`Neue Version verfügbar: ${mod.versionNumber} → ${availableUpdates[`mods:${mod.slug}`].versionNumber}`}>Update {availableUpdates[`mods:${mod.slug}`].versionNumber}</StatusBadge>}
                          {addedSlugs.has(mod.slug) && <StatusBadge color="#059669">neu</StatusBadge>}
                          {changedSlugs.has(mod.slug) && <StatusBadge color="var(--color-primary)">geändert</StatusBadge>}
                          {mod.autoDependency && (
                            <StatusBadge
                              color="#7c3aed"
                              title={requiredBy.length > 0 ? `Wird benötigt von: ${requiredBy.join(', ')}` : 'Automatisch als Abhängigkeit hinzugefügt'}
                            >
                              {requiredBy.length === 1 ? `Abhängigkeit von ${requiredBy[0]}` : requiredBy.length > 1 ? `Abhängigkeit (${requiredBy.join(', ')})` : 'Abhängigkeit'}
                            </StatusBadge>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {mod.versionNumber} {isDisabled ? '• beim Spielstart übersprungen' : ''}
                        </div>
                      </div>
                    </div>

                    <Dropdown
                      value={mod.side || 'both'}
                      onChange={(e) => runChange(`side:${mod.slug}`, async () => ({ draft: setModSide(draft, mod.slug, e.target.value) }))}
                      disabled={Boolean(busyKey)}
                      style={{ minWidth: '95px' }}
                    >
                      {SIDE_OPTIONS.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </Dropdown>

                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px', color: availableUpdates[`mods:${mod.slug}`] ? '#f59e0b' : undefined }}
                      disabled={Boolean(busyKey)}
                      onClick={() => handleUpdate(mod)}
                      title={availableUpdates[`mods:${mod.slug}`] ? `Auf ${availableUpdates[`mods:${mod.slug}`].versionNumber} aktualisieren` : 'Auf die neueste passende Version heben'}
                    >
                      {busyKey === `update:${mod.slug}` ? <RefreshCw size={13} className="spin" /> : <ArrowUpCircle size={13} />}
                    </button>
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px', color: '#dc2626' }}
                      disabled={Boolean(busyKey)}
                      onClick={() => runChange(`remove:${mod.slug}`, async () => removeModFromDraft(draft, mod.slug))}
                      title="Aus dem Entwurf entfernen"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}

              {filteredAndSortedMods.length === 0 && draft.mods.length > 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Keine Mods gefunden, die zum Filter passen.
                </div>
              )}

              {diff.removed.map(mod => {
                const iconUrl = mod.iconUrl || iconMap[mod.slug] || iconMap[mod.projectId];

                return (
                  <div key={mod.slug} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '12px', opacity: 0.85 }}>
                    <ProjectIcon url={iconUrl} size={28} />
                    <span style={{ fontSize: '14px', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{mod.name || mod.slug}</span>
                    <StatusBadge color="#dc2626">wird entfernt</StatusBadge>
                  </div>
                );
              })}

              {draft.mods.length === 0 && diff.removed.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Der Entwurf ist leer. Füge unter „Mods entdecken“ welche hinzu.
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 2: Ressourcenpakete */}
        {activeTab === 'resourcepacks' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  Ressourcenpakete ({resourcepacks.length})
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Werden automatisch in das resourcepacks/-Verzeichnis der Clients synchronisiert.
                </span>
              </div>
              {countFor('resourcepacks') > 0 && (
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
                  Nur Updates ({countFor('resourcepacks')})
                </button>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {resourcepacks.filter(pack => !onlyUpdates || availableUpdates[`resourcepacks:${pack.slug}`]).map(pack => {
                const isDisabled = Boolean(pack.disabled);
                const sizeLabel = formatBytes(pack.size);

                return (
                  <div
                    key={pack.filename || pack.slug}
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
                    <button
                      type="button"
                      onClick={() => handleToggleResourcepack(pack)}
                      disabled={Boolean(busyKey)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        margin: 0,
                        color: isDisabled ? 'var(--text-muted)' : 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0
                      }}
                      title={isDisabled ? 'Ressourcenpaket aktivieren' : 'Ressourcenpaket deaktivieren'}
                    >
                      {isDisabled ? <ToggleLeft size={26} /> : <ToggleRight size={26} />}
                    </button>

                    <div
                      className="mod-clickable-info"
                      onClick={() => onOpenProject(pack.slug)}
                      title="Detailseite öffnen"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flex: 1,
                        minWidth: 0,
                        cursor: 'pointer'
                      }}
                    >
                      <ProjectIcon
                        url={pack.iconUrl || iconMap[pack.slug] || iconMap[pack.projectId]}
                        size={38}
                        style={{
                          filter: isDisabled ? 'grayscale(100%)' : 'none',
                          opacity: isDisabled ? 0.7 : 1,
                          flexShrink: 0
                        }}
                      />

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
                            {pack.name || pack.slug}
                          </span>
                          {availableUpdates[`resourcepacks:${pack.slug}`] && <StatusBadge color="#f59e0b" title={`Neue Version verfügbar: ${pack.versionNumber || 'installiert'} → ${availableUpdates[`resourcepacks:${pack.slug}`].versionNumber}`}>Update {availableUpdates[`resourcepacks:${pack.slug}`].versionNumber}</StatusBadge>}
                          {isDisabled ? (
                            <StatusBadge color="#94a3b8">deaktiviert</StatusBadge>
                          ) : (
                            <StatusBadge color="#059669">aktiv</StatusBadge>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {pack.filename} {pack.versionNumber ? `• v${pack.versionNumber}` : ''} {sizeLabel ? `• ${sizeLabel}` : ''}
                        </div>
                      </div>
                    </div>

                    {availableUpdates[`resourcepacks:${pack.slug}`] && (
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 10px', color: '#f59e0b' }}
                        disabled={Boolean(busyKey)}
                        onClick={() => handleUpdatePack('resourcepacks', pack)}
                        title={`Auf ${availableUpdates[`resourcepacks:${pack.slug}`].versionNumber} aktualisieren`}
                      >
                        {busyKey === `update-pack:resourcepacks:${pack.slug}` ? <RefreshCw size={13} className="spin" /> : <ArrowUpCircle size={13} />}
                      </button>
                    )}
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px', color: '#dc2626' }}
                      disabled={Boolean(busyKey)}
                      onClick={() => handleRemoveResourcepack(pack)}
                      title="Aus dem Entwurf entfernen"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}

              {resourcepacks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <Layers size={32} style={{ opacity: 0.35, marginBottom: '8px' }} />
                  <div>Noch keine Ressourcenpakete im Entwurf.</div>
                  <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.75 }}>
                    Wechsle zu <strong>Mods & Pakete entdecken</strong> und wähle den Filter <em>Ressourcenpaket</em>, um Textur- und Soundpakete hinzuzufügen.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Shader */}
        {activeTab === 'shaderpacks' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexShrink: 0 }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                  Shader ({shaderpacks.length})
                </h2>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  Shader werden auf die Clients heruntergeladen. Du kannst festlegen, welcher Shader standardmäßig aktiv sein soll.
                </span>
              </div>
              {countFor('shaderpacks') > 0 && (
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
                  Nur Updates ({countFor('shaderpacks')})
                </button>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {shaderpacks.filter(pack => !onlyUpdates || availableUpdates[`shaderpacks:${pack.slug}`]).map(pack => {
                const isDisabled = Boolean(pack.disabled);
                const isDefault = draft?.defaultShader === pack.filename;
                const sizeLabel = formatBytes(pack.size);

                return (
                  <div
                    key={pack.filename || pack.slug}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '10px 16px',
                      background: isDisabled ? 'var(--bg-card)' : isDefault ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-well)',
                      border: '1px solid',
                      borderColor: isDefault ? 'rgba(16, 185, 129, 0.4)' : isDisabled ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-card)',
                      borderRadius: '12px',
                      opacity: isDisabled ? 0.65 : 1,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleShaderpack(pack)}
                      disabled={Boolean(busyKey)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        margin: 0,
                        color: isDisabled ? 'var(--text-muted)' : 'var(--color-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0
                      }}
                      title={isDisabled ? 'Shader aktivieren' : 'Shader deaktivieren'}
                    >
                      {isDisabled ? <ToggleLeft size={26} /> : <ToggleRight size={26} />}
                    </button>

                    <div
                      className="mod-clickable-info"
                      onClick={() => onOpenProject(pack.slug)}
                      title="Detailseite öffnen"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flex: 1,
                        minWidth: 0,
                        cursor: 'pointer'
                      }}
                    >
                      <ProjectIcon
                        url={pack.iconUrl || iconMap[pack.slug] || iconMap[pack.projectId]}
                        size={38}
                        style={{
                          filter: isDisabled ? 'grayscale(100%)' : 'none',
                          opacity: isDisabled ? 0.7 : 1,
                          flexShrink: 0
                        }}
                      />

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
                            {pack.name || pack.slug}
                          </span>
                          {availableUpdates[`shaderpacks:${pack.slug}`] && <StatusBadge color="#f59e0b" title={`Neue Version verfügbar: ${pack.versionNumber || 'installiert'} → ${availableUpdates[`shaderpacks:${pack.slug}`].versionNumber}`}>Update {availableUpdates[`shaderpacks:${pack.slug}`].versionNumber}</StatusBadge>}
                          {isDefault && (
                            <span
                              className="badge"
                              style={{
                                background: 'rgba(16, 185, 129, 0.2)',
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.4)',
                                fontSize: '11px',
                                padding: '2px 8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontWeight: 600
                              }}
                            >
                              <Star size={11} fill="currentColor" /> Standard-Shader
                            </span>
                          )}
                          {isDisabled && <StatusBadge color="#94a3b8">deaktiviert</StatusBadge>}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {pack.filename} {pack.versionNumber ? `• v${pack.versionNumber}` : ''} {sizeLabel ? `• ${sizeLabel}` : ''}
                        </div>
                      </div>
                    </div>

                    {!isDefault && !isDisabled && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleSetDefaultShader(pack)}
                        disabled={Boolean(busyKey)}
                        title="Diesen Shader für alle Clients als Standard aktivieren"
                        style={{ padding: '5px 10px', fontSize: '11.5px', gap: '5px' }}
                      >
                        <Star size={12} />
                        <span>Als Standard</span>
                      </button>
                    )}

                    {availableUpdates[`shaderpacks:${pack.slug}`] && (
                      <button
                        className="btn-secondary"
                        style={{ padding: '6px 10px', color: '#f59e0b' }}
                        disabled={Boolean(busyKey)}
                        onClick={() => handleUpdatePack('shaderpacks', pack)}
                        title={`Auf ${availableUpdates[`shaderpacks:${pack.slug}`].versionNumber} aktualisieren`}
                      >
                        {busyKey === `update-pack:shaderpacks:${pack.slug}` ? <RefreshCw size={13} className="spin" /> : <ArrowUpCircle size={13} />}
                      </button>
                    )}
                    <button
                      className="btn-secondary"
                      style={{ padding: '6px 10px', color: '#dc2626' }}
                      disabled={Boolean(busyKey)}
                      onClick={() => handleRemoveShaderpack(pack)}
                      title="Aus dem Entwurf entfernen"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}

              {shaderpacks.length === 0 && (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <Sparkles size={32} style={{ opacity: 0.35, marginBottom: '8px' }} />
                  <div>Noch keine Shader im Entwurf.</div>
                  <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.75 }}>
                    Wechsle zu <strong>Mods & Pakete entdecken</strong> und wähle den Filter <em>Shader</em>, um z. B. <em>Complementary Shaders</em> oder <em>BSL</em> hinzuzufügen.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Configs (gleicher Editor wie unter Mods, plus Auswahl, was an Spieler geteilt wird) */}
        {activeTab === 'configs' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' }}>
            <ConfigSyncCard />
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <LocalConfigEditor target="test" />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
