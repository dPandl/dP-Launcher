import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen, Search, Plus, Trash2, Edit3, Eye, Upload, Save,
  CheckCircle2, AlertCircle, ChevronRight, Image as ImageIcon,
  ExternalLink, Sparkles, HelpCircle, Layers, ArrowLeft, X,
  Share2, RefreshCw, Check, AlertTriangle
} from 'lucide-react';
import { ModrinthService } from '../services/modrinthService';

const KNOWN_ICON_MAP = {
  'splinecart': 'https://cdn.modrinth.com/data/8k5WFoGm/3b2d8e3bf6bef7c2f42d34324e61f9469e2065af_96.webp',
  'pw_splinecart': 'https://cdn.modrinth.com/data/8k5WFoGm/3b2d8e3bf6bef7c2f42d34324e61f9469e2065af_96.webp',
  '8k5wfogm': 'https://cdn.modrinth.com/data/8k5WFoGm/3b2d8e3bf6bef7c2f42d34324e61f9469e2065af_96.webp',
  'saros-money': 'https://cdn.modrinth.com/data/vRkO4kGw/27d54e7dcb39a0161b75e5795d9c602ca9202927_96.webp',
  'saros_money': 'https://cdn.modrinth.com/data/vRkO4kGw/27d54e7dcb39a0161b75e5795d9c602ca9202927_96.webp',
  'vrko4kgw': 'https://cdn.modrinth.com/data/vRkO4kGw/27d54e7dcb39a0161b75e5795d9c602ca9202927_96.webp',
  'reliable-gliders': 'https://cdn.modrinth.com/data/pVIWsXir/5bd0978079f226fe04e6e6ed92daa3f8de503d62.png',
  'reliable_gliders': 'https://cdn.modrinth.com/data/pVIWsXir/5bd0978079f226fe04e6e6ed92daa3f8de503d62.png',
  'pviwsxir': 'https://cdn.modrinth.com/data/pVIWsXir/5bd0978079f226fe04e6e6ed92daa3f8de503d62.png',
  'gravestones': 'https://cdn.modrinth.com/data/Heh3BbSv/e10b4d60fb1d7eb24044b8c40f0eec4346e5894a_96.webp',
  'pneumono_gravestones': 'https://cdn.modrinth.com/data/Heh3BbSv/e10b4d60fb1d7eb24044b8c40f0eec4346e5894a_96.webp',
  'heh3bbsv': 'https://cdn.modrinth.com/data/Heh3BbSv/e10b4d60fb1d7eb24044b8c40f0eec4346e5894a_96.webp',
  'fabric-api': 'https://cdn.modrinth.com/data/P7dR8mSH/b3d4fba7359dc05dc9b32bf5ae098d5a1f6a1d82.png',
  'p7dr8msh': 'https://cdn.modrinth.com/data/P7dR8mSH/b3d4fba7359dc05dc9b32bf5ae098d5a1f6a1d82.png',
  'sodium': 'https://cdn.modrinth.com/data/AANobbMI/6cb23d5ad3bfbfec4c54eefca7cf999d3e8e19b5_96.webp',
  'aanobbmi': 'https://cdn.modrinth.com/data/AANobbMI/6cb23d5ad3bfbfec4c54eefca7cf999d3e8e19b5_96.webp',
  'lithium': 'https://cdn.modrinth.com/data/gvQqBUqZ/b2f6ebdf36371cb14b301777b78a05e55e88d0b2_96.webp',
  'gvqqbuqz': 'https://cdn.modrinth.com/data/gvQqBUqZ/b2f6ebdf36371cb14b301777b78a05e55e88d0b2_96.webp',
  'iris': 'https://cdn.modrinth.com/data/YL57xq9U/6e339178ad0fb1be7b11d8825f385c7075c0ee81_96.webp',
  'yl57xq9u': 'https://cdn.modrinth.com/data/YL57xq9U/6e339178ad0fb1be7b11d8825f385c7075c0ee81_96.webp'
};

