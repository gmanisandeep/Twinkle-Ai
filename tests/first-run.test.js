const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const FirstRunRouter = require('../public/js/first-run-router.js');
const AuthScreen = require('../public/js/auth-screen.js');
const Onboarding = require('../public/js/onboarding.js');
const { dispatch } = require('../netlify/functions/assistant.js');
const { MemoryStore } = require('../netlify/functions/_platform/store.cjs');

function authWith(prefs = {}, google = {}) {
  const saved = [];
  return {
    getPrefs: () => prefs,
    getUserProfile: () => google,
    savePrefs: (value) => saved.push(value),
    saved,
  };
}

test('first-run router distinguishes signed-out, incomplete, and completed profiles', async () => {
  assert.equal((await FirstRunRouter.resolve({ user: null })).route, 'signed-out');

  const incompletePlatform = { request: async () => ({ profile: { displayName: 'Mani', onboardingStep: 2, onboardingCompleted: false } }) };
  assert.equal((await FirstRunRouter.resolve({ user: { uid: 'u1' }, auth: authWith(), platform: incompletePlatform })).route, 'onboarding');

  const auth = authWith();
  const profile = { displayName: 'Mani', primaryGoal: 'Ship Twinkle', focusAreas: ['coding'], onboardingCompleted: true };
  const completedPlatform = { request: async () => ({ profile }) };
  assert.equal((await FirstRunRouter.resolve({ user: { uid: 'u1' }, auth, platform: completedPlatform })).route, 'workspace');
  assert.deepEqual(auth.saved[0], { name: 'Mani', goal: 'Ship Twinkle', domains: ['coding'], onboarded: true });
});

test('legacy onboarding is migrated once to the authenticated cloud profile', async () => {
  const calls = [];
  const platform = { request: async (action, payload) => {
    calls.push({ action, payload });
    if (action === 'profile.get') return { profile: null };
    return { profile: { ...payload, onboardingCompleted: true } };
  } };
  const auth = authWith({ name: 'Legacy', goal: 'Build safely', domains: ['coding'], onboarded: true });
  const result = await FirstRunRouter.resolve({ user: { uid: 'u2' }, auth, platform });
  assert.equal(result.route, 'workspace');
  assert.deepEqual(calls.map((call) => call.action), ['profile.get', 'profile.upsert']);
  assert.equal(calls[1].payload.onboardingCompleted, true);
});

test('profile load failures stop at a retryable safe state', async () => {
  const platform = { request: async () => { throw new Error('secret backend detail'); } };
  const result = await FirstRunRouter.resolve({ user: { uid: 'u3' }, auth: authWith(), platform });
  assert.equal(result.route, 'profile-error');
  assert.doesNotMatch(result.error, /secret backend detail/);
});

test('server profile action sanitizes identity fields and focus areas', async () => {
  const store = new MemoryStore(`profile-${Date.now()}`);
  const user = { displayName: 'Google Name', email: 'mani@example.com', photoUrl: 'javascript:alert(1)' };
  const result = await dispatch('profile.upsert', {
    displayName: '  Mani\u0000  ', primaryGoal: 'Launch Twinkle', focusAreas: ['coding', 'invalid', 'coding'],
    onboardingStep: 3, onboardingCompleted: true,
  }, { store, user });
  assert.equal(result.profile.displayName, 'Mani');
  assert.deepEqual(result.profile.focusAreas, ['coding']);
  assert.equal(result.profile.email, 'mani@example.com');
  assert.equal(result.profile.photoURL, '');
  assert.equal(result.profile.onboardingCompleted, true);
  assert.equal((await dispatch('profile.get', {}, { store })).profile.primaryGoal, 'Launch Twinkle');
});

test('auth UI supports one guarded Google action and mobile redirect fallback', () => {
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'auth.js'), 'utf8');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'app.js'), 'utf8');
  assert.match(AuthScreen.googleButtonHTML(), /Continue with Google/);
  assert.match(authSource, /signInWithRedirect/);
  assert.match(authSource, /auth\/popup-blocked/);
  assert.match(authSource, /Sign-in is taking longer than expected/);
  assert.match(appSource, /Auth\.onReady\(handleAuthState\)/);
  assert.match(appSource, /Auth\.onAuthChange\(handleAuthState\)/);
  assert.doesNotMatch(appSource, /Sign-in failed: \$\{e\.message\}/);
});

test('auth UI prevents double submission and shows a retryable safe error', async () => {
  let click;
  let rejectSignIn;
  let calls = 0;
  const classList = { add() {}, remove() {} };
  const button = {
    dataset: {}, disabled: false, textContent: '', innerHTML: '',
    addEventListener(type, handler) { if (type === 'click') click = handler; },
    setAttribute() {}, removeAttribute() {}, focus() { this.focused = true; },
  };
  const error = { textContent: '', classList };
  const document = { getElementById: (id) => id === 'google-signin-btn' ? button : error };
  const auth = {
    shouldUseRedirect: () => false,
    signInWithGoogle: () => { calls += 1; return new Promise((resolve, reject) => { rejectSignIn = reject; }); },
    authErrorMessage: () => 'Google sign-in could not be completed. Please try again.',
  };
  AuthScreen.init({ auth, document });
  const first = click();
  await click();
  assert.equal(calls, 1);
  rejectSignIn(new Error('sensitive provider detail'));
  await first;
  assert.equal(error.textContent, 'Google sign-in could not be completed. Please try again.');
  assert.equal(button.disabled, false);
  assert.equal(button.focused, true);
});

test('onboarding save failure leaves the action enabled for retry', async () => {
  const status = { textContent: '', classList: { toggle() {} } };
  const nodes = {
    'onboarding-overlay': { classList: { add() {} } },
    'ob-name': { value: 'Mani' }, 'ob-goal': { value: 'Ship Twinkle' },
    'ob-progress': null, 'ob-progress-bar': null, 'onboarding-status': status,
  };
  const document = { getElementById: (id) => nodes[id] || null };
  const button = { textContent: 'Build my Twinkle', disabled: false };
  const result = await Onboarding.saveProfile({
    step: 3, completed: true, button, document,
    platform: { request: async () => { throw new Error('offline'); } },
  });
  assert.equal(result, null);
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /could not be saved/i);
});
