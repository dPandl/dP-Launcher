// TV-Modus: Bedienung der ganzen App mit Controller (Steam Deck, Gamepad) und Tastatur.
// Pfeiltasten / Steuerkreuz / linker Stick wechseln den Fokus zum nächsten Element in dieser Richtung,
// A / Enter wählt aus, B / Escape geht zurück, LB / RB wechseln den Hauptreiter, rechter Stick scrollt.
import { triggerBack, getCurrentBackInfo } from './navigation';
import { reportKeyboard, reportGamepad, setPromptMode, setHintsVisible } from './controllerPrompts';

const NATIVE_SELECTOR = 'button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="switch"]';
const MODAL_SELECTOR = '.modal-overlay, .confirm-modal-overlay, [aria-modal="true"]';
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'url', 'number', 'tel', '']);
const FOCUS_ATTR = 'data-tv-focus';

// Bildschirmtastatur: solange sie offen ist, gehören Steuerkreuz, A, B und weitere Tasten ihr
let keyboardHandler = null;
export function setKeyboardHandler(handler) {
  keyboardHandler = handler;
}

// Ein Eingabefeld gilt nur als angeklickt, wenn der Nutzer es aktiviert hat (Klick, A oder Enter), nicht beim bloßen Anvisieren
let lastActivationAt = 0;
export const markActivation = () => { lastActivationAt = performance.now(); };
export const wasJustActivated = () => performance.now() - lastActivationAt < 500;

function activateTextField(el) {
  markActivation();
  el.focus();
  // War das Feld schon fokussiert, kommt kein neues Fokus-Ereignis: die Tastatur wird ausdrücklich angefordert
  window.dispatchEvent(new CustomEvent('tv-osk-request', { detail: el }));
}
const STICK_THRESHOLD = 0.55;
const REPEAT_FIRST_MS = 380;
const REPEAT_NEXT_MS = 120;

export const isTextField = (el) => !!el && (el.tagName === 'TEXTAREA' || el.isContentEditable
  || (el.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((el.getAttribute('type') || '').toLowerCase())));

// Alle Elemente, die man auswählen kann: echte Bedienelemente plus alles mit Zeiger-Cursor (Karten, Zeilen)
function collectCandidates() {
  // Die Elemente werden am Zeiger-Cursor erkannt, deshalb den versteckten System-Cursor kurz freigeben
  const root = document.documentElement;
  const hiddenCursor = root.classList.contains('tv-nocursor');
  root.classList.remove('tv-nocursor');
  try {
    return collectCandidatesInner();
  } finally {
    if (hiddenCursor) root.classList.add('tv-nocursor');
  }
}

function collectCandidatesInner() {
  const modals = [...document.querySelectorAll(MODAL_SELECTOR)];
  const root = modals.length ? modals[modals.length - 1] : document.body;
  const found = new Set(root.querySelectorAll(NATIVE_SELECTOR));
  const panes = [];
  root.querySelectorAll('*').forEach(el => {
    if (found.has(el) || el.closest('svg') && el.tagName !== 'svg') return;
    const style = getComputedStyle(el);
    if (isScrollable(el, style)) panes.push(el);
    if (style.cursor !== 'pointer') return;
    const parent = el.parentElement;
    if (parent && getComputedStyle(parent).cursor === 'pointer') return;
    found.add(el);
  });

  const result = [];
  found.forEach(el => {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[inert], [hidden]')) return;
    if (el.tagName === 'INPUT' && el.type === 'hidden') return;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    result.push({ el, rect });
  });

  // Lese- und Scrollbereiche ohne eigene Bedienelemente (zum Beispiel ein Anleitungstext) sind ebenfalls wählbar
  panes.forEach(el => {
    if (result.some(item => item.el === el || el.contains(item.el))) return;
    if (el.closest('[inert], [hidden]')) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 60) return;
    result.push({ el, rect });
  });
  return result;
}

function isScrollable(el, style = getComputedStyle(el)) {
  return (style.overflowY === 'auto' || style.overflowY === 'scroll')
    && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 60;
}

function canScroll(el, direction) {
  if (direction === 'up') return el.scrollTop > 0;
  return el.scrollTop + el.clientHeight < el.scrollHeight - 1;
}

function topModal() {
  const modals = [...document.querySelectorAll(MODAL_SELECTOR)];
  return modals.length ? modals[modals.length - 1] : null;
}

// Geht ein Dialog auf, wandert der Fokus hinein, sonst bliebe er auf dem Knopf dahinter. Beim Schließen geht er zurück.
let lastModal = null;
let focusBeforeModal = null;

function trackModal() {
  const modal = topModal();
  if (modal === lastModal) return;
  if (modal) {
    if (!lastModal) focusBeforeModal = currentFocus();
    const items = collectCandidates();
    if (items.length) setTvFocus(items[0].el);
  } else if (focusBeforeModal && document.body.contains(focusBeforeModal)) {
    setTvFocus(focusBeforeModal);
    focusBeforeModal = null;
  }
  lastModal = modal;
}

function currentFocus() {
  return document.querySelector(`[${FOCUS_ATTR}]`) || null;
}

