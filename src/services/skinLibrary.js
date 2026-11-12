// Skin Library & Vorlagen mit direkten 64x64 Textur-URLs für 3D-Rendering

export const SKIN_CATEGORIES = [
  { id: 'all', label: 'Alle' },
  { id: 'seasonal', label: 'Herbst & Saisonal' },
  { id: 'fantasy', label: 'Fantasy & Abenteuer' },
  { id: 'creators', label: 'Bekannte Creator' }
];

export const PRESET_SKINS = [
  // Saisonal (Herbst / Halloween)
  {
    id: 'pumpkin-knight',
    name: 'Kürbis-Ritter',
    category: 'seasonal',
    variant: 'classic',
    description: 'Düsterer Wächter mit glühendem Kürbiskopf.',
    playerName: 'Pumpkin',
    textureUrl: 'https://mineskin.eu/skin/Pumpkin'
  },
  {
    id: 'autumn-ranger',
    name: 'Herbst-Waldläufer',
    category: 'seasonal',
    variant: 'slim',
    description: 'Abenteurer in warmen Herbstfarben.',
    playerName: 'Autumn',
    textureUrl: 'https://mineskin.eu/skin/Autumn'
  },
  {
    id: 'halloween-ghost',
    name: 'Schatten-Geist',
    category: 'seasonal',
    variant: 'classic',
    description: 'Mystischer Geist mit leuchtenden Augen.',
    playerName: 'Ghost',
    textureUrl: 'https://mineskin.eu/skin/Ghost'
  },

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
