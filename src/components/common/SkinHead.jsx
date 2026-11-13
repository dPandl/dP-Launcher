import React, { useEffect, useRef } from 'react';

// Zeichnet den Kopf (Gesicht und Hut-Ebene) aus einer Skin-Textur
export default function SkinHead({ src, size = 52, style }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !src) return undefined;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const context = canvas.getContext('2d');
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 8, 8, 8, 8, 0, 0, canvas.width, canvas.height);
      context.drawImage(image, 40, 8, 8, 8, 0, 0, canvas.width, canvas.height);
    };
    image.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      style={{ width: size, height: size, borderRadius: '10px', background: 'var(--bg-well)', imageRendering: 'pixelated', boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)', ...style }}
    />
  );
}
