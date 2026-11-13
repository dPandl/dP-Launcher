import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Download, Heart, RefreshCw, X, ChevronLeft, ChevronRight, ChevronDown, Calendar, Lock } from 'lucide-react';
import { ModrinthService } from '../../services/modrinthService';
import ModrinthProjectDetail from './ModrinthProjectDetail';
import { registerBackHandler } from '../../utils/navigation';
import Dropdown from '../common/Dropdown';
import {
  PROJECT_TYPES,
  SORT_OPTIONS,
  TagIcon,
  ProjectIcon,
  formatCount,
  formatDate,
  formatTagName,
  getCategoryHeaderLabel
} from './modrinthUi';

const PAGE_SIZES = [10, 20, 50];
const SEARCH_DEBOUNCE_MS = 300;
const EMPTY_FILTERS = { gameVersions: [], loaders: [], categories: [], environments: [], openSource: false };

function toggleValue(list, value) {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value];
}

function FilterSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mr-filter-section">
      <button type="button" className="mr-filter-title" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <ChevronDown size={14} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }} />
      </button>
      {open && <div className="mr-filter-options">{children}</div>}
    </div>
  );
}

function FilterOption({ checked, onChange, icon, label }) {
  return (
    <label className={`mr-filter-option ${checked ? 'active' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      {icon && <TagIcon svg={icon} />}
      <span>{label}</span>
    </label>
  );
}

/**
 * Modrinth-Browser mit Typen, Filtern, Suche, Seiten und Detailseiten.
 * Was man mit einem Projekt tun kann, bestimmt die einbindende Ansicht.
 */
export default function ModrinthBrowser({
  projectTypes = Object.keys(PROJECT_TYPES),
  lockedGameVersion: lockedGameVersionProp = null,
  lockedLoader: lockedLoaderProp = null,
  getDefaultFilters = () => EMPTY_FILTERS,
  renderAction,
  renderVersionAction,
  openRequest = null,
  onReturnFromRequest = null, // wird statt der Liste gezeigt, wenn die Detailseite von außen geöffnet wurde
  lockedLabel = 'Festgelegt durch den Server',
  active = true // false, wenn die Ansicht nur versteckt weiterlebt (kein Zurück-Knopf, kein Escape)
}) {
  const [typeId, setTypeId] = useState(projectTypes[0]);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('relevance');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, ...getDefaultFilters(projectTypes[0]) }));
  const [tags, setTags] = useState(null);
  const [versionSearch, setVersionSearch] = useState('');
  const [showSnapshots, setShowSnapshots] = useState(false);

  const [results, setResults] = useState({ hits: [], total_hits: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCounter, setRetryCounter] = useState(0);

  // Scroll Fade Erkennung für butterweiches Ein-/Ausblenden
  const listRef = useRef(null);
  const [canScrollTop, setCanScrollTop] = useState(false);
  const [canScrollBottom, setCanScrollBottom] = useState(false);

  const handleListScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setCanScrollTop(scrollTop > 6);
    setCanScrollBottom(scrollTop + clientHeight < scrollHeight - 6);
  };

  useEffect(() => {
    const timer = setTimeout(handleListScroll, 60);
    return () => clearTimeout(timer);
  }, [results.hits, loading]);

  // Detailseiten als Stapel, damit Abhängigkeiten sich öffnen und zurück verlassen lassen
  const [detailStack, setDetailStack] = useState([]);
  const rootRef = useRef(null);
  const listScrollTop = useRef(0);

  const type = PROJECT_TYPES[typeId];
  const hasDetail = detailStack.length > 0;

  // Server-Einträge haben keine Spielversionen, und der Loader gilt nur für Mods und Modpacks
  const lockedGameVersion = type.hasVersions ? lockedGameVersionProp : null;
  const lockedLoader = type.id === 'mod' || type.id === 'modpack' ? lockedLoaderProp : null;

  const scrollContainer = () => rootRef.current?.closest('.content-area');

  useEffect(() => {
    ModrinthService.getTags().then(setTags).catch(err => console.warn('Modrinth-Filter fehlen:', err));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setQuery(queryInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [queryInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    ModrinthService.searchProjects({
      query,
      projectType: type.id,
      gameVersions: lockedGameVersion ? [lockedGameVersion] : filters.gameVersions,
      loaders: lockedLoader ? [lockedLoader] : filters.loaders,
      categories: filters.categories,
      environments: filters.environments,
      openSource: filters.openSource,
      sort,
      limit: pageSize,
      offset: (page - 1) * pageSize
    })
      .then(data => {
        if (!cancelled) setResults(data);
      })
      .catch(err => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [type.id, query, filters, sort, page, pageSize, lockedGameVersion, lockedLoader, retryCounter]);

  const openedFromOutside = useRef(false);

  const openProject = (ref) => {
    if (!hasDetail) openedFromOutside.current = false;
    if (!hasDetail) listScrollTop.current = scrollContainer()?.scrollTop || 0;
    setDetailStack(prev => [...prev, ref]);
    const container = scrollContainer();
    if (container) container.scrollTop = 0;
  };

  const closeProject = () => {
    const returningToList = detailStack.length === 1;
    setDetailStack(prev => prev.slice(0, -1));
    if (returningToList && openedFromOutside.current) {
      openedFromOutside.current = false;
      onReturnFromRequest?.();
      return;
    }
    requestAnimationFrame(() => {
      const container = scrollContainer();
      if (container) container.scrollTop = returningToList ? listScrollTop.current : 0;
    });
  };

  // Klinkt die Detailseite in den globalen Zurück-Button unten links ein
  useEffect(() => {
    if (detailStack.length === 0 || !active) return undefined;
    return registerBackHandler(() => {
      closeProject();
    }, detailStack.length > 1 ? 'Zurück zur vorherigen Mod' : 'Zurück zur Übersicht');
  }, [detailStack.length, active]);

  // Escape-Taste schließt ebenfalls die geöffnete Detailansicht
  useEffect(() => {
    if (detailStack.length === 0 || !active) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeProject();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [detailStack.length, active]);

  // Ansichten außerhalb des Browsers können direkt eine Detailseite öffnen
  useEffect(() => {
    if (openRequest?.ref) {
      openedFromOutside.current = Boolean(onReturnFromRequest);
      setDetailStack([openRequest.ref]);
    }
  }, [openRequest]);

  const changeType = (nextTypeId) => {
    setTypeId(nextTypeId);
    setFilters({ ...EMPTY_FILTERS, ...getDefaultFilters(nextTypeId) });
    setPage(1);
    setDetailStack([]);
  };

  const updateFilters = (patch) => {
    setFilters(prev => ({ ...prev, ...patch }));
    setPage(1);
  };

  const changePage = (nextPage) => {
    setPage(nextPage);
    if (listRef.current) listRef.current.scrollTop = 0;
    const container = scrollContainer();
    if (container) container.scrollTop = 0;
  };

  const categoryGroups = useMemo(() => {
    const groups = new Map();
    (tags?.categories || [])
      .filter(category => category.project_type === type.categoryType)
      .forEach(category => {
        if (!groups.has(category.header)) groups.set(category.header, []);
        groups.get(category.header).push(category);
      });
    return [...groups.entries()];
  }, [tags, type.categoryType]);

  const loaderOptions = useMemo(() => {
    if (!type.loaderType) return [];
    return (tags?.loaders || []).filter(loader => {
      const supported = loader.supported_project_types;
      // Plugin- und Datapack-Loader sind bei Modrinth auch als "mod" markiert
      if (type.loaderType === 'mod' && (supported.includes('plugin') || supported.includes('datapack'))) return false;
      return supported.includes(type.loaderType);
    });
  }, [tags, type.loaderType]);

  const gameVersionOptions = useMemo(() => {
    const term = versionSearch.trim().toLowerCase();
    return (tags?.gameVersions || [])
      .filter(v => showSnapshots || v.version_type === 'release' || filters.gameVersions.includes(v.version))
      .filter(v => !term || v.version.toLowerCase().includes(term));
  }, [tags, showSnapshots, versionSearch, filters.gameVersions]);

  const activeChips = [
    ...filters.gameVersions.map(value => ({ key: `v:${value}`, label: value, remove: () => updateFilters({ gameVersions: filters.gameVersions.filter(v => v !== value) }) })),
    ...filters.loaders.map(value => ({ key: `l:${value}`, label: formatTagName(value), remove: () => updateFilters({ loaders: filters.loaders.filter(v => v !== value) }) })),
    ...filters.categories.map(value => ({ key: `c:${value}`, label: formatTagName(value), remove: () => updateFilters({ categories: filters.categories.filter(v => v !== value) }) })),
    ...filters.environments.map(value => ({ key: `e:${value}`, label: value === 'client' ? 'Client' : 'Server', remove: () => updateFilters({ environments: filters.environments.filter(v => v !== value) }) })),
    ...(filters.openSource ? [{ key: 'os', label: 'Open Source', remove: () => updateFilters({ openSource: false }) }] : [])
  ];

  const totalPages = Math.max(1, Math.ceil((results.total_hits || 0) / pageSize));

  const pageNumbers = useMemo(() => {
    const numbers = new Set([1, totalPages, page, page - 1, page + 1]);
    return [...numbers].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  }, [page, totalPages]);

  const showTypeTabs = projectTypes.length > 1;

  return (
    <div ref={rootRef} className="mr-browser">
      {hasDetail && (
        <ModrinthProjectDetail
          key={detailStack[detailStack.length - 1]}
          projectRef={detailStack[detailStack.length - 1]}
          type={type}
          lockedGameVersion={lockedGameVersion}
          lockedLoader={lockedLoader}
          renderAction={renderAction}
          renderVersionAction={renderVersionAction}
          active={active}
          onBack={closeProject}
          onOpenProject={openProject}
        />
      )}

      {/* Die Liste bleibt erhalten, damit Suche, Seite und Filter nach "Zurück" noch stehen */}
      <div style={{ display: hasDetail ? 'none' : 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, overflow: 'hidden', height: '100%' }}>
        {showTypeTabs && (
          <div className="mr-type-tabs">
            {projectTypes.map(id => {
              const entry = PROJECT_TYPES[id];
              const Icon = entry.icon;
              return (
                <button key={id} type="button" className={`mr-type-tab ${id === typeId ? 'active' : ''}`} onClick={() => changeType(id)}>
                  <Icon size={15} />
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mr-layout">
          {/* Filter */}
          <aside className="mr-filters">
            {(lockedGameVersion || lockedLoader) && (
              <div className="mr-locked-note">
                <Lock size={13} />
                <span>{lockedLabel}:{' '}{[lockedGameVersion, lockedLoader && formatTagName(lockedLoader)].filter(Boolean).join(' · ')}</span>
              </div>
            )}

            {!lockedGameVersion && type.hasVersions && (
              <FilterSection title="Spielversion">
                <input
                  type="text"
                  className="mr-input"
                  placeholder="Version suchen..."
                  value={versionSearch}
                  onChange={(e) => setVersionSearch(e.target.value)}
                />
                <div className="mr-filter-scroll">
                  {gameVersionOptions.map(v => (
                    <FilterOption
                      key={v.version}
                      label={v.version}
                      checked={filters.gameVersions.includes(v.version)}
                      onChange={() => updateFilters({ gameVersions: toggleValue(filters.gameVersions, v.version) })}
                    />
                  ))}
                </div>
                <FilterOption label="Snapshots anzeigen" checked={showSnapshots} onChange={() => setShowSnapshots(!showSnapshots)} />
              </FilterSection>
            )}

            {!lockedLoader && loaderOptions.length > 0 && (
              <FilterSection title="Loader">
                {loaderOptions.map(loader => (
                  <FilterOption
                    key={loader.name}
                    icon={loader.icon}
                    label={formatTagName(loader.name)}
                    checked={filters.loaders.includes(loader.name)}
                    onChange={() => updateFilters({ loaders: toggleValue(filters.loaders, loader.name) })}
                  />
                ))}
              </FilterSection>
            )}

            {type.hasEnvironment && (
              <FilterSection title="Umgebung">
                {[{ id: 'client', label: 'Client' }, { id: 'server', label: 'Server' }].map(option => (
                  <FilterOption
                    key={option.id}
                    label={option.label}
                    checked={filters.environments.includes(option.id)}
                    onChange={() => updateFilters({ environments: toggleValue(filters.environments, option.id) })}
                  />
                ))}
              </FilterSection>
            )}

            {categoryGroups.map(([header, categories]) => (
              <FilterSection key={header} title={getCategoryHeaderLabel(header)}>
                {categories.map(category => (
                  <FilterOption
                    key={category.name}
                    icon={category.icon}
                    label={formatTagName(category.name)}
                    checked={filters.categories.includes(category.name)}
                    onChange={() => updateFilters({ categories: toggleValue(filters.categories, category.name) })}
                  />
                ))}
              </FilterSection>
            ))}

            <FilterSection title="Lizenz">
              <FilterOption label="Nur Open Source" checked={filters.openSource} onChange={() => updateFilters({ openSource: !filters.openSource })} />
            </FilterSection>
          </aside>

          {/* Ergebnisse */}
          <div className="mr-results">
            <div className="modrinth-search-bar" style={{ marginBottom: 0 }}>
              <Search size={18} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder={`${type.label} auf Modrinth suchen...`}
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
              />
              {queryInput && (
                <button type="button" className="mr-icon-button" onClick={() => setQueryInput('')} title="Suche leeren">
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="mr-toolbar">
              <label>
                Sortierung
                <Dropdown value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                  {SORT_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </Dropdown>
              </label>
              <label>
                Pro Seite
                <Dropdown value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  {PAGE_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
                </Dropdown>
              </label>
              <span style={{ flex: 1 }} />
              <span className="mr-muted">{(results.total_hits || 0).toLocaleString('de-DE')} Treffer</span>
            </div>

            {activeChips.length > 0 && (
              <div className="mr-chips">
                {activeChips.map(chip => (
                  <button key={chip.key} type="button" className="mr-chip" onClick={chip.remove}>
                    {chip.label} <X size={12} />
                  </button>
                ))}
                <button type="button" className="mr-chip-reset" onClick={() => updateFilters({ ...EMPTY_FILTERS })}>Alle entfernen</button>
              </div>
            )}

            {error ? (
              <div className="glass-card mr-empty">
                <p>Modrinth konnte nicht geladen werden: {error}</p>
                <button type="button" className="btn-secondary" style={{ marginTop: '12px' }} onClick={() => setRetryCounter(c => c + 1)}>
                  <RefreshCw size={14} /> Erneut versuchen
                </button>
              </div>
            ) : results.hits.length === 0 && !loading ? (
              <div className="glass-card mr-empty">Keine Treffer. Entferne Filter oder versuche einen anderen Suchbegriff.</div>
            ) : (
              <div className="mr-result-scroll-wrapper">
                <div className={`mr-scroll-fade top ${canScrollTop ? 'visible' : ''}`} aria-hidden="true" />
                <div
                  ref={listRef}
                  onScroll={handleListScroll}
                  className="mr-result-list"
                  style={{ opacity: loading ? 0.55 : 1 }}
                >
                  {results.hits.map(hit => (
                    <div key={hit.project_id} className="mr-result" onClick={() => openProject(hit.slug || hit.project_id)}>
                      <ProjectIcon url={hit.icon_url} size={64} />
                      <div className="mr-result-main">
                        <div className="mr-result-title">
                          <button type="button" className="mr-link-title">{hit.title}</button>
                          {hit.author && <span className="mr-muted">von {hit.author}</span>}
                        </div>
                        <div className="mr-result-desc">{hit.description}</div>
                        <div className="mr-result-tags">
                          {(hit.display_categories || hit.categories || []).slice(0, 6).map(category => (
                            <span key={category} className="mr-tag">{formatTagName(category)}</span>
                          ))}
                        </div>
                      </div>
                      <div className="mr-result-side">
                        <div className="mr-result-stats">
                          {hit.downloads != null && <span title="Downloads"><Download size={13} /> {formatCount(hit.downloads)}</span>}
                          {hit.follows != null && <span title="Follower"><Heart size={13} /> {formatCount(hit.follows)}</span>}
                          {hit.date_modified && <span title="Zuletzt aktualisiert"><Calendar size={13} /> {formatDate(hit.date_modified)}</span>}
                        </div>
                        {renderAction && (
                          <div onClick={(e) => e.stopPropagation()}>
                            {renderAction({ ...hit, id: hit.project_id }, type)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`mr-scroll-fade bottom ${canScrollBottom ? 'visible' : ''}`} aria-hidden="true" />
              </div>
            )}

            {totalPages > 1 && (
              <div className="mr-pagination">
                <button type="button" className="mr-page" disabled={page <= 1} onClick={() => changePage(page - 1)} title="Vorherige Seite">
                  <ChevronLeft size={15} />
                </button>
                {pageNumbers.map((number, index) => (
                  <React.Fragment key={number}>
                    {index > 0 && number - pageNumbers[index - 1] > 1 && <span className="mr-muted">…</span>}
                    <button type="button" className={`mr-page ${number === page ? 'active' : ''}`} onClick={() => changePage(number)}>
                      {number.toLocaleString('de-DE')}
                    </button>
                  </React.Fragment>
                ))}
                <button type="button" className="mr-page" disabled={page >= totalPages} onClick={() => changePage(page + 1)} title="Nächste Seite">
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
