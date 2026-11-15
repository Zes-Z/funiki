import { getMotion } from './motion';

/**
 * Frame 2 — auto-playing project marquee (helloabdullah) fused with a
 * draggable, momentum-driven rail (justinschueler).
 *
 * - loops seamlessly by translating exactly one measured "set" width
 * - slows to a stop on hover / keyboard focus, resumes when you leave
 * - pointer drag with inertia; horizontal wheel / trackpad supported
 * - hover plays the project's short preview video when it has one
 */
export function initProjectRail() {
  const marquee = document.querySelector<HTMLElement>('[data-work-marquee]');
  const track = document.querySelector<HTMLElement>('[data-work-track]');
  if (!marquee || !track) return;

  const sets = Array.from(track.querySelectorAll<HTMLElement>('.work-set'));
  if (sets.length < 2) return;

  const { gsap, lenis, reduced } = getMotion();
  const AUTO_SPEED = reduced ? 0 : 44; // px per second
  const HOVER_EASE = 260;

  let x = 0;
  let seam = 0;
  let factor = reduced ? 0 : 1;
  let targetFactor = reduced ? 0 : 1;

  let dragging = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let lastPointerX = 0;
  let lastPointerTime = 0;
  let velocity = 0; // px per ms
  let travel = 0;
  let visible = false;

  const measure = () => {
    const first = sets[0];
    const second = sets[1];
    if (!first || !second) return;
    seam = second.offsetLeft - first.offsetLeft;
    if (seam <= 0) seam = second.offsetWidth;
  };

  const wrap = () => {
    if (!seam) return;
    while (x <= -seam) x += seam;
    while (x > 0) x -= seam;
  };

  const apply = () => {
    track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
  };

  measure();
  apply();

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => {
      measure();
      wrap();
      apply();
    });
    ro.observe(track);
  }
  window.addEventListener('resize', measure);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      measure();
      wrap();
      apply();
    });
  }

  /* ------------------------------ loop ------------------------------ */

  const tick = (_time: number, deltaTime: number) => {
    // GSAP's ticker hands us deltaTime in milliseconds; clamp it so a tab that
    // was asleep cannot teleport the marquee.
    const dt = Math.min(64, Math.max(0, deltaTime || 16));

    factor += (targetFactor - factor) * (1 - Math.exp(-dt / HOVER_EASE));

    if (!dragging) {
      // decaying drag momentum
      if (Math.abs(velocity) > 0.001) {
        x += velocity * dt;
        velocity *= Math.exp(-dt / 240);
      }
      // the marquee itself (negative = moving left)
      if (visible) x -= (AUTO_SPEED * factor * dt) / 1000;
      wrap();
      apply();
    }
  };

  gsap.ticker.add(tick);

  if (!('IntersectionObserver' in window)) {
    visible = true;
  } else {
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = !!entry?.isIntersecting;
      },
      { rootMargin: '120px 0px' }
    );
    io.observe(marquee);
  }

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden;
  });

  /* ---------------------------- hover pause ---------------------------- */

  const pause = () => {
    
    targetFactor = 0;
  };
  const resume = () => {
    if (dragging) return;
    
    targetFactor = reduced ? 0 : 1;
  };

  marquee.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') pause();
  });
  marquee.addEventListener('pointerleave', () => {
    if (!dragging) resume();
  });
  marquee.addEventListener('focusin', () => pause());
  marquee.addEventListener('focusout', () => {
    if (!marquee.contains(document.activeElement)) resume();
  });

  /* ------------------------------- drag ------------------------------- */

  marquee.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    travel = 0;
    dragStartX = event.clientX;
    dragStartPos = x;
    lastPointerX = event.clientX;
    lastPointerTime = event.timeStamp || performance.now();
    velocity = 0;
    targetFactor = 0;
    marquee.classList.add('is-dragging');
  });

  window.addEventListener(
    'pointermove',
    (event) => {
      if (!dragging) return;
      const dx = event.clientX - dragStartX;
      travel = Math.max(travel, Math.abs(dx));
      x = dragStartPos + dx;
      const now = event.timeStamp || performance.now();
      const dt = Math.max(1, now - lastPointerTime);
      const instant = (event.clientX - lastPointerX) / dt;
      velocity = velocity * 0.65 + instant * 0.35;
      lastPointerX = event.clientX;
      lastPointerTime = now;
      wrap();
      apply();
    },
    { passive: true }
  );

  const endDrag = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    marquee.classList.remove('is-dragging');

    if (travel > 7) {
      velocity = Math.max(-3, Math.min(3, velocity));
      document.documentElement.dataset.railDragged = '1';
      window.setTimeout(() => {
        delete document.documentElement.dataset.railDragged;
      }, 30);
    } else {
      velocity = 0;
    }

    if (event.pointerType !== 'mouse' || !marquee.matches(':hover')) {
      
      targetFactor = reduced ? 0 : 1;
    } else {
      
      targetFactor = 0;
    }
  };

  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  marquee.addEventListener(
    'wheel',
    (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      x -= event.deltaX;
      wrap();
      apply();
    },
    { passive: false }
  );

  /* --------------------------- hover videos --------------------------- */

  marquee.querySelectorAll<HTMLElement>('[data-work-card]').forEach((card) => {
    const video = card.querySelector<HTMLVideoElement>('[data-work-video]');
    if (!video) return;

    const start = () => {
      if (!video.getAttribute('src')) {
        const src = video.dataset.src;
        if (!src) return;
        video.src = src;
        video.load();
      }
      const playing = video.play();
      if (playing) playing.then(() => video.classList.add('is-playing')).catch(() => {});
    };

    const stop = () => {
      video.pause();
      video.classList.remove('is-playing');
    };

    card.addEventListener('pointerenter', start);
    card.addEventListener('pointerleave', stop);
    card.addEventListener('focus', start);
    card.addEventListener('blur', stop);
  });

  /* --------------------------- scroll skew ---------------------------- */

  if (lenis) {
    const skewTo = gsap.quickTo(track, 'skewX', { duration: 0.5, ease: 'power2.out' });
    lenis.on('scroll', ({ velocity: scrollVelocity }: { velocity: number }) => {
      const amount = Math.max(-2.2, Math.min(2.2, scrollVelocity * 0.12));
      skewTo(amount);
    });
  }
}