const STARTER_GUIDES = [
  {
    id: 'splinecart',
    modSlug: 'pw_splinecart',
    title: 'Splinecart (Achterbahnen & Fahrgeschäfte)',
    iconUrl: KNOWN_ICON_MAP['pw_splinecart'],
    summary: 'Erschaffe spektakuläre Achterbahnen, Loopings und Fahrgeschäfte mit stufenlosen Kurven und physikalischen Neigungen.',
    chapters: [
      {
        id: 'spline-1',
        title: '1. Schnellstart & Gleise verlegen',
        content: `## Willkommen bei Splinecart!

Mit **Splinecart** kannst du auf unserem Server echte, geschmeidige Achterbahnen und Hochgeschwindigkeitsstrecken bauen – ganz ohne abgehackte Vanilla-Gleise!

### Erste Schritte:
1. **Gleisanker platzieren:** Setze einen Gleisanker (*Track Anchor*) an den Startpunkt deiner geplanten Strecke.
2. **Gleisbauer-Werkzeug nutzen:** Klicke mit der rechten Maustaste auf den Startanker und gehe zum nächsten Punkt.
3. **Streckenverlauf bestimmen:** Klicke erneut, um den nächsten Anker zu verbinden. Das Gleis biegt sich automatisch in einer sanften Bézier-Kurve.

### Steilkurven & Neigung (Banking):
- Halte die **Shift-Taste** gedrückt, während du die Neigung des Gleises justierst.
- In schnellen Kurven sorgt ein Schräglagen-Winkel von **20° bis 45°** dafür, dass die Lore physikalisch stabil bleibt und nicht entgleist!`,
        images: []
      },
      {
        id: 'spline-2',
        title: '2. Antriebe, Bremsen & Stationen',
        content: `### Geschwindigkeit kontrollieren

Eine Achterbahn lebt vom Wechselspiel aus Geschwindigkeit und Nervenkitzel. Splinecart bietet dafür spezialisierte Gleistypen:

- **Kettenlift (Chain Lift):** Zieht die Lore mit konstanter Geschwindigkeit steile Anstiege hinauf. Perfekt für den ersten Lifthill!
- **Booster-Gleis (Powered Track):** Beschleunigt die Lore blitzschnell vor Steilkurven oder Loopings.
- **Bremsschiene (Brake Track):** Reduziert sanft die Geschwindigkeit vor scharfen Kurven oder im Einfahrtsbereich des Bahnhofs.
- **Stationsgleis:** Hält die Lore automatisch an. Durch ein **Redstone-Signal** (z. B. Knopf oder Hebel) oder wenn ein Spieler einsteigt, startet die Fahrt.`,
        images: []
      },
      {
        id: 'spline-3',
        title: '3. Loopings, Korkenzieher & Tuning',
        content: `### Meisterklasse: Loopings & Inversionen

Du möchtest Fahrgäste kopfüber schicken? Kein Problem!

1. Setze Ankerpunkte in einer vertikalen Schleife nach oben.
2. Achte darauf, dass vor dem Looping ausreichend **Schwung** vorhanden ist (z. B. durch einen Drop oder Booster-Gleise).
3. Verwende Korkenzieher-Kurven (Roll-Winkel bis 180°), um nahtlose Übergänge zwischen Loopings und Steilstrecken zu erzeugen.

> **Sicherheits-Tipp:** Teste deine Strecke immer erst mit einer leeren Lore, bevor du Passagiere einsteigen lässt!`,
        images: []
      }
    ]
  },
  {
    id: 'saros-money',
    modSlug: 'saros-money',
    title: "Saro's Money (Wirtschaft & Münzen)",
    iconUrl: KNOWN_ICON_MAP['saros-money'],
    summary: 'Das Währungssystem auf unserem Server: Verdiene Münzen, eröffne Shops und handle mit anderen Spielern.',
    chapters: [
      {
        id: 'money-1',
        title: '1. Münzstufen & Währung',
        content: `## Unser Wirtschaftssystem

Auf unserem Server nutzen wir physische Münzen als stabiles Zahlungsmittel:

- **Kupfermünze:** Die kleinste Einheit für den täglichen Bedarf.
- **Silbermünze:** Wert = 10 Kupfermünzen.
- **Goldmünze:** Wert = 10 Silbermünzen (= 100 Kupfermünzen).
- **Platinmünze:** Wert = 10 Goldmünzen (= 1.000 Kupfermünzen) für Großprojekte und seltene Güter.

### Münzen wechseln:
Du kannst Münzen in der Werkbank (Crafting Table) jederzeit in höhere oder niedrigere Einheiten umwandeln (z. B. 10 Kupfer = 1 Silber und umgekehrt).`,
        images: []
      },
      {
        id: 'money-2',
        title: '2. Geld verdienen & Handeln',
        content: `### Wie komme ich an Geld?

1. **Quests & Kopfgelder:** Erfülle Aufgaben an Schwarzen Brettern in Dörfern.
2. **Rohstoff-Verkauf:** Verkaufe überschüssige Erze, Holz oder Nahrung an andere Spieler.
3. **Eigene Shops eröffnen:** Baue eine Verkaufs-Kiste auf dem Marktplatz und biete Waren automatisch an.
4. **Dienstleistungen:** Lass dich für Bauarbeiten, Transporte oder Streckennetze bezahlen.`,
        images: []
      },
      {
        id: 'money-3',
        title: '3. Tresore & Sicherheit',
        content: `### Schütze dein Vermögen!

- Bewahre deine wertvollen Münzen in einem **gesperrten Tresor** oder deiner Ender-Kiste auf.
- Verliere deine Geldbörse nicht im Kampf – halte immer nur das Geld bei dir, das du für den Einkauf benötigst!`,
        images: []
      }
    ]
  },
  {
    id: 'reliable-gliders',
    modSlug: 'reliable-gliders',
    title: 'Reliable Gliders (Gleitschirme)',
    iconUrl: KNOWN_ICON_MAP['reliable-gliders'],
    summary: 'Gleite sicher von Bergen, nutze thermische Aufwinde und reise schnell über die Welt.',
    chapters: [
      {
        id: 'glider-1',
        title: '1. Gleiter craften & Ausrüsten',
        content: `## Sanftes Gleiten statt Fallschaden!

Der Gleitschirm (*Glider*) ist dein treuer Begleiter zur Erkundung hoher Berge und weiter Landschaften.

### Herstellung:
- **Holz-Gleiter:** Der Einstieg. Benötigt Leder, Stöcke und Stoff/Wolle.
- **Verstärkter Gleiter:** Hält deutlich länger und bietet bessere Flugeigenschaften.

### Ausrüsten:
Platziere den Gleiter in deinem Brustpanzer-Slot oder im Curios/Trinkets-Slot. Alternativ reicht es, ihn in der Hand zu halten und in der Luft Rechtsklick zu drücken.`,
        images: []
      },
      {
        id: 'glider-2',
        title: '2. Flugtechnik & Thermik',
        content: `### Steuerung in der Luft:
- **Blick nach unten:** Schneller Flug, steilerer Sinkflug.
- **Blick zum Horizont:** Maximaler Gleitwinkel, weite Distanz.
- **Lagerfeuer & Lava-Aufwinde:** Wenn du über einem **Lagerfeuer (Campfire)** oder einem Lava-See fliegst, erzeugt die heiße Luft thermischen Auftrieb und trägt dich wieder nach oben!`,
        images: []
      }
    ]
  },
  {
    id: 'gravestones',
    modSlug: 'pneumono_gravestones',
    title: 'Gravestones (Grabsteine)',
    iconUrl: KNOWN_ICON_MAP['pneumono_gravestones'],
    summary: 'Kein Item-Verlust beim Tod: Deine Ausrüstung wird sicher in einem Grabstein verwahrt.',
    chapters: [
      {
        id: 'grave-1',
        title: '1. Automatisches Sichern beim Tod',
        content: `## Keine Panik bei Missgeschicken!

Wenn du auf unserem Server das Zeitliche segnest, verschwinden deine Items nicht im Nirgendwo und despawnen auch nicht nach 5 Minuten:

1. An deinem Todesort entsteht sofort ein **Grabstein**.
2. Alle getragenen Rüstungen, Werkzeuge und dein gesamtes Inventar werden sicher darin verstaut.
3. Im Chat erhältst du die genauen **Koordinaten** und die Dimension deines Grabes.`,
        images: []
      },
      {
        id: 'grave-2',
        title: '2. Grab bergen & Ausrüsten',
        content: `### Items wiederholen:
- Gehe zum Todespunkt zurück.
- Klicke mit der rechten Maustaste (oder sneak-klicke) auf den Grabstein.
- Deine Rüstung wird sofort wieder angezogen und die Items wandern in genau die gleichen Inventar-Slots zurück wie vor deinem Ableben!
- Der Grabstein verschwindet danach automatisch.`,
        images: []
      }
    ]
  }
];

