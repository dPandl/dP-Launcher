import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, Download, Heart, ExternalLink, RefreshCw, FileText, Image as ImageIcon, ScrollText, List,
  Bug, Code, BookOpen, MessageCircle, Coins, Scale, Calendar, ChevronDown, ChevronLeft, ChevronRight, X, FileArchive, Loader2
} from 'lucide-react';
import { ModrinthService } from '../../services/modrinthService';
import { registerBackHandler } from '../../utils/navigation';
import Dropdown from '../common/Dropdown';
import {
  MarkdownView,
  ProjectIcon,
  extractModrinthProjectRef,
  formatCount,
  formatDate,
  formatFileSize,
  formatTagName,
  getProjectUrl,
  isSnapshotVersion,
  openExternal
} from './modrinthUi';

const VERSION_PAGE_SIZE = 20;
const COLLAPSED_GAME_VERSIONS = 12;

const CHANNEL_LABELS = { release: 'Release', beta: 'Beta', alpha: 'Alpha' };
const DEPENDENCY_LABELS = { required: 'Erforderlich', optional: 'Optional', incompatible: 'Inkompatibel', embedded: 'Enthalten' };
const SIDE_LABELS = { required: 'Erforderlich', optional: 'Optional', unsupported: 'Nicht unterstützt', unknown: 'Unbekannt' };

function ChannelBadge({ channel }) {
  return <span className={`mr-channel mr-channel-${channel}`}>{CHANNEL_LABELS[channel] || channel}</span>;
}

