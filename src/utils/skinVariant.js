// Erkennt, ob eine Skin-Textur für das schmale Modell (Alex / Slim) gemacht ist.
// Bei Slim-Skins bleibt die vierte Pixelspalte der Arme leer (transparent).
// Liefert 'slim', 'classic' oder null, wenn sich das Bild nicht lesen lässt.
export function detectSkinVariant(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        if (image.width !== 64 || image.height !== 64) { resolve('classic'); return; }
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(image, 0, 0);
        const isEmptyColumn = (x, yFrom, yTo) => {
          const { data } = context.getImageData(x, yFrom, 1, yTo - yFrom + 1);
          // Manche Programme speichern "leer" nicht als 0, sondern als fast durchsichtig (zum Beispiel 15 von 255)
          for (let i = 3; i < data.length; i += 4) if (data[i] > 40) return false;
          return true;
        };
        // Rechter Arm (x 54, y 20-31) und linker Arm (x 47, y 52-63)
        resolve(isEmptyColumn(54, 20, 31) && isEmptyColumn(47, 52, 63) ? 'slim' : 'classic');
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