function resolveGuideIcon(guide, availableMods = [], modMetaMap = {}) {
  if (!guide) return '';
  const slugKey = (guide.slug || guide.modSlug || '').toLowerCase();
  const idKey = (guide.id || '').toLowerCase();
  const projKey = (guide.projectId || '').toLowerCase();
  const titleKey = (guide.name || guide.title || '').toLowerCase();

  // 1. Bekannte statische Map (immer sofort verfügbar)
  if (KNOWN_ICON_MAP[slugKey]) return KNOWN_ICON_MAP[slugKey];
  if (KNOWN_ICON_MAP[idKey]) return KNOWN_ICON_MAP[idKey];
  if (KNOWN_ICON_MAP[projKey]) return KNOWN_ICON_MAP[projKey];
  if (titleKey.includes('splinecart')) return KNOWN_ICON_MAP['splinecart'];
  if (titleKey.includes('money') || titleKey.includes('saro')) return KNOWN_ICON_MAP['saros-money'];
  if (titleKey.includes('glider')) return KNOWN_ICON_MAP['reliable-gliders'];
  if (titleKey.includes('grave')) return KNOWN_ICON_MAP['gravestones'];
  if (titleKey.includes('sodium')) return KNOWN_ICON_MAP['sodium'];
  if (titleKey.includes('lithium')) return KNOWN_ICON_MAP['lithium'];
  if (titleKey.includes('iris')) return KNOWN_ICON_MAP['iris'];
  if (titleKey.includes('fabric api')) return KNOWN_ICON_MAP['fabric-api'];

  // 2. Modrinth API Metadaten (geladen via getProjects)
  if (projKey && modMetaMap[projKey]?.icon_url) return modMetaMap[projKey].icon_url;
  if (slugKey && modMetaMap[slugKey]?.icon_url) return modMetaMap[slugKey].icon_url;
  if (idKey && modMetaMap[idKey]?.icon_url) return modMetaMap[idKey].icon_url;

  // 3. Vorhandene gültige iconUrl
  if (guide.iconUrl && typeof guide.iconUrl === 'string' && guide.iconUrl.startsWith('http') && !guide.iconUrl.includes('H55Wp9yP') && !guide.iconUrl.includes('uFlr5f8z')) {
    return guide.iconUrl;
  }
  if (guide.icon_url && typeof guide.icon_url === 'string' && guide.icon_url.startsWith('http')) {
    return guide.icon_url;
  }

  // 4. In availableMods suchen
  if (Array.isArray(availableMods) && availableMods.length > 0) {
    const matched = availableMods.find(m =>
      (m.slug && (m.slug.toLowerCase() === slugKey || m.slug.toLowerCase() === idKey)) ||
      (m.name && titleKey && m.name.toLowerCase() === titleKey)
    );
    if (matched) {
      if (matched.iconUrl) return matched.iconUrl;
      const meta = (matched.projectId && modMetaMap[matched.projectId]) || (matched.slug && modMetaMap[matched.slug.toLowerCase()]);
      if (meta?.icon_url) return meta.icon_url;
    }
  }

  return guide.iconUrl || '';
}

// Sichere Mod-Icon Komponente
function ModIcon({ iconUrl, title, size = 36 }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [iconUrl]);

  if (!iconUrl || hasError) {
    const letter = title ? title.replace(/[^a-zA-Z0-9]/g, '').charAt(0).toUpperCase() : '?';
    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: `${Math.round(size * 0.28)}px`,
          background: 'var(--color-primary-soft)',
          border: '1px solid var(--border-card)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-primary)',
          fontSize: `${Math.round(size * 0.42)}px`,
          fontWeight: 800,
          flexShrink: 0
        }}
      >
        {letter || <Layers size={Math.round(size * 0.5)} />}
      </div>
    );
  }

  return (
    <img
      src={iconUrl}
      alt={title || 'Mod'}
      onError={() => setHasError(true)}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: `${Math.round(size * 0.28)}px`,
        objectFit: 'cover',
        border: '1px solid var(--border-card)',
        background: 'var(--bg-well)',
        flexShrink: 0
      }}
    />
  );
}