export function setTvFocus(el) {
  const previous = currentFocus();
  if (previous && previous !== el) previous.removeAttribute(FOCUS_ATTR);
  if (!el) return;
  el.setAttribute(FOCUS_ATTR, 'true');
  if (!el.matches(NATIVE_SELECTOR) && el.tabIndex < 0) el.setAttribute('tabindex', '-1');
  if (!isTextField(el)) {
    try { el.focus({ preventScroll: true }); } catch { /* nicht fokussierbar */ }
  }
  el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

// Nächstes Element in einer Richtung: nah in Blickrichtung und möglichst auf einer Linie
export function pickNext(from, candidates, direction) {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  const ay = a.top + a.height / 2;
  let best = null;
  let bestScore = Infinity;

  for (const { el, rect } of candidates) {
    if (el === from || from.contains(el) || el.contains(from)) continue;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = cx - ax;
    const dy = cy - ay;
    let main;
    let cross;
    let gap;
    if (direction === 'right') { main = dx; cross = Math.abs(dy); gap = rect.left - a.right; }
    else if (direction === 'left') { main = -dx; cross = Math.abs(dy); gap = a.left - rect.right; }
    else if (direction === 'down') { main = dy; cross = Math.abs(dx); gap = rect.top - a.bottom; }
    else { main = -dy; cross = Math.abs(dx); gap = a.top - rect.bottom; }
    if (main <= 1) continue;
    // Bei vertikaler Bewegung zählt Überlappung in der Breite, bei horizontaler in der Höhe
    const overlap = direction === 'left' || direction === 'right'
      ? Math.min(a.bottom, rect.bottom) - Math.max(a.top, rect.top)
      : Math.min(a.right, rect.right) - Math.max(a.left, rect.left);
    const score = Math.max(gap, 0) + main * 0.3 + cross * (overlap > 0 ? 1.2 : 3);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

// Ist ein Dropdown offen, gehören die Tasten ihm: Controller-Eingaben gehen als Tastendruck dorthin
function forwardToOpenPopup(key) {
  const active = document.activeElement;
  if (!active || active.getAttribute('aria-expanded') !== 'true') return false;
  active.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return true;
}

const DIRECTION_KEYS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

// Native Auswahlfelder und Slider lassen sich nicht über ein Popup bedienen: Pfeile ändern den Wert direkt
let editingSelect = null;

function setSelectEditing(el) {
  editingSelect?.removeAttribute('data-tv-editing');
  editingSelect = el;
  el?.setAttribute('data-tv-editing', 'true');
}

function changeSelect(el, step) {
  const next = Math.min(el.options.length - 1, Math.max(0, el.selectedIndex + step));
  if (next === el.selectedIndex) return;
  el.selectedIndex = next;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function changeRange(el, direction) {
  const step = Number(el.step) || 1;
  const min = el.min === '' ? 0 : Number(el.min);
  const max = el.max === '' ? 100 : Number(el.max);
  const value = Math.min(max, Math.max(min, Number(el.value) + (direction === 'right' ? step : -step)));
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export function moveFocus(direction, options = {}) {
  if (keyboardHandler && options.device !== 'keyboard') { keyboardHandler.move(direction); return; }
  if (forwardToOpenPopup(DIRECTION_KEYS[direction])) return;
  if (editingSelect && document.body.contains(editingSelect)) {
    if (direction === 'up' || direction === 'down') changeSelect(editingSelect, direction === 'down' ? 1 : -1);
    return;
  }
  const focused = currentFocus();
  if (focused?.tagName === 'INPUT' && focused.type === 'range' && (direction === 'left' || direction === 'right')) {
    changeRange(focused, direction);
    return;
  }
  const candidates = collectCandidates();
  if (!candidates.length) return;
  let from = currentFocus();
  if (!from || !document.body.contains(from) || !candidates.some(c => c.el === from)) {
    const active = document.activeElement;
    from = active && active !== document.body && candidates.some(c => c.el === active) ? active : null;
  }
  if (!from) {
    // Erster Fokus: aktives Sidebar-Element, sonst das erste Element
    const start = candidates.find(item => item.el.matches('.nav-item.active'))?.el || candidates[0].el;
    setTvFocus(start);
    return;
  }
  // Ein gewählter Scrollbereich scrollt zuerst, erst am Ende geht der Fokus weiter
  if ((direction === 'up' || direction === 'down') && !from.matches(NATIVE_SELECTOR) && isScrollable(from) && canScroll(from, direction)) {
    from.scrollBy({ top: (direction === 'down' ? 1 : -1) * Math.max(90, from.clientHeight * 0.18) });
    return;
  }
  const next = pickNext(from, candidates, direction);
  if (next) setTvFocus(next);
  else scrollTowards(from, direction);
}

// Gibt es in dieser Richtung nichts mehr, wird der Bereich unter dem Fokus gescrollt
function scrollTowards(from, direction) {
  const area = scrollParent(from);
  if (!area) return;
  const step = Math.round(area.clientHeight * 0.6);
  if (direction === 'down') area.scrollBy({ top: step, behavior: 'smooth' });
  if (direction === 'up') area.scrollBy({ top: -step, behavior: 'smooth' });
}

function scrollParent(el) {
  if (el && el !== document.body && isScrollable(el)) return el;
  let node = el?.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 2) return node;
    node = node.parentElement;
  }
  return document.querySelector('.content-area');
}

export function activateFocus() {
  if (keyboardHandler) { keyboardHandler.press(); return; }
  if (forwardToOpenPopup('Enter')) return;
  if (editingSelect) { setSelectEditing(null); return; }
  const el = currentFocus() || document.activeElement;
  if (!el || el === document.body) return;
  const modal = topModal();
  if (modal && !modal.contains(el)) { trackModal(); return; }
  if (isTextField(el)) {
    activateTextField(el);
    return;
  }
  if (el.tagName === 'SELECT') {
    // Auswahl-Modus: hoch und runter ändern den Wert, A oder B beendet ihn
    setSelectEditing(editingSelect === el ? null : el);
    return;
  }
  el.click();
}

export function goBack() {
  if (keyboardHandler) { keyboardHandler.close(); return; }
  if (forwardToOpenPopup('Escape')) return;
  if (editingSelect) { setSelectEditing(null); return; }
  const active = document.activeElement;
  if (isTextField(active)) { active.blur(); return; }
  if (getCurrentBackInfo()) { triggerBack(); return; }
  // Offene Dialoge reagieren auf Escape
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
  const overlay = [...document.querySelectorAll(MODAL_SELECTOR)].pop();
  if (overlay) {
    const close = [...overlay.querySelectorAll('button')].find(b => /schlie|abbre|zurück|nein|ok|fertig/i.test(`${b.textContent} ${b.getAttribute('aria-label') || ''} ${b.title || ''}`));
    if (close) close.click();
  }
}

function switchTab(delta) {
  const items = [...document.querySelectorAll('.sidebar .nav-item')];
  if (!items.length) return;
  const index = items.findIndex(item => item.classList.contains('active'));
  const next = items[(index + delta + items.length) % items.length];
  next.click();
  setTvFocus(next);
}

let exitHandler = null;
let f1Down = false;

const KEY_DIRECTIONS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

function handleKeyDown(event) {
  if (!event.isTrusted || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
  reportKeyboard();
  if (event.key === 'F1') {
    // F1 gehalten zeigt die Tastenhinweise
    event.preventDefault();
    f1Down = true;
    return;
  }
  if (event.key === 'Escape' && isMapMode()) {
    event.preventDefault();
    // Erst die Ego-Ansicht/den Vollbild der Karte beenden, dann erst den Karten-Modus
    if (!exitImmersive()) exitMapMode();
    return;
  }
  const target = document.activeElement;
  // Offene Dropdowns und Menüs verarbeiten ihre Tasten selbst
  if (target?.getAttribute('aria-expanded') === 'true') return;
  const typing = isTextField(target);
  const direction = KEY_DIRECTIONS[event.key];

  if (direction) {
    // In Textfeldern bleiben links/rechts für den Cursor, hoch/runter verlässt das Feld
    if (typing && (direction === 'left' || direction === 'right')) return;
    if (target?.tagName === 'SELECT' && (direction === 'up' || direction === 'down')) return;
    if (target?.type === 'range' && (direction === 'left' || direction === 'right')) return;
    event.preventDefault();
    event.stopPropagation();
    moveFocus(direction, { device: 'keyboard' });
    return;
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    if (typing) { target.blur(); return; }
    // Erst Dialoge und Unteransichten schließen, ohne etwas Offenes beendet Esc den TV-Modus
    if (document.querySelector(MODAL_SELECTOR)) { goBack(); return; }
    if (getCurrentBackInfo()) { triggerBack(); return; }
    exitHandler?.();
    return;
  }
  if ((event.key === 'Enter' || event.key === ' ') && !typing) {
    const el = currentFocus();
    if (el && event.key === 'Enter' && isTextField(el)) {
      event.preventDefault();
      activateTextField(el);
      return;
    }
    // Native Knöpfe lösen Enter und Leertaste selbst aus, alles andere klicken wir
    if (el && !el.matches('button, a[href], input, select, textarea, summary')) {
      event.preventDefault();
      el.click();
    }
  }
  if (event.key === 'PageDown') { event.preventDefault(); switchTab(1); }
  if (event.key === 'PageUp') { event.preventDefault(); switchTab(-1); }
}

// ── Virtuelle Maus (rechter Stick bewegt, rechter Trigger klickt) ──────────────
const CURSOR_SPEED = 1100; // Pixel pro Sekunde bei vollem Ausschlag
const CURSOR_DEADZONE = 0.16;
const CURSOR_IDLE_MS = 4000;

const cursor = { x: 0, y: 0, leadX: 0, leadY: 0, down: false, button: null, ownSendAt: 0, warpAt: 0, warpPending: false, lastMove: 0, placed: false, pinned: false, mouseDown: false };

function cursorElement() {
  return document.getElementById('tv-cursor');
}

function drawCursor() {
  const el = cursorElement();
  if (!el) return;
  el.style.transform = `translate(${cursor.x + cursor.leadX}px, ${cursor.y + cursor.leadY}px)`;
  el.classList.toggle('tv-cursor-down', cursor.down || cursor.mouseDown);
  // Mit der echten Maus bleibt der Zeiger immer sichtbar, mit dem Controller blendet er nach kurzer Ruhe aus
  el.classList.toggle('tv-cursor-visible', cursor.pinned || performance.now() - cursor.lastMove < CURSOR_IDLE_MS);
}

// Echte Mausereignisse über Electron, damit Hover, Klick und Ziehen (Slider) wie bei einer Maus funktionieren.
// Ohne Electron (Vorschau im Browser) werden die Ereignisse nachgebaut.
let tvZoom = 1;
export function setTvZoom(factor) {
  tvZoom = Number(factor) > 0 ? Number(factor) : 1;
}

// Das Mausereignis, das der Sprung des Betriebssystem-Zeigers selbst auslöst: kurz nach dem Sprung und an dessen Zielpunkt
function isWarpEcho(x, y) {
  return performance.now() - cursor.warpAt < 700 && Math.hypot(x - cursor.x, y - cursor.y) < 4;
}

// ── Mauszeiger ────────────────────────────────────────────────────────────────────────────────
// Im TV-Modus ist der System-Cursor versteckt (Klasse tv-nocursor, in der Karte per Stil-Regel). Es zeigt nur der virtuelle Zeiger.
const GUEST_CSS = 'html, html * { cursor: none !important; }';

function applyGuestCursor(view) {
  try {
    view.insertCSS(GUEST_CSS).then(key => { view.__tvCssKey = key; }).catch(() => {});
  } catch { /* noch nicht bereit, dom-ready wiederholt es */ }
}

// Die eingebettete Karte (webview) ist ein eigener Prozess: sie bekommt die Mausereignisse direkt.
// Die Koordinaten gelten dort im Seiten-Zoom, deshalb mit dem Zoom multiplizieren.
let dragWebview = null;

// Im Vollbild der Karte (BlueMap) füllt sie das ganze Fenster, auch wenn ihr Platz in der Seite kleiner ist
function viewRect(view) {
  return view.__tvFs ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } : view.getBoundingClientRect();
}

function webviewAt(x, y) {
  if (map.view?.__tvFs) return map.view;
  const el = document.elementFromPoint(x, y);
  return el?.tagName === 'WEBVIEW' ? el : null;
}

function sendToWebview(view, type, extra = {}) {
  cursor.ownSendAt = performance.now();
  const { at, ...rest } = extra;
  const pos = at || cursor;
  const rect = viewRect(view);
  try {
    // Position als Anteil im Karten-Rahmen, dann auf die Größe der Karten-Seite und den gemessenen Faktor umgerechnet.
    // Vor der ersten Messung gilt ersatzweise der Seiten-Zoom.
    const scale = view.__tvScale || tvZoom;
    const toX = view.__tvW ? (pos.x - rect.left) / rect.width * view.__tvW : pos.x - rect.left;
    const toY = view.__tvH ? (pos.y - rect.top) / rect.height * view.__tvH : pos.y - rect.top;
    view.sendInputEvent({
      type,
      x: Math.round(toX * scale),
      y: Math.round(toY * scale),
      button: 'left',
      clickCount: type === 'mouseMove' ? 0 : 1,
      ...rest
    });
  } catch { /* webview noch nicht bereit */ }
}

function sendMouse(type) {
  cursor.ownSendAt = performance.now();
  const view = type === 'mouseDown' ? webviewAt(cursor.x, cursor.y) : (dragWebview || webviewAt(cursor.x, cursor.y));
  if (view) {
    if (type === 'mouseDown') {
      dragWebview = view;
      // Ein Klick in die Karte schaltet die Steuerung auf die Karte um
      enterMapMode(view);
    }
    const button = cursor.button || 'left';
    if (type !== 'mouseMove') sendToWebview(view, 'mouseMove', cursor.down ? { modifiers: [`${button}ButtonDown`] } : {});
    sendToWebview(view, type, { button, ...(type === 'mouseMove' && cursor.down ? { modifiers: [`${button}ButtonDown`] } : {}) });
    if (type === 'mouseUp') dragWebview = null;
    return;
  }
  if (window.electronAPI?.tvMouse) {
    window.electronAPI.tvMouse({ type, x: cursor.x, y: cursor.y, down: cursor.down });
    return;
  }
  const target = document.elementFromPoint(cursor.x, cursor.y);
  if (!target) return;
  const init = { bubbles: true, cancelable: true, clientX: cursor.x, clientY: cursor.y, button: 0, view: window };
  if (type === 'mouseMove') target.dispatchEvent(new MouseEvent('mousemove', init));
  if (type === 'mouseDown') target.dispatchEvent(new MouseEvent('mousedown', init));
  if (type === 'mouseUp') {
    target.dispatchEvent(new MouseEvent('mouseup', init));
    if (isTextField(target)) target.focus(); else target.click();
  }
}

function moveCursor(dx, dy, dt) {
  if (!cursor.placed) {
    cursor.x = window.innerWidth / 2;
    cursor.y = window.innerHeight / 2;
    cursor.placed = true;
  }
  cursor.x = Math.min(window.innerWidth - 1, Math.max(0, cursor.x + dx * CURSOR_SPEED * dt));
  cursor.y = Math.min(window.innerHeight - 1, Math.max(0, cursor.y + dy * CURSOR_SPEED * dt));
  cursor.lastMove = performance.now();
  cursor.pinned = false;
  cursor.leadX = 0;
  cursor.leadY = 0;
  cursor.warpPending = true;
  sendMouse('mouseMove');
}

// Stick-Ausschlag mit Totzone und weicher Kurve: kleine Ausschläge für genaues Zielen, große für Tempo
function stickValue(value) {
  const magnitude = Math.abs(value);
  if (magnitude < CURSOR_DEADZONE) return 0;
  const scaled = (magnitude - CURSOR_DEADZONE) / (1 - CURSOR_DEADZONE);
  return Math.sign(value) * scaled * scaled;
}

// ── Eingebettete Karte (webview): System-Cursor verstecken und die echte Maus melden ──────────
// Die Karte ist eine fremde Seite mit eigenem Cursor. Per insertCSS wird er versteckt, und ein kleines Skript meldet
// Mausbewegungen über die Konsole zurück, damit der virtuelle Zeiger der echten Maus auch über der Karte folgt.
const GUEST_SCRIPT = `(() => {
  if (window.__tvHooked) return;
  window.__tvHooked = true;
  let pending = false, x = 0, y = 0;
  addEventListener('mousemove', (e) => {
    x = e.clientX; y = e.clientY;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; console.log('__tvmouse ' + x + ' ' + y + ' ' + innerWidth + ' ' + innerHeight); });
  }, true);
  // Zustand der Karte: Pointer-Lock und Vollbild (BlueMap-Ego-Modus)
  document.addEventListener('pointerlockchange', () => console.log('__tvstate lock ' + (document.pointerLockElement ? 1 : 0)));
  document.addEventListener('fullscreenchange', () => console.log('__tvstate fs ' + (document.fullscreenElement ? 1 : 0)));
  // Hat die Karte den Fokus, bekommt die App selbst keine Controller-Daten. Dann meldet die Karte sie weiter.
  let lastState = '', lastSent = 0;
  const poll = (now) => {
    const pad = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(p => p && p.connected);
    if (pad && document.hasFocus()) {
      const state = pad.axes.map(a => a.toFixed(2)).join(',') + '|' + pad.buttons.map(b => (b.pressed ? '1' : '0')).join('');
      if (state !== lastState || now - lastSent > 120) { lastState = state; lastSent = now; console.log('__tvpad ' + state); }
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})()`;

// Die Karte rechnet die gesendeten Koordinaten je nach Anzeige-Skalierung und Zoom um. Deshalb wird der Faktor gemessen:
// Eine Probe-Mausbewegung an einer bekannten Stelle, die Karte meldet zurück, wo sie angekommen ist.
const PROBE = 200;

function calibrateWebview(view) {
  if (view.__tvProbing) return;
  view.__tvProbing = true;
  try {
    view.sendInputEvent({ type: 'mouseMove', x: PROBE, y: PROBE });
  } catch {
    view.__tvProbing = false;
  }
  setTimeout(() => { view.__tvProbing = false; }, 1500);
}

function onGuestConsole(event) {
  const message = String(event.message);
  const view = event.target;
  if (message.startsWith('__tvstate ')) {
    const [, what, value] = message.split(' ');
    if (what === 'lock') view.__tvLocked = value === '1';
    if (what === 'fs') view.__tvFs = value === '1';
    // Beim Verlassen der Ego-Ansicht keine Kamera-Taste hängen lassen
    if (!view.__tvLocked && !view.__tvFs) stopLook();
    return;
  }
  if (message.startsWith('__tvpad ')) {
    const [axesText, bits = ''] = message.slice(8).split('|');
    view.__tvPad = {
      at: performance.now(),
      axes: axesText.split(',').map(Number),
      buttons: [...bits].map(bit => ({ pressed: bit === '1', value: bit === '1' ? 1 : 0 }))
    };
    return;
  }
  if (!message.startsWith('__tvmouse ')) return;
  const [, gx, gy, gw, gh] = event.message.split(' ');
  if (Number(gw) > 0 && Number(gh) > 0) {
    event.target.__tvW = Number(gw);
    event.target.__tvH = Number(gh);
  }
  if (event.target.__tvProbing) {
    const measured = PROBE / Number(gx);
    if (Number(gx) > 20 && measured > 0.4 && measured < 4) event.target.__tvScale = measured;
    event.target.__tvProbing = false;
    return;
  }
  const rect = viewRect(event.target);
  const x = rect.left + (Number(gw) > 0 ? Number(gx) / Number(gw) * rect.width : Number(gx));
  const y = rect.top + (Number(gh) > 0 ? Number(gy) / Number(gh) * rect.height : Number(gy));
  // Eigene Bewegungen des virtuellen Zeigers kommen hier mit Verzögerung ebenfalls an. Würden sie übernommen,
  // zögen sie den Zeiger auf eine ältere Position zurück
  if (performance.now() - cursor.ownSendAt < 400) return;
  if (isWarpEcho(x, y)) return;
  cursor.warpPending = false;
  if (cursor.placed && Math.abs(x - cursor.x) < 2 && Math.abs(y - cursor.y) < 2) return;
  cursor.x = x;
  cursor.y = y;
  cursor.placed = true;
  cursor.pinned = true;
  cursor.lastMove = performance.now();
  drawCursor();
}

function prepareWebview(view) {
  const apply = () => {
    try {
      applyGuestCursor(view);
      view.executeJavaScript(GUEST_SCRIPT).catch(() => {});
    } catch { /* noch nicht geladen, dom-ready wiederholt es */ }
  };
  if (!view.__tvPrepared) {
    view.__tvPrepared = true;
    view.addEventListener('dom-ready', () => { apply(); setTimeout(() => calibrateWebview(view), 400); });
    view.addEventListener('console-message', onGuestConsole);
  }
  apply();
  if (!view.__tvScale) setTimeout(() => calibrateWebview(view), 400);
}

function releaseWebview(view) {
  view.removeEventListener('console-message', onGuestConsole);
  view.__tvPrepared = false;
  try { if (view.__tvCssKey) view.removeInsertedCSS(view.__tvCssKey); } catch { /* egal */ }
}

function watchWebviews() {
  document.querySelectorAll('webview').forEach(prepareWebview);
  const observer = new MutationObserver(mutations => mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
    if (node.tagName === 'WEBVIEW') prepareWebview(node);
    else node.querySelectorAll?.('webview').forEach(prepareWebview);
  })));
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    document.querySelectorAll('webview').forEach(releaseWebview);
  };
}

