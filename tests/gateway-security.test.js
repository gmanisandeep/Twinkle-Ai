const assert = require('node:assert/strict');
const test = require('node:test');

const {
  bearerToken,
  checkRateLimit,
  originAllowed,
  providerConfig,
  providerSignal,
  responseHeaders,
  validateChatRequest,
} = require('../netlify/functions/_shared.cjs');

test('accepts same-origin requests and rejects unrelated origins', () => {
  assert.equal(originAllowed('https://twinkleos.netlify.app', 'twinkleos.netlify.app'), true);
  assert.equal(originAllowed('http://twinkleos.netlify.app', 'twinkleos.netlify.app'), false);
  assert.equal(originAllowed('https://twinkleos.netlify.app:444', 'twinkleos.netlify.app'), false);
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

test('allows only normalized configured browser origins', () => {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = 'https://app.example/, javascript:alert(1), https://bad.example/path';
  try {
    assert.equal(originAllowed('https://app.example', 'service.example'), true);
    assert.equal(originAllowed('https://bad.example', 'service.example'), false);
    assert.equal(originAllowed('null', 'service.example'), false);
  } finally {
    if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previous;
  }
});

test('accepts only a bounded Bearer authorization token', () => {
  assert.equal(bearerToken('Bearer firebase-token'), 'firebase-token');
  assert.equal(bearerToken('bearer\tfirebase-token'), 'firebase-token');
  assert.equal(bearerToken('Basic firebase-token'), '');
  assert.equal(bearerToken('firebase-token'), '');
  assert.equal(bearerToken('Bearer token with spaces'), '');
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

test('bounds timeout and provider model settings from the server environment', () => {
  const originalTimeout = AbortSignal.timeout;
  const originalEnv = {
    PROVIDER_TIMEOUT_MS: process.env.PROVIDER_TIMEOUT_MS,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    GEMINI_MODELS: process.env.GEMINI_MODELS,
  };
  let timeout;
  AbortSignal.timeout = (milliseconds) => {
    timeout = milliseconds;
    return { milliseconds };
  };
  process.env.PROVIDER_TIMEOUT_MS = '999999';
  process.env.DEEPSEEK_MODEL = 'invalid model?';
  process.env.GEMINI_MODELS = 'one,two,three,four,five,six,invalid model?';

  try {
    providerSignal();
    assert.equal(timeout, 120_000);
    const config = providerConfig();
    assert.equal(config.deepSeekModel, 'deepseek-v4-pro');
    assert.deepEqual(config.geminiModels, ['one', 'two', 'three', 'four', 'five']);
  } finally {
    AbortSignal.timeout = originalTimeout;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
