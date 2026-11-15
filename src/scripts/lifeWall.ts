import { getMotion, lockScroll, unlockScroll } from './motion';

/**
 * Frame 3 — life wall interactions:
 *  - live-photo hover preview (the still becomes a short clip in place)
 *  - full-screen "查看原图" viewer with keyboard/touch navigation
 * When the depth field is active the wall is hidden, but clicking any depth
 * piece opens this same viewer directly.
 */
export function initLifeWall() {
  const root = document.querySelector<HTMLElement>('[data-lightbox]');
  if (!root) return;

  // The viewer lives inside <main> in the markup; move it to <body> so the
  // inert background (applied to <main>) never disables the dialog itself.
  if (root.closest('main')) {
    document.body.appendChild(root);
  }

  const tiles = Array.from(document.querySelectorAll<HTMLElement>('[data-life-tile]'));
  if (!tiles.length) return;

  const { gsap, reduced } = getMotion();

  const backdrop = root.querySelector<HTMLElement>('[data-lightbox-close]');
  const mediaEl = root.querySelector<HTMLElement>('[data-lightbox-media]');
  const titleEl = root.querySelector<HTMLElement>('[data-lightbox-title]');
  const metaEl = root.querySelector<HTMLElement>('[data-lightbox-meta]');
  const ui = root.querySelector<HTMLElement>('.lightbox__ui');
  const indexEl = root.querySelector<HTMLElement>('[data-lightbox-index]');
  const caption = root.querySelector<HTMLElement>('.lightbox__caption');

  if (!mediaEl || !ui || !titleEl || !metaEl) return;

  let current = -1;
  let isOpen = false;
  let lastTrigger: HTMLElement | null = null;
  let closeTimer = 0;

  const pad = (n: number) => String(n).padStart(2, '0');

  const buildMedia = (tile: HTMLElement) => {
    mediaEl.replaceChildren();
    const full = tile.dataset.full;
    const video = tile.dataset.video;
    const type = tile.dataset.type;

    if (video) {
      const vid = document.createElement('video');
      vid.src = video;
      if (full) vid.poster = full;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.autoplay = true;
      vid.controls = true;
      vid.setAttribute('playsinline', '');
      mediaEl.appendChild(vid);
    } else if (full) {
      const img = document.createElement('img');
      img.src = full;
      img.alt = tile.querySelector('.play-media img')?.getAttribute('alt') ?? '';
      img.decoding = 'async';
      const w = Number(tile.dataset.w);
      const h = Number(tile.dataset.h);
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        img.width = w;
        img.height = h;
      }
      mediaEl.appendChild(img);
    }

    titleEl.textContent = tile.dataset.caption || '';
    metaEl.textContent = tile.dataset.taken || (type === 'live' ? 'Live Photo' : '');
  };

  const setIndexLabel = () => {
    if (indexEl) indexEl.textContent = pad(current + 1);
  };

  const showUi = () => {
    if (reduced) {
      gsap.set([backdrop, mediaEl, caption, ui], { opacity: 1, x: 0, y: 0, scale: 1 });
      if (ui) gsap.set(ui, { xPercent: -50 });
      return;
    }
    gsap.to(backdrop, { opacity: 1, duration: 0.5, ease: 'power2.out', overwrite: true });
    gsap.fromTo(
      mediaEl,
      { opacity: 0, scale: 0.965, y: 8 },
      { opacity: 1, scale: 1, y: 0, duration: 0.6, ease: 'power3.out', overwrite: true }
    );
    gsap.fromTo(
      caption,
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.5, delay: 0.08, ease: 'power2.out', overwrite: true }
    );
    gsap.set(ui, { xPercent: -50 });
    gsap.fromTo(
      ui,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.5, delay: 0.1, ease: 'power2.out', overwrite: true }
    );
  };

  const openAt = (index: number, trigger: HTMLElement | null) => {
    window.clearTimeout(closeTimer);
    current = (index + tiles.length) % tiles.length;
    const tile = tiles[current];
    if (!tile) return;

    if (!isOpen) {
      lastTrigger = trigger ?? null;
      root.hidden = false;
      root.setAttribute('aria-hidden', 'false');
      document.documentElement.classList.add('is-lightbox-open');
      document.querySelector('main')?.setAttribute('inert', '');
      document.querySelector('[data-dock]')?.setAttribute('inert', '');
      lockScroll();
      isOpen = true;
      buildMedia(tile);
      setIndexLabel();
      showUi();
      root.focus({ preventScroll: true });
    } else {
      buildMedia(tile);
      setIndexLabel();
      if (!reduced) {
        gsap.fromTo(
          mediaEl,
          { opacity: 0, scale: 0.985 },
          { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out', overwrite: true }
        );
        gsap.fromTo(mediaEl, { x: 0 }, { x: 0, duration: 0.35 });
      }
    }
  };

  const finishClose = () => {
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('is-lightbox-open');
    document.querySelector('main')?.removeAttribute('inert');
    const dockEl = document.querySelector<HTMLElement>('[data-dock]');
    if (dockEl && dockEl.getAttribute('aria-hidden') === 'false') dockEl.removeAttribute('inert');
    unlockScroll();
    isOpen = false;
    current = -1;
    mediaEl.replaceChildren();
    const restore = lastTrigger && lastTrigger.offsetParent !== null ? lastTrigger : null;
    const depthView = document.querySelector<HTMLElement>('[data-depth-view]');
    const focusTarget = restore ?? (depthView && !depthView.hidden ? depthView : null);
    focusTarget?.focus({ preventScroll: true });
  };

  const step = (direction: number) => {
    if (!isOpen) return;
    openAt(current + direction, lastTrigger);
  };

  const close = () => {
    if (!isOpen) return;
    if (reduced) {
      finishClose();
      return;
    }
    gsap.to(backdrop, { opacity: 0, duration: 0.28, ease: 'power2.in', overwrite: true });
    gsap.to(mediaEl, { opacity: 0, scale: 0.985, duration: 0.28, ease: 'power2.in', overwrite: true });
    gsap.to([caption, ui], { opacity: 0, duration: 0.2, overwrite: true });
    closeTimer = window.setTimeout(finishClose, 300);
  };

  tiles.forEach((tile, index) => {
    const button = tile.querySelector<HTMLElement>('[data-life-open]');
    if (!button) return;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openAt(index, button);
    });

    /* live-photo hover preview */
    const videoSrc = tile.dataset.video;
    if (!videoSrc) return;
    const media = tile.querySelector<HTMLElement>('.play-media');
    if (!media) return;

    let video: HTMLVideoElement | null = null;

    const playLive = () => {
      if (window.matchMedia('(hover: none)').matches) return;
      if (!video) {
        video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'none';
        video.setAttribute('aria-hidden', 'true');
        if (tile.dataset.full) video.poster = tile.dataset.full;
        video.src = videoSrc;
        media.appendChild(video);
      }
      media.classList.add('is-live-playing');
      void video.play().catch(() => {});
    };

    const stopLive = () => {
      media.classList.remove('is-live-playing');
      video?.pause();
    };

    tile.addEventListener('pointerenter', playLive);
    tile.addEventListener('pointerleave', stopLive);
  });

  root.querySelectorAll('[data-lightbox-close]').forEach((el) => {
    el.addEventListener('click', close);
  });

  root.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => step(-1));
  root.querySelector('[data-lightbox-next]')?.addEventListener('click', () => step(1));

  document.addEventListener('keydown', (event) => {
    if (!isOpen) return;
    if (event.key === 'Tab') {
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
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
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(1);
    }
  });

  // touch swipe inside the viewer
  let touchStartX = 0;
  root.addEventListener(
    'touchstart',
    (event) => {
      touchStartX = event.touches[0]?.clientX ?? 0;
    },
    { passive: true }
  );
  root.addEventListener(
    'touchend',
    (event) => {
      const endX = event.changedTouches[0]?.clientX ?? touchStartX;
      const dx = endX - touchStartX;
      if (Math.abs(dx) > 48) step(dx > 0 ? -1 : 1);
    },
    { passive: true }
  );
}

/**
 * Exposed so the depth-field focus panel can also open the big viewer.
 */
export function openLifeViewer(index: number) {
  document.querySelectorAll<HTMLElement>('[data-life-open]')[index]?.click();
}