// ── Karten-Modus: nach einem Klick in die Karte steuert der Controller die Karte ──────────────
// Linker Stick = W A S D, LB/RB = runter/hoch scrollen, RT = Linksklick, LT = Rechtsklick, A = Leertaste.
// Start, Select oder Esc führen zurück zur normalen Launcher-Steuerung.
const map = { view: null, keys: new Set(), buttons: { left: false, right: false }, lastScroll: 0, carry: false };

export const isMapMode = () => !!map.view;

function enterMapMode(view) {
  if (map.view === view) return;
  map.view = view;
  // Der Klick, der die Karte aktiviert hat (rechter Trigger), wird noch bis zum Loslassen zu Ende geführt
  map.carry = cursor.down;
  if (!view.__tvScale) calibrateWebview(view);
  view.setAttribute('data-tv-map-active', 'true');
  setPromptMode('map');
}

function mapKey(code, down) {
  if (!map.view || down === map.keys.has(code)) return;
  if (down) map.keys.add(code); else map.keys.delete(code);
  // 'Alt+Up' steht für eine Taste mit Alt-Modifikator
  const [first, second] = code.split('+');
  const keyCode = second || first;
  const modifiers = second ? [first.toLowerCase()] : [];
  try { map.view.sendInputEvent({ type: down ? 'keyDown' : 'keyUp', keyCode, modifiers }); } catch { /* webview nicht bereit */ }
}

