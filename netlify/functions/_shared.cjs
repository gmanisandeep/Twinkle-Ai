const crypto = require('node:crypto');

const DEFAULT_SYSTEM_PROMPT = [
  'You are Twinkle, a helpful personal AI assistant.',
  'Be accurate, practical, and honest about uncertainty.',
  'Never claim that an external action was completed unless a tool result confirms it.',
].join(' ');

const MAX_MESSAGES = 40;
const MAX_REQUEST_BYTES = 120_000;
const MAX_PART_TEXT = 24_000;
const MAX_SYSTEM_PROMPT = 8_000;
const DEFAULT_RATE_LIMIT = 20;
const DEFAULT_RATE_WINDOW_MS = 60_000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 45_000;
const MAX_CONFIGURED_ORIGINS = 50;
const MAX_PROVIDER_MODELS = 5;
const MAX_RATE_BUCKETS = 5_000;

const rateBuckets = new Map();

function envNumber(name, fallback, minimum, maximum) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function requestId() {
  return crypto.randomUUID();
}

function normalizedOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return '';
    return url.origin;
  } catch {
    return '';
  }
}

function configuredOrigins() {
  return new Set(
    (process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .slice(0, MAX_CONFIGURED_ORIGINS)
      .map(normalizedOrigin)
      .filter(Boolean),
  );
}

function originAllowed(origin, host, protocol = 'https') {
  if (!origin) return true;
  const normalized = normalizedOrigin(origin);
  if (!normalized) return false;
  if (configuredOrigins().has(normalized)) return true;
  const safeProtocol = String(protocol || '').replace(/:$/, '').toLowerCase();
  if (!['http', 'https'].includes(safeProtocol)) return false;
  return normalized === normalizedOrigin(`${safeProtocol}://${host}`);
}

function responseHeaders(origin, host, id, protocol = 'https', contentType = 'application/json; charset=utf-8') {
  const allowed = originAllowed(origin, host, protocol);
  return {
    'Access-Control-Allow-Origin': allowed && origin ? normalizedOrigin(origin) : 'null',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': id,
  };
}

function bearerToken(value) {
  const match = /^Bearer[\t ]+(\S+)$/i.exec(String(value || '').trim());
  return match && match[1].length <= 10_000 ? match[1] : '';
}

function validateChatRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Invalid request body.' };
  }

  const serialized = JSON.stringify(input);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_REQUEST_BYTES) {
    return { error: 'Conversation is too large. Start a new chat.', status: 413 };
  }

  const { messages } = input;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { error: 'Missing messages array.' };
  }
  if (messages.length > MAX_MESSAGES) {
    return { error: 'Conversation is too large. Start a new chat.', status: 413 };
  }

  const cleanMessages = [];
  for (const message of messages) {
    if (!message || !['user', 'model'].includes(message.role) || !Array.isArray(message.parts)) {
      return { error: 'Messages must contain valid user or model turns.' };
    }
    const parts = [];
    for (const part of message.parts) {
      if (!part || typeof part.text !== 'string') {
        return { error: 'Only text message parts are currently supported.' };
      }
      const text = part.text.trim();
      if (!text || text.length > MAX_PART_TEXT) {
        return { error: 'A message is empty or too large.', status: text.length > MAX_PART_TEXT ? 413 : 400 };
      }
      parts.push({ text });
    }
    if (!parts.length) return { error: 'A message must contain text.' };
    cleanMessages.push({ role: message.role, parts });
  }

  if (cleanMessages.at(-1)?.role !== 'user') {
    return { error: 'The final conversation turn must be from the user.' };
  }

  const clientPrompt = typeof input.systemPrompt === 'string'
    ? input.systemPrompt.trim().slice(0, MAX_SYSTEM_PROMPT)
    : '';
  const systemPrompt = clientPrompt
    ? `${DEFAULT_SYSTEM_PROMPT}\n\nUser-specific context and response preferences:\n${clientPrompt}`
    : DEFAULT_SYSTEM_PROMPT;

  return { messages: cleanMessages, systemPrompt };
}

function checkRateLimit(userId) {
  const limit = envNumber('RATE_LIMIT_PER_MINUTE', DEFAULT_RATE_LIMIT, 1, 500);
  const windowMs = envNumber('RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_WINDOW_MS, 1_000, 3_600_000);
  const now = Date.now();
  const existing = rateBuckets.get(userId);
  if (!existing && rateBuckets.size >= MAX_RATE_BUCKETS) {
    for (const [key, value] of rateBuckets) {
      if (now >= value.resetAt) rateBuckets.delete(key);
    }
    if (rateBuckets.size >= MAX_RATE_BUCKETS) {
      return { allowed: false, limit, remaining: 0, retryAfter: Math.max(1, Math.ceil(windowMs / 1_000)) };
    }
  }
  const bucket = !existing || now >= existing.resetAt
    ? { count: 0, resetAt: now + windowMs }
    : existing;
  bucket.count += 1;
  rateBuckets.set(userId, bucket);

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1_000)),
  };
}

function providerSignal() {
  const timeout = envNumber('PROVIDER_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS, 5_000, 120_000);
  return AbortSignal.timeout(timeout);
}

async function verifyFirebaseToken(idToken) {
  const key = process.env.FIREBASE_API_KEY;
  if (!key) return null;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      signal: providerSignal(),
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.users?.[0] || null;
}

function providerConfig() {
  const safeModel = (value, fallback) => {
    const model = String(value || '').trim();
    return model && model.length <= 200 && /^[a-zA-Z0-9._:/-]+$/.test(model) ? model : fallback;
  };
  return {
    deepSeekKey: String(process.env.DEEPSEEK_API_KEY || '').trim().slice(0, 10_000),
    deepSeekModel: safeModel(process.env.DEEPSEEK_MODEL, 'deepseek-v4-pro'),
    geminiKey: String(process.env.GEMINI_API_KEY || '').trim().slice(0, 10_000),
    geminiModels: (process.env.GEMINI_MODELS || 'gemini-3.5-flash,gemini-flash-latest,gemini-2.5-flash')
      .split(',')
      .map((model) => safeModel(model, ''))
      .filter(Boolean)
      .slice(0, MAX_PROVIDER_MODELS),
  };
}

module.exports = {
  bearerToken,
  checkRateLimit,
  originAllowed,
  providerConfig,
  providerSignal,
  requestId,
  responseHeaders,
  validateChatRequest,
  verifyFirebaseToken,
};
