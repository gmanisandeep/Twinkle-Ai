const { providerConfig, providerSignal } = require('../_shared.cjs');

const health = new Map();
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RESPONSE_BYTES = 2_000_000;

function envText(name, fallback = '', max = 500) {
  const value = String(process.env[name] || fallback).trim();
  return value.length <= max ? value : fallback;
}

function envInt(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function safeHttpsBase(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function safeOllamaBase(value) {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (!loopback || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString().replace(/\/$/, '');
  } catch { return ''; }
}

function configs() {
  const existing = providerConfig();
  const openaiBase = safeHttpsBase(envText('OPENAI_COMPATIBLE_BASE_URL', 'https://api.openai.com/v1', 1_000));
  const ollamaBase = safeOllamaBase(envText('OLLAMA_BASE_URL', '', 1_000));
  return {
    deepseek: { key: existing.deepSeekKey, model: existing.deepSeekModel, configured: Boolean(existing.deepSeekKey) },
    gemini: { key: existing.geminiKey, model: existing.geminiModels[0], models: existing.geminiModels, configured: Boolean(existing.geminiKey && existing.geminiModels.length) },
    openai: {
      key: envText('OPENAI_COMPATIBLE_API_KEY', '', 10_000), baseUrl: openaiBase,
      model: envText('OPENAI_COMPATIBLE_MODEL', '', 200),
      configured: Boolean(envText('OPENAI_COMPATIBLE_API_KEY', '', 10_000) && openaiBase && envText('OPENAI_COMPATIBLE_MODEL', '', 200)),
    },
    ollama: {
      baseUrl: ollamaBase, model: envText('OLLAMA_MODEL', '', 200),
      configured: Boolean(ollamaBase && envText('OLLAMA_MODEL', '', 200)),
    },
  };
}

function toGemini(messages) {
  const system = messages.filter((item) => item.role === 'system').map((item) => item.content).join('\n\n');
  const contents = messages.filter((item) => item.role !== 'system').map((item) => ({
    role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(item.content || '') }],
  }));
  return { system_instruction: system ? { parts: [{ text: system }] } : undefined, contents };
}

function normalizeUsage(usage = {}) {
  return {
    inputTokens: usage.prompt_tokens ?? usage.promptTokenCount ?? 0,
    outputTokens: usage.completion_tokens ?? usage.candidatesTokenCount ?? 0,
    totalTokens: usage.total_tokens ?? usage.totalTokenCount ?? 0,
  };
}

async function readJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Provider response exceeded the safety limit.');
  try { return JSON.parse(text || '{}'); } catch { throw new Error('Provider returned an invalid response.'); }
}

