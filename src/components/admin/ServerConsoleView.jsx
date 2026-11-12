import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal, Send, Trash2, ArrowDown, Copy, Check, RefreshCw,
  Shield, UserCheck, UserX, Sun, Moon, CloudRain, Zap,
  Play, Sparkles, MessageSquare, AlertCircle, HardDrive,
  Users, Search, Radio, Sliders, CheckCircle2, ChevronRight,
  Eye, Swords, Compass
} from 'lucide-react';
import { BisectService } from '../../services/bisectService';
import { appPrompt, appConfirm, appAlert } from '../../utils/appDialog';

// Bereinigt ANSI-Farbcodes aus Konsolenausgaben
function cleanAnsi(text) {
  if (typeof text !== 'string') return String(text ?? '');
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/[\x00-\x09\x0B-\x1F\x7F]/g, '');
}

// Analysiert eine Logzeile für Syntax-Highlighting
function parseLogLine(rawText) {
  let text = cleanAnsi(rawText).trim();
  let type = 'info';
  let badge = null;

  // Befehl (entweder mit '> ' Prefix oder Wings-Echo ohne Zeitstempel wie 'op Spieler', 'whitelist on', etc.)
  if (text.startsWith('> ') || text.startsWith('Befehl gesendet:') || (!text.startsWith('[') && !text.includes('INFO') && !text.includes('WARN') && !text.includes('ERROR') && !text.includes(':') && text.length < 80)) {
    type = 'command';
    if (!text.startsWith('> ')) {
      text = `> ${text}`;
    }
  } else if (/\[.*?\b(ERROR|FATAL|EXCEPTION|CRITICAL)\b.*?\]/i.test(text) || text.startsWith('[FEHLER]') || /Exception in thread/i.test(text)) {
    type = 'error';
    badge = 'ERROR';
  } else if (/\[.*?\b(WARN|WARNING)\b.*?\]/i.test(text)) {
    type = 'warn';
    badge = 'WARN';
  } else if (/joined the game|left the game/i.test(text)) {
    type = 'player';
  }

  return { text, type, badge };
}

