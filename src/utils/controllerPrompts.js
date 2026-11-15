// Erkennt, womit gerade gesteuert wird (Xbox, PlayStation, Switch, Steam Deck oder Tastatur),
// und liefert die passenden Tasten-Symbole für die Hinweisleiste.
import { useSyncExternalStore } from 'react';

const files = import.meta.glob('../assets/prompts/*.svg', { eager: true, query: '?url', import: 'default' });
const urls = {};
Object.entries(files).forEach(([path, url]) => {
  urls[path.split('/').pop().replace(/\.svg$/, '')] = url;
});

let state = { device: 'keyboard', platform: 'xbox', mode: 'launcher', hints: false };
const listeners = new Set();

function update(next) {
  if (next.device === state.device && next.platform === state.platform && next.mode === state.mode && next.hints === state.hints) return;
  state = next;
  listeners.forEach(listener => listener());
}

// Controller-Familie aus der Gamepad-Kennung: Sony 054c, Nintendo 057e, Valve 28de, sonst Xbox
export function detectPlatform(id = '') {
  const text = String(id).toLowerCase();
  if (/054c|playstation|dualshock|dualsense|sony|wireless controller/.test(text)) return 'ps';
  if (/057e|nintendo|switch|joy-?con|pro controller/.test(text)) return 'switch';
  if (/28de|valve|steam/.test(text)) return 'steamdeck';
  return 'xbox';
}

export function reportKeyboard() {
  update({ ...state, device: 'keyboard' });
}

export function reportGamepad(pad) {
  update({ ...state, device: 'pad', platform: detectPlatform(pad?.id) });
}

// Die Tastenhinweise erscheinen nur, solange Select gehalten wird (oder kurz beim Start), damit sie die Seite nicht verdecken
export function setHintsVisible(visible) {
  update({ ...state, hints: !!visible });
}

// 'launcher' = normale Steuerung, 'map' = Steuerung der eingebetteten Karte
export function setPromptMode(mode) {
  update({ ...state, mode });
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => state;
export const usePromptState = () => useSyncExternalStore(subscribe, getSnapshot);

// Symbol-Dateien je Controller-Familie. Steam Deck nutzt für die Gesichtstasten das Xbox-Layout.
const PAD_GLYPHS = {
  xbox: { x: 'xbox_x_color', y: 'xbox_y_color', confirm: 'xbox_a_color', back: 'xbox_b_color', prev: 'xbox_lb', next: 'xbox_rb', click: 'xbox_rt', scrollTrigger: 'xbox_lt', menu: 'xbox_menu' },
  steamdeck: { x: 'xbox_x_color', y: 'xbox_y_color', confirm: 'xbox_a_color', back: 'xbox_b_color', prev: 'steamdeck_l1', next: 'steamdeck_r1', click: 'steamdeck_r2', scrollTrigger: 'steamdeck_l2', menu: 'steamdeck_menu' },
  // Die Dateien ps5_l1/r1 und ps5_l2/r2 sind in der Quelle vertauscht benannt
  ps: { x: 'ps5_square_color', y: 'ps5_triangle_color', confirm: 'ps5_cross_color', back: 'ps5_circle_color', prev: 'ps5_l2', next: 'ps5_r2', click: 'ps5_r1', scrollTrigger: 'ps5_l1', menu: 'ps5_options' },
  // Nintendo-Layout: A liegt rechts (east), B unten (south)
  switch: { x: 'switch_north', y: 'switch_west', confirm: 'switch_east', back: 'switch_south', prev: 'switch_l', next: 'switch_r', click: 'switch_zr', scrollTrigger: 'switch_zl', menu: 'switch_plus' }
};

const isDarkTheme = () => document.documentElement.getAttribute('data-theme') === 'dark';

function glyph(name) {
  const variant = isDarkTheme() ? 'dark' : 'light';
  return urls[`${name}_${variant}`] || urls[`${name}_light`] || urls[`${name}_dark`] || urls[name] || null;
}

// Liste der Hinweise für die aktuelle Eingabe: Symbole plus Beschriftung
export function getHints({ device, platform, mode }) {
  if (mode === 'map') {
    const pad = PAD_GLYPHS[platform] || PAD_GLYPHS.xbox;
    if (device === 'keyboard') return [{ icons: [glyph('escape')], label: 'Karte verlassen' }];
    return [
      { icons: [glyph('leftstick')], label: 'Bewegen (WASD)' },
      { icons: [glyph('rightstick')], label: 'Zeiger' },
      { icons: [glyph(pad.prev)], label: 'Runter' },
      { icons: [glyph(pad.next)], label: 'Hoch' },
      { icons: [glyph(pad.click)], label: 'Linksklick' },
      { icons: [glyph(pad.scrollTrigger)], label: 'Rechtsklick' },
      { icons: [glyph(pad.confirm)], label: 'Leertaste' },
      { icons: [glyph(pad.back)], label: 'Shift' },
      { icons: [glyph(pad.menu)], label: 'Karte verlassen' }
    ];
  }
  if (device === 'keyboard') {
    return [
      { icons: ['arrow_up', 'arrow_down', 'arrow_left', 'arrow_right'].map(glyph), label: 'Bewegen' },
      { icons: [glyph('return')], label: 'Auswählen' },
      { icons: [glyph('escape')], label: 'Zurück / Beenden' },
      { icons: [glyph('page_up'), glyph('page_down')], label: 'Reiter' }
    ];
  }
  const set = PAD_GLYPHS[platform] || PAD_GLYPHS.xbox;
  return [
    { icons: [glyph('dpad')], label: 'Bewegen' },
    { icons: [glyph(set.confirm)], label: 'Auswählen' },
    { icons: [glyph(set.back)], label: 'Zurück' },
    { icons: [glyph(set.prev), glyph(set.next)], label: 'Reiter' },
    { icons: [glyph('rightstick')], label: 'Maus' },
    { icons: [glyph(set.click), glyph('rightstick')], label: 'Klicken' },
    { icons: [glyph(set.scrollTrigger), glyph('rightstick')], label: 'Scrollen' },
    { icons: [glyph(set.menu)], label: 'TV-Modus' }
  ];
}

// Hinweise unter der Bildschirmtastatur
export function getKeyboardHints({ device, platform }) {
  if (device === 'keyboard') return [{ icons: [glyph('escape')], label: 'Schließen' }];
  const pad = PAD_GLYPHS[platform] || PAD_GLYPHS.xbox;
  return [
    { icons: [glyph('dpad')], label: 'Taste wählen' },
    { icons: [glyph(pad.confirm)], label: 'Tippen' },
    { icons: [glyph(pad.back)], label: 'Schließen' },
    { icons: [glyph(pad.x)], label: 'Löschen' },
    { icons: [glyph(pad.y)], label: 'Leerzeichen' },
    { icons: [glyph(pad.prev), glyph(pad.next)], label: 'Cursor' },
    { icons: [glyph(pad.menu)], label: 'Fertig' }
  ];
}

// Symbol der Select-Taste (Hinweise einblenden)
const SELECT_GLYPHS = { xbox: 'xbox_view', switch: 'switch_minus', ps: 'generic_select', steamdeck: 'generic_select' };
export const getSelectGlyph = (platform) => glyph(SELECT_GLYPHS[platform] || 'generic_select');
