import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Folder, RefreshCw, Save, Search, Check, AlertCircle,
  Sliders, Code, ChevronRight, ChevronDown, FileCode, SlidersHorizontal, ArrowLeft
} from 'lucide-react';
import { appConfirm, appAlert } from '../utils/appDialog';

export default function LocalConfigEditor() {
  const [configFiles, setConfigFiles] = useState([]);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  // Editor-State
  const [fileContent, setFileContent] = useState('');
  const [initialContent, setInitialContent] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [editorMode, setEditorMode] = useState('visual'); // 'visual' | 'code'
  const [expandedCategories, setExpandedCategories] = useState({});
  // Bei schmalem Fenster wird entweder die Dateiliste oder der Editor gezeigt
  const [mobileView, setMobileView] = useState('list');

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const hasUnsavedChanges = fileContent !== initialContent;

  // Lädt die Liste aller lokalen Config-Dateien
  const loadFileList = async (keepSelection = true) => {
    if (!window.electronAPI?.getLocalConfigFiles) return;
    setIsLoadingList(true);
    try {
      const res = await window.electronAPI.getLocalConfigFiles();
      const files = (res && res.success && Array.isArray(res.files)) ? res.files : [];
      setConfigFiles(files);

      // Kategorien bleiben eingeklappt, der Nutzer öffnet sie selbst (Aufklappen bleibt beim Neuladen erhalten)

      // Falls noch keine Datei ausgewählt ist, bevorzugt iris.properties oder options.txt wählen
      if ((!selectedFile || !keepSelection) && files.length > 0) {
        const preferred = files.find(f => f.name === 'iris.properties') ||
                          files.find(f => f.name === 'options.txt') ||
                          files[0];
        if (preferred) {
          loadFile(preferred, { auto: true });
        }
      } else if (selectedFile && keepSelection) {
        // Prüfen, ob ausgewählte Datei noch existiert
        const stillExists = files.find(f => f.path === selectedFile.path);
        if (stillExists) {
          setSelectedFile(stillExists);
        }
      }
    } catch (err) {
      console.error('Fehler beim Laden lokaler Configs:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    loadFileList(false);
  }, []);

  // Tastenkombination Strg+S / Cmd+S zum Speichern
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && !isSaving && selectedFile) {
          handleSave();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasUnsavedChanges, isSaving, selectedFile, fileContent]);

  // Lädt den Inhalt einer ausgewählten Config-Datei
  const loadFile = async (file, options = {}) => {
    if (hasUnsavedChanges) {
      const ok = await appConfirm('Du hast ungespeicherte Änderungen. Möchtest du wirklich eine andere Datei öffnen?', {
        title: 'Ungespeicherte Änderungen',
        confirmLabel: 'Verwerfen & Wechseln',
        cancelLabel: 'Hier bleiben',
        danger: true
      });
      if (!ok) return;
    }

    // Nur wenn der Nutzer die Datei selbst anklickt, geht ihre Kategorie auf (die automatische Vorauswahl lässt alles zu)
    if (file.category && !options.auto) {
      setExpandedCategories(prev => ({ ...prev, [file.category]: true }));
    }

    setSelectedFile(file);
    setIsLoadingFile(true);
    setSaveSuccess(false);
    try {
      const res = await window.electronAPI.readLocalConfigFile(file.path);
      if (res && res.success) {
        setFileContent(res.content || '');
        setInitialContent(res.content || '');
      } else {
        throw new Error(res?.error || 'Datei konnte nicht gelesen werden');
      }
    } catch (err) {
      console.error('Fehler beim Laden der Datei:', err);
      setFileContent(`# Fehler beim Laden der Datei:\n# ${err.message}`);
      setInitialContent('');
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Speichert den Inhalt in die lokale Datei
  const handleSave = async () => {
    if (!selectedFile || !window.electronAPI?.saveLocalConfigFile) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await window.electronAPI.saveLocalConfigFile(selectedFile.path, fileContent);
      if (res && res.success) {
        setInitialContent(fileContent);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        throw new Error(res?.error || 'Speichern fehlgeschlagen');
      }
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      appAlert(`Fehler beim Speichern: ${err.message}`, { warning: true });
    } finally {
      setIsSaving(false);
    }
  };

  // Gefilterte Dateien nach Suchbegriff
  const filteredFiles = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return configFiles;
    return configFiles.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.path.toLowerCase().includes(q) ||
      (f.category && f.category.toLowerCase().includes(q))
    );
  }, [configFiles, filterQuery]);

  // Nach Kategorien gruppieren
  const groupedFiles = useMemo(() => {
    const groups = {};
    for (const file of filteredFiles) {
      const cat = file.category || 'Allgemeine Mod-Configs';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(file);
    }
    return groups;
  }, [filteredFiles]);

  // VISUELLER PARSER: Wandelt Konfigurationszeilen (YAML, Properties, TOML, JSON) in interaktive Felder um
  const visualConfigItems = useMemo(() => {
    if (!fileContent) return [];
    const lines = fileContent.split(/\r?\n/);
    const items = [];
    let currentComment = [];

    const isYaml = selectedFile?.name?.endsWith('.yml') || selectedFile?.name?.endsWith('.yaml');

    lines.forEach((rawLine, index) => {
      const trimmed = rawLine.trim();

      // Kommentarzeile
      if (trimmed.startsWith('#') || trimmed.startsWith('//')) {
        currentComment.push(trimmed.replace(/^#+\s*|^\/\/+\s*/, ''));
        return;
      }

      // Leerzeile oder reine Strukturklammern
      if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed === '[' || trimmed === ']') {
        if (currentComment.length > 0) {
          items.push({ type: 'comment_block', text: currentComment.join('\n'), index });
          currentComment = [];
        }
        return;
      }

      // Abschnitts-Überschrift (z. B. "[general]" in TOML/INI oder "section:" in YAML)
      if (/^\[.+\]$/.test(trimmed) || (isYaml && /^[a-zA-Z0-9_\-\.]+\s*:$/.test(trimmed))) {
        const title = trimmed.replace(/:$/, '').replace(/^\[|\]$/g, '');
        items.push({
          type: 'section_header',
          title,
          description: currentComment.join('\n'),
          index
        });
        currentComment = [];
        return;
      }

      // Fall 1: JSON-Zeile (z. B. `"safeMode": true,` oder `"key": "value"`)
      const jsonMatch = rawLine.match(/^(\s*)"([^"]+)"\s*:\s*(.*)$/);
      if (jsonMatch) {
        const indent = jsonMatch[1];
        const key = jsonMatch[2];
        let valRaw = jsonMatch[3].trim();
        let hasTrailingComma = false;
        if (valRaw.endsWith(',')) {
          hasTrailingComma = true;
          valRaw = valRaw.slice(0, -1).trim();
        }

        // Verschachtelte Objekte oder Arrays überspringen (bleiben im Quelltext-Editor bearbeitbar)
        if (!valRaw.startsWith('{') && !valRaw.startsWith('[')) {
          let valType = 'string';
          let rawClean = valRaw.replace(/^['"]|['"]$/g, '');
          if (rawClean.toLowerCase() === 'true' || rawClean.toLowerCase() === 'false') {
            valType = 'boolean';
          } else if (/^-?\d+(\.\d+)?$/.test(rawClean)) {
            valType = 'number';
          }

          items.push({
            type: 'setting',
            isJson: true,
            hasTrailingComma,
            lineIndex: index,
            indent,
            key,
            separator: ':',
            value: rawClean,
            valType,
            originalValue: valRaw,
            description: currentComment.join(' '),
            rawLine
          });
          currentComment = [];
          return;
        }
      }

      // Fall 2: Key-Value-Paar (YAML: "key: value", Properties/TXT: "key=value" oder "key:value", TOML: "key = value")
      const kvMatch = rawLine.match(/^(\s*)([a-zA-Z0-9_\-\.]+)\s*(:|=)\s*(.*)$/);
      if (kvMatch) {
        const indent = kvMatch[1];
        const key = kvMatch[2];
        const separator = kvMatch[3];
        let value = kvMatch[4].trim();

        // Trailing inline comments entfernen
        let inlineComment = '';
        const inlineCommentMatch = value.match(/\s+#\s*(.*)$/);
        if (inlineCommentMatch) {
          inlineComment = inlineCommentMatch[1];
          value = value.slice(0, inlineCommentMatch.index).trim();
        }

        // Typ ermitteln
        let valType = 'string';
        let rawClean = value.replace(/^['"]|['"]$/g, '');

        if (rawClean.toLowerCase() === 'true' || rawClean.toLowerCase() === 'false') {
          valType = 'boolean';
        } else if (/^-?\d+(\.\d+)?$/.test(rawClean)) {
          valType = 'number';
        }

        items.push({
          type: 'setting',
          isJson: false,
          lineIndex: index,
          indent,
          key,
          separator,
          value: rawClean,
          valType,
          originalValue: value,
          description: currentComment.join(' ') || inlineComment,
          rawLine
        });
        currentComment = [];
      } else {
        currentComment = [];
      }
    });

    return items;
  }, [fileContent, selectedFile]);

  // Ändert einen Wert im visuellen Editor
  const handleVisualChange = (item, newValue) => {
    const isCrlf = fileContent.includes('\r\n');
    const lineEnding = isCrlf ? '\r\n' : '\n';
    const lines = fileContent.split(/\r?\n/);

    let formattedValue = newValue;
    if (item.isJson) {
      if (item.valType === 'string') {
        formattedValue = JSON.stringify(newValue);
      }
      const comma = item.hasTrailingComma ? ',' : '';
      lines[item.lineIndex] = `${item.indent}"${item.key}": ${formattedValue}${comma}`;
    } else {
      if (item.valType === 'string' && (item.originalValue.startsWith('"') || item.originalValue.startsWith("'"))) {
        const quote = item.originalValue[0];
        formattedValue = `${quote}${newValue}${quote}`;
      }
      // Trailing inline comment wieder anhängen falls vorhanden
      const trailingCommentMatch = item.rawLine.match(/\s+#.*$/);
      const trailingComment = trailingCommentMatch ? trailingCommentMatch[0] : '';
      
      // Bei Optionen ohne Leerzeichen vor dem Wert (wie standardmäßig in options.txt) oder mit Leerzeichen
      const space = (item.separator === ':' && !item.rawLine.includes(': ')) ? '' : ' ';
      lines[item.lineIndex] = `${item.indent}${item.key}${item.separator}${space}${formattedValue}${trailingComment}`;
    }

    setFileContent(lines.join(lineEnding));
  };

  const hasSettingsInVisual = visualConfigItems.some(i => i.type === 'setting');

  return (
    <div className="lce-wrap">
    <div className="lce-grid" data-view={mobileView}>
      {/* Linke Spalte: Dateiliste */}
      <div
        className="lce-list"
        style={{
          background: 'var(--bg-card)',
          borderRadius: '18px',
          border: '1px solid var(--border-card)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        {/* Suche & Refresh */}
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border-card)', display: 'flex', gap: '8px', flexShrink: 0 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Config suchen..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 30px',
                borderRadius: '10px',
                border: '1px solid var(--border-card)',
                fontSize: '12.5px',
                background: 'var(--bg-input)',
                color: 'var(--text-main)'
              }}
            />
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => loadFileList(true)}
            disabled={isLoadingList}
            title="Dateiliste neu laden"
            style={{ padding: '7px 10px' }}
          >
            <RefreshCw size={13} className={isLoadingList ? 'spin' : ''} />
          </button>
        </div>

        {/* Dateibaum (separat scrollbar) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px' }}>
          {isLoadingList ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Lade lokale Config-Dateien...
            </div>
          ) : Object.keys(groupedFiles).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
              Keine Konfigurationsdateien gefunden.
            </div>
          ) : (
            Object.entries(groupedFiles).map(([category, files]) => {
              const isExpanded = filterQuery.trim() ? true : !!expandedCategories[category];
              return (
                <div key={category} style={{ marginBottom: '8px' }}>
                  <button
                    type="button"
                    className="config-category-header"
                    onClick={() => toggleCategory(category)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                      <Folder size={13} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category}</span>
                      <span style={{ fontSize: '10.5px', opacity: 0.6, fontWeight: 500, flexShrink: 0 }}>({files.length})</span>
                    </div>
                    <ChevronDown
                      size={13}
                      style={{
                        transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                        transition: 'transform 0.2s ease',
                        opacity: 0.7,
                        flexShrink: 0
                      }}
                    />
                  </button>

                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px', paddingLeft: '4px' }}>
                      {files.map(file => {
                        const isSelected = selectedFile?.path === file.path;
                        return (
                          <button
                            key={file.path}
                            type="button"
                            className={`config-file-item ${isSelected ? 'selected' : ''}`}
                            onClick={() => { loadFile(file); setMobileView('editor'); }}
                            title={file.path}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <FileText
                                size={14}
                                className="config-file-icon"
                                style={{
                                  color: isSelected ? 'var(--color-primary)' : '#94a3b8',
                                  flexShrink: 0,
                                  transition: 'color 0.15s ease'
                                }}
                              />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {file.name}
                              </span>
                            </div>
                            {isSelected && <ChevronRight size={14} style={{ flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Rechte Spalte: Editor */}
      <div
        className="lce-editor"
        style={{
          background: 'var(--bg-card)',
          borderRadius: '18px',
          border: '1px solid var(--border-card)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        {/* Editor-Header (bleibt fix oben) */}
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border-card)',
            background: 'var(--bg-well)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <button type="button" className="btn-secondary lce-back" onClick={() => setMobileView('list')} title="Zurück zur Dateiliste" style={{ padding: '5px 10px', fontSize: '12px', gap: '5px' }}>
              <ArrowLeft size={13} />
              <span>Dateien</span>
            </button>
            <FileCode size={18} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
            <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '13.5px',
                  color: 'var(--text-main)',
                  fontFamily: 'monospace',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={selectedFile ? selectedFile.path : ''}
              >
                {selectedFile ? selectedFile.path : 'Keine Datei ausgewählt'}
              </span>
              {hasUnsavedChanges && (
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#d97706',
                    background: 'rgba(245, 158, 11, 0.18)',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    flexShrink: 0
                  }}
                >
                  Ungespeichert
                </span>
              )}
            </div>
          </div>

          {/* Modus-Umschalter & Speicher-Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Umschalter: Visuell / Quelltext */}
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-well)',
                borderRadius: '10px',
                padding: '3px',
                gap: '2px',
                border: '1px solid var(--border-card)'
              }}
            >
              <button
                type="button"
                onClick={() => setEditorMode('visual')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: editorMode === 'visual' ? 700 : 500,
                  background: editorMode === 'visual' ? 'var(--bg-card)' : 'transparent',
                  color: editorMode === 'visual' ? 'var(--text-main)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  boxShadow: editorMode === 'visual' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <Sliders size={12} />
                <span>Visuell</span>
              </button>
              <button
                type="button"
                onClick={() => setEditorMode('code')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: editorMode === 'code' ? 700 : 500,
                  background: editorMode === 'code' ? 'var(--bg-card)' : 'transparent',
                  color: editorMode === 'code' ? 'var(--text-main)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  boxShadow: editorMode === 'code' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}
              >
                <Code size={12} />
                <span>Quelltext</span>
              </button>
            </div>

            {/* Speichern Button */}
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges || !selectedFile}
              title="Speichern (Strg + S)"
              style={{
                padding: '7px 18px',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: saveSuccess ? '#10b981' : undefined
              }}
            >
              {isSaving ? (
                <RefreshCw size={13} className="spin" />
              ) : saveSuccess ? (
                <Check size={13} />
              ) : (
                <Save size={13} />
              )}
              <span>{isSaving ? 'Speichern...' : saveSuccess ? 'Gespeichert!' : 'Speichern'}</span>
            </button>
          </div>
        </div>

        {/* Editor-Inhalt */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
          {isLoadingFile ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" />
            </div>
          ) : !selectedFile ? (
            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
              Wähle links eine Datei aus, um Einstellungen visuell zu bearbeiten.
            </div>
          ) : editorMode === 'code' ? (
            /* Quelltext-Editor */
            <textarea
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '100%',
                boxSizing: 'border-box',
                padding: '16px',
                border: 'none',
                outline: 'none',
                fontFamily: 'Consolas, "Fira Code", Monaco, monospace',
                fontSize: '13px',
                lineHeight: '1.6',
                color: 'var(--text-main)',
                background: 'var(--bg-input)',
                resize: 'none'
              }}
            />
          ) : (
            /* Visueller Formular-Editor */
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                Hier kannst du alle Einstellungen per Schalter und Eingabefeld direkt ändern. Die Datei wird im Hintergrund formatiert.
              </div>

              {!hasSettingsInVisual && (
                <div
                  style={{
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'var(--bg-well)',
                    border: '1px dashed var(--border-card)',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13px'
                  }}
                >
                  <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>Keine einfachen Schalter/Werte in dieser Datei erkannt.</p>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setEditorMode('code')}
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    <Code size={13} />
                    <span>In den Quelltext-Modus wechseln</span>
                  </button>
                </div>
              )}

              {visualConfigItems.map((item, i) => {
                if (item.type === 'section_header') {
                  return (
                    <div
                      key={i}
                      style={{
                        marginTop: '16px',
                        paddingBottom: '6px',
                        borderBottom: '2px solid rgba(234, 88, 12, 0.2)',
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: '10px'
                      }}
                    >
                      <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-primary)' }}>
                        {item.title}
                      </span>
                      {item.description && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {item.description}
                        </span>
                      )}
                    </div>
                  );
                }

                if (item.type === 'setting') {
                  return (
                    <div
                      key={i}
                      className="lce-setting"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '10px',
                        padding: '10px 14px',
                        background: item.key === 'enabled' ? 'var(--color-primary-soft)' : 'var(--bg-well)',
                        border: `1px solid ${item.key === 'enabled' ? 'var(--color-primary-border)' : 'var(--border-card)'}`,
                        borderRadius: '12px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {/* Label & Beschreibung */}
                      <div className="lce-setting-label">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                            {item.key}
                          </span>
                          {item.key === 'enabled' && (
                            <span style={{ fontSize: '10.5px', background: 'var(--color-primary)', color: '#ffffff', padding: '1px 6px', borderRadius: '6px', fontWeight: 700 }}>
                              Hauptschalter
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.4 }}>
                            {item.description}
                          </div>
                        )}
                      </div>

                      {/* Interaktives Steuerelement */}
                      <div className="lce-setting-control" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {item.valType === 'boolean' ? (
                          /* Toggle-Switch */
                          <label
                            style={{
                              position: 'relative',
                              display: 'inline-block',
                              width: '48px',
                              height: '26px',
                              cursor: 'pointer'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={item.value.toLowerCase() === 'true'}
                              onChange={(e) => handleVisualChange(item, e.target.checked ? 'true' : 'false')}
                              style={{ opacity: 0, width: 0, height: 0 }}
                            />
                            <span
                              style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                background: item.value.toLowerCase() === 'true' ? '#10b981' : '#cbd5e1',
                                borderRadius: '999px',
                                transition: '0.2s ease',
                                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                              }}
                            >
                              <span
                                style={{
                                  position: 'absolute',
                                  content: '""',
                                  height: '20px',
                                  width: '20px',
                                  left: item.value.toLowerCase() === 'true' ? '25px' : '3px',
                                  bottom: '3px',
                                  background: '#ffffff',
                                  borderRadius: '50%',
                                  transition: '0.2s ease',
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                              />
                            </span>
                          </label>
                        ) : item.valType === 'number' ? (
                          /* Number-Input */
                          <input
                            type="number"
                            value={item.value}
                            onChange={(e) => handleVisualChange(item, e.target.value)}
                            style={{
                              width: '110px',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-card)',
                              fontSize: '13px',
                              fontFamily: 'monospace',
                              textAlign: 'right',
                              background: 'var(--bg-input)',
                              color: 'var(--text-main)'
                            }}
                          />
                        ) : (
                          /* Text-Input */
                          <input
                            type="text"
                            value={item.value}
                            onChange={(e) => handleVisualChange(item, e.target.value)}
                            style={{
                              width: '220px',
                              maxWidth: '100%',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-card)',
                              fontSize: '13px',
                              fontFamily: 'monospace',
                              background: 'var(--bg-input)',
                              color: 'var(--text-main)'
                            }}
                          />
                        )}
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}

