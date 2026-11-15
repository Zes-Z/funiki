/**
 * Frame 3 — the life pictures, as a depth field.
 *
 * A faithful port of the justinschueler.com "Play" canvas
 * (/tmp/ref/spec/snippets/justin/canvas.js, documented in justin.md §6.6):
 * every photo floats in one viewport-wide field at its own depth, page scroll
 * flies the camera straight through it, one piece can be pulled into focus in
 * place, the pointer magnetically leans nearby pieces, and dragging pans the
 * field with inertia.
 *
 * The justified wall in the Astro markup stays the no-JS / reduced-motion
 * fallback; this script only ever adds to it, never replaces it destructively.
 * Nothing here paints a canvas: every frame writes only transform / opacity /
 * (stepped) filter on a dozen DOM nodes.
 */

/* ------------------------------------------------------------------ */
/* Tuning — the reference constants, tuned for the 20-tile field.      */
/* SPACING x tiles / SCROLL_RATE ~= 3 viewports of page scroll.        */
/* ------------------------------------------------------------------ */
const PERSPECTIVE = 900; // px, how fast things shrink with depth
const SPACING = 300; // px of depth between pieces
const VIEW_DEPTH = 2600; // px, how far ahead pieces are visible
const FOCAL = 700; // px, the depth that is sharp
const SPAN = 0.9; // field width in viewports (edge pieces are clamped inside)
const MAX_BLUR = 8; // px
const SHARP_BAND = 380; // px either side of FOCAL that stays sharp
const BLUR_FALLOFF = 160; // px of depth per px of blur beyond the band
const SCROLL_RATE = 1.9; // px of depth per px of page scroll
const MAGNET_RADIUS = 220; // px from a piece's edge where the pointer pulls
const MAGNET_PULL = 0.12; // share of the distance a piece leans
const MAGNET_MAX = 22; // px, the most a piece leans
const MAGNET_EASE = 420; // ms, slow on purpose: it drifts, it does not snap
const COPIES = 1; // unique tiles only; the twin logic below still works for >1
const LEAD = VIEW_DEPTH * 0.35; // first pieces wait a little way ahead
const FOCAL_SCALE = PERSPECTIVE / (PERSPECTIVE + FOCAL);

/** Blur only moves through fixed steps, with slack: each repaint is dear. */
const BLUR_STEPS: readonly number[] = [0, 1, 2, 3.5, 5.5, 8, 12, 15, 19];

const MAX_DRIFT_X = 6; // px/s — the field never quite stops moving
const MAX_DRIFT_Y = 3.5; // px/s

/* ------------------------------------------------------------------ */
/* Small maths helpers                                                */
/* ------------------------------------------------------------------ */

function blurStep(current: number, blur: number): number {
  let i = Math.max(0, BLUR_STEPS.indexOf(current));
  while (
    i < BLUR_STEPS.length - 1 &&
    blur > BLUR_STEPS[i] + (BLUR_STEPS[i + 1] - BLUR_STEPS[i]) * 0.7
  ) {
    i++;
  }
  while (i > 0 && blur < BLUR_STEPS[i] - (BLUR_STEPS[i] - BLUR_STEPS[i - 1]) * 0.7) {
    i--;
  }
  return BLUR_STEPS[i];
}

/** Wraps to [-0.5, 0.5): the field repeats seamlessly at its edges. */
function wrap(value: number): number {
  return value - Math.floor(value + 0.5);
}

