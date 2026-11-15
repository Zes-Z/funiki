import { getMotion, lockScroll, unlockScroll } from './motion';

interface SheetState {
  name: string;
  trigger: HTMLElement;
  sourceRect: DOMRect | null;
  radius: number;
  returning: boolean;
}

let root: HTMLElement | null = null;
let scrollEl: HTMLElement | null = null;
let contentEl: HTMLElement | null = null;
let kickerEl: HTMLElement | null = null;
let progressEl: HTMLElement | null = null;
let closeBtn: HTMLButtonElement | null = null;

let state: SheetState | null = null;

const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

function clipFromRect(rect: DOMRect, radius: number) {
  const top = Math.max(0, rect.top);
  const left = Math.max(0, rect.left);
  const right = Math.max(0, window.innerWidth - rect.right);
  const bottom = Math.max(0, window.innerHeight - rect.bottom);
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`;
}

function setProgress() {
  if (!scrollEl || !progressEl) return;
  const max = scrollEl.scrollHeight - scrollEl.clientHeight;
  const value = max <= 0 ? 1 : Math.min(1, Math.max(0, scrollEl.scrollTop / max));
  progressEl.style.transform = `scaleX(${value})`;
}

function findTemplate(name: string): HTMLTemplateElement | null {
  return document.querySelector<HTMLTemplateElement>(
    `template[data-sheet-template="${CSS.escape(name)}"]`
  );
}

export function openSheet(name: string, trigger: HTMLElement) {
  if (!root || !contentEl) return;
  const template = findTemplate(name);
  if (!template) {
    console.warn('[funiki] missing sheet template:', name);
    return;
  }

  const { gsap } = getMotion();

  // If a sheet is already open, close it instantly and swap content.
  if (state) {
    finishClose();
  }

  const content = template.content.cloneNode(true) as DocumentFragment;
  contentEl.replaceChildren(content);

  const kicker = template.dataset.sheetKicker ?? 'Reading';
  if (kickerEl) kickerEl.textContent = kicker;

  // Pick the visual anchor used for the clip morph.
  const anchor = (trigger.querySelector<HTMLElement>('[data-sheet-source]') ?? trigger) as HTMLElement;
  const rect = anchor.getBoundingClientRect();
  const style = window.getComputedStyle(anchor);
  const radius = parseFloat(style.borderTopLeftRadius) || 0;

  state = {
    name,
    trigger,
    sourceRect: rect,
    radius,
    returning: false,
  };

  root.hidden = false;
  root.setAttribute('aria-hidden', 'false');
  document.documentElement.classList.add('is-sheet-open');
  document.querySelector('main')?.setAttribute('inert', '');
  document.querySelector('[data-dock]')?.setAttribute('inert', '');
  lockScroll();

  if (scrollEl) scrollEl.scrollTop = 0;
  setProgress();

  const target = contentEl.querySelector<HTMLElement>('h2, h3, .case__title, .prose h2, [data-sheet-focus]');

  if (!getMotion().reduced) {
    gsap.killTweensOf(root);
    root.style.clipPath = clipFromRect(rect, radius);
    gsap.set(root, { autoAlpha: 1 });
    // force style flush
    void root.offsetWidth;
    gsap.to(root, {
      clipPath: 'inset(0px 0px 0px 0px round 0px)',
      duration: 0.7,
      ease: SHEET_EASE,
      overwrite: true,
    });

    gsap.fromTo(
      contentEl,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power3.out', delay: 0.26, overwrite: true }
    );
    if (closeBtn) {
      gsap.fromTo(
        closeBtn,
        { opacity: 0, y: 8, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out', delay: 0.38, overwrite: true }
      );
    }
  } else {
    gsap.set(root, { autoAlpha: 1 });
    root.style.clipPath = 'inset(0px 0px 0px 0px round 0px)';
    gsap.set(contentEl, { autoAlpha: 1, y: 0 });
  }

  window.dispatchEvent(new CustomEvent('funiki:sheet-open', { detail: { name } }));

  closeBtn?.focus({ preventScroll: true });
  if (target) {
    target.setAttribute('tabindex', '-1');
  }
}

function finishClose() {
  if (!root) return;
  const { gsap } = getMotion();
  const trigger = state?.trigger ?? null;

  gsap.killTweensOf([root, contentEl]);
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.style.clipPath = '';
  gsap.set(root, { autoAlpha: 0 });
  if (contentEl) contentEl.replaceChildren();

  document.documentElement.classList.remove('is-sheet-open');
  document.querySelector('main')?.removeAttribute('inert');
  const dockEl = document.querySelector<HTMLElement>('[data-dock]');
  if (dockEl && dockEl.getAttribute('aria-hidden') === 'false') dockEl.removeAttribute('inert');
  unlockScroll();
  state = null;

  if (trigger && trigger.isConnected) {
    trigger.focus({ preventScroll: true });
  }
  window.dispatchEvent(new CustomEvent('funiki:sheet-close'));
}

export function closeSheet() {
  if (!state || !root) return;
  const { gsap, reduced } = getMotion();

  if (state.returning) return;
  const closing = state;
  state.returning = true;

  window.dispatchEvent(new CustomEvent('funiki:sheet-close-start'));

  const trigger = state.trigger;
  const anchor = (trigger.querySelector<HTMLElement>('[data-sheet-source]') ?? trigger) as HTMLElement;
  const rect = anchor.getBoundingClientRect();
  const visible = rect.bottom > -20 && rect.top < window.innerHeight + 20 && rect.width > 0;

  if (reduced || !visible) {
    gsap.to(root, {
      autoAlpha: 0,
      duration: 0.3,
      ease: 'power2.in',
      overwrite: true,
    });
    window.setTimeout(() => {
      if (state === closing) finishClose();
    }, 320);
    return;
  }

  gsap.to(root, {
    clipPath: clipFromRect(rect, state.radius),
    duration: 0.56,
    ease: SHEET_EASE,
    overwrite: true,
  });
  gsap.to(root, {
    autoAlpha: 0,
    duration: 0.34,
    delay: 0.22,
    ease: 'power2.in',
    overwrite: true,
  });
  gsap.to(contentEl, { autoAlpha: 0, y: 10, duration: 0.2, ease: 'power2.in', overwrite: true });

  window.setTimeout(() => {
    if (state === closing) finishClose();
  }, 620);
}

export function initSheets() {
  root = document.querySelector<HTMLElement>('[data-sheet-root]');
  if (!root) return;
  scrollEl = root.querySelector<HTMLElement>('[data-sheet-scroll]');
  contentEl = root.querySelector<HTMLElement>('[data-sheet-content]');
  kickerEl = root.querySelector<HTMLElement>('[data-sheet-kicker]');
  progressEl = root.querySelector<HTMLElement>('[data-sheet-progress]');
  closeBtn = root.querySelector<HTMLButtonElement>('[data-sheet-close]');

  if (scrollEl) {
    scrollEl.addEventListener('scroll', setProgress, { passive: true });
  }

  root.querySelectorAll('[data-sheet-close]').forEach((el) => {
    el.addEventListener('click', closeSheet);
  });

  document.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const trigger = target?.closest<HTMLElement>('[data-sheet]');
    if (!trigger) return;
    // A drag gesture on a rail should not open the sheet.
    if (document.documentElement.dataset.railDragged === '1') return;
    event.preventDefault();
    const name = trigger.dataset.sheet;
    if (!name) return;
    openSheet(name, trigger);
  });

  document.addEventListener('keydown', (event) => {
    if (!state || !root) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSheet();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep keyboard focus inside the open sheet.
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, textarea, select'
      )
    ).filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !root.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  });
}