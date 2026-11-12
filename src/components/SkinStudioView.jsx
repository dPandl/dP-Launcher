import React, { useState, useEffect } from 'react';
import { Upload, Check, Search, Sparkles, RefreshCw, AlertCircle, Trash2 } from 'lucide-react';
import Skin3DViewer from './Skin3DViewer';
import { PRESET_SKINS, SKIN_CATEGORIES } from '../services/skinLibrary';
import { appAlert } from '../utils/appDialog';

export default function SkinStudioView({ account, onAccountChange }) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedSkin, setSelectedSkin] = useState(PRESET_SKINS[0]);
  const [searchUsername, setSearchUsername] = useState('');
  const [modelVariant, setModelVariant] = useState(PRESET_SKINS[0]?.variant || 'classic');
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [skinHistory, setSkinHistory] = useState([]);

  // Historie beim Laden abrufen
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getSkinHistory) {
      window.electronAPI.getSkinHistory().then(history => {
        if (history) setSkinHistory(history);
      });
    }
  }, []);

  // Textur-URL für 3D-Viewer ermitteln
  const getTextureUrl = (skin) => {
    if (!skin) return 'https://mineskin.eu/skin/Steve';
    if (skin.dataUrl) return skin.dataUrl;
    if (skin.textureUrl) return skin.textureUrl;
    if (skin.playerName) return `https://mineskin.eu/skin/${skin.playerName}`;
    return 'https://mineskin.eu/skin/Steve';
  };

  // Kategorien inklusive 'Historie'
  const categories = [
    ...SKIN_CATEGORIES,
    { id: 'history', label: `Bisherige Skins (${skinHistory.length})` }
  ];

  // Aktive Liste nach Kategorie
  const getDisplaySkins = () => {
    if (activeCategory === 'history') {
      return skinHistory;
    }
    if (activeCategory === 'all') {
      return PRESET_SKINS;
    }
    return PRESET_SKINS.filter(s => s.category === activeCategory);
  };

  const displayedSkins = getDisplaySkins();

  // Eigenen Skin vom PC auswählen
  const handleSelectLocalFile = async () => {
    if (window.electronAPI) {
      const fileInfo = await window.electronAPI.selectSkinFile();
      if (fileInfo && fileInfo.filePath) {
        const localSkin = {
          id: 'custom-local-' + Date.now(),
          name: 'Eigener Skin',
          description: 'Vom PC ausgewählt',
          filePath: fileInfo.filePath,
          dataUrl: fileInfo.dataUrl,
          variant: modelVariant
        };
        setSelectedSkin(localSkin);
        setSuccessMessage('Skin geladen! Klicke auf "Skin anwenden".');
      }
    }
  };

  // Suche nach Minecraft-Spielername
  const handleSearchPlayer = (e) => {
    e.preventDefault();
    if (!searchUsername.trim()) return;
    const name = searchUsername.trim();
    const newSkin = {
      id: `player-${name.toLowerCase()}`,
      name: `${name}'s Skin`,
      category: 'custom',
      description: `Skin von ${name}`,
      playerName: name,
      textureUrl: `https://mineskin.eu/skin/${name}`,
      variant: 'classic'
    };
    setSelectedSkin(newSkin);
  };

  // Skin aktivieren (bei Mojang und in Historie speichern)
  const handleApplySkin = async () => {
    if (!account) {
      appAlert('Bitte melde dich zuerst an, um deinen Skin zu ändern.', { warning: true });
      return;
    }

    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    try {
      if (window.electronAPI) {
        const payload = {
          variant: modelVariant === 'slim' ? 'slim' : 'classic',
          skinName: selectedSkin.name,
          filePath: selectedSkin.filePath || null,
          dataUrl: selectedSkin.dataUrl || null,
          skinUrl: selectedSkin.dataUrl ? null : (selectedSkin.textureUrl || (selectedSkin.playerName ? `https://mineskin.eu/skin/${selectedSkin.playerName}` : null))
        };

        const res = await window.electronAPI.changeSkin(payload);
        if (res.success) {
          onAccountChange(res.account);
          if (res.history) setSkinHistory(res.history);
          setSuccessMessage(`Skin (${modelVariant === 'slim' ? 'Alex / Slim' : 'Classic'}) erfolgreich für ${account.name} aktiviert!`);
          setTimeout(() => setSuccessMessage(''), 4000);
        } else {
          setErrorMessage(res.error || 'Fehler beim Ändern des Skins');
        }
      }
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Eintrag aus Historie löschen
  const handleDeleteHistoryItem = async (e, id) => {
    e.stopPropagation();
    if (window.electronAPI && window.electronAPI.deleteSkinHistoryItem) {
      const updated = await window.electronAPI.deleteSkinHistoryItem(id);
      setSkinHistory(updated || []);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: '14px' }}>
      {/* Header */}
      <div>
        <h1 className="app-page-title">
          3D Skin-Studio & Bibliothek
        </h1>
        <p className="app-page-subtitle">
          Interaktive 3D-Vorschau, Classic & Alex (Slim), sowie Verlauf deiner bisherigen Skins.
        </p>
      </div>

      {/* Haupt-Bereich: Split-Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        
        {/* Linke Spalte: Fester 3D-Viewer */}
        <div
          className="glass-card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '18px',
            overflow: 'hidden'
          }}
        >
          {/* Header & Modell-Badge */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)' }}>3D-Vorschau</span>
            <span className="badge badge-accent" style={{ fontSize: '11px', padding: '2px 8px' }}>
              {modelVariant === 'slim' ? 'Alex (3px)' : 'Classic (4px)'}
            </span>
          </div>

          {/* 3D Canvas Box */}
          <div
            style={{
              height: '225px',
              background: 'var(--bg-well)',
              borderRadius: '16px',
              border: '1px solid var(--border-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}
          >
            <Skin3DViewer
              skinUrl={getTextureUrl(selectedSkin)}
              modelVariant={modelVariant}
              width={260}
              height={220}
            />
          </div>

          {/* Skin Name & Beschreibung */}
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--text-main)' }}>{selectedSkin.name}</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '2px' }}>
              {selectedSkin.description}
            </p>
          </div>

          {/* Classic vs Slim (Alex) Schalter */}
          <div className="segmented-control" style={{ width: '100%', boxSizing: 'border-box' }}>
            <button
              type="button"
              onClick={() => setModelVariant('classic')}
              className={`segmented-control-btn ${modelVariant === 'classic' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Classic (4px)
            </button>
            <button
              type="button"
              onClick={() => setModelVariant('slim')}
              className={`segmented-control-btn ${modelVariant === 'slim' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Alex / Slim (3px)
            </button>
          </div>

          {/* Feedback Meldungen */}
          {successMessage && (
            <div style={{ fontSize: '11.5px', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', fontWeight: 600 }}>
              <Check size={13} /> {successMessage}
            </div>
          )}
          {errorMessage && (
            <div style={{ fontSize: '11.5px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', fontWeight: 600 }}>
              <AlertCircle size={13} /> {errorMessage}
            </div>
          )}

          {/* Aktionen */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              className="btn-primary"
              style={{ justifyContent: 'center', width: '100%', padding: '10px 16px', fontSize: '13px' }}
              onClick={handleApplySkin}
              disabled={loading}
            >
              {loading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
              <span>{loading ? 'Wird angewendet...' : `Skin für ${account ? account.name : 'Account'} anwenden`}</span>
            </button>

            <button
              className="btn-secondary"
              style={{ justifyContent: 'center', width: '100%', padding: '8px 14px', fontSize: '12px' }}
              onClick={handleSelectLocalFile}
            >
              <Upload size={13} />
              <span>Eigene Datei (.png) wählen</span>
            </button>
          </div>
        </div>

        {/* Rechte Spalte: Suche, Filter & Grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0, overflow: 'hidden' }}>
          
          {/* Spieler Skin-Suche */}
          <form onSubmit={handleSearchPlayer} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', border: '1px solid var(--border-card)', borderRadius: '999px', padding: '6px 8px 6px 16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Spielernamen suchen (z. B. BastiGHG, Gronkh, Dream)..."
              value={searchUsername}
              onChange={(e) => setSearchUsername(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, padding: 0, fontSize: '13.5px', color: 'var(--text-main)' }}
            />
            <button type="submit" className="btn-secondary" style={{ padding: '6px 14px', fontSize: '12px' }}>
              Laden
            </button>
          </form>

          {/* Kategorie-Filter Tabs */}
          <div className="segmented-control" style={{ flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`segmented-control-btn ${activeCategory === cat.id ? 'active' : ''}`}
                style={{ fontSize: '12px', padding: '5px 12px' }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Scrollbarer Skin-Grid-Bereich */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
            {displayedSkins.length === 0 ? (
              <div className="glass-card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '13.5px' }}>
                {activeCategory === 'history'
                  ? 'Noch keine bisherigen Skins in der Historie. Sobald du einen Skin anwendest, wird er hier automatisch gespeichert!'
                  : 'Keine Skins gefunden.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '12px' }}>
                {displayedSkins.map(skin => {
                  const isSelected = selectedSkin.id === skin.id;
                  const headUrl = skin.dataUrl
                    ? skin.dataUrl
                    : (skin.playerName ? `https://crafthead.net/helm/${skin.playerName}` : 'https://crafthead.net/helm/Steve');

                  return (
                    <div
                      key={skin.id}
                      onClick={() => {
                        setSelectedSkin(skin);
                        setModelVariant(skin.variant || 'classic');
                      }}
                      className="glass-card"
                      style={{
                        padding: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        position: 'relative',
                        borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-card)',
                        background: isSelected ? 'var(--color-primary-soft)' : 'var(--bg-card)',
                        boxShadow: isSelected ? '0 4px 12px rgba(2, 132, 199, 0.15)' : undefined,
                        borderRadius: '16px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Löschen-Button für Historie */}
                      {activeCategory === 'history' && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteHistoryItem(e, skin.id)}
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            background: '#fee2e2',
                            border: 'none',
                            color: '#dc2626',
                            borderRadius: '999px',
                            width: '22px',
                            height: '22px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                          }}
                          title="Aus Historie entfernen"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}

                      <img
                        src={headUrl}
                        alt={skin.name}
                        style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '10px',
                          background: 'var(--bg-well)',
                          imageRendering: 'pixelated',
                          boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)'
                        }}
                        loading="lazy"
                      />
                      <div style={{ textAlign: 'center', width: '100%' }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 700, color: isSelected ? 'var(--color-primary-text)' : 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {skin.name}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                          {skin.date || (skin.variant === 'slim' ? 'Alex (Slim)' : 'Classic')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
