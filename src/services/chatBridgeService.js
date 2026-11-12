// Service für die direkte Chat-Bridge zwischen Launcher und der Fabric-Server-Mod (KOKOTO WebChat)
const STORAGE_KEY = 'mc_launcher_chat_history_v2';
const MAX_HISTORY = 120;
const DEFAULT_CHAT_PORT = 8899;

class ChatBridgeService {
  constructor() {
    this.ws = null;
    this.eventSource = null;
    this.pollingInterval = null;
    this.listeners = new Set();
    this.status = 'disconnected'; // 'connected' | 'connecting' | 'disconnected'
    this.reconnectTimeout = null;
    this.history = this.loadHistory();
    this.host = ''; // kommt aus den Einstellungen oder der Modliste, nie fest aus dem Code
    this.port = DEFAULT_CHAT_PORT;
    this.isManualDisconnect = false;
  }

  loadHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.history.slice(-MAX_HISTORY)));
    } catch {
      // Ignorieren falls Storage voll
    }
  }

  getMessages() {
    return [...this.history];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener({ type: 'status', status: this.status });
    return () => this.listeners.delete(listener);
  }

  notify(event) {
    this.listeners.forEach(fn => {
      try {
        fn(event);
      } catch (err) {
        console.error('Chat Listener Fehler:', err);
      }
    });
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.notify({ type: 'status', status });
  }

  // Lädt die Historie direkt von KOKOTO WebChat (/api/history)
  async fetchServerHistory() {
    try {
      const res = await fetch(`http://${this.host}:${this.port}/api/history`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.messages)) {
          this.setStatus('connected');
          const serverList = [];
          for (const m of data.messages) {
            const id = m.id || `hist-${m.time || Date.now()}-${m.sender || ''}`;
            const timeStr = m.time ? new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            serverList.push({
              id,
              type: m.source === 'system' ? 'system' : 'player',
              sender: m.sender || m.guestName || (m.source === 'system' ? 'Server' : 'Spieler'),
              text: m.message || m.text || '',
              timestamp: timeStr,
              rawTime: m.time || Date.now()
            });
          }
          serverList.sort((a, b) => (a.rawTime || 0) - (b.rawTime || 0));
          this.history = serverList;
          this.saveHistory();
          this.notify({ type: 'history_sync', history: this.history });
          return true;
        }
      }
    } catch (e) {
      // Server noch nicht erreichbar
    }
    return false;
  }

  // Verbindet sich mit KOKOTO WebChat (SSE /api/stream + /api/history)
  async connect(targetHost = null, targetPort = null) {
    this.isManualDisconnect = false;

    // Auf der Webseite läuft die App nur als Vorschau im Browser. Dort darf sie keine Verbindung
    // zum echten Server aufbauen, sonst sähe jeder Besucher den Chat und könnte mitschreiben.
    if (typeof window !== 'undefined' && !window.electronAPI) {
      this.setStatus('disconnected');
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // Anderer Server: alte Verbindung und den Chatverlauf des vorherigen Servers verwerfen
    if (targetHost && this.host && targetHost !== this.host) {
      this.disconnect();
      this.isManualDisconnect = false;
      this.history = [];
      this.saveHistory();
      this.notify({ type: 'history_cleared' });
    }

    // Host & Port ermitteln
    if (targetHost) this.host = targetHost;
    if (targetPort) this.port = targetPort;

    if (!targetHost && window.electronAPI?.getSettings) {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings?.serverIp) {
          const clean = settings.serverIp.trim();
          const parts = clean.split(':');
          if (parts[0]) this.host = parts[0];
        }
        if (!targetPort && settings?.chatPort) {
          this.port = parseInt(settings.chatPort, 10) || DEFAULT_CHAT_PORT;
        }
      } catch {}
    }

    // Ohne Server-Adresse gibt es nichts zu verbinden
    if (!this.host) {
      this.setStatus('disconnected');
      return;
    }

    this.setStatus('connecting');

    // 1. Zuerst Historie abfragen
    const isUp = await this.fetchServerHistory();
    if (isUp) {
      this.setStatus('connected');
    }

    // 2. Regelmäßiges leichtes Polling alle 6 Sekunden
    if (!this.pollingInterval) {
      this.pollingInterval = setInterval(() => {
        if (!this.isManualDisconnect) {
          this.fetchServerHistory();
        }
      }, 6000);
    }

    // 3. SSE Live-Stream verbinden: /api/stream
    if (!this.eventSource) {
      try {
        const sseUrl = `http://${this.host}:${this.port}/api/stream`;
        const es = new EventSource(sseUrl);
        this.eventSource = es;

        es.onopen = () => {
          this.setStatus('connected');
        };

        es.onmessage = (event) => {
          try {
            const packet = JSON.parse(event.data);
            this.handleIncomingPacket(packet);
          } catch {
            if (event.data && typeof event.data === 'string') {
              this.handleIncomingPacket({ type: 'chat', text: event.data });
            }
          }
        };

        es.addEventListener('message', (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleIncomingPacket(data);
          } catch {}
        });

        es.addEventListener('ready', () => {
          this.setStatus('connected');
        });

        es.onerror = () => {
          if (this.eventSource) {
            try { this.eventSource.close(); } catch (_) {}
            this.eventSource = null;
          }
          if (!isUp) {
            this.setStatus('disconnected');
            if (!this.isManualDisconnect && !this.reconnectTimeout) {
              this.reconnectTimeout = setTimeout(() => this.connect(), 8000);
            }
          }
        };
      } catch (e) {
        if (!isUp) this.setStatus('disconnected');
      }
    }
  }

  disconnect() {
    this.isManualDisconnect = true;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    if (this.eventSource) {
      try { this.eventSource.close(); } catch (_) {}
      this.eventSource = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  // Eingehende JSON-Pakete der Server-Mod verarbeiten
  handleIncomingPacket(packet) {
    if (!packet) return;

    const text = packet.message || packet.text || '';
    if (!text) return;

    const sender = packet.sender || packet.guestName || (packet.source === 'system' ? 'Server' : 'Spieler');
    const timestamp = packet.time ? new Date(packet.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (packet.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

    // Duplikatsprüfung für bereits vorhandene Nachrichten
    const isRecent = this.history.slice(-5).some(m => (packet.id && m.id === packet.id) || (m.text === text && m.sender === sender));
    if (!isRecent) {
      this.addMessage({
        id: packet.id || ('msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
        type: packet.source === 'system' || packet.type === 'system' ? 'system' : 'player',
        sender,
        text,
        timestamp,
        rawTime: packet.time || Date.now()
      });
    }
  }

  addMessage(msg) {
    this.history.push(msg);
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
    this.saveHistory();
    this.notify({ type: 'message', message: msg, history: this.history });
  }

  // Nachricht vom Launcher an den Server schicken
  async sendMessage(account, text) {
    const cleanText = text.trim();
    if (!cleanText) return;

    // Siehe connect(): in der Browser-Vorschau wird nichts an den echten Server gesendet
    if (typeof window !== 'undefined' && !window.electronAPI) return;

    const senderName = account?.name || 'Gast';
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Zuerst über KOKOTO WebChat HTTP API /api/send versuchen
    let sent = false;
    try {
      const apiUrl = `http://${this.host}:${this.port}/api/send`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanText,
          guestName: senderName
        })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.ok) {
          sent = true;
        }
      }
    } catch {}

    // 2. Fallback: Falls HTTP nicht durchging, per Bisect Server-Befehl einspeisen
    if (!sent && window.electronAPI?.bisectApi) {
      try {
        const settings = await window.electronAPI.getSettings?.();
        const serverId = settings?.bisectConfig?.serverId || '89bb7be6';
        const tellraw = `tellraw @a [{"text":"[Launcher] ","color":"gold","bold":true},{"text":"${senderName}: ","color":"yellow"},{"text":"${cleanText.replace(/"/g, '\\"')}","color":"white"}]`;
        const cmdRes = await window.electronAPI.bisectApi({
          method: 'POST',
          endpoint: `/api/client/servers/${serverId}/command`,
          body: { command: tellraw }
        });
        if (cmdRes.success) {
          sent = true;
          // Bei tellraw manuell lokal erfassen, da tellraw kein KOKOTO Mod-Event erzeugt
          this.addMessage({
            id: 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
            type: 'player',
            sender: senderName,
            text: cleanText,
            timestamp,
            rawTime: Date.now()
          });
        }
      } catch {}
    }

    if (!sent) {
      throw new Error('Nachricht konnte nicht an den Server gesendet werden.');
    }

    // 3. Sofort Server-Historie aktualisieren, damit die vom Server bestätigte Nachricht erscheint
    await this.fetchServerHistory();
  }

  clearHistory() {
    this.history = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('mc_launcher_chat_history_v1');
    this.notify({ type: 'history_cleared', history: [] });
  }
}

export const chatBridge = new ChatBridgeService();
