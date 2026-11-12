import React, { useState, useEffect, useRef } from 'react';
import { Send, Wifi, WifiOff, RefreshCw, Trash2, User, Sparkles, MessageSquare, AlertCircle, Key, Server, Power, Info, LogIn, LogOut } from 'lucide-react';
import { chatBridge } from '../services/chatBridgeService';
import { appAlert } from '../utils/appDialog';
import { resolveServerAddress, splitServerAddress, getActiveServer } from '../utils/serverAddress';

function parseSystemMessage(text) {
  const clean = (text || '')
    .replace(/^[\s\u{1F7E0}-\u{1F7EB}\u{26AA}\u{26AB}\u{25CF}\u{2022}\u{2705}\u{274C}\u{26A0}\u{FE0F}]+/u, '')
    .trim();

  // 1. Join (Spieler beigetreten)
  const joinMatch = clean.match(/^([a-zA-Z0-9_]{2,16})\s+(?:joined the server|joined the game|hat das Spiel betreten|ist dem Server beigetreten|ist beigetreten)\.?$/i);
  if (joinMatch) {
    return {
      category: 'join',
      player: joinMatch[1],
      label: 'ist beigetreten'
    };
  }

  // 2. Leave (Spieler verlassen)
  const leaveMatch = clean.match(/^([a-zA-Z0-9_]{2,16})\s+(?:left the server|left the game|hat das Spiel verlassen|hat den Server verlassen)\.?$/i);
  if (leaveMatch) {
    return {
      category: 'leave',
      player: leaveMatch[1],
      label: 'hat den Server verlassen'
    };
  }

  // 3. Server started
  if (/^server\s+(?:started|is online|bereit|online|gestartet)\.?$/i.test(clean)) {
    return {
      category: 'server-online',
      label: 'Server ist gestartet & online'
    };
  }

  // 4. Server stopping / stopped
  if (/^server\s+(?:is stopping|stopped|shutdown|stoppt|wird gestoppt)\.?$/i.test(clean)) {
    return {
      category: 'server-offline',
      label: 'Server wird heruntergefahren'
    };
  }

  return {
    category: 'generic',
    text: clean || text
  };
}

