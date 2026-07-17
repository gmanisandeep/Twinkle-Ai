const {
  bearerToken, checkRateLimit, originAllowed, requestId, responseHeaders, verifyFirebaseToken,
} = require('./_shared.cjs');
const { approveExecution, createExecution } = require('./_platform/agent.cjs');
const { deleteKnowledge, ingestKnowledge, searchKnowledge } = require('./_platform/knowledge.cjs');
const { getUsage } = require('./_platform/policy.cjs');
const { analyzeImage, providerHealth } = require('./_platform/providers.cjs');
const { COLLECTIONS, createStore, newId, safeSegment } = require('./_platform/store.cjs');
const { listTools } = require('./_platform/tools.cjs');

const MAX_BODY_BYTES = 4_500_000;
const PROFILE_ID = 'account';
const FOCUS_AREAS = new Set(['career', 'learning', 'freelancing', 'business', 'coding', 'content', 'productivity', 'research', 'personal-projects']);

function reply(statusCode, headers, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
}

function protocolFor(event) {
  try { return new URL(event.rawUrl).protocol.replace(/:$/, ''); }
  catch {
    return (event.headers?.['x-forwarded-proto'] || event.headers?.['X-Forwarded-Proto'] || 'https').split(',')[0].trim();
  }
}

function cleanText(value, max) {
  return String(value || '').replace(/\u0000/g, '').trim().slice(0, max);
}

function safePhotoUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.toString().slice(0, 2_000) : '';
  } catch { return ''; }
}

function planForUser(user) {
  try {
    const claims = JSON.parse(user.customAttributes || '{}');
    return claims.twinklePlan === 'pro' ? 'pro' : 'free';
  } catch { return 'free'; }
}

function nextRun(job, now = new Date()) {
  if (job.schedule?.type === 'once') return null;
  if (job.schedule?.type === 'interval') {
    const minutes = Math.min(43_200, Math.max(15, Number(job.schedule.minutes) || 60));
    return new Date(now.getTime() + minutes * 60_000).toISOString();
  }
  if (job.schedule?.type === 'daily') {
    const [hour, minute] = String(job.schedule.time || '09:00').split(':').map(Number);
    const date = new Date(now);
    date.setUTCHours(Math.min(23, Math.max(0, hour || 0)), Math.min(59, Math.max(0, minute || 0)), 0, 0);
    if (date <= now) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  }
  return null;
}

