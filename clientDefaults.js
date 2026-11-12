// Startvorgaben für Spieler: deutsche Sprache und der Community-Server in der Serverliste
import fs from 'fs';
import path from 'path';

const DEFAULT_LANGUAGE = 'de_de';
const MARKER_FILE = 'launcher-defaults.json';
const GRAPHICS_BACKENDS = ['vulkan', 'opengl'];

// ─── NBT (unkomprimiert, wie in servers.dat) ────────────────────────────────
const TAG = { END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6, BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12 };
const FIXED_SIZE = { [TAG.BYTE]: 1, [TAG.SHORT]: 2, [TAG.INT]: 4, [TAG.LONG]: 8, [TAG.FLOAT]: 4, [TAG.DOUBLE]: 8 };
const ARRAY_ELEMENT_SIZE = { [TAG.BYTE_ARRAY]: 1, [TAG.INT_ARRAY]: 4, [TAG.LONG_ARRAY]: 8 };

// Werte bleiben rohe Bytes, damit fremde Einträge (z. B. Server-Icons) unverändert erhalten bleiben
function readPayload(buffer, cursor, type) {
  const take = (length) => {
    if (length < 0 || cursor.offset + length > buffer.length) throw new Error('NBT-Daten sind abgeschnitten');
    const slice = buffer.subarray(cursor.offset, cursor.offset + length);
    cursor.offset += length;
    return slice;
  };

  if (FIXED_SIZE[type]) return take(FIXED_SIZE[type]);
  if (ARRAY_ELEMENT_SIZE[type]) {
    const count = take(4).readInt32BE(0);
    if (count < 0) throw new Error('Ungültige NBT-Arraylänge');
    return { count, data: take(count * ARRAY_ELEMENT_SIZE[type]) };
  }
  if (type === TAG.STRING) return take(take(2).readUInt16BE(0));
  if (type === TAG.LIST) {
    const elementType = take(1)[0];
    const count = take(4).readInt32BE(0);
    const items = [];
    for (let i = 0; i < count; i++) items.push(readPayload(buffer, cursor, elementType));
    return { elementType, items };
  }
  if (type === TAG.COMPOUND) {
    const entries = [];
    for (;;) {
      const entryType = take(1)[0];
      if (entryType === TAG.END) return entries;
      const name = take(take(2).readUInt16BE(0));
      entries.push({ type: entryType, name, value: readPayload(buffer, cursor, entryType) });
    }
  }
  throw new Error(`Unbekannter NBT-Typ ${type}`);
}

function writePayload(chunks, type, value) {
  const uint16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
  const int32 = (n) => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };

  if (FIXED_SIZE[type]) chunks.push(value);
  else if (ARRAY_ELEMENT_SIZE[type]) chunks.push(int32(value.count), value.data);
  else if (type === TAG.STRING) chunks.push(uint16(value.length), value);
  else if (type === TAG.LIST) {
    chunks.push(Buffer.from([value.elementType]), int32(value.items.length));
    value.items.forEach(item => writePayload(chunks, value.elementType, item));
  } else if (type === TAG.COMPOUND) {
    for (const entry of value) {
      chunks.push(Buffer.from([entry.type]), uint16(entry.name.length), entry.name);
      writePayload(chunks, entry.type, entry.value);
    }
    chunks.push(Buffer.from([TAG.END]));
  }
}

export function parseServersDat(buffer) {
  const cursor = { offset: 0 };
  if (buffer[0] !== TAG.COMPOUND) throw new Error('servers.dat beginnt nicht mit einem NBT-Compound');
  cursor.offset = 1;
  const nameLength = buffer.readUInt16BE(cursor.offset);
  cursor.offset += 2 + nameLength;
  const root = readPayload(buffer, cursor, TAG.COMPOUND);
  if (cursor.offset !== buffer.length) throw new Error('servers.dat hat unerwartete Daten am Ende');
  return root;
}

export function serializeServersDat(root) {
  const chunks = [Buffer.from([TAG.COMPOUND, 0, 0])];
  writePayload(chunks, TAG.COMPOUND, root);
  return Buffer.concat(chunks);
}

// Minecraft liest NBT-Texte als Javas "Modified UTF-8". Normales UTF-8 mit z. B. Emojis
// lässt das Laden scheitern, und das Spiel überschreibt danach die ganze Serverliste.
export function encodeModifiedUtf8(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit >= 0x01 && unit <= 0x7f) {
      bytes.push(unit);
    } else if (unit <= 0x7ff) {
      bytes.push(0xc0 | (unit >> 6), 0x80 | (unit & 0x3f));
    } else {
      bytes.push(0xe0 | (unit >> 12), 0x80 | ((unit >> 6) & 0x3f), 0x80 | (unit & 0x3f));
    }
  }
  return Buffer.from(bytes);
}

const findEntry = (compound, name) => compound.find(entry => entry.name.toString('utf8') === name);
const stringEntry = (name, value) => ({ type: TAG.STRING, name: Buffer.from(name, 'utf8'), value: encodeModifiedUtf8(value) });

function getServerAddress(server) {
  const entry = findEntry(server, 'ip');
  return entry?.type === TAG.STRING ? entry.value.toString('utf8').trim().toLowerCase() : '';
}

function isHidden(server) {
  const entry = findEntry(server, 'hidden');
  return entry?.type === TAG.BYTE && entry.value[0] !== 0;
}

function setString(compound, name, value) {
  const entry = findEntry(compound, name);
  if (entry) {
    entry.type = TAG.STRING;
    entry.value = encodeModifiedUtf8(value);
  } else {
    compound.push(stringEntry(name, value));
  }
}

