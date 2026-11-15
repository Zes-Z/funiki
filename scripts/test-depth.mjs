#!/usr/bin/env node
/**
 * Frame 3 — depth-field smoke test.
 *
 * Checks that the life section really upgraded from the justified wall to the
 * DOM depth field, that the dive/focus/keyboard/viewer paths work, that the
 * field stops animating off screen, and that reduced motion keeps the wall.
 *
 * Usage:
 *   node scripts/test-depth.mjs                       # http://localhost:4331/
 *   node scripts/test-depth.mjs http://localhost:4321 # any running server
 *
 * Edge (channel 'msedge') is used because browser downloads are blocked here.
 * Screenshots land in /tmp/depth-shots/.
 */
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4331/';
const OUT = '/tmp/depth-shots';

/* The intro curtain locks the page; the layout has a built-in escape hatch.
   (globalThis.URL: the module-level TARGET_URL must not shadow the constructor.) */
function withNoIntro(raw) {
  try {
    const url = new globalThis.URL(raw);
    url.searchParams.set('no-intro', '');
    return url.toString();
  } catch {
    return raw;
  }
}

const TARGET_URL = withNoIntro(BASE);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let checks = 0;
const failures = [];
const warnings = [];
const screenshots = [];

function check(name, ok, detail = '') {
  checks += 1;
  const line = (ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  [' + detail + ']' : '');
  console.log(line);
  if (!ok) failures.push(name + (detail ? ' — ' + detail : ''));
}

function warn(message) {
  warnings.push(message);
  console.log('WARN  ' + message);
}

function isFiniteTransform(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('NaN') && !value.includes('undefined');
}

async function shot(page, name) {
  const path = OUT + '/' + name + '.png';
  await page.screenshot({ path });
  screenshots.push(path);
  return path;
}

async function scrollToY(page, y) {
  /* Some pages run Lenis; retry until the native scroll actually lands. */
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y);
    await wait(attempt === 0 ? 380 : 220);
    const actual = await page.evaluate(() => window.scrollY);
    if (Math.abs(actual - y) < 4) return;
  }
  const actual = await page.evaluate(() => window.scrollY);
  warn('scroll did not land exactly: wanted ' + Math.round(y) + ', got ' + Math.round(actual));
}

