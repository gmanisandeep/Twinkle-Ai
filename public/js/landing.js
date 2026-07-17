(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TwinkleLanding = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const INTRO_KEY = 'twinkle_intro_seen_v1';
  const timings = Object.freeze({ constellation: 180, star: 1_300, zoom: 2_250, ready: 3_150 });
  let timers = [];
  let screen;

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

  function setPhase(className, delay) {
    timers.push(root.setTimeout(() => screen?.classList.add(className), delay));
  }

  function reveal({ focusSignIn = false } = {}) {
    clearTimers();
    if (!screen) return;
    markSeen();
    screen.classList.remove('intro-pending', 'is-intro', 'is-constellation-live', 'is-star-found', 'is-zooming');
    screen.classList.add('is-ready');
    screen.setAttribute('aria-busy', 'false');
    if (focusSignIn) screen.querySelector('#google-signin-btn')?.focus();
  }

  function show(target) {
    screen = target;
    clearTimers();
    screen.classList.remove('is-ready', 'is-intro', 'is-constellation-live', 'is-star-found', 'is-zooming');
    if (hasSeenIntro() || prefersReducedMotion()) {
      reveal();
      return false;
    }
    screen.classList.add('is-intro');
    screen.setAttribute('aria-busy', 'true');
    setPhase('is-constellation-live', timings.constellation);
    setPhase('is-star-found', timings.star);
    setPhase('is-zooming', timings.zoom);
    timers.push(root.setTimeout(() => reveal(), timings.ready));
    return true;
  }

  function hide() {
    clearTimers();
    screen?.setAttribute('aria-busy', 'false');
  }

  function init() {
    root.document?.getElementById('skip-intro')?.addEventListener('click', () => reveal({ focusSignIn: true }));
  }

  return { INTRO_KEY, timings, hasSeenIntro, prefersReducedMotion, init, show, reveal, hide };
});
