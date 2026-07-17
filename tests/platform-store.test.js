const assert = require('node:assert/strict');
const test = require('node:test');
const { ingestKnowledge, searchKnowledge, chunkText } = require('../netlify/functions/_platform/knowledge.cjs');
const { MemoryStore, serviceAccount } = require('../netlify/functions/_platform/store.cjs');
const { nextRun, planForUser } = require('../netlify/functions/assistant.js');

test('isolates stored documents by authenticated user', async () => {
  const first = new MemoryStore(`store-a-${Date.now()}`);
  const second = new MemoryStore(`store-b-${Date.now()}`);
  await first.put('memories', 'shared-id', { text: 'first user only' });
  await second.put('memories', 'shared-id', { text: 'second user only' });
  assert.equal((await first.get('memories', 'shared-id')).text, 'first user only');
  assert.equal((await second.get('memories', 'shared-id')).text, 'second user only');
});

test('chunks and retrieves project knowledge with citations', async () => {
  const store = new MemoryStore(`knowledge-${Date.now()}`);
  const text = 'TwinkleOS uses an authenticated gateway. '.repeat(100);
  assert.ok(chunkText(text).length > 1);
  const ingested = await ingestKnowledge(store, { title: 'Security notes', type: 'text', text, projectId: 'project_one' });
  assert.ok(ingested.chunkCount > 1);
  const results = await searchKnowledge(store, 'authenticated gateway', { projectId: 'project_one' });
  assert.ok(results.length > 0);
  assert.equal(results[0].citation.title, 'Security notes');
  assert.equal(results[0].match, 'keyword');
  assert.equal('vector' in results[0], false);
});

test('computes bounded interval and one-time schedules', () => {
  const now = new Date('2026-07-16T00:00:00.000Z');
  assert.equal(nextRun({ schedule: { type: 'once' } }, now), null);
  assert.equal(nextRun({ schedule: { type: 'interval', minutes: 5 } }, now), '2026-07-16T00:15:00.000Z');
  assert.equal(nextRun({ schedule: { type: 'interval', minutes: 60 } }, now), '2026-07-16T01:00:00.000Z');
});

test('accepts subscription level only from verified Firebase custom attributes', () => {
  assert.equal(planForUser({ customAttributes: '{"twinklePlan":"pro"}' }), 'pro');
  assert.equal(planForUser({ customAttributes: '{"twinklePlan":"enterprise"}' }), 'free');
  assert.equal(planForUser({ customAttributes: 'invalid' }), 'free');
  const previous = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON = '{"project_id":"missing-credentials"}';
  try { assert.equal(serviceAccount(), null); }
  finally { if (previous === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON; else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = previous; }
});
