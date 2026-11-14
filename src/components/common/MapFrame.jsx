import React, { useEffect, useRef, useState } from 'react';
import { Map as MapIcon, RefreshCw } from 'lucide-react';

// Live-Karte des Servers (BlueMap, Dynmap ...) in einem abgerundeten Rahmen.
// reloadKey: ändert sich der Wert, lädt die Karte neu. Die Knöpfe dazu stehen außerhalb, damit sie die Karte nicht verdecken.
export default function MapFrame({ url, serverName, reloadKey = 0 }) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const webviewRef = useRef(null);
  // In der App läuft die Karte in einem webview (der Mauszeiger des TV-Modus erreicht sie nur so), im Browser in einem iframe
  const useWebview = typeof window !== 'undefined' && Boolean(window.electronAPI);

  useEffect(() => {
    setLoaded(false);
    setSlow(false);
    if (!url) return undefined;
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, [url, reloadKey]);

  useEffect(() => {
    const view = webviewRef.current;
    if (!view) return undefined;
    const done = () => setLoaded(true);
    view.addEventListener('did-stop-loading', done);
    return () => view.removeEventListener('did-stop-loading', done);
  }, [url, reloadKey, useWebview]);

  if (!url) {
    return (
      <div className="glass-card map-frame-empty">
        <MapIcon size={34} style={{ color: 'var(--color-primary)', opacity: 0.7, marginBottom: '12px' }} />
        <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 8px' }}>Keine Karte hinterlegt</h3>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: '460px', margin: 0 }}>
          Für {serverName || 'diesen Server'} ist noch keine Karte eingetragen. Der Server-Admin trägt die Adresse seiner BlueMap oder Dynmap im Server-Admin unter „Server &amp; Repository“ ein.
          Du kannst sie auch beim Bearbeiten des Servers im Reiter „Server“ angeben, zum Beispiel <code>http://mc.beispiel.de:8100</code> (BlueMap) oder <code>:8123</code> (Dynmap).
        </p>
      </div>
    );
  }

  return (
    <div className="map-frame">
      {useWebview ? (
        <webview
          key={reloadKey}
          ref={webviewRef}
          src={url}
          partition="persist:server-map"
          allowpopups="true"
          className="map-frame-iframe map-frame-webview"
        />
      ) : (
        <iframe
          key={reloadKey}
          src={url}
          title={`Karte von ${serverName || 'Server'}`}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-pointer-lock"
          referrerPolicy="no-referrer"
          allow="fullscreen"
          onLoad={() => setLoaded(true)}
          className="map-frame-iframe"
        />
      )}

      {!loaded && (
        <div className="map-frame-overlay">
          <RefreshCw size={22} className="spin" style={{ color: 'var(--color-primary)' }} />
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Karte wird geladen...</div>
          {slow && (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: 1.6, textAlign: 'center' }}>
              Das dauert ungewöhnlich lange. Prüfe, ob die Karte unter <strong>{url}</strong> erreichbar ist und der Server läuft.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
