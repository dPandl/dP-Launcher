// Erzeugt die saisonalen Skins als 64x64-PNGs und schreibt sie als Datenadressen in src/services/generatedSeasonalSkins.js
const fs = require('fs');
const zlib = require('zlib');

const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; };

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

class Canvas {
  constructor() { this.d = Buffer.alloc(64 * 64 * 4); }
  px(x, y, c) { if (x < 0 || y < 0 || x > 63 || y > 63) return; const o = (y * 64 + x) * 4; this.d.set(hex(c), o); }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  png() { return encodePng(this.d, 64, 64); }
}

// Grundfigur: Kopf, Körper, Arme, Beine
function base(o) {
  const c = new Canvas();
  const S = o.skin;
  // Kopf
  c.rect(0, 8, 32, 8, S); c.rect(8, 0, 16, 8, S);
  const hairRows = o.hairFront === undefined ? 2 : o.hairFront;
  if (o.hair) {
    c.rect(8, 0, 8, 8, o.hair); c.rect(24, 8, 8, 8, o.hair);
    const sideRows = o.hairLong ? 8 : (o.hairSide || 3);
    c.rect(0, 8, 8, sideRows, o.hair); c.rect(16, 8, 8, sideRows, o.hair);
    if (hairRows > 0) c.rect(8, 8, 8, hairRows, o.hair);
    if (o.hairLong) { c.rect(8, 10, 1, 6, o.hair); c.rect(15, 10, 1, 6, o.hair); }
  }
  // Gesicht
  if (o.eyes !== false) {
    const white = o.eyeWhite || '#ffffff', pupil = o.pupil || '#3b2a1a';
    c.px(9, 11, white); c.px(10, 11, pupil); c.px(13, 11, pupil); c.px(14, 11, white);
    c.px(9, 12, o.eyeShadow || S); c.px(14, 12, o.eyeShadow || S);
  }
  if (o.mouth !== false) c.rect(11, 14, 2, 1, o.mouthColor || '#a5654a');
  // Körper
  c.rect(16, 20, 16, 12, o.shirt); c.rect(32, 20, 8, 12, o.shirt); c.rect(20, 16, 16, 4, o.shirt);
  // Arme
  const sleeve = o.sleeve || o.shirt, sl = o.sleeveLen === undefined ? 12 : o.sleeveLen;
  c.rect(40, 16, 16, 16, o.armSkin || S); c.rect(32, 48, 16, 16, o.armSkin || S);
  if (sl > 0) {
    c.rect(40, 20, 16, sl, sleeve); c.rect(32, 52, 16, sl, sleeve);
    c.rect(44, 16, 4, 4, sleeve); c.rect(36, 48, 4, 4, sleeve);
  }
  // Beine
  const P = o.pants, pl = o.pantsLen === undefined ? 12 : o.pantsLen;
  c.rect(0, 16, 16, 16, o.legSkin || S); c.rect(16, 48, 16, 16, o.legSkin || S);
  c.rect(0, 20, 16, pl, P); c.rect(16, 52, 16, pl, P);
  c.rect(4, 16, 4, 4, P); c.rect(20, 48, 4, 4, P);
  if (o.shoes) {
    const rows = o.shoeRows || 3;
    c.rect(0, 32 - rows, 16, rows, o.shoes); c.rect(16, 64 - rows, 16, rows, o.shoes);
    c.rect(8, 16, 4, 4, o.shoes); c.rect(24, 48, 4, 4, o.shoes);
  }
  return c;
}

// Hilfen für Vorderseiten
const bodyF = (c, dx, dy, w, h, col) => c.rect(20 + dx, 20 + dy, w, h, col);
const bodyB = (c, dx, dy, w, h, col) => c.rect(32 + dx, 20 + dy, w, h, col);
const headF = (c, dx, dy, w, h, col) => c.rect(8 + dx, 8 + dy, w, h, col);
// Kopfbedeckung auf der zweiten Ebene: Oberseite und die oberen Zeilen der vier Seiten
function hat(c, col, rows) {
  c.rect(40, 0, 8, 8, col);
  for (const x of [32, 40, 48, 56]) c.rect(x, 8, 8, rows, col);
}
const skinSpec = [];
const add = (season, id, name, description, build) => skinSpec.push({ season, id, name, description, build });

