const assert = require('node:assert/strict');
const test = require('node:test');
const SafetyPrivacy = require('../public/js/safety-privacy.js');
const { dispatch } = require('../netlify/functions/assistant.js');
const { COLLECTIONS } = require('../netlify/functions/_platform/store.cjs');

test('renders concise signed-out safety content without unsupported claims', () => {
  const html = SafetyPrivacy.SafetyPrivacyPanel({ signedIn: false });
  assert.match(html, /Safety &amp; Privacy/);
  assert.match(html, /Last updated:/);
  assert.match(html, /Google password/);
  assert.match(html, /Netlify Functions/);
  assert.match(html, /Sign in to review or use controls/);
  assert.doesNotMatch(html, /100% secure|fully private|anonymous|we never store data|certified/i);
  assert.match(html, /role="dialog"/);
  assert.match(html, /aria-modal="true"/);
});

test('renders all signed-in data controls from one reusable panel', () => {
  const html = SafetyPrivacy.SafetyPrivacyPanel({ signedIn: true });
  for (const label of ['Edit profile', 'Clear conversations', 'Clear saved memory', 'Delete projects', 'Delete all Twinkle data']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /Firebase Authentication account will remain/);
  assert.equal((html.match(/Last updated:/g) || []).length, 1);
  assert.equal(SafetyPrivacy.CONFIG.lastUpdated, '2026-07-17');
});

test('delete-all reports partial failures and removes every supported local key', async () => {
  const removed = [];
  const result = await SafetyPrivacy.deleteAllTwinkleData({
    uid: 'user-1',
    storage: { removeItem(key) { if (key === 'twinkle_news_cache') throw new Error('blocked'); removed.push(key); } },
    platform: { request: async () => ({ complete: false, failures: ['jobs'], deleted: 4 }) },
  });
  assert.equal(result.complete, false);
  assert.deepEqual(result.server.failures, ['jobs']);
  assert.deepEqual(result.local.failures, ['twinkle_news_cache']);
  assert.ok(removed.includes('twinkle_convs_v2'));
  assert.ok(removed.includes('twinkle_memory_v1'));
  assert.ok(removed.includes('twinkle_prefs_user-1'));
});

test('delete-all prevents accidental double submission', async () => {
  let resolve;
  let calls = 0;
  const pending = new Promise((done) => { resolve = done; });
  const options = {
    uid: 'user-2', storage: { removeItem() {} },
    platform: { request: async () => { calls += 1; await pending; return { complete: true, failures: [] }; } },
  };
  const first = SafetyPrivacy.deleteAllTwinkleData(options);
  const second = SafetyPrivacy.deleteAllTwinkleData(options);
  resolve();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.equal(a.complete, true);
});

test('server deletion attempts every collection and reports failed groups', async () => {
  const collectionNames = [...COLLECTIONS];
  const attempted = [];
  const result = await dispatch('account.delete', {}, { store: { clear: async (collection) => {
    attempted.push(collection);
    if (collection === collectionNames[1]) throw new Error('temporary failure');
    return 2;
  } } });
  assert.deepEqual(attempted, collectionNames);
  assert.equal(result.complete, false);
  assert.deepEqual(result.failures, [collectionNames[1]]);
  assert.equal(result.collections.filter((item) => item.status === 'deleted').length, collectionNames.length - 1);
});

test('memory.clear deletes the UID-scoped memory collection', async () => {
  const calls = [];
  const result = await dispatch('memory.clear', {}, { store: { clear: async (collection) => { calls.push(collection); return 3; } } });
  assert.deepEqual(calls, ['memories']);
  assert.equal(result.deleted, 3);
});
