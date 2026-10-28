import { candidate, integer, requireRule, applyEffort } from './rules.js';

export function validateLanes(lanes) {
  requireRule(Array.isArray(lanes) && lanes.length >= 1 && lanes.length <= 3, 'lanes');
  for (const lane of lanes) {
    requireRule(lane && typeof lane === 'object' && !Array.isArray(lane) && Object.keys(lane).every(k => ['workerId', 'jobId', 'share', 'stageId'].includes(k)), 'lanes');
    requireRule(['maker', 'apprentice', 'blacksmith', 'carver', 'finisher'].includes(lane.workerId), 'workerUnavailable');
    requireRule(lane.jobId === null || (typeof lane.jobId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(lane.jobId)), 'lanes');
    requireRule(lane.stageId === undefined || (lane.jobId !== null && typeof lane.stageId === 'string' && /^[a-z0-9-]{1,80}$/.test(lane.stageId)), 'lanes');
    requireRule(Number.isInteger(lane.share) && lane.share >= 10 && lane.share <= 100 && lane.share % 10 === 0, 'shares');
  }
  requireRule(new Set(lanes.map(l => l.workerId)).size === lanes.length && new Set(lanes.map(l => `${l.jobId ?? ''}:${l.stageId ?? ''}`)).size === lanes.length, 'lanes');
  requireRule(lanes.reduce((n, l) => n + l.share, 0) === 100, 'shares');
  return lanes;
}
export function readPlan(session) {
  requireRule(typeof session.currentPlan === 'string' && session.currentPlan.length <= 2048, 'storage');
  const plan = JSON.parse(session.currentPlan);
  if (plan.version === 1) return validateLanes([{ workerId: plan.workerId ?? 'maker', jobId: plan.jobId ?? null, share: 100 }]);
  requireRule(plan.version === 2, 'storage'); return validateLanes(plan.lanes);
}
export function readSpans(session) {
  requireRule(typeof session.allocationSummary === 'string' && session.allocationSummary.length <= 16384, 'storage');
  const summary = JSON.parse(session.allocationSummary), lanes = readPlan(session);
  requireRule([1, 2, 3].includes(summary.version) && Array.isArray(summary.spans) && summary.spans.length === session.partCount && summary.spans.length <= 32, 'storage');
  if (summary.version === 2) requireRule(Array.isArray(summary.plans) && summary.plans.length === summary.spans.length, 'storage');
  if (summary.version === 3) requireRule(Array.isArray(summary.shares) && summary.shares.length === summary.spans.length, 'storage');
  return summary.spans.map((seconds, i) => {
    integer(seconds, 0, session.limitSeconds);
    if (summary.version === 3) requireRule(Array.isArray(summary.shares[i]) && summary.shares[i].length === lanes.length, 'storage');
    const plan = summary.version === 2 ? validateLanes(summary.plans[i]) : summary.version === 3 ? validateLanes(lanes.map((lane, j) => ({ ...lane, share: summary.shares[i][j] }))) : lanes;
    requireRule(plan.length === lanes.length && plan.every((l, j) => l.jobId === lanes[j].jobId && l.workerId === lanes[j].workerId && l.stageId === lanes[j].stageId), 'storage');
    return { seconds, lanes: plan };
  });
}
export function retainSpans(spans, seconds) {
  return spans.map(span => { const keep = Math.min(span.seconds, seconds); seconds -= keep; return { ...span, seconds: keep }; });
}
export function spanSummary(spans, values = {}) {
  return JSON.stringify({ version: 3, appliedSeconds: 0, bankSeconds: 0, ...values,
    spans: spans.map(s => s.seconds), shares: spans.map(s => s.lanes.map(l => l.share)) });
}
/** Integrated integer quotas. Remainders survive pauses and share changes; saved order breaks ties. */
export function sessionAllocations(session, seconds = candidate(session, Date.now()), now = Date.now()) {
  const lanes = readPlan(session), spans = readSpans(session);
  if (session.activeSince !== null) spans.push({ seconds: Math.max(0, candidate(session, now) - session.candidateClosedSeconds), lanes });
  integer(seconds, 0, candidate(session, now));
  const kept = retainSpans(spans, seconds);
  const quotas = lanes.map((_, i) => kept.reduce((total, span) => total + span.seconds * span.lanes[i].share, 0));
  const amounts = quotas.map(q => Math.floor(q / 100));
  const order = lanes.map((_, i) => i).sort((a, b) => quotas[b] % 100 - quotas[a] % 100 || a - b);
  const remainder = seconds - amounts.reduce((total, n) => total + n, 0);
  for (let i = 0; i < remainder; i++) amounts[order[i]]++;
  return lanes.map((lane, i) => ({ ...lane, seconds: amounts[i] }));
}
export function allocationPreview(session, jobs, seconds = candidate(session, Date.now()), now = Date.now()) {
  const changed = new Map();
  return sessionAllocations(session, seconds, now).map(lane => {
    const original = jobs.find(j => j.id === lane.jobId);
    let appliedSeconds = 0;
    if (original && lane.seconds > 0) {
      const job = changed.get(original.id) ?? original;
      const result = applyEffort(job, lane.seconds, lane.workerId, lane.stageId, original);
      changed.set(job.id, { ...job, ...result.update }); appliedSeconds = result.applied;
    }
    return { ...lane, appliedSeconds, bankedSeconds: lane.seconds - appliedSeconds };
  });
}
