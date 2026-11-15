import { getMotion } from './motion';
import siteConfig from '../../siteconfig';

export function initCursor() {
  if (!siteConfig.motion.customCursor) return;

  const dot = document.querySelector<HTMLElement>('[data-cursor]');
  const ring = document.querySelector<HTMLElement>('[data-cursor-ring]');
  if (!dot || !ring) return;

  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const { reduced } = getMotion();
  if (!fine || reduced) {
    dot.style.display = 'none';
    ring.style.display = 'none';
    return;
  }

  const { gsap } = getMotion();
  document.documentElement.classList.add('has-cursor');

  const dotX = gsap.quickTo(dot, 'x', { duration: 0.18, ease: 'power3' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.18, ease: 'power3' });
  const ringX = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
  const ringY = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });

  let visible = false;
  const show = () => {
    if (visible) return;
    visible = true;
    gsap.to([dot, ring], { autoAlpha: 1, duration: 0.35, overwrite: true });
  };
  const hide = () => {
    visible = false;
    gsap.to([dot, ring], { autoAlpha: 0, duration: 0.3, overwrite: true });
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return;
      show();
      dotX(e.clientX);
      dotY(e.clientY);
      ringX(e.clientX);
      ringY(e.clientY);
    },
    { passive: true }
  );

  document.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);

  const interactiveSelector = 'a, button, [data-cursor-hover], input, textarea, [role="button"]';

  document.addEventListener('pointerover', (e) => {
    const target = e.target as Element | null;
    const hit = target?.closest(interactiveSelector);
    if (!hit) return;
    dot.classList.add('is-hovering');
    ring.classList.add('is-hovering');
    gsap.to(dot, { scale: 0.35, duration: 0.35, overwrite: true });
    gsap.to(ring, { scale: 1.5, duration: 0.45, overwrite: true });
  });

  document.addEventListener('pointerout', (e) => {
    const target = e.target as Element | null;
    if (!target?.closest(interactiveSelector)) return;
    dot.classList.remove('is-hovering');
    ring.classList.remove('is-hovering');
    gsap.to(dot, { scale: 1, duration: 0.35, overwrite: true });
    gsap.to(ring, { scale: 1, duration: 0.45, overwrite: true });
  });
}