// Trägt den Server ein oder aktualisiert ihn, ohne andere Einträge zu verändern. Liefert true bei Änderung.
export function ensureServerEntry(root, { name, address, previousAddress }) {
  let list = findEntry(root, 'servers');
  if (!list) {
    list = { type: TAG.LIST, name: Buffer.from('servers', 'utf8'), value: { elementType: TAG.COMPOUND, items: [] } };
    root.push(list);
  }
  if (list.type !== TAG.LIST) throw new Error('servers.dat: "servers" ist keine Liste');
  if (list.value.items.length === 0) list.value.elementType = TAG.COMPOUND;
  if (list.value.elementType !== TAG.COMPOUND) throw new Error('servers.dat: Unerwarteter Listentyp');

  const wanted = address.trim().toLowerCase();
  const servers = list.value.items;
  const matches = servers.filter(server => getServerAddress(server) === wanted);

  if (matches.some(server => !isHidden(server))) {
    const hiddenCopies = matches.filter(isHidden);
    if (hiddenCopies.length === 0) return false;
    list.value.items = servers.filter(server => !hiddenCopies.includes(server));
    return true;
  }

  // Quick Play legt den Server als versteckten Eintrag an, der in der Liste nicht erscheint
  if (matches.length > 0) {
    const [entry] = matches;
    findEntry(entry, 'hidden').value = Buffer.from([0]);
    setString(entry, 'name', name);
    list.value.items = [entry, ...servers.filter(server => !matches.includes(server))];
    return true;
  }

  // Zieht der Server um, wandert sein Eintrag mit, statt eine Leiche zu hinterlassen
  const previous = previousAddress?.trim().toLowerCase();
  const moved = previous ? servers.find(server => getServerAddress(server) === previous) : null;
  if (moved) {
    setString(moved, 'ip', address.trim());
    return true;
  }

  servers.unshift([stringEntry('name', name), stringEntry('ip', address.trim())]);
  return true;
}

function writeFileAtomic(filePath, data) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, data);
  fs.renameSync(tempPath, filePath);
}

function applyServerEntry(gameDir, server, marker) {
  const filePath = path.join(gameDir, 'servers.dat');
  let root = [];
  if (fs.existsSync(filePath)) {
    // Eine unlesbare Liste bleibt unangetastet, sonst wären die Server des Spielers weg
    root = parseServersDat(fs.readFileSync(filePath));
  }
  if (ensureServerEntry(root, { ...server, previousAddress: marker.serverAddress })) {
    writeFileAtomic(filePath, serializeServersDat(root));
  }
  marker.serverAddress = server.address.trim();
}

// Nur einmal pro Spielordner: Wer danach die Sprache wechselt, behält seine Wahl
function applyLanguage(gameDir, marker) {
  if (marker.languageApplied) return;
  const filePath = path.join(gameDir, 'options.txt');
  const line = `lang:${DEFAULT_LANGUAGE}`;
  if (fs.existsSync(filePath)) {
    const text = fs.readFileSync(filePath, 'utf8');
    const updated = /^lang:.*$/m.test(text)
      ? text.replace(/^lang:[^\r\n]*/m, line)
      : `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${line}\n`;
    if (updated !== text) writeFileAtomic(filePath, updated);
  } else {
    writeFileAtomic(filePath, `${line}\n`);
  }
  marker.languageApplied = true;
}

// Bei jedem Start, damit die Auswahl im Launcher gilt. Ohne Auswahl bleibt die Einstellung aus Minecraft.
function applyGraphicsBackend(gameDir, backend) {
  if (!GRAPHICS_BACKENDS.includes(backend)) return;
  const filePath = path.join(gameDir, 'options.txt');
  const line = `preferredGraphicsBackend:"${backend}"`;
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
  const updated = /^preferredGraphicsBackend:.*$/m.test(text)
    ? text.replace(/^preferredGraphicsBackend:[^\r\n]*/m, line)
    : `${text}${text.endsWith('\n') || text === '' ? '' : '\n'}${line}\n`;
  if (updated !== text) writeFileAtomic(filePath, updated);
}

/**
 * Setzt die Vorgaben für einen Spielordner. Fehler stoppen den Spielstart nie.
 * @returns {string[]} Hinweise für das Protokoll
 */
export function applyClientDefaults(gameDir, server, { graphicsBackend } = {}) {
  const notes = [];
  const markerPath = path.join(gameDir, MARKER_FILE);
  let marker = {};
  try {
    fs.mkdirSync(gameDir, { recursive: true });
    if (fs.existsSync(markerPath)) marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  } catch (err) {
    marker = {};
  }

  try {
    applyLanguage(gameDir, marker);
  } catch (err) {
    notes.push(`Sprache konnte nicht gesetzt werden: ${err.message}`);
  }

  try {
    applyGraphicsBackend(gameDir, graphicsBackend);
  } catch (err) {
    notes.push(`Grafik-Schnittstelle konnte nicht gesetzt werden: ${err.message}`);
  }

  if (server?.address?.trim()) {
    try {
      applyServerEntry(gameDir, { name: server.name || 'Minecraft Server', address: server.address }, marker);
    } catch (err) {
      notes.push(`Server konnte nicht in die Serverliste eingetragen werden: ${err.message}`);
    }
  }

  try {
    writeFileAtomic(markerPath, JSON.stringify(marker, null, 2));
  } catch (err) {
    notes.push(`Launcher-Vorgaben konnten nicht gespeichert werden: ${err.message}`);
  }
  return notes;
}