function mapButton(name, down) {
  if (down === map.buttons[name]) return;
  if (down) {
    // Ein Klick neben die Karte beendet den Karten-Modus
    if (!webviewAt(cursor.x, cursor.y)) { exitMapMode(); return; }
    if (cursor.down || look.active) return;
    map.buttons[name] = true;
    cursor.button = name;
    cursor.down = true;
    cursor.lastMove = performance.now();
    sendMouse('mouseDown');
  } else {
    map.buttons[name] = false;
    if (cursor.button === name) {
      cursor.down = false;
      cursor.lastMove = performance.now();
      sendMouse('mouseUp');
      cursor.button = null;
    }
  }
}

// Ego-Ansicht der Karte (Pointer-Lock oder Vollbild) beenden. Gibt true zurück, wenn etwas zu beenden war.
function exitImmersive() {
  const view = map.view;
  if (!view || !(view.__tvLocked || view.__tvFs)) return false;
  try {
    view.executeJavaScript('(document.fullscreenElement && document.exitFullscreen && document.exitFullscreen()); (document.exitPointerLock && document.exitPointerLock());').catch(() => {});
  } catch { /* webview nicht bereit */ }
  return true;
}

// Controller-Daten: normalerweise aus der App, hat die Karte gerade den Fokus, aus ihrer Meldung
let lastPadId = '';
function getActivePad() {
  const guest = map.view?.__tvPad;
  if (guest && performance.now() - guest.at < 300) return { connected: true, id: lastPadId, axes: guest.axes, buttons: guest.buttons };
  const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
  if (pad) lastPadId = pad.id;
  return pad || null;
}

