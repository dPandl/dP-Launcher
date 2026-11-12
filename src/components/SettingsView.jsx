import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Save, Palette, Cpu, Link, Search, Check, MonitorCog, Moon, Sun, Monitor, Zap, Minimize2, EyeOff, LayoutTemplate,
  ServerCog, Server, Sparkles, Pipette, Calendar, Flower2, Leaf, CloudSnow, X
} from 'lucide-react';
import { SEASONS, applySeasonTheme } from '../services/seasonManager';
import ThemeStudio from './common/ThemeStudio';
import Fab from './common/Fab';

const THEME_ICONS = {
  default: Sparkles,
  auto: Calendar,
  spring: Flower2,
  summer: Sun,
  autumn: Leaf,
  winter: CloudSnow,
  custom: Pipette
};

export default function SettingsView({ settings, setSettings, onReloadManifest }) {
  const [formData, setFormData] = useState({ ...settings });
  const [saved, setSaved] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  // Automatisch speichern, sobald die Einstellungsseite verlassen wird (nur bei Änderungen)
  const latestFormRef = useRef(formData);
  const latestSettingsRef = useRef(settings);
  const setSettingsRef = useRef(setSettings);
  latestFormRef.current = formData;
  latestSettingsRef.current = settings;
  setSettingsRef.current = setSettings;

  useEffect(() => {
    return () => {
      const form = latestFormRef.current;
      if (!form || JSON.stringify(form) === JSON.stringify(latestSettingsRef.current)) return;
      window.electronAPI?.saveSettings(form);
      setSettingsRef.current?.(form);
    };
  }, []);

  // Einstellungen synchron halten, sobald sie geladen oder aktualisiert werden
  useEffect(() => {
    if (settings) {
      setFormData(prev => ({
        ...settings,
        enableAdminMode: settings.enableAdminMode !== undefined ? settings.enableAdminMode : prev.enableAdminMode
      }));
    }
  }, [settings]);

  const handleToggleAdminMode = async (nextVal) => {
    setFormData(prev => ({ ...prev, enableAdminMode: nextVal }));
    if (setSettings) {
      setSettings(prev => ({ ...prev, enableAdminMode: nextVal }));
    }
    if (window.electronAPI) {
      await window.electronAPI.saveSettings({ enableAdminMode: nextVal });
    }
  };

  const handleSeasonChange = (seasonId, customThemeOverride = null) => {
    const updatedCustom = customThemeOverride !== null ? customThemeOverride : (formData.customTheme || {
      mode: 'gradient',
      color1: '#38bdf8',
      color2: '#c084fc',
      color3: '#ec4899',
      angle: 135
    });
    const updated = { ...formData, themeSeason: seasonId, customTheme: updatedCustom };
    setFormData(updated);
    applySeasonTheme(seasonId, formData.darkMode || 'system', updatedCustom);
  };

  const handleCustomThemeUpdate = (patch) => {
    const base = formData.customTheme || {
      mode: 'gradient',
      color1: '#38bdf8',
      color2: '#c084fc',
      color3: '#ec4899',
      angle: 135
    };
    const updatedCustom = { ...base, ...patch };
    const updated = { ...formData, themeSeason: 'custom', customTheme: updatedCustom };
    setFormData(updated);
    applySeasonTheme('custom', formData.darkMode || 'system', updatedCustom);
  };

  // Effekt wirkt sofort und wird gleich gespeichert, damit der Hintergrund live umschaltet
  const handleCustomEffectChange = (effect) => {
    setFormData(prev => ({ ...prev, customEffect: effect }));
    if (setSettings) setSettings(prev => ({ ...prev, customEffect: effect }));
    window.electronAPI?.saveSettings({ customEffect: effect });
  };

  const handleDarkModeChange = (mode) => {
    const updated = { ...formData, darkMode: mode };
    setFormData(updated);
    applySeasonTheme(formData.themeSeason || 'default', mode, formData.customTheme);
  };

  const handleSave = async () => {
    if (window.electronAPI) {
      await window.electronAPI.saveSettings(formData);
    }
    setSettings(formData);
    applySeasonTheme(formData.themeSeason || 'default', formData.darkMode || 'system', formData.customTheme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAutoDetectJava = async () => {
    if (window.electronAPI) {
      const detected = await window.electronAPI.detectJava();
      setFormData(prev => ({ ...prev, javaPath: detected }));
    }
  };

  const darkModeOptions = [
    { id: 'system', name: 'System', hint: 'Folgt dem Windows-Design', icon: Monitor },
    { id: 'on', name: 'Dunkel (An)', hint: 'Angenehm für die Augen', icon: Moon },
    { id: 'off', name: 'Hell (Aus)', hint: 'Klassisches helles Design', icon: Sun }
  ];
  const selectedDarkMode = formData.darkMode || 'system';

  const currentCustomGradient = formData.customTheme?.mode === 'color'
    ? (formData.customTheme?.color1 || '#38bdf8')
    : (formData.customTheme?.color3
      ? `linear-gradient(${formData.customTheme?.angle || 135}deg, ${formData.customTheme?.color1 || '#38bdf8'} 0%, ${formData.customTheme?.color2 || '#c084fc'} 50%, ${formData.customTheme?.color3} 100%)`
      : `linear-gradient(${formData.customTheme?.angle || 135}deg, ${formData.customTheme?.color1 || '#38bdf8'} 0%, ${formData.customTheme?.color2 || '#c084fc'} 100%)`);

  const themeOptions = [
    {
      id: 'default',
      name: 'dP Hologramm',
      badge: 'Standard (Icon)',
      hint: 'Offizielles Design aus dem App-Icon (Cyan, Flieder & Hot Pink)',
      color: 'linear-gradient(135deg, #38bdf8 0%, #c084fc 48%, #ec4899 100%)',
      isGradient: true
    },
    {
      id: 'auto',
      name: 'Automatisch (Monat)',
      badge: 'Kalender',
      hint: 'Passt sich automatisch an die vier Jahreszeiten an',
      color: 'linear-gradient(135deg, #10b981, #d97706, #ea580c, #0284c7)',
      isGradient: true
    },
    {
      id: SEASONS.SPRING,
      name: 'Frühling',
      badge: 'Saisonal',
      hint: 'Smaragdgrün & Blüten',
      color: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      isGradient: true
    },
    {
      id: SEASONS.SUMMER,
      name: 'Sommer',
      badge: 'Saisonal',
      hint: 'Sonnengelb & Gold',
      color: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      isGradient: true
    },
    {
      id: SEASONS.AUTUMN,
      name: 'Herbst',
      badge: 'Saisonal',
      hint: 'Kürbis-Orange & Spukzeit',
      color: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
      isGradient: true
    },
    {
      id: SEASONS.WINTER,
      name: 'Winter',
      badge: 'Saisonal',
      hint: 'Frost-Eisblau & Cobalt',
      color: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
      isGradient: true
    },
    {
      id: 'custom',
      name: 'Eigene Farben & Verlauf',
      badge: 'Individuell',
      hint: 'Freie Farbwahl oder eigener Gradient mit Editor',
      color: currentCustomGradient,
      isGradient: formData.customTheme?.mode !== 'color'
    }
  ];

  const graphicsOptions = [
    { id: 'keep', name: 'Wie in Minecraft eingestellt', hint: 'Der Launcher ändert nichts.' },
    { id: 'vulkan', name: 'Vulkan', hint: 'Hilfreich, wenn das Spiel mit OpenGL abstürzt.' },
    { id: 'opengl', name: 'OpenGL', hint: 'Die bisherige Standard-Schnittstelle.' }
  ];
  const selectedGraphics = formData.graphicsBackend || 'keep';

  const launchBehaviorOptions = [
    {
      id: 'hide',
      name: 'Pausieren & Ausblenden',
      badge: 'Empfohlen (0% Last)',
      hint: 'Der Launcher blendet sich komplett aus & pausiert das Rendering. Gibt 100% der GPU- und CPU-Leistung für Minecraft frei. Öffnet sich nach Spielende automatisch wieder.',
      icon: EyeOff
    },
    {
      id: 'minimize',
      name: 'Minimieren',
      hint: 'Minimiert den Launcher während des Spiels in die Windows-Taskleiste.',
      icon: Minimize2
    },
    {
      id: 'keep',
      name: 'Geöffnet lassen',
      hint: 'Lässt das Launcher-Fenster offen (z. B. um Konsole und Protokolle live zu verfolgen).',
      icon: LayoutTemplate
    },
    {
      id: 'close',
      name: 'Vollständig schließen',
      hint: 'Beendet den Launcher-Prozess komplett, sobald Minecraft gestartet wurde.',
      icon: Zap
    }
  ];
  const selectedLaunchBehavior = formData.gameLaunchBehavior || 'hide';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="app-page-title">
            Einstellungen
          </h1>
          <p className="app-page-subtitle">
            Passe das saisonale Design, Speicherzuteilung und Server-Optionen an. Änderungen werden beim Verlassen der Seite automatisch gespeichert.
          </p>
        </div>
      </div>

      {/* Speichern-Knopf unten rechts (zusätzlich wird beim Verlassen der Seite automatisch gespeichert) */}
      {createPortal(
        <Fab
          icon={saved ? Check : Save}
          label={saved ? 'Gespeichert!' : 'Speichern'}
          side="right"
          onClick={handleSave}
        />,
        document.body
      )}

      {/* Erscheinungsbild (Dark Mode) */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <Moon size={20} style={{ color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)' }}>Erscheinungsbild & Dark Mode</h2>
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          Wähle zwischen dunklem und hellem Erscheinungsbild oder passe den Launcher automatisch an deine Windows-Einstellungen an.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {darkModeOptions.map(opt => {
            const isSelected = selectedDarkMode === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleDarkModeChange(opt.id)}
                style={{
                  padding: '14px 16px',
                  borderRadius: '16px',
                  background: isSelected ? 'var(--color-primary-soft)' : 'var(--bg-well)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-card)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit'
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: isSelected ? 'var(--color-primary)' : 'var(--bg-card)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <Icon size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: isSelected ? 700 : 600, color: isSelected ? 'var(--color-primary-text)' : 'var(--text-main)' }}>
                    {opt.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {opt.hint}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Saisondesign & Themes */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Palette size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)' }}>Design, Theme & Farben</h2>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: 'var(--color-primary-soft)', color: 'var(--color-primary-text)', border: '1px solid var(--color-primary-border)' }}>
            {(formData.themeSeason || 'default') === 'default' ? 'Icon-Standard aktiv' : 'Individuell gewählt'}
          </span>
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          Wähle das offizielle <strong>dP Hologramm-Design</strong> (abgestimmt auf das neue App-Icon), eines der klassischen saisonalen Themes oder gestalte deine eigenen Farben und Farbverläufe.
        </p>

        <div className="ts-swatches" role="group" aria-label="Theme" style={{ marginBottom: '6px' }}>
          {themeOptions.map(opt => {
            const isSelected = (formData.themeSeason || 'default') === opt.id;
            const ThemeIcon = THEME_ICONS[opt.id] || Sparkles;
            return (
              <button
                key={opt.id}
                type="button"
                title={opt.name}
                aria-label={opt.name}
                aria-pressed={isSelected}
                className={isSelected ? 'ts-swatch ts-swatch-on' : 'ts-swatch'}
                style={{ background: opt.color }}
                onClick={() => { handleSeasonChange(opt.id); if (opt.id === 'custom') setShowThemeModal(true); }}
              >
                <ThemeIcon size={20} aria-hidden="true" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }} />
              </button>
            );
          })}
        </div>
        {(() => {
          const current = themeOptions.find(o => o.id === (formData.themeSeason || 'default')) || themeOptions[0];
          return (
            <div style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-main)' }}>{current.name}</span>
                {current.badge && (
                  <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'var(--color-primary)', color: '#ffffff' }}>{current.badge}</span>
                )}
              </div>
              <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{current.hint}</div>
            </div>
          );
        })()}

        {showThemeModal && createPortal(
          <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowThemeModal(false); }}>
            <div className="modal-content ts-modal">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Palette size={20} style={{ color: 'var(--color-primary)' }} />
                  <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Eigene Farben & Verlauf</h2>
                </div>
                <button type="button" className="btn-secondary" onClick={() => setShowThemeModal(false)} aria-label="Schließen" style={{ padding: '6px', borderRadius: '999px', display: 'flex' }}>
                  <X size={16} />
                </button>
              </div>

              <ThemeStudio customTheme={formData.customTheme} onUpdate={handleCustomThemeUpdate} effect={formData.customEffect || 'sparks'} onEffectChange={handleCustomEffectChange} />

                {/* Live-Vorschau Box */}
                <div
                  style={{
                    marginTop: '4px',
                    padding: '14px',
                    borderRadius: '14px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-card)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '12px',
                        background: 'var(--color-gradient, var(--color-primary))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        boxShadow: '0 4px 12px var(--color-glow)'
                      }}
                    >
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-main)' }}>
                        Live-Vorschau deines Themes
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--color-primary-text)' }}>
                        Buttons, Akzente und Effekte passen sich in Echtzeit an
                      </div>
                    </div>
                  </div>
    
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: 'var(--color-primary-soft)',
                        color: 'var(--color-primary-text)',
                        border: '1px solid var(--color-primary-border)',
                        fontSize: '11.5px',
                        fontWeight: 700
                      }}
                    >
                      Badge Vorschau
                    </span>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{ padding: '8px 18px', fontSize: '13px' }}
                    >
                      Button Vorschau
                    </button>
                  </div>
                </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="button" className="btn-primary" onClick={() => setShowThemeModal(false)}>
                  <Check size={16} />
                  <span>Fertig</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Schalter für saisonale Effekte */}
        <div
          onClick={() => {
            const next = !(formData.seasonalEffects !== false);
            setFormData(prev => ({ ...prev, seasonalEffects: next }));
          }}
          style={{
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid var(--border-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer'
          }}
        >
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-main)' }}>
              Saisonale Atmosphäre & Effekte
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Schneefall & Schneekappen im Winter, taumelnde Herbstblätter, Blüten im Frühling & Glühwürmchen im Sommer
            </div>
          </div>
          <div
            style={{
              width: '44px',
              height: '24px',
              borderRadius: '999px',
              background: formData.seasonalEffects !== false ? 'var(--color-primary)' : 'var(--bg-well)',
              border: '1px solid',
              borderColor: formData.seasonalEffects !== false ? 'var(--color-primary)' : 'var(--border-card)',
              position: 'relative',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
          >
            <div
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#ffffff',
                position: 'absolute',
                top: '2px',
                left: formData.seasonalEffects !== false ? '22px' : '2px',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
              }}
            />
          </div>
        </div>
      </div>

      {/* RAM & Java */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <Cpu size={20} style={{ color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)' }}>Arbeitsspeicher (RAM) & Java</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Maximaler RAM:</span>
              <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formData.ramMax || 6} GB</span>
            </div>
            <input
              type="range"
              min="2"
              max="16"
              step="1"
              value={formData.ramMax || 6}
              onChange={(e) => setFormData(prev => ({ ...prev, ramMax: parseInt(e.target.value, 10) }))}
              style={{ width: '100%', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>2 GB (Minimum)</span>
              <span>6 GB (Empfohlen)</span>
              <span>16 GB</span>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Java Pfad (automatisch oder benutzerdefiniert):
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={formData.javaPath || ''}
                placeholder="z. B. java oder Pfad zu javaw.exe / java"
                onChange={(e) => setFormData(prev => ({ ...prev, javaPath: e.target.value }))}
                style={{ flex: 1 }}
              />
              <button className="btn-secondary" onClick={handleAutoDetectJava} title="Java im System suchen">
                <Search size={14} /> Erkennen
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grafik-Schnittstelle */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <MonitorCog size={20} style={{ color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)' }}>Grafik-Schnittstelle</h2>
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Gilt ab dem nächsten Spielstart. Shader können je nach Schnittstelle anders oder gar nicht funktionieren.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {graphicsOptions.map(opt => {
            const isSelected = selectedGraphics === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setFormData(prev => ({ ...prev, graphicsBackend: opt.id }))}
                style={{
                  padding: '14px 16px',
                  borderRadius: '16px',
                  background: isSelected ? 'var(--color-primary-soft)' : 'var(--bg-well)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-card)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit'
                }}
              >
                <div style={{ fontSize: '13.5px', fontWeight: isSelected ? 700 : 600, color: isSelected ? 'var(--color-primary-text)' : 'var(--text-main)' }}>
                  {opt.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{opt.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Verhalten beim Spielstart (Ressourcen-Modus) */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <Zap size={20} style={{ color: 'var(--color-primary)' }} />
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)' }}>Verhalten beim Spielstart (Ressourcen-Modus)</h2>
        </div>

        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
          Da der Launcher auf Electron basiert, beansprucht Chromium im Hintergrund normalerweise GPU-, CPU- und RAM-Ressourcen. 
          Wähle, wie der Launcher reagieren soll, wenn Minecraft gestartet wird:
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
          {launchBehaviorOptions.map(opt => {
            const isSelected = selectedLaunchBehavior === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setFormData(prev => ({ ...prev, gameLaunchBehavior: opt.id }))}
                style={{
                  padding: '14px 16px',
                  borderRadius: '16px',
                  background: isSelected ? 'var(--color-primary-soft)' : 'var(--bg-well)',
                  border: '1px solid',
                  borderColor: isSelected ? 'var(--color-primary)' : 'var(--border-card)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit'
                }}
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: isSelected ? 'var(--color-primary)' : 'var(--bg-card)',
                    color: isSelected ? '#ffffff' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  <Icon size={16} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: isSelected ? 700 : 600, color: isSelected ? 'var(--color-primary-text)' : 'var(--text-main)' }}>
                      {opt.name}
                    </span>
                    {opt.badge && (
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '6px',
                          background: 'var(--color-primary)',
                          color: '#ffffff'
                        }}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>
                    {opt.hint}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Server-Administration & BisectHosting */}
      <div className="glass-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ServerCog size={20} style={{ color: 'var(--color-primary)' }} />
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>Server-Administration</h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                Admin-Bereich freischalten. Die Einrichtung folgt im Server-Admin.
              </p>
            </div>
          </div>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              userSelect: 'none',
              background: formData.enableAdminMode ? 'var(--color-primary-soft)' : 'var(--bg-well)',
              border: `1px solid ${formData.enableAdminMode ? 'var(--color-primary)' : 'var(--border-card)'}`,
              padding: '6px 14px',
              borderRadius: '999px',
              transition: 'all 0.15s ease'
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(formData.enableAdminMode)}
              onChange={(e) => handleToggleAdminMode(e.target.checked)}
              style={{ display: 'none' }}
            />
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '4px',
                border: '1.5px solid',
                borderColor: formData.enableAdminMode ? 'var(--color-primary)' : 'var(--text-muted)',
                background: formData.enableAdminMode ? 'var(--color-primary)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}
            >
              {formData.enableAdminMode && <Check size={12} strokeWidth={3} />}
            </div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: formData.enableAdminMode ? 'var(--color-primary-text)' : 'var(--text-main)' }}>
              {formData.enableAdminMode ? 'Server-Admin aktiviert' : 'Server-Admin deaktiviert'}
            </span>
          </label>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
          Wenn aktiviert, wird der Tab <b>Server-Admin</b> in der Seitenleiste sichtbar. Normale Spieler sehen diesen Tab standardmäßig nicht.
        </p>

      </div>

    </div>
  );
}
