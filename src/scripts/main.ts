import { initMotion, ScrollTrigger, scrollToTarget } from './motion';
import { initReveal } from './reveal';
import { initCursor } from './cursor';
import { initIntro } from './intro';
import { initClock } from './clock';
import { initTypewriter } from './typewriter';
import { initHero } from './hero';
import { initDock } from './dock';
import { initSheets } from './sheet';
import { initProjectRail } from './rail';
import { initLifeWall } from './lifeWall';
import { initDepthField } from './depthField';
import { initThoughtsRail } from './thoughtsRail';
import { initTail } from './tail';

declare global {
  interface Window {
    funiki?: {
      scrollToTarget: typeof scrollToTarget;
      lenis: unknown;
      refresh: () => void;
    };
  }
}

const motion = initMotion();

window.funiki = {
  scrollToTarget,
  lenis: motion.lenis,
  refresh: () => ScrollTrigger.refresh(),
};

initCursor();
initReveal();
initClock();
initTypewriter();
initHero();
initDock();
initSheets();
initProjectRail();
initLifeWall();
initDepthField();
initThoughtsRail();
initTail();

const introDone = initIntro();
introDone.then(() => {
  window.dispatchEvent(new CustomEvent('funiki:intro-done'));
  requestAnimationFrame(() => ScrollTrigger.refresh());
});

window.addEventListener('load', () => {
  ScrollTrigger.refresh();
});

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    ScrollTrigger.refresh();
  });
}

// Recalculate all scroll-linked measurements when the browser settles.
let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => ScrollTrigger.refresh(), 200);
});