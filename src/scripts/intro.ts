import { getMotion } from './motion';

/**
 * Short curtain intro. Resolves once the veil is gone so hero
 * choreography can start at exactly the right moment.
 */
export function initIntro(): Promise<void> {
  const intro = document.querySelector<HTMLElement>('[data-intro]');
  const repeated =
    (() => {
      try {
        return sessionStorage.getItem('funiki-intro-seen') === '1';
      } catch {
        return false;
      }
    })();

  const reduced =
    document.documentElement.classList.contains('no-intro') ||
    repeated ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!intro || reduced) {
    intro?.remove();
    document.documentElement.classList.add('is-intro-done');
    return Promise.resolve();
  }

  const { gsap } = getMotion();
  const word = intro.querySelector<HTMLElement>('[data-intro-word]');
  const meta = intro.querySelector<HTMLElement>('[data-intro-meta]');

  return new Promise<void>((resolve) => {
    const tl = gsap.timeline({
      onComplete: () => {
        intro.remove();
        document.documentElement.classList.add('is-intro-done');
        try {
          sessionStorage.setItem('funiki-intro-seen', '1');
        } catch {
          /* private mode — fine, intro simply replays */
        }
        resolve();
      },
    });

    if (word) gsap.set(word, { yPercent: 118, rotate: 2.5 });
    if (meta) gsap.set(meta, { autoAlpha: 0, y: 8 });

    if (word) {
      tl.to(word, { yPercent: 0, rotate: 0, duration: 0.9, ease: 'power4.out' });
    }
    if (meta) {
      tl.to(meta, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out' }, '-=0.45');
    }
    tl.to({}, { duration: 0.28 }).to(intro, {
      clipPath: 'inset(0% 0% 100% 0%)',
      duration: 0.82,
      ease: 'power4.inOut',
    });
  });
}