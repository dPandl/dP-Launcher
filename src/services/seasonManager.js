// Saisonales Theming & Design System

export const SEASONS = {
  SPRING: 'spring',
  SUMMER: 'summer',
  AUTUMN: 'autumn',
  WINTER: 'winter'
};

export const SEASON_CONFIGS = {
  spring: {
    id: 'spring',
    name: 'Frühling',
    iconName: 'Flower2',
    accentColor: '#10b981', // Smaragdgrün
    secondaryColor: '#f472b6', // Sakura-Rosa
    glowColor: 'rgba(16, 185, 129, 0.35)',
    bannerText: 'Frühlingserwachen',
    tagline: 'Frische Mods & neue Abenteuer'
  },
  summer: {
    id: 'summer',
    name: 'Sommer',
    iconName: 'Sun',
    accentColor: '#06b6d4', // Ozean-Cyan
    secondaryColor: '#f59e0b', // Sonnengelb
    glowColor: 'rgba(6, 182, 212, 0.35)',
    bannerText: 'Sommerferien & Sonnenschein',
    tagline: 'Endlose Tage auf deinem Server'
  },
  autumn: {
    id: 'autumn',
    name: 'Herbst & Halloween',
    iconName: 'Flame',
    accentColor: '#f97316', // Kürbis-Orange
    secondaryColor: '#d97706', // Bernstein
    glowColor: 'rgba(249, 115, 22, 0.4)',
    bannerText: 'Herbstzauber & Spukzeit',
    tagline: 'Gemütliche Abende mit deiner Community'
  },
  winter: {
    id: 'winter',
    name: 'Winter & Festtage',
    iconName: 'Snowflake',
    accentColor: '#38bdf8', // Frost-Eisblau
    secondaryColor: '#ec4899', // Winter-Rosa/Festtag
    glowColor: 'rgba(56, 189, 248, 0.4)',
    bannerText: 'Winterwunderland',
    tagline: 'Schneebedeckte Welten & warme Kamingeschichten'
  }
};

/**
 * Ermittelt automatisch die aktuelle Jahreszeit basierend auf dem Monat
 * März (2) - Mai (4): Frühling
 * Juni (5) - August (7): Sommer
 * September (8) - November (10): Herbst
 * Dezember (11) - Februar (1): Winter
 */
export function getCurrentSeason() {
  const month = new Date().getMonth(); // 0 = Jan, 11 = Dez
  if (month >= 2 && month <= 4) return SEASONS.SPRING;
  if (month >= 5 && month <= 7) return SEASONS.SUMMER;
  if (month >= 8 && month <= 10) return SEASONS.AUTUMN;
  return SEASONS.WINTER;
}

/**
 * Gibt die aktive Season-Konfiguration zurück (berücksichtigt 'auto' oder manuelle Wahl)
 */
export function getActiveSeasonConfig(selectedSeason = 'auto') {
  const seasonKey = (!selectedSeason || selectedSeason === 'auto')
    ? getCurrentSeason()
    : selectedSeason;
  return SEASON_CONFIGS[seasonKey] || SEASON_CONFIGS.autumn;
}

/**
 * Wendet CSS Variablen auf das Root-Element an
 */
export function applySeasonTheme(selectedSeason = 'auto') {
  const config = getActiveSeasonConfig(selectedSeason);
  const root = document.documentElement;

  root.style.setProperty('--color-accent', config.accentColor);
  root.style.setProperty('--color-secondary', config.secondaryColor);
  root.style.setProperty('--color-glow', config.glowColor);
  root.setAttribute('data-season', config.id);

  return config;
}
