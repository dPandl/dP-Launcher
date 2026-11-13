// Adresse der Live-Karte (BlueMap, Dynmap ...): nur http(s), ohne Zugangsdaten. Leer = keine Karte, ungültig = leer.
// Dieselbe Regel gilt im Hauptprozess (serverStore.js), die Karte landet in einem Rahmen und darf nie ein anderes Schema haben.
export function normalizeMapUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (url.username || url.password || !url.hostname) return '';
  return url.href.length <= 300 ? url.href : '';
}