// Markdown-Renderer
function renderMarkdownContent(text, onImageClick) {
  if (!text) return null;

  const lines = text.split('\n');
  const elements = [];
  let currentList = null;
  let listType = null;
  let blockquoteLines = [];

  const flushBlockquote = (key) => {
    if (blockquoteLines.length > 0) {
      elements.push(
        <div key={key} className="guide-callout-box">
          <Sparkles size={18} className="guide-callout-icon" />
          <div className="guide-callout-content">
            {blockquoteLines.map((line, lIdx) => (
              <p key={lIdx} style={{ margin: 0 }}>{formatInline(line)}</p>
            ))}
          </div>
        </div>
      );
      blockquoteLines = [];
    }
  };

  const flushList = (key) => {
    if (currentList) {
      if (listType === 'ol') {
        elements.push(<ol key={key} className="guide-ol">{currentList}</ol>);
      } else {
        elements.push(<ul key={key} className="guide-ul">{currentList}</ul>);
      }
      currentList = null;
      listType = null;
    }
  };

  const formatInline = (str) => {
    const tokens = [];
    const inlineRegex = /(!?\[([^\]]*)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
    let match;
    let lastIndex = 0;
    let idx = 0;

    while ((match = inlineRegex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(str.substring(lastIndex, match.index));
      }

      const full = match[0];
      if (full.startsWith('![')) {
        const alt = match[2];
        const src = match[3];
        tokens.push(
          <div key={`img-${idx++}`} className="guide-inline-image-wrap" onClick={() => onImageClick && onImageClick(src, alt)}>
            <img src={src} alt={alt} className="guide-inline-image" />
            {alt && <span className="guide-image-caption">{alt}</span>}
          </div>
        );
      } else if (full.startsWith('[')) {
        const label = match[2];
        const href = match[3];
        tokens.push(
          <a key={`link-${idx++}`} href={href} target="_blank" rel="noopener noreferrer" className="guide-link">
            {label}
          </a>
        );
      } else if (full.startsWith('**')) {
        tokens.push(<strong key={`b-${idx++}`}>{match[4]}</strong>);
      } else if (full.startsWith('*')) {
        tokens.push(<em key={`i-${idx++}`}>{match[5]}</em>);
      } else if (full.startsWith('`')) {
        tokens.push(<code key={`c-${idx++}`} className="guide-code">{match[6]}</code>);
      }

      lastIndex = inlineRegex.lastIndex;
    }

    if (lastIndex < str.length) {
      tokens.push(str.substring(lastIndex));
    }

    return tokens.length > 0 ? tokens : str;
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('>')) {
      flushList(`flush-list-${i}`);
      blockquoteLines.push(trimmed.replace(/^>\s*/, ''));
      return;
    } else {
      flushBlockquote(`flush-bq-${i}`);
    }

    if (!trimmed) {
      flushList(`flush-list-blank-${i}`);
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList(`flush-list-${i}`);
      elements.push(<h3 key={`h3-${i}`} className="guide-h3">{formatInline(trimmed.substring(4))}</h3>);
      return;
    }
    if (trimmed.startsWith('## ')) {
      flushList(`flush-list-${i}`);
      elements.push(<h2 key={`h2-${i}`} className="guide-h2">{formatInline(trimmed.substring(3))}</h2>);
      return;
    }
    if (trimmed.startsWith('# ')) {
      flushList(`flush-list-${i}`);
      elements.push(<h1 key={`h1-${i}`} className="guide-h1">{formatInline(trimmed.substring(2))}</h1>);
      return;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (listType !== 'ul') {
        flushList(`flush-list-before-ul-${i}`);
        currentList = [];
        listType = 'ul';
      }
      currentList.push(<li key={`li-${i}`}>{formatInline(trimmed.substring(2))}</li>);
      return;
    }

    const olMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (olMatch) {
      if (listType !== 'ol') {
        flushList(`flush-list-before-ol-${i}`);
        currentList = [];
        listType = 'ol';
      }
      currentList.push(<li key={`li-${i}`}>{formatInline(olMatch[2])}</li>);
      return;
    }

    flushList(`flush-list-${i}`);
    elements.push(<p key={`p-${i}`} className="guide-p">{formatInline(line)}</p>);
  });

  flushBlockquote('final-bq');
  flushList('final-list');

  return elements;
}

