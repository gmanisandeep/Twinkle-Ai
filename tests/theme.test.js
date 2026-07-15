const test = require('node:test');
const assert = require('node:assert/strict');
const Theme = require('../public/js/theme.js');

test('resolves system theme without changing the stored preference', () => {
  assert.equal(Theme.resolve('system', true), 'dark');
  assert.equal(Theme.resolve('system', false), 'light');
});

test('reads only supported theme preferences', () => {
  assert.equal(Theme.getPreference({ getItem: () => 'amoled' }), 'amoled');
  assert.equal(Theme.getPreference({ getItem: () => 'unknown' }), 'system');
});

test('stores a safe preference', () => {
  let saved;
  const storage = { setItem: (key, value) => { saved = [key, value]; } };
  assert.equal(Theme.setPreference('dark', storage), 'dark');
  assert.deepEqual(saved, [Theme.STORAGE_KEY, 'dark']);
});
