import { getMotion } from './motion';

/**
 * Hero choreography. Runs when the intro curtain is gone (or immediately when
 * it is skipped) and only touches transforms/opacity of the info lines, the
 * avatar and the social row.
 */
export function initHero() {
  const hero = document.querySelector<HTMLElement>('[data-hero]');
  if (!hero) return;

  const { gsap, reduced } = getMotion();
  const lines = Array.from(hero.querySelectorAll<HTMLElement>('[data-hero-line]'));
  const mottoEl = hero.querySelector<HTMLElement>('[data-hero-motto]');
  const actionsEl = hero.querySelector<HTMLElement>('[data-hero-actions]');
  const metaEls = Array.from(hero.querySelectorAll<HTMLElement>('[data-hero-meta]'));
  const avatarInner = hero.querySelector<HTMLElement>('[data-hero-avatar-inner]');
  const hint = hero.querySelector<HTMLElement>('[data-scroll-hint]');

  if (reduced) return;

  gsap.set(lines, { autoAlpha: 0, y: 16 });
  gsap.set([mottoEl, actionsEl].filter(Boolean), { autoAlpha: 0, y: 14 });
  gsap.set(metaEls, { autoAlpha: 0, y: 10 });
  if (avatarInner) gsap.set(avatarInner, { autoAlpha: 0, scale: 1.08, filter: 'blur(6px)' });
  if (hint) gsap.set(hint, { autoAlpha: 0, y: 8 });

  let played = false;

  const play = () => {
    if (played) return;
    played = true;

    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });

    if (avatarInner) {
      tl.to(avatarInner, { autoAlpha: 1, scale: 1, filter: 'blur(0px)', duration: 1.15, ease: 'power3.out' }, 0);
    }
    tl.to(lines, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.08 }, 0.1)
      .to([mottoEl, actionsEl].filter(Boolean), { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.08 }, 0.32)
      .to(metaEls, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.05 }, 0.55);

    if (hint) tl.to(hint, { autoAlpha: 1, y: 0, duration: 0.7 }, 0.9);
  };

  if (document.documentElement.classList.contains('is-intro-done')) {
    play();
  } else {
    window.addEventListener('funiki:intro-done', play, { once: true });
  }
}
