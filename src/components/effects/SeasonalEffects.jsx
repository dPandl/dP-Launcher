import React, { useMemo } from 'react';

// Generiert reproduzierbare Partikel-Positionen für eine Jahreszeit
// Kleiner Zufallsgenerator mit festem Startwert: gleiche Verteilung bei jedem Start, aber ohne Muster
function seededRandom(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function generateParticles(season, count) {
  const seed = [...season].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7);
  const rand = seededRandom(seed);
  const particles = [];
  for (let i = 0; i < count; i++) {
    // Waagerecht gleichmäßig verteilt, mit zufälligem Versatz je Partikel
    const left = ((i + rand()) / count) * 98;
    const duration = 7 + rand() * 8;      // 7s bis 15s
    // Startphase quer über die ganze Fallzeit, damit der Effekt von Anfang an gleichmäßig und ohne Wellen läuft
    const delay = -rand() * duration;
    const size = 3 + rand() * 5;          // 3px bis 8px
    const sway = 15 + rand() * 25;        // 15px bis 40px Schaukeln
    const rotate = rand() * 360;
    // Leichter Wind von links nach rechts, manche Partikel fallen schräg nach links
    const drift = -6 + rand() * 24;       // -6vw bis +18vw seitlich über den ganzen Fall
    // Drehungen in ganzen Umdrehungen, für den 3D-Taumel (Kippen um X, Y und Z)
    const spinX = (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 1.5);
    const spinY = (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 1.5);
    const spinZ = (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 1);
    particles.push({ id: `${season}-${i}`, left, duration, delay, size, sway, rotate, drift, spinX, spinY, spinZ });
  }
  return particles;
}

// Gemeinsame CSS-Variablen für schräg fallende, 3D-taumelnde Partikel (Blätter und Blüten)
function tumbleVars(p) {
  return {
    '--drift': `${p.drift}vw`,
    '--spin-x': p.spinX,
    '--spin-y': p.spinY,
    '--spin-z': p.spinZ
  };
}