async function callProvider(name, config, messages, options = {}) {
  let url;
  let request;
  if (name === 'deepseek') {
    url = 'https://api.deepseek.com/chat/completions';
    request = {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: { model: options.model || config.model, messages, stream: false, temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens || 2_048 },
    };
  } else if (name === 'openai') {
    url = `${config.baseUrl}/chat/completions`;
    request = {
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.key}` },
      body: { model: options.model || config.model, messages, stream: false, temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens || 2_048 },
    };
  } else if (name === 'gemini') {
    const model = options.model || config.model;
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.key)}`;
    const converted = toGemini(messages);
    request = {
      headers: { 'Content-Type': 'application/json' },
      body: { ...converted, generationConfig: { temperature: options.temperature ?? 0.2, maxOutputTokens: options.maxTokens || 2_048 } },
    };
  } else if (name === 'ollama') {
    url = `${config.baseUrl}/api/chat`;
    request = {
      headers: { 'Content-Type': 'application/json' },
      body: { model: options.model || config.model, messages, stream: false, options: { temperature: options.temperature ?? 0.2 } },
    };
  } else throw new Error('Unsupported provider.');

  const response = await fetch(url, {
    method: 'POST', headers: request.headers, body: JSON.stringify(request.body), signal: providerSignal(),
  });
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(`Provider request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  if (name === 'gemini') {
    return {
      text: data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '',
      model: options.model || config.model, usage: normalizeUsage(data.usageMetadata), finishReason: data.candidates?.[0]?.finishReason || null,
    };
  }
  if (name === 'ollama') {
    return {
      text: data.message?.content || '', model: data.model || config.model,
      usage: { inputTokens: data.prompt_eval_count || 0, outputTokens: data.eval_count || 0, totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0) },
      finishReason: data.done_reason || null,
    };
  }
  return {
    text: data.choices?.[0]?.message?.content || '', model: data.model || config.model,
    usage: normalizeUsage(data.usage), finishReason: data.choices?.[0]?.finish_reason || null,
  };
}

function providerTargets(role = 'general', privacy = 'cloud') {
  if (privacy === 'local') return [{ name: 'ollama', model: null }];
  const roleValue = envText(`MODEL_ROLE_${String(role).toUpperCase()}`, '', 250);
  const preferred = roleValue ? roleValue.split(',') : envText('PROVIDER_ORDER', 'deepseek,gemini,openai,ollama', 250).split(',');
  const seen = new Set();
  return preferred.map((item) => {
    const [name, ...model] = item.trim().split(':');
    return { name, model: model.join(':').trim() || null };
  }).filter((item) => ['deepseek', 'gemini', 'openai', 'ollama'].includes(item.name) && !seen.has(item.name) && seen.add(item.name));
}

function providerOrder(role = 'general', privacy = 'cloud') {
  return providerTargets(role, privacy).map((item) => item.name);
}

function isCircuitOpen(name) {
  return (health.get(name)?.openUntil || 0) > Date.now();
}

function markSuccess(name) {
  health.set(name, { failures: 0, lastSuccess: new Date().toISOString(), openUntil: 0 });
}

function markFailure(name) {
  const previous = health.get(name) || { failures: 0 };
  const failures = previous.failures + 1;
  health.set(name, { ...previous, failures, lastFailure: new Date().toISOString(), openUntil: failures >= 3 ? Date.now() + 30_000 : 0 });
}

function estimateCost(name, usage) {
  const prefix = name.toUpperCase();
  const input = Number.parseFloat(process.env[`${prefix}_INPUT_USD_PER_MILLION`] || '');
  const output = Number.parseFloat(process.env[`${prefix}_OUTPUT_USD_PER_MILLION`] || '');
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  return Number((((usage.inputTokens || 0) * input + (usage.outputTokens || 0) * output) / 1_000_000).toFixed(8));
}

async function invokeWithFallback(messages, options = {}) {
  const available = configs();
  const failures = [];
  const retries = envInt('PROVIDER_RETRIES', 1, 0, 2);
  for (const target of providerTargets(options.role, options.privacy)) {
    const name = target.name;
    const config = available[name];
    if (!config?.configured || isCircuitOpen(name)) continue;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const result = await callProvider(name, config, messages, { ...options, model: target.model || options.model });
        if (!result.text) throw new Error('Provider returned an empty response.');
        markSuccess(name);
        return { ...result, provider: name, costUsd: estimateCost(name, result.usage), attempts: attempt + 1 };
      } catch (error) {
        markFailure(name);
        failures.push({ provider: name, status: error.status || null, reason: error.name === 'TimeoutError' ? 'timeout' : 'unavailable' });
        if (!TRANSIENT.has(error.status) && error.name !== 'TimeoutError') break;
      }
    }
  }
  const error = new Error('All configured AI providers are temporarily unavailable.');
  error.code = 'PROVIDERS_UNAVAILABLE';
  error.failures = failures;
  throw error;
}

function providerHealth() {
  const available = configs();
  return Object.entries(available).map(([name, config]) => ({
    name, configured: config.configured, model: config.model || null,
    status: !config.configured ? 'disabled' : isCircuitOpen(name) ? 'cooldown' : 'ready',
    failures: health.get(name)?.failures || 0,
  }));
}

async function analyzeImage(input) {
  const config = configs().gemini;
  if (!config.configured) throw new Error('Image understanding requires a configured Gemini provider.');
  const mimeType = String(input.mimeType || '').toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) throw new Error('Unsupported image type.');
  const data = String(input.data || '');
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(data) || Buffer.byteLength(data, 'base64') > 3_000_000) throw new Error('Image must be valid Base64 and no larger than 3 MB.');
  const prompt = String(input.prompt || 'Describe this image accurately for a searchable personal knowledge base. Include visible text and important context.').slice(0, 2_000);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.key)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mimeType, data } }, { text: prompt }] }] }),
    signal: providerSignal(),
  });
  const result = await readJson(response);
  if (!response.ok) throw new Error(`Image provider request failed (${response.status}).`);
  const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  if (!text) throw new Error('Image provider returned an empty description.');
  return { text, provider: 'gemini', model: config.model, usage: normalizeUsage(result.usageMetadata) };
}

module.exports = { analyzeImage, configs, invokeWithFallback, providerHealth, providerOrder, providerTargets, safeHttpsBase, safeOllamaBase };
