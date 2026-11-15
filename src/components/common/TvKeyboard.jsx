import { createPortal } from 'react-dom';
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Delete, ArrowBigUp, CornerDownLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { isTextField, pickNext, setKeyboardHandler, wasJustActivated } from '../../utils/tvNavigation';
import { usePromptState, getKeyboardHints } from '../../utils/controllerPrompts';

// Bildschirmtastatur für den TV-Modus. Sie öffnet sich, wenn ein Eingabefeld angeklickt oder mit A aktiviert wird,
// und lässt sich mit Steuerkreuz, A, B, X, Y, LB/RB und Start bedienen (die Belegung steht unter den Tasten).
const BACK = { action: 'back' };
const SHIFT = { action: 'shift' };
const chars = (text) => [...text].map(char => ({ char }));
const bottom = (symbolLabel) => [
  { action: 'symbols', span: 2, label: symbolLabel },
  { action: 'space', span: 5 },
  { action: 'left' },
  { action: 'right' },
  { action: 'enter', span: 2 }
];

const LAYERS = {
  lower: [
    [...chars('1234567890'), BACK],
    chars('qwertzuiopü'),
    chars('asdfghjklöä'),
    [SHIFT, ...chars('yxcvbnm,.-')],
    bottom('?123')
  ],
  upper: [
    [...chars('1234567890'), BACK],
    chars('QWERTZUIOPÜ'),
    chars('ASDFGHJKLÖÄ'),
    [SHIFT, ...chars('YXCVBNM;:_')],
    bottom('?123')
  ],
  symbols: [
    [...chars('!"§$%&/()='), BACK],
    chars('?@#€_+*~^°ß'),
    chars('\'`´<>[]{}\\|'),
    chars(';:,.-²³µ¿¡»'),
    bottom('abc')
  ]
};

function setValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const hasCaret = (el) => typeof el.selectionStart === 'number';

function insertText(el, text) {
  const start = hasCaret(el) ? el.selectionStart : el.value.length;
  const end = hasCaret(el) ? el.selectionEnd : start;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  if (el.maxLength > 0 && next.length > el.maxLength) return;
  setValue(el, next);
  if (hasCaret(el)) el.setSelectionRange(start + text.length, start + text.length);
}

function backspace(el) {
  const start = hasCaret(el) ? el.selectionStart : el.value.length;
  const end = hasCaret(el) ? el.selectionEnd : start;
  if (start === end && start === 0) return;
  const from = start === end ? start - 1 : start;
  setValue(el, el.value.slice(0, from) + el.value.slice(end));
  if (hasCaret(el)) el.setSelectionRange(from, from);
}

function moveCaret(el, delta) {
  if (!hasCaret(el)) return;
  const next = Math.min(el.value.length, Math.max(0, (delta < 0 ? el.selectionStart : el.selectionEnd) + delta));
  el.setSelectionRange(next, next);
}

