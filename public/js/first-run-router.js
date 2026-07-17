(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FirstRunRouter = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const PROFILE_TIMEOUT_MS = 10_000;

  function hydrateLocal(auth, profile) {
    if (!profile) return;
    auth.savePrefs?.({
      name: profile.displayName,
      goal: profile.primaryGoal,
      domains: profile.focusAreas || [],
      onboarded: profile.onboardingCompleted === true,
    });
  }

  async function requestWithTimeout(platform, action, payload = {}, timeoutMs = PROFILE_TIMEOUT_MS) {
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try { return await platform.request(action, payload, controller ? { signal: controller.signal } : {}); }
    finally { if (timer) clearTimeout(timer); }
  }

  async function resolve({ user, auth = root.Auth, platform = root.TwinklePlatform } = {}) {
    if (!user) return { route: 'signed-out', profile: null };
    try {
      const result = await requestWithTimeout(platform, 'profile.get');
      let profile = result?.profile || null;
      const legacy = auth.getPrefs?.() || {};
      if (!profile && legacy.onboarded === true) {
        const google = auth.getUserProfile?.() || {};
        const migrated = await requestWithTimeout(platform, 'profile.upsert', {
          displayName: legacy.name || google.firstName || google.name || 'User',
          focusAreas: legacy.domains || [],
          primaryGoal: legacy.goal || 'Achieve my goals',
          onboardingStep: 3,
          onboardingCompleted: true,
        });
        profile = migrated?.profile || null;
      }
      if (profile?.onboardingCompleted === true) {
        hydrateLocal(auth, profile);
        return { route: 'workspace', profile };
      }
      return { route: 'onboarding', profile };
    } catch (error) {
      return { route: 'profile-error', profile: null, error: 'Twinkle could not load your profile. Check your connection and retry.' };
    }
  }

  return { PROFILE_TIMEOUT_MS, hydrateLocal, requestWithTimeout, resolve };
});
