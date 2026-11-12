/**
 * Globaler Navigations- und Zurück-Stack (nach Kita-Portal Vorbild).
 * Ermöglicht es Unteransichten (z. B. Mod-Detailseiten, Modals etc.),
 * sich im Zurück-Button einzuklinken, sodass Klicks auf den schwebenden
 * Zurück-Knopf unten links zuerst die Unteransicht schließen.
 */

const backHandlers = [];
const listeners = new Set();

export function registerBackHandler(handler, label = 'Zurück') {
  const item = { handler, label };
  backHandlers.push(item);
  notifyListeners();

  return () => {
    const idx = backHandlers.indexOf(item);
    if (idx !== -1) {
      backHandlers.splice(idx, 1);
      notifyListeners();
    }
  };
}

export function triggerBack() {
  if (backHandlers.length > 0) {
    const item = backHandlers.pop();
    notifyListeners();
    try {
      item.handler();
    } catch (err) {
      console.error('Fehler beim Ausführen des Back-Handlers:', err);
    }
    return true;
  }
  return false;
}

export function getCurrentBackInfo() {
  if (backHandlers.length > 0) {
    return backHandlers[backHandlers.length - 1];
  }
  return null;
}

export function subscribeBack(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach(fn => {
    try {
      fn();
    } catch (_err) {}
  });
}