// ─── Winter ───────────────────────────────────────────────────────────────
add('winter', 'winter-santa', 'Weihnachtsmann', 'Roter Mantel, weißer Bart und eine Mütze mit Bommel.', () => {
  const c = base({ skin: '#f0c4a0', hair: '#f5f5f5', hairSide: 4, hairFront: 1, shirt: '#c0262c', pants: '#c0262c', shoes: '#1b1b1b', pupil: '#2b4a8c' });
  headF(c, 1, 4, 6, 4, '#f5f5f5'); headF(c, 2, 5, 4, 1, '#e0e0e0');
  hat(c, '#c0262c', 3); c.rect(32, 10, 32, 1, '#ffffff'); c.rect(32, 9, 32, 1, '#ffffff');
  bodyF(c, 0, 8, 8, 2, '#1c1c1c'); bodyF(c, 3, 8, 2, 2, '#e8c33a'); bodyB(c, 0, 8, 8, 2, '#1c1c1c');
  c.rect(40, 30, 16, 2, '#ffffff'); c.rect(32, 62, 16, 2, '#ffffff');
  bodyF(c, 3, 0, 2, 8, '#ffffff');
  return c;
});
add('winter', 'winter-snowman', 'Schneemann', 'Mit Karottennase, Zylinder und rotem Schal.', () => {
  const c = base({ skin: '#f4f8fb', hair: null, shirt: '#f4f8fb', pants: '#dfe8ee', shoes: '#9aa7b0', eyeWhite: '#1b1b1b', pupil: '#1b1b1b', eyeShadow: '#f4f8fb', mouth: false });
  c.rect(11, 12, 2, 1, '#f28c28'); c.rect(11, 13, 1, 1, '#d9731a');
  for (const [x, y] of [[9, 14], [10, 15], [11, 15], [12, 15], [13, 15], [14, 14]]) c.px(x, y, '#1b1b1b');
  hat(c, '#1b1b1b', 2); c.rect(32, 9, 32, 1, '#c0262c');
  bodyF(c, 0, 0, 8, 2, '#c0262c'); bodyB(c, 0, 0, 8, 2, '#c0262c'); c.rect(16, 20, 4, 2, '#c0262c'); c.rect(28, 20, 4, 2, '#c0262c');
  for (const y of [3, 6, 9]) bodyF(c, 3, y, 2, 2, '#1b1b1b');
  c.rect(40, 28, 16, 4, '#6b4a2b'); c.rect(32, 60, 16, 4, '#6b4a2b');
  return c;
});
add('winter', 'winter-icequeen', 'Eisprinzessin', 'Kristallblaues Kleid mit funkelnder Krone.', () => {
  const c = base({ skin: '#f3d6c0', hair: '#cfe9ff', hairLong: true, hairFront: 2, shirt: '#7fc4ee', pants: '#a8d8f5', pantsLen: 8, legSkin: '#f3d6c0', shoes: '#5aa7d6', shoeRows: 2, pupil: '#2f8fe0', sleeveLen: 4, sleeve: '#7fc4ee' });
  c.rect(0, 8 + 0, 0, 0, '#000000');
  c.rect(32, 8, 32, 1, '#9fd8ff'); for (const x of [34, 37, 42, 45, 50, 53, 58, 61]) c.px(x, 8, '#ffffff');
  c.rect(40, 0, 8, 1, '#9fd8ff');
  for (const [x, y] of [[1, 2], [5, 3], [3, 6], [6, 8], [2, 10]]) bodyF(c, x, y, 1, 1, '#ffffff');
  bodyF(c, 0, 9, 8, 1, '#bfe6ff');
  return c;
});
add('winter', 'winter-elf', 'Weihnachtself', 'Grüne Tunika, Ringelstrumpfhose und spitze Mütze.', () => {
  const c = base({ skin: '#f0c9a4', hair: '#7a4a21', shirt: '#2f8f3a', pants: '#c0262c', shoes: '#5a3a1c', pupil: '#2f8f3a' });
  hat(c, '#2f8f3a', 2); c.rect(32, 9, 32, 1, '#c0262c');
  bodyF(c, 0, 8, 8, 2, '#c0262c'); bodyF(c, 3, 8, 2, 2, '#e8c33a'); bodyB(c, 0, 8, 8, 2, '#c0262c');
  for (let y = 22; y < 29; y += 2) { c.rect(0, y, 16, 1, '#ffffff'); c.rect(16, y + 32, 16, 1, '#ffffff'); }
  c.rect(40, 30, 16, 2, '#ffffff'); c.rect(32, 62, 16, 2, '#ffffff');
  return c;
});
add('winter', 'winter-explorer', 'Polarforscher', 'Orangefarbene Parka mit Fellkapuze für die Eiswüste.', () => {
  const c = base({ skin: '#e8b99a', hair: '#5a3a1c', shirt: '#e8742a', pants: '#2a3a5a', shoes: '#1b1b1b', pupil: '#3b2a1a' });
  c.rect(40, 0, 8, 8, '#e8742a'); c.rect(32, 8, 8, 8, '#e8742a'); c.rect(48, 8, 8, 8, '#e8742a'); c.rect(56, 8, 8, 8, '#e8742a'); c.rect(40, 8, 8, 2, '#e8742a');
  c.rect(40, 8, 8, 1, '#f4f4f4'); c.rect(40, 9, 1, 7, '#f4f4f4'); c.rect(47, 9, 1, 7, '#f4f4f4'); c.rect(32, 15, 8, 1, '#f4f4f4'); c.rect(48, 15, 8, 1, '#f4f4f4');
  bodyF(c, 3, 0, 2, 12, '#f1f1f1'); bodyF(c, 0, 9, 8, 1, '#b85a1c');
  c.rect(40, 29, 16, 3, '#2b2b2b'); c.rect(32, 61, 16, 3, '#2b2b2b');
  return c;
});