// ── Umschauen in der Ego-Ansicht: der rechte Stick hält die rechte Maustaste und bewegt die Maus ──────────
// Unter Pointer-Lock liefert ein künstliches Mausereignis keine Bewegungswerte, deshalb wird der Lock beendet und wie mit
// einer echten Maus gezogen: BlueMap dreht die Kamera, solange die rechte Taste gedrückt ist und die Maus sich bewegt.
const LOOK_SPEED = 650; // Pixel pro Sekunde bei vollem Ausschlag
const LOOK_MARGIN = 60;
const look = { active: false, x: 0, y: 0, startX: 0, startY: 0, exiting: false };

function lookCenter() {
  look.x = window.innerWidth / 2;
  look.y = window.innerHeight / 2;
  look.startX = look.x;
  look.startY = look.y;
}

function lookPress(view) {
  lookCenter();
  sendToWebview(view, 'mouseMove', { at: look });
  sendToWebview(view, 'mouseDown', { button: 'right', at: look });
}

export function stopLook() {
  if (!look.active) return;
  look.active = false;
  const view = map.view;
  if (!view) return;
  // Ein kurzer Klick (unter 5 Pixel) würde in BlueMap den Vollbild und Lock wieder auslösen, also vorher ein Stück bewegen
  if (Math.abs(look.x - look.startX) + Math.abs(look.y - look.startY) < 12) {
    look.x += 14;
    sendToWebview(view, 'mouseMove', { button: 'right', modifiers: ['rightButtonDown'], at: look });
  }
  sendToWebview(view, 'mouseUp', { button: 'right', at: look });
}