async function dispatch(action, payload, context) {
  const { store } = context;
  if (action === 'agent.run') return createExecution(context, payload);
  if (action === 'agent.approve') return approveExecution(context, payload);
  if (action === 'providers.health') return { providers: providerHealth() };
  if (action === 'tools.list') return { tools: listTools() };
  if (action === 'usage.get') return { usage: await getUsage(store, context.plan) };

  if (action === 'profile.get') return { profile: await store.get('profiles', PROFILE_ID) };
  if (action === 'profile.upsert') {
    const existing = await store.get('profiles', PROFILE_ID);
    const displayName = cleanText(payload.displayName ?? existing?.displayName ?? context.user?.displayName, 80);
    const primaryGoal = cleanText(payload.primaryGoal ?? existing?.primaryGoal, 500);
    const focusAreas = Array.isArray(payload.focusAreas)
      ? [...new Set(payload.focusAreas.map((item) => cleanText(item, 40)).filter((item) => FOCUS_AREAS.has(item)))].slice(0, 12)
      : (Array.isArray(existing?.focusAreas) ? existing.focusAreas : []);
    const onboardingCompleted = existing?.onboardingCompleted === true || payload.onboardingCompleted === true;
    if (onboardingCompleted && (!displayName || !primaryGoal)) throw new Error('Display name and primary goal are required to finish onboarding.');
    const now = new Date().toISOString();
    const profile = await store.put('profiles', PROFILE_ID, {
      displayName,
      email: cleanText(context.user?.email || existing?.email, 320),
      photoURL: safePhotoUrl(context.user?.photoUrl || context.user?.photoURL || existing?.photoURL),
      focusAreas,
      primaryGoal,
      onboardingCompleted,
      onboardingStep: onboardingCompleted ? 3 : Math.min(3, Math.max(1, Number(payload.onboardingStep) || Number(existing?.onboardingStep) || 1)),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    return { profile };
  }

  if (action === 'memory.list') return { memories: await store.list('memories', 500) };
  if (action === 'memory.search') {
    const query = cleanText(payload.query, 4_000).toLowerCase();
    const memories = (await store.list('memories', 500)).filter((item) => JSON.stringify(item).toLowerCase().includes(query)).slice(0, 30);
    return { memories };
  }
  if (action === 'memory.upsert') {
    const id = payload.id ? safeSegment(payload.id) : newId('memory');
    return { memory: await store.put('memories', id, { text: cleanText(payload.text, 8_000), category: cleanText(payload.category || 'context', 40), projectId: cleanText(payload.projectId, 120), pinned: Boolean(payload.pinned), createdAt: payload.createdAt || new Date().toISOString() }) };
  }
  if (action === 'memory.delete') return { deleted: await store.delete('memories', safeSegment(payload.id)) };
  if (action === 'memory.clear') return { deleted: await store.clear('memories') };
  if (action === 'tasks.list') return { tasks: await store.list('tasks', 500) };
  if (action === 'files.list') return { files: await store.list('files', 500) };
  if (action === 'notes.list') return { notes: await store.list('notes', 500) };

  if (action === 'projects.list') return { projects: await store.list('projects', 200) };
  if (action === 'projects.upsert') {
    const id = payload.id ? safeSegment(payload.id) : newId('project');
    return { project: await store.put('projects', id, { name: cleanText(payload.name, 200), description: cleanText(payload.description, 8_000), instructions: cleanText(payload.instructions, 8_000), color: cleanText(payload.color || '#ffffff', 20), modelRole: cleanText(payload.modelRole || 'planner', 40), privacy: payload.privacy === 'local' ? 'local' : 'cloud', enabledTools: Array.isArray(payload.enabledTools) ? payload.enabledTools.slice(0, 50).map((item) => cleanText(item, 100)) : [], createdAt: payload.createdAt || new Date().toISOString() }) };
  }
  if (action === 'projects.delete') return { deleted: await store.delete('projects', safeSegment(payload.id)) };

  if (action === 'knowledge.list') return { sources: await store.list('knowledgeSources', 500) };
  if (action === 'knowledge.ingest') return ingestKnowledge(store, payload);
  if (action === 'knowledge.search') return { results: await searchKnowledge(store, payload.query, { projectId: payload.projectId, limit: payload.limit }) };
  if (action === 'knowledge.delete') return { deleted: await deleteKnowledge(store, safeSegment(payload.sourceId)) };
  if (action === 'vision.analyze') return analyzeImage(payload);

  if (action === 'jobs.list') return { jobs: await store.list('jobs', 200) };
  if (action === 'jobs.upsert') {
    const id = payload.id ? safeSegment(payload.id) : newId('job');
    const job = { name: cleanText(payload.name, 200), goal: cleanText(payload.goal, 8_000), enabled: payload.enabled !== false, projectId: cleanText(payload.projectId, 120), schedule: payload.schedule || { type: 'once', at: payload.nextRunAt }, nextRunAt: payload.nextRunAt || nextRun({ schedule: payload.schedule }), createdAt: payload.createdAt || new Date().toISOString(), lastRunAt: payload.lastRunAt || null };
    return { job: await store.put('jobs', id, job) };
  }
  if (action === 'jobs.delete') return { deleted: await store.delete('jobs', safeSegment(payload.id)) };
  if (action === 'jobs.runDue') {
    const now = new Date();
    const due = (await store.list('jobs', 100)).filter((job) => job.enabled && job.nextRunAt && new Date(job.nextRunAt) <= now).slice(0, 3);
    const executions = [];
    for (const job of due) {
      executions.push(await createExecution(context, { goal: job.goal, projectId: job.projectId, role: 'planner' }));
      await store.put('jobs', job.id, { ...job, lastRunAt: now.toISOString(), nextRunAt: nextRun(job, now), enabled: job.schedule?.type !== 'once' });
    }
    return { executions };
  }

  if (action === 'account.export') {
    const data = {};
    for (const collection of COLLECTIONS) data[collection] = await store.list(collection, 500);
    return { exportedAt: new Date().toISOString(), schemaVersion: 1, data };
  }
  if (action === 'account.delete') {
    let deleted = 0;
    const collections = [];
    for (const collection of COLLECTIONS) {
      try {
        const count = await store.clear(collection);
        deleted += count;
        collections.push({ collection, status: 'deleted', count });
      } catch (error) {
        collections.push({ collection, status: 'failed', count: 0, error: 'Could not delete this data group.' });
      }
    }
    const failures = collections.filter((item) => item.status === 'failed');
    return {
      complete: failures.length === 0,
      deleted,
      collections,
      failures: failures.map((item) => item.collection),
      completedAt: new Date().toISOString(),
    };
  }
  throw new Error('Unsupported assistant action.');
}

exports.handler = async (event) => {
  const id = requestId();
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const host = event.headers?.host || event.headers?.Host || '';
  const protocol = protocolFor(event);
  const headers = responseHeaders(origin, host, id, protocol);
  if (!originAllowed(origin, host, protocol)) return reply(403, headers, { error: 'Origin not allowed.', requestId: id });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, headers, { error: 'Method not allowed.', requestId: id });
  if (!process.env.FIREBASE_API_KEY) return reply(500, headers, { error: 'Server authentication is not configured.', requestId: id });
  const idToken = bearerToken(event.headers?.authorization || event.headers?.Authorization);
  if (!idToken) return reply(401, headers, { error: 'Authentication required.', requestId: id });
  let user;
  try { user = await verifyFirebaseToken(idToken); } catch { user = null; }
  if (!user?.localId) return reply(401, headers, { error: 'Session expired. Please sign in again.', requestId: id });
  const rate = checkRateLimit(`assistant:${user.localId}`);
  headers['X-RateLimit-Limit'] = String(rate.limit);
  headers['X-RateLimit-Remaining'] = String(rate.remaining);
  if (!rate.allowed) return reply(429, { ...headers, 'Retry-After': String(rate.retryAfter) }, { error: 'Too many requests. Please wait and try again.', requestId: id });
  if (Buffer.byteLength(event.body || '', 'utf8') > MAX_BODY_BYTES) return reply(413, headers, { error: 'Request is too large.', requestId: id });
  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, headers, { error: 'Invalid request body.', requestId: id }); }
  const action = cleanText(input.action, 100);
  const context = { userId: user.localId, user, idToken, plan: planForUser(user), store: createStore({ userId: user.localId, idToken }) };
  try {
    const result = await dispatch(action, input.payload || {}, context);
    return reply(200, headers, { ok: true, result, requestId: id });
  } catch (error) {
    const status = error.code === 'QUOTA_EXCEEDED' ? 429 : /required|invalid|unsupported|too large/i.test(error.message) ? 400 : 500;
    console.warn(`[Twinkle:${id}] Assistant action ${action || 'unknown'} failed: ${error.name}`);
    return reply(status, headers, { error: status === 500 ? 'The requested operation could not be completed.' : error.message, requestId: id });
  }
};

exports.dispatch = dispatch;
exports.nextRun = nextRun;
exports.planForUser = planForUser;
