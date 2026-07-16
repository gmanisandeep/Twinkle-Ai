import shared from './_shared.cjs';
import providers from './_platform/providers.cjs';

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
} = shared;
const { providerHealth } = providers;

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

function jsonResponse(status, headers, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, ...extraHeaders } });
}

export function toDeepSeekMessages(messages, systemPrompt) {
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

async function openProviderStream(config, messages, systemPrompt) {
  const failures = [];

  if (config.deepSeekKey) {
    try {
      const response = await fetch(DEEPSEEK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.deepSeekKey}`,
        },
        body: JSON.stringify({
          model: config.deepSeekModel,
          messages: toDeepSeekMessages(messages, systemPrompt),
          thinking: { type: 'disabled' },
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.8,
          max_tokens: 2_048,
        }),
        signal: providerSignal(),
      });
      if (response.ok && response.body) {
        return { response, provider: 'deepseek', model: config.deepSeekModel };
      }
      failures.push(`DeepSeek HTTP ${response.status}`);
      await response.body?.cancel();
    } catch (error) {
      failures.push(`DeepSeek ${error.name || 'network error'}`);
    }
  }

  for (const model of config.geminiKey ? config.geminiModels : []) {
    try {
      const response = await fetch(
        `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(config.geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody(messages, systemPrompt)),
          signal: providerSignal(),
        },
      );
      if (response.ok && response.body) return { response, provider: 'google', model };
      failures.push(`Gemini ${model} HTTP ${response.status}`);
      await response.body?.cancel();
      if (![404, 429].includes(response.status)) break;
    } catch (error) {
      failures.push(`Gemini ${model} ${error.name || 'network error'}`);
    }
  }

  throw new Error(failures.join(' | ') || 'No AI provider is configured');
}

export function extractProviderChunk(provider, payload) {
  if (provider === 'deepseek') {
    return {
      text: payload.choices?.[0]?.delta?.content || '',
      reasoning: payload.choices?.[0]?.delta?.reasoning_content || '',
      usage: payload.usage || null,
      finishReason: payload.choices?.[0]?.finish_reason || null,
    };
  }
  return {
    text: payload.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || '',
    reasoning: '',
    usage: payload.usageMetadata || null,
    finishReason: payload.candidates?.[0]?.finishReason || null,
  };
}

function eventBytes(encoder, event, data) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function normalizedStream(upstream, provider, model, id) {
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
      let outputStarted = false;

      controller.enqueue(eventBytes(encoder, 'meta', { provider, model, requestId: id }));
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
        if (chunk.reasoning) {
          controller.enqueue(eventBytes(encoder, 'reasoning', { text: chunk.reasoning }));
        }
        if (chunk.text) {
          outputStarted = true;
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
        controller.enqueue(eventBytes(encoder, 'done', { provider, model, usage, finishReason, requestId: id }));
        controller.close();
      } catch (error) {
        console.warn(`[Twinkle:${id}] Provider stream interrupted afterOutput=${outputStarted}: ${error.name}`);
        controller.enqueue(eventBytes(encoder, 'error', {
          error: 'The AI stream was interrupted. Please try again.',
          requestId: id,
        }));
        controller.close();
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
  const id = requestId();
  const origin = request.headers.get('origin') || '';
  const requestUrl = new URL(request.url);
  const host = request.headers.get('host') || requestUrl.host;
  const protocol = requestUrl.protocol.replace(/:$/, '');
  const headers = responseHeaders(origin, host, id, protocol);

  if (!originAllowed(origin, host, protocol)) return jsonResponse(403, headers, { error: 'Origin not allowed.', requestId: id });
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers });
  if (request.method !== 'POST') return jsonResponse(405, headers, { error: 'Method not allowed.', requestId: id });

  const config = providerConfig();
  const configuredProviders = providerHealth().filter((provider) => provider.configured);
  if (!process.env.FIREBASE_API_KEY || !configuredProviders.length) {
    console.error(`[Twinkle:${id}] Missing Firebase configuration or AI provider key`);
    return jsonResponse(500, headers, { error: 'Server not configured. Contact admin.', requestId: id });
  }
  if (!config.deepSeekKey && !config.geminiKey && configuredProviders.length) {
    return jsonResponse(501, headers, { error: 'Streaming is unavailable for the configured provider; use the chat fallback.', requestId: id });
  }

  const idToken = bearerToken(request.headers.get('authorization'));
  if (!idToken) return jsonResponse(401, headers, { error: 'Authentication required. Please sign in.', requestId: id });

  let user;
  try {
    user = await verifyFirebaseToken(idToken);
  } catch (error) {
    console.warn(`[Twinkle:${id}] Firebase verification failed: ${error.name}`);
  }
  if (!user?.localId) return jsonResponse(401, headers, { error: 'Session expired. Please sign in again.', requestId: id });

  const rate = checkRateLimit(user.localId);
  headers['X-RateLimit-Limit'] = String(rate.limit);
  headers['X-RateLimit-Remaining'] = String(rate.remaining);
  if (!rate.allowed) {
    return jsonResponse(429, headers, { error: 'Too many requests. Please wait and try again.', requestId: id }, {
      'Retry-After': String(rate.retryAfter),
    });
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return jsonResponse(400, headers, { error: 'Invalid request body.', requestId: id });
  }
  const validated = validateChatRequest(input);
  if (validated.error) {
    return jsonResponse(validated.status || 400, headers, { error: validated.error, requestId: id });
  }

  try {
    const opened = await openProviderStream(config, validated.messages, validated.systemPrompt);
    return new Response(normalizedStream(opened.response.body, opened.provider, opened.model, id), {
      headers: {
        ...headers,
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    console.error(`[Twinkle:${id}] All streaming providers failed: ${error.message}`);
    return jsonResponse(502, headers, {
      error: 'AI service is temporarily unavailable. Please try again shortly.',
      requestId: id,
    });
  }
};
