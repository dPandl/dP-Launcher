/* ==========================================================================
   SEGMENTED CONTROLS - GLEITENDE PILLE (Original Kita Portal)
   Umschalter (z. B. „Mods | Resourcepacks | Datapacks“):
   Eine weiße Pille gleitet unter den aktiven Knopf.
   Unterstützt .app-seg, .mr-type-tabs und .segmented-control.
   ========================================================================== */

const lastPlace = new Map();
const keyOf = seg => [...seg.querySelectorAll(":scope > button")].map(button => button.textContent.trim()).join("|");

const isSegmented = el => el && (
  el.classList.contains('app-seg') ||
  el.classList.contains('mr-type-tabs') ||
  el.classList.contains('segmented-control')
);

const place = seg => {
  let pill = seg.querySelector(':scope > .app-seg-pill');
  if (!pill) {
    pill = document.createElement('span');
    pill.className = 'app-seg-pill';
    pill.setAttribute('aria-hidden', 'true');
    seg.prepend(pill);
  }

  const active = seg.querySelector(':scope > button.active, :scope > button.bg-white, :scope > button.segmented-control-btn.active');
  if (!active) {
    pill.style.opacity = '0';
    return;
  }

  const first = !pill.dataset.ready;
  const key = keyOf(seg);
  const before = lastPlace.get(key);

  if (first) {
    pill.style.transition = 'none';
    if (before && before.active !== active.textContent.trim()) {
      pill.style.opacity = '1';
      pill.style.transform = before.transform;
      pill.style.width = before.width;
      pill.style.height = before.height;
      pill.offsetWidth; // Force Reflow
      pill.style.transition = '';
      pill.dataset.ready = '1';
    }
  }

  pill.style.opacity = '1';
  pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.height = `${active.offsetHeight}px`;
  pill.style.borderRadius = getComputedStyle(active).borderRadius || '999px';

  if (!pill.dataset.ready) {
    pill.offsetWidth; // Force Reflow
    pill.style.transition = '';
    pill.dataset.ready = '1';
  }

  lastPlace.set(key, {
    active: active.textContent.trim(),
    transform: pill.style.transform,
    width: pill.style.width,
    height: pill.style.height
  });
};

const cleanup = () => {
  document.querySelectorAll('.app-seg-pill').forEach(pill => {
    if (!pill.parentElement || !isSegmented(pill.parentElement)) {
      pill.remove();
    }
  });
};

export const startSegmented = () => {
  let frame = 0;
  const update = () => {
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        document.querySelectorAll('.app-seg, .mr-type-tabs, .segmented-control').forEach(place);
        cleanup();
      });
    }
  };

  new MutationObserver(update).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  window.addEventListener('resize', update);
  // Sofort einmal ausführen
  update();
};

