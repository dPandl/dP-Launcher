import React, { useState, useEffect } from 'react';
import { Search, Download, Check, Sparkles, Filter, Package, Image, Palette } from 'lucide-react';
import { ModrinthService } from '../services/modrinthService';

export default function ModrinthStoreView({ manifest }) {
  const [activeType, setActiveType] = useState('mod'); // 'mod' | 'shader' | 'resourcepack'
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState(null);
  const [installedMap, setInstalledMap] = useState({});

  const gameVersion = manifest?.gameVersion || '1.21.1';
  const loader = manifest?.loader || 'fabric';

  // Suchen
  const performSearch = async (query = '', type = activeType) => {
    setLoading(true);
    try {
      const data = await ModrinthService.searchProjects({
        query,
        projectType: type,
        gameVersion,
        loader: type === 'mod' ? loader : '',
        limit: 24
      });
      setProjects(data.hits || []);
    } catch (err) {
      console.error('Fehler bei Modrinth-Suche:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    performSearch(searchQuery, activeType);
  }, [activeType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    performSearch(searchQuery, activeType);
  };

  // Installation einer Mod / eines Shaders / Resourcepacks
  const handleInstall = async (project) => {
    setInstallingId(project.project_id);
    try {
      // 1. Versionen für das Projekt abrufen
      const versions = await ModrinthService.getProjectVersions(project.project_id, {
        gameVersion,
        loader: activeType === 'mod' ? loader : ''
      });

      if (!versions || versions.length === 0) {
        alert(`Keine kompatible Version für Minecraft ${gameVersion} (${loader}) gefunden.`);
        return;
      }

      const version = versions[0];
      const primaryFile = version.files.find(f => f.primary) || version.files[0];
      if (!primaryFile) {
        alert('Keine gültige Download-Datei gefunden.');
        return;
      }

      // 2. Zielordner festlegen
      const category = activeType === 'mod' ? 'mods' : activeType === 'shader' ? 'shaderpacks' : 'resourcepacks';

      if (window.electronAPI) {
        const result = await window.electronAPI.downloadModrinthFile({
          url: primaryFile.url,
          filename: primaryFile.filename,
          category
        });

        if (result.success) {
          setInstalledMap(prev => ({ ...prev, [project.project_id]: true }));
        } else {
          alert(`Download fehlgeschlagen: ${result.error}`);
        }
      }
    } catch (err) {
      alert(`Installationsfehler: ${err.message}`);
    } finally {
      setInstallingId(null);
    }
  };

  const tabs = [
    { id: 'mod', label: 'Mods', icon: Package },
    { id: 'shader', label: 'Shaderpacks', icon: Sparkles },
    { id: 'resourcepack', label: 'Resourcepacks', icon: Palette }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header mit Suchleiste und Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
            Modrinth Store
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Finde und installiere kompatible Erweiterungen direkt mit einem Klick.
          </p>
        </div>

        {/* Typ-Filter-Buttons */}
        <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-card)' }}>
          {tabs.map(tab => {
            const Icon = tab.icon;
            const active = activeType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveType(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: active ? 'var(--color-accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--text-muted)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Suche & Kompatibilitätsinfo */}
      <form onSubmit={handleSearchSubmit} className="modrinth-search-bar">
        <Search size={18} style={{ color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder={`${tabs.find(t => t.id === activeType)?.label} auf Modrinth suchen...`}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="badge badge-accent" style={{ fontSize: '11px', gap: '4px' }}>
          <Filter size={11} /> {gameVersion} • {loader}
        </div>
      </form>

      {/* Grid von Projekten */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '15px' }}>Durchsuche Modrinth-Katalog...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-card" style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
          Keine passenden Erweiterungen gefunden. Versuche einen anderen Suchbegriff.
        </div>
      ) : (
        <div className="modrinth-grid">
          {projects.map(project => {
            const isInstalled = installedMap[project.project_id];
            const isBusy = installingId === project.project_id;

            return (
              <div key={project.project_id} className="mod-card">
                <div className="mod-card-header">
                  {project.icon_url ? (
                    <img src={project.icon_url} alt={project.title} className="mod-card-icon" />
                  ) : (
                    <div className="mod-card-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Package size={20} color="var(--text-muted)" />
                    </div>
                  )}
                  <div style={{ overflow: 'hidden' }}>
                    <div className="mod-card-title" title={project.title}>
                      {project.title}
                    </div>
                    <div className="mod-card-author">von {project.author}</div>
                  </div>
                </div>

                <div className="mod-card-desc" title={project.description}>
                  {project.description}
                </div>

                <div className="mod-card-footer">
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                    <span>{(project.downloads || 0).toLocaleString()} Downloads</span>
                  </div>

                  <button
                    className={isInstalled ? "btn-secondary" : "btn-primary"}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      borderRadius: '8px',
                      background: isInstalled ? 'rgba(16, 185, 129, 0.2)' : undefined,
                      borderColor: isInstalled ? '#10b981' : undefined,
                      color: isInstalled ? '#10b981' : undefined
                    }}
                    onClick={() => handleInstall(project)}
                    disabled={isBusy || isInstalled}
                  >
                    {isInstalled ? (
                      <>
                        <Check size={13} /> Installiert
                      </>
                    ) : isBusy ? (
                      'Lädt...'
                    ) : (
                      <>
                        <Download size={13} /> Installieren
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