export default function ServerConsoleView({
  selectedServer,
  bisectConfig,
  isConnected
}) {
  const [logs, setLogs] = useState([]);
  const [inputCommand, setInputCommand] = useState('');
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'errors' | 'commands'
  const [copied, setCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [wsStatus, setWsStatus] = useState({ connected: false, state: 'idle' });
  const [lastFeedback, setLastFeedback] = useState(null);

  const logsEndRef = useRef(null);
  const terminalBodyRef = useRef(null);
  const inputRef = useRef(null);
  const recentSentRef = useRef(new Map());
  const recentLinesRef = useRef(new Map());

  const serverId = selectedServer?.attributes?.identifier || bisectConfig?.serverId;

  // Verbindungsaufbau beim Mount oder Serverwechsel
  const connectToConsole = async () => {
    if (!serverId) return;
    setWsStatus({ connected: false, state: 'connecting' });

    if (window.electronAPI?.serverConsoleConnect) {
      try {
        const res = await window.electronAPI.serverConsoleConnect({
          serverId,
          configOverride: bisectConfig
        });
        if (!res.success && !res.aborted) {
          setWsStatus({ connected: false, state: 'error', error: res.error });
        }
      } catch (err) {
        setWsStatus({ connected: false, state: 'error', error: err.message });
      }
    }
  };

  useEffect(() => {
    connectToConsole();

    // Listener für eingehende Logzeilen mit intelligenter Echo- & Duplikatsunterdrückung
    let unsubscribeLine = null;
    let unsubscribeStatus = null;

    if (window.electronAPI?.onServerConsoleLine) {
      unsubscribeLine = window.electronAPI.onServerConsoleLine((line) => {
        const clean = cleanAnsi(line).trim();
        if (!clean) return;

        const now = Date.now();
        const norm = clean.replace(/^>\s*/, '').replace(/^\/+/, '').trim().toLowerCase();

        // 1. Wings Echo-Filter: Falls dieser Befehl soeben von uns abgeschickt wurde,
        // sendet Wings/PTY den Befehl bis zu 2x als Terminal-Echo zurück.
        // Da wir den Befehl bereits bei handleSendCommand sofort anzeigen, ignorieren wir alle Echos!
        const sentTime = recentSentRef.current.get(norm);
        if (sentTime && (now - sentTime < 3500)) {
          return;
        }

        // 2. Allgemeine Zeilen-Deduplizierung für Stream-Verdopplungen innerhalb von 1500ms
        const lastSeen = recentLinesRef.current.get(clean);
        if (lastSeen && (now - lastSeen < 1500)) {
          return;
        }
        recentLinesRef.current.set(clean, now);
        if (recentLinesRef.current.size > 200) {
          recentLinesRef.current.clear();
        }

        setLogs(prev => {
          const parsed = parseLogLine(clean);
          const newLogs = [...prev, { id: now + Math.random(), ...parsed }];
          // Maximal 1200 Zeilen im Speicher behalten
          if (newLogs.length > 1200) {
            return newLogs.slice(newLogs.length - 1200);
          }
          return newLogs;
        });
      });
    }

    if (window.electronAPI?.onServerConsoleStatus) {
      unsubscribeStatus = window.electronAPI.onServerConsoleStatus((status) => {
        setWsStatus(prev => ({ ...prev, ...status }));
      });
    }

    return () => {
      if (unsubscribeLine) unsubscribeLine();
      if (unsubscribeStatus) unsubscribeStatus();
      if (window.electronAPI?.serverConsoleDisconnect) {
        window.electronAPI.serverConsoleDisconnect();
      }
    };
  }, [serverId]);

  // Auto-Scroll nach unten bei neuen Logs
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Prüfen ob der Nutzer selbst nach oben gescrollt hat
  const handleScroll = () => {
    if (!terminalBodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalBodyRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    if (isAtBottom !== autoScroll) {
      setAutoScroll(isAtBottom);
    }
  };

  // Befehl absenden
  const handleSendCommand = async (commandToSend = null) => {
    const cmd = (commandToSend !== null ? commandToSend : inputCommand).trim();
    if (!cmd) return;

    const cleanCmd = cmd.replace(/^\/+/, '').trim();
    const now = Date.now();

    // 1. Befehl sofort genau 1x im Terminal anzeigen
    setLogs(prev => [...prev, { id: now + Math.random(), text: `> ${cleanCmd}`, type: 'command' }]);

    // 2. In recentSentRef eintragen, damit Wings-Echos dieses Befehls ignoriert werden
    recentSentRef.current.set(cleanCmd.toLowerCase(), now);

    setIsSending(true);
    setInputCommand('');
    setHistory(prev => [cmd, ...prev.filter(c => c !== cmd)].slice(0, 50));
    setHistoryIndex(-1);

    try {
      if (window.electronAPI?.serverConsoleSend) {
        const res = await window.electronAPI.serverConsoleSend({
          serverId,
          command: cmd,
          configOverride: bisectConfig
        });
        if (!res.success) {
          setLastFeedback({ type: 'error', text: `Fehler: ${res.error}` });
        } else {
          setLastFeedback({ type: 'success', text: `Befehl ausgeführt: /${cmd}` });
        }
      } else {
        await BisectService.sendCommand(serverId, cmd, bisectConfig);
        setLastFeedback({ type: 'success', text: `Befehl gesendet: /${cmd}` });
      }
    } catch (err) {
      setLastFeedback({ type: 'error', text: err.message });
    } finally {
      setIsSending(false);
      setTimeout(() => setLastFeedback(null), 4000);
      if (inputRef.current) inputRef.current.focus();
    }
  };

  // Pfeiltasten für Befehls-Historie
  const handleKeyDown = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const nextIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      setInputCommand(history[nextIndex]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInputCommand('');
      } else {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        setInputCommand(history[nextIndex]);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleSendCommand();
    }
  };

  // Gesamte Konsole in Zwischenablage kopieren
  const handleCopyLogs = () => {
    const text = logs.map(l => l.text).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Konsole leeren
  const handleClearLogs = () => {
    setLogs([]);
  };

  // Gefilterte Logs berechnen
  const filteredLogs = logs.filter(l => {
    if (filterType === 'errors' && l.type !== 'error' && l.type !== 'warn') return false;
    if (filterType === 'commands' && l.type !== 'command') return false;
    if (filterQuery.trim()) {
      return l.text.toLowerCase().includes(filterQuery.toLowerCase());
    }
    return true;
  });

  // Shortcut-Aktionen mit Dialog-Eingabe
  const promptAndRun = async (message, commandTemplate, options = {}) => {
    const value = await appPrompt(message, options);
    if (value && value.trim()) {
      const finalCmd = commandTemplate.replace('{val}', value.trim());
      handleSendCommand(finalCmd);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '14px' }}>
      
      {/* ─── OBERE STATUS- & SCHNELLZUGRIFFS-LEISTE ─── */}
      <div className="glass-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'rgba(235, 114, 43, 0.12)',
            border: '1px solid rgba(235, 114, 43, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent, #ea580c)'
          }}>
            <Terminal size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Live Server-Konsole</h3>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 500,
                background: wsStatus.connected ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: wsStatus.connected ? '#4ade80' : '#fbbf24',
                border: wsStatus.connected ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
              }}>
                <span style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: wsStatus.connected ? '#22c55e' : '#f59e0b',
                  boxShadow: wsStatus.connected ? '0 0 8px #22c55e' : 'none'
                }} />
                <span>{wsStatus.connected ? 'WebSocket Live-Stream' : (wsStatus.state === 'connecting' ? 'Verbinde...' : 'REST Fallback aktiv')}</span>
              </div>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '12px', opacity: 0.65 }}>
              Echtzeit-Ausgabe von {selectedServer?.attributes?.name || 'Minecraft Server'} ({serverId})
            </p>
          </div>
        </div>

        {/* Schnellaktionen für die Konsole */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Text-Filter */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={13} style={{ position: 'absolute', left: '9px', opacity: 0.5 }} />
            <input
              type="text"
              placeholder="Logs durchsuchen..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                padding: '6px 10px 6px 28px',
                fontSize: '12px',
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '7px',
                color: 'inherit',
                outline: 'none',
                width: '160px'
              }}
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                style={{
                  position: 'absolute',
                  right: '6px',
                  background: 'none',
                  border: 'none',
                  color: 'inherit',
                  opacity: 0.5,
                  cursor: 'pointer',
                  padding: '2px'
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Filter-Buttons */}
          <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              type="button"
              onClick={() => setFilterType('all')}
              style={{
                background: filterType === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent',
                border: 'none',
                color: 'inherit',
                padding: '4px 8px',
                borderRadius: '5px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Alle ({logs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('errors')}
              style={{
                background: filterType === 'errors' ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                border: 'none',
                color: filterType === 'errors' ? '#f87171' : 'inherit',
                padding: '4px 8px',
                borderRadius: '5px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Fehler
            </button>
            <button
              type="button"
              onClick={() => setFilterType('commands')}
              style={{
                background: filterType === 'commands' ? 'rgba(235, 114, 43, 0.2)' : 'transparent',
                border: 'none',
                color: filterType === 'commands' ? '#fb923c' : 'inherit',
                padding: '4px 8px',
                borderRadius: '5px',
                fontSize: '11px',
                cursor: 'pointer'
              }}
            >
              Befehle
            </button>
          </div>

          {/* Kopieren */}
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCopyLogs}
            title="Alle Logs kopieren"
            style={{ padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            {copied ? <Check size={13} color="#4ade80" /> : <Copy size={13} />}
            <span>{copied ? 'Kopiert' : 'Kopieren'}</span>
          </button>

          {/* Leeren */}
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClearLogs}
            title="Konsole im Launcher leeren"
            style={{ padding: '6px 10px', fontSize: '12px' }}
          >
            <Trash2 size={13} />
          </button>

          {/* Neu verbinden */}
          <button
            type="button"
            className="btn-secondary"
            onClick={connectToConsole}
            title="Verbindung zur Server-Konsole neu aufbauen"
            style={{ padding: '6px 10px', fontSize: '12px' }}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ─── TERMINAL & SHORTCUT CONTAINER (SPLIT) ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '14px', flex: 1, minHeight: 0 }}>
        
        {/* LINKE SPALTE: SCHWARZES TERMINAL-FENSTER & BEFEHLSEINGABE */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: '10px' }}>
          
          {/* Terminal-Ausgabebereich */}
          <div
            ref={terminalBodyRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              minHeight: 0,
              background: '#0a0d14',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '14px',
              fontFamily: 'Consolas, "Fira Code", Monaco, monospace',
              fontSize: '12.5px',
              lineHeight: '1.55',
              overflowY: 'auto',
              position: 'relative',
              boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)'
            }}
          >
            {filteredLogs.length === 0 ? (
              <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.3)',
                gap: '8px'
              }}>
                <Terminal size={32} opacity={0.3} />
                <span>{logs.length === 0 ? 'Warte auf Konsolenausgaben des Servers...' : 'Keine Zeilen für diesen Filter gefunden.'}</span>
                {logs.length === 0 && (
                  <button
                    type="button"
                    onClick={() => handleSendCommand('list')}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.8)',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      cursor: 'pointer',
                      marginTop: '6px'
                    }}
                  >
                    Ping mit /list senden
                  </button>
                )}
              </div>
            ) : (
              filteredLogs.map((log) => {
                let color = '#d1d5db';
                let bg = 'transparent';
                let fontWeight = 400;

                if (log.type === 'command') {
                  color = '#fb923c';
                  bg = 'rgba(235, 114, 43, 0.08)';
                  fontWeight = 600;
                } else if (log.type === 'error') {
                  color = '#f87171';
                  bg = 'rgba(239, 68, 68, 0.06)';
                } else if (log.type === 'warn') {
                  color = '#fbbf24';
                } else if (log.type === 'player') {
                  color = '#60a5fa';
                }

                return (
                  <div
                    key={log.id}
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      color,
                      background: bg,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontWeight
                    }}
                  >
                    {log.text}
                  </div>
                );
              })
            )}
            <div ref={logsEndRef} />

            {/* Schwebender Button "Nach unten scrollen" falls Nutzer hochgescrollt hat */}
            {!autoScroll && (
              <button
                type="button"
                onClick={() => {
                  setAutoScroll(true);
                  if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  position: 'sticky',
                  bottom: '10px',
                  float: 'right',
                  marginRight: '8px',
                  background: 'rgba(235, 114, 43, 0.9)',
                  color: '#fff',
                  border: 'none',
                  padding: '5px 10px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}
              >
                <ArrowDown size={12} />
                <span>Neueste Logs</span>
              </button>
            )}
          </div>

          {/* Feedback-Banner für gesendete Befehle */}
          {lastFeedback && (
            <div style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: lastFeedback.type === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
              color: lastFeedback.type === 'error' ? '#f87171' : '#4ade80',
              border: lastFeedback.type === 'error' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(34, 197, 94, 0.3)'
            }}>
              {lastFeedback.type === 'error' ? <AlertCircle size={14} /> : <CheckCircle2 size={14} />}
              <span>{lastFeedback.text}</span>
            </div>
          )}

          {/* Befehlseingabezeile */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(10, 13, 20, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '10px',
            padding: '6px 10px'
          }}>
            <span style={{
              fontFamily: 'monospace',
              fontWeight: 700,
              color: 'var(--accent, #ea580c)',
              fontSize: '14px',
              paddingLeft: '4px'
            }}>
              /
            </span>
            <input
              ref={inputRef}
              type="text"
              value={inputCommand}
              onChange={(e) => setInputCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Befehl eingeben (z.B. help, list, say Hallo, op Spieler)..."
              disabled={isSending}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontFamily: 'Consolas, "Fira Code", Monaco, monospace',
                fontSize: '13px',
                outline: 'none'
              }}
            />
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleSendCommand()}
              disabled={isSending || !inputCommand.trim()}
              style={{
                padding: '7px 14px',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Send size={13} />
              <span>Senden</span>
            </button>
          </div>
        </div>

        {/* RECHTE SPALTE: ADMIN-SHORTCUTS (Whitelist, OP, Gamemode, Wetter, Server) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          overflowY: 'auto',
          paddingRight: '4px',
          minHeight: 0
        }}>

          {/* 1. KATEGORIE: 🛡️ WHITELIST */}
          <div className="glass-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Shield size={16} color="#60a5fa" />
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Whitelist Steuerung</h4>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('whitelist on')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Whitelist: AN
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('whitelist off')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Whitelist: AUS
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => promptAndRun('Welcher Minecraft-Spieler soll gewhitelistet werden?', 'whitelist add {val}', { placeholder: 'Spielername...' })}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                + Spieler adden
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => promptAndRun('Welcher Spieler soll von der Whitelist entfernt werden?', 'whitelist remove {val}', { placeholder: 'Spielername...' })}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                - Entfernen
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('whitelist list')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Liste anzeigen
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('whitelist reload')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Neu laden
              </button>
            </div>
          </div>

          {/* 2. KATEGORIE: ⭐ OP & SPIELER-RECHTE */}
          <div className="glass-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Sparkles size={16} color="#fbbf24" />
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>OP & Moderation</h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => promptAndRun('Welchem Spieler sollen OP-Adminrechte gegeben werden?', 'op {val}', { placeholder: 'Spielername...' })}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center', color: '#fbbf24' }}
              >
                <UserCheck size={13} style={{ marginRight: '4px' }} />
                + OP geben
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => promptAndRun('Welchem Spieler sollen OP-Rechte entzogen werden?', 'deop {val}', { placeholder: 'Spielername...' })}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                <UserX size={13} style={{ marginRight: '4px' }} />
                - OP entziehen
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => promptAndRun('Spieler vom Server kicken (Name Grund):', 'kick {val}', { placeholder: 'Spielername Grund...' })}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Kicken
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => promptAndRun('Spieler dauerhaft bannen (Name Grund):', 'ban {val}', { placeholder: 'Spielername Grund...' })}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center', color: '#f87171' }}
              >
                Bannen
              </button>
            </div>
          </div>

          {/* 3. KATEGORIE: 🎮 SPIELMODUS (GAMEMODE) */}
          <div className="glass-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Swords size={16} color="#34d399" />
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Spielmodus (@a)</h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('gamemode survival @a')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Survival
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('gamemode creative @a')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Creative
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('gamemode spectator @a')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Spectator
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('gamemode adventure @a')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Adventure
              </button>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => promptAndRun('Spielmodus für Spieler (z.B. creative Alex):', 'gamemode {val}', { placeholder: 'modus spieler...' })}
              style={{ width: '100%', padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
            >
              Für bestimmten Spieler setzen...
            </button>
          </div>

          {/* 4. KATEGORIE: ☀️ ZEIT & WETTER */}
          <div className="glass-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Sun size={16} color="#fbbf24" />
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Zeit & Wetter</h4>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('time set day')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Sun size={13} color="#fbbf24" />
                <span>Tag</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('time set night')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Moon size={13} color="#a5b4fc" />
                <span>Nacht</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('weather clear')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Sun size={13} color="#38bdf8" />
                <span>Klar</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('weather thunder')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '5px' }}
              >
                <Zap size={13} color="#f59e0b" />
                <span>Gewitter</span>
              </button>
            </div>
          </div>

          {/* 5. KATEGORIE: ⚙️ SERVER & BROADCAST */}
          <div className="glass-card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Sliders size={16} color="#a855f7" />
              <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 600 }}>Server-Befehle</h4>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => promptAndRun('Nachricht an alle Spieler (Rundruf):', 'say {val}', { placeholder: 'Nachricht eingeben...' })}
              style={{ width: '100%', padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <MessageSquare size={13} color="#f472b6" />
              <span>Rundruf senden (/say)</span>
            </button>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('save-all')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Welt speichern
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleSendCommand('reload')}
                style={{ padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center' }}
              >
                Server Reload
              </button>
            </div>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleSendCommand('list')}
              style={{ width: '100%', padding: '6px 8px', fontSize: '11.5px', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              <Users size={13} />
              <span>Online-Spieler abfragen (/list)</span>
            </button>
          </div>

        </div>

      </div>

    </div>
  );
}

