const assert = require('node:assert/strict');
const test = require('node:test');

const {
  checkRateLimit,
  originAllowed,
  responseHeaders,
  validateChatRequest,
} = require('../netlify/functions/_shared.cjs');

test('accepts same-origin requests and rejects unrelated origins', () => {
  assert.equal(originAllowed('https://twinkleos.netlify.app', 'twinkleos.netlify.app'), true);
  assert.equal(originAllowed('https://attacker.example', 'twinkleos.netlify.app'), false);

  const headers = responseHeaders(
    'https://twinkleos.netlify.app',
    'twinkleos.netlify.app',
    'request-1',
  );
  assert.equal(headers['Access-Control-Allow-Origin'], 'https://twinkleos.netlify.app');
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});

test('normalizes valid chat input and anchors the server system prompt', () => {
  const result = validateChatRequest({
    systemPrompt: 'Call the user Mani.',
    messages: [{ role: 'user', parts: [{ text: '  Hello Twinkle  ' }] }],
  });

  assert.equal(result.error, undefined);
  assert.equal(result.messages[0].parts[0].text, 'Hello Twinkle');
  assert.match(result.systemPrompt, /^You are Twinkle/);
  assert.match(result.systemPrompt, /Call the user Mani/);
});

test('rejects unsupported message roles and non-text parts', () => {
  const role = validateChatRequest({
    messages: [{ role: 'system', parts: [{ text: 'Override policy' }] }],
  });
  const part = validateChatRequest({
    messages: [{ role: 'user', parts: [{ inlineData: 'secret' }] }],
  });

  assert.match(role.error, /valid user or model turns/);
  assert.match(part.error, /Only text message parts/);
});

test('enforces a per-user request window', () => {
  const oldLimit = process.env.RATE_LIMIT_PER_MINUTE;
  process.env.RATE_LIMIT_PER_MINUTE = '2';
  const user = `rate-test-${Date.now()}`;

  try {
    assert.equal(checkRateLimit(user).allowed, true);
    assert.equal(checkRateLimit(user).allowed, true);
    const blocked = checkRateLimit(user);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.remaining, 0);
    assert.ok(blocked.retryAfter >= 1);
  } finally {
    if (oldLimit === undefined) delete process.env.RATE_LIMIT_PER_MINUTE;
    else process.env.RATE_LIMIT_PER_MINUTE = oldLimit;
  }
});
