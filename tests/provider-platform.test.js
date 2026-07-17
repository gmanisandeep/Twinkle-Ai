const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeImage, invokeWithFallback, providerHealth, safeHttpsBase, safeOllamaBase } = require('../netlify/functions/_platform/providers.cjs');

test('accepts only safe provider base URLs', () => {
  assert.equal(safeHttpsBase('https://api.example.test/v1/'), 'https://api.example.test/v1');
  assert.equal(safeHttpsBase('http://api.example.test/v1'), '');
  assert.equal(safeOllamaBase('http://127.0.0.1:11434/'), 'http://127.0.0.1:11434');
  assert.equal(safeOllamaBase('http://192.168.1.2:11434'), '');
});

test('retries transient failures and falls back without exposing keys', async () => {
  const originalFetch = global.fetch;
  const original = Object.fromEntries(['DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'GEMINI_MODELS', 'PROVIDER_ORDER', 'PROVIDER_RETRIES'].map((key) => [key, process.env[key]]));
  process.env.DEEPSEEK_API_KEY = 'deepseek-local-test';
  process.env.GEMINI_API_KEY = 'gemini-local-test';
  process.env.GEMINI_MODELS = 'gemini-test';
  process.env.PROVIDER_ORDER = 'deepseek,gemini';
  process.env.PROVIDER_RETRIES = '1';
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('api.deepseek.com')) return new Response('{"error":"busy"}', { status: 503 });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'fallback worked' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 } }), { status: 200 });
  };
  try {
    const result = await invokeWithFallback([{ role: 'user', content: 'hello' }]);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.text, 'fallback worked');
    assert.equal(calls.filter((call) => call.url.includes('deepseek')).length, 2);
    assert.doesNotMatch(JSON.stringify(result), /local-test/);
    assert.equal(providerHealth().find((item) => item.name === 'gemini').status, 'ready');
  } finally {
    global.fetch = originalFetch;
    Object.entries(original).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value);
  }
});

test('sends bounded inline images to Gemini without returning image data', async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModels = process.env.GEMINI_MODELS;
  process.env.GEMINI_API_KEY = 'vision-test-key';
  process.env.GEMINI_MODELS = 'vision-test-model';
  let body;
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'A blue diagram.' }] } }] }), { status: 200 });
  };
  try {
    const result = await analyzeImage({ mimeType: 'image/png', data: Buffer.from('not-a-real-image').toString('base64'), prompt: 'Describe it.' });
    assert.equal(result.text, 'A blue diagram.');
    assert.equal(body.contents[0].parts[0].inline_data.mime_type, 'image/png');
    assert.equal('data' in result, false);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalKey;
    if (originalModels === undefined) delete process.env.GEMINI_MODELS; else process.env.GEMINI_MODELS = originalModels;
  }
});