function lookTick(dx, dy, dt) {
  const view = map.view;
  if (!dx && !dy) { stopLook(); return; }
  if (view.__tvLocked) {
    if (!look.exiting) {
      look.exiting = true;
      try { view.executeJavaScript('document.exitPointerLock && document.exitPointerLock()').catch(() => {}); } catch { /* egal */ }
      setTimeout(() => { look.exiting = false; }, 500);
    }
    return;
  }
  if (!look.active) {
    look.active = true;
    lookPress(view);
  }
  const nx = look.x + dx * LOOK_SPEED * dt;
  const ny = look.y + dy * LOOK_SPEED * dt;
  if (nx < LOOK_MARGIN || nx > window.innerWidth - LOOK_MARGIN || ny < LOOK_MARGIN || ny > window.innerHeight - LOOK_MARGIN) {
    // Am Rand neu ansetzen: loslassen, in die Mitte, wieder drücken
    sendToWebview(view, 'mouseUp', { button: 'right', at: look });
    lookPress(view);
    return;
  }
  look.x = nx;
  look.y = ny;
  sendToWebview(view, 'mouseMove', { button: 'right', modifiers: ['rightButtonDown'], at: look });
}

export function exitMapMode() {
  if (!map.view) return;
  stopLook();
  [...map.keys].forEach(code => mapKey(code, false));
  if (cursor.down) {
    cursor.down = false;
    sendMouse('mouseUp');
  }
  map.buttons.left = false;
  map.buttons.right = false;
  map.carry = false;
  map.view.removeAttribute('data-tv-map-active');
  map.view = null;
  dragWebview = null;
  cursor.button = null;
  setPromptMode('launcher');
}

function mapPadTick(pad) {
  const b = (i) => !!pad.buttons[i]?.pressed || (pad.buttons[i]?.value || 0) > 0.5;
  const [lx = 0, ly = 0] = pad.axes;
  mapKey('W', ly < -0.4);
  mapKey('S', ly > 0.4);
  mapKey('A', lx < -0.4);
  mapKey('D', lx > 0.4);
  mapKey('Space', b(0));
  // B = Shift: in BlueMap nach unten fliegen
  mapKey('Shift', b(1));
  // LB scrollt runter, RB rauf (Mausrad, solange gehalten)
  const now = performance.now();
  if ((b(4) || b(5)) && now - map.lastScroll > 40) {
    map.lastScroll = now;
    const down = b(4);
    sendToWebview(map.view, 'mouseMove');
    sendToWebview(map.view, 'mouseWheel', { deltaX: 0, deltaY: down ? -40 : 40, wheelTicksX: 0, wheelTicksY: down ? -1 : 1, canScroll: true });
  }
  mapButton('right', b(6));
  if (map.carry) {
    if (!b(7) && !b(11)) {
      map.carry = false;
      cursor.down = false;
      cursor.lastMove = performance.now();
      sendMouse('mouseUp');
      cursor.button = null;
    }
  } else {
    mapButton('left', b(7) || b(11));
  }
}