export default function SeasonalEffects({ season = 'autumn', enabled = true, isDark = true }) {
  if (!enabled) return null;

  const currentSeason = season || 'autumn';

  // Partikel nur neu berechnen, wenn die Jahreszeit wechselt
  const snowFlakes = useMemo(() => currentSeason === 'winter' ? generateParticles('winter', 34) : [], [currentSeason]);
  const autumnLeaves = useMemo(() => currentSeason === 'autumn' ? generateParticles('autumn', 18) : [], [currentSeason]);
  const sakuraPetals = useMemo(() => currentSeason === 'spring' ? generateParticles('spring', 20) : [], [currentSeason]);
  const fireflies = useMemo(() => currentSeason === 'summer' ? generateParticles('summer', 22) : [], [currentSeason]);
  const hologramSparks = useMemo(() => (currentSeason === 'default' || currentSeason === 'custom') ? generateParticles('hologram', 20) : [], [currentSeason]);

  return (
    <div className={`seasonal-effects-layer season-${currentSeason} ${isDark ? 'is-dark' : 'is-light'}`} aria-hidden="true">
      {/* ❄️ WINTER: Schneefall */}
      {currentSeason === 'winter' && snowFlakes.map((p, idx) => {
        const isSpecialCrystal = idx % 5 === 0;
        return (
          <div
            key={p.id}
            className={`season-particle snowflake ${isSpecialCrystal ? 'crystal' : ''}`}
            style={{
              left: `${p.left}%`,
              width: `${p.size}px`,
              height: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              '--sway': `${p.sway}px`
            }}
          >
            {isSpecialCrystal ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%', opacity: 0.85 }}>
                <line x1="12" y1="2" x2="12" y2="22"></line>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                <line x1="19.07" y1="4.93" x2="4.93" y2="19.07"></line>
              </svg>
            ) : null}
          </div>
        );
      })}

      {/* 🍁 HERBST: Taumelnde Herbstblätter */}
      {currentSeason === 'autumn' && autumnLeaves.map((p, idx) => {
        const leafColors = ['#ea580c', '#f97316', '#eab308', '#dc2626', '#b45309', '#ca8a04'];
        const color = leafColors[idx % leafColors.length];
        return (
          <div
            key={p.id}
            className="season-particle autumn-leaf"
            style={{
              left: `${p.left}%`,
              width: `${p.size * 2.8 + 10}px`,
              height: `${p.size * 2.8 + 10}px`,
              animationDuration: `${p.duration + 2}s`,
              animationDelay: `${p.delay}s`,
              '--sway': `${p.sway * 1.5}px`,
              '--rot': `${p.rotate}deg`,
              ...tumbleVars(p),
              color
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%', opacity: 0.75, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>
              <path d="M12 2C12 2 13.5 6 15 7C17 5 19 6 19 6C18 8 18.5 10 20 11C18.5 12 18 14 19 16C17 16 15 17 15 19C13.5 18 12 22 12 22C12 22 10.5 18 9 19C9 17 7 16 5 16C6 14 5.5 12 4 11C5.5 10 6 8 5 6C5 6 7 5 9 7C10.5 6 12 2 12 2Z" />
            </svg>
          </div>
        );
      })}

      {/* 🌸 FRÜHLING: Sakura Kirschblüten */}
      {currentSeason === 'spring' && sakuraPetals.map((p, idx) => {
        const petalColors = ['#f472b6', '#fbcfe8', '#fda4af', '#f9a8d4'];
        const color = petalColors[idx % petalColors.length];
        return (
          <div
            key={p.id}
            className="season-particle sakura-petal"
            style={{
              left: `${p.left}%`,
              width: `${p.size * 2.4 + 8}px`,
              height: `${p.size * 2.4 + 8}px`,
              animationDuration: `${p.duration + 1}s`,
              animationDelay: `${p.delay}s`,
              '--sway': `${p.sway * 1.2}px`,
              '--rot': `${p.rotate}deg`,
              ...tumbleVars(p),
              color
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '100%', height: '100%', opacity: 0.8 }}>
              <path d="M12 3C8 3 5 7 5 11C5 15 8 18 12 21C16 18 19 15 19 11C19 7 16 3 12 3Z" />
            </svg>
          </div>
        );
      })}

      {/* ☀️ SOMMER: Magische Glühwürmchen & Sonnenglanz */}
      {currentSeason === 'summer' && fireflies.map((p, idx) => {
        const fireflyColors = ['#fef08a', '#a3e635', '#fde047', '#86efac'];
        const color = fireflyColors[idx % fireflyColors.length];
        return (
          <div
            key={p.id}
            className="season-particle firefly"
            style={{
              left: `${p.left}%`,
              top: `${(p.left * 1.3 + idx * 7) % 85}%`,
              width: `${p.size + 2}px`,
              height: `${p.size + 2}px`,
              animationDuration: `${p.duration * 0.9}s`,
              animationDelay: `${p.delay}s`,
              '--sway': `${p.sway * 0.8}px`,
              backgroundColor: color,
              boxShadow: `0 0 12px 3px ${color}`
            }}
          />
        );
      })}

      {/* 🔮 DEFAULT & CUSTOM: Holografische Kristall-Lichtfunken (aus dem Icon) */}
      {(currentSeason === 'default' || currentSeason === 'custom') && hologramSparks.map((p, idx) => {
        const sparkColors = ['#38bdf8', '#c084fc', '#ec4899', '#f472b6', '#a855f7'];
        const color = sparkColors[idx % sparkColors.length];
        return (
          <div
            key={p.id}
            className="season-particle firefly hologram-spark"
            style={{
              left: `${p.left}%`,
              top: `${(p.left * 1.4 + idx * 9) % 88}%`,
              width: `${p.size + 1}px`,
              height: `${p.size + 1}px`,
              animationDuration: `${p.duration * 1.1}s`,
              animationDelay: `${p.delay}s`,
              '--sway': `${p.sway}px`,
              backgroundColor: color,
              boxShadow: `0 0 14px 4px ${color}`,
              opacity: 0.65
            }}
          />
        );
      })}
    </div>
  );
}

