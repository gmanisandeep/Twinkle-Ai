const PLAN_LIMITS = {
  free: { agentRoundsPerDay: 50, storedItems: 500, activeJobs: 5 },
  pro: { agentRoundsPerDay: 500, storedItems: 5_000, activeJobs: 50 },
};

function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function getUsage(store, requestedPlan = 'free') {
  const plan = PLAN_LIMITS[requestedPlan] ? requestedPlan : 'free';
  const stored = (await store.get('usage', dayKey())) || { id: dayKey(), day: dayKey(), agentRounds: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  return { ...stored, plan };
}

async function consumeUsage(store, patch = {}, requestedPlan = 'free') {
  const usage = await getUsage(store, requestedPlan);
  const plan = PLAN_LIMITS[usage.plan] || PLAN_LIMITS.free;
  const nextRounds = usage.agentRounds + (patch.agentRounds || 0);
  if (nextRounds > plan.agentRoundsPerDay) {
    const error = new Error('Daily agent usage limit reached.');
    error.code = 'QUOTA_EXCEEDED';
    throw error;
  }
  return store.put('usage', dayKey(), {
    ...usage,
    agentRounds: nextRounds,
    inputTokens: usage.inputTokens + (patch.inputTokens || 0),
    outputTokens: usage.outputTokens + (patch.outputTokens || 0),
    costUsd: Number((usage.costUsd + (patch.costUsd || 0)).toFixed(8)),
  });
}

function validateGoal(value) {
  const goal = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (!goal) throw new Error('A goal is required.');
  if (goal.length > 8_000) throw new Error('Goal is too large.');
  return goal;
}

async function audit(store, entry) {
  const id = `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return store.put('audit', id, {
    type: String(entry.type || 'event').slice(0, 80),
    action: String(entry.action || '').slice(0, 200),
    status: String(entry.status || '').slice(0, 40),
    executionId: String(entry.executionId || '').slice(0, 120),
    createdAt: new Date().toISOString(),
  });
}

module.exports = { PLAN_LIMITS, audit, consumeUsage, dayKey, getUsage, validateGoal };