// ─── Frühling ─────────────────────────────────────────────────────────────
add('spring', 'spring-gardener', 'Gärtner', 'Strohhut und grüne Latzhose für die Beete.', () => {
  const c = base({ skin: '#e6b48c', hair: '#6a4521', shirt: '#f4f4ee', sleeveLen: 4, pants: '#3f8f3f', shoes: '#6b4a2b', pupil: '#3a6b2a' });
  hat(c, '#e4c65a', 2); c.rect(32, 9, 32, 1, '#b08a2e');
  bodyF(c, 1, 3, 6, 9, '#3f8f3f'); bodyF(c, 1, 0, 1, 3, '#3f8f3f'); bodyF(c, 6, 0, 1, 3, '#3f8f3f'); bodyF(c, 2, 5, 2, 2, '#2c6a2c');
  bodyB(c, 1, 3, 6, 9, '#3f8f3f');
  return c;
});
add('spring', 'spring-bunny', 'Osterhase', 'Weißes Fell, rosa Näschen und Ohren auf der Mütze.', () => {
  const c = base({ skin: '#f7f7f7', hair: '#f7f7f7', shirt: '#f7f7f7', pants: '#f7d1dc', shoes: '#ffffff', eyeWhite: '#ffffff', pupil: '#222222', eyeShadow: '#f7f7f7', mouth: false });
  c.px(11, 13, '#f4a0b5'); c.px(12, 13, '#f4a0b5'); c.px(11, 14, '#e07a96'); c.px(12, 14, '#e07a96'); c.px(10, 12, '#fbd0da'); c.px(13, 12, '#fbd0da');
  c.rect(40, 0, 8, 8, '#f7b8c8'); c.rect(34, 8, 3, 3, '#f7b8c8'); c.rect(51, 8, 3, 3, '#f7b8c8');
  bodyF(c, 2, 3, 4, 6, '#f9c6d4'); bodyB(c, 3, 8, 2, 2, '#ffffff'); bodyB(c, 3, 8, 2, 2, '#fbd0da');
  return c;
});
add('spring', 'spring-flower', 'Blumenmädchen', 'Blütenkranz im Haar und ein luftiges Frühlingskleid.', () => {
  const c = base({ skin: '#f3cfae', hair: '#e8c05a', hairLong: true, shirt: '#6bbf59', pants: '#6bbf59', pantsLen: 6, legSkin: '#f3cfae', shoes: '#ffffff', shoeRows: 2, sleeveLen: 3, pupil: '#4a8f3a' });
  c.rect(32, 8, 32, 1, '#5fa84a'); [['#f06c9b', 33], ['#ffd23f', 35], ['#ffffff', 37], ['#f06c9b', 39], ['#ffd23f', 41], ['#f06c9b', 43], ['#ffffff', 45], ['#ffd23f', 47], ['#f06c9b', 49], ['#ffffff', 51], ['#ffd23f', 53], ['#f06c9b', 55], ['#ffffff', 57], ['#ffd23f', 59], ['#f06c9b', 61]].forEach(([col, x]) => c.px(x, 8, col));
  for (const [x, y, col] of [[1, 2, '#f06c9b'], [5, 4, '#ffd23f'], [2, 7, '#ffffff'], [6, 9, '#f06c9b'], [3, 11, '#ffd23f']]) bodyF(c, x, y, 1, 1, col);
  return c;
});
add('spring', 'spring-bee', 'Biene', 'Gelb-schwarz gestreift, mit zarten Flügeln auf dem Rücken.', () => {
  const c = base({ skin: '#f2c99a', hair: '#1b1b1b', shirt: '#f5c518', pants: '#f5c518', shoes: '#1b1b1b', pupil: '#1b1b1b' });
  for (let y = 21; y < 32; y += 4) { c.rect(16, y, 16, 2, '#1b1b1b'); c.rect(32, y, 8, 2, '#1b1b1b'); c.rect(40, y, 16, 2, '#1b1b1b'); c.rect(32, y + 32, 16, 2, '#1b1b1b'); }
  for (let y = 21; y < 29; y += 4) { c.rect(0, y, 16, 2, '#1b1b1b'); c.rect(16, y + 32, 16, 2, '#1b1b1b'); }
  hat(c, '#1b1b1b', 1); c.rect(40, 0, 8, 8, '#1b1b1b'); c.px(40, 8, '#f5c518'); c.px(47, 8, '#f5c518');
  bodyB(c, 1, 1, 6, 6, '#dff3ff'); bodyB(c, 3, 1, 2, 6, '#c5e6f7');
  return c;
});
add('spring', 'spring-ladybug', 'Marienkäfer', 'Roter Panzer mit schwarzen Punkten.', () => {
  const c = base({ skin: '#f0c8a0', hair: '#1b1b1b', shirt: '#d62828', pants: '#1b1b1b', shoes: '#d62828', pupil: '#1b1b1b' });
  hat(c, '#d62828', 3); for (const [x, y] of [[33, 9], [37, 10], [42, 9], [45, 10], [50, 9], [58, 10], [60, 9]]) c.rect(x, y, 1, 1, '#1b1b1b');
  c.rect(40, 0, 8, 8, '#d62828'); c.px(42, 3, '#1b1b1b'); c.px(45, 4, '#1b1b1b');
  for (const [x, y] of [[1, 2], [5, 3], [2, 7], [6, 9], [3, 10]]) bodyF(c, x, y, 2, 2, '#1b1b1b');
  bodyB(c, 3, 0, 2, 12, '#1b1b1b'); for (const [x, y] of [[1, 2], [5, 4], [1, 8], [5, 9]]) bodyB(c, x, y, 2, 2, '#1b1b1b');
  return c;
});

