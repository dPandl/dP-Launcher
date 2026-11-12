import React, { useState, useEffect } from 'react';
import {
  User,
  LogIn,
  LogOut,
  Shield,
  Copy,
  Check,
  Sparkles,
  Upload,
  Search,
  RefreshCw,
  AlertCircle,
  Trash2,
  Shirt,
  Settings2,
  UserCheck
} from 'lucide-react';
import Skin3DViewer from './Skin3DViewer';
import { PRESET_SKINS, SKIN_CATEGORIES } from '../services/skinLibrary';
import { appAlert, appConfirm } from '../utils/appDialog';

const buildAccountSkin = (acc) => {
  if (!acc) return null;
  const identifier = acc.uuid || acc.name;
  return {
    id: `current-account-${identifier}`,
    name: `Aktueller Skin (${acc.name})`,
    description: acc.type === 'microsoft' ? 'Dein derzeit aktiver Mojang-Skin' : 'Dein derzeit aktiver Spieler-Skin',
    playerName: acc.name,
    uuid: acc.uuid,
    textureUrl: `https://crafthead.net/skin/${identifier}`,
    helmUrl: `https://crafthead.net/helm/${identifier}`,
    variant: acc.skinVariant || 'classic',
    isCurrent: true
  };
};

export default function ProfileView({ account, onAccountChange, isAdmin = false }) {
  // Sub-Tab Navigation: 'skins' (Standard) | 'account'
  const [subTab, setSubTab] = useState('skins');

  // Account State
  const [authLoading, setAuthLoading] = useState(false);
  const [offlineNameInput, setOfflineNameInput] = useState('');
  const [showOfflineInput, setShowOfflineInput] = useState(false);
  const [copiedUuid, setCopiedUuid] = useState(false);

  // Skin Studio State
  const accountSkin = buildAccountSkin(account);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedSkin, setSelectedSkin] = useState(() => buildAccountSkin(account) || PRESET_SKINS[0]);
  const [searchUsername, setSearchUsername] = useState('');
  const [modelVariant, setModelVariant] = useState(account?.skinVariant || PRESET_SKINS[0]?.variant || 'classic');
  const [skinLoading, setSkinLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [skinHistory, setSkinHistory] = useState([]);

  // Sobald der Account verfügbar ist, automatisch seinen aktuellen Skin in 3D anzeigen
  useEffect(() => {
    if (account) {
      const mySkin = buildAccountSkin(account);
      setSelectedSkin(prev => {
        if (!prev || prev.id === PRESET_SKINS[0]?.id || prev.id.startsWith('current-account-')) {
          return mySkin;
        }
        return prev;
      });
    }
  }, [account?.name, account?.uuid]);

  // Skin-Historie laden
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.getSkinHistory) {
      window.electronAPI.getSkinHistory().then(history => {
        if (history) setSkinHistory(history);
      });
    }
  }, []);

  // Textur-URL für den 3D-Viewer ermitteln
  const getTextureUrl = (skin) => {
    if (!skin) {
      if (account) return `https://crafthead.net/skin/${account.uuid || account.name}`;
      return 'https://mineskin.eu/skin/Steve';
    }
    if (skin.dataUrl) return skin.dataUrl;
    if (skin.textureUrl) return skin.textureUrl;
    if (skin.uuid) return `https://crafthead.net/skin/${skin.uuid}`;
    if (skin.playerName) return `https://crafthead.net/skin/${skin.playerName}`;
    return 'https://mineskin.eu/skin/Steve';
  };

  // Kategorien inklusive 'Historie'
  const categories = [
    ...SKIN_CATEGORIES,
    { id: 'history', label: `Bisherige Skins (${skinHistory.length})` }
  ];

  // Gefilterte Skins: Aktueller Skin steht bei 'all' und 'history' immer griffbereit an erster Stelle!
  const getDisplaySkins = () => {
    const mySkin = buildAccountSkin(account);

    if (activeCategory === 'history') {
      if (skinHistory.length === 0 && mySkin) {
        return [mySkin];
      }
      return mySkin ? [mySkin, ...skinHistory.filter(h => h.id !== mySkin.id)] : skinHistory;
    }

    if (activeCategory === 'all') {
      return mySkin ? [mySkin, ...PRESET_SKINS] : PRESET_SKINS;
    }

    return PRESET_SKINS.filter(s => s.category === activeCategory);
  };

  const displayedSkins = getDisplaySkins();

  // Microsoft Login
  const handleMicrosoftLogin = async () => {
    setAuthLoading(true);
    if (window.electronAPI) {
      try {
        const res = await window.electronAPI.loginMicrosoft();
        if (res.success) {
          onAccountChange(res.account);
          setShowOfflineInput(false);
        } else if (res.error) {
          appAlert(`Login-Hinweis: ${res.error}`, { warning: true });
        }
      } catch (err) {
        appAlert(`Fehler beim Microsoft-Login: ${err.message}`, { warning: true });
      }
    }
    setAuthLoading(false);
  };

  // Offline / Gast Login
  const handleOfflineLogin = async (e) => {
    if (e) e.preventDefault();
    const name = offlineNameInput.trim();
    if (!name) return;
    setAuthLoading(true);
    if (window.electronAPI) {
      try {
        const res = await window.electronAPI.loginOffline(name);
        if (res.success) {
          onAccountChange(res.account);
          setOfflineNameInput('');
          setShowOfflineInput(false);
        }
      } catch (err) {
        appAlert(`Fehler beim Offline-Login: ${err.message}`, { warning: true });
      }
    }
    setAuthLoading(false);
  };

  // Logout
  const handleLogout = async () => {
    const ok = await appConfirm('Möchtest du dich wirklich vom Konto abmelden?', {
      title: 'Konto abmelden',
      confirmText: 'Abmelden',
      cancelText: 'Abbrechen',
      danger: true
    });
    if (!ok) return;

    if (window.electronAPI) {
      await window.electronAPI.logoutAccount();
      onAccountChange(null);
    }
  };

  // UUID in Zwischenablage kopieren
  const handleCopyUuid = () => {
    if (!account?.uuid) return;
    navigator.clipboard?.writeText(account.uuid);
    setCopiedUuid(true);
    setTimeout(() => setCopiedUuid(false), 2000);
  };

  // Lokale PNG-Datei auswählen
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

  // Skin nach Spielernamen laden
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

  // Skin aktivieren (Mojang / Launcher)
  const handleApplySkin = async () => {
    if (!account) {
      appAlert('Bitte melde dich zuerst mit deinem Microsoft- oder Gastkonto an, um einen Skin zu aktivieren.', { warning: true });
      return;
    }

    setSkinLoading(true);
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
      setSkinLoading(false);
    }
  };

  // Skin aus Historie entfernen
  const handleDeleteHistoryItem = async (e, id) => {
    e.stopPropagation();
    if (window.electronAPI && window.electronAPI.deleteSkinHistoryItem) {
      const updated = await window.electronAPI.deleteSkinHistoryItem(id);
      setSkinHistory(updated || []);
    }
  };

  const avatarUrl = account
    ? (account.skinUrl || (account.uuid ? `https://crafthead.net/helm/${account.uuid}` : `https://crafthead.net/helm/${account.name}`))
    : null;

  return (
    <div className="profile-view-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
      
      {/* 1. HERO / PROFIL-KOPFBEREICH */}
      <div className="glass-card profile-hero-card" style={{ padding: '20px 24px', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
          
          {/* Avatar & Spielerdetails */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', minWidth: '260px' }}>
            <div
              style={{
                width: '68px',
                height: '68px',
                borderRadius: '18px',
                background: 'var(--bg-well)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
                border: '2px solid var(--border-card)',
                overflow: 'hidden',
                flexShrink: 0
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={account.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }}
                />
              ) : (
                <User size={32} style={{ color: '#94a3b8' }} />
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-main)', margin: 0, letterSpacing: '-0.02em' }}>
                  {account ? account.name : 'Nicht angemeldet'}
                </h1>
                {isAdmin && (
                  <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.16)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.35)', fontWeight: 700 }}>
                    <Shield size={12} style={{ marginRight: '4px' }} /> Server-Admin
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                {account ? (
                  <>
                    <span
                      className="badge"
                      style={{
                        background: account.type === 'microsoft' ? 'rgba(16, 185, 129, 0.16)' : 'var(--color-primary-soft)',
                        color: account.type === 'microsoft' ? '#34d399' : 'var(--color-primary-text)',
                        border: `1px solid ${account.type === 'microsoft' ? 'rgba(16, 185, 129, 0.35)' : 'var(--color-primary-border)'}`
                      }}
                    >
                      {account.type === 'microsoft' ? 'Microsoft-Konto' : 'Gast / Offline'}
                    </span>

                    {account.uuid && (
                      <button
                        type="button"
                        onClick={handleCopyUuid}
                        className="badge"
                        style={{
                          background: 'var(--bg-well)',
                          color: 'var(--text-muted)',
                          border: '1px solid var(--border-card)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        title="UUID kopieren"
                      >
                        {copiedUuid ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} />}
                        <span>{copiedUuid ? 'UUID kopiert!' : `UUID: ${account.uuid.slice(0, 8)}...`}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <span className="badge" style={{ background: 'var(--bg-well)', color: 'var(--text-muted)', border: '1px solid var(--border-card)' }}>
                    Kein aktives Konto
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Schnell-Aktionen rechts im Hero */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {account ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleLogout}
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  color: '#f87171',
                  borderColor: 'rgba(239, 68, 68, 0.35)',
                  background: 'rgba(239, 68, 68, 0.12)'
                }}
                title="Vom Konto abmelden"
              >
                <LogOut size={15} />
                <span>Abmelden</span>
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleMicrosoftLogin}
                  disabled={authLoading}
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  {authLoading ? <RefreshCw size={15} className="spin" /> : <LogIn size={15} />}
                  <span>Mit Microsoft anmelden</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowOfflineInput(prev => !prev)}
                  style={{ padding: '8px 14px', fontSize: '13px' }}
                >
                  <User size={15} />
                  <span>Gast-Name</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Inline Offline-Login Eingabefeld falls aufgeklappt */}
        {!account && showOfflineInput && (
          <form
            onSubmit={handleOfflineLogin}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '16px',
              paddingTop: '16px',
              borderTop: '1px solid var(--border-card)'
            }}
          >
            <input
              type="text"
              placeholder="Gewünschten Spielernamen eingeben..."
              value={offlineNameInput}
              onChange={(e) => setOfflineNameInput(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                maxWidth: '320px',
                padding: '8px 14px',
                borderRadius: '12px',
                border: '1px solid var(--border-card)',
                background: 'var(--bg-input)',
                color: 'var(--text-main)',
                outline: 'none',
                fontSize: '13px'
              }}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={authLoading || !offlineNameInput.trim()}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              Übernehmen
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowOfflineInput(false)}
              style={{ padding: '8px 14px', fontSize: '13px' }}
            >
              Abbrechen
            </button>
          </form>
        )}

        {/* Reiterauswahl: Skin-Studio vs. Kontoverwaltung */}
        <div style={{ marginTop: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="segmented-control">
            <button
              type="button"
              onClick={() => setSubTab('skins')}
              className={`segmented-control-btn ${subTab === 'skins' ? 'active' : ''}`}
              style={{ padding: '6px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Shirt size={14} />
              <span>Skin-Studio & Bibliothek</span>
            </button>
            <button
              type="button"
              onClick={() => setSubTab('account')}
              className={`segmented-control-btn ${subTab === 'account' ? 'active' : ''}`}
              style={{ padding: '6px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <UserCheck size={14} />
              <span>Konto & Sicherheit</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. INHALT JE NACH SUB-TAB */}
      {subTab === 'skins' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          
          {/* Linke Spalte: 3D-Viewer & Skin-Steuerung */}
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
                height: '220px',
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
                height={215}
              />
            </div>

            {/* Skin Name & Beschreibung */}
            <div style={{ textAlign: 'center' }}>
              <h3 style={{ fontSize: '15.5px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>{selectedSkin.name}</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '3px', marginBottom: 0 }}>
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
              <div style={{ fontSize: '11.5px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', fontWeight: 600 }}>
                <Check size={13} /> {successMessage}
              </div>
            )}
            {errorMessage && (
              <div style={{ fontSize: '11.5px', color: '#f87171', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'center', fontWeight: 600 }}>
                <AlertCircle size={13} /> {errorMessage}
              </div>
            )}

            {/* Aktionen */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedSkin.isCurrent ? (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.16)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    fontSize: '13px',
                    fontWeight: 700
                  }}
                >
                  <Check size={16} />
                  <span>Aktuell im Spiel aktiv</span>
                </div>
              ) : (
                <>
                  <button
                    className="btn-primary"
                    style={{ justifyContent: 'center', width: '100%', padding: '10px 16px', fontSize: '13px' }}
                    onClick={handleApplySkin}
                    disabled={skinLoading}
                  >
                    {skinLoading ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />}
                    <span>{skinLoading ? 'Wird angewendet...' : `Skin für ${account ? account.name : 'Account'} anwenden`}</span>
                  </button>

                  {accountSkin && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ justifyContent: 'center', width: '100%', padding: '7px 12px', fontSize: '11.5px', color: 'var(--text-muted)' }}
                      onClick={() => {
                        setSelectedSkin(accountSkin);
                        setModelVariant(accountSkin.variant || 'classic');
                      }}
                    >
                      <span>← Zurück zu meinem Skin ({account.name})</span>
                    </button>
                  )}
                </>
              )}

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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))', gap: '12px' }}>
                  {displayedSkins.map(skin => {
                    const isSelected = selectedSkin.id === skin.id;
                    const headUrl = skin.helmUrl
                      || skin.dataUrl
                      || (skin.playerName ? `https://crafthead.net/helm/${skin.playerName}` : 'https://crafthead.net/helm/Steve');

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
                          borderWidth: skin.isCurrent ? '2px' : '1px',
                          borderColor: isSelected
                            ? 'var(--color-primary)'
                            : (skin.isCurrent ? '#10b981' : 'var(--border-card)'),
                          background: isSelected
                            ? 'var(--color-primary-soft)'
                            : (skin.isCurrent ? 'var(--color-primary-soft)' : 'var(--bg-card)'),
                          boxShadow: isSelected ? '0 4px 12px rgba(2, 132, 199, 0.15)' : undefined,
                          borderRadius: '16px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Status-Badge für aktuellen Spiel-Skin */}
                        {skin.isCurrent && (
                          <div
                            style={{
                              position: 'absolute',
                              top: '6px',
                              left: '6px',
                              fontSize: '9.5px',
                              fontWeight: 700,
                              background: '#10b981',
                              color: '#ffffff',
                              padding: '1px 6px',
                              borderRadius: '999px',
                              lineHeight: '13px'
                            }}
                          >
                            Aktiv
                          </div>
                        )}

                        {/* Löschen-Button für Historie */}
                        {activeCategory === 'history' && !skin.isCurrent && (
                          <button
                            type="button"
                            onClick={(e) => handleDeleteHistoryItem(e, skin.id)}
                            style={{
                              position: 'absolute',
                              top: '6px',
                              right: '6px',
                              background: 'rgba(239, 68, 68, 0.15)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#f87171',
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
      )}

      {/* 3. INHALT FÜR KONTO & SICHERHEIT */}
      {subTab === 'account' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', flex: 1, overflowY: 'auto' }}>
          
          {/* Karte 1: Microsoft-Konto */}
          <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.16)', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <LogIn size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Microsoft-Konto</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Offizielles Mojang-Konto für Multiplayer</p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Mit einem Microsoft-Konto kannst du auf allen offiziellen Minecraft-Servern spielen und deine Skins mit Mojang synchronisieren.
            </p>

            <div style={{ marginTop: 'auto', paddingTop: '10px' }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleMicrosoftLogin}
                disabled={authLoading}
                style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
              >
                {authLoading ? <RefreshCw size={16} className="spin" /> : <LogIn size={16} />}
                <span>{account?.type === 'microsoft' ? 'Microsoft-Sitzung erneuern' : 'Jetzt mit Microsoft verbinden'}</span>
              </button>
            </div>
          </div>

          {/* Karte 2: Offline / Gast-Konto */}
          <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--color-primary-soft)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Offline- / Gastmodus</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Lokales Profil ohne Microsoft-Zwang</p>
              </div>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
              Perfekt zum Testen oder für lokale Server, auf denen die Online-Modus-Prüfung deaktiviert ist.
            </p>

            <form onSubmit={handleOfflineLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto' }}>
              <input
                type="text"
                placeholder={account?.type === 'offline' ? `Aktuell: ${account.name}` : 'Spielername eingeben...'}
                value={offlineNameInput}
                onChange={(e) => setOfflineNameInput(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 14px',
                  borderRadius: '12px',
                  border: '1px solid var(--border-card)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontSize: '13px'
                }}
              />
              <button
                type="submit"
                className="btn-secondary"
                disabled={authLoading || !offlineNameInput.trim()}
                style={{ width: '100%', justifyContent: 'center', padding: '9px 16px' }}
              >
                <span>{account?.type === 'offline' ? 'Namen ändern' : 'Als Gast anmelden'}</span>
              </button>
            </form>
          </div>

          {/* Karte 3: Aktuelle Sitzung & Logout */}
          {account && (
            <div className="glass-card" style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px', gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Aktive Sitzung</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                    Angemeldet als <strong>{account.name}</strong> ({account.type === 'microsoft' ? 'Microsoft OAuth' : 'Offline Mode'})
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleLogout}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    color: '#f87171',
                    borderColor: 'rgba(239, 68, 68, 0.35)',
                    background: 'rgba(239, 68, 68, 0.12)'
                  }}
                >
                  <LogOut size={15} />
                  <span>Abmelden</span>
                </button>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}

