import { registerBackHandler } from './navigation';

/**
 * App-eigene Dialoge (Modals) statt hässlicher Browser- / System-Popups.
 * Basiert auf dem Designsystem aus Kindergarten / Entwicklungswerkzeuge.
 */

const ICON_PATHS = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'
};

const ICON_COLORS = {
  info: ['#f0f9ff', '#bae6fd', '#0284c7'],
  warning: ['#fef2f2', '#fee2e2', '#dc2626'],
  question: ['#f0f9ff', '#bae6fd', '#0284c7']
};

export const showDialog = ({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = null,
  extraLabel = null,
  danger = false,
  icon = 'info',
  input = null
}) => new Promise(resolve => {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-modal-overlay';
  overlay.style.setProperty('z-index', '200000', 'important');

  const card = document.createElement('div');
  card.className = 'confirm-modal-card';
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');

  const [iconBg, iconBorder, iconColor] = ICON_COLORS[icon] || ICON_COLORS.info;
  const badge = document.createElement('div');
  badge.className = 'confirm-modal-badge';
  badge.style.cssText = `width:46px;height:46px;border-radius:9999px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:${iconBg};border:1px solid ${iconBorder};color:${iconColor};flex-shrink:0`;
  badge.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[icon] || ICON_PATHS.info}</svg>`;

  const heading = document.createElement('h3');
  heading.className = 'confirm-modal-title';
  heading.textContent = title;

  const text = document.createElement('p');
  text.className = 'confirm-modal-text';
  text.textContent = message || '';

  const row = document.createElement('div');
  row.className = 'confirm-modal-actions';

  let field = null;
  if (input) {
    field = document.createElement('input');
    field.type = 'text';
    field.value = input.value || '';
    field.placeholder = input.placeholder || '';
    field.className = 'app-dialog-input';
    field.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (field.value.trim()) close(true);
      }
    });
  }

  let unregisterBack = null;

  const close = (result) => {
    document.removeEventListener('keydown', onKey, true);
    if (unregisterBack) unregisterBack();
    overlay.classList.add('app-modal-leaving');
    setTimeout(() => {
      overlay.remove();
      resolve(field ? (result === true ? field.value : null) : result);
    }, 180);
  };

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close(false);
    }
  };

  // Klinkt den Dialog auch in den Zurück-Button ein
  unregisterBack = registerBackHandler(() => close(false), 'Abbrechen');

  const addButton = (label, className, result, isDanger = false) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    if (isDanger) button.classList.add('danger');
    button.onclick = () => close(result);
    row.appendChild(button);
    return button;
  };

  if (cancelLabel) {
    addButton(cancelLabel, 'modal-btn-secondary', false);
  }
  if (extraLabel) {
    addButton(extraLabel, 'modal-btn-secondary', 'extra');
  }

  const main = addButton(confirmLabel, 'modal-btn-primary', true, danger);

  if (field) {
    const sync = () => { main.disabled = !field.value.trim(); };
    field.addEventListener('input', sync);
    sync();
  }

  card.append(...[badge, heading, message ? text : null, field, row].filter(Boolean));
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  document.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(false);
  });

  if (field) {
    field.focus();
    field.select();
  } else {
    main.focus();
  }
});

/**
 * Bestätigungs-Dialog: liefert Promise<boolean> (true bei Bestätigung, false bei Abbruch)
 */
export const appConfirm = (message, {
  title = 'Bitte bestätigen',
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  danger = false
} = {}) => showDialog({
  title: title || (danger ? 'Wirklich fortfahren?' : 'Bitte bestätigen'),
  message,
  confirmLabel,
  cancelLabel,
  danger,
  icon: danger ? 'warning' : 'question'
});

/**
 * Hinweis-Dialog: liefert Promise<void>
 */
export const appAlert = (message, {
  title = 'Hinweis',
  confirmLabel = 'Verstanden',
  warning = false
} = {}) => showDialog({
  title,
  message,
  confirmLabel,
  icon: warning ? 'warning' : 'info'
});

/**
 * Eingabe-Aufforderung: liefert Promise<string | null>
 */
export const appPrompt = (message, {
  title = 'Eingabe',
  value = '',
  placeholder = '',
  confirmLabel = 'Übernehmen',
  cancelLabel = 'Abbrechen'
} = {}) => showDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  icon: 'question',
  input: { value, placeholder }
});

