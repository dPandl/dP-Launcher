import React, { useEffect, useRef } from 'react';
import { SkinViewer, IdleAnimation } from 'skinview3d';

export default function Skin3DViewer({ skinUrl, modelVariant = 'classic', width = 280, height = 320 }) {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    // SkinViewer initialisieren
    const viewer = new SkinViewer({
      canvas: canvasRef.current,
      width,
      height,
      model: modelVariant === 'slim' ? 'slim' : 'default'
    });

    viewer.autoRotate = true;
    viewer.autoRotateSpeed = 1.0;
    viewer.animation = new IdleAnimation();

    // Zoom und Kameraposition anpassen
    viewer.zoom = 0.9;
    viewer.fov = 70;

    viewerRef.current = viewer;

    const handleVisibility = () => {
      if (!viewerRef.current) return;
      if (document.hidden) {
        viewer.autoRotate = false;
        if (viewer.animation) viewer.animation.paused = true;
      } else {
        viewer.autoRotate = true;
        if (viewer.animation) viewer.animation.paused = false;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  // Skin oder Modell-Typ (Classic / Slim) dynamisch aktualisieren
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !skinUrl) return;

    const modelType = modelVariant === 'slim' ? 'slim' : 'default';
    viewer.loadSkin(skinUrl, { model: modelType })
      .then(() => {
        if (viewer.playerObject && viewer.playerObject.skin) {
          viewer.playerObject.skin.modelType = modelType;
        }
      })
      .catch(err => {
        console.warn('Skin3DViewer konnte Skin nicht laden:', err);
      });
  }, [skinUrl, modelVariant]);

  return (
    <div style={{ position: 'relative', width: `${width}px`, height: `${height}px`, margin: '0 auto', cursor: 'grab' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', outline: 'none' }} />
      <div style={{ position: 'absolute', bottom: '6px', right: '10px', fontSize: '10px', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>
        3D • Ziehen zum Drehen
      </div>
    </div>
  );
}

