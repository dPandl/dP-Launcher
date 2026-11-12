import React, { useState, useEffect, useRef } from 'react';
import { Download, ChevronDown, ExternalLink, RefreshCw, Layers, ShieldCheck, Palette, Shirt, ServerCog, Package } from 'lucide-react';
import { releaseNotes } from '../releaseNotes';
import { applySeasonTheme } from '../services/seasonManager';
import './LandingPage.css';

const GITHUB_REPO = 'dPandl/dP-Launcher';
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

// Größe, in der die echte App in der Vorschau läuft. Die Vorschau wird nur skaliert, nie umgebrochen.
const PREVIEW_WIDTH = 1100;
const PREVIEW_HEIGHT = 680;

const SEASON_OPTIONS = [
  { id: 'default', label: 'Hologramm' },
  { id: 'auto', label: 'Automatisch' },
  { id: 'spring', label: 'Frühling' },
  { id: 'summer', label: 'Sommer' },
  { id: 'autumn', label: 'Herbst' },
  { id: 'winter', label: 'Winter' }
];

const FEATURES = [
  { icon: RefreshCw, title: 'Modpack-Sync', text: 'Der Launcher gleicht deine Dateien mit der Modliste des Servers ab und lädt nach, was fehlt. Veraltete Mods werden ersetzt.' },
  { icon: Layers, title: 'Direkt von Modrinth', text: 'Mods, Resourcepacks und Shader kommen vom Modrinth-CDN und werden vor dem Start per SHA-1 geprüft.' },
  { icon: ShieldCheck, title: 'Microsoft-Anmeldung', text: 'Die Anmeldung läuft über das offizielle Microsoft-Konto. Die Zugangsdaten werden verschlüsselt gespeichert.' },
  { icon: Palette, title: 'Saisonales Design', text: 'Farben, Logo und Hintergrundeffekte folgen der Jahreszeit. Du kannst auch ein festes Theme oder eigene Farben wählen.' },
  { icon: Shirt, title: 'Skin Studio', text: 'Dein Skin im 3D-Viewer, mit Classic- und Slim-Modell und einer eigenen Skin-Bibliothek.' },
  { icon: ServerCog, title: 'Server-Admin', text: 'Modliste pflegen, lokal testen und veröffentlichen, dazu Server-Konsole und Chat über BisectHosting.' }
];

const STEPS = [
  { title: 'Launcher herunterladen', text: 'ZIP für Windows oder Paket für Linux laden und an einem beliebigen Ort entpacken.' },
  { title: 'Mit Microsoft anmelden', text: 'App starten und einmal mit dem Minecraft-Konto anmelden.' },
  { title: 'Auf Spielen klicken', text: 'Der Launcher lädt Fabric, Java und alle Mods des Servers und startet Minecraft.' }
];

const FAQ = [
  { q: 'Brauche ich ein gekauftes Minecraft?', a: 'Ja. Die Anmeldung läuft über Microsoft, du brauchst also eine Minecraft Java Edition mit gültiger Lizenz.' },
  { q: 'Muss ich Java selbst installieren?', a: 'Nein. Der Launcher nutzt Java 21, das Minecraft 1.21.1 braucht, und richtet es bei Bedarf ein.' },
  { q: 'Wie kommen Updates für den Launcher an?', a: 'Beim Start prüft der Launcher, ob es auf GitHub eine neue Version gibt. Das Update lässt sich mit einem Klick in der App einspielen.' }
];