export default function ServerChatView({ account, settings, manifest, onOpenProfile }) {
  const serverAddress = resolveServerAddress(settings, manifest);
  const [messages, setMessages] = useState(() => chatBridge.getMessages());
  const [inputValue, setInputValue] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState(chatBridge.status);
  const [isSending, setIsSending] = useState(false);
  const [serverOnline, setServerOnline] = useState(null);
  const [playerCount, setPlayerCount] = useState({ online: 0, max: 20 });
  const messagesEndRef = useRef(null);
  const viewportRef = useRef(null);

  const scrollToBottom = (smooth = true) => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    } else if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    }
  };

  // 1. Echten Minecraft Server-Status live per TCP pingen
  useEffect(() => {
    const pingServer = async () => {
      if (window.electronAPI?.checkServerStatus) {
        try {
          const res = await window.electronAPI.checkServerStatus(serverAddress);
          if (res && res.online) {
            setServerOnline(true);
            if (res.players) setPlayerCount(res.players);
          } else {
            setServerOnline(false);
          }
        } catch {
          setServerOnline(false);
        }
      }
    };

    pingServer();
    const interval = setInterval(pingServer, 8000);
    return () => clearInterval(interval);
  }, [serverAddress]);

  // 2. Chat-Bridge WebSocket-Verbindung
  useEffect(() => {
    chatBridge.connect(splitServerAddress(serverAddress).host || null, Number(getActiveServer(settings)?.chatPort || settings?.chatPort) || null);

    const unsubscribe = chatBridge.subscribe((event) => {
      if (event.type === 'status') {
        setBridgeStatus(event.status);
      } else if (event.type === 'message' || event.type === 'history_cleared' || event.type === 'history_sync') {
        setMessages([...chatBridge.getMessages()]);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [serverAddress]);

  // Automatisch nach unten scrollen bei neuen Nachrichten
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom(true);
    }, 40);
    return () => clearTimeout(timer);
  }, [messages]);

  // Einmalig beim Mounten sofort nach ganz unten scrollen
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom(false);
    }, 80);
    return () => clearTimeout(timer);
  }, []);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    const text = inputValue.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      await chatBridge.sendMessage(account, text);
      setInputValue('');
    } catch (err) {
      await appAlert(`Nachricht konnte nicht übertragen werden: ${err.message}`, { warning: true });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClearChat = () => {
    chatBridge.clearHistory();
  };

  const handleReconnect = () => {
    chatBridge.disconnect();
    chatBridge.connect(splitServerAddress(serverAddress).host || null, Number(getActiveServer(settings)?.chatPort || settings?.chatPort) || null);
  };

  const [isActivatingKokoto, setIsActivatingKokoto] = useState(false);
  const chatPort = getActiveServer(settings)?.chatPort || settings?.chatPort || 8899;
  const isBridgeConnected = bridgeStatus === 'connected';
  const isBridgeConnecting = bridgeStatus === 'connecting';
  const isAuthError = bridgeStatus === 'auth_error';

  return (
    <div className="server-chat-container">
      
      {/* 1. CHAT HEADER */}
      <div className="glass-card chat-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="chat-header-icon-wrap">
            <MessageSquare size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
                Server-Chat (Live)
              </h2>
              
              {/* Echter Minecraft-Server-Status */}
              <div
                className={`chat-status-pill ${serverOnline ? 'online' : (serverOnline === false ? 'offline' : 'connecting')}`}
                title={serverOnline ? 'Minecraft-Server ist erreichbar' : 'Server nicht erreichbar'}
              >
                <span className="chat-status-dot" />
                <span>
                  {serverOnline
                    ? `Server Online (${playerCount.online}/${playerCount.max})`
                    : (serverOnline === false ? 'Server Offline' : 'Prüfe Server...')}
                </span>
              </div>

              {/* Status der Live-Bridge */}
              <div
                className={`chat-status-pill ${isBridgeConnected ? 'online' : (isBridgeConnecting ? 'connecting' : 'offline')}`}
                title={isBridgeConnected ? `Direkt mit Server-Chat (Port ${chatPort}) verbunden` : `Chat-Mod auf Port ${chatPort} nicht erreichbar`}
              >
                <span className="chat-status-dot" />
                <span>
                  {isBridgeConnected
                    ? 'Chat Live verbunden'
                    : (isBridgeConnecting ? 'Verbinde mit Chat...' : 'Chat-Bridge Standby')}
                </span>
              </div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Minecraft 26.3 • {serverAddress || 'keine Server-Adresse'} • Chat-Port {chatPort}
            </div>
          </div>
        </div>

        {/* Schnellaktionen oben rechts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleReconnect}
            title="Verbindung neu starten"
            style={{ padding: '7px 12px', fontSize: '12px' }}
          >
            <RefreshCw size={13} className={isBridgeConnecting ? 'spin' : ''} />
            <span>Neu verbinden</span>
          </button>
          {messages.length > 0 && (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClearChat}
              title="Chatverlauf leeren"
              style={{ padding: '7px 10px', fontSize: '12px', color: '#94a3b8' }}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Hinweis zur Chat-Bridge Mod */}
      {!isBridgeConnected && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: 'var(--color-primary-soft)',
            border: '1px solid var(--color-primary-border)',
            borderRadius: '18px',
            padding: '12px 20px',
            fontSize: '13px',
            color: 'var(--color-primary-text)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', width: '100%', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <span>
                <strong>Minecraft-Server ist online!</strong> Sobald KOKOTO WebChat auf dem Server aktiviert ist, können alle Spieler direkt aus dem Launcher mit dem Server chatten.
              </span>
            </div>
            {window.electronAPI?.bisectEnableKokotoWebChat && (
              <button
                type="button"
                className="btn-secondary"
                disabled={isActivatingKokoto}
                onClick={async () => {
                  setIsActivatingKokoto(true);
                  try {
                    const res = await window.electronAPI.bisectEnableKokotoWebChat({ port: chatPort });
                    if (res.success) {
                      await appAlert('KOKOTO WebChat wurde erfolgreich aktiviert (enabled: true) und per /kchat reload neu geladen!');
                      chatBridge.connect(null, chatPort);
                    } else {
                      await appAlert(res.error || 'Aktivierung fehlgeschlagen', { warning: true });
                    }
                  } catch (e) {
                    await appAlert(e.message, { warning: true });
                  } finally {
                    setIsActivatingKokoto(false);
                  }
                }}
                style={{ fontSize: '12px', padding: '6px 14px', whiteSpace: 'nowrap', color: 'var(--color-primary-text)', borderColor: 'var(--color-primary-border)', background: 'var(--bg-card)', cursor: 'pointer', fontWeight: 600 }}
              >
                {isActivatingKokoto ? 'Aktiviere...' : 'WebChat jetzt aktivieren (/kchat reload)'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. CHAT FEED (SPEECH BUBBLES) */}
      <div ref={viewportRef} className="chat-messages-viewport">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon">
              <Sparkles size={28} />
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-main)', margin: '10px 0 4px 0' }}>
              Noch keine Chat-Nachrichten
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '380px', margin: 0, lineHeight: 1.5 }}>
              Nachrichten aus dem Minecraft-Spiel erscheinen hier live. Schreibe unten etwas, um es direkt im Ingame-Chat für alle Spieler sichtbar zu machen!
            </p>
          </div>
        ) : (
          <div className="chat-bubbles-list">
            {messages.map((msg, index) => {
              // Handelt es sich um eine System-Meldung (Join / Leave / Start)?
              if (msg.type === 'system') {
                const parsed = parseSystemMessage(msg.text);

                if (parsed.category === 'join') {
                  return (
                    <div key={msg.id} className="chat-system-row">
                      <span className="chat-system-pill join">
                        <span className="chat-system-pulse-dot" style={{ background: '#10b981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)' }} />
                        <img
                          src={`https://crafthead.net/helm/${parsed.player}`}
                          alt={parsed.player}
                          className="chat-system-avatar"
                          loading="lazy"
                        />
                        <span className="chat-system-player">{parsed.player}</span>
                        <span className="chat-system-action">{parsed.label}</span>
                        <span className="chat-system-divider" />
                        <span className="chat-system-time">{msg.timestamp}</span>
                      </span>
                    </div>
                  );
                }

                if (parsed.category === 'leave') {
                  return (
                    <div key={msg.id} className="chat-system-row">
                      <span className="chat-system-pill leave">
                        <span className="chat-system-pulse-dot" style={{ background: '#ef4444', boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)' }} />
                        <img
                          src={`https://crafthead.net/helm/${parsed.player}`}
                          alt={parsed.player}
                          className="chat-system-avatar"
                          loading="lazy"
                        />
                        <span className="chat-system-player">{parsed.player}</span>
                        <span className="chat-system-action">{parsed.label}</span>
                        <span className="chat-system-divider" />
                        <span className="chat-system-time">{msg.timestamp}</span>
                      </span>
                    </div>
                  );
                }

                if (parsed.category === 'server-online') {
                  return (
                    <div key={msg.id} className="chat-system-row">
                      <span className="chat-system-pill server-online">
                        <Server size={13} style={{ color: '#10b981' }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{parsed.label}</span>
                        <span className="chat-system-divider" />
                        <span className="chat-system-time">{msg.timestamp}</span>
                      </span>
                    </div>
                  );
                }

                if (parsed.category === 'server-offline') {
                  return (
                    <div key={msg.id} className="chat-system-row">
                      <span className="chat-system-pill server-offline">
                        <Power size={13} style={{ color: '#f59e0b' }} />
                        <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{parsed.label}</span>
                        <span className="chat-system-divider" />
                        <span className="chat-system-time">{msg.timestamp}</span>
                      </span>
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="chat-system-row">
                    <span className="chat-system-pill generic">
                      <Info size={13} style={{ color: 'var(--text-muted)' }} />
                      <span>{parsed.text}</span>
                      <span className="chat-system-divider" />
                      <span className="chat-system-time">{msg.timestamp}</span>
                    </span>
                  </div>
                );
              }

              // Spieler-Nachricht (Self vs Other)
              const isSelf = msg.isSelf || (account && msg.sender?.toLowerCase() === account.name?.toLowerCase());
              const prevMsg = messages[index - 1];
              const nextMsg = messages[index + 1];

              const isSameSenderAsPrev = prevMsg && prevMsg.type !== 'system' && prevMsg.sender?.toLowerCase() === msg.sender?.toLowerCase();
              const isSameSenderAsNext = nextMsg && nextMsg.type !== 'system' && nextMsg.sender?.toLowerCase() === msg.sender?.toLowerCase();

              // Profilbild erscheint NUR bei der LETZTEN Nachricht einer zusammenhängenden Kette
              const showAvatar = !isSameSenderAsNext;

              // Absendername erscheint NUR bei der ERSTEN Nachricht einer Kette fremder Spieler
              const showSenderName = !isSelf && !isSameSenderAsPrev;

              // Abgerundete Ecken passend zur Position in der Kette
              let bubbleRadiusClass = '';
              if (isSelf) {
                if (isSameSenderAsPrev && isSameSenderAsNext) bubbleRadiusClass = 'bubble-middle-self';
                else if (isSameSenderAsPrev && !isSameSenderAsNext) bubbleRadiusClass = 'bubble-last-self';
                else if (!isSameSenderAsPrev && isSameSenderAsNext) bubbleRadiusClass = 'bubble-first-self';
                else bubbleRadiusClass = 'bubble-single-self';
              } else {
                if (isSameSenderAsPrev && isSameSenderAsNext) bubbleRadiusClass = 'bubble-middle-other';
                else if (isSameSenderAsPrev && !isSameSenderAsNext) bubbleRadiusClass = 'bubble-last-other';
                else if (!isSameSenderAsPrev && isSameSenderAsNext) bubbleRadiusClass = 'bubble-first-other';
                else bubbleRadiusClass = 'bubble-single-other';
              }

              const skinHeadUrl = `https://crafthead.net/helm/${msg.sender}`;

              return (
                <div
                  key={msg.id}
                  className={`chat-bubble-row ${isSelf ? 'self' : 'other'} ${isSameSenderAsNext ? 'grouped-next' : ''}`}
                  style={{ marginBottom: isSameSenderAsNext ? '4px' : '14px' }}
                >
                  {/* Avatar bei fremden Spielern links (nur am Ende der Kette, sonst Spacer für exakte Fluchtlinie) */}
                  {!isSelf && (
                    showAvatar ? (
                      <img
                        src={skinHeadUrl}
                        alt={msg.sender}
                        className="chat-avatar"
                        title={msg.sender}
                        loading="lazy"
                      />
                    ) : (
                      <div className="chat-avatar-spacer" />
                    )
                  )}

                  {/* Die eigentliche Sprechblase */}
                  <div className={`chat-bubble ${isSelf ? 'bubble-self' : 'bubble-other'} ${bubbleRadiusClass}`}>
                    {showSenderName && (
                      <div className="chat-bubble-sender">
                        {msg.sender}
                      </div>
                    )}

                    <div className="chat-bubble-content-wrap">
                      <span className="chat-bubble-text">{msg.text}</span>
                      <span className="chat-bubble-meta">
                        <span className="chat-bubble-time">{msg.timestamp}</span>
                      </span>
                    </div>
                  </div>

                  {/* Avatar bei eigenen Nachrichten rechts (am Ende einer Kette, sonst Spacer für saubere Fluchtlinie) */}
                  {isSelf && (
                    showAvatar ? (
                      <img
                        src={account?.skinUrl || (account?.uuid ? `https://crafthead.net/helm/${account.uuid}` : skinHeadUrl)}
                        alt={msg.sender || account?.name}
                        className="chat-avatar"
                        title={msg.sender || account?.name}
                        loading="lazy"
                      />
                    ) : (
                      <div className="chat-avatar-spacer" />
                    )
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 3. CHAT COMPOSER (EINGABELEISTE) */}
      <div className="glass-card chat-composer-card">
        {account ? (
          <form onSubmit={handleSend} className="chat-composer-form">
            <div className="chat-composer-user-badge" title={`Du schreibst als ${account.name}`}>
              <img
                src={account.skinUrl || (account.uuid ? `https://crafthead.net/helm/${account.uuid}` : `https://crafthead.net/helm/${account.name}`)}
                alt={account.name}
                className="chat-composer-mini-avatar"
              />
              <span className="chat-composer-username">{account.name}</span>
            </div>

            <input
              type="text"
              placeholder={`Nachricht an den Minecraft-Server senden...`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="chat-composer-input"
            />

            <button
              type="submit"
              disabled={!inputValue.trim() || isSending}
              className="btn-primary chat-send-btn"
              title="Nachricht senden (Enter)"
            >
              <Send size={15} />
              <span>Senden</span>
            </button>
          </form>
        ) : (
          <div className="chat-not-logged-in">
            <User size={16} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Bitte melde dich in deinem Profil an, um mit deinem Minecraft-Namen zu chatten.
            </span>
            <button
              type="button"
              className="btn-primary"
              onClick={onOpenProfile}
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              Zum Profil
            </button>
          </div>
        )}
      </div>

    </div>
  );
}

