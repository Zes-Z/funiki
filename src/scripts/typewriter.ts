import { getMotion } from './motion';
import siteConfig from '../../siteconfig';

/**
 * Keyboard typewriter for the motto list.
 * Type the sentence → hold 3s → delete with the caret → 1s → next sentence.
 */
export function initTypewriter() {
  const el = document.querySelector<HTMLElement>('[data-typewriter-text]');
  if (!el) return;

  const { reduced } = getMotion();
  const { lines, typeSpeed, deleteSpeed, hold, gap } = siteConfig.hero.motto;

  if (reduced) {
    el.textContent = lines[0] ?? '';
    return;
  }

  let index = 0;
  let cancelled = false;
  let paused = false;

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const started = performance.now();
      const tick = () => {
        if (cancelled) return resolve();
        if (paused) {
          const waited = performance.now() - started;
          window.setTimeout(tick, Math.max(60, ms - waited));
          return;
        }
        resolve();
      };
      window.setTimeout(tick, ms);
    });

  const writeChars = async (chars: string[]) => {
    for (const char of chars) {
      if (cancelled) return;
      while (paused) await sleep(120);
      el.textContent = (el.textContent ?? '') + char;
      await sleep(typeSpeed + Math.random() * 45);
    }
  };

  const removeChars = async (chars: string[]) => {
    for (let i = chars.length; i > 0; i -= 1) {
      if (cancelled) return;
      while (paused) await sleep(120);
      el.textContent = chars.slice(0, i - 1).join('');
      await sleep(deleteSpeed);
    }
  };

  const run = async () => {
    while (!cancelled) {
      const line = lines[index % lines.length] ?? '';
      const chars = Array.from(line);
      el.textContent = '';
      await writeChars(chars);
      if (cancelled) return;
      await sleep(hold);
      if (cancelled) return;
      await removeChars(chars);
      if (cancelled) return;
      await sleep(gap);
      index += 1;
    }
  };

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      ([entry]) => {
        paused = !entry?.isIntersecting;
      },
      { threshold: 0.15 }
    );
    io.observe(el);
  }

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
  });

  window.addEventListener('pagehide', () => {
    cancelled = true;
  });

  const start = () => void run();

  if (document.documentElement.classList.contains('is-intro-done')) {
    start();
  } else {
    window.addEventListener('funiki:intro-done', start, { once: true });
  }
}
