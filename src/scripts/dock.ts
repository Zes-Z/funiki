import { getMotion } from './motion';
import siteConfig from '../../siteconfig';

/**
 * Hero avatar → fixed top-left dock morph, plus the soft pop-over menu.
 */
export function initDock() {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  const heroAvatar = document.querySelector<HTMLElement>('[data-hero-avatar]');
  const morph = document.querySelector<HTMLElement>('[data-morph]');
  const dockRoot = document.querySelector<HTMLElement>('[data-dock]');
  const button = document.querySelector<HTMLButtonElement>('[data-dock-button]');
  const menu = document.querySelector<HTMLElement>('[data-dock-menu]');

  if (!hero || !heroAvatar || !morph || !dockRoot || !button || !menu) return;

  const { gsap, ScrollTrigger, reduced } = getMotion();
  const menuItems = Array.from(menu.querySelectorAll<HTMLElement>('[data-dock-item]'));

  /* -------------------------------------------------------------- */
  /* 1. scroll-linked morph                                          */
  /* -------------------------------------------------------------- */

  const START = () => Math.min(window.innerHeight * 0.06, 64);
  const END = () => window.innerHeight * 0.62;

  const measure = () => {
    const avatarRect = heroAvatar.getBoundingClientRect();
    const avatarDocTop = avatarRect.top + window.scrollY;
    const avatarDocLeft = avatarRect.left + window.scrollX;
    const size = avatarRect.width || heroAvatar.offsetWidth;
    const buttonRect = button.getBoundingClientRect();
    const dockSize = buttonRect.width || siteConfig.dock.size;
    const dx = buttonRect.left || siteConfig.dock.offset.x;
    const dy = buttonRect.top || siteConfig.dock.offset.y;

    return {
      startX: avatarDocLeft,
      startY: avatarDocTop - START(),
      size,
      endX: dx,
      endY: dy,
      endScale: dockSize / Math.max(1, size),
    };
  };

  const timeline = gsap.timeline({ paused: true });

  const buildTimeline = () => {
    const m = measure();
    if (!m.size) return;
    gsap.set(morph, { width: m.size, height: m.size });
    timeline.clear();
    timeline.fromTo(
      morph,
      { x: m.startX, y: m.startY, scale: 1 },
      {
        x: m.endX,
        y: m.endY,
        scale: m.endScale,
        duration: 1,
        ease: 'none',
        immediateRender: false,
      }
    );
  };

  buildTimeline();

  let dockShown = false;
  let morphShown = false;

  const showMorph = () => {
    if (!morphShown) {
      morphShown = true;
      gsap.set(morph, { autoAlpha: 1 });
    }
  };

  const hideMorph = () => {
    if (morphShown) {
      morphShown = false;
      gsap.set(morph, { autoAlpha: 0 });
    }
  };

  const showHeroAvatar = () => {
    // During the curtain intro the hero choreography owns this element.
    if (!document.documentElement.classList.contains('is-intro-done')) return;
    gsap.set(heroAvatar, { autoAlpha: 1 });
  };

  const hideHeroAvatar = () => gsap.set(heroAvatar, { autoAlpha: 0 });

  const showDock = () => {
    if (dockShown) return;
    dockShown = true;
    dockRoot.removeAttribute('inert');
    dockRoot.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('is-docked');
    gsap.to(dockRoot, { autoAlpha: 1, duration: 0.4, ease: 'power2.out', overwrite: true });
  };

  const hideDock = () => {
    if (!dockShown) return;
    dockShown = false;
    dockRoot.setAttribute('inert', '');
    dockRoot.setAttribute('aria-hidden', 'true');
    document.documentElement.classList.remove('is-docked');
    gsap.to(dockRoot, { autoAlpha: 0, duration: 0.25, overwrite: true });
    closeMenu();
  };

  const applyState = (progress: number) => {
    const p = Math.max(0, Math.min(1, progress));
    if (p >= 0.999) {
      hideMorph();
      hideHeroAvatar();
      showDock();
      return;
    }
    if (p > 0.004) {
      hideDock();
      showMorph();
      hideHeroAvatar();
      return;
    }
    hideDock();
    hideMorph();
    showHeroAvatar();
  };

  const trigger = ScrollTrigger.create({
    trigger: hero,
    start: () => START(),
    end: () => END(),
    scrub: 0.7,
    animation: timeline,
    invalidateOnRefresh: true,
    onRefresh: (self) => applyState(self.progress),
    onUpdate: (self) => applyState(self.progress),
    onEnter: (self) => applyState(self.progress),
    onEnterBack: (self) => applyState(self.progress),
    onLeave: () => applyState(1),
    onLeaveBack: () => applyState(0),
  });

  if (reduced) {
    trigger.disable();
    hideMorph();
    showHeroAvatar();
    gsap.set(dockRoot, { autoAlpha: 0 });
  }

  ScrollTrigger.addEventListener('refreshInit', buildTimeline);

  /* -------------------------------------------------------------- */
  /* 2. pop-over menu                                               */
  /* -------------------------------------------------------------- */

  let open = false;
  let lastScrollY = window.scrollY;

  function openMenu() {
    if (open || reduced) return;
    const dockRootEl = dockRoot!;
    const buttonEl = button!;
    const menuEl = menu!;
    open = true;
    dockRootEl.classList.add('is-open');
    buttonEl.setAttribute('aria-expanded', 'true');
    menuEl.removeAttribute('inert');
    menuEl.setAttribute('aria-hidden', 'false');
    menuEl.style.pointerEvents = 'auto';

    gsap.killTweensOf([menuEl, menuItems]);
    gsap.fromTo(
      menuEl,
      { autoAlpha: 0, scale: 0.9, y: -8, transformOrigin: '50% 0%' },
      {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        duration: siteConfig.dock.openDuration,
        ease: 'power3.out',
        overwrite: true,
      }
    );
    gsap.fromTo(
      menuItems,
      { autoAlpha: 0, y: -8 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.46,
        ease: 'power3.out',
        stagger: 0.045,
        delay: 0.05,
        overwrite: true,
      }
    );
  }

  function closeMenu() {
    const dockRootEl = dockRoot!;
    const buttonEl = button!;
    const menuEl = menu!;
    if (!open) {
      menuEl.style.pointerEvents = 'none';
      menuEl.setAttribute('inert', '');
      menuEl.setAttribute('aria-hidden', 'true');
      return;
    }
    open = false;
    dockRootEl.classList.remove('is-open');
    buttonEl.setAttribute('aria-expanded', 'false');
    menuEl.style.pointerEvents = 'none';
    menuEl.setAttribute('inert', '');
    menuEl.setAttribute('aria-hidden', 'true');

    gsap.killTweensOf([menuEl, menuItems]);
    gsap.to(menuEl, {
      autoAlpha: 0,
      scale: 0.94,
      y: -5,
      duration: siteConfig.dock.closeDuration,
      ease: 'power2.in',
      overwrite: true,
    });
    gsap.to(menuItems, {
      autoAlpha: 0,
      y: -5,
      duration: siteConfig.dock.closeDuration * 0.7,
      ease: 'power2.in',
      stagger: 0.02,
      overwrite: true,
    });
  }

  closeMenu();
  hideDock();

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (open) closeMenu();
    else openMenu();
  });

  document.addEventListener('pointerdown', (event) => {
    if (!open) return;
    const target = event.target as Node | null;
    if (target && (dockRoot.contains(target) || menu.contains(target))) return;
    closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      closeMenu();
      button.focus({ preventScroll: true });
    }
  });

  window.addEventListener(
    'scroll',
    () => {
      const next = window.scrollY;
      if (open && Math.abs(next - lastScrollY) > 6) closeMenu();
      lastScrollY = next;
    },
    { passive: true }
  );

  menu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => closeMenu());
  });

  window.addEventListener('funiki:sheet-open', closeMenu);

  // Keep dock state correct once fonts are ready (hero height can shift).
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      buildTimeline();
      ScrollTrigger.refresh();
    });
  }
}