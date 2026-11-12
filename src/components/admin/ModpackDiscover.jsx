import React, { useState } from 'react';
import { Plus, Check, RefreshCw, Pin, Server, CheckCircle2, AlertCircle, Filter, Ban, Laptop } from 'lucide-react';
import ModrinthBrowser from '../modrinth/ModrinthBrowser';
import { addModToDraft, updateModInDraft, deriveSide, addResourcepackToDraft, addShaderpackToDraft } from '../../services/modpackService';
import { ModrinthService } from '../../services/modrinthService';
import { BisectService } from '../../services/bisectService';
import { appAlert } from '../../utils/appDialog';

// Kompletter Modrinth-Katalog für den Entwurf und direkte Server-Installationen
export default function ModpackDiscover({
  active = true,
  draft,
  openRequest,
  onDraftChange,
  onWarnings,
  selectedServer = null,
  bisectConfig = null,
  isConnected = false,
  installedServerMods = [],
  onRefreshServerMods = null
}) {
  const [busyKey, setBusyKey] = useState(null);
  const [serverBusyKey, setServerBusyKey] = useState(null);
  const [serverNotice, setServerNotice] = useState(null);
  const [strictFilter, setStrictFilter] = useState(true);

  const findInDraft = (project) => {
    if (!project) return null;
    const id = typeof project === 'string' ? project : (project.id || project.projectId);
    const slug = typeof project === 'string' ? project : project.slug;
    const type = typeof project === 'object' ? (project.project_type || 'mod') : 'mod';
    if (type === 'resourcepack') {
      return (draft?.resourcepacks || []).find(p => p.projectId === id || p.slug === slug);
    }
    if (type === 'shader') {
      return (draft?.shaderpacks || []).find(p => p.projectId === id || p.slug === slug);
    }
    return (draft?.mods || []).find(mod => mod.projectId === id || mod.slug === slug);
  };

  const isModOnServer = (project) => {
    if (!installedServerMods || installedServerMods.length === 0) return false;
    const slug = (project.slug || '').toLowerCase();
    const title = (project.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return installedServerMods.some(file => {
      const fn = file.name.toLowerCase();
      return (slug && fn.includes(slug)) || (title && title.length > 3 && fn.replace(/[^a-z0-9]/g, '').includes(title));
    });
  };

  // Ermittelt rekursiv alle fehlenden Pflicht-Abhängigkeiten (z.B. Fabric API) für den Server
  const resolveRequiredServerDeps = async (version, currentServerFiles, visited = new Set()) => {
    const depsToInstall = [];
    if (!version?.dependencies || version.dependencies.length === 0) return depsToInstall;

    for (const dep of version.dependencies) {
      if (dep.dependency_type !== 'required') continue;

      let projectId = dep.project_id;
      let specificVersionId = dep.version_id;

      if (!projectId && specificVersionId) {
        try {
          const v = await ModrinthService.getVersion(specificVersionId);
          projectId = v.project_id;
        } catch (e) {
          console.warn('Konnte Versions-Abhängigkeit nicht auflösen:', specificVersionId, e);
        }
      }

      if (!projectId || visited.has(projectId)) continue;
      visited.add(projectId);

      try {
        const depProject = await ModrinthService.getProject(projectId);

        // Reine Client-Mods nicht auf dem Server installieren
        if (depProject.server_side === 'unsupported' || deriveSide(depProject.client_side, depProject.server_side) === 'client') {
          continue;
        }

        // Prüfen, ob die Mod bereits im Server-/mods-Ordner liegt
        const slug = (depProject.slug || '').toLowerCase();
        const title = (depProject.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const alreadyOnServer = (currentServerFiles || []).some(file => {
          const fn = file.name.toLowerCase();
          return (slug && fn.includes(slug)) || (title && title.length > 3 && fn.replace(/[^a-z0-9]/g, '').includes(title));
        });

        if (alreadyOnServer) continue;

        // Passende Version für den Server suchen
        let depVersion = null;
        if (specificVersionId) {
          depVersion = await ModrinthService.getVersion(specificVersionId);
        } else {
          let versions = await ModrinthService.getProjectVersions(projectId, {
            gameVersion: draft.gameVersion,
            loader: draft.loader
          });
          if (!versions || versions.length === 0) {
            versions = await ModrinthService.getProjectVersions(projectId);
          }
          depVersion = versions?.[0];
        }

        if (!depVersion) continue;

        const depFile = depVersion.files.find(f => f.primary) || depVersion.files[0];
        if (!depFile) continue;

        // Rekursiv Unter-Abhängigkeiten auflösen
        const subDeps = await resolveRequiredServerDeps(depVersion, [...currentServerFiles, { name: depFile.filename }], visited);
        depsToInstall.push(...subDeps);

        depsToInstall.push({
          project: depProject,
          version: depVersion,
          file: depFile
        });
      } catch (err) {
        console.warn('Fehler beim Auflösen der Server-Abhängigkeit:', projectId, err);
      }
    }

    return depsToInstall;
  };

  const runChange = async (key, change) => {
    setBusyKey(key);
    try {
      const result = await change();
      await onDraftChange(result.draft);
      onWarnings(result.warnings || []);
    } catch (err) {
      appAlert(err.message, { warning: true });
    } finally {
      setBusyKey(null);
    }
  };

  const handleInstallToServer = async (project, specificVersion = null) => {
    if (!isConnected || !selectedServer) {
      appAlert('Bitte verbinde dich zuerst im Tab "Server" mit deinem BisectHosting-Server.', { warning: true });
      return;
    }

    // Schutz vor reinen Client-Mods
    let clientSide = project.client_side;
    let serverSide = project.server_side;
    if (!serverSide) {
      try {
        const fullProj = await ModrinthService.getProject(project.id || project.slug);
        clientSide = fullProj.client_side;
        serverSide = fullProj.server_side;
      } catch (e) {}
    }

    if (serverSide === 'unsupported' || deriveSide(clientSide, serverSide) === 'client') {
      appAlert(`"${project.title}" ist laut Modrinth eine reine Client-Mod (server_side: unsupported) und kann nicht auf dem Server installiert werden.`, { warning: true });
      return;
    }

    const key = specificVersion ? specificVersion.id : project.id;
    setServerBusyKey(key);
    setServerNotice(null);

    try {
      let chosenVersion = specificVersion;
      if (!chosenVersion) {
        // Versionen passend zur Server-Version (z.B. 26.3 Fabric) laden
        let versions = await ModrinthService.getProjectVersions(project.id, {
          gameVersion: draft.gameVersion,
          loader: draft.loader
        });

        // Falls mit striktem Filter nichts gefunden wird, alle Versionen des Projekts abrufen
        if (!versions || versions.length === 0) {
          versions = await ModrinthService.getProjectVersions(project.id);
        }

        if (!versions || versions.length === 0) {
          throw new Error(`Keine Version für "${project.title}" auf Modrinth gefunden.`);
        }
        chosenVersion = versions[0];
      }

      const primaryFile = chosenVersion.files.find(f => f.primary) || chosenVersion.files[0];
      if (!primaryFile) {
        throw new Error(`Keine .jar-Datei für Version ${chosenVersion.version_number} gefunden.`);
      }

      // Mod direkt auf den Server übertragen (Backend untersucht die JAR-Datei nach fabric.mod.json und installiert fehlende Abhängigkeiten wie fabric-api automatisch!)
      const res = await BisectService.installModrinthMod({
        serverId: selectedServer.attributes.identifier,
        downloadUrl: primaryFile.url,
        filename: primaryFile.filename,
        gameVersion: draft.gameVersion,
        loader: draft.loader
      }, bisectConfig);

      if (onRefreshServerMods) {
        await onRefreshServerMods();
      }

      const allDeps = res.installedDependencies || [];
      const depText = allDeps.length > 0
        ? ` (inkl. mitinstallierter Abhängigkeit: ${allDeps.join(', ')})`
        : '';

      setServerNotice({
        type: 'success',
        text: `Mod "${project.title}"${depText} wurde erfolgreich auf den Server installiert!`
      });
      setTimeout(() => setServerNotice(null), 8000);
    } catch (err) {
      console.error('Server-Install-Fehler:', err);
      setServerNotice({
        type: 'error',
        text: `Fehler beim Installieren auf dem Server: ${err.message}`
      });
      setTimeout(() => setServerNotice(null), 8000);
    } finally {
      setServerBusyKey(null);
    }
  };

  const renderAction = (project) => {
    const existing = findInDraft(project);
    const onServer = isModOnServer(project);
    const isServerBusy = serverBusyKey === project.id;
    const isDraftBusy = busyKey === project.id;
    const pType = project.project_type || 'mod';

    // Spezieller Aktions-Bereich für Ressourcenpakete und Shader
    if (pType === 'resourcepack' || pType === 'shader') {
      const typeLabel = pType === 'resourcepack' ? 'Ressourcenpaket' : 'Shader';
      const addFn = pType === 'resourcepack' ? addResourcepackToDraft : addShaderpackToDraft;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', minWidth: '150px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
            <Laptop size={11} /> Client ({typeLabel})
          </div>
          {existing ? (
            <button
              type="button"
              className="btn-secondary mr-action-button mr-action-done"
              disabled
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <Check size={13} /> <span>Im Entwurf</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary mr-action-button"
              disabled={Boolean(busyKey) || Boolean(serverBusyKey)}
              onClick={() => runChange(project.id, () => addFn(draft, project))}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isDraftBusy ? <RefreshCw size={13} className="spin" /> : <Plus size={13} />}
              <span>Zum Entwurf</span>
            </button>
          )}
        </div>
      );
    }

    const isClientOnly = project.server_side === 'unsupported' || deriveSide(project.client_side, project.server_side) === 'client';
    const isServerOnly = project.client_side === 'unsupported' || deriveSide(project.client_side, project.server_side) === 'server';

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', minWidth: '150px' }}>
        {/* Umgebungs-Indikator */}
        <div style={{ fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
          {isClientOnly && (
            <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Laptop size={11} /> Nur Client
            </span>
          )}
          {isServerOnly && (
            <span style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Server size={11} /> Nur Server
            </span>
          )}
          {!isClientOnly && !isServerOnly && (
            <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <RefreshCw size={11} /> Client & Server
            </span>
          )}
        </div>

        {/* Button 1: Entwurf */}
        {existing && !existing.autoDependency ? (
          <button
            type="button"
            className="btn-secondary mr-action-button mr-action-done"
            disabled
            style={{ width: '100%', justifyContent: 'center' }}
          >
            <Check size={13} /> <span>Im Entwurf</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary mr-action-button"
            disabled={Boolean(busyKey) || Boolean(serverBusyKey)}
            onClick={() => runChange(project.id, () => addModToDraft(draft, project))}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {isDraftBusy ? <RefreshCw size={13} className="spin" /> : <Plus size={13} />}
            <span>{existing ? 'Als eigene Mod' : 'Zum Entwurf'}</span>
          </button>
        )}

        {/* Button 2: Direkt auf Server (deaktiviert für reine Client-Mods) */}
        {isClientOnly ? (
          <button
            type="button"
            className="btn-secondary mr-action-button"
            disabled
            title="Diese Mod ist laut Modrinth eine reine Client-Mod (server_side: unsupported) und kann nicht auf dem Server installiert werden."
            style={{
              width: '100%',
              justifyContent: 'center',
              opacity: 0.55,
              cursor: 'not-allowed',
              color: 'var(--text-muted)',
              borderColor: 'var(--border-card)',
              background: 'var(--bg-well)'
            }}
          >
            <Ban size={13} style={{ color: '#94a3b8' }} />
            <span>Nur Client</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary mr-action-button"
            disabled={Boolean(busyKey) || Boolean(serverBusyKey)}
            onClick={() => handleInstallToServer(project)}
            title={
              !isConnected
                ? 'Verbinde zuerst deinen BisectHosting-Server'
                : onServer
                  ? 'Diese Mod existiert bereits auf dem Server (Klick zum Überschreiben/Aktualisieren)'
                  : 'Installiert die Mod sofort samt Abhängigkeiten in den /mods-Ordner deines BisectHosting-Servers'
            }
            style={{
              width: '100%',
              justifyContent: 'center',
              borderColor: onServer ? '#10b981' : isConnected ? 'var(--color-primary)' : 'var(--border-card)',
              color: onServer ? '#059669' : isConnected ? 'var(--color-primary)' : 'var(--text-muted)',
              background: onServer ? 'rgba(16, 185, 129, 0.12)' : isConnected ? 'rgba(234, 88, 12, 0.05)' : undefined
            }}
          >
            {isServerBusy ? (
              <RefreshCw size={13} className="spin" />
            ) : onServer ? (
              <Check size={13} />
            ) : (
              <Server size={13} />
            )}
            <span>
              {isServerBusy ? 'Wird übertragen...' : onServer ? 'Auf Server (Update)' : 'Auf Server'}
            </span>
          </button>
        )}
      </div>
    );
  };

  // Eine bestimmte Version festschreiben oder direkt auf den Server pushen
  const renderVersionAction = (project, version) => {
    const existing = findInDraft(project);
    const isServerBusy = serverBusyKey === version.id;
    const isDraftBusy = busyKey === version.id;
    const pType = project.project_type || 'mod';

    // Bei Ressourcenpaketen und Shadern
    if (pType === 'resourcepack' || pType === 'shader') {
      const addFn = pType === 'resourcepack' ? addResourcepackToDraft : addShaderpackToDraft;
      return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {existing?.versionId === version.id ? (
            <button type="button" className="btn-secondary mr-action-button mr-action-done" disabled>
              <Check size={13} /> <span>Im Entwurf</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn-secondary mr-action-button"
              disabled={Boolean(busyKey) || Boolean(serverBusyKey)}
              onClick={() => runChange(version.id, () => addFn(draft, project, version.id))}
            >
              {isDraftBusy ? <RefreshCw size={13} className="spin" /> : <Pin size={13} />}
              <span>Für Entwurf</span>
            </button>
          )}
        </div>
      );
    }

    const isClientOnly = project.server_side === 'unsupported' || deriveSide(project.client_side, project.server_side) === 'client';

    return (
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {existing?.versionId === version.id ? (
          <button type="button" className="btn-secondary mr-action-button mr-action-done" disabled>
            <Check size={13} /> <span>Im Entwurf</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary mr-action-button"
            disabled={Boolean(busyKey) || Boolean(serverBusyKey)}
            onClick={() => runChange(version.id, () => (existing
              ? updateModInDraft(draft, existing.slug, { versionId: version.id })
              : addModToDraft(draft, project, { versionId: version.id })))}
          >
            {isDraftBusy ? <RefreshCw size={13} className="spin" /> : <Pin size={13} />}
            <span>Für Entwurf</span>
          </button>
        )}

        {isClientOnly ? (
          <button
            type="button"
            className="btn-secondary mr-action-button"
            disabled
            title="Reine Client-Mod: Kann nicht auf dem Server installiert werden."
            style={{ opacity: 0.55, cursor: 'not-allowed', color: 'var(--text-muted)', background: 'var(--bg-well)' }}
          >
            <Ban size={13} style={{ color: '#94a3b8' }} />
            <span>Nur Client</span>
          </button>
        ) : (
          <button
            type="button"
            className="btn-secondary mr-action-button"
            disabled={Boolean(busyKey) || Boolean(serverBusyKey)}
            onClick={() => handleInstallToServer(project, version)}
            style={{
              borderColor: isConnected ? 'var(--color-primary)' : 'var(--border-card)',
              color: isConnected ? 'var(--color-primary)' : 'var(--text-muted)'
            }}
            title="Installiert genau diese Version samt Abhängigkeiten auf den Server"
          >
            {isServerBusy ? <RefreshCw size={13} className="spin" /> : <Server size={13} />}
            <span>{isServerBusy ? 'Wird übertragen...' : 'Auf Server'}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
      {/* Erfolgs- oder Fehlermeldung bei Server-Übertragung */}
      {serverNotice && (
        <div
          style={{
            padding: '8px 14px',
            borderRadius: '12px',
            background: serverNotice.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${serverNotice.type === 'success' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: serverNotice.type === 'success' ? '#34d399' : '#f87171',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12.5px',
            fontWeight: 600,
            flexShrink: 0
          }}
        >
          {serverNotice.type === 'success' ? (
            <CheckCircle2 size={16} style={{ color: '#10b981', flexShrink: 0 }} />
          ) : (
            <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          )}
          <span style={{ flex: 1 }}>{serverNotice.text}</span>
        </div>
      )}

      {/* Kompakter Filter-Toggle rechts oberhalb des Browsers */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 4px', flexShrink: 0 }}>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '12px',
            userSelect: 'none',
            color: 'var(--text-muted)'
          }}
          title="Schaltet den Versionsfilter für Minecraft 26.3 Fabric ein oder aus"
        >
          <input
            type="checkbox"
            checked={strictFilter}
            onChange={(e) => setStrictFilter(e.target.checked)}
            style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }}
          />
          <span>Nur Minecraft {draft.gameVersion} ({draft.loader})</span>
        </label>
      </div>

      <ModrinthBrowser
        projectTypes={['mod', 'resourcepack', 'shader']}
        lockedGameVersion={strictFilter ? draft.gameVersion : null}
        lockedLoader={strictFilter ? draft.loader : null}
        renderAction={renderAction}
        renderVersionAction={renderVersionAction}
        openRequest={openRequest}
        active={active}
      />
    </div>
  );
}