// ─── Sommer ───────────────────────────────────────────────────────────────
add('summer', 'summer-surfer', 'Surfer', 'Sonnengebräunt, mit Boardshorts und Muschelkette.', () => {
  const c = base({ skin: '#c98f5e', hair: '#e6c36a', hairSide: 4, shirt: '#c98f5e', sleeveLen: 0, pants: '#1f77c9', pantsLen: 8, legSkin: '#c98f5e', shoes: null, pupil: '#2b4a8c' });
  c.rect(20, 29, 16, 3, '#1f77c9'); c.rect(32, 29, 8, 3, '#1f77c9');
  c.rect(20, 20, 8, 12, '#c98f5e');
  bodyF(c, 0, 9, 8, 3, '#1f77c9'); bodyB(c, 0, 9, 8, 3, '#1f77c9'); c.rect(16, 29, 4, 3, '#1f77c9'); c.rect(28, 29, 4, 3, '#1f77c9');
  c.rect(4, 20, 4, 8, '#1f77c9'); c.rect(20, 52, 4, 8, '#1f77c9'); c.px(5, 22, '#ffffff'); c.px(6, 22, '#ffffff'); c.px(21, 54, '#ffffff'); c.px(22, 54, '#ffffff');
  bodyF(c, 2, 0, 4, 1, '#e8e0c8'); bodyF(c, 3, 1, 2, 1, '#e8e0c8');
  return c;
});
add('summer', 'summer-pirate', 'Pirat', 'Rotes Kopftuch, Augenklappe und gestreiftes Hemd.', () => {
  const c = base({ skin: '#d7a27a', hair: '#1b1b1b', hairLong: true, hairSide: 4, shirt: '#f1f1ea', pants: '#6b4a2b', shoes: '#1b1b1b', pupil: '#3b2a1a' });
  hat(c, '#c0262c', 2); c.px(33, 10, '#c0262c'); c.rect(58, 10, 2, 3, '#c0262c');
  c.rect(9, 10, 2, 3, '#111111'); c.rect(8, 10, 1, 1, '#111111'); c.rect(11, 10, 1, 1, '#111111');
  for (let y = 21; y < 32; y += 3) { c.rect(16, y, 16, 1, '#2b3a55'); c.rect(32, y, 8, 1, '#2b3a55'); }
  bodyF(c, 0, 0, 2, 12, '#222222'); bodyF(c, 6, 0, 2, 12, '#222222'); bodyF(c, 0, 8, 8, 1, '#e8c33a');
  c.rect(40, 20, 16, 12, '#f1f1ea'); c.rect(32, 52, 16, 12, '#f1f1ea');
  return c;
});
add('summer', 'summer-lifeguard', 'Rettungsschwimmer', 'Roter Badeanzug mit weißem Kreuz und Sonnenbrille.', () => {
  const c = base({ skin: '#d9a27a', hair: '#5a3a1c', shirt: '#d62828', sleeveLen: 0, pants: '#d62828', pantsLen: 8, legSkin: '#d9a27a', shoes: null, pupil: '#3b2a1a' });
  c.rect(9, 11, 6, 2, '#1b1b1b'); c.rect(8, 11, 1, 1, '#1b1b1b'); c.rect(15, 11, 1, 1, '#1b1b1b');
  bodyF(c, 3, 3, 2, 6, '#ffffff'); bodyF(c, 2, 5, 4, 2, '#ffffff');
  c.rect(16, 20, 4, 12, '#d9a27a'); c.rect(28, 20, 4, 12, '#d9a27a'); bodyF(c, 0, 0, 1, 12, '#d9a27a'); bodyF(c, 7, 0, 1, 12, '#d9a27a');
  return c;
});
add('summer', 'summer-hawaii', 'Strandurlauber', 'Buntes Hawaiihemd und Strohhut.', () => {
  const c = base({ skin: '#e8b68e', hair: '#3a2615', shirt: '#19a7b8', sleeveLen: 4, pants: '#e9d8a6', shoes: '#d62828', shoeRows: 1, pupil: '#3b2a1a' });
  hat(c, '#f1dca0', 2); c.rect(32, 9, 32, 1, '#c9a74a');
  for (const [x, y, col] of [[1, 2, '#f06c9b'], [4, 1, '#ffd23f'], [6, 4, '#ffffff'], [2, 6, '#ffd23f'], [5, 8, '#f06c9b'], [1, 10, '#ffffff'], [7, 11, '#ffd23f']]) { bodyF(c, x, y, 1, 1, col); bodyB(c, x, y, 1, 1, col); }
  for (const [x, y, col] of [[1, 1, '#ffd23f'], [3, 2, '#f06c9b']]) { c.px(44 + x, 20 + y, col); c.px(36 + x, 52 + y, col); }
  return c;
});
add('summer', 'summer-mermaid', 'Meerjungfrau', 'Türkisfarbene Schwanzflosse und Muscheloberteil.', () => {
  const c = base({ skin: '#f2cdb0', hair: '#28c7b7', hairLong: true, shirt: '#f2cdb0', sleeveLen: 0, pants: '#1fa59a', shoes: '#9be7de', shoeRows: 3, pupil: '#1f8fa5' });
  c.rect(20, 20, 8, 12, '#f2cdb0'); c.rect(16, 20, 4, 12, '#f2cdb0'); c.rect(28, 20, 4, 12, '#f2cdb0'); c.rect(32, 20, 8, 12, '#f2cdb0');
  bodyF(c, 1, 2, 3, 3, '#f2a9c4'); bodyF(c, 4, 2, 3, 3, '#f2a9c4'); bodyB(c, 1, 2, 6, 1, '#f2a9c4');
  for (const [x, y] of [[1, 22], [5, 24], [2, 26], [6, 28], [9, 22], [13, 25], [10, 28]]) { c.px(x, y, '#168a80'); c.px(x + 16, y + 32, '#168a80'); }
  c.rect(0, 20, 16, 12, '#1fa59a'); c.rect(16, 52, 16, 12, '#1fa59a');
  for (const [x, y] of [[1, 22], [5, 24], [2, 26], [6, 28], [9, 22], [13, 25], [10, 28]]) { c.px(x, y, '#168a80'); c.px(x + 16, y + 32, '#168a80'); }
  c.rect(0, 29, 16, 3, '#9be7de'); c.rect(16, 61, 16, 3, '#9be7de');
  return c;
});

