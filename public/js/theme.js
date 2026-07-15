(function initThemeModule(global, factory) {
  const api = factory(global);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (global) global.Theme = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, (global) => {
  'use strict';

  const STORAGE_KEY = 'twinkle_theme_v1';
  const PREFERENCES = new Set(['system', 'light', 'dark', 'amoled']);
  let mediaQuery = null;

  function getStorage() {
    try { return global?.localStorage || null; }
    catch { return null; }
  }

  function getPreference(storage = getStorage()) {
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      return PREFERENCES.has(saved) ? saved : 'system';
    } catch { return 'system'; }
  }

  function resolve(preference, prefersDark = false) {
    if (preference === 'system') return prefersDark ? 'dark' : 'light';
    return PREFERENCES.has(preference) ? preference : 'dark';
  }

  function apply(preference = getPreference(), root = global?.document?.documentElement) {
    const prefersDark = global?.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
    const resolved = resolve(preference, prefersDark);
    if (root) {
      root.dataset.theme = resolved;
      root.dataset.themePreference = preference;
    }
    return resolved;
  }

  function setPreference(preference, storage = getStorage()) {
    const safePreference = PREFERENCES.has(preference) ? preference : 'system';
    try { storage?.setItem(STORAGE_KEY, safePreference); } catch {}
    apply(safePreference);
    return safePreference;
  }

  function init() {
    apply(getPreference());
    if (!global?.matchMedia) return;
    mediaQuery = global.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener?.('change', () => {
      if (getPreference() === 'system') apply('system');
    });
  }

  const api = { STORAGE_KEY, getPreference, resolve, apply, setPreference, init };
  if (global?.document) init();
  return api;
});