export default function TvKeyboard() {
  const [field, setField] = useState(null);
  const [layer, setLayer] = useState('lower');
  const [pos, setPos] = useState({ row: 2, col: 5 });
  const [, refresh] = useReducer(count => count + 1, 0);
  const prompt = usePromptState();
  const rootRef = useRef(null);
  const live = useRef({});
  live.current = { field, layer, pos };

  // Die Tastatur des Systems (z. B. die des Steam Decks) soll nicht zusätzlich aufgehen. Sie öffnet sich nur bei
  // Feldern, die das System als bearbeitbar meldet. Deshalb sind die Felder schreibgeschützt (inputmode="none" allein
  // reicht nicht) und der Launcher trägt Eingaben selbst ein: Bildschirmtastatur und Hardware-Tastatur.
  useEffect(() => {
    const touched = new Map();
    const mark = (el) => {
      if (!el || el.nodeType !== 1 || !isTextField(el) || touched.has(el)) return;
      if (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;
      touched.set(el, { mode: el.getAttribute('inputmode'), readOnly: el.readOnly });
      el.setAttribute('inputmode', 'none');
      el.setAttribute('virtualkeyboardpolicy', 'manual');
      el.readOnly = true;
    };
    const markAll = (root) => {
      mark(root);
      root.querySelectorAll?.('input, textarea').forEach(mark);
    };
    markAll(document.body);
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(markAll)));
    observer.observe(document.body, { childList: true, subtree: true });
    const early = (event) => mark(event.target);
    document.addEventListener('pointerdown', early, true);
    document.addEventListener('focusin', early, true);
    // Hardware-Tastatur: Zeichen selbst eintragen, weil die Felder schreibgeschützt sind
    const onKeyDown = (event) => {
      const el = event.target;
      if (!touched.has(el) || touched.get(el).readOnly || event.isComposing) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.length === 1) { event.preventDefault(); insertText(el, event.key); }
      else if (event.key === 'Backspace') { event.preventDefault(); backspace(el); }
      else if (event.key === 'Enter' && el.tagName === 'TEXTAREA') { event.preventDefault(); insertText(el, '\n'); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', early, true);
      document.removeEventListener('focusin', early, true);
      document.removeEventListener('keydown', onKeyDown, true);
      touched.forEach(({ mode, readOnly }, el) => {
        if (mode === null) el.removeAttribute('inputmode'); else el.setAttribute('inputmode', mode);
        el.removeAttribute('virtualkeyboardpolicy');
        el.readOnly = readOnly;
      });
    };
  }, []);

  // Öffnen: Eingabefeld erhält den Fokus durch einen Klick oder A, nicht durch bloßes Anvisieren
  useEffect(() => {
    const open = (el) => {
      if (!el || !isTextField(el) || rootRef.current?.contains(el)) return;
      setField(el);
      setLayer('lower');
    };
    const onFocusIn = (event) => { if (wasJustActivated()) open(event.target); };
    const onRequest = (event) => open(event.detail);
    const onFocusOut = (event) => {
      setTimeout(() => {
        if (event.target === live.current.field && document.activeElement !== event.target) setField(null);
      }, 60);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('tv-osk-request', onRequest);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('tv-osk-request', onRequest);
    };
  }, []);

  // Platz schaffen, solange die Tastatur offen ist
  useEffect(() => {
    if (!field) return undefined;
    const root = document.documentElement;
    root.classList.add('tv-osk-open');
    const measure = () => {
      const height = rootRef.current?.offsetHeight;
      if (height) root.style.setProperty('--tv-osk-h', `${height}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (rootRef.current) observer.observe(rootRef.current);
    const timer = setTimeout(() => field.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 120);
    const onInput = () => refresh();
    field.addEventListener('input', onInput);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      field.removeEventListener('input', onInput);
      root.classList.remove('tv-osk-open');
      root.style.removeProperty('--tv-osk-h');
    };
  }, [field]);

  const typeKey = (key) => {
    const el = live.current.field;
    if (!el) return;
    if (key.char !== undefined) {
      insertText(el, key.char);
      // Umschalttaste gilt nur für einen Buchstaben
      if (live.current.layer === 'upper') setLayer('lower');
    } else if (key.action === 'back') backspace(el);
    else if (key.action === 'space') insertText(el, ' ');
    else if (key.action === 'shift') setLayer(current => (current === 'upper' ? 'lower' : 'upper'));
    else if (key.action === 'symbols') setLayer(current => (current === 'symbols' ? 'lower' : 'symbols'));
    else if (key.action === 'left') moveCaret(el, -1);
    else if (key.action === 'right') moveCaret(el, 1);
    else if (key.action === 'enter') finish(el);
    refresh();
  };

  // Fertig: Mehrzeilige Felder bekommen einen Zeilenumbruch, einzeilige lösen Enter aus (Suche, Chat) und schließen
  const finish = (el) => {
    if (el.tagName === 'TEXTAREA') { insertText(el, '\n'); return; }
    ['keydown', 'keypress', 'keyup'].forEach(type => el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true, cancelable: true })));
    el.blur();
    setField(null);
  };

  const close = () => {
    live.current.field?.blur();
    setField(null);
  };

  // Steuerung per Controller
  useEffect(() => {
    if (!field) return undefined;
    const keyAt = () => {
      const { layer: current, pos: at } = live.current;
      return LAYERS[current][at.row]?.[at.col] || LAYERS[current][at.row]?.[0];
    };
    setKeyboardHandler({
      move(direction) {
        const root = rootRef.current;
        if (!root) return;
        const items = [...root.querySelectorAll('.tv-osk-key')].map(el => ({ el, rect: el.getBoundingClientRect() }));
        const from = root.querySelector('[data-osk-focus]');
        const next = from ? pickNext(from, items, direction) : null;
        if (next) setPos({ row: Number(next.dataset.row), col: Number(next.dataset.col) });
      },
      press() {
        const key = keyAt();
        if (key) typeKey(key);
      },
      close,
      button(name) {
        const el = live.current.field;
        if (!el) return;
        if (name === 'backspace') typeKey(BACK);
        else if (name === 'space') typeKey({ action: 'space' });
        else if (name === 'caretLeft') typeKey({ action: 'left' });
        else if (name === 'caretRight') typeKey({ action: 'right' });
        else if (name === 'enter') finish(el);
        else if (name === 'close') close();
        refresh();
      }
    });
    return () => setKeyboardHandler(null);
    // typeKey/finish/close nutzen nur Refs und Setter und müssen nicht neu gebunden werden
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field]);

  if (!field) return null;

  const rows = LAYERS[layer];
  const hints = getKeyboardHints(prompt);

  // Direkt unter <body>, damit Dialoge nie über der Tastatur liegen
  return createPortal(
    <div className="tv-osk" ref={rootRef} role="application" aria-label="Bildschirmtastatur">
      <div className="tv-osk-grid">
        {rows.flatMap((row, rowIndex) => {
          let col = 0;
          return row.map((key, colIndex) => {
            const start = col + 1;
            col += key.span || 1;
            const focused = pos.row === rowIndex && Math.min(pos.col, row.length - 1) === colIndex;
            const isOn = (key.action === 'shift' && layer === 'upper') || (key.action === 'symbols' && layer === 'symbols');
            return (
              <button
                key={`${layer}-${rowIndex}-${colIndex}`}
                type="button"
                tabIndex={-1}
                className={`tv-osk-key ${isOn ? 'tv-osk-on' : ''}`}
                data-row={rowIndex}
                data-col={colIndex}
                data-osk-focus={focused ? 'true' : undefined}
                style={{ gridColumn: `${start} / span ${key.span || 1}`, gridRow: rowIndex + 1 }}
                // Mit der Maus nicht den Fokus vom Eingabefeld nehmen
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => { setPos({ row: rowIndex, col: colIndex }); typeKey(key); }}
              >
                {key.char !== undefined && key.char}
                {key.action === 'back' && <Delete size={20} />}
                {key.action === 'shift' && <ArrowBigUp size={20} />}
                {key.action === 'left' && <ChevronLeft size={20} />}
                {key.action === 'right' && <ChevronRight size={20} />}
                {key.action === 'enter' && <CornerDownLeft size={20} />}
                {key.action === 'space' && 'Leertaste'}
                {key.action === 'symbols' && key.label}
              </button>
            );
          });
        })}
      </div>
      <div className="tv-osk-hints" aria-hidden="true">
        {hints.map(hint => (
          <span key={hint.label} className="tv-osk-hint">
            {hint.icons.filter(Boolean).map((src, index) => <img key={index} src={src} alt="" className="tv-hint-icon" draggable={false} />)}
            {hint.label}
          </span>
        ))}
      </div>
    </div>,
    document.body
  );
}
