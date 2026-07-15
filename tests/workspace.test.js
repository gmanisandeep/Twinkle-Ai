const test = require('node:test');
const assert = require('node:assert/strict');
const Workspace = require('../public/js/workspace.js');

test('uses calm time-aware greetings', () => {
  assert.equal(Workspace.dayGreeting(new Date('2026-07-15T08:00:00')), 'Good morning');
  assert.equal(Workspace.dayGreeting(new Date('2026-07-15T14:00:00')), 'Good afternoon');
  assert.equal(Workspace.dayGreeting(new Date('2026-07-15T21:00:00')), 'Good evening');
});
