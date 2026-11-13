// Skin Library & Vorlagen mit direkten 64x64 Textur-URLs für 3D-Rendering
import { SEASONAL_SKINS, GAMING_SKINS } from './seasonalSkins';

export const getGamingSkins = () => GAMING_SKINS.map(skin => ({ ...skin, category: 'gaming' }));

export const SEASON_LABELS = { winter: 'Winter', spring: 'Frühling', summer: 'Sommer', autumn: 'Herbst' };

// Die fünf Skins der angegebenen Jahreszeit
export function getSeasonalSkins(season) {
  return SEASONAL_SKINS.filter(skin => skin.season === season).map(skin => ({ ...skin, category: 'seasonal' }));
}

export const SKIN_CATEGORIES = [
  { id: 'all', label: 'Alle' },
  { id: 'seasonal', label: 'Saisonal' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'fantasy', label: 'Fantasy & Abenteuer' },
  { id: 'creators', label: 'Bekannte Creator' }
];

export const PRESET_SKINS = [
  // Fantasy & Abenteuer
  {
    id: 'netherite-knight',
    name: 'Netherite-Paladin',
    category: 'fantasy',
    variant: 'classic',
    description: 'Schwere Rüstung geschmiedet im Nether.',
    playerName: 'Knight',
    textureUrl: 'https://mineskin.eu/skin/Knight'
  },
  {
    id: 'cyber-ninja',
    name: 'Cyber-Ninja',
    category: 'fantasy',
    variant: 'slim',
    description: 'Futuristischer Assassine mit Alex-Schnitt.',
    playerName: 'Ninja',
    textureUrl: 'https://mineskin.eu/skin/Ninja'
  },
  {
    id: 'void-mage',
    name: 'Leeren-Magier',
    category: 'fantasy',
    variant: 'classic',
    description: 'Zauberer mit finsterer kosmischer Magie.',
    playerName: 'Wizard',
    textureUrl: 'https://mineskin.eu/skin/Wizard'
  },

  // Bekannte Creator & Legenden
  {
    id: 'bastighg',
    name: 'BastiGHG',
    category: 'creators',
    variant: 'classic',
    description: 'Der ikonische Skin von BastiGHG.',
    playerName: 'BastiGHG',
    textureUrl: 'https://mineskin.eu/skin/BastiGHG'
  },
  {
    id: 'gronkh',
    name: 'Gronkh',
    category: 'creators',
    variant: 'classic',
    description: 'Der legendäre Let\'s Play Skin von Gronkh.',
    playerName: 'Gronkh',
    textureUrl: 'https://mineskin.eu/skin/Gronkh'
  },
  {
    id: 'technoblade',
    name: 'Technoblade',
    category: 'creators',
    variant: 'classic',
    description: 'Blood for the Blood God. Technoblade never dies!',
    playerName: 'Technoblade',
    textureUrl: 'https://mineskin.eu/skin/Technoblade'
  }
];
