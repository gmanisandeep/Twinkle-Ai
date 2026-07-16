const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

test('routes authenticated chat requests to DeepSeek without exposing the key', async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };

  process.env.DEEPSEEK_API_KEY = 'test-deepseek-secret';
  process.env.FIREBASE_API_KEY = 'test-firebase-key';
  delete process.env.GEMINI_API_KEY;

  const functionPath = path.join(__dirname, '..', 'netlify', 'functions', 'chat.js');
  delete require.cache[require.resolve(functionPath)];

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('identitytoolkit.googleapis.com')) {
      return new Response(JSON.stringify({ users: [{ localId: 'user-123' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://api.deepseek.com/chat/completions') {
      return new Response(JSON.stringify({
          model: 'deepseek-v4-pro',
          choices: [{ message: { content: 'Ready to help.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const { handler } = require(functionPath);
    const response = await handler({
      httpMethod: 'POST',
      rawUrl: 'https://twinkleos.netlify.app/.netlify/functions/chat',
      headers: {
        authorization: 'Bearer firebase-id-token',
        host: 'twinkleos.netlify.app',
        origin: 'https://twinkleos.netlify.app',
      },
      body: JSON.stringify({
        systemPrompt: 'You are Twinkle.',
        messages: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      }),
    });

    assert.equal(response.statusCode, 200);
    const body = JSON.parse(response.body);
    assert.equal(body.provider, 'deepseek');
    assert.equal(body.model, 'deepseek-v4-pro');
    assert.equal(body.text, 'Ready to help.');
    assert.equal(response.headers['Access-Control-Allow-Origin'], 'https://twinkleos.netlify.app');
    assert.equal(response.headers['X-RateLimit-Limit'], '20');
    assert.equal(response.headers['X-RateLimit-Remaining'], '19');

    const providerCall = calls.find(call => call.url.includes('api.deepseek.com'));
    assert.equal(providerCall.options.headers.Authorization, 'Bearer test-deepseek-secret');
    assert.ok(providerCall.options.signal instanceof AbortSignal);
    assert.doesNotMatch(response.body, /test-deepseek-secret/);

    const requestBody = JSON.parse(providerCall.options.body);
    assert.equal(requestBody.messages[0].role, 'system');
    assert.equal(requestBody.messages[1].role, 'user');
  } finally {
    global.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    delete require.cache[require.resolve(functionPath)];
  }
});
