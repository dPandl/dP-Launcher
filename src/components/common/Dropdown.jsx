import React, { useState, useEffect, useRef, Children, isValidElement } from 'react';
import { createPortal } from 'react-dom';

const CLOSE_ANIMATION_MS = 110;

/**
 * Extrahiert rekursiv den Textinhalt von React-Nodes
 */
function textOf(node) {
  return Children.toArray(node)
    .map(child => (isValidElement(child) ? textOf(child.props.children) : String(child)))
    .join('');
}

/**
 * Liest <option> und <optgroup> aus den Children
 */
function readOptions(children, group = null, out = []) {
  Children.forEach(children, child => {
    if (!isValidElement(child)) return;
    if (child.type === React.Fragment) {
      readOptions(child.props.children, group, out);
    } else if (child.type === 'optgroup') {
      readOptions(child.props.children, child.props.label, out);
    } else if (child.type === 'option') {
      const label = textOf(child.props.children);
      out.push({
        value: String(child.props.value ?? label),
        label,
        disabled: Boolean(child.props.disabled),
        hidden: Boolean(child.props.hidden),
        style: child.props.style,
        group
      });
    }
  });
  return out;
}

/**
 * Einheitliches Custom-Dropdown nach dem Vorbild des Kindergarten-Portals.
 * Wird exakt wie ein natives <select> verwendet:
 * <Dropdown value={value} onChange={e => setValue(e.target.value)}>
 *   <option value="a">A</option>
 *   <option value="b">B</option>
 * </Dropdown>
 */
export default function Dropdown({
  value,
  onChange,
  children,
  className = '',
  style,
  title,
  disabled,
  id,
  'aria-label': ariaLabel
}) {
  const options = readOptions(children);
  const selectedIndex = options.findIndex(option => option.value === String(value ?? ''));
  const selected = options[selectedIndex] || options[0];

  const [phase, setPhase] = useState('closed'); // 'closed' | 'open' | 'closing'
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState(null);

  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const closeTimer = useRef(null);
  const typed = useRef({ text: '', at: 0 });

  const isOpen = phase === 'open';

  const close = () => {
    setPhase(prev => (prev === 'open' ? 'closing' : prev));
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setPhase('closed'), CLOSE_ANIMATION_MS);
  };

  const open = () => {
    if (disabled || !options.length) return;
    clearTimeout(closeTimer.current);

    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const wantedHeight = Math.min(320, options.length * 38 + 12);
    const placeAbove = spaceBelow < wantedHeight && spaceAbove > spaceBelow;

    setPlacement({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 160) - 8)),
      minWidth: Math.max(rect.width, 140),
      maxHeight: Math.max(120, Math.min(320, placeAbove ? spaceAbove : spaceBelow)),
      ...(placeAbove
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
      up: placeAbove
    });

    setActive(Math.max(0, selectedIndex));
    setPhase('open');
  };

  const choose = (option) => {
    if (option.disabled) return;
    close();
    triggerRef.current?.focus();
    if (option.value !== String(value ?? '')) {
      onChange?.({
        target: { value: option.value },
        currentTarget: { value: option.value }
      });
    }
  };

  const move = (from, step) => {
    for (let i = from + step; i >= 0 && i < options.length; i += step) {
      if (!options[i].disabled && !options[i].hidden) return i;
    }
    return from;
  };

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutsideClick = (e) => {
      if (!listRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) {
        close();
      }
    };

    const handleScroll = (e) => {
      if (!listRef.current?.contains(e.target)) {
        close();
      }
    };

    const handleResize = () => close();

    window.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, active]);

  const onKeyDown = (e) => {
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        open();
      }
      return;
    }

    e.stopPropagation();
    if (e.key === 'Escape' || e.key === 'Tab') {
      if (e.key === 'Escape') e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(prev => move(prev, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(prev => move(prev, -1));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (options[active]) choose(options[active]);
    } else if (e.key.length === 1) {
      const now = Date.now();
      typed.current = {
        text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(),
        at: now
      };
      const hit = options.findIndex(
        (option, idx) => !option.disabled && !option.hidden && option.label.toLowerCase().startsWith(typed.current.text)
      );
      if (hit >= 0) setActive(hit);
    }
  };

  let lastGroup = null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        title={title}
        disabled={disabled}
        style={style}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`app-dd-trigger ${isOpen ? 'app-dd-trigger-open' : ''} ${className}`.trim()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (isOpen) close();
          else open();
        }}
        onKeyDown={onKeyDown}
      >
        <span className="app-dd-label" style={selected?.style}>
          {selected?.label ?? ''}
        </span>
        <svg className="app-dd-chevron" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4 6l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {phase !== 'closed' && placement && createPortal(
        <div
          ref={listRef}
          role="listbox"
          className={`app-dd-list ${placement.up ? 'app-dd-list-up' : ''} ${phase === 'closing' ? 'app-dd-list-closing' : ''}`.trim()}
          style={{
            left: placement.left,
            top: placement.top,
            bottom: placement.bottom,
            minWidth: placement.minWidth,
            maxHeight: placement.maxHeight
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((option, idx) => {
            if (option.hidden) return null;
            const heading = option.group && option.group !== lastGroup ? option.group : null;
            lastGroup = option.group;

            return (
              <React.Fragment key={`${option.value}-${idx}`}>
                {heading && <div className="app-dd-group">{heading}</div>}
                <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  disabled={option.disabled}
                  aria-selected={idx === selectedIndex}
                  data-active={idx === active}
                  className={`app-dd-option ${idx === active ? 'app-dd-option-active' : ''} ${idx === selectedIndex ? 'app-dd-option-selected' : ''}`.trim()}
                  style={option.style}
                  onMouseEnter={() => {
                    if (!option.disabled) setActive(idx);
                  }}
                  onClick={() => choose(option)}
                >
                  <span className="app-dd-option-text">{option.label}</span>
                  {idx === selectedIndex && (
                    <svg className="app-dd-check" viewBox="0 0 16 16" aria-hidden="true">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