export default function GuidesView({ isAdmin = false, manifest = null }) {
  const [guides, setGuides] = useState(STARTER_GUIDES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModId, setSelectedModId] = useState(STARTER_GUIDES[0].id);
  const [activeChapterId, setActiveChapterId] = useState(STARTER_GUIDES[0].chapters[0].id);

  // Navigations-Ebene in der linken Spalte: 'mods' (Mod-Übersicht) oder 'chapters' (Kapitel-Auswahl)
  const [navLevel, setNavLevel] = useState('mods');

  // Lokale Mods aus dem Entwurf
  const [draftMods, setDraftMods] = useState([]);
  const [modMetaMap, setModMetaMap] = useState({});

  // Edit-Modus
  const [isEditing, setIsEditing] = useState(false);
  const [editedGuide, setEditedGuide] = useState(null);

  // Lightbox
  const [lightboxImage, setLightboxImage] = useState(null);

  // In-App Modale
  const [showNewModModal, setShowNewModModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  // Lokalen Entwurf laden
  useEffect(() => {
    async function loadDraftMods() {
      try {
        if (window.electronAPI?.getModpackDraft) {
          const draft = await window.electronAPI.getModpackDraft();
          if (draft?.mods?.length > 0) {
            setDraftMods(draft.mods);
          }
        }
      } catch (_) {}
    }
    loadDraftMods();
  }, []);

  // Alle verfügbaren Mods
  const availableMods = useMemo(() => {
    const list = (manifest?.mods?.length > 0 ? manifest.mods : draftMods) || [];
    return list.filter(m => m && (m.name || m.slug));
  }, [manifest, draftMods]);

  // Modrinth Metadaten im Batch nachladen
  useEffect(() => {
    if (availableMods.length === 0) return;

    const idsToFetch = availableMods
      .map(m => m.projectId || m.slug)
      .filter(Boolean)
      .slice(0, 100);

    if (idsToFetch.length === 0) return;

    ModrinthService.getProjects(idsToFetch).then(projects => {
      if (Array.isArray(projects) && projects.length > 0) {
        const map = {};
        for (const p of projects) {
          if (p.id) map[p.id] = p;
          if (p.slug) map[p.slug.toLowerCase()] = p;
        }
        setModMetaMap(prev => ({ ...prev, ...map }));
      }
    }).catch(() => {});
  }, [availableMods]);

  // Anleitungen laden
  const loadGuides = async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.getGuides) {
        const res = await window.electronAPI.getGuides();
        if (res?.success && Array.isArray(res.guides) && res.guides.length > 0) {
          const enriched = res.guides.map(g => ({
            ...g,
            iconUrl: resolveGuideIcon(g, availableMods, modMetaMap)
          }));
          setGuides(enriched);
          if (!selectedModId || !enriched.some(g => g.id === selectedModId)) {
            setSelectedModId(enriched[0].id);
            setActiveChapterId(enriched[0].chapters?.[0]?.id || null);
          }
          return;
        }
      }
    } catch (err) {
      console.warn('IPC getGuides nicht erreichbar, nutze integrierte Starter-Guides:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGuides();
  }, [availableMods.length, Object.keys(modMetaMap).length]);

  // Filterung nach Suche
  const filteredGuides = useMemo(() => {
    if (!searchQuery.trim()) return guides;
    const q = searchQuery.toLowerCase();
    return guides.filter(g =>
      (g.title && g.title.toLowerCase().includes(q)) ||
      (g.summary && g.summary.toLowerCase().includes(q)) ||
      (g.modSlug && g.modSlug.toLowerCase().includes(q)) ||
      (g.chapters && g.chapters.some(c =>
        c.title.toLowerCase().includes(q) || (c.content && c.content.toLowerCase().includes(q))
      ))
    );
  }, [guides, searchQuery]);

  // Aktive Mod
  const activeGuide = useMemo(() => {
    return guides.find(g => g.id === selectedModId) || guides[0] || null;
  }, [guides, selectedModId]);

  useEffect(() => {
    if (activeGuide) {
      if (!activeChapterId || !activeGuide.chapters?.some(c => c.id === activeChapterId)) {
        setActiveChapterId(activeGuide.chapters?.[0]?.id || null);
      }
      if (isEditing) {
        setEditedGuide(JSON.parse(JSON.stringify(activeGuide)));
      }
    }
  }, [activeGuide]);

  // Aktives Kapitel
  const activeChapter = useMemo(() => {
    if (!activeGuide?.chapters?.length) return null;
    return activeGuide.chapters.find(c => c.id === activeChapterId) || activeGuide.chapters[0];
  }, [activeGuide, activeChapterId]);

  // Mod in der Liste anklicken -> wechselt sofort zur Kapitel-Ebene!
  const handleSelectMod = (id) => {
    if (isEditing) {
      setConfirmDialog({
        title: 'Ungespeicherte Änderungen',
        message: 'Möchtest du die aktuellen Änderungen an dieser Anleitung verwerfen?',
        confirmText: 'Änderungen verwerfen',
        confirmDanger: true,
        onConfirm: () => {
          setIsEditing(false);
          setSelectedModId(id);
          const target = guides.find(g => g.id === id);
          if (target?.chapters?.length > 0) {
            setActiveChapterId(target.chapters[0].id);
          }
          setNavLevel('chapters');
          setConfirmDialog(null);
        }
      });
      return;
    }
    setSelectedModId(id);
    const target = guides.find(g => g.id === id);
    if (target?.chapters?.length > 0) {
      setActiveChapterId(target.chapters[0].id);
    }
    setNavLevel('chapters');
  };

  // Edit-Modus umschalten
  const toggleEditMode = () => {
    if (!isEditing && activeGuide) {
      setEditedGuide(JSON.parse(JSON.stringify(activeGuide)));
      setIsEditing(true);
      setNavLevel('chapters');
    } else {
      setIsEditing(false);
      setEditedGuide(null);
    }
  };

  // Änderungen speichern
  const handleSaveGuide = async () => {
    if (!editedGuide) return;
    setSaving(true);
    try {
      const updatedGuides = guides.map(g => (g.id === editedGuide.id ? editedGuide : g));
      setGuides(updatedGuides);
      if (window.electronAPI?.saveGuides) {
        const res = await window.electronAPI.saveGuides(updatedGuides);
        if (!res?.success) throw new Error(res?.error || 'Fehler beim Speichern');
      }
      setIsEditing(false);
      setStatusMessage({ type: 'success', text: 'Anleitung erfolgreich gespeichert!' });
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  // Auf GitHub teilen
  const requestPublishGuides = () => {
    setConfirmDialog({
      title: 'Auf GitHub veröffentlichen',
      message: 'Möchtest du alle Anleitungen jetzt auf GitHub synchronisieren, damit sie für alle Mitspieler im Launcher bereitstehen?',
      confirmText: 'Jetzt veröffentlichen',
      confirmDanger: false,
      onConfirm: async () => {
        setConfirmDialog(null);
        setPublishing(true);
        try {
          if (window.electronAPI?.publishGuides) {
            const res = await window.electronAPI.publishGuides();
            if (res?.success) {
              setStatusMessage({ type: 'success', text: 'Anleitungen erfolgreich auf GitHub synchronisiert!' });
              setTimeout(() => setStatusMessage(null), 5000);
            } else {
              throw new Error(res?.error || 'Fehler beim Synchronisieren');
            }
          } else {
            throw new Error('Electron API nicht bereit. Bitte starte den Launcher neu.');
          }
        } catch (err) {
          setStatusMessage({ type: 'error', text: err.message });
        } finally {
          setPublishing(false);
        }
      }
    });
  };

  // Bild für aktuelles Kapitel hochladen
  const handleUploadImageForChapter = async () => {
    if (!window.electronAPI?.uploadGuideImage) {
      setStatusMessage({ type: 'error', text: 'Bild-Upload ist erst nach Neustart des Launchers aktiv.' });
      return;
    }
    try {
      const res = await window.electronAPI.uploadGuideImage();
      if (res?.success && res.dataUrl) {
        setEditedGuide(prev => {
          const next = { ...prev };
          const chapterIdx = next.chapters.findIndex(c => c.id === activeChapterId);
          if (chapterIdx >= 0) {
            const chap = { ...next.chapters[chapterIdx] };
            chap.images = [...(chap.images || []), { url: res.dataUrl, caption: res.fileName || 'Screenshot' }];
            chap.content = (chap.content || '') + `\n\n![${res.fileName || 'Screenshot'}](${res.dataUrl})`;
            next.chapters[chapterIdx] = chap;
          }
          return next;
        });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Bild-Upload fehlgeschlagen: ${err.message}` });
    }
  };

  // Neues Kapitel hinzufügen
  const handleAddChapter = () => {
    if (!editedGuide) return;
    const newChapterId = `chap-${Date.now()}`;
    const newChapterNum = (editedGuide.chapters?.length || 0) + 1;
    const newChapter = {
      id: newChapterId,
      title: `${newChapterNum}. Neues Kapitel`,
      content: '## Neues Kapitel\n\nBeschreibe hier die Funktion der Mod...',
      images: []
    };
    setEditedGuide(prev => ({
      ...prev,
      chapters: [...(prev.chapters || []), newChapter]
    }));
    setActiveChapterId(newChapterId);
  };

  // Kapitel löschen mit In-App Modal
  const requestDeleteChapter = (chapId) => {
    if (!editedGuide || editedGuide.chapters.length <= 1) {
      setStatusMessage({ type: 'error', text: 'Eine Anleitung muss mindestens ein Kapitel haben.' });
      return;
    }
    setConfirmDialog({
      title: 'Kapitel löschen',
      message: 'Möchtest du dieses Kapitel unwiderruflich entfernen?',
      confirmText: 'Kapitel löschen',
      confirmDanger: true,
      onConfirm: () => {
        setEditedGuide(prev => {
          const nextChapters = prev.chapters.filter(c => c.id !== chapId);
          return { ...prev, chapters: nextChapters };
        });
        if (activeChapterId === chapId) {
          const remaining = editedGuide.chapters.filter(c => c.id !== chapId);
          setActiveChapterId(remaining[0]?.id || null);
        }
        setConfirmDialog(null);
      }
    });
  };

  // Mod-Anleitung löschen mit In-App Modal
  const requestDeleteCurrentModGuide = () => {
    if (!activeGuide) return;
    setConfirmDialog({
      title: 'Anleitung löschen',
      message: `Möchtest du die Anleitung für "${activeGuide.title}" wirklich komplett löschen?`,
      confirmText: 'Anleitung löschen',
      confirmDanger: true,
      onConfirm: async () => {
        const nextGuides = guides.filter(g => g.id !== activeGuide.id);
        setGuides(nextGuides);
        if (nextGuides.length > 0) {
          setSelectedModId(nextGuides[0].id);
          setActiveChapterId(nextGuides[0].chapters?.[0]?.id || null);
        } else {
          setSelectedModId(null);
          setActiveChapterId(null);
        }
        setIsEditing(false);
        setNavLevel('mods');
        setConfirmDialog(null);
        if (window.electronAPI?.saveGuides) {
          await window.electronAPI.saveGuides(nextGuides);
        }
      }
    });
  };

  // Ausgewählte Mod aus dem Modal anlegen
  const handleSelectModFromModal = (mod, resolvedIcon) => {
    const title = mod.name || mod.title || mod.slug;
    const slug = mod.slug || title.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    const existing = guides.find(g => g.id === slug || g.modSlug === slug);

    if (existing) {
      setSelectedModId(existing.id);
      setActiveChapterId(existing.chapters?.[0]?.id || null);
      setNavLevel('chapters');
      setShowNewModModal(false);
      return;
    }

    const newGuide = {
      id: slug,
      modSlug: slug,
      title: title,
      iconUrl: resolvedIcon || mod.iconUrl || '',
      summary: mod.summary || mod.description || `Anleitung & Dokumentation für ${title}`,
      chapters: [
        {
          id: `chap-${Date.now()}`,
          title: '1. Einstieg & Grundlagen',
          content: `## Willkommen bei ${title}!\n\nHier findest du alle wichtigen Informationen, Rezepte und Steuerungshinweise für ${title}.`,
          images: []
        }
      ]
    };

    const nextGuides = [...guides, newGuide];
    setGuides(nextGuides);
    setSelectedModId(newGuide.id);
    setActiveChapterId(newGuide.chapters[0].id);
    setEditedGuide(newGuide);
    setIsEditing(true);
    setNavLevel('chapters');
    setShowNewModModal(false);

    if (window.electronAPI?.saveGuides) {
      window.electronAPI.saveGuides(nextGuides);
    }
  };

  return (
    <div className="guides-page-layout">
      {/* Obere Leiste mit Titel & Admin-Buttons */}
      <div className="guides-top-header">
        <div>
          <span className="badge badge-accent" style={{ marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <BookOpen size={13} /> Mod-Handbuch
          </span>
          <h1 className="app-page-title" style={{ margin: 0, fontSize: '24px' }}>Anleitungen & Guides</h1>
          <p className="app-page-subtitle" style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
            Bauanleitungen, Währungssystem, Steuerung und Tipps für unsere Server-Mods
          </p>
        </div>

        {/* Admin Actions oben rechts */}
        {isAdmin && (
          <div className="guides-header-actions">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleSaveGuide}
                  disabled={saving}
                  className="btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Save size={15} />
                  <span>{saving ? 'Wird gespeichert...' : 'Speichern'}</span>
                </button>
                <button
                  type="button"
                  onClick={toggleEditMode}
                  className="btn-secondary"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={requestDeleteCurrentModGuide}
                  title="Ganze Mod-Anleitung löschen"
                  className="mr-icon-button"
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 size={16} />
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={toggleEditMode}
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit3 size={15} />
                  <span>Bearbeiten</span>
                </button>
                <button
                  type="button"
                  onClick={requestPublishGuides}
                  disabled={publishing}
                  className="btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  title="Für alle Mitspieler auf GitHub veröffentlichen"
                >
                  <Share2 size={15} />
                  <span>{publishing ? 'Veröffentliche...' : 'Auf GitHub teilen'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewModModal(true)}
                  className="btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={15} />
                  <span>Neue Mod-Anleitung</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {statusMessage && (
        <div className={`guides-toast-alert ${statusMessage.type}`}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Haupt-Layout: Linke Navigations-Karte + Rechte Lese-Karte */}
      <div className={`guides-content-grid${navLevel === 'chapters' && activeGuide ? '' : ' guides-list-only'}`}>
        {/* Linke Sidebar: Entweder Mod-Liste ODER Kapitel-Auswahl der aktiven Mod mit Zurück-Button */}
        <aside className="guides-nav-card glass-card">
          {navLevel === 'chapters' && activeGuide ? (
            /* EBENE 2: KAPITEL-NAVIGATION DER GEWÄHLTEN MOD */
            <div className="guides-sidebar-chapters-view">
              {/* Zurück-Button zu allen Mods */}
              <button
                type="button"
                className="btn-guides-back"
                onClick={() => setNavLevel('mods')}
              >
                <ArrowLeft size={15} />
                <span>Alle Mod-Anleitungen</span>
              </button>

              {/* Mod-Info in der Seitenleiste */}
              <div className="guide-sidebar-mod-meta">
                <ModIcon
                  iconUrl={resolveGuideIcon(isEditing ? editedGuide : activeGuide, availableMods, modMetaMap)}
                  title={activeGuide.title}
                  size={32}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="guide-sidebar-mod-title">{activeGuide.title}</div>
                  <div className="guide-sidebar-mod-count">
                    {(isEditing ? editedGuide?.chapters : activeGuide.chapters)?.length || 0} Kapitel
                  </div>
                </div>
              </div>

              {/* Vertikale Kapitel-Liste */}
              <div className="guide-sidebar-chapter-list">
                {(isEditing ? editedGuide?.chapters : activeGuide.chapters)?.map((chap, idx) => {
                  const isActive = chap.id === activeChapterId;
                  return (
                    <button
                      key={chap.id}
                      type="button"
                      className={`guide-sidebar-chapter-item ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveChapterId(chap.id)}
                    >
                      <span className="guide-chapter-badge">{idx + 1}</span>
                      <span className="guide-chapter-item-text">{chap.title}</span>
                      {isEditing && (
                        <span
                          className="guide-chapter-item-delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            requestDeleteChapter(chap.id);
                          }}
                          title="Kapitel löschen"
                        >
                          <X size={13} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Admin Button: Kapitel hinzufügen */}
              {isEditing && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleAddChapter}
                  style={{ marginTop: '12px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '12px' }}
                >
                  <Plus size={14} />
                  <span>Kapitel hinzufügen</span>
                </button>
              )}
            </div>
          ) : (
            /* EBENE 1: LISTE ALLER MODS */
            <div className="guides-sidebar-mods-view">
              <div className="guides-search-wrap" style={{ marginBottom: '14px' }}>
                <Search size={15} className="guides-search-icon" />
                <input
                  type="text"
                  placeholder="Mod oder Thema suchen..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="guides-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="guides-search-clear"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="guides-mod-items-list">
                {filteredGuides.map(guide => {
                                    const chapterCount = guide.chapters?.length || 0;
                  const resolvedIcon = resolveGuideIcon(guide, availableMods, modMetaMap);

                  return (
                    <button
                      key={guide.id}
                      type="button"
                      className="guide-overview-card"
                      onClick={() => handleSelectMod(guide.id)}
                    >
                      <div className="guide-overview-head">
                        <ModIcon iconUrl={resolvedIcon} title={guide.title} size={56} />
                        <ChevronRight size={18} className="guide-overview-arrow" aria-hidden="true" />
                      </div>
                      <div className="guide-overview-title">{guide.title}</div>
                      <p className="guide-overview-summary">
                        {guide.summary || 'Erfahre alle Details und Kniffe zu dieser Mod.'}
                      </p>
                      <div className="guide-overview-foot">
                        <span className="badge" style={{ padding: '3px 10px', fontSize: '12px' }}>
                          {chapterCount} {chapterCount === 1 ? 'Kapitel' : 'Kapitel'}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {filteredGuides.length === 0 && (
                  <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    Keine Anleitungen für "{searchQuery}" gefunden.
                  </div>
                )}
              </div>

              {isAdmin && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowNewModModal(true)}
                  style={{ marginTop: '12px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <Plus size={14} />
                  <span>Mod hinzufügen</span>
                </button>
              )}
            </div>
          )}
        </aside>

        {/* Rechte Hauptkarte: Volle Höhe & Platz für den Inhalt! */}
        {navLevel === 'chapters' && activeGuide && (
        <main className="guides-main-panel glass-card">
          {activeGuide ? (
            <div className="guides-detail-wrapper">
              {/* Mod Header */}
              <div className="guide-detail-header">
                <div className="guide-hero-badge-wrap">
                  <ModIcon
                    iconUrl={resolveGuideIcon(isEditing ? editedGuide : activeGuide, availableMods, modMetaMap)}
                    title={activeGuide.title}
                    size={46}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h2 className="guide-detail-title">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editedGuide?.title || ''}
                            onChange={(e) => setEditedGuide({ ...editedGuide, title: e.target.value })}
                            className="app-input"
                            style={{ width: '100%', fontSize: '18px', fontWeight: 700 }}
                          />
                        ) : (
                          activeGuide.title
                        )}
                      </h2>
                      {navLevel === 'mods' && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setNavLevel('chapters')}
                          style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                        >
                          <span>Kapitel anzeigen</span>
                          <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                    <p className="guide-detail-summary">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editedGuide?.summary || ''}
                          onChange={(e) => setEditedGuide({ ...editedGuide, summary: e.target.value })}
                          placeholder="Kurze Zusammenfassung der Mod..."
                          className="app-input"
                          style={{ width: '100%', fontSize: '13px', marginTop: '6px' }}
                        />
                      ) : (
                        activeGuide.summary || 'Erfahre alle Details und Kniffe zu dieser Mod.'
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Kapitel Body: Maximale Höhe ohne blockierende Leisten */}
              <div className="guide-article-scroll-pane">
                {activeChapter ? (
                  <>
                    {isEditing ? (
                      /* Editor Modus */
                      <div className="guide-editor-layout">
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Kapitel-Titel:</label>
                          <input
                            type="text"
                            value={
                              editedGuide?.chapters?.find(c => c.id === activeChapterId)?.title || ''
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditedGuide(prev => {
                                const next = { ...prev };
                                const idx = next.chapters.findIndex(c => c.id === activeChapterId);
                                if (idx >= 0) {
                                  next.chapters[idx] = { ...next.chapters[idx], title: val };
                                }
                                return next;
                              });
                            }}
                            className="app-input"
                            style={{ fontSize: '15px', fontWeight: 600 }}
                          />
                        </div>

                        {/* Toolbar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '8px 12px', background: 'var(--bg-well)', borderRadius: '12px', border: '1px solid var(--border-card)' }}>
                          <button
                            type="button"
                            onClick={handleUploadImageForChapter}
                            className="btn-secondary"
                            style={{ padding: '5px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <ImageIcon size={14} />
                            <span>Bild / Screenshot einfügen</span>
                          </button>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            Tipp: Unterstützt <code>**fett**</code>, <code>*kursiv*</code>, <code>## Überschrift</code>, <code>- Aufzählung</code>, <code>&gt; Infobox</code>
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Inhalt:</label>
                          <textarea
                            rows={18}
                            value={
                              editedGuide?.chapters?.find(c => c.id === activeChapterId)?.content || ''
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditedGuide(prev => {
                                const next = { ...prev };
                                const idx = next.chapters.findIndex(c => c.id === activeChapterId);
                                if (idx >= 0) {
                                  next.chapters[idx] = { ...next.chapters[idx], content: val };
                                }
                                return next;
                              });
                            }}
                            className="app-input"
                            style={{ borderRadius: '12px', padding: '14px', fontFamily: 'inherit', lineHeight: '1.6', resize: 'vertical' }}
                            placeholder="Schreibe die Anleitung..."
                          />
                        </div>
                      </div>
                    ) : (
                      /* Lese Modus */
                      <article className="guide-reading-prose">
                        {renderMarkdownContent(activeChapter.content, (src, alt) => {
                          setLightboxImage({ src, alt });
                        })}

                        {/* Screenshots Galerie */}
                        {activeChapter.images && activeChapter.images.length > 0 && (
                          <div className="guide-screenshots-section">
                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', margin: '0 0 14px 0', color: 'var(--text-main)' }}>
                              <ImageIcon size={16} style={{ color: 'var(--color-primary)' }} />
                              <span>Bilder & Screenshots</span>
                            </h4>
                            <div className="guide-screenshots-grid">
                              {activeChapter.images.map((img, i) => (
                                <figure
                                  key={i}
                                  className="guide-screenshot-card"
                                  onClick={() => setLightboxImage({ src: img.url, alt: img.caption })}
                                >
                                  <img src={img.url} alt={img.caption || 'Screenshot'} />
                                  {img.caption && <figcaption>{img.caption}</figcaption>}
                                </figure>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    )}
                  </>
                ) : (
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Wähle links ein Kapitel aus oder füge ein neues hinzu.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <BookOpen size={48} style={{ opacity: 0.3, marginBottom: '16px', color: 'var(--color-primary)' }} />
              <h3 style={{ color: 'var(--text-main)', margin: '0 0 8px 0' }}>Keine Mod ausgewählt</h3>
              <p style={{ margin: 0 }}>Wähle links eine Mod aus, um die Anleitung zu lesen.</p>
            </div>
          )}
        </main>
        )}
      </div>

      {/* MODAL: Neue Mod-Anleitung anlegen */}
      {showNewModModal && createPortal(
        <NewModGuideModal
          availableMods={availableMods}
          modMetaMap={modMetaMap}
          onSelectMod={handleSelectModFromModal}
          onClose={() => setShowNewModModal(false)}
        />,
        document.body
      )}

      {/* MODAL: In-App Bestätigung */}
      {confirmDialog && createPortal(
        <div className="modal-overlay" onClick={() => setConfirmDialog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              {confirmDialog.confirmDanger ? (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <AlertTriangle size={18} />
                </div>
              ) : (
                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                  <HelpCircle size={18} />
                </div>
              )}
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{confirmDialog.title}</h3>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', lineHeight: '1.5', margin: '0 0 20px 0' }}>
              {confirmDialog.message}
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={() => setConfirmDialog(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className={`modal-btn-primary ${confirmDialog.confirmDanger ? 'danger' : ''}`}
                onClick={confirmDialog.onConfirm}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Lightbox Modal für Screenshots */}
      {lightboxImage && createPortal(
        <div className="guide-lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="guide-lightbox-container" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mr-icon-button guide-lightbox-close"
              onClick={() => setLightboxImage(null)}
            >
              <X size={18} />
            </button>
            <img src={lightboxImage.src} alt={lightboxImage.alt || 'Screenshot'} className="guide-lightbox-img" />
            {lightboxImage.alt && <div className="guide-lightbox-caption">{lightboxImage.alt}</div>}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Modal zur Mod-Auswahl mit echten Icons und Titeln
function NewModGuideModal({ availableMods, modMetaMap, onSelectMod, onClose }) {
  const [filter, setFilter] = useState('');
  const [manualName, setManualName] = useState('');
  const [isManual, setIsManual] = useState(false);

  const filteredMods = useMemo(() => {
    if (!filter.trim()) return availableMods;
    const q = filter.toLowerCase();
    return availableMods.filter(m =>
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.slug && m.slug.toLowerCase().includes(q)) ||
      (m.summary && m.summary.toLowerCase().includes(q))
    );
  }, [availableMods, filter]);

  const handleCreateManual = () => {
    if (!manualName.trim()) return;
    onSelectMod({
      name: manualName.trim(),
      slug: manualName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-'),
      iconUrl: '',
      summary: `Anleitung für ${manualName.trim()}`
    }, '');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--color-primary-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
              <BookOpen size={16} />
            </div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Neue Mod-Anleitung</h3>
          </div>
          <button type="button" className="mr-icon-button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'var(--text-muted)' }}>
          Wähle eine Mod aus deinem Modpack aus. Name, Beschreibung und das offizielle Icon werden automatisch übernommen.
        </p>

        {!isManual ? (
          <>
            <div className="guides-search-wrap" style={{ marginBottom: '12px' }}>
              <Search size={15} className="guides-search-icon" />
              <input
                type="text"
                placeholder="Mod suchen..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="guides-search-input"
                autoFocus
              />
              {filter && (
                <button type="button" onClick={() => setFilter('')} className="guides-search-clear">
                  <X size={13} />
                </button>
              )}
            </div>

            <div style={{ flex: 1, minHeight: '220px', maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
              {filteredMods.map(mod => {
                const icon = resolveGuideIcon(mod, availableMods, modMetaMap);
                return (
                  <div
                    key={mod.slug || mod.name}
                    onClick={() => onSelectMod(mod, icon)}
                    className="guide-card-mod-btn"
                    style={{ cursor: 'pointer' }}
                  >
                    <ModIcon iconUrl={icon} title={mod.name || mod.slug} size={38} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {mod.name || mod.slug}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {mod.summary || mod.description || mod.slug}
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
                  </div>
                );
              })}

              {filteredMods.length === 0 && (
                <div style={{ padding: '30px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Keine Mod gefunden. Du kannst auch ein eigenes Thema anlegen:
                </div>
              )}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-card)', paddingTop: '14px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsManual(true)}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Eigenes Thema ohne Mod anlegen
              </button>
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={onClose}
                style={{ flex: 'none', padding: '0 16px' }}
              >
                Abbrechen
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Thema oder Mod-Name:</label>
              <input
                type="text"
                placeholder="z.B. Server-Regeln, Quests, Tipps..."
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                className="app-input"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                className="modal-btn-secondary"
                onClick={() => setIsManual(false)}
              >
                Zurück zur Mod-Liste
              </button>
              <button
                type="button"
                className="modal-btn-primary"
                disabled={!manualName.trim()}
                onClick={handleCreateManual}
              >
                Anleitung anlegen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
