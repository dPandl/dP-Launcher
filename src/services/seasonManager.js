// Saisonales Theming & Modernes Farb-/Gradient-System für dP Launcher

export const SEASONS = {
  DEFAULT: 'default',
  AUTO: 'auto',
  SPRING: 'spring',
  SUMMER: 'summer',
  AUTUMN: 'autumn',
  WINTER: 'winter',
  CUSTOM: 'custom'
};

export const DARK_MODES = {
  SYSTEM: 'system',
  ON: 'on',
  OFF: 'off'
};

// Hilfsfunktionen für Farbberechnungen
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 192, g: 132, b: 252 };
  const clean = hex.replace('#', '');
  const val = parseInt(clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean, 16);
  if (isNaN(val)) return { r: 192, g: 132, b: 252 };
  return { r: (val >> 16) & 255, g: (val >> 8) & 255, b: val & 255 };
}

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function lighten(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 + percent / 100;
  return rgbToHex(Math.min(255, r * factor), Math.min(255, g * factor), Math.min(255, b * factor));
}

export function darken(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const factor = 1 - percent / 100;
  return rgbToHex(Math.max(0, r * factor), Math.max(0, g * factor), Math.max(0, b * factor));
}

// Beliebte Farbverlaufs-Presets
export const GRADIENT_PRESETS = [
  {
    id: 'hologram',
    name: 'dP Hologramm (Icon)',
    color1: '#38bdf8',
    color2: '#c084fc',
    color3: '#ec4899',
    angle: 135
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    color1: '#06b6d4',
    color2: '#d946ef',
    angle: 135
  },
  {
    id: 'sunset',
    name: 'Neon Sunset',
    color1: '#f97316',
    color2: '#ec4899',
    angle: 135
  },
  {
    id: 'aurora',
    name: 'Emerald Aurora',
    color1: '#10b981',
    color2: '#06b6d4',
    angle: 135
  },
  {
    id: 'midnight',
    name: 'Midnight Violet',
    color1: '#6366f1',
    color2: '#a855f7',
    angle: 135
  },
  {
    id: 'inferno',
    name: 'Inferno Flame',
    color1: '#ef4444',
    color2: '#eab308',
    angle: 135
  }
];

