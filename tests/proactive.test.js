const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'proactive.js'), 'utf8');
const sandbox = { console, Date, setTimeout, clearTimeout };
vm.runInNewContext(`${source}\nglobalThis.__proactive = Proactive;`, sandbox);
const Proactive = sandbox.__proactive;

function atLocalHour(hour, day = 15) {
  return new Date(2026, 6, day, hour, 0, 0, 0).getTime();
}

function state(overrides = {}) {
  return {
    ...Proactive.DEFAULT_CONFIG,
    dayKey: '2026-07-15',
    deliveriesToday: 0,
    lastDeliveredAt: 0,
    lastSeenAt: 0,
    ...overrides,
  };
}

test('starts a first-session check-in during active hours', () => {
  const result = Proactive.planCheckIn({
    context: { name: 'Sam', goal: 'Ship the product' },
    state: state(),
    reason: 'session',
    now: atLocalHour(9),
  });
  assert.equal(result.kind, 'welcome');
  assert.match(result.text, /Sam/);
  assert.match(result.text, /Ship the product/);
});

test('does not interrupt during quiet hours', () => {
  const result = Proactive.planCheckIn({
    state: state(),
    reason: 'session',
    now: atLocalHour(23),
  });
  assert.equal(result, null);
});

test('respects the daily delivery limit', () => {
  const result = Proactive.planCheckIn({
    state: state({ deliveriesToday: 2 }),
    reason: 'session',
    now: atLocalHour(12),
  });
  assert.equal(result, null);
});

test('creates a return check-in after a meaningful absence', () => {
  const now = atLocalHour(15);
  const result = Proactive.planCheckIn({
    state: state({ lastSeenAt: now - (6 * 60 * 60 * 1000) }),
    reason: 'session',
    now,
  });
  assert.equal(result.kind, 'return');
});

test('creates an idle check-in only after the idle threshold', () => {
  const now = atLocalHour(15);
  const early = Proactive.planCheckIn({
    state: state(), reason: 'idle', now, lastActivityAt: now - (10 * 60 * 1000),
  });
  const due = Proactive.planCheckIn({
    state: state(), reason: 'idle', now, lastActivityAt: now - (30 * 60 * 1000),
  });
  assert.equal(early, null);
  assert.equal(due.kind, 'idle');
});

test('escapes user profile content before rendering it as markdown', () => {
  const result = Proactive.planCheckIn({
    context: { name: '<img src=x onerror=alert(1)>', goal: '<script>alert(1)</script>' },
    state: state(),
    reason: 'session',
    now: atLocalHour(9),
  });
  assert.doesNotMatch(result.text, /<script|<img/i);
  assert.match(result.text, /&lt;script&gt;/);
});
