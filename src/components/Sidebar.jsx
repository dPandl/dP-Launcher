import React from 'react';
import { Play, ShoppingBag, FolderArchive, Settings, FileText, Flame, Snowflake, Flower2, Sun } from 'lucide-react';

const SEASON_ICONS = {
  autumn: Flame,
  winter: Snowflake,
  spring: Flower2,
  summer: Sun
};

export default function Sidebar({ currentTab, setCurrentTab, activeSeason }) {
  const SeasonIcon = SEASON_ICONS[activeSeason.id] || Flame;

  const navItems = [
    { id: 'play', label: 'Spielen & Server', icon: Play },
    { id: 'modrinth', label: 'Modrinth Store', icon: ShoppingBag },
    { id: 'mods', label: 'Installierte Mods', icon: FolderArchive },
    { id: 'settings', label: 'Einstellungen', icon: Settings },
    { id: 'changelog', label: 'Changelog', icon: FileText }
  ];

  return (
    <aside className="sidebar">
      {navItems.map(item => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            className={`nav-item ${isActive ? 'active' : ''}`}
            onClick={() => setCurrentTab(item.id)}
          >
            <Icon size={18} />
            <span>{item.label}</span>
          </button>
        );
      })}

      <div className="sidebar-spacer" />

      {/* Saisonaler Infokasten */}
      <div className="sidebar-season-pill">
        <SeasonIcon size={20} style={{ color: 'var(--color-accent)' }} />
        <div>
          <div style={{ fontWeight: 600, color: '#fff' }}>{activeSeason.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{activeSeason.bannerText}</div>
        </div>
      </div>
    </aside>
  );
}
