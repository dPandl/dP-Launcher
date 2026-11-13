// Saisonale Skins: PNG-Dateien aus src/assets/skins/<winter|spring|summer|autumn>/.
// Der Dateiname wird zum Namen (ohne .png, Unterstriche werden zu Leerzeichen).
// Das Modell (Classic oder Slim) erkennt der Launcher beim Anzeigen selbst.
// Der Ordner gaming/ gehört zur Kategorie "Gaming".
// Liegt für eine Jahreszeit keine Datei im Ordner, gelten die mitgelieferten Skins als Ersatz.
import { GENERATED_SEASONAL_SKINS } from './generatedSeasonalSkins';

const files = import.meta.glob('../assets/skins/*/*.png', { eager: true, query: '?inline', import: 'default' });

const fromFiles = Object.entries(files).map(([path, dataUrl]) => {
  const match = /\/skins\/([^/]+)\/([^/]+)\.png$/i.exec(path);
  if (!match) return null;
  const [, season, fileName] = match;
  return {
    id: `season-${season}-${fileName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    season,
    name: fileName.replace(/_/g, ' '),
    description: 'Saisonaler Skin',
    variant: 'classic',
    detectVariant: true,
    dataUrl
  };
}).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'de'));

// Der Ordner "gaming" ist keine Jahreszeit, sondern eine eigene Kategorie mit Videospiel-Charakteren
export const GAMING_SKINS = fromFiles.filter(skin => skin.season === 'gaming').map(skin => ({ ...skin, description: 'Videospiel-Charakter' }));
const seasonFiles = fromFiles.filter(skin => skin.season !== 'gaming');
const seasonsWithFiles = new Set(seasonFiles.map(skin => skin.season));

export const SEASONAL_SKINS = [
  ...seasonFiles,
  ...GENERATED_SEASONAL_SKINS.filter(skin => !seasonsWithFiles.has(skin.season))
];
