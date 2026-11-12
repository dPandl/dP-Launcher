import React, { useEffect, useState } from 'react';

const BANNER_FILE_RE = /^[A-Za-z0-9._-]+\.png$/;

// Name, Beschreibung und Banner eines Servers. Was auf GitHub (Manifest) steht, gilt vor der Serverdatei.
export function resolveServerPresentation(manifest, server) {
  const title = manifest?.serverName || server?.name || 'Minecraft Server';
  const description = manifest?.serverDescription || server?.description || '';

  let githubBanner = '';
  const file = manifest?.serverBanner;
  if (typeof file === 'string' && BANNER_FILE_RE.test(file) && server?.owner && server?.repo) {
    const version = String(manifest.serverBannerVersion || '').replace(/[^A-Za-z0-9]/g, '');
    githubBanner = `https://raw.githubusercontent.com/${server.owner}/${server.repo}/${server.branch || 'main'}/${file}${version ? `?v=${version}` : ''}`;
  }

  return { title, description, githubBanner };
}

// Banner, das als Datei auf diesem PC liegt (in den Einstellungen steht nur ein Hash). Liefert '' ohne Banner.
export function useBannerFile(ownerId, hash) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let cancelled = false;
    if (!hash || !ownerId || !window.electronAPI?.readBanner) {
      setSrc('');
      return undefined;
    }
    window.electronAPI.readBanner(ownerId).then(url => { if (!cancelled) setSrc(url || ''); });
    return () => { cancelled = true; };
  }, [ownerId, hash]);
  return src;
}

// Banner eines Servers für Listen und Karten, in denen kein Manifest geladen ist.
// Zuerst das Banner aus dem GitHub-Repository des Servers, sonst das aus der Serverdatei. Liefert '' ohne Banner.
export function useServerBannerSrc(server) {
  const [src, setSrc] = useState('');
  const fileSrc = useBannerFile(server?.id, server?.banner);
  const key = `${server?.id}|${server?.owner}/${server?.repo}/${server?.branch}|${fileSrc.length}`;

  useEffect(() => {
    let cancelled = false;
    setSrc('');
    const github = server?.owner && server?.repo
      ? `https://raw.githubusercontent.com/${server.owner}/${server.repo}/${server.branch || 'main'}/server-banner.png`
      : '';
    const sources = [github, fileSrc].filter(Boolean);
    const tryNext = (index) => {
      if (cancelled || index >= sources.length) return;
      const image = new Image();
      image.onload = () => { if (!cancelled) setSrc(sources[index]); };
      image.onerror = () => tryNext(index + 1);
      image.src = sources[index];
    };
    tryNext(0);
    return () => { cancelled = true; };
  }, [key]);

  return src;
}

// Überschrift der Server-Seite: Das Banner ersetzt den Namen, wenn eines da ist
export default function ServerHeading({ manifest, server }) {
  const { title, description, githubBanner } = resolveServerPresentation(manifest, server);
  const fileBanner = useBannerFile(server?.id, server?.banner);
  const [failed, setFailed] = useState([]);

  useEffect(() => {
    setFailed([]);
  }, [githubBanner, fileBanner]);

  const banner = [githubBanner, fileBanner].filter(Boolean).find(src => !failed.includes(src)) || '';

  return (
    <>
      <h1 className="app-page-title" style={{ fontSize: '26px', marginBottom: '6px' }}>
        {banner ? (
          <img
            src={banner}
            alt={title}
            onError={() => setFailed(prev => [...prev, banner])}
            style={{ display: 'block', width: 'min(420px, 100%)', aspectRatio: '3 / 1', objectFit: 'cover', borderRadius: '14px' }}
          />
        ) : title}
      </h1>
      {description && (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', maxWidth: '520px', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {description}
        </p>
      )}
    </>
  );
}
