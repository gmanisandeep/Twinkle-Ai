(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TwinkleLanding = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const INTRO_KEY = 'twinkle_intro_seen_v1';
  const timings = Object.freeze({ constellation: 160, star: 1_250, zoom: 2_150, logo: 3_250, ready: 4_150 });
  let timers = [];
  let screen;
  let elapsed = 0;
  let startedAt = 0;
  let running = false;

  function storage() {
    try { return root.localStorage; } catch { return null; }
  }

  function prefersReducedMotion() {
    return Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  }

  function hasSeenIntro(store = storage()) {
    try { return store?.getItem(INTRO_KEY) === 'true'; } catch { return false; }
  }

  function markSeen(store = storage()) {
    try { store?.setItem(INTRO_KEY, 'true'); } catch { /* Browsers may block storage. */ }
  }

  function clearTimers() {
    timers.forEach((timer) => root.clearTimeout(timer));
    timers = [];
  }

  function phases() {
    return [
      ['is-constellation-live', timings.constellation],
      ['is-star-found', timings.star],
      ['is-zooming', timings.zoom],
      ['is-logo-reveal', timings.logo],
    ];
  }

  function schedule() {
    if (!screen || running) return;
    running = true;
    startedAt = Date.now();
    phases().forEach(([className, at]) => {
      if (at <= elapsed) screen.classList.add(className);
      else timers.push(root.setTimeout(() => screen?.classList.add(className), at - elapsed));
    });
    timers.push(root.setTimeout(() => reveal(), Math.max(0, timings.ready - elapsed)));
  }

  function pause() {
    if (!running) return;
    elapsed += Date.now() - startedAt;
    running = false;
    clearTimers();
    screen?.classList.add('animations-paused');
  }

  function resume() {
    if (!screen || running || screen.classList.contains('is-ready')) return;
    screen.classList.remove('animations-paused');
    schedule();
  }

  function reveal({ focusSignIn = false } = {}) {
    clearTimers();
    running = false;
    if (!screen) return;
    markSeen();
    screen.classList.remove('intro-pending', 'is-intro', 'is-constellation-live', 'is-star-found', 'is-zooming', 'is-logo-reveal', 'animations-paused');
    screen.classList.add('is-ready');
    screen.setAttribute('aria-busy', 'false');
    if (focusSignIn) screen.querySelector('#google-signin-btn')?.focus();
  }

  function show(target) {
    screen = target;
    clearTimers();
    running = false;
    elapsed = 0;
    screen.classList.remove('is-ready', 'is-intro', 'is-constellation-live', 'is-star-found', 'is-zooming', 'is-logo-reveal', 'animations-paused');
    if (hasSeenIntro() || prefersReducedMotion()) {
      reveal();
      return false;
    }
    screen.classList.add('is-intro');
    screen.setAttribute('aria-busy', 'true');
    schedule();
    return true;
  }

  function hide() {
    clearTimers();
    running = false;
    screen?.setAttribute('aria-busy', 'false');
  }

  function init() {
    root.document?.getElementById('skip-intro')?.addEventListener('click', () => reveal({ focusSignIn: true }));
    root.document?.addEventListener('visibilitychange', () => {
      if (root.document.hidden) pause(); else resume();
    });
  }

  return { INTRO_KEY, timings, hasSeenIntro, prefersReducedMotion, init, show, reveal, hide, pause, resume };
});
