import { getMotion, scrollToTarget } from './motion';
import siteConfig from '../../siteconfig';

/**
 * Frame 5 — personal extension + contact tail.
 * Papercut portrait reveal, big-type CTA with a magnetic email button,
 * copy-email interaction (click or "E"), and back-to-top.
 */
export function initTail() {
  const footer = document.querySelector<HTMLElement>('[data-footer]');
  const toast = document.querySelector<HTMLElement>('[data-toast]');
  const copyButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-copy-email]'));
  const { gsap, reduced } = getMotion();

  /* footer entrance */
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

  /* split the CTA headline for a hover flicker */
  const title = document.querySelector<HTMLElement>('[data-tail-title]');
  if (title) {
    const row = title.querySelector<HTMLElement>('.tail-cta__row');
    if (row) {
      const text = row.textContent ?? '';
      row.textContent = '';
      const chars: HTMLElement[] = [];
      for (const char of Array.from(text)) {
        const span = document.createElement('span');
        span.className = 'cta-char';
        span.textContent = char === ' ' ? '\u00A0' : char;
        row.appendChild(span);
        chars.push(span);
      }
      if (!reduced) {
        title.addEventListener('pointerenter', () => {
          gsap.to(chars, {
            yPercent: -9,
            duration: 0.5,
            ease: 'power3.out',
            stagger: { each: 0.035, from: 'start' },
            overwrite: true,
          });
          gsap.to(chars, {
            yPercent: 0,
            duration: 0.7,
            ease: 'power3.out',
            stagger: { each: 0.035, from: 'start' },
            delay: 0.32,
            overwrite: true,
          });
        });
      }
    }
  }

  /* magnetic email button */
  const magnet = document.querySelector<HTMLElement>('[data-magnetic]');
  if (magnet && !reduced && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const xTo = gsap.quickTo(magnet, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(magnet, 'y', { duration: 0.6, ease: 'power3.out' });

    magnet.addEventListener('pointermove', (event) => {
      const rect = magnet.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      xTo(nx * 18);
      yTo(ny * 14);
    });
    magnet.addEventListener('pointerleave', () => {
      xTo(0);
      yTo(0);
    });
  }

  /* ---------------------------- copy email ---------------------------- */

  let toastTimer = 0;

  const showToast = (message = '邮箱已复制到剪贴板') => {
    if (!toast) return;
    toast.textContent = message;
    window.clearTimeout(toastTimer);
    gsap.killTweensOf(toast);
    gsap.fromTo(
      toast,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power3.out' }
    );
    toastTimer = window.setTimeout(() => {
      gsap.to(toast, { autoAlpha: 0, y: 10, duration: 0.35, ease: 'power2.in' });
    }, 2200);
  };

  const copyEmail = async () => {
    const email = siteConfig.identity.email;
    try {
      await navigator.clipboard.writeText(email);
      showToast();
    } catch {
      const helper = document.createElement('textarea');
      helper.value = email;
      helper.setAttribute('readonly', '');
      helper.style.position = 'fixed';
      helper.style.opacity = '0';
      document.body.appendChild(helper);
      helper.select();
      try {
        const legacy = (
          document as unknown as { execCommand?: (command: string) => boolean }
        ).execCommand;
        if (!legacy?.('copy')) throw new Error('copy unavailable');
        showToast();
      } catch {
        showToast('复制失败，请手动选择邮箱');
      }
      helper.remove();
    }
  };

  copyButtons.forEach((button) => button.addEventListener('click', copyEmail));

  document.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    const root = document.documentElement;
    if (root.classList.contains('is-sheet-open') || root.classList.contains('is-lightbox-open')) return;
    if (event.key.toLowerCase() === 'e') {
      void copyEmail();
    }
  });

  /* --------------------------- back to top --------------------------- */

  document.querySelectorAll('[data-back-to-top]').forEach((button) => {
    button.addEventListener('click', () => scrollToTarget(0));
  });
}