import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText, Folder, RefreshCw, Save, Search, Check, AlertCircle,
  Sliders, Code, Terminal, Play, RotateCcw, Sparkles, ChevronRight,
  Info, CheckCircle2, ChevronDown, Shield, Server, FileCode
} from 'lucide-react';
import { BisectService } from '../../services/bisectService';
import { appConfirm, appAlert } from '../../utils/appDialog';

export default function ServerConfigEditor({
  selectedServer,
  bisectConfig,
  isConnected,
  onServerPowerAction
}) {
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
  const [commandFeedback, setCommandFeedback] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const hasUnsavedChanges = fileContent !== initialContent;

  // Lädt die Liste aller Config-Dateien vom Server
  const loadFileList = async () => {
    if (!selectedServer || !isConnected) return;
    setIsLoadingList(true);
    try {
      const files = await BisectService.listConfigFiles(
        selectedServer.attributes.identifier,
        bisectConfig
      );
      setConfigFiles(files);

      // Falls noch keine Datei ausgewählt ist, bevorzugt server.properties wählen
      if (!selectedFile && files.length > 0) {
        const preferred = files.find(f => f.name === 'server.properties') || files[0];
        if (preferred) {
          loadFile(preferred);
        }
      }
    } catch (err) {
      console.error('Fehler beim Laden der Config-Liste:', err);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    loadFileList();
  }, [selectedServer?.attributes?.identifier, isConnected]);

  // Lädt den Inhalt einer ausgewählten Config-Datei
  const loadFile = async (file) => {
    if (hasUnsavedChanges) {
      const ok = await appConfirm('Du hast ungespeicherte Änderungen. Möchtest du wirklich eine andere Datei öffnen?', {
        title: 'Ungespeicherte Änderungen',
        confirmLabel: 'Verwerfen & Wechseln',
        cancelLabel: 'Hier bleiben',
        danger: true
      });
      if (!ok) return;
    }

    if (file.category) {
      setExpandedCategories(prev => ({ ...prev, [file.category]: true }));
    }

    setSelectedFile(file);
    setIsLoadingFile(true);
    setSaveSuccess(false);
    try {
      const text = await BisectService.getFileContents(
        selectedServer.attributes.identifier,
        file.path,
        bisectConfig
      );
      setFileContent(text || '');
      setInitialContent(text || '');
    } catch (err) {
      console.error('Fehler beim Laden der Datei:', err);
      setFileContent(`# Fehler beim Laden der Datei:\n# ${err.message}`);
      setInitialContent('');
    } finally {
      setIsLoadingFile(false);
    }
  };

  // Speichert den Inhalt zurück auf den Server
  const handleSave = async () => {
    if (!selectedFile || !selectedServer) return;
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await BisectService.writeFile(
        selectedServer.attributes.identifier,
        selectedFile.path,
        fileContent,
        bisectConfig
      );
      setInitialContent(fileContent);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      appAlert(`Fehler beim Speichern: ${err.message}`, { warning: true });
    } finally {
      setIsSaving(false);
    }
  };

  // Führt einen schnellen Reload-Befehl aus (z. B. /kchat reload)
  const handleRunCommand = async (command) => {
    if (!selectedServer) return;
    try {
      await BisectService.sendCommand(
        selectedServer.attributes.identifier,
        command,
        bisectConfig
      );
      setCommandFeedback(`Befehl "/${command}" erfolgreich an die Server-Konsole gesendet!`);
      setTimeout(() => setCommandFeedback(null), 4000);
    } catch (err) {
      appAlert(`Fehler beim Senden des Befehls: ${err.message}`, { warning: true });
    }
  };

  // Gefilterte Dateien
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
      const cat = file.category || 'Weitere Configs';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(file);
    }
    return groups;
  }, [filteredFiles]);

  // VISUELLER PARSER: Wandelt Konfigurationszeilen (YAML, Properties, etc.) in interaktive Felder um
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

      // Leerzeile
      if (!trimmed) {
        if (currentComment.length > 0) {
          items.push({ type: 'comment_block', text: currentComment.join('\n'), index });
          currentComment = [];
        }
        return;
      }

      // Abschnitts-Überschrift (z. B. "[category]" in TOML/INI oder "section:" in YAML)
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

      // Key-Value-Paar (YAML: "key: value" oder Properties: "key=value" / "key:value")
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
        // Nicht passendes Textfragment
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
    const oldLine = lines[item.lineIndex];

    let formattedValue = newValue;
    if (item.valType === 'string' && (item.originalValue.startsWith('"') || item.originalValue.startsWith("'"))) {
      const quote = item.originalValue[0];
      formattedValue = `${quote}${newValue}${quote}`;
    }

    // Zeile rekonstruieren
    const newLine = `${item.indent}${item.key}${item.separator} ${formattedValue}`;
    lines[item.lineIndex] = newLine;
    setFileContent(lines.join(lineEnding));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', flex: 1, minHeight: 0, height: '100%' }}>
      {/* Erfolgs-Meldung für Befehle */}
      {commandFeedback && (
        <div
          style={{
            padding: '10px 16px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid #10b981',
            borderRadius: '12px',
            color: '#10b981',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0
          }}
        >
          <CheckCircle2 size={16} style={{ color: '#10b981' }} />
          <span>{commandFeedback}</span>
        </div>
      )}

      {/* Hauptbereich: 2-Spalten-Layout (Dateibaum links, Editor rechts) */}
      <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: '16px', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Linke Spalte: Dateiliste */}
        <div
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
              onClick={loadFileList}
              disabled={isLoadingList}
              title="Dateiliste aktualisieren"
              style={{ padding: '7px 10px' }}
            >
              <RefreshCw size={13} className={isLoadingList ? 'spin' : ''} />
            </button>
          </div>

          {/* Dateibaum (separat scrollbar) */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px' }}>
            {isLoadingList ? (
              <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)', fontSize: '13px' }}>
                Lade Server-Dateien...
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Folder size={12} style={{ color: 'var(--color-primary)' }} />
                        <span>{category}</span>
                        <span style={{ fontSize: '10px', opacity: 0.6, fontWeight: 500 }}>({files.length})</span>
                      </div>
                      <ChevronDown
                        size={13}
                        style={{
                          transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                          transition: 'transform 0.2s ease',
                          opacity: 0.7
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
                              onClick={() => loadFile(file)}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <FileText
                                  size={14}
                                  className="config-file-icon"
                                  style={{ color: isSelected ? 'var(--color-primary)' : '#94a3b8', flexShrink: 0, transition: 'color 0.15s ease' }}
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
              flexShrink: 0
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FileCode size={18} style={{ color: 'var(--color-primary)' }} />
              <div>
                <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-main)', fontFamily: 'monospace' }}>
                  {selectedFile ? selectedFile.path : 'Keine Datei ausgewählt'}
                </span>
                {hasUnsavedChanges && (
                  <span
                    style={{
                      marginLeft: '10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#d97706',
                      background: 'rgba(245, 158, 11, 0.18)',
                      padding: '2px 8px',
                      borderRadius: '999px'
                    }}
                  >
                    Ungespeichert
                  </span>
                )}
              </div>
            </div>

            {/* Modus-Umschalter & Speicher-Button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
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
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: item.key === 'enabled' ? 'var(--color-primary-soft)' : 'var(--bg-well)',
                          border: `1px solid ${item.key === 'enabled' ? 'var(--color-primary-border)' : 'var(--border-card)'}`,
                          borderRadius: '12px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Label & Beschreibung */}
                        <div style={{ maxWidth: '65%' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

