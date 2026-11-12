import React from 'react';
import { Play, BookOpen, MessageSquare, Package, Settings, FileText, User, Shirt, ServerCog, Globe } from 'lucide-react';

export default function Sidebar({ currentTab, setCurrentTab, activeSeason, account, isAdmin }) {

  const navItems = [
    { id: 'play', label: 'Spielen', icon: Play },
    { id: 'servers', label: 'Server', icon: Globe },
    { id: 'guides', label: 'Anleitungen', icon: BookOpen },
    { id: 'chat', label: 'Server-Chat', icon: MessageSquare },
    ...(isAdmin ? [{ id: 'admin', label: 'Server-Admin', icon: ServerCog }] : []),
    { id: 'mods', label: 'Mods', icon: Package },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
    { id: 'changelog', label: 'Changelog', icon: FileText }
  ];

  return (
    <aside className="sidebar" aria-label="Hauptnavigation">
      {/* Brand oben */}
      <div className="sidebar-brand">
        <div className="sidebar-logo-icon">
          <img
            src={`${import.meta.env.BASE_URL}app-icon.png`}
            alt="dP Launcher"
            style={{ width: '38px', height: '38px', objectFit: 'contain' }}
          />
        </div>
        <span>dP Launcher</span>
      </div>

      {/* Navigations-Items */}
      {navItems.map(item => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setCurrentTab(item.id)}
          >
            <span className="nav-icon-wrap">
              <Icon size={16} />
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}

      <div className="sidebar-spacer" />

      {/* Account Button / Avatar (führt direkt zur Profil-Seite) */}
      <button
        type="button"
        onClick={() => setCurrentTab('profile')}
        className={`sidebar-account-btn ${currentTab === 'profile' ? 'active' : ''}`}
        title={account ? `${account.name} (Profil & Konto)` : 'Profil & Anmelden'}
      >
        {account ? (
          <>
            <img
              src={account.skinUrl || (account.uuid ? `https://crafthead.net/helm/${account.uuid}` : `https://crafthead.net/helm/${account.name}`)}
              alt={account.name}
              style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--bg-well)', imageRendering: 'pixelated', flexShrink: 0 }}
            />
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {account.name}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: account.type === 'microsoft' ? '#059669' : 'var(--color-primary)' }}>
                {account.type === 'microsoft' ? 'Microsoft-Konto' : 'Gast / Offline'}
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ width: '32px', height: '32px', borderRadius: '999px', background: 'var(--bg-well)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
              <User size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)' }}>Nicht angemeldet</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-primary)' }}>Jetzt anmelden</div>
            </div>
          </>
        )}
      </button>

      {/* Saisonaler Infokasten */}
      <div className="sidebar-season-pill">
        <img
          src={`${import.meta.env.BASE_URL}app-icon.png`}
          alt="dP"
          style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 2px 6px var(--color-glow))' }}
        />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-main)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {activeSeason.name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {activeSeason.bannerText}
          </div>
        </div>
      </div>
    </aside>
  );
}