function mod(value: number, length: number): number {
  return ((value % length) + length) % length;
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Deterministic scatter, so the field looks the same on every visit. */
function random(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type FunikiWindow = Window & { funiki?: { refresh?: () => void } };

/** Ask the section's ScrollTriggers to re-measure after the runway changes. */
function refreshScrollTriggers(): void {
  try {
    (window as FunikiWindow).funiki?.refresh?.();
  } catch {
    /* not critical */
  }
}

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface Pose {
  x: number;
  y: number;
  s: number;
  d: number;
  opacity: number;
  blur: number;
}

interface TileInfo {
  index: number;
  ratio: number;
  img: HTMLImageElement;
  full: string | null;
  videoSrc: string | null;
  type: string;
  caption: string;
  taken: string;
  label: string;
}

interface FieldItem {
  el: HTMLButtonElement;
  img: HTMLImageElement;
  video: HTMLVideoElement | null;
  index: number;
  ratio: number;
  full: string | null;
  videoSrc: string | null;
  type: string;
  caption: string;
  taken: string;
  label: string;
  /* R2 low-discrepancy scatter in [0,1) */
  u: number;
  v: number;
  /* start depth and per-piece scale */
  d0: number;
  size: number;
  w: number;
  h: number;
  /* per-frame state */
  hover: number;
  mx: number;
  my: number;
  blur: number;
  hidden: boolean | null;
  z: number;
  pose: Pose | null;
  rank: number;
  score: number;
  isLead: boolean;
  twin: number;
  enlarged: boolean;
}

interface View {
  w: number;
  h: number;
  small: boolean;
}

interface Camera {
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
}

interface DragPointer {
  id: number;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  time: number;
  moved: boolean;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                        */
/* ------------------------------------------------------------------ */

/**
 * Progressive enhancement: builds the depth field over the wall when motion
 * is allowed and the section is near. Never throws, never breaks the fallback.
 */
export function initDepthField(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let track: HTMLElement | null = null;

  try {
    if (prefersReducedMotion()) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const section = document.querySelector<HTMLElement>('[data-life]');
    if (!section) return;
    const wall = section.querySelector<HTMLElement>('.play-wall');
    if (!wall) return;

    const tiles = Array.from(wall.querySelectorAll<HTMLElement>('.play-tile'));
    if (!tiles.length) return;

    /** Undo a half-built field, keeping the wall intact. */
    const teardown = () => {
      if (track) {
        track.remove();
        track = null;
      }
      section.querySelector('.depth-track')?.remove();
      section.classList.remove('is-canvas');
    };

    const start = () => {
      if (track) return;
      try {
        track = create(section, wall, tiles);
        refreshScrollTriggers();
      } catch (error) {
        teardown();
        console.warn('[depth-field] could not build the field', error);
      }
    };

    // The field is heavy (14 more images); the wall covers the reader until
    // the section is close, exactly like the reference site does.
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        near.disconnect();
        start();
      },
      { rootMargin: '150% 0px' }
    );
    near.observe(section);

    // A deep link or a restored scroll position may already be on the section.
    const box = section.getBoundingClientRect();
    if (box.top < window.innerHeight * 2.5 && box.bottom > -window.innerHeight) {
      near.disconnect();
      start();
    }
  } catch (error) {
    console.warn('[depth-field] could not start', error);
  }
}

/* ------------------------------------------------------------------ */
/* Build                                                              */
/* ------------------------------------------------------------------ */

function create(section: HTMLElement, wall: HTMLElement, tiles: HTMLElement[]): HTMLElement {
  if (!wall.parentElement) {
    throw new Error('depth-field needs a parent for its track');
  }

  const track = document.createElement('div');
  track.className = 'depth-track';
  track.dataset.depthTrack = '';

  const stage = document.createElement('div');
  stage.className = 'depth-stage';
  stage.dataset.depthStage = '';

  const field = document.createElement('div');
  field.className = 'depth-field';
  field.dataset.depthField = '';

  /* --- focus panel: caption, taken, "open the original" --- */
  const panel = document.createElement('aside');
  panel.className = 'depth-panel';
  panel.dataset.depthPanel = '';
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-atomic', 'true');

  const titleEl = document.createElement('p');
  titleEl.className = 'depth-panel__title';

  const metaEl = document.createElement('p');
  metaEl.className = 'depth-panel__meta';

  const controls = document.createElement('div');
  controls.className = 'depth-panel__controls';

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'pill depth-panel__view';
  viewBtn.dataset.depthView = '';
  viewBtn.textContent = '查看原图';
  viewBtn.hidden = true;

  controls.appendChild(viewBtn);
  panel.append(titleEl, metaEl, controls);

  /* --- the same round closer as the reference, bottom centre --- */
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'depth-close';
  closeBtn.dataset.depthClose = '';
  closeBtn.setAttribute('aria-label', '关闭');
  const closeGlyph = document.createElement('span');
  closeGlyph.setAttribute('aria-hidden', 'true');
  closeBtn.appendChild(closeGlyph);

  /* --- hint + a polite live region (the panel itself is a live region too) --- */
  const hint = document.createElement('p');
  hint.className = 'depth-hint';
  hint.dataset.depthHint = '';
  const hintArrow = document.createElement('span');
  hintArrow.className = 'depth-hint__arrow';
  hintArrow.setAttribute('aria-hidden', 'true');
  hintArrow.textContent = '↓';
  hint.append(hintArrow, document.createTextNode('向下滚动穿越 · 点击查看'));

  const liveEl = document.createElement('p');
  liveEl.className = 'depth-sr';
  liveEl.setAttribute('aria-live', 'polite');
  liveEl.setAttribute('aria-atomic', 'true');

  stage.append(field, panel, closeBtn, hint, liveEl);
  track.appendChild(stage);
  wall.after(track);

  /* --- view / camera state --- */
  const view: View = { w: 0, h: 0, small: false };
  const cam: Camera = { x: 0, y: 0, vx: 0, vy: 0, z: 0 };
  const items: FieldItem[] = [];
  const itemByEl = new Map<HTMLElement, FieldItem>();
  const itemByIndex = new Map<number, FieldItem>();
  const indexOrder: number[] = [];

  let focused: FieldItem | null = null;
  let focusedIndex = -1;
  let focusAmount = 0;
  let focusTarget = 0;
  let focusScrollY: number | null = null;
  let hovered: FieldItem | null = null;
  let mouse: { x: number; y: number } | null = null;
  let visible = false;
  let frame = 0;
  let lastTime = 0;
  let lastMotion = 0;
  let elapsed = 0;
  let interacted = false;
  let dragging = false;
  let dragPointer: DragPointer | null = null;
  let suppressClickUntil = 0;
  let trackHeight = 0;

  /* --- items --- */

  const readTile = (figure: HTMLElement, index: number): TileInfo | null => {
    const media = figure.querySelector<HTMLElement>('.play-media');
    const img = media?.querySelector<HTMLImageElement>('img');
    if (!img) return null;

    const ratioAttr = Number.parseFloat(getComputedStyle(figure).getPropertyValue('--r'));
    const ratio =
      Number.isFinite(ratioAttr) && ratioAttr > 0
        ? ratioAttr
        : img.naturalWidth > 0 && img.naturalHeight > 0
          ? img.naturalWidth / img.naturalHeight
          : 1;

    const detail = figure.querySelector<HTMLTemplateElement>('template.play-detail');
    const detailImg = detail?.content.querySelector('img') ?? null;
    const detailVideo = detail?.content.querySelector('video') ?? null;
    const detailCaption = detail?.content.querySelector('.lightbox-title')?.textContent ?? '';

    const full =
      figure.dataset.full?.trim() ||
      detailImg?.getAttribute('src') ||
      img.getAttribute('src') ||
      null;
    const videoSrc =
      figure.dataset.video?.trim() || detailVideo?.getAttribute('src')?.trim() || null;
    const caption =
      figure.dataset.caption?.trim() ||
      figure.querySelector('.play-caption')?.textContent?.trim() ||
      detailCaption.trim();
    const taken = figure.dataset.taken?.trim() || '';
    const type = figure.dataset.type || 'photo';
    const openBtn = figure.querySelector('[data-life-open]');
    const label = openBtn?.getAttribute('aria-label') || (caption ? '查看大图：' + caption : '查看图片');

    return { index, ratio, img, full, videoSrc, type, caption, taken, label };
  };

  tiles.forEach((figure, index) => {
    try {
      const info = readTile(figure, index);
      if (info) buildCopies(info);
    } catch (error) {
      /* A malformed tile must never take the field down: skip it and let the
         wall fallback carry it. */
      console.warn('[depth-field] skipped tile ' + index, error);
    }
  });

  function buildCopies(info: TileInfo): void {
    const { ratio, index } = info;
    for (let copy = 0; copy < COPIES; copy++) {
      const seed = index * 7.13 + copy * 101.7 + 1;

      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'depth-item';
      el.dataset.depthItem = '';
      el.dataset.index = String(index);
      el.style.setProperty('--r', ratio.toFixed(4));
      if (copy > 0) {
        el.tabIndex = -1;
        el.setAttribute('aria-hidden', 'true');
      } else {
        el.setAttribute('aria-label', info.label);
      }

      const img = info.img.cloneNode(false) as HTMLImageElement;
      img.alt = '';
      img.loading = index < 3 ? 'eager' : 'lazy';
      img.decoding = 'async';
      el.appendChild(img);

      if (info.type !== 'photo') {
        const badge = document.createElement('span');
        badge.className = 'depth-item__badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.textContent = info.type === 'live' ? 'LIVE' : 'VIDEO';
        el.appendChild(badge);
      }

      field.appendChild(el);

      const item: FieldItem = {
        el,
        img,
        video: null,
        index,
        ratio,
        full: info.full,
        videoSrc: info.videoSrc,
        type: info.type,
        caption: info.caption,
        taken: info.taken,
        label: info.label,
        /* R2 low-discrepancy steps spread pieces evenly instead of clumping.
           Copies sit half a field apart, so they are never on screen together. */
        u: wrap(index * 0.7548777 + copy / COPIES + random(seed) * 0.12),
        v: wrap(index * 0.5698403 + copy / COPIES + random(seed + 3) * 0.12),
        d0: LEAD + index * SPACING + random(seed + 5) * 120,
        /* Some pieces larger, some smaller, so the field never reads as a grid. */
        size: 0.7 + random(seed + 9) * 0.65,
        w: 0,
        h: 0,
        hover: 0,
        mx: 0,
        my: 0,
        blur: -1,
        hidden: null,
        z: -1,
        pose: null,
        rank: 0,
        score: 0,
        isLead: true,
        twin: 1,
        enlarged: false,
      };

      items.push(item);
      itemByEl.set(el, item);
      if (!itemByIndex.has(index)) {
        itemByIndex.set(index, item);
        indexOrder.push(index);
      }
    }
  }

  if (!items.length) {
    /* Every tile was malformed: keep the wall, do not hide it behind an
       empty field. The caller tears the half-built track down. */
    throw new Error('no usable tiles');
  }

  const videoItems = items.filter((item) => item.videoSrc !== null);

  /* --- depth: where a piece sits along the dive --- */

  const depthLoop = LEAD + tiles.length * SPACING + VIEW_DEPTH;

  const poseOf = (item: FieldItem): Pose => {
    const depth = mod(item.d0 - cam.z, depthLoop);
    const s = PERSPECTIVE / (PERSPECTIVE + depth);
    /* Close things spread outward, so diving feels like flying through. */
    const spread = Math.pow(s / FOCAL_SCALE, 0.6);
    const spanX = view.w * SPAN;
    const spanY = view.h * SPAN;
    const x = wrap(item.u - (cam.x * s) / spanX) * spanX * spread;
    const y = wrap(item.v - (cam.y * s) / spanY) * spanY * spread;
    const opacity =
      smooth(40, 260, depth) * (1 - smooth(VIEW_DEPTH - 700, VIEW_DEPTH - 80, depth));
    const blur = Math.min(
      MAX_BLUR,
      Math.max(0, Math.abs(depth - FOCAL) - SHARP_BAND) / BLUR_FALLOFF
    );
    return { x, y, s, d: depth, opacity, blur };
  };

  const onScreen = (pose: Pose, item: FieldItem): boolean =>
    Math.abs(pose.x) - (item.w * pose.s) / 2 < view.w / 2 &&
    Math.abs(pose.y) - (item.h * pose.s) / 2 < view.h / 2;

  const focusPose = (item: FieldItem): Pose => {
    /* The caption/actions card sits at the bottom. Fit the focused image into
       the space above it, so the card never covers the bottom of the photo —
       including on shorter laptop windows. */
    const panelReserve = view.small ? 190 : 182;
    const topPad = view.small ? 20 : 34;
    const safeBottom = view.h - panelReserve;
    const availableH = Math.max(160, safeBottom - topPad - 14);
    const maxW = view.w * (view.small ? 0.9 : 0.84);
    const maxH = Math.min(view.h * (view.small ? 0.55 : 0.64), availableH);
    const w = Math.min(maxW, maxH * item.ratio);
    const centerY = (topPad + safeBottom) / 2;
    return {
      x: 0,
      y: centerY - view.h / 2,
      s: w / item.w,
      d: FOCAL,
      opacity: 1,
      blur: 0,
    };
  };

  /* --- video: one clip at a time, focused or sharpest --- */

  const ensureVideo = (item: FieldItem): HTMLVideoElement | null => {
    if (item.video) return item.video;
    if (!item.videoSrc) return null;
    const video = document.createElement('video');
    video.src = item.videoSrc;
    if (item.full) video.poster = item.full;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-hidden', 'true');
    item.el.appendChild(video);
    item.video = video;
    return video;
  };

  const syncVideo = (item: FieldItem, shouldPlay: boolean) => {
    if (shouldPlay) {
      const video = ensureVideo(item);
      if (!video) return;
      item.el.classList.add('is-playing');
      if (video.paused) {
        const playing = video.play();
        if (playing) playing.catch(() => {});
      }
      return;
    }
    item.el.classList.remove('is-playing');
    if (item.video && !item.video.paused) item.video.pause();
  };

  const pauseVideos = () => {
    videoItems.forEach((item) => syncVideo(item, false));
  };

  const syncVideos = (candidate: FieldItem | null) => {
    const settled = performance.now() - lastMotion > 400;
    const playing =
      focused && focused.videoSrc !== null ? focused : settled ? candidate : null;
    const shouldPlay = visible && !document.hidden ? playing : null;
    videoItems.forEach((item) => syncVideo(item, item === shouldPlay));
  };

  /* --- focus panel --- */

  const updatePanel = (item: FieldItem) => {
    titleEl.textContent = item.caption || item.label;
    metaEl.textContent =
      item.taken || (item.type === 'live' ? 'Live Photo' : item.type === 'video' ? 'Video' : '');
    metaEl.hidden = metaEl.textContent === '';
    const trigger = tiles[item.index]?.querySelector<HTMLElement>('[data-life-open]') ?? null;
    viewBtn.hidden = !trigger;
    liveEl.textContent = item.caption ? '已聚焦：' + item.caption : '已聚焦一张图片';
  };

  const focus = (index: number, instant = false, target?: FieldItem) => {
    /* Focus the copy the visitor actually clicked, not a different wrapped
       twin that may be sitting higher up the field. */
    const item = target && target.index === index ? target : bestCopy(index);
    if (!item) return;
    if (focused && focused !== item) clearFocusElement();
    focused = item;
    focusedIndex = index;
    focusTarget = 1;
    if (instant) focusAmount = 1;
    focusScrollY = null;
    stage.classList.add('has-focus');
    item.el.classList.add('is-focused');
    item.el.setAttribute('aria-current', 'true');
    enlarge(item);
    updatePanel(item);
    panel.classList.add('is-open');
    dismissHint();
    request();
  };

  const clearFocusElement = () => {
    if (!focused) return;
    focused.el.classList.remove('is-focused');
    focused.el.removeAttribute('aria-current');
  };

  const release = () => {
    focusTarget = 0;
    stage.classList.remove('has-focus');
    panel.classList.remove('is-open');
    liveEl.textContent = '已退出聚焦';
    /* Keep the panel close button from stranding keyboard focus. */
    const active = document.activeElement;
    if (active instanceof HTMLElement && panel.contains(active)) {
      focused?.el.focus({ preventScroll: true });
    }
    request();
  };

  const select = (index: number, target?: FieldItem) => {
    if (focusedIndex === index && focusTarget === 1) release();
    else focus(index, false, target);
  };

  const bestCopy = (index: number): FieldItem | null => {
    let best: FieldItem | null = null;
    let bestScore = -1;
    items.forEach((item) => {
      if (item.index !== index) return;
      const pose = poseOf(item);
      const on = Math.abs(pose.x) < view.w / 2 && Math.abs(pose.y) < view.h / 2 ? 1 : 0.2;
      const score = pose.opacity * pose.s * on;
      if (score > bestScore) {
        best = item;
        bestScore = score;
      }
    });
    return best;
  };

  const stepIndex = (from: number, direction: number): number | null => {
    if (!indexOrder.length) return null;
    const position = indexOrder.indexOf(from);
    if (position === -1) {
      return indexOrder[direction > 0 ? 0 : indexOrder.length - 1] ?? null;
    }
    const next = (position + direction + indexOrder.length) % indexOrder.length;
    return indexOrder[next] ?? null;
  };

  /** Swap the thumbnail for the full file once it has decoded. */
  const enlarge = (item: FieldItem) => {
    if (item.enlarged || !item.full) return;
    const src = item.full;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    const swap = () => {
      if (focused !== item) return;
      item.img.removeAttribute('srcset');
      item.img.removeAttribute('sizes');
      item.img.src = src;
      item.enlarged = true;
    };
    const decoded = image.decode();
    if (decoded && typeof decoded.then === 'function') {
      decoded.then(swap, () => {});
    } else {
      swap();
    }
  };

  /* --- hint --- */

  const dismissHint = () => {
    if (interacted) return;
    interacted = true;
    hint.classList.add('is-hidden');
  };

  /* --- layout / measurement --- */

  const measure = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === view.w && h === view.h) return;
    view.w = w;
    view.h = h;
    view.small = w < 720;

    /* Long enough to fly past every piece once, then a little slack. */
    // Stop the camera while the last few pieces are still in focus instead of
    // flying past them into an empty viewport: z_end = last piece at ~FOCAL.
    const lastDepth = LEAD + (tiles.length - 1) * SPACING + 120;
    // Unpin while the final four pieces are still in view (roughly FOCAL..VIEW
    // depth), so the dive ends on photographs instead of an empty stage.
    const runway = Math.max(VIEW_DEPTH, lastDepth - 1250);
    const nextHeight = Math.round(h + runway / SCROLL_RATE);
    track.style.height = String(nextHeight) + 'px';
    if (trackHeight && nextHeight !== trackHeight) refreshScrollTriggers();
    trackHeight = nextHeight;

    /* Size by area, so wide and tall pieces carry the same visual weight. */
    const base = (Math.min(w, h) * (view.small ? 0.5 : 0.36)) / FOCAL_SCALE;
    items.forEach((item) => {
      const iw = base * item.size * Math.sqrt(item.ratio);
      const ih = (base * item.size) / Math.sqrt(item.ratio);
      item.w = iw;
      item.h = ih;
      item.el.style.width = String(iw) + 'px';
      item.el.style.height = String(ih) + 'px';
      item.el.style.marginLeft = String(-iw / 2) + 'px';
      item.el.style.marginTop = String(-ih / 2) + 'px';
    });
    request();
  };

  /* --- render --- */

  const stack = { back: 0, front: items.length };

  const render = (dt: number): boolean => {
    let moving = false;
    elapsed += dt;

    /* Drag inertia, then a slow drift so the field never feels frozen. */
    if (!dragging) {
      cam.x += cam.vx * dt;
      cam.y += cam.vy * dt;
      const friction = Math.pow(0.0025, dt / 1000);
      cam.vx *= friction;
      cam.vy *= friction;
      if (Math.abs(cam.vx) + Math.abs(cam.vy) > 0.004) moving = true;
      if (Math.abs(cam.vx) + Math.abs(cam.vy) > 0.05) lastMotion = performance.now();
    }
    cam.x += Math.cos(elapsed / 6200) * MAX_DRIFT_X * 0.001 * dt;
    cam.y += Math.sin(elapsed / 9300) * MAX_DRIFT_Y * 0.001 * dt;
    moving = true;

    /* Exits settle a little faster than entrances. */
    const ease = 1 - Math.exp(-dt / (focusTarget ? 115 : 90));
    focusAmount += (focusTarget - focusAmount) * ease;
    if (Math.abs(focusTarget - focusAmount) < 0.001) focusAmount = focusTarget;
    else moving = true;
    if (focusTarget === 0 && focusAmount === 0 && focused) {
      clearFocusElement();
      focused = null;
      focusedIndex = -1;
    }

    /* Stacking follows depth; z-index only changes when a piece wraps the
       depth loop, so it goes behind (or in front of) the rest exactly once. */
    items.forEach((item) => {
      const pose = poseOf(item);
      if (item.pose && Math.abs(pose.d - item.pose.d) > depthLoop / 2) {
        if (pose.d > item.pose.d) item.rank = --stack.back;
        else item.rank = ++stack.front;
      }
      item.pose = pose;
    });

    /* One copy of a piece on screen at a time: the most prominent copy stays,
       its twins fade out. Copies=1 keeps this as the identity path. */
    const lead = new Map<number, FieldItem>();
    items.forEach((item) => {
      if (!item.pose) return;
      item.score = item.pose.opacity * item.pose.s * (onScreen(item.pose, item) ? 1 : 0);
      const current = lead.get(item.index);
      if (!current) {
        lead.set(item.index, item);
        return;
      }
      const margin = item.isLead ? 1 / 1.25 : current.isLead ? 1.25 : 1;
      if (item.score > current.score * margin) lead.set(item.index, item);
    });
    items.forEach((item) => {
      item.isLead = lead.get(item.index) === item || item === focused;
      const goal = item.isLead ? 1 : 0;
      if (item.twin !== goal) {
        item.twin += (goal - item.twin) * (1 - Math.exp(-dt / 120));
        if (Math.abs(goal - item.twin) < 0.01) item.twin = goal;
        else moving = true;
      }
    });

    /* The stage centre, so the pointer can be set against the pieces' poses. */
    let centre: { x: number; y: number } | null = null;
    if (mouse) {
      const box = stage.getBoundingClientRect();
      centre = {
        x: mouse.x - (box.left + box.width / 2),
        y: mouse.y - (box.top + box.height / 2),
      };
    }

    /* A holder, so the closure below can hand the winner back to the loop. */
    const sharp: { best: { item: FieldItem; s: number } | null } = { best: null };

    items.forEach((item) => {
      if (!item.pose) return;
      const pose = item.pose;
      let opacity = pose.opacity;
      let x = pose.x;
      let y = pose.y;
      let s = pose.s;
      let z = item.rank;
      let blur = pose.blur;

      /* Hover eases a piece out of the blur and a touch forward. */
      const hoverGoal = item === hovered && !focused ? 1 : 0;
      if (item.hover !== hoverGoal) {
        item.hover += (hoverGoal - item.hover) * (1 - Math.exp(-dt / 140));
        if (Math.abs(hoverGoal - item.hover) < 0.01) item.hover = hoverGoal;
        else moving = true;
      }
      blur *= 1 - item.hover;
      s *= 1 + 0.04 * item.hover;

      /* Magnet: near the pointer a piece leans a little toward it, more the
         closer it is, and drifts back once the pointer moves on. */
      let pullX = 0;
      let pullY = 0;
      if (centre && !focused && !dragging) {
        const dx = centre.x - x;
        const dy = centre.y - y;
        const edge = Math.hypot(
          Math.max(0, Math.abs(dx) - (item.w * s) / 2),
          Math.max(0, Math.abs(dy) - (item.h * s) / 2)
        );
        const strength = (1 - smooth(0, MAGNET_RADIUS, edge)) * MAGNET_PULL;
        pullX = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dx * strength));
        pullY = Math.max(-MAGNET_MAX, Math.min(MAGNET_MAX, dy * strength));
      }
      const magnetEase = 1 - Math.exp(-dt / MAGNET_EASE);
      item.mx += (pullX - item.mx) * magnetEase;
      item.my += (pullY - item.my) * magnetEase;
      if (Math.abs(pullX - item.mx) + Math.abs(pullY - item.my) > 0.1) moving = true;
      x += item.mx;
      y += item.my;
      opacity *= item.twin;
      opacity += (1 - opacity) * item.hover * 0.6;

      if (focused) {
        if (item === focused) {
          const target = focusPose(item);
          x += (target.x - x) * focusAmount;
          y += (target.y - y) * focusAmount;
          s += (target.s - s) * focusAmount;
          blur *= 1 - focusAmount;
          opacity += (1 - opacity) * focusAmount;
          z = stack.front + 10;
        } else {
          /* The rest sinks well back: smaller, faint, and straight to the
             deepest blur step, so each piece repaints once, not per step. */
          s *= 1 - 0.3 * focusAmount;
          if (focusAmount > 0.1) blur = BLUR_STEPS[BLUR_STEPS.length - 1];
          opacity *= 1 - 0.93 * focusAmount;
        }
      }

      /* Pieces outside the screen (or faded out) are hidden and left alone. */
      const hidden =
        opacity < 0.01 ||
        Math.abs(x) - (item.w * s) / 2 > view.w / 2 + 24 ||
        Math.abs(y) - (item.h * s) / 2 > view.h * 1.5;
      if (hidden !== item.hidden) {
        item.el.style.visibility = hidden ? 'hidden' : '';
        item.hidden = hidden;
      }
      if (hidden) return;

      item.el.style.transform =
        'translate3d(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px, 0) scale(' + s.toFixed(4) + ')';
      item.el.style.opacity = opacity.toFixed(3);

      const step = blurStep(item.blur, blur);
      if (step !== item.blur) {
        item.el.style.filter = step < 0.5 ? 'none' : 'blur(' + step + 'px)';
        item.blur = step;
      }
      if (z !== item.z) {
        item.el.style.zIndex = String(z);
        item.z = z;
      }

      if (item.videoSrc && step <= 1.5 && opacity > 0.4 && (!sharp.best || s > sharp.best.s)) {
        sharp.best = { item, s };
      }
    });

    syncVideos(sharp.best ? sharp.best.item : null);
    return moving;
  };

  /* --- the loop --- */

  const loop = (time: number) => {
    frame = 0;
    const dt = Math.min(48, lastTime ? time - lastTime : 16);
    lastTime = time;
    if (!visible || document.hidden) return;
    if (render(dt)) request();
  };

  const request = () => {
    if (frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(loop);
  };

  /* --- scroll drives the dive --- */

  const onScroll = () => {
    if (!visible) return;
    const rect = track.getBoundingClientRect();
    cam.z = Math.max(0, -rect.top) * SCROLL_RATE;
    lastMotion = performance.now();
    /* Scrolling releases the focus; the first scroll after focusing only sets
       the reference point (a deep link may land mid-dive). */
    if (focused && focusTarget === 1) {
      if (focusScrollY === null) focusScrollY = window.scrollY;
      else if (Math.abs(window.scrollY - focusScrollY) > 120) release();
    }
    if (rect.top < -view.h * 0.15) dismissHint();
    request();
  };

  /* --- pointer: drag pans, a moved pointer is not a tap --- */

  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (event.target instanceof Node && panel.contains(event.target)) return;
    dragPointer = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      time: event.timeStamp,
      moved: false,
    };
    cam.vx = 0;
    cam.vy = 0;
  });

  stage.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') {
      mouse = { x: event.clientX, y: event.clientY };
      request();
    }
    if (!dragPointer || event.pointerId !== dragPointer.id) return;
    const dx = event.clientX - dragPointer.lastX;
    const dy = event.clientY - dragPointer.lastY;
    if (
      !dragPointer.moved &&
      Math.hypot(event.clientX - dragPointer.x, event.clientY - dragPointer.y) > 6
    ) {
      dragPointer.moved = true;
      dragging = true;
      stage.classList.add('is-dragging');
    }
    if (!dragPointer.moved) return;
    const dt = Math.max(1, event.timeStamp - dragPointer.time);
    cam.x -= dx;
    cam.y -= dy;
    cam.vx = (-dx / dt) * 0.9;
    cam.vy = (-dy / dt) * 0.9;
    dragPointer.lastX = event.clientX;
    dragPointer.lastY = event.clientY;
    dragPointer.time = event.timeStamp;
    request();
  });

  const endPointer = (event: PointerEvent) => {
    if (!dragPointer || event.pointerId !== dragPointer.id) return;
    const wasDrag = dragPointer.moved;
    const idle = event.timeStamp - dragPointer.time;
    dragPointer = null;
    if (dragging) {
      dragging = false;
      stage.classList.remove('is-dragging');
    }
    /* A drag that stops before letting go should not glide on. */
    if (idle > 80) {
      cam.vx = 0;
      cam.vy = 0;
    }
    if (wasDrag) suppressClickUntil = performance.now() + 200;
    request();
  };

  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', (event) => {
    if (dragPointer && event.pointerId === dragPointer.id) {
      dragPointer = null;
      dragging = false;
      stage.classList.remove('is-dragging');
    }
  });

  stage.addEventListener('pointerleave', () => {
    mouse = null;
    request();
  });

  field.addEventListener('pointerover', (event) => {
    if (event.pointerType !== 'mouse') return;
    const target = event.target instanceof Element ? event.target.closest('.depth-item') : null;
    hovered = target ? itemByEl.get(target as HTMLElement) ?? null : null;
    request();
  });

  field.addEventListener('pointerleave', () => {
    hovered = null;
    request();
  });

  /* --- selecting: pointer click, Enter/Space (native button activation) --- */

  field.addEventListener('click', (event) => {
    if (performance.now() < suppressClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (document.documentElement.classList.contains('is-lightbox-open')) return;
    const target = event.target instanceof Element ? event.target.closest('.depth-item') : null;
    if (target) {
      const item = itemByEl.get(target as HTMLElement);
      if (!item) return;
      /* Clicking a piece now opens the "查看原图" viewer directly; the
         caption/actions panel remains for keyboard focus only. */
      const trigger = tiles[item.index]?.querySelector<HTMLElement>('[data-life-open]');
      trigger?.click();
      return;
    }
    if (focusTarget === 1) release();
  });

  /* --- keyboard --- */

  stage.addEventListener('keydown', (event) => {
    const isArrow =
      event.key === 'ArrowRight' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown';
    if (!isArrow) return;
    if (document.documentElement.classList.contains('is-lightbox-open')) return;

    const active = document.activeElement;
    const activeItem = active instanceof HTMLElement ? itemByEl.get(active) ?? null : null;
    if (!activeItem && focusTarget !== 1) return;

    event.preventDefault();
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const base = activeItem ? activeItem.index : focusedIndex;
    const next = stepIndex(base, direction);
    if (next === null) return;
    select(next);
    const target = itemByIndex.get(next);
    if (target) target.el.focus({ preventScroll: true });
  });

  /** Esc releases from anywhere (including after the lightbox closed). */
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (document.documentElement.classList.contains('is-lightbox-open')) return;
    if (focusTarget === 1) {
      event.preventDefault();
      release();
    }
  });

  closeBtn.addEventListener('click', () => release());

  /* "View full": programmatically click the matching wall button, so the
     lightbox controller that already exists on the page owns the viewer. */
  viewBtn.addEventListener('click', () => {
    if (!focused) return;
    const trigger = tiles[focused.index]?.querySelector<HTMLElement>('[data-life-open]');
    trigger?.click();
  });

  /* --- lifecycle: only animate while on screen and visible --- */

  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries[0]?.isIntersecting ?? false;
      if (visible) {
        lastTime = 0;
        onScroll();
        request();
      } else {
        pauseVideos();
      }
    },
    { rootMargin: '100px 0px' }
  );
  observer.observe(stage);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseVideos();
      return;
    }
    if (visible) {
      lastTime = 0;
      onScroll();
      request();
    }
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', measure);

  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(() => measure());
    resizeObserver.observe(stage);
  }

  /* Ready: lay out, rank the stack, then reveal the field and hide the wall. */
  measure();

  items
    .map((item) => ({ item, d: poseOf(item).d }))
    .sort((a, b) => b.d - a.d)
    .forEach((entry, rank) => {
      entry.item.rank = rank + 1;
    });

  section.classList.add('is-canvas');
  onScroll();

  return track;
}