// ─── Herbst ───────────────────────────────────────────────────────────────
add('autumn', 'autumn-pumpkin', 'Kürbis-Ritter', 'Dunkle Rüstung mit glühendem Kürbiskopf.', () => {
  const c = base({ skin: '#e8842a', hair: null, shirt: '#3b3b45', pants: '#2c2c35', shoes: '#1c1c22', eyes: false, mouth: false });
  c.rect(0, 8, 32, 8, '#e8842a'); for (const x of [2, 5, 18, 21, 26, 29]) c.rect(x, 8, 1, 8, '#d1701c');
  c.rect(9, 10, 2, 2, '#3a1e0a'); c.rect(13, 10, 2, 2, '#3a1e0a'); c.rect(9, 13, 6, 1, '#3a1e0a'); c.rect(10, 14, 1, 1, '#3a1e0a'); c.rect(13, 14, 1, 1, '#3a1e0a');
  c.rect(43, 3, 2, 3, '#4c7a2b'); c.rect(42, 5, 1, 1, '#4c7a2b');
  bodyF(c, 0, 0, 8, 1, '#e8842a'); bodyF(c, 0, 8, 8, 1, '#e8842a'); bodyB(c, 0, 0, 8, 1, '#e8842a'); bodyF(c, 3, 3, 2, 3, '#4a4a56');
  c.rect(44, 16, 4, 4, '#e8842a'); c.rect(36, 48, 4, 4, '#e8842a');
  return c;
});
add('autumn', 'autumn-scarecrow', 'Vogelscheuche', 'Strohhut, geflickte Kleider und genähtes Lächeln.', () => {
  const c = base({ skin: '#d9b87c', hair: '#e2c04a', hairSide: 5, hairFront: 3, shirt: '#b5651d', pants: '#3b5a8a', shoes: '#6b4a2b', eyeWhite: '#222222', pupil: '#222222', eyeShadow: '#d9b87c', mouth: false });
  for (const x of [9, 11, 13]) c.px(x, 14, '#5a3a1c'); c.px(10, 14, '#5a3a1c'); c.px(12, 14, '#5a3a1c'); c.px(14, 14, '#5a3a1c');
  hat(c, '#6b4a2b', 2); c.rect(32, 9, 32, 1, '#4a3118');
  bodyF(c, 1, 2, 2, 2, '#3a7d44'); bodyF(c, 5, 6, 2, 2, '#3b6fb5'); bodyB(c, 2, 4, 3, 3, '#3a7d44');
  c.rect(40, 29, 16, 3, '#e2c04a'); c.rect(32, 61, 16, 3, '#e2c04a'); c.rect(4, 22, 3, 3, '#a8442a'); c.rect(20, 54, 3, 3, '#a8442a');
  return c;
});
add('autumn', 'autumn-witch', 'Hexe', 'Violettes Gewand, Spitzhut und grüne Haut.', () => {
  const c = base({ skin: '#7fb56a', hair: '#1b1b1b', hairLong: true, shirt: '#5b2f86', pants: '#5b2f86', shoes: '#1b1b1b', pupil: '#d4e84a', eyeWhite: '#f4ffd0', mouthColor: '#3a6a2a' });
  hat(c, '#1b1b1b', 3); c.rect(32, 10, 32, 1, '#7b3fa0'); c.rect(33, 9, 1, 1, '#1b1b1b'); c.px(13, 13, '#4a7a3a');
  for (const [x, y] of [[1, 2], [5, 5], [2, 8], [6, 10]]) bodyF(c, x, y, 1, 1, '#e8c33a');
  bodyF(c, 0, 8, 8, 1, '#e8c33a');
  return c;
});
add('autumn', 'autumn-lumberjack', 'Waldarbeiter', 'Rot-schwarzes Flanellhemd, Bart und orangene Mütze.', () => {
  const c = base({ skin: '#e0ac80', hair: '#3a2615', shirt: '#b5262d', pants: '#2d3f5e', shoes: '#4a3118', pupil: '#3b2a1a' });
  for (const [x0, y0, w, h] of [[16, 20, 16, 12], [32, 20, 8, 12], [40, 20, 16, 12], [32, 52, 16, 12]]) {
    for (let x = x0; x < x0 + w; x += 4) c.rect(x, y0, 1, h, '#1b1b1b');
    for (let y = y0; y < y0 + h; y += 4) c.rect(x0, y, w, 1, '#1b1b1b');
  }
  headF(c, 1, 5, 6, 3, '#7a5230'); c.rect(11, 14, 2, 1, '#a5654a');
  hat(c, '#d9692b', 2); c.rect(32, 9, 32, 1, '#a84a18');
  return c;
});
add('autumn', 'autumn-ghost', 'Gespenst', 'Ein Bettlaken mit zwei Augenlöchern. Buh!', () => {
  const c = base({ skin: '#f3f3f6', hair: null, shirt: '#f3f3f6', pants: '#f3f3f6', shoes: '#dcdce8', eyes: false, mouth: false });
  c.rect(9, 10, 2, 3, '#1b1b1b'); c.rect(13, 10, 2, 3, '#1b1b1b'); c.rect(11, 14, 2, 2, '#1b1b1b');
  bodyF(c, 0, 10, 8, 2, '#e4e4ee'); bodyB(c, 0, 10, 8, 2, '#e4e4ee');
  c.rect(0, 26, 16, 6, '#e4e4ee'); c.rect(16, 58, 16, 6, '#e4e4ee');
  c.rect(0, 29, 16, 3, '#dcdce8'); c.rect(16, 61, 16, 3, '#dcdce8');
  return c;
});

// ─── Ausgabe ──────────────────────────────────────────────────────────────
const out = skinSpec.map(s => ({
  id: s.id, name: s.name, description: s.description, season: s.season, variant: 'classic',
  dataUrl: 'data:image/png;base64,' + s.build().png().toString('base64')
}));
const root = require('path').join(__dirname, '..') + '/';
const body = out.map(s => `  { id: '${s.id}', season: '${s.season}', name: '${s.name}', description: '${s.description.replace(/'/g, "\\'")}', variant: 'classic', dataUrl: '${s.dataUrl}' }`).join(',\n');
fs.writeFileSync(root + 'src/services/generatedSeasonalSkins.js',
`// Saisonale Skins: je Jahreszeit fünf Stück, direkt im Launcher gezeichnet (64x64, Classic-Modell).
// Erzeugt mit scripts/generate-seasonal-skins.cjs, nicht von Hand ändern.
export const GENERATED_SEASONAL_SKINS = [
${body}
];
`);
console.log(out.length, 'Skins');
