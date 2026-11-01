import React, { useState } from 'react';
import { Save, Palette, Cpu, HardDrive, Link, Search, Check } from 'lucide-react';
import { SEASONS, SEASON_CONFIGS, applySeasonTheme } from '../services/seasonManager';

export default function SettingsView({ settings, setSettings, onReloadManifest }) {
  const [formData, setFormData] = useState({ ...settings });
  const [saved, setSaved] = useState(false);

  const handleSeasonChange = (seasonId) => {
    const updated = { ...formData, themeSeason: seasonId };
    setFormData(updated);
    applySeasonTheme(seasonId);
  };

  const handleSave = async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveSettings(formData);
    }
    setSettings(formData);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAutoDetectJava = async () => {
    if (window.electronAPI) {
      const detected = await window.electronAPI.detectJava();
      setFormData(prev => ({ ...prev, javaPath: detected }));
    }
  };

  const seasonOptions = [
    { id: 'auto', name: 'Automatisch (Nach Monat)', color: '#10b981' },
    { id: SEASONS.SPRING, name: '🌸 Frühling (Smaragdgrün & Sakura)', color: '#10b981' },
    { id: SEASONS.SUMMER, name: '☀️ Sommer (Ozean-Cyan & Gelb)', color: '#06b6d4' },
    { id: SEASONS.AUTUMN, name: '🎃 Herbst & Halloween (Kürbis-Orange)', color: '#f97316' },
    { id: SEASONS.WINTER, name: '❄️ Winter & Festtage (Frost-Eisblau)', color: '#38bdf8' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
            Einstellungen
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            Passe das saisonale Theme, Speicherzuteilung und Server-Optionen an.
          </p>
        </div>

        <button className="btn-primary" onClick={handleSave}>
          {saved ? <Check size={16} /> : <Save size={16} />}
          <span>{saved ? 'Gespeichert!' : 'Einstellungen speichern'}</span>
        </button>
      </div>

      {/* Saisondesign */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Palette size={20} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '17px', fontWeight: 600 }}>Saisonales Theme & Farben</h2>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Der Launcher passt Akzentfarben, Glow-Effekte und Icons automatisch an die Jahreszeit an. Du kannst hier auch manuell eine Jahreszeit erzwingen.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          {seasonOptions.map(opt => {
            const isSelected = formData.themeSeason === opt.id;
            return (
              <div
                key={opt.id}
                onClick={() => handleSeasonChange(opt.id)}
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: isSelected ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--color-accent)' : 'var(--border-card)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: opt.color }} />
                <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#fff' : 'var(--text-muted)' }}>
                  {opt.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* RAM & Java */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Cpu size={20} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '17px', fontWeight: 600 }}>Arbeitsspeicher (RAM) & Java</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Maximaler RAM:</span>
              <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{formData.ramMax || 6} GB</span>
            </div>
            <input
              type="range"
              min="2"
              max="16"
              step="1"
              value={formData.ramMax || 6}
              onChange={(e) => setFormData(prev => ({ ...prev, ramMax: parseInt(e.target.value, 10) }))}
              style={{ width: '100%', accentColor: 'var(--color-accent)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>2 GB (Minimum)</span>
              <span>6 GB (Empfohlen)</span>
              <span>16 GB</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Java Pfad (automatisch oder benutzerdefiniert):
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={formData.javaPath || ''}
                placeholder="z. B. java oder Pfad zu javaw.exe"
                onChange={(e) => setFormData(prev => ({ ...prev, javaPath: e.target.value }))}
                style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid var(--border-card)',
                  borderRadius: '10px',
                  padding: '8px 14px',
                  color: '#fff',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
              <button className="btn-secondary" onClick={handleAutoDetectJava} title="Java im System suchen">
                <Search size={14} /> Erkennen
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Server & Remote Manifest */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Link size={20} style={{ color: 'var(--color-accent)' }} />
          <h2 style={{ fontSize: '17px', fontWeight: 600 }}>Bisect Server & Remote-Manifest URL</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Bisect Server-Adresse:
            </label>
            <input
              type="text"
              value={formData.serverIp || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, serverIp: e.target.value }))}
              placeholder="dein-server.bisecthosting.me:25565"
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-card)',
                borderRadius: '10px',
                padding: '8px 14px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
              Server-Manifest URL (JSON auf GitHub / Web):
            </label>
            <input
              type="text"
              value={formData.manifestUrl || ''}
              onChange={(e) => setFormData(prev => ({ ...prev, manifestUrl: e.target.value }))}
              placeholder="https://raw.githubusercontent.com/.../server-manifest.json"
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--border-card)',
                borderRadius: '10px',
                padding: '8px 14px',
                color: '#fff',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