function SideCard({ title, children }) {
  return (
    <div className="glass-card mr-side-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function VersionDetails({ version, dependencyInfo, onOpenProject }) {
  const projectById = dependencyInfo.projects;
  const projectIdByVersion = dependencyInfo.versions;

  return (
    <div className="mr-version-details" onClick={(e) => e.stopPropagation()}>
      <h4>Änderungen</h4>
      {version.changelog ? <MarkdownView source={version.changelog} onOpenProject={onOpenProject} /> : <p className="mr-muted">Keine Änderungsnotiz angegeben.</p>}

      <h4>Dateien</h4>
      {version.files.map(file => (
        <div key={file.filename} className="mr-file-row">
          <FileArchive size={15} />
          <span className="selectable-text" style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' }}>{file.filename}</span>
          {file.primary && <span className="mr-tag">Primär</span>}
          <span className="mr-muted">{formatFileSize(file.size)}</span>
        </div>
      ))}

      {version.dependencies?.length > 0 && (
        <>
          <h4>Abhängigkeiten</h4>
          {version.dependencies.map((dep, index) => {
            const projectId = dep.project_id || projectIdByVersion.get(dep.version_id);
            const project = projectById.get(projectId);
            return (
              <div key={`${projectId || dep.file_name}-${index}`} className="mr-file-row">
                {project ? (
                  <button type="button" className="mr-dep-link" onClick={() => onOpenProject(project.slug || project.id)}>
                    <ProjectIcon url={project.icon_url} size={24} />
                    <span>{project.title}</span>
                  </button>
                ) : (
                  <span style={{ flex: 1 }}>{dep.file_name || projectId || 'Unbekannt'}</span>
                )}
                <span className="mr-tag">{DEPENDENCY_LABELS[dep.dependency_type] || dep.dependency_type}</span>
              </div>
            );
          })}
        </>
      )}

      <h4>Details</h4>
      <div className="mr-muted" style={{ fontSize: '12px', lineHeight: 1.7 }}>
        <div>Spielversionen: {version.game_versions.join(', ')}</div>
        <div>Loader: {version.loaders.map(formatTagName).join(', ')}</div>
        <div>Veröffentlicht: {formatDate(version.date_published)}</div>
        <div>Downloads: {version.downloads.toLocaleString('de-DE')}</div>
      </div>
    </div>
  );
}

export default function ModrinthProjectDetail({
  projectRef,
  type,
  lockedGameVersion,
  lockedLoader,
  renderAction,
  renderVersionAction,
  onBack,
  onOpenProject,
  active = true
}) {
  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [versions, setVersions] = useState(null);
  const [dependencies, setDependencies] = useState({ projects: [], versions: [] });
  const [error, setError] = useState(null);
  const [retryCounter, setRetryCounter] = useState(0);

  const [tab, setTab] = useState('description');
  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [lightboxImageLoaded, setLightboxImageLoaded] = useState(false);
  const [showAllGameVersions, setShowAllGameVersions] = useState(false);

  const galleryList = useMemo(() => {
    return [...(project?.gallery || [])].sort((a, b) => (a.ordering || 0) - (b.ordering || 0));
  }, [project?.gallery]);

  const currentImage = lightboxIndex !== null && galleryList[lightboxIndex] ? galleryList[lightboxIndex] : null;

  const handlePrevImage = (e) => {
    if (e) e.stopPropagation();
    if (galleryList.length <= 1) return;
    setLightboxImageLoaded(false);
    setLightboxIndex(prev => (prev > 0 ? prev - 1 : galleryList.length - 1));
  };

  const handleNextImage = (e) => {
    if (e) e.stopPropagation();
    if (galleryList.length <= 1) return;
    setLightboxImageLoaded(false);
    setLightboxIndex(prev => (prev < galleryList.length - 1 ? prev + 1 : 0));
  };

  // Bilder vorab cachen (Preload), damit das Durchblättern verzögerungsfrei ist
  useEffect(() => {
    if (lightboxIndex === null || galleryList.length === 0) return;
    setLightboxImageLoaded(false);

    if (galleryList.length > 1) {
      const nextIdx = (lightboxIndex + 1) % galleryList.length;
      const prevIdx = (lightboxIndex - 1 + galleryList.length) % galleryList.length;
      [galleryList[nextIdx], galleryList[prevIdx]].forEach(item => {
        const src = item?.raw_url || item?.url;
        if (src) {
          const img = new Image();
          img.src = src;
        }
      });
    }
  }, [lightboxIndex, active, galleryList]);

  // Wenn der Galerie-Tab geöffnet wird, die ersten Originalbilder direkt im Hintergrund vorladen
  useEffect(() => {
    if (tab === 'gallery' && galleryList.length > 0) {
      galleryList.slice(0, 4).forEach(item => {
        const src = item?.raw_url || item?.url;
        if (src) {
          const img = new Image();
          img.src = src;
        }
      });
    }
  }, [tab, galleryList]);

  // Klinkt die Lightbox in den Zurück-Button unten links ein (schließt nur die Vorschau)
  useEffect(() => {
    if (lightboxIndex === null || !active) return undefined;
    return registerBackHandler(() => {
      setLightboxIndex(null);
    }, 'Vorschau schließen');
  }, [lightboxIndex, active]);

  // Tastatursteuerung: Pfeiltasten (vor / zurück) & Escape
  useEffect(() => {
    if (lightboxIndex === null || !active) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevImage();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextImage();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setLightboxIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, active, galleryList.length]);

  const [gameVersionFilter, setGameVersionFilter] = useState('');
  const [loaderFilter, setLoaderFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [versionLimit, setVersionLimit] = useState(VERSION_PAGE_SIZE);
  const [expandedVersionId, setExpandedVersionId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setProject(null);
    ModrinthService.getProject(projectRef)
      .then(data => {
        if (!cancelled) setProject(data);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      });

    // Ersteller, Versionen und Abhängigkeiten sind Zusatzinfos und dürfen einzeln fehlen
    ModrinthService.getProjectMembers(projectRef)
      .then(data => { if (!cancelled) setMembers(data); })
      .catch(err => console.warn(err));
    ModrinthService.getProjectVersions(projectRef, { gameVersion: lockedGameVersion || '', loader: lockedLoader || '' })
      .then(data => { if (!cancelled) setVersions(data); })
      .catch(() => { if (!cancelled) setVersions([]); });
    ModrinthService.getProjectDependencies(projectRef)
      .then(data => { if (!cancelled) setDependencies(data); })
      .catch(err => console.warn(err));

    return () => { cancelled = true; };
  }, [projectRef, lockedGameVersion, lockedLoader, retryCounter]);

  const dependencyInfo = useMemo(() => ({
    projects: new Map((dependencies.projects || []).map(p => [p.id, p])),
    versions: new Map((dependencies.versions || []).map(v => [v.id, v.project_id]))
  }), [dependencies]);

  const versionFilterOptions = useMemo(() => ({
    gameVersions: [...new Set((versions || []).flatMap(v => v.game_versions))].filter(v => !isSnapshotVersion(v)),
    loaders: [...new Set((versions || []).flatMap(v => v.loaders))],
    channels: [...new Set((versions || []).map(v => v.version_type))]
  }), [versions]);

  const filteredVersions = useMemo(() => (versions || []).filter(v =>
    (!gameVersionFilter || v.game_versions.includes(gameVersionFilter))
    && (!loaderFilter || v.loaders.includes(loaderFilter))
    && (!channelFilter || v.version_type === channelFilter)
  ), [versions, gameVersionFilter, loaderFilter, channelFilter]);

  useEffect(() => {
    setVersionLimit(VERSION_PAGE_SIZE);
  }, [gameVersionFilter, loaderFilter, channelFilter]);

  if (error) {
    return (
      <div className="glass-card mr-empty">
        <p>Projekt konnte nicht geladen werden: {error}</p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '12px' }}>
          <button type="button" className="btn-secondary" onClick={() => setRetryCounter(c => c + 1)}><RefreshCw size={14} /> Erneut versuchen</button>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="glass-card mr-empty">
        <RefreshCw size={22} className="spin" />
        <p style={{ marginTop: '8px' }}>Projekt wird geladen...</p>
      </div>
    );
  }

  const releaseGameVersions = [...(project.game_versions || [])].filter(v => !isSnapshotVersion(v)).reverse();
  const visibleGameVersions = showAllGameVersions ? releaseGameVersions : releaseGameVersions.slice(0, COLLAPSED_GAME_VERSIONS);

  const links = [
    { url: project.issues_url, label: 'Fehler melden', icon: Bug },
    { url: project.source_url, label: 'Quellcode', icon: Code },
    { url: project.wiki_url, label: 'Wiki', icon: BookOpen },
    { url: project.discord_url, label: 'Discord', icon: MessageCircle },
    ...(project.donation_urls || []).map(donation => ({ url: donation.url, label: donation.platform || 'Spenden', icon: Coins }))
  ].filter(link => link.url);

  const tabs = [
    { id: 'description', label: 'Beschreibung', icon: FileText },
    ...(project.gallery?.length > 0 ? [{ id: 'gallery', label: `Galerie (${project.gallery.length})`, icon: ImageIcon }] : []),
    ...(type.hasVersions ? [
      { id: 'changelog', label: 'Changelog', icon: ScrollText },
      { id: 'versions', label: `Versionen${versions ? ` (${versions.length})` : ''}`, icon: List }
    ] : [])
  ];

  const licenseLabel = project.license?.name || (project.license?.id || '').replace(/^LicenseRef-/, '').replace(/-/g, ' ');

  return (
    <div className="mr-detail">
      {/* Zurück: der schwebende Knopf unten links (siehe GlobalBackButton) und Escape */}

      {/* Kopfbereich */}
      <div className="glass-card mr-detail-header">
        <ProjectIcon url={project.icon_url} size={88} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="selectable-text">{project.title}</h1>
          <p className="mr-muted selectable-text" style={{ fontSize: '14px', marginTop: '4px' }}>{project.description}</p>
          <div className="mr-result-stats" style={{ flexDirection: 'row', marginTop: '10px', flexWrap: 'wrap' }}>
            <span><Download size={14} /> {formatCount(project.downloads)} Downloads</span>
            <span><Heart size={14} /> {formatCount(project.followers)} Follower</span>
            <span><Calendar size={14} /> Aktualisiert am {formatDate(project.updated)}</span>
          </div>
          <div className="mr-result-tags" style={{ marginTop: '10px' }}>
            {[...(project.categories || []), ...(project.additional_categories || [])].map(category => (
              <span key={category} className="mr-tag">{formatTagName(category)}</span>
            ))}
          </div>
        </div>
        <div className="mr-detail-actions">
          {renderAction && renderAction(project, type)}
          <button type="button" className="btn-secondary" onClick={() => openExternal(getProjectUrl(type, project.slug))}>
            <ExternalLink size={14} /> Auf Modrinth
          </button>
        </div>
      </div>

      <div className="mr-detail-layout">
        <div style={{ minWidth: 0 }}>
          <div className="mr-detail-tabs">
            {tabs.map(entry => {
              const Icon = entry.icon;
              return (
                <button key={entry.id} type="button" className={`mr-detail-tab ${tab === entry.id ? 'active' : ''}`} onClick={() => setTab(entry.id)}>
                  <Icon size={14} /> {entry.label}
                </button>
              );
            })}
          </div>

          {tab === 'description' && (
            <div className="glass-card"><MarkdownView source={project.body || project.description} onOpenProject={onOpenProject} /></div>
          )}

          {tab === 'gallery' && (
            <div className="mr-gallery">
              {galleryList.map((image, index) => (
                <button key={image.url || index} type="button" className="mr-gallery-item" onClick={() => setLightboxIndex(index)}>
                  <img src={image.url} alt={image.title || ''} loading="lazy" />
                  {(image.title || image.description) && (
                    <div className="mr-gallery-caption">
                      {image.title && <strong>{image.title}</strong>}
                      {image.description && <span>{image.description}</span>}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {tab === 'changelog' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {!versions && <div className="glass-card mr-empty">Versionen werden geladen...</div>}
              {versions?.length === 0 && <div className="glass-card mr-empty">Keine passenden Versionen gefunden.</div>}
              {(versions || []).slice(0, versionLimit).map(version => (
                <div key={version.id} className="glass-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <ChannelBadge channel={version.version_type} />
                    <strong style={{ color: 'var(--text-main)', fontSize: '14px' }}>{version.name || version.version_number}</strong>
                    <span className="mr-muted">{formatDate(version.date_published)}</span>
                  </div>
                  {version.changelog ? <MarkdownView source={version.changelog} onOpenProject={onOpenProject} /> : <p className="mr-muted">Keine Änderungsnotiz angegeben.</p>}
                </div>
              ))}
              {versions && versions.length > versionLimit && (
                <button type="button" className="btn-secondary" style={{ justifyContent: 'center' }} onClick={() => setVersionLimit(v => v + VERSION_PAGE_SIZE)}>
                  Mehr anzeigen
                </button>
              )}
            </div>
          )}

          {tab === 'versions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="mr-toolbar">
                {!lockedGameVersion && (
                  <label>
                    Spielversion
                    <Dropdown value={gameVersionFilter} onChange={(e) => setGameVersionFilter(e.target.value)}>
                      <option value="">Alle</option>
                      {versionFilterOptions.gameVersions.map(v => <option key={v} value={v}>{v}</option>)}
                    </Dropdown>
                  </label>
                )}
                {!lockedLoader && (
                  <label>
                    Loader
                    <Dropdown value={loaderFilter} onChange={(e) => setLoaderFilter(e.target.value)}>
                      <option value="">Alle</option>
                      {versionFilterOptions.loaders.map(v => <option key={v} value={v}>{formatTagName(v)}</option>)}
                    </Dropdown>
                  </label>
                )}
                <label>
                  Kanal
                  <Dropdown value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
                    <option value="">Alle</option>
                    {versionFilterOptions.channels.map(v => <option key={v} value={v}>{CHANNEL_LABELS[v] || v}</option>)}
                  </Dropdown>
                </label>
                <span style={{ flex: 1 }} />
                {versions && <span className="mr-muted">{filteredVersions.length} Versionen</span>}
              </div>

              {!versions && <div className="glass-card mr-empty">Versionen werden geladen...</div>}
              {versions && filteredVersions.length === 0 && (
                <div className="glass-card mr-empty">
                  {lockedGameVersion
                    ? `Keine Version für ${lockedGameVersion}${lockedLoader ? ` (${formatTagName(lockedLoader)})` : ''} verfügbar.`
                    : 'Keine Version passt zu den Filtern.'}
                </div>
              )}

              {filteredVersions.slice(0, versionLimit).map(version => {
                const expanded = expandedVersionId === version.id;
                return (
                  <div key={version.id} className="mr-version" onClick={() => setExpandedVersionId(expanded ? null : version.id)}>
                    <div className="mr-version-row">
                      <ChevronDown size={15} className="mr-muted" style={{ flexShrink: 0, transform: expanded ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }} />
                      <ChannelBadge channel={version.version_type} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mr-version-name">{version.name || version.version_number}</div>
                        <div className="mr-muted" style={{ fontSize: '12px' }}>
                          {version.version_number} · {version.loaders.map(formatTagName).join(', ')} · {version.game_versions.filter(v => !isSnapshotVersion(v)).slice(-3).join(', ') || version.game_versions.slice(-1)[0]}
                        </div>
                      </div>
                      <div className="mr-muted" style={{ fontSize: '12px', textAlign: 'right', flexShrink: 0 }}>
                        <div>{formatDate(version.date_published)}</div>
                        <div>{formatCount(version.downloads)} Downloads</div>
                      </div>
                      {renderVersionAction && (
                        <div onClick={(e) => e.stopPropagation()}>
                          {renderVersionAction(project, version, type)}
                        </div>
                      )}
                    </div>
                    {expanded && <VersionDetails version={version} dependencyInfo={dependencyInfo} onOpenProject={onOpenProject} />}
                  </div>
                );
              })}

              {filteredVersions.length > versionLimit && (
                <button type="button" className="btn-secondary" style={{ justifyContent: 'center' }} onClick={() => setVersionLimit(v => v + VERSION_PAGE_SIZE)}>
                  Mehr anzeigen
                </button>
              )}
            </div>
          )}
        </div>

        {/* Seitenspalte */}
        <aside className="mr-detail-side">
          {type.hasVersions && (
            <SideCard title="Kompatibilität">
              {releaseGameVersions.length > 0 && (
                <>
                  <div className="mr-side-label">Spielversionen</div>
                  <div className="mr-result-tags">
                    {visibleGameVersions.map(version => <span key={version} className="mr-tag">{version}</span>)}
                  </div>
                  {releaseGameVersions.length > COLLAPSED_GAME_VERSIONS && (
                    <button type="button" className="mr-text-button" onClick={() => setShowAllGameVersions(!showAllGameVersions)}>
                      {showAllGameVersions ? 'Weniger anzeigen' : `Alle ${releaseGameVersions.length} anzeigen`}
                    </button>
                  )}
                </>
              )}
              {project.loaders?.length > 0 && (
                <>
                  <div className="mr-side-label">Loader</div>
                  <div className="mr-result-tags">
                    {project.loaders.map(loader => <span key={loader} className="mr-tag">{formatTagName(loader)}</span>)}
                  </div>
                </>
              )}
              {type.hasEnvironment && (
                <>
                  <div className="mr-side-label">Umgebung</div>
                  <div className="mr-side-row"><span>Client</span><span>{SIDE_LABELS[project.client_side] || project.client_side}</span></div>
                  <div className="mr-side-row"><span>Server</span><span>{SIDE_LABELS[project.server_side] || project.server_side}</span></div>
                </>
              )}
            </SideCard>
          )}

          {links.length > 0 && (
            <SideCard title="Links">
              {links.map(link => {
                const Icon = link.icon;
                return (
                  <button
                    key={`${link.label}-${link.url}`}
                    type="button"
                    className="mr-side-link"
                    onClick={() => {
                      const ref = extractModrinthProjectRef(link.url);
                      if (ref && typeof onOpenProject === 'function') {
                        onOpenProject(ref);
                      } else {
                        openExternal(link.url);
                      }
                    }}
                  >
                    <Icon size={14} /> {link.label} <ExternalLink size={11} style={{ marginLeft: 'auto', opacity: 0.6 }} />
                  </button>
                );
              })}
            </SideCard>
          )}

          {members.length > 0 && (
            <SideCard title="Ersteller">
              {members.map(member => (
                <div key={member.user.id} className="mr-member">
                  {member.user.avatar_url
                    ? <img src={member.user.avatar_url} alt="" />
                    : <div className="mr-member-placeholder" />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-main)', fontSize: '13px', fontWeight: 600 }}>{member.user.username}</div>
                    <div className="mr-muted" style={{ fontSize: '11px' }}>{member.role}</div>
                  </div>
                </div>
              ))}
            </SideCard>
          )}

          <SideCard title="Details">
            {licenseLabel && (
              <div className="mr-side-row">
                <span><Scale size={12} /> Lizenz</span>
                {project.license?.url
                  ? <button type="button" className="mr-text-button" style={{ marginTop: 0, textAlign: 'right' }} onClick={() => openExternal(project.license.url)}>{licenseLabel}</button>
                  : <span>{licenseLabel}</span>}
              </div>
            )}
            <div className="mr-side-row"><span>Veröffentlicht</span><span>{formatDate(project.published)}</span></div>
            <div className="mr-side-row"><span>Aktualisiert</span><span>{formatDate(project.updated)}</span></div>
          </SideCard>
        </aside>
      </div>

      {currentImage && (
        <div className="mr-lightbox" onClick={() => setLightboxIndex(null)}>
          <button
            type="button"
            className="mr-lightbox-close"
            onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
            title="Vorschau schließen (Esc)"
          >
            <X size={20} />
          </button>

          {galleryList.length > 1 && (
            <>
              <button
                type="button"
                className="mr-lightbox-nav prev"
                onClick={handlePrevImage}
                title="Vorheriges Bild (Pfeiltaste links)"
              >
                <ChevronLeft size={28} />
              </button>
              <button
                type="button"
                className="mr-lightbox-nav next"
                onClick={handleNextImage}
                title="Nächstes Bild (Pfeiltaste rechts)"
              >
                <ChevronRight size={28} />
              </button>
            </>
          )}

          {!lightboxImageLoaded && (
            <div style={{ position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <Loader2 size={40} className="spin" style={{ color: 'var(--accent, #f97316)' }} />
            </div>
          )}
          <img
            key={currentImage.raw_url || currentImage.url}
            src={currentImage.raw_url || currentImage.url}
            alt={currentImage.title || ''}
            onLoad={() => setLightboxImageLoaded(true)}
            style={{
              opacity: lightboxImageLoaded ? 1 : 0,
              transition: 'opacity 0.2s ease-in-out'
            }}
            onClick={(e) => e.stopPropagation()}
          />

          <div className="mr-lightbox-footer" onClick={(e) => e.stopPropagation()}>
            {galleryList.length > 1 && (
              <div className="mr-lightbox-counter">
                {lightboxIndex + 1} / {galleryList.length}
              </div>
            )}
            {currentImage.title && <div className="mr-lightbox-caption">{currentImage.title}</div>}
            {currentImage.description && (
              <div style={{ color: 'rgba(255, 255, 255, 0.75)', fontSize: '12.5px', maxWidth: '600px', textAlign: 'center' }}>
                {currentImage.description}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
