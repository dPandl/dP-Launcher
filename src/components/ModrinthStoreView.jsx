import React, { useState, useEffect } from 'react';
import { Download, Check, ExternalLink, RefreshCw, Trash2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { ModrinthService } from '../services/modrinthService';
import ModrinthBrowser from './modrinth/ModrinthBrowser';
import { getProjectUrl, openExternal } from './modrinth/modrinthUi';
import { getManifestMods } from '../../modpackUtils.js';

const MAX_SHOWN_REASONS = 3;

export default function ModrinthStoreView({ manifest, hideHeader = false, openRequest = null }) {
  const [busyKey, setBusyKey] = useState(null);
  const [installedKeys, setInstalledKeys] = useState({});
  const [userMods, setUserMods] = useState([]);
  const [notice, setNotice] = useState(null);

  const gameVersion = manifest?.gameVersion || '26.3';
  const loader = manifest?.loader || 'fabric';
  const packMods = getManifestMods(manifest).filter(mod => mod.side !== 'server');

  useEffect(() => {
    window.electronAPI?.getUserMods().then(setUserMods);
  }, []);

  const findPackMod = (project) => packMods.find(mod => mod.projectId === project.id || mod.slug === project.slug);
  const findUserMod = (project) => userMods.find(mod => mod.projectId === project.id);

  const showInstallResult = (project, result, wantedVersion) => {
    if (result.success) {
      const dependencies = result.installed.filter(mod => mod.projectId !== result.chosen.projectId);
      const newerRejected = wantedVersion ? null : result.skipped[0];
      setNotice({
        type: 'success',
        title: `${project.title} ${result.chosen.versionNumber} ist installiert`,
        lines: [
          ...(newerRejected ? [`Neuere Version ${newerRejected.versionNumber} passt nicht zum Server: ${newerRejected.reason}`] : []),
          ...(dependencies.length > 0 ? [`Mitinstalliert: ${dependencies.map(mod => `${mod.name} ${mod.versionNumber}`).join(', ')}`] : []),
          ...result.warnings
        ]
      });
      return;
    }

    setNotice({
      type: 'error',
      title: `${project.title} kann nicht installiert werden`,
      lines: result.error
        ? [result.error]
        : result.skipped.length > 0
          ? result.skipped.slice(0, MAX_SHOWN_REASONS).map(skip => `${skip.versionNumber}: ${skip.reason}`)
          : [result.reason]
    });
  };

  // Mods werden gegen die Modliste des Servers geprüft und samt Abhängigkeiten installiert
  const handleInstallMod = async (project, versionId = null) => {
    setBusyKey(versionId || project.id);
    setNotice(null);
    try {
      const resolvedPack = await ModrinthService.resolveRequiredMods(getManifestMods(manifest), gameVersion, loader);
      const result = await window.electronAPI.installUserMod({
        projectId: project.id,
        versionId,
        packMods: resolvedPack,
        gameVersion,
        loader
      });
      if (result.mods) setUserMods(result.mods);
      showInstallResult(project, result, Boolean(versionId));
    } catch (err) {
      showInstallResult(project, { success: false, error: err.message, skipped: [], warnings: [] });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveMod = async (project) => {
    setBusyKey(project.id);
    setNotice(null);
    const result = await window.electronAPI.removeUserMod(project.id);
    setBusyKey(null);
    if (result.success) {
      setUserMods(result.mods);
    } else {
      setNotice({ type: 'error', title: `${project.title} kann nicht entfernt werden`, lines: [result.error] });
    }
  };

  // Shader und Resourcepacks hängen nicht von der Modliste ab
  const installFile = async (project, version, type, key) => {
    setBusyKey(key);
    setNotice(null);
    try {
      const primaryFile = version?.files.find(f => f.primary) || version?.files[0];
      if (!primaryFile) throw new Error(`Keine Version für Minecraft ${gameVersion} gefunden.`);

      const result = await window.electronAPI.downloadModrinthFile({
        url: primaryFile.url,
        filename: primaryFile.filename,
        category: type.installDir
      });
      if (!result.success) throw new Error(result.error);

      setInstalledKeys(prev => ({ ...prev, [key]: true }));
    } catch (err) {
      setNotice({ type: 'error', title: `${project.title} konnte nicht installiert werden`, lines: [err.message] });
    } finally {
      setBusyKey(null);
    }
  };

  const handleInstallLatestFile = async (project, type) => {
    setBusyKey(project.id);
    try {
      const versions = await ModrinthService.getProjectVersions(project.id, { gameVersion });
      await installFile(project, versions.find(v => v.version_type === 'release') || versions[0], type, project.id);
    } catch (err) {
      setBusyKey(null);
      setNotice({ type: 'error', title: `${project.title} konnte nicht installiert werden`, lines: [err.message] });
    }
  };

  const renderDoneButton = (label) => (
    <button type="button" className="btn-secondary mr-action-button mr-action-done" disabled>
      <Check size={13} /> <span>{label}</span>
    </button>
  );

  const renderInstallButton = (key, onClick, primary, label = 'Installieren') => {
    const isBusy = busyKey === key;
    return (
      <button
        type="button"
        className={`mr-action-button ${primary ? 'btn-primary' : 'btn-secondary'}`}
        onClick={onClick}
        disabled={Boolean(busyKey)}
      >
        {isBusy ? <RefreshCw size={13} className="spin" /> : <Download size={13} />}
        <span>{isBusy ? 'Wird geprüft...' : label}</span>
      </button>
    );
  };

  const renderAction = (project, type) => {
    if (!type.installDir) {
      return (
        <button type="button" className="btn-secondary mr-action-button" onClick={() => openExternal(getProjectUrl(type, project.slug))}>
          <ExternalLink size={13} /> <span>Öffnen</span>
        </button>
      );
    }

    if (type.id !== 'mod') {
      if (installedKeys[project.id]) return renderDoneButton('Installiert');
      return renderInstallButton(project.id, () => handleInstallLatestFile(project, type), true);
    }

    if (findPackMod(project)) return renderDoneButton('Im Modpack');

    if (findUserMod(project)) {
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {renderDoneButton('Installiert')}
          <button
            type="button"
            className="btn-secondary mr-action-button"
            style={{ color: '#ef4444' }}
            disabled={Boolean(busyKey)}
            onClick={() => handleRemoveMod(project)}
            title="Mod entfernen"
          >
            <Trash2 size={13} />
          </button>
        </div>
      );
    }

    return renderInstallButton(project.id, () => handleInstallMod(project), true);
  };

  const renderVersionAction = (project, version, type) => {
    if (!type.installDir) return null;

    if (type.id !== 'mod') {
      if (installedKeys[version.id]) return renderDoneButton('Installiert');
      return renderInstallButton(version.id, () => installFile(project, version, type, version.id), false);
    }

    const packMod = findPackMod(project);
    if (packMod) return packMod.versionId === version.id ? renderDoneButton('Im Modpack') : null;

    const userMod = findUserMod(project);
    if (userMod) return userMod.versionId === version.id ? renderDoneButton('Installiert') : null;

    return renderInstallButton(version.id, () => handleInstallMod(project, version.id), false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      {!hideHeader && (
        <div style={{ flexShrink: 0 }}>
          <h1 className="app-page-title">
            Modrinth Store
          </h1>
          <p className="app-page-subtitle">
            Zeigt nur, was zum Server passt ({gameVersion} · {loader}). Benötigte Mods werden automatisch mitinstalliert, und passt die neueste Version nicht zur Modliste des Servers, wird eine ältere genommen.
          </p>
        </div>
      )}

      {notice && (
        <div className={`mr-notice mr-notice-${notice.type}`} style={{ flexShrink: 0 }}>
          {notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{notice.title}</div>
            {notice.lines.map((line, index) => <div key={index} className="mr-notice-line">{line}</div>)}
          </div>
          <button type="button" className="mr-icon-button" onClick={() => setNotice(null)} title="Schließen">
            <X size={15} />
          </button>
        </div>
      )}

      <ModrinthBrowser
        lockedGameVersion={gameVersion}
        lockedLoader={loader}
        renderAction={renderAction}
        renderVersionAction={renderVersionAction}
        openRequest={openRequest}
      />
    </div>
  );
}
