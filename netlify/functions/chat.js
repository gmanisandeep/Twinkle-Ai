/* ═══════════════════════════════════════════════════════════
   TWINKLE v3.0 — NETLIFY SERVERLESS PROXY
   netlify/functions/chat.js

   Sits between the browser and configured AI providers.
   - Verifies Firebase ID token
   - Uses DeepSeek as primary and Gemini as an optional fallback
   - Keeps provider credentials on the server
   - Returns response JSON

   Env vars required (set in Netlify dashboard):
     DEEPSEEK_API_KEY → your DeepSeek API key
     GEMINI_API_KEY   → optional Google Gemini fallback key
     FIREBASE_API_KEY → your Firebase web API key (from firebaseConfig)
   ═══════════════════════════════════════════════════════════ */

const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

const BASE_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-v4-pro';

// Models to try in priority order
const MODEL_PRIORITY = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

/* ── VERIFY FIREBASE TOKEN ─────────────────────────────── */
async function verifyToken(idToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.users?.[0] || null;
}

/* ── CALL GEMINI (non-streaming) ───────────────────────── */
async function callGemini(model, body) {
  return fetch(
    `${BASE_GEMINI_URL}/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

async function callDeepSeek(messages, systemPrompt) {
  const convertedMessages = [
    {
      role: 'system',
      content: systemPrompt || 'You are Twinkle, a helpful AI assistant.',
    },
    ...messages
      .filter(message => Array.isArray(message.parts) && message.parts.some(part => part?.text))
      .slice(-40)
      .map(message => ({
        role: message.role === 'model' ? 'assistant' : 'user',
        content: message.parts.map(part => part?.text || '').join('\n').trim(),
      })),
  ];

  return fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: convertedMessages,
      stream: false,
      temperature: 0.85,
      max_tokens: 1500,
    }),
  });
}

/* ── MAIN HANDLER ─────────────────────────────────────── */
exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Check server config
  if (!FIREBASE_API_KEY || (!DEEPSEEK_API_KEY && !GEMINI_API_KEY)) {
    console.error('[Twinkle] Missing Firebase configuration or AI provider key');
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ error: 'Server not configured. Contact admin.' }),
    };
  }

  // ── AUTHENTICATE ────────────────────────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!idToken) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Authentication required. Please sign in.' }) };
  }

  let user;
  try {
    user = await verifyToken(idToken);
    if (!user) throw new Error('Token invalid');
  } catch (e) {
    return {
      statusCode: 401,
      headers: CORS,
      body: JSON.stringify({ error: 'Session expired. Please sign in again.' }),
    };
  }

  // ── PARSE REQUEST ────────────────────────────────────────
  let req;
  try {
    req = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const { messages, systemPrompt } = req;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing messages array.' }) };
  }

  if (messages.length > 40 || JSON.stringify(messages).length > 120000) {
    return { statusCode: 413, headers: CORS, body: JSON.stringify({ error: 'Conversation is too large. Start a new chat.' }) };
  }

  const providerErrors = [];

  if (DEEPSEEK_API_KEY) {
    try {
      const res = await callDeepSeek(messages, systemPrompt);
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const text = data.choices?.[0]?.message?.content || '';
        if (text) {
          return {
            statusCode: 200,
            headers: CORS,
            body: JSON.stringify({
              text,
              provider: 'deepseek',
              model: data.model || DEEPSEEK_MODEL,
              finishReason: data.choices?.[0]?.finish_reason || 'stop',
              userId: user.localId,
              usage: data.usage || null,
            }),
          };
        }
      }

      providerErrors.push(`DeepSeek HTTP ${res.status}`);
      console.warn('[Twinkle] DeepSeek request failed:', res.status, data?.error?.message || 'Unknown error');
    } catch (error) {
      providerErrors.push('DeepSeek network error');
      console.warn('[Twinkle] DeepSeek network error:', error.message);
    }
  }

  // ── BUILD GEMINI BODY ────────────────────────────────────
  const geminiBody = {
    system_instruction: {
      parts: [{ text: systemPrompt || 'You are Twinkle, a helpful AI assistant.' }],
    },
    contents: messages,
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 1500,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',  threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT',  threshold: 'BLOCK_NONE' },
    ],
  };

  // ── TRY MODELS IN PRIORITY ORDER ─────────────────────────
  for (const model of GEMINI_API_KEY ? MODEL_PRIORITY : []) {
    let res;
    try {
      res = await callGemini(model, geminiBody);
    } catch (e) {
      console.warn(`[Twinkle] Network error on ${model}:`, e.message);
      continue;
    }

    // Skip rate-limited or unknown models
    if (res.status === 429 || res.status === 404) continue;

    let data;
    try {
      data = await res.json();
    } catch {
      continue;
    }

    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      // Quota/rate errors → try next model
      if (res.status === 429 || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate')) {
        continue;
      }
      providerErrors.push(`Gemini ${model}: ${msg}`);
      console.warn(`[Twinkle] Gemini request failed on ${model}:`, msg);
      break;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data.candidates?.[0]?.finishReason || 'STOP';

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        text,
        provider: 'google',
        model,
        finishReason,
        userId: user.localId,
        usage: data.usageMetadata || null,
      }),
    };
  }

  console.error('[Twinkle] All providers failed:', providerErrors.join(' | '));
  return {
    statusCode: 502,
    headers: CORS,
    body: JSON.stringify({ error: 'AI service is temporarily unavailable. Check the configured provider keys and try again.' }),
  };
};
