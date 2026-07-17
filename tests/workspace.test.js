const test = require('node:test');
const assert = require('node:assert/strict');
const Workspace = require('../public/js/workspace.js');

test('uses calm time-aware greetings', () => {
  assert.equal(Workspace.dayGreeting(new Date('2026-07-15T08:00:00')), 'Good morning');
  assert.equal(Workspace.dayGreeting(new Date('2026-07-15T14:00:00')), 'Good afternoon');
  assert.equal(Workspace.dayGreeting(new Date('2026-07-15T21:00:00')), 'Good evening');
});

test('personalizes bounded starter actions from onboarding focus areas', () => {
  const actions = Workspace.starterActions(['coding', 'research']);
  assert.equal(actions.length, 4);
  assert.ok(actions.some(([label]) => label === 'Start a project'));
  assert.ok(actions.some(([label]) => label === 'Research an idea'));
});
