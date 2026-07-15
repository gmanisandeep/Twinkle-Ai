/* ═══════════════════════════════════════════════════════════
   TWINKLE v3.0 — NETLIFY SERVERLESS PROXY
   netlify/functions/chat.js

   Sits between the browser and Gemini.
   - Verifies Firebase ID token
   - Calls Gemini with the secret GEMINI_API_KEY (never exposed)
   - Returns response JSON

   Env vars required (set in Netlify dashboard):
     GEMINI_API_KEY   → your Google Gemini API key
     FIREBASE_API_KEY → your Firebase web API key (from firebaseConfig)
   ═══════════════════════════════════════════════════════════ */

const GEMINI_API_KEY   = process.env.GEMINI_API_KEY;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

const BASE_GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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
  if (!GEMINI_API_KEY || !FIREBASE_API_KEY) {
    console.error('[Twinkle] Missing env vars: GEMINI_API_KEY or FIREBASE_API_KEY');
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
  for (const model of MODEL_PRIORITY) {
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
      // Auth error → surface to client
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: msg }) };
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const finishReason = data.candidates?.[0]?.finishReason || 'STOP';

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        text,
        model,
        finishReason,
        userId: user.localId,
        usage: data.usageMetadata || null,
      }),
    };
  }

  // All models exhausted
  return {
    statusCode: 429,
    headers: CORS,
    body: JSON.stringify({ error: 'All AI models are busy right now. Wait 30 seconds and try again.' }),
  };
};