export default function LandingPage() {
  const latestLocalRelease = releaseNotes[0] || { version: '0.1.0' };
  const [version, setVersion] = useState(latestLocalRelease.version);
  const [downloadUrl, setDownloadUrl] = useState(`${GITHUB_URL}/releases/latest`);
  const [assets, setAssets] = useState([]);
  const [fileSize, setFileSize] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState('default');
  const [showDropdown, setShowDropdown] = useState(false);
  const [osName, setOsName] = useState('Windows');
  const [scale, setScale] = useState(1);
  const frameRef = useRef(null);

  const base = import.meta.env.BASE_URL;
  const appIconUrl = `${base}app-icon.png`;

  // Ermöglicht normales Website-Scrollen im Browser (überschreibt Electron 100vh overflow:hidden)
  useEffect(() => {
    document.documentElement.classList.add('landing-page-active');
    document.body.classList.add('landing-page-active');
    return () => {
      document.documentElement.classList.remove('landing-page-active');
      document.body.classList.remove('landing-page-active');
    };
  }, []);

  // Die Seite nutzt die Farben der gewählten Jahreszeit, genau wie die App
  useEffect(() => {
    applySeasonTheme(selectedSeason, 'dark');
  }, [selectedSeason]);

  // Betriebssystem des Besuchers erkennen
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) setOsName('Windows');
    else if (ua.includes('linux')) setOsName('Linux');
    else if (ua.includes('mac')) setOsName('macOS');
  }, []);

  // Vorschau an die Breite der Seite anpassen
  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / PREVIEW_WIDTH));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Neuestes GitHub Release abfragen
  useEffect(() => {
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`)
      .then(res => {
        if (!res.ok) throw new Error('Kein Release oder Rate Limit');
        return res.json();
      })
      .then(data => {
        if (data.tag_name) setVersion(data.tag_name.replace(/^v/, ''));
        if (Array.isArray(data.assets)) {
          setAssets(data.assets);
          const win = data.assets.find(a => a.name.toLowerCase().includes('win') && a.name.endsWith('.zip'));
          const linux = data.assets.find(a => a.name.toLowerCase().includes('linux') || a.name.endsWith('.appimage'));
          if (osName === 'Linux' && linux) {
            setDownloadUrl(linux.browser_download_url);
            if (linux.size) setFileSize(`${(linux.size / (1024 * 1024)).toFixed(0)} MB`);
          } else if (win) {
            setDownloadUrl(win.browser_download_url);
            if (win.size) setFileSize(`${(win.size / (1024 * 1024)).toFixed(0)} MB`);
          } else if (data.html_url) {
            setDownloadUrl(data.html_url);
          }
        }
      })
      .catch(() => {
        // Fallback bleibt der direkte GitHub Release Link
      });
  }, [osName]);

  const winAsset = assets.find(a => a.name.toLowerCase().includes('win') && a.name.endsWith('.zip'));
  const linuxAppImage = assets.find(a => a.name.endsWith('.AppImage'));
  const linuxZip = assets.find(a => a.name.toLowerCase().includes('linux') && a.name.endsWith('.zip'));

  return (
    <div className="lp" data-theme="dark">
      {/* Kopfzeile */}
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <a href="#top" className="lp-brand">
            <img src={appIconUrl} alt="" />
            <span>dP Launcher</span>
            <span className="lp-pill">v{version}</span>
          </a>
          <nav className="lp-nav-links" aria-label="Seitenbereiche">
            <a href="#preview">Vorschau</a>
            <a href="#features">Funktionen</a>
            <a href="#quickstart">Schnellstart</a>
            <a href="#changelog">Neu</a>
            <a href="#faq">Fragen</a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
          </nav>
          <a href={downloadUrl} className="btn-primary" style={{ textDecoration: 'none', padding: '8px 18px', fontSize: '13.5px' }}>
            <Download size={15} aria-hidden="true" />
            Download
          </a>
        </div>
      </header>

      <main id="top">
        {/* Einstieg */}
        <section className="lp-hero">
          <div className="lp-wrap">
            <div className="lp-hero-text">
              <h1 className="lp-h1">Die Mods deines Servers, automatisch auf jedem Rechner.</h1>
              <p className="lp-lead">
                Der dP Launcher hält Mods, Resourcepacks und Configs deiner Mitspieler auf dem Stand des Servers.
                Die Dateien kommen direkt von Modrinth, niemand muss mehr eine ZIP herumschicken.
              </p>

              <div className="lp-cta">
                <a href={downloadUrl} className="btn-primary">
                  <Download size={18} aria-hidden="true" />
                  Download für {osName}
                </a>
                <button type="button" className="btn-secondary" onClick={() => setShowDropdown(prev => !prev)} aria-expanded={showDropdown}>
                  Andere Plattformen
                  <ChevronDown size={15} aria-hidden="true" />
                </button>

                {showDropdown && (
                  <div className="lp-menu">
                    {winAsset && <a href={winAsset.browser_download_url}><Download size={14} aria-hidden="true" />Windows (ZIP, x64)</a>}
                    {linuxAppImage && <a href={linuxAppImage.browser_download_url}><Download size={14} aria-hidden="true" />Linux (AppImage)</a>}
                    {linuxZip && <a href={linuxZip.browser_download_url}><Download size={14} aria-hidden="true" />Linux (ZIP)</a>}
                    <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} aria-hidden="true" />Alle Releases auf GitHub
                    </a>
                  </div>
                )}
              </div>

              <p className="lp-facts">
                Version {version}{fileSize ? ` (${fileSize})` : ''} · Windows 10/11 und Linux · quelloffen
              </p>
            </div>
          </div>
        </section>

        {/* Die echte App als Vorschau */}
        <section className="lp-preview" id="preview">
          <div className="lp-wrap">
            <div className="lp-preview-bar">
              <p>Das ist die echte Oberfläche der App. Klick dich durch.</p>
              <div className="lp-seasons" role="group" aria-label="Design der Vorschau">
                {SEASON_OPTIONS.map(s => (
                  <button key={s.id} type="button" aria-pressed={selectedSeason === s.id} onClick={() => setSelectedSeason(s.id)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div ref={frameRef} className="lp-frame" style={{ height: PREVIEW_HEIGHT * scale }}>
              <iframe
                key={selectedSeason}
                title="Vorschau des dP Launchers"
                src={`${base}?launcher=1&season=${selectedSeason}`}
                width={PREVIEW_WIDTH}
                height={PREVIEW_HEIGHT}
                style={{ transform: `scale(${scale})` }}
                loading="lazy"
              />
            </div>
          </div>
        </section>

        {/* Funktionen */}
        <section className="lp-section" id="features">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 className="lp-h2">Was der Launcher übernimmt</h2>
              <p className="lp-section-note">Alles, was sonst von Hand gemacht werden muss, bevor man auf einen Modserver kommt.</p>
            </div>
            <div className="lp-grid">
              {FEATURES.map(f => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="glass-card">
                    <div className="lp-card-head">
                      <Icon size={20} aria-hidden="true" />
                      <h3>{f.title}</h3>
                    </div>
                    <p className="lp-card-text">{f.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Schnellstart */}
        <section className="lp-section" id="quickstart">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 className="lp-h2">So kommst du auf den Server</h2>
              <p className="lp-section-note">Drei Schritte, ohne technische Einrichtung.</p>
            </div>
            <div className="lp-steps">
              {STEPS.map((s, i) => (
                <div key={s.title} className="glass-card">
                  <div className="lp-step-num">{i + 1}</div>
                  <div className="lp-card-head" style={{ marginBottom: '6px' }}><h3>{s.title}</h3></div>
                  <p className="lp-card-text">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Neu in dieser Version */}
        <section className="lp-section" id="changelog">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 className="lp-h2">Neu in Version {latestLocalRelease.version}</h2>
              <p className="lp-section-note">Veröffentlicht am {latestLocalRelease.date}</p>
            </div>
            <div className="glass-card lp-notes">
              <div className="lp-card-head">
                <Package size={20} aria-hidden="true" />
                <h3>{latestLocalRelease.title}</h3>
              </div>
              <ul>
                {latestLocalRelease.whatsNew?.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
              <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noopener noreferrer" className="lp-link">
                Frühere Versionen auf GitHub
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        {/* Fragen */}
        <section className="lp-section" id="faq">
          <div className="lp-wrap">
            <div className="lp-section-head">
              <h2 className="lp-h2">Häufige Fragen</h2>
            </div>
            <div className="lp-faq">
              {FAQ.map(item => (
                <details key={item.q}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <div>
            <p><strong>dP Launcher</strong>, ein quelloffener Launcher für Minecraft-Communityserver.</p>
            <p>Nicht mit Mojang Studios oder Microsoft verbunden. Minecraft ist eine Marke von Mojang Synergies AB.</p>
          </div>
          <nav aria-label="Links">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href={`${GITHUB_URL}/releases`} target="_blank" rel="noopener noreferrer">Releases</a>
            <a href={downloadUrl}>Download</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
