import { getMotion, scrollToTarget } from './motion';

/**
 * Footer reveal + back-to-top.
 */
export function initTail() {
  const footer = document.querySelector<HTMLElement>('[data-footer]');
  const { reduced } = getMotion();

  if (footer) {
    if (reduced || !('IntersectionObserver' in window)) {
      footer.classList.add('is-signed');
    } else {
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            footer.classList.add('is-signed');
            io.disconnect();
          }
        },
        { rootMargin: '0px 0px -22% 0px', threshold: 0.05 }
      );
      io.observe(footer);
    }
  }

  document.querySelectorAll('[data-back-to-top]').forEach((button) => {
    button.addEventListener('click', () => scrollToTarget(0));
  });
}
