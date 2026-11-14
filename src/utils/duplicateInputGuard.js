// Steam Deck: Die Steam-Tastatur schickt jedes Zeichen zweimal kurz hintereinander (dirt -> ddiirrtt).
// Ein zweites gleiches Zeichen im selben Feld, das praktisch gleichzeitig ankommt, kann kein Mensch tippen
// und wird verworfen. Gilt nur unter Linux.
const DUPLICATE_WINDOW_MS = 40;

export function startDuplicateInputGuard() {
  if (typeof document === 'undefined' || !/linux/i.test(navigator.platform || navigator.userAgent)) return;

  let last = { target: null, data: null, time: 0 };

  document.addEventListener('beforeinput', (event) => {
    if (event.inputType !== 'insertText' || !event.data || event.isComposing) return;
    const now = performance.now();
    const isDuplicate = event.target === last.target
      && event.data === last.data
      && now - last.time < DUPLICATE_WINDOW_MS;
    last = { target: event.target, data: event.data, time: now };
    if (isDuplicate) {
      event.preventDefault();
      event.stopImmediatePropagation();
      // Nicht als Anfang eines neuen Paares werten, sonst fällt bei „lll“ das dritte Zeichen weg
      last = { target: null, data: null, time: 0 };
    }
  }, true);
}
