function verifyExecution(goal, answer, steps) {
  const issues = [];
  const completedTools = steps.filter((step) => step.type === 'tool' && step.status === 'completed');
  const failedTools = steps.filter((step) => step.type === 'tool' && step.status === 'failed');
  if (!String(answer || '').trim()) issues.push('The final response was empty.');
  if (failedTools.length) issues.push(`${failedTools.length} tool action(s) failed.`);
  const claimedCompletion = /\b(completed|finished|done|sent|created|deleted|updated)\b/i.test(answer || '');
  if (claimedCompletion && !completedTools.length && steps.some((step) => step.type === 'tool')) {
    issues.push('Completion claims were not supported by successful tool output.');
  }
  return {
    passed: issues.length === 0,
    issues,
    checks: { goalPresent: Boolean(goal), answerPresent: Boolean(String(answer || '').trim()), successfulTools: completedTools.length, failedTools: failedTools.length },
  };
}

module.exports = { verifyExecution };
