const {
  bearerToken,
  checkRateLimit,
  originAllowed,
  providerConfig,
  providerSignal,
  requestId,
  responseHeaders,
  validateChatRequest,
  verifyFirebaseToken,
} = require('./_shared.cjs');
const { invokeWithFallback, providerHealth } = require('./_platform/providers.cjs');

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

function reply(statusCode, headers, body, extraHeaders = {}) {
  return { statusCode, headers: { ...headers, ...extraHeaders }, body: JSON.stringify(body) };
}

function toDeepSeekMessages(messages, systemPrompt) {
  return [
    { role: 'system', content: systemPrompt },
    ...messages.map((message) => ({
      role: message.role === 'model' ? 'assistant' : 'user',
      content: message.parts.map((part) => part.text).join('\n'),
    })),
  ];
}

function geminiBody(messages, systemPrompt) {
  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: messages,
    generationConfig: { temperature: 0.8, topP: 0.95, maxOutputTokens: 2_048 },
  };
}

async function callDeepSeek(config, messages, systemPrompt) {
  return fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.deepSeekKey}`,
    },
    body: JSON.stringify({
      model: config.deepSeekModel,
      messages: toDeepSeekMessages(messages, systemPrompt),
      thinking: { type: 'disabled' },
      stream: false,
      temperature: 0.8,
      max_tokens: 2_048,
    }),
    signal: providerSignal(),
  });
}

async function callGemini(config, model, messages, systemPrompt) {
  return fetch(
    `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.geminiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody(messages, systemPrompt)),
      signal: providerSignal(),
    },
  );
}

exports.handler = async (event) => {
  const id = requestId();
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const host = event.headers?.host || event.headers?.Host || '';
  let protocol = 'https';
  try {
    protocol = new URL(event.rawUrl).protocol.replace(/:$/, '');
  } catch {
    protocol = (event.headers?.['x-forwarded-proto'] || event.headers?.['X-Forwarded-Proto'] || protocol)
      .split(',')[0]
      .trim();
  }
  const headers = responseHeaders(origin, host, id, protocol);

  if (!originAllowed(origin, host, protocol)) return reply(403, headers, { error: 'Origin not allowed.', requestId: id });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { error: 'Method not allowed.', requestId: id });

  const config = providerConfig();
  if (!process.env.FIREBASE_API_KEY || !providerHealth().some((provider) => provider.configured)) {
    console.error(`[Twinkle:${id}] Missing Firebase configuration or AI provider key`);
    return reply(500, headers, { error: 'Server not configured. Contact admin.', requestId: id });
  }

  const idToken = bearerToken(event.headers?.authorization || event.headers?.Authorization);
  if (!idToken) return reply(401, headers, { error: 'Authentication required. Please sign in.', requestId: id });

  let user;
  try {
    user = await verifyFirebaseToken(idToken);
  } catch (error) {
    console.warn(`[Twinkle:${id}] Firebase verification failed: ${error.name}`);
  }
  if (!user?.localId) return reply(401, headers, { error: 'Session expired. Please sign in again.', requestId: id });

  const rate = checkRateLimit(user.localId);
  headers['X-RateLimit-Limit'] = String(rate.limit);
  headers['X-RateLimit-Remaining'] = String(rate.remaining);
  if (!rate.allowed) {
    return reply(429, headers, { error: 'Too many requests. Please wait and try again.', requestId: id }, {
      'Retry-After': String(rate.retryAfter),
    });
  }

  let input;
  try {
    input = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, headers, { error: 'Invalid request body.', requestId: id });
  }
  const validated = validateChatRequest(input);
  if (validated.error) return reply(validated.status || 400, headers, { error: validated.error, requestId: id });

  const messages = [
    { role: 'system', content: validated.systemPrompt },
    ...validated.messages.map((message) => ({ role: message.role === 'model' ? 'assistant' : 'user', content: message.parts.map((part) => part.text).join('\n') })),
  ];
  try {
    const result = await invokeWithFallback(messages, { role: 'general', temperature: 0.8, maxTokens: 2_048 });
    return reply(200, headers, {
      text: result.text, provider: result.provider, model: result.model,
      finishReason: result.finishReason || 'stop', usage: result.usage, costUsd: result.costUsd,
      attempts: result.attempts, requestId: id,
    });
  } catch (error) {
    console.error(`[Twinkle:${id}] All providers failed: ${error.code || error.name}`);
    return reply(502, headers, { error: 'AI service is temporarily unavailable. Please try again shortly.', requestId: id });
  }
};

exports.toDeepSeekMessages = toDeepSeekMessages;
