const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

test('stream endpoint normalizes provider SSE without exposing credentials', async () => {
  const originalFetch = global.fetch;
  const originalEnv = {
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };
  process.env.DEEPSEEK_API_KEY = 'deepseek-test-secret';
  process.env.FIREBASE_API_KEY = 'firebase-test-key';
  delete process.env.GEMINI_API_KEY;

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('identitytoolkit.googleapis.com')) {
      return new Response(JSON.stringify({ users: [{ localId: 'user-1' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (String(url) === 'https://api.deepseek.com/chat/completions') {
      const sse = [
        'data: {"choices":[{"delta":{"reasoning_content":"checking"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}',
        '',
        'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"stop"}],"usage":{"total_tokens":8}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n');
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const moduleUrl = `${pathToFileURL(path.join(__dirname, '..', 'netlify', 'functions', 'chat-stream.mjs')).href}?test=${Date.now()}`;
    const streamFunction = await import(moduleUrl);
    const response = await streamFunction.default(new Request('https://example.test/.netlify/functions/chat-stream', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer firebase-token',
        origin: 'https://example.test',
      },
      body: JSON.stringify({
        systemPrompt: 'You are Twinkle.',
        messages: [{ role: 'user', parts: [{ text: 'Hi' }] }],
      }),
    }));

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://example.test');
    assert.equal(response.headers.get('x-ratelimit-limit'), '20');
    assert.equal(response.headers.get('x-ratelimit-remaining'), '19');
    const body = await response.text();
    assert.match(body, /event: meta/);
    assert.match(body, /event: phase/);
    assert.match(body, /"text":"Hello"/);
    assert.match(body, /"text":" there"/);
    assert.match(body, /event: done/);
    assert.doesNotMatch(body, /deepseek-test-secret/);

    const providerCall = calls.find(call => call.url.includes('api.deepseek.com'));
    assert.ok(providerCall.options.signal instanceof AbortSignal);
    const requestBody = JSON.parse(providerCall.options.body);
    assert.equal(requestBody.stream, true);
    assert.equal(requestBody.messages[1].content, 'Hi');
  } finally {
    global.fetch = originalFetch;
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('client parser handles named SSE events and JSON payloads', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'api.js'), 'utf8');
  const context = { console, setTimeout, clearTimeout, TextDecoder, Uint8Array };
  vm.createContext(context);
  vm.runInContext(`${source}\n;globalThis.__api = API;`, context);
  const parsed = context.__api.parseSSEBlock('event: delta\ndata: {"text":"Twinkle"}');
  assert.equal(parsed.event, 'delta');
  assert.equal(parsed.data.text, 'Twinkle');
});
