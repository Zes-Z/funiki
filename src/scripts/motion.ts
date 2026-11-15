import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import siteConfig from '../../siteconfig';

gsap.registerPlugin(ScrollTrigger);

export interface Motion {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  lenis: Lenis | null;
  reduced: boolean;
}

let motion: Motion | null = null;

export function initMotion(): Motion {
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let lenis: Lenis | null = null;

  if (siteConfig.motion.smoothScroll && !reduced) {
    lenis = new Lenis({
      lerp: siteConfig.motion.smoothScrollLerp,
      wheelMultiplier: 1,
      touchMultiplier: 1.6,
      smoothWheel: true,
      syncTouch: false,
      autoRaf: false,
      anchors: false,
    });

    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add((time) => {
      lenis?.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  motion = { gsap, ScrollTrigger, lenis, reduced };
  return motion;
}

export function getMotion(): Motion {
  if (!motion) return initMotion();
  return motion;
}

export function lockScroll() {
  const m = getMotion();
  m.lenis?.stop();
  document.documentElement.classList.add('is-locked');
  document.body.classList.add('is-locked');
}

export function unlockScroll() {
  const m = getMotion();
  m.lenis?.start();
  document.documentElement.classList.remove('is-locked');
  document.body.classList.remove('is-locked');
}

export function scrollToTarget(target: string | number | HTMLElement, offset = 0) {
  const m = getMotion();
  const options = { offset, duration: 1.25 } as const;
  if (m.lenis) {
    m.lenis.scrollTo(target as never, options as never);
  } else if (typeof target === 'string') {
    document.querySelector(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (typeof target === 'number') {
    window.scrollTo({ top: target + offset, behavior: 'smooth' });
  } else {
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY + offset, behavior: 'smooth' });
  }
}

export { gsap, ScrollTrigger };
