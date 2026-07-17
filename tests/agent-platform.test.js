const assert = require('node:assert/strict');
const test = require('node:test');
const { approveExecution, createExecution, parseDecision } = require('../netlify/functions/_platform/agent.cjs');
const { MemoryStore } = require('../netlify/functions/_platform/store.cjs');
const { isPrivateAddress, listTools, stripHtml } = require('../netlify/functions/_platform/tools.cjs');

test('parses structured actions and direct final answers', () => {
  assert.equal(parseDecision('{"type":"tool","tool":"tasks.create","arguments":{"title":"Ship"}}').tool, 'tasks.create');
  assert.equal(parseDecision('A direct answer').answer, 'A direct answer');
});

test('classifies tools and strips active web content', () => {
  assert.equal(listTools().find((tool) => tool.name === 'tasks.create').permission, 'sensitive');
  assert.equal(listTools().find((tool) => tool.name === 'sandbox.execute').permission, 'disabled');
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('8.8.8.8'), false);
  assert.equal(stripHtml('<script>steal()</script><p>Useful &amp; safe</p>'), 'Useful & safe');
});

test('pauses a sensitive agent tool for approval and verifies completion', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalOrder = process.env.PROVIDER_ORDER;
  process.env.DEEPSEEK_API_KEY = 'agent-test-key';
  process.env.PROVIDER_ORDER = 'deepseek';
  let round = 0;
  global.fetch = async () => {
    round += 1;
    const content = round === 1
      ? JSON.stringify({ type: 'tool', tool: 'tasks.create', arguments: { title: 'Verify Twinkle' }, rationale: 'Track the work.' })
      : JSON.stringify({ type: 'final', answer: 'Created the verified task.', verification: 'The task tool succeeded.' });
    return new Response(JSON.stringify({ model: 'test-model', choices: [{ message: { content }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 4 } }), { status: 200 });
  };
  const store = new MemoryStore(`agent-${Date.now()}`);
  const context = { userId: 'agent-user', idToken: 'test', store };
  try {
    const pending = await createExecution(context, { goal: 'Create a task' });
    assert.equal(pending.status, 'awaiting_approval');
    assert.equal(pending.pending.tool, 'tasks.create');
    const complete = await approveExecution(context, { executionId: pending.id, approved: true });
    assert.equal(complete.status, 'completed');
    assert.equal(complete.verification.passed, true);
    assert.equal((await store.list('tasks')).length, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = originalKey;
    if (originalOrder === undefined) delete process.env.PROVIDER_ORDER; else process.env.PROVIDER_ORDER = originalOrder;
  }
});
