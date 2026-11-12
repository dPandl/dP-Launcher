import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Package, Palette, Database, Sparkles, Boxes, Puzzle, Server } from 'lucide-react';

// Modrinth führt Datapacks und Plugins unter den Mod-Kategorien
export const PROJECT_TYPES = {
  mod: { id: 'mod', label: 'Mods', icon: Package, categoryType: 'mod', loaderType: 'mod', hasEnvironment: true, hasVersions: true, installDir: 'mods', pathSegment: 'mod' },
  resourcepack: { id: 'resourcepack', label: 'Resourcepacks', icon: Palette, categoryType: 'resourcepack', hasVersions: true, installDir: 'resourcepacks', pathSegment: 'resourcepack' },
  datapack: { id: 'datapack', label: 'Datapacks', icon: Database, categoryType: 'mod', hasVersions: true, pathSegment: 'datapack' },
  shader: { id: 'shader', label: 'Shader', icon: Sparkles, categoryType: 'shader', loaderType: 'shader', hasVersions: true, installDir: 'shaderpacks', pathSegment: 'shader' },
  modpack: { id: 'modpack', label: 'Modpacks', icon: Boxes, categoryType: 'modpack', loaderType: 'modpack', hasEnvironment: true, hasVersions: true, pathSegment: 'modpack' },
  plugin: { id: 'plugin', label: 'Plugins', icon: Puzzle, categoryType: 'mod', loaderType: 'plugin', hasVersions: true, pathSegment: 'plugin' },
  minecraft_java_server: { id: 'minecraft_java_server', label: 'Server', icon: Server, categoryType: 'minecraft_java_server', pathSegment: 'server' }
};

export const SORT_OPTIONS = [
  { id: 'relevance', label: 'Relevanz' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'follows', label: 'Follower' },
  { id: 'newest', label: 'Neueste' },
  { id: 'updated', label: 'Zuletzt aktualisiert' }
];

const CATEGORY_HEADERS = {
  categories: 'Kategorien',
  features: 'Merkmale',
  resolutions: 'Auflösung',
  'performance impact': 'Leistung',
  minecraft_server_meta: 'Server-Eigenschaften',
  minecraft_server_gameplay: 'Spielweise',
  minecraft_server_features: 'Funktionen',
  minecraft_server_community: 'Community'
};

export function getCategoryHeaderLabel(header) {
  return CATEGORY_HEADERS[header] || header;
}

export function getProjectUrl(type, slug) {
  return `https://modrinth.com/${type.pathSegment}/${slug}`;
}

export function formatTagName(name) {
  return String(name || '').replace(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase());
}

export function formatCount(value) {
  return new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

export function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('de-DE') : '–';
}

export function formatFileSize(bytes) {
  if (!bytes) return '–';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function isSnapshotVersion(version) {
  return /snapshot|-pre|-rc|^\d{2}w\d{2}|^(a|b|c|rd|inf)[-\d]/i.test(version);
}

export function extractModrinthProjectRef(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null;
  const trimmed = urlStr.trim();
  try {
    const parsed = new URL(trimmed, 'https://modrinth.com');
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'modrinth.com' || hostname === 'www.modrinth.com' || hostname === 'beta.modrinth.com' || hostname === 'staging.modrinth.com') {
      const match = parsed.pathname.match(/^\/(?:mod|plugin|datapack|resourcepack|shader|project)\/([a-zA-Z0-9_\-\.]+)/i);
      if (match && match[1]) {
        return match[1];
      }
    }
  } catch (e) {
    const relMatch = trimmed.match(/^(?:\/)?(?:mod|plugin|datapack|resourcepack|shader|project)\/([a-zA-Z0-9_\-\.]+)/i);
    if (relMatch && relMatch[1]) {
      return relMatch[1];
    }
  }
  return null;
}

export function openExternal(url) {
  if (!/^https?:\/\//i.test(url || '')) return;
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

export function TagIcon({ svg }) {
  const clean = useMemo(() => DOMPurify.sanitize(svg || '', { USE_PROFILES: { svg: true } }), [svg]);
  if (!clean) return null;
  return <span className="mr-tag-icon" dangerouslySetInnerHTML={{ __html: clean }} />;
}

// Beschreibungen sind fremdes Markdown mit HTML: bereinigen und Links nie im App-Fenster öffnen
// Modrinth-Projektlinks werden intern geöffnet, wenn onOpenProject übergeben wird
export function MarkdownView({ source, onOpenProject }) {
  const containerRef = useRef(null);
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(source || '', { async: false }), {
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style']
  }), [source]);

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const links = containerRef.current.querySelectorAll('a');
    links.forEach(link => {
      const href = link.getAttribute('href') || link.href;
      const projectRef = extractModrinthProjectRef(href);
      if (projectRef && typeof onOpenProject === 'function') {
        link.classList.remove('mr-external-link');
        link.classList.add('mr-internal-link');
        link.setAttribute('title', `In dP Launcher öffnen: ${projectRef}`);
      } else {
        link.classList.remove('mr-internal-link');
        link.classList.add('mr-external-link');
        link.setAttribute('title', 'Im Browser öffnen (extern)');
      }
    });
  }, [html, onOpenProject]);

  const handleClick = (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute('href') || link.href;
    const projectRef = extractModrinthProjectRef(href);
    if (projectRef && typeof onOpenProject === 'function') {
      onOpenProject(projectRef);
    } else {
      openExternal(link.href || href);
    }
  };

  return <div ref={containerRef} className="mr-markdown selectable-text" onClick={handleClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function ProjectIcon({ url, size = 64 }) {
  const style = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className="mr-project-icon"
        style={style}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className="mr-project-icon" style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Package size={Math.round(size / 2)} color="var(--text-muted)" />
    </div>
  );
}
