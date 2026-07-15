const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

const GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
];

const DEEPSEEK_MODEL = 'deepseek-v4-pro';
const JSON_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function verifyToken(idToken) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.users?.[0] || null;
}

export function toDeepSeekMessages(messages, systemPrompt) {
  return [
    { role: 'system', content: systemPrompt || 'You are Twinkle, a helpful AI assistant.' },
    ...messages
      .filter((message) => Array.isArray(message.parts) && message.parts.some((part) => part?.text))
      .slice(-40)
      .map((message) => ({
        role: message.role === 'model' ? 'assistant' : 'user',
        content: message.parts.map((part) => part?.text || '').join('\n').trim(),
      })),
  ];
}

function geminiBody(messages, systemPrompt) {
  return {
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
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };
}

async function openProviderStream(messages, systemPrompt) {
  const errors = [];

  if (DEEPSEEK_API_KEY) {
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: toDeepSeekMessages(messages, systemPrompt),
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.85,
          max_tokens: 1500,
        }),
      });
      if (response.ok && response.body) {
        return { response, provider: 'deepseek', model: DEEPSEEK_MODEL };
      }
      errors.push(`DeepSeek HTTP ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      errors.push(`DeepSeek: ${error.message}`);
    }
  }

  for (const model of GEMINI_API_KEY ? GEMINI_MODELS : []) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody(messages, systemPrompt)),
        },
      );
      if (response.ok && response.body) return { response, provider: 'google', model };
      errors.push(`Gemini ${model} HTTP ${response.status}`);
      await response.body?.cancel();
      if (![404, 429].includes(response.status)) break;
    } catch (error) {
      errors.push(`Gemini ${model}: ${error.message}`);
    }
  }

  throw new Error(errors.join(' | ') || 'No AI provider is configured');
}

export function extractProviderChunk(provider, payload) {
  if (provider === 'deepseek') {
    return {
      text: payload.choices?.[0]?.delta?.content || '',
      reasoning: Boolean(payload.choices?.[0]?.delta?.reasoning_content),
      usage: payload.usage || null,
      finishReason: payload.choices?.[0]?.finish_reason || null,
    };
  }

  return {
    text: payload.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '',
    reasoning: false,
    usage: payload.usageMetadata || null,
    finishReason: payload.candidates?.[0]?.finishReason || null,
  };
}

function eventBytes(encoder, event, data) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function normalizedStream(upstream, provider, model) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let upstreamReader = null;

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      upstreamReader = reader;
      let buffer = '';
      let phase = 'thinking';
      let usage = null;
      let finishReason = null;

      controller.enqueue(eventBytes(encoder, 'meta', { provider, model }));
      controller.enqueue(eventBytes(encoder, 'phase', { phase }));

      const consumeEvent = (block) => {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');
        if (!data || data === '[DONE]') return;

        let payload;
        try {
          payload = JSON.parse(data);
        } catch {
          return;
        }

        const chunk = extractProviderChunk(provider, payload);
        usage = chunk.usage || usage;
        finishReason = chunk.finishReason || finishReason;
        if (chunk.reasoning && phase !== 'thinking') {
          phase = 'thinking';
          controller.enqueue(eventBytes(encoder, 'phase', { phase }));
        }
        if (chunk.text) {
          if (phase !== 'responding') {
            phase = 'responding';
            controller.enqueue(eventBytes(encoder, 'phase', { phase }));
          }
          controller.enqueue(eventBytes(encoder, 'delta', { text: chunk.text }));
        }
      };

      try {
        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop() || '';
          blocks.forEach(consumeEvent);
          if (done) break;
        }
        if (buffer.trim()) consumeEvent(buffer);
        controller.enqueue(eventBytes(encoder, 'done', { provider, model, usage, finishReason }));
        controller.close();
      } catch (error) {
        controller.enqueue(eventBytes(encoder, 'error', { error: 'The AI stream was interrupted. Please try again.' }));
        controller.close();
        console.warn('[Twinkle] Provider stream interrupted:', error.message);
      } finally {
        reader.releaseLock();
        upstreamReader = null;
      }
    },
    cancel(reason) {
      upstreamReader?.cancel(reason).catch(() => {});
    },
  });
}

export default async (request) => {
  if (request.method === 'OPTIONS') return new Response('', { status: 200, headers: JSON_HEADERS });
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!FIREBASE_API_KEY || (!DEEPSEEK_API_KEY && !GEMINI_API_KEY)) {
    return jsonResponse(500, { error: 'Server not configured. Contact admin.' });
  }

  const idToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!idToken) return jsonResponse(401, { error: 'Authentication required. Please sign in.' });

  try {
    if (!await verifyToken(idToken)) throw new Error('Invalid token');
  } catch {
    return jsonResponse(401, { error: 'Session expired. Please sign in again.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body.' });
  }

  const { messages, systemPrompt } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse(400, { error: 'Missing messages array.' });
  }
  if (messages.length > 40 || JSON.stringify(messages).length > 120000) {
    return jsonResponse(413, { error: 'Conversation is too large. Start a new chat.' });
  }

  try {
    const opened = await openProviderStream(messages, systemPrompt);
    return new Response(normalizedStream(opened.response.body, opened.provider, opened.model), {
      headers: {
        ...JSON_HEADERS,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error('[Twinkle] All streaming providers failed:', error.message);
    return jsonResponse(502, {
      error: 'AI service is temporarily unavailable. Check the configured provider keys and try again.',
    });
  }
};
