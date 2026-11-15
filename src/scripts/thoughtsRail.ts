import { getMotion } from './motion';

/**
 * 随想区：自动平移 + 鼠标拖拽平移的横向相框列表，首尾无缝循环。
 * 悬停/聚焦暂停，拖动结束后带一点惯性，拖拽不会误触打开详情。
 */
export function initThoughtsRail() {
  const marquee = document.querySelector<HTMLElement>('[data-thoughts-marquee]');
  const track = document.querySelector<HTMLElement>('[data-thoughts-track]');
  if (!marquee || !track) return;

  const sets = Array.from(track.querySelectorAll<HTMLElement>('.thoughts-set'));
  if (sets.length < 2) return;

  const { gsap, reduced } = getMotion();

  if (reduced) {
    marquee.classList.add('is-static');
    return;
  }

  const AUTO_SPEED = 26; // px per second
  const EASE_MS = 200;

  let x = 0;
  let seam = 0;
  let factor = 1;
  let target = 1;

  let dragging = false;
  let dragStartX = 0;
  let dragStartPos = 0;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0; // px per ms
  let travel = 0;
  let visible = false;

  const measure = () => {
    const first = sets[0];
    const second = sets[1];
    if (!first || !second) return;
    const next = second.offsetLeft - first.offsetLeft;
    seam = next > 0 ? next : second.offsetWidth;
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

  const tick = (_time: number, deltaTime: number) => {
    const dt = Math.min(64, Math.max(0, deltaTime || 16));
    factor += (target - factor) * (1 - Math.exp(-dt / EASE_MS));

    if (dragging) return;

    if (Math.abs(velocity) > 0.001) {
      x += velocity * dt;
      velocity *= Math.exp(-dt / 240);
    }
    if (visible) x -= (AUTO_SPEED * factor * dt) / 1000;
    wrap();
    apply();
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

  const pause = () => {
    target = 0;
  };
  const resume = () => {
    if (dragging) return;
    target = 1;
  };

  marquee.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') pause();
  });
  marquee.addEventListener('pointerleave', () => {
    if (!dragging) resume();
  });
  marquee.addEventListener('focusin', pause);
  marquee.addEventListener('focusout', () => {
    if (!marquee.contains(document.activeElement)) resume();
  });

  marquee.addEventListener('dragstart', (event) => {
    event.preventDefault();
  });

  marquee.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    travel = 0;
    dragStartX = event.clientX;
    dragStartPos = x;
    lastX = event.clientX;
    lastTime = event.timeStamp || performance.now();
    velocity = 0;
    target = 0;
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
      const dt = Math.max(1, now - lastTime);
      velocity = velocity * 0.65 + ((event.clientX - lastX) / dt) * 0.35;
      lastX = event.clientX;
      lastTime = now;
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

    if (event.pointerType === 'mouse' && marquee.matches(':hover')) {
      target = 0;
    } else {
      target = 1;
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
}