async function fieldInfo(page) {
  return page.evaluate(() => {
    const section = document.querySelector('[data-life]');
    const track = document.querySelector('[data-depth-track]');
    const stage = document.querySelector('[data-depth-stage]');
    const wall = document.querySelector('.play-wall');
    const panel = document.querySelector('.depth-panel');
    const items = Array.from(document.querySelectorAll('[data-depth-item]'));
    const visible = items.filter((el) => {
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity || '0') > 0.05;
    });
    const trackRect = track ? track.getBoundingClientRect() : null;
    const stageRect = stage ? stage.getBoundingClientRect() : null;
    return {
      hasSection: Boolean(section),
      isCanvas: Boolean(section && section.classList.contains('is-canvas')),
      hasTrack: Boolean(track),
      hasStage: Boolean(stage),
      tileCount: document.querySelectorAll('[data-life-tile]').length,
      itemCount: items.length,
      visibleCount: visible.length,
      focusableCount: items.filter((el) => el.tabIndex === 0).length,
      wallDisplay: wall ? getComputedStyle(wall).display : null,
      stageHeight: stageRect ? stageRect.height : 0,
      trackHeight: trackRect ? trackRect.height : 0,
      trackTop: trackRect ? trackRect.top + window.scrollY : 0,
      stageTop: stageRect ? stageRect.top : 0,
      stageVisible: stageRect ? stageRect.bottom > 0 && stageRect.top < window.innerHeight : false,
      transforms: items.map((el) => el.style.transform).filter((value) => value.length > 0),
      visibleTransforms: visible.slice(0, 6).map((el) => el.style.transform),
      panelOpen: Boolean(document.querySelector('.depth-panel.is-open')),
      panelTitle: document.querySelector('.depth-panel__title')?.textContent?.trim() ?? '',
      panelMeta: document.querySelector('.depth-panel__meta')?.textContent?.trim() ?? '',
      panelLive: panel?.getAttribute('aria-live') ?? null,
      srLive: document.querySelector('.depth-sr')?.getAttribute('aria-live') ?? null,
      hasViewButton: Boolean(document.querySelector('[data-depth-view]')),
      viewButtonVisible: (() => {
        const btn = document.querySelector('[data-depth-view]');
        if (!btn) return false;
        const cs = getComputedStyle(btn);
        return !btn.hidden && cs.display !== 'none' && cs.visibility !== 'hidden';
      })(),
      focusedIndex: document.querySelector('[data-depth-item][aria-current="true"]')?.dataset.index ?? null,
      hasFocus: Boolean(document.querySelector('[data-depth-stage].has-focus')),
      hintText: document.querySelector('[data-depth-hint]')?.textContent?.trim() ?? '',
      lightbox: (() => {
        const box = document.querySelector('[data-lightbox]');
        if (!box) return null;
        return { hidden: box.hidden, display: getComputedStyle(box).display };
      })(),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
}

async function waitForField(page) {
  await page
    .waitForFunction(() => document.querySelectorAll('[data-depth-item]').length > 0, undefined, { timeout: 20000 })
    .catch(() => {});
}

/* The intro curtain, when it runs, covers (and locks) the page. */
async function waitForIntro(page) {
  await page
    .waitForFunction(
      () => {
        const intro = document.querySelector('[data-intro]');
        return !intro || getComputedStyle(intro).display === 'none';
      },
      undefined,
      { timeout: 6000 }
    )
    .catch(() => warn('intro curtain still up after 6s'));
}

async function lifeTop(page) {
  return page.evaluate(() => {
    const section = document.querySelector('[data-life]');
    if (!section) return 0;
    return section.getBoundingClientRect().top + window.scrollY;
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  try {
    /* ------------------------------------------------ desktop field */
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      /* missing static files are a content problem, not a field problem */
      if (/Failed to load resource|favicon|net::ERR/.test(text)) warn('resource error: ' + text);
      else consoleErrors.push(text);
    });
    page.on('pageerror', (error) => consoleErrors.push('pageerror: ' + error.message));

    await page.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('[data-life]', { timeout: 15000 });
    await waitForIntro(page);
    await wait(800);

    const top = await lifeTop(page);
    await scrollToY(page, Math.max(0, top - 900 * 0.6));
    await waitForField(page);
    await wait(900);

    const initial = await fieldInfo(page);
    check('life section exists', initial.hasSection);
    check('field built over the wall (track + stage)', initial.hasTrack && initial.hasStage);
    check('is-canvas set on the section', initial.isCanvas);
    check('wall hidden while field is live', initial.wallDisplay === 'none', 'display: ' + initial.wallDisplay);
    check('one field item per tile', initial.itemCount === initial.tileCount && initial.itemCount > 0, initial.itemCount + ' items / ' + initial.tileCount + ' tiles');
    check('field items are tabbable buttons', initial.focusableCount === initial.itemCount, initial.focusableCount + ' focusable');
    check('several pieces painted on screen', initial.visibleCount >= 3, initial.visibleCount + ' visible');
    check('transforms are finite', initial.transforms.every(isFiniteTransform));
    check('Chinese hint line present', /向下滚动穿越/.test(initial.hintText), initial.hintText);
    check('panel is a polite live region', initial.panelLive === 'polite' && initial.srLive === 'polite');

    /* ------------------------------------------------ the dive */
    const range = Math.max(0, initial.trackHeight - initial.stageHeight);
    check('dive runs ~2.5-3 viewports of scroll', range / 900 > 2 && range / 900 < 3.6, (range / 900).toFixed(2) + ' viewports');

    await scrollToY(page, initial.trackTop + 2);
    const entry = await fieldInfo(page);
    check('dive entry pins the stage full screen', Math.abs(entry.stageTop) < 4 && entry.visibleCount > 0, entry.visibleCount + ' visible');
    await shot(page, 'depth-00-entry');

    const steps = [0.2, 0.45, 0.7, 0.9];
    for (const fraction of steps) {
      await scrollToY(page, initial.trackTop + range * fraction);
      const info = await fieldInfo(page);
      const label = 'dive ' + Math.round(fraction * 100) + '%';
      check(label + ': pieces visible', info.visibleCount > 0, info.visibleCount + ' visible');
      check(label + ': finite transforms', info.transforms.every(isFiniteTransform));
      check(label + ': stage pinned to viewport', Math.abs(info.stageTop) < 4, 'stageTop=' + info.stageTop.toFixed(1));
      await shot(page, 'depth-' + String(Math.round(fraction * 100)).padStart(2, '0'));
    }

    /* ------------------------------------------------ slow drift */
    await scrollToY(page, initial.trackTop + range * 0.4);
    const driftA = (await fieldInfo(page)).visibleTransforms;
    await wait(600);
    const driftB = (await fieldInfo(page)).visibleTransforms;
    check('field drifts slowly while in view', driftA.some((value, index) => value !== driftB[index]), driftA.length + ' live transforms');

    /* ------------------------------------------------ drag pan */
    const itemBox = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[data-depth-item]'));
      const visible = items.find((el) => {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return cs.visibility !== 'hidden' && parseFloat(cs.opacity || '0') > 0.4 && rect.width > 60;
      });
      if (!visible) return null;
      const rect = visible.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, index: visible.dataset.index };
    });
    if (itemBox) {
      const beforeDrag = (await fieldInfo(page)).visibleTransforms;
      await page.mouse.move(itemBox.x, itemBox.y);
      await page.mouse.down();
      for (let step = 1; step <= 6; step += 1) {
        await page.mouse.move(itemBox.x + step * 24, itemBox.y + step * 6);
        await wait(16);
      }
      await page.mouse.up();
      await wait(400);
      const afterDrag = (await fieldInfo(page)).visibleTransforms;
      check('drag pans the field', beforeDrag.some((value, index) => value !== afterDrag[index]));
      check('drag is not a tap (no focus panel)', !(await fieldInfo(page)).panelOpen);
    } else {
      warn('no visible piece big enough to drag — skipped drag check');
    }

    /* ------------------------------------------------ focus, panel, viewer */
    await wait(300);
    const clickable = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('[data-depth-item]'));
      const visible = items.find((el) => {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return cs.visibility !== 'hidden' && parseFloat(cs.opacity || '0') > 0.5 && rect.top > 80 && rect.bottom < 820;
      });
      if (!visible) return null;
      const rect = visible.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    if (clickable) {
      await page.mouse.click(clickable.x, clickable.y);
      await wait(800);
      const focused = await fieldInfo(page);
      check('click focuses a piece in place', focused.hasFocus && focused.panelOpen);
      check('focus panel shows a caption', focused.panelTitle.length > 0, focused.panelTitle);
      check('focus panel has the 查看原图 button', focused.hasViewButton);
      check('focus panel carries the taken meta', focused.panelMeta.length > 0, focused.panelMeta);
      const hintOpacity = await page.evaluate(() => {
        const hint = document.querySelector('[data-depth-hint]');
        return hint ? parseFloat(getComputedStyle(hint).opacity) : 1;
      });
      check('hint fades out while a piece is focused', hintOpacity < 0.05, 'opacity=' + hintOpacity);
      check('only the focused piece is current', focused.focusedIndex !== null);
      await shot(page, 'depth-focus');

      if (focused.lightbox && focused.viewButtonVisible) {
        await page.locator('[data-depth-view]').click();
        await wait(900);
        const viewer = await fieldInfo(page);
        check('查看原图 opens the matching lightbox', viewer.lightbox !== null && viewer.lightbox.hidden === false);
        await shot(page, 'depth-viewer');
        await page.keyboard.press('Escape');
        await wait(900);
        const back = await fieldInfo(page);
        check('lightbox closes with Escape', back.lightbox !== null && back.lightbox.hidden === true);
        check('field focus survives the viewer', back.panelOpen);
      } else {
        warn('no lightbox found or view button hidden — viewer integration skipped');
      }

      await page.keyboard.press('Escape');
      await wait(600);
      const released = await fieldInfo(page);
      check('Escape releases the focus', !released.panelOpen && !released.hasFocus);

      /* keyboard: Enter focuses, arrow keys step, Escape releases.
         Pick a piece that is actually painted: hidden buttons cannot be
         focused, which is also what a keyboard user would experience. */
      const keyboardTarget = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[data-depth-item]'));
        const visible = items.find((el) => {
          const cs = getComputedStyle(el);
          return cs.visibility !== 'hidden' && parseFloat(cs.opacity || '0') > 0.3;
        });
        if (!visible) return null;
        visible.focus({ preventScroll: true });
        return { index: visible.dataset.index, focused: document.activeElement === visible };
      });
      check('a painted piece can take keyboard focus', Boolean(keyboardTarget && keyboardTarget.focused), keyboardTarget ? 'tile ' + keyboardTarget.index : 'none');
      await page.keyboard.press('Enter');
      await wait(700);
      const viaEnter = await fieldInfo(page);
      check('Enter on a focused button pulls the piece into focus', viaEnter.panelOpen && viaEnter.focusedIndex !== null);
      const previousIndex = viaEnter.focusedIndex;
      await page.keyboard.press('ArrowRight');
      await wait(700);
      const viaArrow = await fieldInfo(page);
      check('ArrowRight moves the focus to another piece', viaArrow.panelOpen && viaArrow.focusedIndex !== previousIndex, previousIndex + ' → ' + viaArrow.focusedIndex);
      await page.keyboard.press('Escape');
      await wait(500);
      check('Escape after arrow navigation releases', !(await fieldInfo(page)).panelOpen);
    } else {
      warn('no piece available for focus checks');
    }

    /* ------------------------------------------------ video sync (only if the content has live clips) */
    const videoTileCount = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll('[data-life-tile]')).filter(
          (tile) => (tile.dataset.video || '').trim().length > 0
        ).length
    );
    if (videoTileCount > 0) {
      await scrollToY(page, initial.trackTop + range * 0.3);
      await wait(1400);
      const rest = await page.evaluate(() => {
        const videos = Array.from(document.querySelectorAll('[data-depth-item] video'));
        return {
          created: videos.length,
          playing: videos.filter((video) => !video.paused).length,
        };
      });
      check('at most one clip plays at rest', rest.playing <= 1, rest.playing + ' playing / ' + rest.created + ' created');

      const videoIndex = await page.evaluate(() => {
        const tiles = Array.from(document.querySelectorAll('[data-life-tile]'));
        const index = tiles.findIndex((tile) => (tile.dataset.video || '').trim().length > 0);
        const item = document.querySelector('[data-depth-item][data-index="' + index + '"]');
        if (item instanceof HTMLElement) item.focus({ preventScroll: true });
        return index;
      });
      await page.keyboard.press('Enter');
      await wait(1500);
      const focusedClip = await page.evaluate(() => {
        const current = document.querySelector('[data-depth-item][aria-current="true"]');
        const video = current ? current.querySelector('video') : null;
        const allVideos = Array.from(document.querySelectorAll('[data-depth-item] video'));
        return {
          index: current ? current.dataset.index : null,
          hasVideo: Boolean(video),
          playing: video ? !video.paused : false,
          playingCount: allVideos.filter((candidate) => !candidate.paused).length,
          badge: Boolean(current && current.querySelector('.depth-item__badge')),
        };
      });
      check('focused live tile plays its clip', focusedClip.hasVideo && focusedClip.playing, 'tile ' + videoIndex);
      check('focused clip is the only one playing', focusedClip.playingCount <= 1, focusedClip.playingCount + ' playing');
      check('live tile carries a LIVE/VIDEO badge', focusedClip.badge);
      await page.keyboard.press('Escape');
      await wait(500);

      await scrollToY(page, 0);
      await wait(800);
      const offscreenClips = await page.evaluate(
        () => Array.from(document.querySelectorAll('[data-depth-item] video')).filter((video) => !video.paused).length
      );
      check('clips pause when the field leaves the screen', offscreenClips === 0, offscreenClips + ' still playing');
    } else {
      warn('no video/live tiles in content — clip sync not asserted');
    }

    /* ------------------------------------------------ pauses off screen */
    await scrollToY(page, 0);
    await wait(500);
    const offA = await fieldInfo(page);
    const offTransformsA = offA.transforms.join('|');
    await wait(700);
    const offB = await fieldInfo(page);
    const offTransformsB = offB.transforms.join('|');
    if (!offA.stageVisible && !offB.stageVisible) {
      check('rAF pauses while the section is off screen', offTransformsA === offTransformsB);
    } else {
      warn('stage still intersects the viewport at scroll 0 — off-screen pause not asserted');
    }

    check('no JavaScript console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' / '));
    await context.close();

    /* ------------------------------------------------ reduced motion keeps the wall */
    const reducedContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const reducedPage = await reducedContext.newPage();
    await reducedPage.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });
    await reducedPage.waitForSelector('[data-life]', { timeout: 15000 });
    await waitForIntro(reducedPage);
    const topReduced = await lifeTop(reducedPage);
    await scrollToY(reducedPage, Math.max(0, topReduced - 400));
    await wait(800);
    const reduced = await fieldInfo(reducedPage);
    check('reduced motion: no canvas is built', !reduced.isCanvas && reduced.itemCount === 0);
    check('reduced motion: wall stays visible', reduced.wallDisplay !== 'none', 'display: ' + reduced.wallDisplay);
    check('reduced motion: wall tiles remain', reduced.tileCount > 0, reduced.tileCount + ' tiles');
    await shot(reducedPage, 'depth-reduced-motion');
    /* the fallback must stay fully usable: a wall tile still opens the viewer */
    const firstWallTile = reducedPage.locator('[data-life-open]').first();
    await firstWallTile.click();
    await wait(800);
    const fallbackViewer = await reducedPage.evaluate(() => {
      const box = document.querySelector('[data-lightbox]');
      return box ? { hidden: box.hidden, display: getComputedStyle(box).display } : null;
    });
    check('reduced motion: wall tile opens the lightbox', Boolean(fallbackViewer && fallbackViewer.hidden === false && fallbackViewer.display !== 'none'));
    await shot(reducedPage, 'depth-reduced-motion-viewer');
    await reducedPage.keyboard.press('Escape');
    await wait(600);
    check('reduced motion: lightbox closes with Escape', await reducedPage.evaluate(() => document.querySelector('[data-lightbox]')?.hidden === true));
    await reducedContext.close();

    /* ------------------------------------------------ small screen */
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();
    const mobileErrors = [];
    mobilePage.on('pageerror', (error) => mobileErrors.push(error.message));
    await mobilePage.goto(TARGET_URL, { waitUntil: 'load', timeout: 30000 });
    await mobilePage.waitForSelector('[data-life]', { timeout: 15000 });
    await waitForIntro(mobilePage);
    const mobileTop = await lifeTop(mobilePage);
    await scrollToY(mobilePage, Math.max(0, mobileTop - 300));
    await waitForField(mobilePage);
    await wait(700);
    const mobile = await fieldInfo(mobilePage);
    check('mobile: field builds', mobile.itemCount > 0);
    check('mobile: no horizontal overflow', mobile.scrollWidth <= mobile.innerWidth + 2, mobile.scrollWidth + ' > ' + mobile.innerWidth);
    await scrollToY(mobilePage, mobile.trackTop + mobile.stageHeight * 0.35);
    const mobileDive = await fieldInfo(mobilePage);
    check('mobile: pieces visible mid-dive', mobileDive.visibleCount > 0, mobileDive.visibleCount + ' visible');
    check('mobile: no page errors', mobileErrors.length === 0, mobileErrors.join(' / '));
    await shot(mobilePage, 'depth-mobile');
    await mobileContext.close();
  } finally {
    await browser.close();
  }

  console.log('\n' + checks + ' checks, ' + failures.length + ' failed, ' + warnings.length + ' warnings');
  console.log('screenshots: ' + screenshots.join(', '));
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((failure) => console.log(' - ' + failure));
    process.exitCode = 1;
  }
}

/* A live dev server can reload the page under us while another file is being
   written (HMR full reload). That is not a field failure: retry once cleanly. */
let attempt = 0;
function resetCounters() {
  checks = 0;
  failures.length = 0;
  warnings.length = 0;
  screenshots.length = 0;
}

async function run() {
  try {
    await main();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    const interrupted = /Execution context was destroyed|Target closed|navigation|detached/i.test(message);
    if (interrupted && attempt < 2) {
      attempt += 1;
      console.log('\nWARN  the dev server reloaded the page mid-run — retrying (' + attempt + '/2)');
      resetCounters();
      await run();
      return;
    }
    throw error;
  }
}

run().catch((error) => {
  console.error('test-depth crashed:', error);
  process.exitCode = 1;
});
