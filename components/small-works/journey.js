import { eligibleTargets, applyEffort, targetSeconds } from '../../lib/game/rules.js';
import { allocationPreview, sessionAllocations } from '../../lib/game/allocation.js';
import { PANEL_IDS } from '../../lib/pages.js';

export const hasUnlock = (snapshot, id) => (snapshot?.unlocks || []).some(item => (item.unlockId || item.key || item.unlockKey || item.id) === id);
const activeStaff = (snapshot, id) => snapshot?.crew?.some(item => item.staffId === id && item.status === 'active');
const groups = {
  starter: recipe => !recipe.requiredUnlock,
  advanced: recipe => recipe.requiredUnlock === 'joinery-bench' && !recipe.mixed,
  metal: recipe => recipe.requiredStaff === 'blacksmith' && !recipe.mixed,
  mixed: recipe => Boolean(recipe.mixed),
};

export function hasCrafted(snapshot) {
  return (snapshot?.unlocks || []).some(item => (item.unlockId || item.key || item.unlockKey || item.id)?.startsWith('recipe:')) || (snapshot?.jobs || []).some(job => job.kind === 'object' && job.completedFinish >= 0);
}
export function visiblePanels(snapshot, current = 'workshop') {
  const initialized = snapshot?.initialized;
  const crafted = hasCrafted(snapshot);
  const advanced = hasUnlock(snapshot, 'carpenter-room') || Boolean(snapshot?.crew?.length);
  const visible = new Set(['workshop', current]);
  if (initialized) { visible.add('workbench'); visible.add('tasks'); }
  if (crafted || advanced) { visible.add('growth'); visible.add('showroom'); }
  if (advanced) visible.add('crew');
  if (hasUnlock(snapshot, 'craft-yard') || hasUnlock(snapshot, 'neighborhood-greenhouse') || snapshot?.jobs?.some(job => job.kind === 'community')) visible.add('community');
  if (snapshot?.history?.length || snapshot?.session || snapshot?.workshop?.lifetimeFocusSeconds > 0) visible.add('history');
  return PANEL_IDS.filter(id => visible.has(id));
}

/** One requirement model is formatted by both the workshop and full upgrades view. */
export function expansionProgress(snapshot, expansion) {
  const complete = hasUnlock(snapshot, expansion.id);
  const current = snapshot.jobs?.find(job => job.kind === 'improvement' && job.recipeId === expansion.id && job.status === 'making');
  const wallet = snapshot.workshop || {};
  const requirements = [
    { key: 'coins', current: wallet.coinMinor || 0, required: expansion.materialMinor, complete: complete || Boolean(current) || wallet.coinMinor >= expansion.materialMinor },
    { key: 'focus', current: wallet.lifetimeFocusSeconds || 0, required: expansion.requiredFocusSeconds, complete: wallet.lifetimeFocusSeconds >= expansion.requiredFocusSeconds },
  ];
  for (const [field, group, key] of [['requiredDistinctRecipes', 'starter', 'starterRecipes'], ['requiredAdvancedRecipes', 'advanced', 'advancedRecipes'], ['requiredMetalRecipes', 'metal', 'metalRecipes'], ['requiredMixedRecipes', 'mixed', 'mixedRecipes']]) {
    if (!expansion[field]) continue;
    const count = (snapshot.content?.recipes || []).filter(recipe => groups[group](recipe) && hasUnlock(snapshot, `recipe:${recipe.id}`)).length;
    requirements.push({ key, group, current: count, required: expansion[field], complete: count >= expansion[field] });
  }
  if (expansion.requiredStaff) requirements.push({ key: 'activeWorker', id: expansion.requiredStaff, complete: Boolean(activeStaff(snapshot, expansion.requiredStaff)) });
  if (expansion.requiredUnlock) requirements.push({ key: 'unlock', id: expansion.requiredUnlock, complete: hasUnlock(snapshot, expansion.requiredUnlock) });
  const otherImprovement = snapshot.jobs?.find(job => ['improvement', 'onboarding'].includes(job.kind) && job.status === 'making' && job.id !== current?.id);
  return { expansion, complete, current, requirements, otherImprovement };
}
export function nextMilestone(snapshot) {
  const expansion = snapshot?.content?.expansions?.find(item => !hasUnlock(snapshot, item.id));
  return expansion ? expansionProgress(snapshot, expansion) : null;
}
export function suggestedRecipe(snapshot, milestone = nextMilestone(snapshot)) {
  const open = (snapshot?.jobs || []).filter(job => job.kind === 'object' && ['making', 'ready'].includes(job.status));
  const recipes = (snapshot?.content?.recipes || []).filter(recipe => recipe.materialMinor <= (snapshot.workshop?.coinMinor || 0) && (!recipe.requiredUnlock || hasUnlock(snapshot, recipe.requiredUnlock)) && (!recipe.requiredStaff || activeStaff(snapshot, recipe.requiredStaff)) && !open.some(job => job.recipeId === recipe.id));
  const unfinished = recipes.filter(recipe => !hasUnlock(snapshot, `recipe:${recipe.id}`));
  const unmetGroups = milestone?.requirements.filter(item => item.group && !item.complete).map(item => item.group) || [];
  return unfinished.find(recipe => unmetGroups.some(group => groups[group](recipe))) || unfinished[0] || recipes.find(recipe => recipe.materialMinor === 0) || recipes[0] || null;
}