export const SEASON_CONFIGS = {
  // DEFAULT THEME: Entspricht 1:1 dem neuen App-Icon (Cyan, Violett, Hot Pink)
  default: {
    id: 'default',
    name: 'dP Hologramm',
    subtitle: 'Offizielles Icon-Design',
    iconName: 'Sparkles',
    accentColor: '#c084fc', // Strahlendes Flieder/Violett
    secondaryColor: '#38bdf8', // Neon Sky Cyan
    tertiaryColor: '#ec4899', // Hot Pink
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #c084fc 48%, #ec4899 100%)',
    gradientHover: 'linear-gradient(135deg, #7dd3fc 0%, #d8b4fe 48%, #f472b6 100%)',
    softBg: 'rgba(192, 132, 252, 0.12)',
    softText: '#7e22ce',
    softBorder: 'rgba(192, 132, 252, 0.35)',
    darkSoftBg: 'rgba(192, 132, 252, 0.18)',
    darkSoftText: '#f0abfc',
    darkSoftBorder: 'rgba(240, 171, 252, 0.35)',
    glowColor: 'rgba(192, 132, 252, 0.35)',
    bannerText: 'dP Signature Edition',
    tagline: 'Holografisches Icon-Design & pure Performance'
  },
  spring: {
    id: 'spring',
    name: 'Frühling',
    subtitle: 'Smaragdgrün & Kirschblüten',
    iconName: 'Flower2',
    accentColor: '#059669', // Smaragdgrün
    secondaryColor: '#10b981',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    gradientHover: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
    softBg: '#ecfdf5',
    softText: '#065f46',
    softBorder: '#a7f3d0',
    darkSoftBg: 'rgba(5, 150, 105, 0.22)',
    darkSoftText: '#34d399',
    darkSoftBorder: 'rgba(52, 211, 153, 0.35)',
    glowColor: 'rgba(5, 150, 105, 0.25)',
    bannerText: 'Frühlingserwachen',
    tagline: 'Frische Mods & neue Abenteuer'
  },
  summer: {
    id: 'summer',
    name: 'Sommer',
    subtitle: 'Sonnengelb & Gold',
    iconName: 'Sun',
    accentColor: '#d97706', // Sonnengelb & Bernstein-Gold
    secondaryColor: '#f59e0b',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    gradientHover: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    softBg: '#fffbeb',
    softText: '#92400e',
    softBorder: '#fde68a',
    darkSoftBg: 'rgba(217, 119, 6, 0.22)',
    darkSoftText: '#fbbf24',
    darkSoftBorder: 'rgba(251, 191, 36, 0.35)',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    bannerText: 'Sommerferien & Sonnenschein',
    tagline: 'Endlose Tage auf deinem Server'
  },
  autumn: {
    id: 'autumn',
    name: 'Herbst & Halloween',
    subtitle: 'Kürbis-Orange & Spukzeit',
    iconName: 'Flame',
    accentColor: '#ea580c', // Kürbis-Orange
    secondaryColor: '#f97316',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    gradientHover: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
    softBg: '#fff7ed',
    softText: '#c2410c',
    softBorder: '#fed7aa',
    darkSoftBg: 'rgba(234, 88, 12, 0.24)',
    darkSoftText: '#fb923c',
    darkSoftBorder: 'rgba(251, 146, 60, 0.4)',
    glowColor: 'rgba(234, 88, 12, 0.25)',
    bannerText: 'Herbstzauber & Spukzeit',
    tagline: 'Gemütliche Abende mit deiner Community'
  },
  winter: {
    id: 'winter',
    name: 'Winter & Festtage',
    subtitle: 'Frost-Eisblau & Cobalt',
    iconName: 'Snowflake',
    accentColor: '#0284c7', // Frost-Eisblau / Cobalt
    secondaryColor: '#38bdf8',
    gradient: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
    gradientHover: 'linear-gradient(135deg, #7dd3fc 0%, #38bdf8 100%)',
    softBg: '#f0f9ff',
    softText: '#0369a1',
    softBorder: '#bae6fd',
    darkSoftBg: 'rgba(2, 132, 199, 0.22)',
    darkSoftText: '#38bdf8',
    darkSoftBorder: 'rgba(56, 189, 248, 0.35)',
    glowColor: 'rgba(2, 132, 199, 0.25)',
    bannerText: 'Winterwunderland',
    tagline: 'Schneebedeckte Welten & warme Kamingeschichten'
  }
};

/**
 * Erzeugt ein dynamisches Theme-Objekt aus Benutzereinstellungen (Farbe oder Farbverlauf)
 */
export function generateCustomThemeConfig(customTheme = {}) {
  const mode = customTheme.mode || 'gradient';
  const angle = customTheme.angle !== undefined ? customTheme.angle : 135;
  const color1 = customTheme.color1 || customTheme.color || '#38bdf8';
  const color2 = customTheme.color2 || '#c084fc';
  const color3 = customTheme.color3 || null;

  let accentColor = color1;
  let secondaryColor = color2;
  let gradient = null;
  let gradientHover = null;

  if (mode === 'gradient') {
    accentColor = color2 || color1;
    secondaryColor = color1;
    if (color3) {
      gradient = `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 50%, ${color3} 100%)`;
      gradientHover = `linear-gradient(${angle}deg, ${lighten(color1, 15)} 0%, ${lighten(color2, 15)} 50%, ${lighten(color3, 15)} 100%)`;
    } else {
      gradient = `linear-gradient(${angle}deg, ${color1} 0%, ${color2} 100%)`;
      gradientHover = `linear-gradient(${angle}deg, ${lighten(color1, 15)} 0%, ${lighten(color2, 15)} 100%)`;
    }
  } else {
    accentColor = color1;
    secondaryColor = lighten(color1, 16);
    gradient = null;
    gradientHover = null;
  }

  const rgb = hexToRgb(accentColor);
  const glowColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.32)`;
  const darkSoftBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.20)`;
  const darkSoftText = lighten(accentColor, 40);
  const darkSoftBorder = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.38)`;
  const softBg = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`;
  const softText = darken(accentColor, 35);
  const softBorder = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;

  return {
    id: 'custom',
    name: customTheme.name || (mode === 'gradient' ? 'Eigener Farbverlauf' : 'Eigene Farbe'),
    subtitle: mode === 'gradient' ? `${color1} → ${color2}` : color1,
    iconName: 'Palette',
    accentColor,
    secondaryColor,
    gradient,
    gradientHover,
    softBg,
    softText,
    softBorder,
    darkSoftBg,
    darkSoftText,
    darkSoftBorder,
    glowColor,
    bannerText: 'Individuelles Theme',
    tagline: 'Dein persönlicher Launcher-Look'
  };
}

