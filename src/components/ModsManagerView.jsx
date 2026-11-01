import React, { useState, useEffect } from 'react';
import { FolderOpen, Trash2, ToggleLeft, ToggleRight, RefreshCw, FileCode, CheckCircle2 } from 'lucide-react';

export default function ModsManagerView() {
  const [category, setCategory] = useState('mods'); // 'mods' | 'shaderpacks' | 'resourcepacks'
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadItems = async (cat = category) => {
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
    loadItems(category);
  }, [category]);

  const handleToggle = async (filename) => {
    if (window.electronAPI) {
      const res = await window.electronAPI.toggleMod(filename);
      if (res.success) {
        loadItems(category);
      }
    }
  };

  const handleDelete = async (filename) => {
    if (!confirm(`Möchtest du "${filename}" wirklich löschen?`)) return;
    if (window.electronAPI) {
      const res = await window.electronAPI.deleteItem(category, filename);
      if (res.success) {
        loadItems(category);
      }
    }
  };

  const handleOpenFolder = () => {
    if (window.electronAPI) {
      window.electronAPI.openGameDir(category);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
            Installierte Dateien
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Verwalte deine lokalen Mods, Shader und Texturen.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={() => loadItems(category)} title="Aktualisieren">
            <RefreshCw size={15} className={loading ? 'spin' : ''} />
          </button>
          <button className="btn-primary" onClick={handleOpenFolder}>
            <FolderOpen size={16} />
            <span>Ordner im Explorer öffnen</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {[
          { id: 'mods', label: 'Mods' },
          { id: 'shaderpacks', label: 'Shaderpacks' },
          { id: 'resourcepacks', label: 'Resourcepacks' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setCategory(tab.id)}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              border: '1px solid',
              borderColor: category === tab.id ? 'var(--color-accent)' : 'var(--border-card)',
              background: category === tab.id ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.2)',
              color: category === tab.id ? '#fff' : 'var(--text-muted)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            {tab.label} ({category === tab.id ? items.length : '...'})
          </button>
        ))}
      </div>

      {/* Item List */}
      <div className="glass-card" style={{ padding: '8px' }}>
        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            In diesem Ordner befinden sich derzeit noch keine Dateien.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map(item => {
              const sizeMb = (item.size / (1024 * 1024)).toFixed(2);
              return (
                <div
                  key={item.filename}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: item.enabled ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.3)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    opacity: item.enabled ? 1 : 0.6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FileCode size={18} style={{ color: item.enabled ? 'var(--color-accent)' : 'var(--text-muted)' }} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
                        {item.filename}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {sizeMb} MB • {item.enabled ? 'Aktiviert' : 'Deaktiviert (.disabled)'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {category === 'mods' && (
                      <button
                        onClick={() => handleToggle(item.filename)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: item.enabled ? 'var(--color-accent)' : 'var(--text-muted)' }}
                        title={item.enabled ? 'Mod deaktivieren' : 'Mod aktivieren'}
                      >
                        {item.enabled ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                      </button>
                    )}

                    <button
                      onClick={() => handleDelete(item.filename)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                      title="Datei löschen"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