export function recipeAdvancesMilestone(snapshot, recipe, milestone = nextMilestone(snapshot)) {
  return Boolean(recipe && !hasUnlock(snapshot, `recipe:${recipe.id}`) && milestone?.requirements.some(item => item.group && !item.complete && groups[item.group](recipe)));
}

export function preferredTargets(jobs, workerId, preferredJobId) {
  const ordered = [...jobs].sort((a, b) => Number(b.id === preferredJobId) - Number(a.id === preferredJobId));
  return ordered.filter(job => job.status === 'making').flatMap(job => eligibleTargets(job, workerId).map(target => ({ jobId: job.id, ...(target.stageId ? { stageId: target.stageId } : {}) })));
}
export function nextAssignment(lanes, jobs, workers, preferredJobId = lanes[0]?.jobId) {
  const key = lane => `${lane.jobId}:${lane.stageId || ''}`;
  const used = new Set(lanes.map(key));
  const candidates = workers.filter(id => !lanes.some(lane => lane.workerId === id)).flatMap(workerId => preferredTargets(jobs, workerId, preferredJobId).filter(target => !used.has(key(target))).map(target => ({ workerId, ...target })));
  return candidates.find(target => target.jobId === preferredJobId) || candidates[0] || null;
}
export function usableSeconds(job, lane) {
  if (!job || job.status !== 'making') return 0;
  return applyEffort(job, 10800, lane.workerId, lane.stageId).applied;
}
export function suggestedMinutes(job, lanes = []) {
  const lane = lanes.find(item => item.jobId === job?.id);
  if (!lane) return 25;
  return Math.min(25, Math.max(1, Math.ceil(usableSeconds(job, lane) * 100 / lane.share / 60)));
}
function plannedSession(lanes, seconds) {
  return { limitSeconds: seconds, activeSince: null, candidateClosedSeconds: seconds, partCount: 1, currentPlan: JSON.stringify({ version: 2, lanes }), allocationSummary: JSON.stringify({ version: 3, spans: [seconds], shares: [lanes.map(lane => lane.share)] }) };
}
/** Use the settlement allocator, including its integer rounding and role boundaries. */
export function plannedAllocation(lanes, jobs, seconds) {
  if (!lanes.length || !Number.isInteger(seconds) || seconds < 0) return [];
  return allocationPreview(plannedSession(lanes, seconds), jobs, seconds, 0);
}
export function plannedShares(lanes, seconds) {
  return lanes.length && Number.isInteger(seconds) && seconds >= 0 ? sessionAllocations(plannedSession(lanes, seconds), seconds, 0) : [];
}
export function finishingValue(job) {
  const spec = job?.spec;
  const finish = job?.completedFinish;
  if (!spec || job.kind !== 'object' || !Number.isInteger(finish) || finish < 0 || finish >= spec.detailSeconds.length) return null;
  const seconds = spec.detailSeconds[finish];
  const current = job.marketPriceMinor ?? ((job.reservedMaterialMinor || 0) + (job.saleableSeconds || 0) * spec.workmanshipMinorPerSecond);
  const final = (job.reservedMaterialMinor || 0) + targetSeconds(spec, finish + 1) * spec.workmanshipMinorPerSecond;
  return { seconds, current, final, increment: final - current };
}
/** Rewards come exclusively from the confirmed immutable receipt, including recovery. */
export function saleReceipt(command, receipt, jobs) {
  if (!['job.sell', 'commission.deliver'].includes(command.kind) || !receipt || !Number.isSafeInteger(receipt.coinDeltaMinor)) return null;
  const job = jobs.find(item => item.id === (receipt.result?.jobId || command.jobId));
  return { operationId: command.operationId, kind: command.kind, jobId: command.jobId, nameKey: job?.spec?.nameKey || (job?.recipeId ? `sw.recipe.${job.recipeId}` : null), coinDeltaMinor: receipt.coinDeltaMinor };
}