/**
 * Ermittelt automatisch die aktuelle Jahreszeit basierend auf dem Monat
 */
export function getCurrentSeason() {
  const month = new Date().getMonth(); // 0 = Jan, 11 = Dez
  if (month >= 2 && month <= 4) return SEASONS.SPRING;
  if (month >= 5 && month <= 7) return SEASONS.SUMMER;
  if (month >= 8 && month <= 10) return SEASONS.AUTUMN;
  return SEASONS.WINTER;
}

/**
 * Gibt die aktive Season-Konfiguration zurück (Default ist nun das Icon-Theme)
 */
export function getActiveSeasonConfig(selectedSeason = 'default', customTheme = null) {
  if (selectedSeason === 'custom') {
    return generateCustomThemeConfig(customTheme || {});
  }
  if (selectedSeason === 'auto') {
    const cur = getCurrentSeason();
    return {
      ...(SEASON_CONFIGS[cur] || SEASON_CONFIGS.default),
      name: `Auto: ${SEASON_CONFIGS[cur]?.name || 'Saisonal'}`
    };
  }
  return SEASON_CONFIGS[selectedSeason] || SEASON_CONFIGS.default;
}

/**
 * Prüft, ob der Dark Mode aktiv sein soll (an / aus / system)
 */
export function resolveIsDark(setting = 'system') {
  if (setting === 'on' || setting === 'dark') return true;
  if (setting === 'off' || setting === 'light') return false;
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

/**
 * Hört auf Änderungen des System-Designs
 */
export function subscribeSystemTheme(onChange) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e) => onChange(e.matches);
  if (mql.addEventListener) {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  } else if (mql.addListener) {
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }
  return () => {};
}

/**
 * Wendet CSS Variablen & Theme-Attribute auf das Root-Element an
 */
export function applySeasonTheme(selectedSeason = 'default', darkMode = 'system', customTheme = null) {
  const config = getActiveSeasonConfig(selectedSeason, customTheme);
  const isDark = resolveIsDark(darkMode);
  const root = document.documentElement;

  root.setAttribute('data-season', config.id);
  root.setAttribute('data-theme', isDark ? 'dark' : 'light');

  root.style.setProperty('--color-primary', config.accentColor);
  root.style.setProperty('--color-primary-hover', config.secondaryColor || config.accentColor);
  root.style.setProperty('--color-accent', config.accentColor);
  root.style.setProperty('--color-secondary', config.secondaryColor || config.accentColor);
  root.style.setProperty('--color-glow', config.glowColor);

  if (config.gradient) {
    root.style.setProperty('--color-gradient', config.gradient);
    root.style.setProperty('--color-gradient-hover', config.gradientHover || config.gradient);
  } else {
    root.style.setProperty('--color-gradient', config.accentColor);
    root.style.setProperty('--color-gradient-hover', config.secondaryColor || config.accentColor);
  }

  if (isDark) {
    root.style.setProperty('--color-primary-soft', config.darkSoftBg);
    root.style.setProperty('--color-primary-text', config.darkSoftText);
    root.style.setProperty('--color-primary-border', config.darkSoftBorder);
  } else {
    root.style.setProperty('--color-primary-soft', config.softBg);
    root.style.setProperty('--color-primary-text', config.softText);
    root.style.setProperty('--color-primary-border', config.softBorder);
  }

  return { ...config, isDark };
}
