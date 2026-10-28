import { INT_MAX, patterns, finishStyles } from './content.js';
export class GameError extends Error {
  constructor(code) { super(code); this.code = code; this.messageKey = `sw.error.${code}`; }
}
export function requireRule(condition, code = 'invalid') { if (!condition) throw new GameError(code); }
export function integer(value, min = 0, max = INT_MAX) {
  requireRule(Number.isSafeInteger(value) && value >= min && value <= max); return value;
}
export function sum(a, b) { return integer(a + b); }
export function text(value = '', limit = 80) {
  requireRule(typeof value === 'string' && value.length <= limit && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value));
  return value.trim();
}
export function candidate(session, now) {
  if (!session) return 0;
  const elapsed = session.activeSince === null ? 0 : Math.max(0, Math.floor((now - Date.parse(session.activeSince)) / 1000));
  return Math.min(session.limitSeconds, sum(session.candidateClosedSeconds, Math.min(session.limitSeconds, elapsed)));
}
const roles = { maker: ['carpentry', 'joinery', 'wood-detail', 'wood-finishing', 'assembly', 'construction', 'onboarding'], apprentice: ['carpentry'], blacksmith: ['metal', 'metal-finishing'], carver: ['carpentry', 'joinery', 'wood-detail'], finisher: ['wood-finishing', 'metal-finishing'] };
export function workerCanDoStage(workerId, stage) {
  // Historic wood specs use carpentry/joinery for every stage. Interpret their
  // authored stage identity without rewriting the pinned specification.
  if (workerId === 'carver' && stage.id === 'assemble') return false;
  if (workerId === 'finisher' && ['carpentry', 'joinery'].includes(stage.role)) return stage.id === 'finish';
  return roles[workerId]?.includes(stage.role) ?? false;
}
export function workshopCapacity(unlocks = [], crew = []) {
  const has = id => unlocks.some(u => u.unlockId === id);
  return { openJobs: has('craft-yard') ? 6 : has('carpenter-room') ? 4 : 2,
    lanes: has('craft-yard') ? 3 : crew.some(c => c.staffId === 'apprentice' && c.status === 'active') ? 2 : 1 };
}
export function styleChoices(job, crew = []) {
  if (job.kind !== 'object' || !['making', 'ready', 'kept'].includes(job.status)) return { patterns: [], finishStyles: [] };
  const spec = readSpec(job), hasWood = spec.stages.some(s => ['carpentry', 'joinery', 'wood-detail', 'wood-finishing'].includes(s.role));
  const active = style => !style.requiredStaff || crew.some(c => c.staffId === style.requiredStaff && c.status === 'active');
  return { patterns: patterns.filter(p => (p.id === 'plain' || hasWood) && active(p)), finishStyles: finishStyles.filter(active) };
}
export function readSpec(job) {
  requireRule(typeof job.specSnapshot === 'string' && job.specSnapshot.length <= 12288, 'storage');
  const spec = JSON.parse(job.specSnapshot);
  const allowed = ['id', 'version', 'kind', 'nameKey', 'materialMinor', 'baseSeconds', 'detailSeconds', 'stages', 'workmanshipMinorPerSecond', 'requiredFocusSeconds', 'requiredDistinctRecipes', 'requiredUnlock', 'requiredStaff', 'requiredAdvancedRecipes', 'requiredMetalRecipes', 'requiredMixedRecipes', 'mixed'];
  requireRule(spec && Object.keys(spec).every(k => allowed.includes(k)) && [1, 2].includes(spec.version) && Array.isArray(spec.stages) && spec.stages.length >= 1 && spec.stages.length <= 8, 'storage');
  requireRule(['object', 'improvement', 'onboarding', 'community'].includes(spec.kind) && /^[a-z0-9-]{1,80}$/.test(spec.id), 'storage');
  requireRule(spec.mixed === undefined || (spec.version === 2 && spec.mixed === true), 'storage');
  integer(spec.materialMinor); integer(spec.baseSeconds, 1, 108000); integer(spec.workmanshipMinorPerSecond, 0, 5);
  requireRule(Array.isArray(spec.detailSeconds) && spec.detailSeconds.length <= 2, 'storage');
  spec.detailSeconds.forEach(s => integer(s, 1, 108000));
  const seen = new Set();
  for (const stage of spec.stages) {
    requireRule(stage && Object.keys(stage).every(k => ['id', 'nameKey', 'seconds', 'finish', 'role', 'requires'].includes(k)), 'storage');
    requireRule(/^[a-z0-9-]{1,80}$/.test(stage.id) && !seen.has(stage.id) && /^sw\.stage\.[a-z0-9-]+$/.test(stage.nameKey) && Object.values(roles).some(r => r.includes(stage.role)), 'storage');
    integer(stage.seconds, 1, 108000); integer(stage.finish, 0, 2);
    if (stage.requires !== undefined) requireRule(Array.isArray(stage.requires) && stage.requires.length <= 8 && new Set(stage.requires).size === stage.requires.length && stage.requires.every(id => seen.has(id)), 'storage');
    if (spec.mixed) requireRule(Array.isArray(stage.requires), 'storage');
    seen.add(stage.id);
  }
  requireRule(spec.stages.filter(s => s.finish === 0).reduce((n, s) => sum(n, s.seconds), 0) === spec.baseSeconds, 'storage');
  for (const [i, seconds] of spec.detailSeconds.entries()) requireRule(spec.stages.filter(s => s.finish === i + 1).reduce((n, s) => sum(n, s.seconds), 0) === seconds, 'storage');
  return spec;
}
function readProgress(job, spec = readSpec(job)) {
  requireRule(typeof job.progressSnapshot === 'string' && job.progressSnapshot.length <= 4096, 'storage');
  const progress = JSON.parse(job.progressSnapshot);
  requireRule(progress && typeof progress === 'object' && !Array.isArray(progress), 'storage');
  if (progress.version === 1) {
    requireRule(!spec.mixed && Object.keys(progress).every(k => ['version', 'seconds'].includes(k)), 'storage');
    integer(progress.seconds, 0, targetSeconds(spec, job.chosenFinish));
    let remaining = progress.seconds;
    return spec.stages.map(s => { const seconds = Math.min(remaining, s.seconds); remaining -= seconds; return { id: s.id, seconds }; });
  }
  requireRule(progress.version === 2 && spec.mixed && Object.keys(progress).every(k => ['version', 'stages'].includes(k)) && Array.isArray(progress.stages) && progress.stages.length === spec.stages.length, 'storage');
  progress.stages.forEach((p, i) => {
    requireRule(p && Object.keys(p).every(k => ['id', 'seconds'].includes(k)) && p.id === spec.stages[i].id, 'storage');
    integer(p.seconds, 0, spec.stages[i].finish <= job.chosenFinish ? spec.stages[i].seconds : 0);
    if (p.seconds) requireRule(spec.stages[i].requires.every(id => { const index = spec.stages.findIndex(s => s.id === id); return progress.stages[index].seconds === spec.stages[index].seconds; }), 'storage');
  });
  return progress.stages;
}
function progressSnapshot(spec, stages) { return JSON.stringify(spec.mixed ? { version: 2, stages } : { version: 1, seconds: stages.reduce((n, s) => sum(n, s.seconds), 0) }); }
export function initialProgress(spec) { return progressSnapshot(spec, spec.stages.map(s => ({ id: s.id, seconds: 0 }))); }
export function abandonProgress(job) { const spec = readSpec(job); return progressSnapshot(spec, readProgress(job, spec).map((s, i) => ({ ...s, seconds: spec.stages[i].finish <= job.completedFinish ? s.seconds : 0 }))); }
export function targetSeconds(spec, finish) { return spec.stages.filter(s => s.finish <= finish).reduce((n, s) => sum(n, s.seconds), 0); }
export function jobView(job) {
  const spec = readSpec(job), progress = readProgress(job, spec);
  const requiredSeconds = targetSeconds(spec, job.chosenFinish);
  const stages = spec.stages.filter(s => s.finish <= job.chosenFinish).map((s, i) => {
    const requires = s.requires ?? (i ? [spec.stages[i - 1].id] : []);
    const completed = progress[i].seconds === s.seconds;
    return { ...s, requires, appliedSeconds: progress[i].seconds, completed,
      available: job.status === 'making' && !completed && requires.every(id => { const index = spec.stages.findIndex(s => s.id === id); return progress[index].seconds === spec.stages[index].seconds; }) };
  });
  const marketPriceMinor = job.kind === 'object' ? sum(job.reservedMaterialMinor ?? 0, (job.saleableSeconds ?? 0) * spec.workmanshipMinorPerSecond) : 0;
  return { ...job, spec, stages, progressSeconds: progress.reduce((n, s) => sum(n, s.seconds), 0), requiredSeconds,
    marketPriceMinor, commissionPriceMinor: sum(marketPriceMinor, job.kind === 'object' && job.recipeId === 'stool' ? 600 : 0) };
}
export function availableStages(job, workerId) { return jobView(job).stages.filter(s => s.available && workerCanDoStage(workerId, s)); }
export function eligibleTargets(job, workerId) {
  const view = jobView(job), stages = availableStages(job, workerId);
  return stages.map(s => ({ stageId: view.spec.mixed ? s.id : undefined, nameKey: s.nameKey, role: s.role }));
}
export function validateTarget(job, workerId, stageId) {
  requireRule(job.status === 'making', 'jobState');
  const view = jobView(job);
  if (view.spec.mixed) requireRule(typeof stageId === 'string', 'stageRequired');
  const stage = stageId === undefined ? view.stages.find(s => !s.completed) : view.stages.find(s => s.id === stageId);
  requireRule(stage, 'stageUnavailable');
  requireRule(stage.available, 'stageUnavailable');
  requireRule(workerCanDoStage(workerId, stage), 'workerRole');
  // Nonmixed targets always start at the next unfinished stage.
  requireRule(view.spec.mixed || stage.id === view.stages.find(s => !s.completed)?.id, 'stageUnavailable');
  return stage;
}
/** A mixed call advances only its explicitly selected stage, against persisted prerequisites. */
export function applyEffort(job, seconds, workerId = 'maker', stageId, persisted = job) {
  integer(seconds);
  const start = validateTarget(persisted, workerId, stageId), spec = readSpec(job), progress = readProgress(job, spec);
  let remaining = seconds;
  for (let i = spec.stages.findIndex(s => s.id === start.id); i < spec.stages.length && remaining; i++) {
    const stage = spec.stages[i];
    if (stage.finish > job.chosenFinish || !workerCanDoStage(workerId, stage)) break;
    const amount = Math.min(remaining, stage.seconds - progress[i].seconds);
    progress[i].seconds += amount; remaining -= amount;
    if (spec.mixed) break;
  }
  const applied = seconds - remaining;
  let completedFinish = job.completedFinish;
  for (let finish = 0; finish <= job.chosenFinish; finish++) {
    if (spec.stages.every((s, i) => s.finish > finish || progress[i].seconds === s.seconds)) completedFinish = finish;
  }
  return { applied, update: { appliedSeconds: sum(job.appliedSeconds, applied),
    saleableSeconds: job.kind === 'object' && completedFinish >= 0 ? targetSeconds(spec, completedFinish) : 0,
    progressSnapshot: progressSnapshot(spec, progress), completedFinish,
    status: completedFinish === job.chosenFinish ? (['object', 'community'].includes(job.kind) ? 'ready' : 'completed') : 'making',
  } };
}
const fields = {
  'task.add': ['title'], 'task.rename': ['taskId', 'title'], 'task.complete': ['taskId'], 'task.reopen': ['taskId'],
  initialize: ['name', 'makerName'], 'job.start': ['recipeId'], 'job.detail': ['jobId', 'detailId'],
  'job.allocate': ['jobId', 'seconds', 'workerId', 'stageId'], 'job.abandon': ['jobId'], 'job.salvage': ['jobId'],
  'community.fund': ['projectId'], 'community.deliver': ['jobId'], 'job.style': ['jobId', 'patternId', 'finishStyleId'],
  'job.keep': ['jobId'], 'job.sell': ['jobId'], 'commission.deliver': ['jobId', 'commissionId'],
  'room.expand': ['expansionId'], 'crew.welcome': ['staffId'], 'session.shares': ['shares'],
  'session.start': ['mode', 'plannedSeconds', 'jobId', 'intention', 'tag', 'timeZone', 'taskId', 'lanes'],
  'session.pause': [], 'session.resume': [], 'session.recover': [], 'session.trim': ['seconds'],
  'session.settle': ['seconds'], 'session.discard': [],
};
export function validateCommand(command) {
  requireRule(command !== null && typeof command === 'object' && !Array.isArray(command));
  requireRule(Object.hasOwn(fields, command.kind));
  const allowed = ['operationId', 'revision', 'kind', ...fields[command.kind]];
  requireRule(Object.keys(command).every(k => allowed.includes(k)));
  requireRule(typeof command.operationId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(command.operationId));
  integer(command.revision);
  if ('seconds' in command) integer(command.seconds, 0, 10800);
  for (const key of ['taskId', 'jobId', 'recipeId', 'detailId', 'commissionId', 'expansionId', 'workerId', 'staffId', 'stageId', 'projectId', 'patternId', 'finishStyleId']) {
    if (key in command && command[key] !== null) requireRule(typeof command[key] === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(command[key]));
  }
  if (['task.rename', 'task.complete', 'task.reopen'].includes(command.kind)) requireRule(typeof command.taskId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(command.taskId));
  return command;
}
