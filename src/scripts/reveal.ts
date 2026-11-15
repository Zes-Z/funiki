import { getMotion } from './motion';

/**
 * Scroll-triggered reveal. Every [data-reveal] element fades/rises in once.
 * Optional inline custom properties: --reveal-y, --reveal-delay.
 */
export function initReveal() {
  const { reduced } = getMotion();
  const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));

  if (!elements.length) return;

  if (reduced || !('IntersectionObserver' in window)) {
    elements.forEach((el) => el.classList.add('is-in'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.06 }
  );

  elements.forEach((el) => observer.observe(el));
}

/**
 * Elements that appear after a dynamic insertion (sheet content) can be
 * revealed immediately through this helper.
 */
export function revealNow(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => el.classList.add('is-in'));
}