// Gamepad: Standard-Belegung (0=A, 1=B, 4=LB, 5=RB, 6=LT, 7=RT, 12-15 Steuerkreuz)
function startGamepadLoop() {
  let frame = 0;
  let last = performance.now();
  const held = new Map(); // Taste -> { since, last }

  const press = (key, active, action, repeat = false) => {
    const now = performance.now();
    const state = held.get(key);
    if (!active) { held.delete(key); return; }
    if (!state) { held.set(key, { since: now, last: now }); action(); return; }
    if (repeat && now - state.since > REPEAT_FIRST_MS && now - state.last > REPEAT_NEXT_MS) {
      state.last = now;
      action();
    }
  };

  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // Ein Klick in die eingebettete Karte gibt ihr den Fokus, dann bekäme die App keine Controller-Eingaben mehr.
    // Deshalb geht der Fokus zurück, außer die Karte ist in der Ego-Ansicht (Pointer-Lock braucht ihren Fokus).
    const immersive = !!map.view && (map.view.__tvLocked || map.view.__tvFs);
    if (immersive) {
      if (document.activeElement !== map.view) { try { map.view.focus(); } catch { /* egal */ } }
    } else if (!cursor.down && ['IFRAME', 'WEBVIEW'].includes(document.activeElement?.tagName)) {
      document.activeElement.blur();
      window.focus();
    }
    if (map.view && !document.body.contains(map.view)) exitMapMode();
    trackModal();
    // Der Zeiger des Betriebssystems folgt dem virtuellen, sobald der Stick einen Moment ruht
    if (cursor.warpPending && performance.now() - cursor.lastMove > 180) {
      cursor.warpPending = false;
      cursor.warpAt = performance.now();
      window.electronAPI?.tvWarpCursor?.({ x: cursor.x, y: cursor.y });
    }
    const pad = getActivePad();
    if (pad && map.view) {
      const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
      if (pad.buttons.some(button => button.pressed) || Math.hypot(lx, ly) > 0.5 || Math.hypot(rx, ry) > 0.5) reportGamepad(pad);
      mapPadTick(pad);
      if (map.view.__tvLocked || map.view.__tvFs) {
        // Ego-Ansicht und Vollbild: der rechte Stick hält die rechte Maustaste und bewegt die Maus (Umschauen)
        lookTick(stickValue(rx), stickValue(ry), dt);
      } else {
        // Der rechte Stick bewegt sonst den Zeiger
        stopLook();
        const mdx = stickValue(rx);
        const mdy = stickValue(ry);
        if (mdx || mdy) moveCursor(mdx, mdy, dt);
      }
    } else if (pad) {
      const b = (i) => !!pad.buttons[i]?.pressed;
      const [lx = 0, ly = 0, rx = 0, ry = 0] = pad.axes;
      // Sobald am Controller etwas passiert, zeigt die Hinweisleiste seine Tasten
      if (pad.buttons.some(button => button.pressed) || Math.hypot(lx, ly) > 0.5 || Math.hypot(rx, ry) > 0.5) reportGamepad(pad);
      press('up', b(12) || ly < -STICK_THRESHOLD, () => moveFocus('up'), true);
      press('down', b(13) || ly > STICK_THRESHOLD, () => moveFocus('down'), true);
      press('left', b(14) || lx < -STICK_THRESHOLD, () => moveFocus('left'), true);
      press('right', b(15) || lx > STICK_THRESHOLD, () => moveFocus('right'), true);
      press('a', b(0), activateFocus);
      press('b', b(1), goBack);
      press('lb', b(4), () => (keyboardHandler ? keyboardHandler.button('caretLeft') : switchTab(-1)), !!keyboardHandler);
      press('rb', b(5), () => (keyboardHandler ? keyboardHandler.button('caretRight') : switchTab(1)), !!keyboardHandler);
      if (keyboardHandler) {
        press('x', b(2), () => keyboardHandler.button('backspace'), true);
        press('y', b(3), () => keyboardHandler.button('space'), true);
      }

      // Linker Trigger gedrückt: der rechte Stick scrollt, sonst bewegt er die Maus
      const scrolling = b(6);
      if (scrolling) {
        const under = document.elementFromPoint(cursor.x, cursor.y);
        if (Math.abs(ry) > 0.2) {
          if (under?.tagName === 'WEBVIEW') {
            // Über der eingebetteten Karte wird gezoomt: Mausrad an die Karte schicken
            sendToWebview(under, 'mouseMove');
            sendToWebview(under, 'mouseWheel', { deltaX: 0, deltaY: -ry * 40, wheelTicksX: 0, wheelTicksY: -Math.sign(ry), canScroll: true });
          } else {
            const area = scrollParent(under || currentFocus() || document.activeElement);
            if (area) area.scrollBy({ top: ry * 24 });
          }
        }
      } else {
        const dx = stickValue(rx);
        const dy = stickValue(ry);
        if (dx || dy) moveCursor(dx, dy, dt);
      }

      // Rechter Trigger: Maustaste halten und loslassen (so lässt sich auch ziehen)
      // Rechter Trigger oder Druck auf den rechten Stick (R3)
      const triggerDown = b(7) || (pad.buttons[7]?.value || 0) > 0.5 || b(11);
      if (triggerDown && !cursor.down) {
        cursor.down = true;
        cursor.button = 'left';
        if (!cursor.placed) moveCursor(0, 0, 0);
        cursor.lastMove = performance.now();
        sendMouse('mouseDown');
      } else if (!triggerDown && cursor.down) {
        cursor.down = false;
        cursor.lastMove = performance.now();
        sendMouse('mouseUp');
        cursor.button = null;
      }
    }
    drawCursor();
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

// Start oder Select am Controller schaltet den TV-Modus um, solange der Launcher im Vordergrund ist
// Hinweise kurz einblenden, zum Beispiel beim Start des TV-Modus
let hintsPinnedUntil = 0;
export function pinHints(ms) {
  hintsPinnedUntil = performance.now() + ms;
}

export function startTvToggleWatcher(onToggle) {
  let frame = 0;
  let wasAny = false;
  let wasToggle = false;
  const tick = () => {
    const pad = getActivePad();
    const select = !!pad?.buttons[8]?.pressed;
    const start = !!pad?.buttons[9]?.pressed;
    const tvOn = document.documentElement.classList.contains('tv-mode');
    // Select gehalten zeigt im TV-Modus die Tastenhinweise. Start schaltet den TV-Modus um, Select startet ihn nur, solange er aus ist.
    setHintsVisible(tvOn && ((select && !keyboardHandler) || performance.now() < hintsPinnedUntil || f1Down));
    const any = select || start;
    const toggle = start || (select && !tvOn);
    if (keyboardHandler) {
      // Bei offener Bildschirmtastatur: Start = Fertig, Select = Schließen
      if (any && !wasAny) keyboardHandler.button(start ? 'enter' : 'close');
    } else if (toggle && !wasToggle && (document.hasFocus() || isMapMode())) {
      // In der Karte beendet Start erst die Ego-Ansicht, dann den Karten-Modus, sonst schaltet es den TV-Modus um
      if (isMapMode()) { if (!exitImmersive()) exitMapMode(); } else onToggle();
    }
    wasAny = any;
    wasToggle = toggle;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

export function startTvNavigation({ onExit } = {}) {
  exitHandler = onExit || null;
  lastModal = null;
  focusBeforeModal = null;
  document.addEventListener('keydown', handleKeyDown, true);
  const onKeyUp = (event) => { if (event.key === 'F1') f1Down = false; };
  document.addEventListener('keyup', onKeyUp, true);

  const stopGamepad = startGamepadLoop();
  // Mausklicks übernehmen den Fokus, damit Controller und Maus nicht gegeneinander arbeiten
  const onPointer = (event) => {
    const previous = currentFocus();
    if (previous && !previous.contains(event.target)) previous.removeAttribute(FOCUS_ATTR);
  };
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('mousedown', markActivation, true);

  // Echte Maus: der virtuelle Zeiger folgt ihr, der System-Cursor ist im TV-Modus versteckt
  document.documentElement.classList.add('tv-nocursor');
  window.electronAPI?.tvWarpPrepare?.();
  // Der Zeiger wird sofort im Mausereignis gezeichnet, nicht erst im nächsten Frame der Controller-Schleife.
  // Roh-Ereignisse und mousemove kommen beide an: ein älteres Ereignis darf den Zeiger nie zurücksetzen.
  let lastMouseAt = 0;
  const onMouseMove = (event) => {
    if (!event.isTrusted) return;
    // Eigene Bewegungen des virtuellen Zeigers kommen ebenfalls an und liegen auf derselben Position
    if (performance.now() - cursor.ownSendAt < 150) return;
    // Der Sprung des Betriebssystem-Zeigers an die Stelle des virtuellen löst selbst ein Mausereignis aus. Nur dieses Echo
    // (an der Stelle des Zeigers) wird ignoriert, jede echte Mausbewegung wirkt sofort.
    if (isWarpEcho(event.clientX, event.clientY)) return;
    cursor.warpPending = false;
    const at = event.timeStamp || performance.now();
    if (at < lastMouseAt) return;
    lastMouseAt = at;
    cursor.leadX = 0;
    cursor.leadY = 0;
    cursor.x = event.clientX;
    cursor.y = event.clientY;
    cursor.placed = true;
    cursor.pinned = true;
    cursor.lastMove = performance.now();
    // Sofort im Mausereignis zeichnen, nicht erst im nächsten Frame der Schleife
    drawCursor();
  };
  const onMouseButton = (event) => {
    if (event.isTrusted && !cursor.down) cursor.mouseDown = event.type === 'mousedown';
    drawCursor();
  };
  const stopWebviewWatch = watchWebviews();
  document.addEventListener('mousemove', onMouseMove, true);
  // Roh-Ereignisse kommen früher als mousemove (das auf den Frame gebündelt wird)
  document.addEventListener('pointerrawupdate', onMouseMove, true);
  document.addEventListener('mousedown', onMouseButton, true);
  document.addEventListener('mouseup', onMouseButton, true);

  // Gleich zu Beginn etwas fokussieren, damit man sofort steuern kann
  requestAnimationFrame(() => {
    if (!currentFocus()) {
      const start = document.querySelector('.nav-item.active');
      if (start) setTvFocus(start);
    }
  });

  return () => {
    exitHandler = null;
    exitMapMode();
    stopWebviewWatch();
    setSelectEditing(null);
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('keyup', onKeyUp, true);
    f1Down = false;
    setHintsVisible(false);
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('mousedown', markActivation, true);
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('pointerrawupdate', onMouseMove, true);
    document.removeEventListener('mousedown', onMouseButton, true);
    document.removeEventListener('mouseup', onMouseButton, true);
    document.documentElement.classList.remove('tv-nocursor');
    stopGamepad();
    currentFocus()?.removeAttribute(FOCUS_ATTR);
  };
}
