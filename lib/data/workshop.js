import { createHash, randomUUID } from 'node:crypto';
import { modelAction, modelBatch } from './index.js';
import { content, recipes, expansions, staff, starterRecipeIds, advancedRecipeIds, metalRecipeIds, mixedRecipeIds, communityProjects } from '../game/content.js';
import { GameError, requireRule, integer, sum, text, candidate, readSpec, targetSeconds, jobView, applyEffort, validateCommand, initialProgress, abandonProgress, validateTarget, workshopCapacity, styleChoices } from '../game/rules.js';

import { readPlan, readSpans, retainSpans, spanSummary, validateLanes, sessionAllocations, allocationPreview } from '../game/allocation.js';

export const WORKSHOP_OWNER = 'small-works-local-owner';
const select = names => Object.fromEntries(names.split(' ').map(name => [name, true]));
const workshopFields = select('ownerId name makerName coinMinor bankSeconds lifetimeFocusSeconds practiceSeconds revision activeSessionId createdAt updatedAt');
const sessionFields = select('id ownerId mode status intention tag timeZone startedAt activeSince endedAt limitSeconds candidateClosedSeconds acceptedSeconds partCount currentPlan allocationSummary settlementOperationId recovered createdAt updatedAt');
const taskSessionFields = select('id ownerId taskId taskTitle acceptedSeconds createdAt');
const taskFields = select('id ownerId title status focusSeconds sessionCount completedAt createdAt updatedAt');
const jobFields = select('id ownerId recipeId recipeVersion kind status chosenFinish completedFinish reservedMaterialMinor appliedSeconds saleableSeconds specSnapshot progressSnapshot patternId finishStyleId displayName note orderId finalizedAt saleMinor showroomPosition createdAt updatedAt');
const crewFields = select('id ownerId staffId status nickname onboardingJobId allocatedSeconds joinedAt patternMilestone createdAt updatedAt');
const unlockFields = select('id ownerId unlockId sourceJobId unlockedAt createdAt');
const commissionFields = select('id ownerId sequence templateId recipeId recipeVersion requiredFinish requiredWorkSeconds status objectId acceptedAt deliveredAt bonusMinor createdAt updatedAt');
const receiptFields = select('id ownerId operationId revision kind requestDigest coinDeltaMinor bankDeltaSeconds focusDeltaSeconds resultSummary createdAt');
function owner(value) { requireRule(typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value)); return value; }
const find = (model, where, fields) => modelAction(model, 'findFirst', { where, select: fields });
const list = (model, where, fields, take, orderBy = { id: 'desc' }) => modelAction(model, 'findMany', { where, select: fields, take, orderBy });
function receiptView(row) { return row ? { ...row, result: JSON.parse(row.resultSummary) } : null; }
export async function operationReceiptFor(ownerId, operationId) {
  owner(ownerId); requireRule(typeof operationId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(operationId));
  return receiptView(await find('WorkshopOperation', { ownerId, operationId }, receiptFields));
}
export async function getWorkshopFor(ownerId, options = {}) {
  owner(ownerId);
  if (options.keptBefore !== undefined && options.keptBefore !== null) requireRule(typeof options.keptBefore === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(options.keptBefore));
  if (options.taskBefore !== undefined && options.taskBefore !== null) requireRule(typeof options.taskBefore === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(options.taskBefore));
  const workshop = await find('Workshop', { ownerId }, workshopFields);
  if (!workshop) return { initialized: false, revision: 0, workshop: null, session: null, jobs: [], tasks: [], completedTasks: [], taskNextCursor: null, unlocks: [], history: [], commissions: [], crew: [], keptNextCursor: null, content };
  const session = workshop.activeSessionId ? await find('FocusSession', { ownerId, id: workshop.activeSessionId }, sessionFields) : null;
  const completedBefore = options.taskBefore ? await beforeRecord('FocusTask', ownerId, options.taskBefore, 'completedAt', { status: 'done' }) : {};
  // Batch independent reads so tasks and their history stay within the records
  // request budget even when a command also returns the refreshed workshop.
  const queries = [
    ['WorkJob', { ownerId, status: { in: ['making', 'ready'] } }, jobFields, 12],
    ['WorkshopUnlock', { ownerId }, unlockFields, 32],
    ['Commission', { ownerId }, commissionFields, 3],
    ['CrewMember', { ownerId }, crewFields, 4],
    ['FocusTask', { ownerId, status: 'open' }, taskFields, 100],
    ...options.mutation ? [] : [
      ['WorkJob', { ownerId, status: 'kept', ...(options.keptBefore ? { id: { lt: options.keptBefore } } : {}) }, jobFields, 13],
      ['FocusSession', { ownerId, status: { in: ['settled', 'discarded'] } }, sessionFields, 12, [{ endedAt: 'desc' }, { id: 'desc' }]],
      ['FocusTask', { ownerId, status: 'done', ...completedBefore }, taskFields, 11, [{ completedAt: 'desc' }, { id: 'desc' }]],
    ],
  ];
  const [jobs, unlocks, commissions, crew, tasks, keptPage = [], history = [], completedPage = []] = await modelBatch(queries.map(([model, where, fields, take, orderBy = { id: 'desc' }]) =>
    ({ model, action: 'findMany', args: { where, select: fields, take, orderBy } })));
  const kept = keptPage.slice(0, 12), completedTasks = completedPage.slice(0, 10);
  const sessionIds = [...history.map(row => row.id), ...(session ? [session.id] : [])];
  const links = sessionIds.length ? await list('TaskSession', { ownerId, id: { in: sessionIds } }, taskSessionFields, 13) : [];
  const linked = row => ({ ...row, taskId: links.find(link => link.id === row.id)?.taskId ?? null, taskTitle: links.find(link => link.id === row.id)?.taskTitle || '' });
  const viewedJobs = [...jobs, ...kept].map(jobView);
  const now = options.now?.() ?? Date.now();
  return { initialized: true, revision: workshop.revision, workshop,
    session: session ? { ...linked(session), candidateSeconds: candidate(session, now),
      jobId: readPlan(session)[0].jobId, lanes: readPlan(session), allocationPreview: allocationPreview(session, viewedJobs, candidate(session, now), now), recoveryRequired: true } : null,
    jobs: viewedJobs, tasks, completedTasks, taskNextCursor: completedPage.length > 10 ? completedTasks.at(-1).id : null, crew, keptNextCursor: keptPage.length > 12 ? kept.at(-1).id : null, unlocks, history: history.map(linked), commissions, content };
}
function digest(command) {
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(command).sort().map(k => [k, command[k]])))).digest('hex');
}
function newJob(spec, ownerId, now) {
  return { id: randomUUID(), ownerId, createdAt: now, updatedAt: now, recipeId: spec.id, recipeVersion: spec.version,
    kind: spec.kind, status: 'making', chosenFinish: 0, completedFinish: -1, reservedMaterialMinor: spec.materialMinor,
    appliedSeconds: 0, saleableSeconds: 0, specSnapshot: JSON.stringify(spec), progressSnapshot: initialProgress(spec),
    patternId: 'plain', finishStyleId: 'natural', displayName: '', note: '', orderId: null, finalizedAt: null, saleMinor: null, showroomPosition: null };
}
/** Every value-changing command claims one unique revision in the same atomic batch. */
export async function executeWorkshopFor(ownerId, input, options = {}) {
  let snapshot;
  try {
    owner(ownerId); const command = validateCommand(input), requestDigest = digest(command);
    const prior = await operationReceiptFor(ownerId, command.operationId);
    if (prior) {
      requireRule(prior.requestDigest === requestDigest, 'operationReuse');
      return { ok: true, receipt: prior, replayed: true, snapshot: await getWorkshopFor(ownerId, options) };
    }
    snapshot = await getWorkshopFor(ownerId, { ...options, mutation: true });
    requireRule(command.revision === snapshot.revision, 'conflict');
    const nowMs = options.now?.() ?? Date.now(), now = new Date(nowMs).toISOString();
    const steps = [], affected = {};
    const create = (model, data) => steps.push({ model, action: 'create', args: { data, select: { ...(model === 'Workshop' ? { ownerId: true } : { id: true }) } } });
    const update = (model, id, data) => steps.push({ model, action: 'update', args: {
      where: model === 'Workshop' ? { ownerId } : { id, ownerId }, data, select: model === 'Workshop' ? { ownerId: true } : { id: true } } });
    const before = snapshot.workshop;
    let wallet = before ? { ...before } : { ownerId, name: text(command.name), makerName: text(command.makerName),
      coinMinor: 4000, bankSeconds: 0, lifetimeFocusSeconds: 0, practiceSeconds: 0,
      revision: 0, activeSessionId: null, createdAt: now, updatedAt: now };
    const active = snapshot.session;
    let fetchedDirect = false;
    async function selectedJob(id) {
      let job = snapshot.jobs.find(j => j.id === id);
      if (!job) {
        requireRule(typeof id === 'string', 'notFound');
        const saved = await find('WorkJob', { ownerId, id }, jobFields);
        fetchedDirect = true;
        if (saved) job = jobView(saved);
      }
      requireRule(job, 'notFound'); return job;
    }
    const pendingUnlocks = new Set();
    function unlocked(id) { return snapshot.unlocks.some(u => u.unlockId === id); }
    function addUnlock(id, jobId) {
      if (unlocked(id) || pendingUnlocks.has(id)) return;
      pendingUnlocks.add(id);
      create('WorkshopUnlock', { id: randomUUID(), ownerId, unlockId: id, sourceJobId: jobId, unlockedAt: now, createdAt: now });
    }
    function unlockedJob(job) { requireRule(!active || !active.lanes.some(l => l.jobId === job.id), 'sessionActive'); }
    function eligibleWorker(workerId, job, stageId) {
      requireRule(['maker', 'apprentice', 'blacksmith', 'carver', 'finisher'].includes(workerId), 'workerUnavailable');
      if (workerId !== 'maker') requireRule(snapshot.crew.some(c => c.staffId === workerId && c.status === 'active'), 'workerUnavailable');
      if (job) validateTarget(job, workerId, stageId);
    }
    function spend(amount) { requireRule(wallet.coinMinor >= amount, 'insufficientCoins'); wallet.coinMinor -= amount; }
    function allocation(sourceKind, sourceId, ordinal, seconds, allocationKind, jobId = null, workerId = null) {
      if (seconds === 0) return;
      create('FocusAllocation', { id: randomUUID(), ownerId, sourceKind, sourceId, ordinal, seconds, allocationKind,
        jobId, workerId, createdAt: now });
    }
    const changedJobs = new Map();
    function apply(job, seconds, sourceKind, sourceId, workerId = 'maker', ordinal = 0, stageId) {
      eligibleWorker(workerId, job, stageId);
      const current = changedJobs.get(job.id)?.job ?? job;
      const result = applyEffort(current, seconds, workerId, stageId, job);
      changedJobs.set(job.id, { job: { ...current, ...result.update }, update: result.update });
      allocation(sourceKind, sourceId, ordinal, result.applied, 'work', job.id, workerId);
      const member = snapshot.crew.find(c => c.staffId === workerId && c.status === 'active');
      if (member && result.applied) {
        const allocatedSeconds = sum(member.allocatedSeconds, result.applied);
        update('CrewMember', member.id, { allocatedSeconds, patternMilestone: [3600, 10800, 21600].filter(n => allocatedSeconds >= n).length, updatedAt: now });
      }
      if (result.update.completedFinish >= 0 && current.completedFinish < 0) {
        if (job.kind === 'onboarding') {
          const member = snapshot.crew.find(c => c.onboardingJobId === job.id && c.status === 'onboarding');
          requireRule(member, 'jobState');
          update('CrewMember', member.id, { status: 'active', joinedAt: now, updatedAt: now });
        } else if (job.kind !== 'community') addUnlock(job.kind === 'object' ? `recipe:${job.recipeId}` : job.recipeId, job.id);
      }
      affected.jobId = job.id; affected.appliedSeconds = result.applied;
      return result.applied;
    }
    function closeSpan(session, trimTo) {
      const total = candidate(session, nowMs), elapsed = total - session.candidateClosedSeconds;
      let partCount = session.partCount;
      const spans = readSpans(session);
      if (session.activeSince !== null) {
        requireRule(partCount < 32, 'limit');
        create('SessionPart', { id: randomUUID(), ownerId, sessionId: session.id, ordinal: partCount,
          startedAt: session.activeSince, endedAt: new Date(Math.max(nowMs, Date.parse(session.activeSince))).toISOString(), candidateSeconds: elapsed,
          planSnapshot: session.currentPlan, createdAt: now });
        spans.push({ seconds: elapsed, lanes: readPlan(session) }); partCount++;
      }
      if (trimTo !== undefined) requireRule(trimTo <= total);
      return { candidateClosedSeconds: trimTo ?? total, activeSince: null, partCount, updatedAt: now,
        allocationSummary: spanSummary(retainSpans(spans, trimTo ?? total)) };
    }
    if (command.kind === 'initialize') {
      requireRule(!before, 'conflict');
      create('Commission', { id: randomUUID(), ownerId, createdAt: now, updatedAt: now, sequence: 0,
        templateId: 'first-stool', recipeId: 'stool', recipeVersion: 1, requiredFinish: 0, requiredWorkSeconds: 1200,
        status: 'accepted', objectId: null, acceptedAt: now, deliveredAt: null, bonusMinor: 600 });
    } else {
      requireRule(before, 'notFound');
      if (command.kind.startsWith('task.')) {
        if (command.kind === 'task.add') {
          requireRule(snapshot.tasks.length < 100, 'taskLimit');
          const title = text(command.title, 160); requireRule(title.length > 0);
          const id = randomUUID();
          create('FocusTask', { id, ownerId, title, status: 'open', focusSeconds: 0, sessionCount: 0, completedAt: null, createdAt: now, updatedAt: now });
          affected.taskId = id;
        } else {
          const task = await find('FocusTask', { ownerId, id: command.taskId }, taskFields);
          requireRule(task, 'notFound'); requireRule(active?.taskId !== task.id, 'taskActive');
          affected.taskId = task.id;
          if (command.kind === 'task.rename') {
            const title = text(command.title, 160); requireRule(title.length > 0);
            update('FocusTask', task.id, { title, updatedAt: now });
          } else {
            const completing = command.kind === 'task.complete';
            requireRule(task.status === (completing ? 'open' : 'done'), 'taskState');
            if (!completing) requireRule(snapshot.tasks.length < 100, 'taskLimit');
            update('FocusTask', task.id, { status: completing ? 'done' : 'open', completedAt: completing ? now : null, updatedAt: now });
          }
        }
      } else if (command.kind === 'community.fund') {
        const spec = communityProjects.find(p => p.id === command.projectId); requireRule(spec, 'notFound');
        requireRule(unlocked(spec.requiredUnlock), 'requirements');
        requireRule(!unlocked(spec.id) && !snapshot.jobs.some(j => j.kind === 'community'), 'jobState');
        spend(spec.materialMinor); const job = newJob(spec, ownerId, now); create('WorkJob', job); affected.jobId = job.id;
      } else if (command.kind === 'crew.welcome') {
        const spec = staff.find(s => s.id === command.staffId); requireRule(spec, 'notFound');
        requireRule(unlocked(spec.requiredUnlock) && wallet.lifetimeFocusSeconds >= spec.requiredFocusSeconds, 'requirements');
        const member = snapshot.crew.find(c => c.staffId === spec.id);
        requireRule(!member || member.status === 'cancelled', 'jobState');
        requireRule(!snapshot.jobs.some(j => ['onboarding', 'improvement'].includes(j.kind)), 'jobState');
        spend(spec.materialMinor); const job = newJob(spec, ownerId, now); create('WorkJob', job);
        if (member) update('CrewMember', member.id, { status: 'onboarding', onboardingJobId: job.id, updatedAt: now });
        else create('CrewMember', { id: randomUUID(), ownerId, staffId: spec.id, status: 'onboarding', nickname: '', onboardingJobId: job.id, allocatedSeconds: 0, joinedAt: null, patternMilestone: 0, createdAt: now, updatedAt: now });
        affected.jobId = job.id; affected.staffId = spec.id;
      } else if (command.kind === 'job.start' || command.kind === 'room.expand') {
        let spec;
        if (command.kind === 'job.start') {
          spec = recipes.find(r => r.id === command.recipeId); requireRule(spec, 'notFound');
          requireRule((!spec.requiredUnlock || unlocked(spec.requiredUnlock)) && (!spec.requiredStaff || snapshot.crew.some(c => c.staffId === spec.requiredStaff && c.status === 'active')), 'requirements');
          const cap = workshopCapacity(snapshot.unlocks, snapshot.crew).openJobs;
          requireRule(snapshot.jobs.filter(j => j.kind === 'object' && ['making', 'ready'].includes(j.status)).length < cap, 'jobLimit');
        } else {
          spec = expansions.find(e => e.id === command.expansionId); requireRule(spec, 'notFound');
          requireRule(!unlocked(spec.id) && !snapshot.jobs.some(j => ['onboarding', 'improvement'].includes(j.kind)), 'jobState');
          requireRule(wallet.lifetimeFocusSeconds >= spec.requiredFocusSeconds && snapshot.unlocks.filter(u => starterRecipeIds.some(id => u.unlockId === `recipe:${id}`)).length >= spec.requiredDistinctRecipes && (!spec.requiredUnlock || unlocked(spec.requiredUnlock)), 'requirements');
        }
        requireRule(!spec.requiredAdvancedRecipes || snapshot.unlocks.filter(u => advancedRecipeIds.some(id => u.unlockId === `recipe:${id}`)).length >= spec.requiredAdvancedRecipes, 'requirements');
        requireRule(!spec.requiredStaff || snapshot.crew.some(c => c.staffId === spec.requiredStaff && c.status === 'active'), 'requirements');
        requireRule(!spec.requiredMetalRecipes || snapshot.unlocks.filter(u => metalRecipeIds.some(id => u.unlockId === `recipe:${id}`)).length >= spec.requiredMetalRecipes, 'requirements');
        requireRule(!spec.requiredMixedRecipes || snapshot.unlocks.filter(u => mixedRecipeIds.some(id => u.unlockId === `recipe:${id}`)).length >= spec.requiredMixedRecipes, 'requirements');
        spend(spec.materialMinor); const job = newJob(spec, ownerId, now); create('WorkJob', job); affected.jobId = job.id;
      } else if (command.kind === 'session.start') {
        requireRule(!active && !wallet.activeSessionId, 'sessionActive');
        requireRule(['countdown', 'countup', 'break'].includes(command.mode));
        let limitSeconds = 10800;
        if (command.mode === 'countup') requireRule(command.plannedSeconds === undefined);
        else { limitSeconds = integer(command.plannedSeconds, 60, command.mode === 'break' ? 3600 : 10800); requireRule(limitSeconds % 60 === 0); }
        requireRule(command.lanes === undefined || command.jobId === undefined, 'lanes');
        const lanes = validateLanes(command.lanes ?? [{ workerId: 'maker', jobId: command.jobId ?? null, share: 100 }]);
        if (command.mode === 'break') requireRule(lanes.length === 1 && lanes[0].jobId === null && lanes[0].workerId === 'maker', 'lanes');
        requireRule(lanes.length <= workshopCapacity(snapshot.unlocks, snapshot.crew).lanes, 'workerUnavailable');
        for (const lane of lanes) {
          const job = lane.jobId ? await selectedJob(lane.jobId) : null;
          if (job) requireRule(job.status === 'making', 'jobState');
          eligibleWorker(lane.workerId, job, lane.stageId);
          if (job && lanes.filter(l => l.jobId === job.id).length > 1) requireRule(readSpec(job).mixed, 'lanes');
        }
        const task = command.taskId ? snapshot.tasks.find(item => item.id === command.taskId) : null;
        requireRule(!command.taskId || (task?.status === 'open' && command.mode !== 'break'), 'taskState');
        const timeZone = text(command.timeZone ?? 'UTC', 80);
        try { new Intl.DateTimeFormat('en', { timeZone }).format(nowMs); } catch { throw new GameError('invalid'); }
        const id = randomUUID();
        create('FocusSession', { id, ownerId, createdAt: now, updatedAt: now, mode: command.mode, status: 'running',
          intention: text(command.intention, 240), tag: text(command.tag, 40), timeZone, startedAt: now, activeSince: now,
          endedAt: null, limitSeconds, candidateClosedSeconds: 0, acceptedSeconds: 0, partCount: 0,
          currentPlan: JSON.stringify({ version: 2, lanes }),
          allocationSummary: spanSummary([]), settlementOperationId: null, recovered: false });
        if (task) create('TaskSession', { id, ownerId, taskId: task.id, taskTitle: task.title, acceptedSeconds: 0, createdAt: now });
        wallet.activeSessionId = id; affected.sessionId = id;
      } else if (command.kind.startsWith('session.')) {
        requireRule(active, 'sessionMissing'); affected.sessionId = active.id;
        if (command.kind === 'session.shares') {
          requireRule(active.status === 'paused', 'sessionState');
          requireRule(Array.isArray(command.shares) && command.shares.length === active.lanes.length, 'shares');
          const lanes = validateLanes(active.lanes.map((lane, i) => ({ ...lane, share: command.shares[i] })));
          update('FocusSession', active.id, { currentPlan: JSON.stringify({ version: 2, lanes }), allocationSummary: spanSummary(readSpans(active)), updatedAt: now });
        } else if (command.kind === 'session.resume') {
          requireRule(active.status === 'paused' && active.candidateClosedSeconds < active.limitSeconds, 'sessionState');
          requireRule(active.partCount < 32, 'limit');
          update('FocusSession', active.id, { status: 'running', activeSince: now, updatedAt: now });
        } else if (['session.pause', 'session.recover', 'session.trim'].includes(command.kind)) {
          if (command.kind === 'session.pause') requireRule(active.status === 'running', 'sessionState');
          if (command.kind === 'session.trim') integer(command.seconds, 0, active.limitSeconds);
          update('FocusSession', active.id, { ...closeSpan(active, command.kind === 'session.trim' ? command.seconds : undefined), status: 'paused', recovered: command.kind === 'session.recover' || active.recovered });
        } else {
          const closed = closeSpan(active);
          const accepted = command.kind === 'session.discard' || active.mode === 'break' ? 0 : (command.seconds ?? closed.candidateClosedSeconds);
          integer(accepted, 0, closed.candidateClosedSeconds);
          let applied = 0;
          const allocations = [];
          for (const [i, lane] of sessionAllocations(active, accepted, nowMs).entries()) {
            const appliedSeconds = lane.jobId && lane.seconds > 0 ? apply(await selectedJob(lane.jobId), lane.seconds, 'session', active.id, lane.workerId, i * 2, lane.stageId) : 0;
            const bankedSeconds = lane.seconds - appliedSeconds;
            allocation('session', active.id, i * 2 + 1, bankedSeconds, 'bank', null, lane.workerId);
            applied += appliedSeconds;
            allocations.push({ workerId: lane.workerId, jobId: lane.jobId, ...(lane.stageId === undefined ? {} : { stageId: lane.stageId }), seconds: lane.seconds, appliedSeconds, bankedSeconds });
          }
          const bank = accepted - applied;
          affected.allocations = allocations;
          wallet.bankSeconds = sum(wallet.bankSeconds, bank);
          wallet.lifetimeFocusSeconds = sum(wallet.lifetimeFocusSeconds, accepted);
          wallet.activeSessionId = null;
          if (active.taskId && accepted > 0) {
            const task = snapshot.tasks.find(item => item.id === active.taskId);
            requireRule(task, 'taskState');
            update('TaskSession', active.id, { acceptedSeconds: accepted });
            update('FocusTask', task.id, { focusSeconds: sum(task.focusSeconds, accepted), sessionCount: sum(task.sessionCount, 1), updatedAt: now });
          }
          affected.taskId = active.taskId; affected.taskTitle = active.taskTitle;
          update('FocusSession', active.id, { ...closed, status: command.kind === 'session.discard' ? 'discarded' : 'settled',
            endedAt: now, acceptedSeconds: accepted, settlementOperationId: command.operationId,
            allocationSummary: spanSummary(retainSpans(readSpans({ ...active, ...closed }), accepted), { appliedSeconds: applied, bankSeconds: bank, allocations }) });
          affected.acceptedSeconds = accepted; affected.bankedSeconds = bank;
        }
      } else {
        const job = await selectedJob(command.jobId); unlockedJob(job);
        if (command.kind === 'community.deliver') {
          requireRule(job.kind === 'community' && job.status === 'ready' && job.completedFinish === 0 && !unlocked(job.recipeId), 'jobState');
          addUnlock(job.recipeId, job.id);
          update('WorkJob', job.id, { status: 'completed', finalizedAt: now, updatedAt: now });
          affected.projectId = job.recipeId; affected.saleMinor = 0;
        } else if (command.kind === 'job.style') {
          const choices = styleChoices(job, snapshot.crew);
          requireRule(choices.patterns.length > 0 && (command.patternId !== undefined || command.finishStyleId !== undefined), 'jobState');
          requireRule(command.patternId === undefined || choices.patterns.some(p => p.id === command.patternId), 'requirements');
          requireRule(command.finishStyleId === undefined || choices.finishStyles.some(p => p.id === command.finishStyleId), 'requirements');
          update('WorkJob', job.id, { ...(command.patternId === undefined ? {} : { patternId: command.patternId }),
            ...(command.finishStyleId === undefined ? {} : { finishStyleId: command.finishStyleId }), updatedAt: now });
        } else if (command.kind === 'job.allocate') {
          integer(command.seconds, 1); requireRule(wallet.bankSeconds >= command.seconds, 'insufficientEffort');
          wallet.bankSeconds -= apply(job, command.seconds, 'bank', command.operationId, command.workerId ?? 'maker', 0, command.stageId);
        } else if (command.kind === 'job.detail') {
          requireRule(job.kind === 'object' && job.status === 'ready', 'jobState');
          const next = command.detailId === 'd1' ? 1 : command.detailId === 'd2' ? 2 : -1;
          requireRule(next === job.completedFinish + 1 && next <= 2, 'jobState');
          update('WorkJob', job.id, { chosenFinish: next, status: 'making', updatedAt: now });
        } else if (command.kind === 'job.abandon') {
          requireRule(job.kind === 'object' && job.status === 'making' && job.completedFinish >= 0, 'jobState');
          update('WorkJob', job.id, { chosenFinish: job.completedFinish, status: 'ready',
            progressSnapshot: abandonProgress(job), updatedAt: now });
        } else if (command.kind === 'job.salvage') {
          requireRule(['making', 'ready', 'kept'].includes(job.status), 'jobState');
          if (job.kind === 'onboarding') {
            const member = snapshot.crew.find(c => c.onboardingJobId === job.id && c.status === 'onboarding'); requireRule(member, 'jobState');
            update('CrewMember', member.id, { status: 'cancelled', onboardingJobId: null, updatedAt: now });
          }
          wallet.coinMinor = sum(wallet.coinMinor, job.reservedMaterialMinor);
          update('WorkJob', job.id, { status: 'salvaged', finalizedAt: now, updatedAt: now });
        } else {
          requireRule(job.kind === 'object' && ['ready', 'kept'].includes(job.status), 'jobState');
          if (command.kind === 'job.keep') {
            requireRule(job.status === 'ready', 'jobState'); update('WorkJob', job.id, { status: 'kept', updatedAt: now });
          } else {
            let payout = job.marketPriceMinor;
            if (command.kind === 'commission.deliver') {
              const commission = snapshot.commissions.find(c => c.templateId === command.commissionId && c.status === 'accepted');
              requireRule(commission && commission.recipeId === job.recipeId && job.completedFinish >= commission.requiredFinish, 'jobState');
              payout = sum(payout, commission.bonusMinor);
              update('Commission', commission.id, { status: 'delivered', objectId: job.id, deliveredAt: now, updatedAt: now });
              affected.commissionId = commission.id;
            } else requireRule(command.kind === 'job.sell');
            wallet.coinMinor = sum(wallet.coinMinor, payout);
            update('WorkJob', job.id, { status: 'sold', saleMinor: payout, orderId: affected.commissionId ?? null, finalizedAt: now, updatedAt: now });
            affected.saleMinor = payout;
          }
        }
        affected.jobId = job.id;
      }
    }
    for (const [id, changed] of changedJobs) update('WorkJob', id, { ...changed.update, updatedAt: now });
    wallet.revision = sum(wallet.revision, 1); wallet.updatedAt = now;
    const result = { version: 1, revision: wallet.revision, ...affected };
    const receipt = { id: randomUUID(), ownerId, operationId: command.operationId, revision: wallet.revision,
      kind: command.kind, requestDigest, coinDeltaMinor: wallet.coinMinor - (before?.coinMinor ?? 0),
      bankDeltaSeconds: wallet.bankSeconds - (before?.bankSeconds ?? 0), focusDeltaSeconds: wallet.lifetimeFocusSeconds - (before?.lifetimeFocusSeconds ?? 0),
      resultSummary: JSON.stringify(result), createdAt: now };
    // Claim first. A stale concurrent request fails before any game writes, and the batch is atomic.
    steps.unshift({ model: 'WorkshopOperation', action: 'create', args: { data: receipt, select: { id: true } } });
    if (before) update('Workshop', ownerId, wallet); else create('Workshop', wallet);
    try { await modelBatch(steps); }
    catch {
      // The write may have reached storage despite a lost reply. Inspect its immutable receipt first.
      try {
        const saved = await operationReceiptFor(ownerId, command.operationId);
        if (saved) {
          requireRule(saved.requestDigest === requestDigest, 'operationReuse');
          return { ok: true, receipt: saved, replayed: true };
        }
        return { ok: false, error: { code: 'conflict', messageKey: 'sw.error.conflict' } };
      } catch { return { ok: false, error: { code: 'uncertain', messageKey: 'sw.error.uncertain' } }; }
    }
    // An off-page object costs one extra read. Let the caller refresh in a new request.
    // A refresh failure cannot turn an already confirmed write into a failed save.
    let refreshed;
    if (!fetchedDirect) { try { refreshed = await getWorkshopFor(ownerId, options); } catch { /* receipt is authoritative */ } }
    return { ok: true, receipt: receiptView(receipt), ...(refreshed ? { snapshot: refreshed } : {}) };
  } catch (error) {
    const code = error instanceof GameError ? error.code : 'storage';
    return { ok: false, error: { code, messageKey: `sw.error.${code}` }, ...(snapshot ? { snapshot } : {}) };
  }
}

const evidenceJobFields = select('id recipeId kind displayName');
const evidenceSessionFields = select('id intention tag mode status acceptedSeconds startedAt endedAt allocationSummary');
function evidenceCursor(value) {
  if (value !== undefined && value !== null) requireRule(typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value));
}
function evidenceJob(row) {
  const spec = [...recipes, ...expansions, ...staff, ...communityProjects].find(item => item.id === row.recipeId);
  return { ...row, nameKey: spec?.nameKey || `sw.recipe.${row.recipeId}` };
}
async function beforeRecord(model, ownerId, id, field, scope = {}) {
  if (!id) return {};
  const row = await find(model, { ownerId, id, ...scope }, select(`id ${field}`));
  requireRule(row && row[field], 'notFound');
  return { OR: [{ [field]: { lt: row[field] } }, { [field]: row[field], id: { lt: id } }] };
}
/** Paged, owner-scoped evidence survives task renaming and product sale. */
export async function taskHistoryFor(ownerId, taskId, before = null) {
  owner(ownerId); evidenceCursor(taskId); evidenceCursor(before); requireRule(Boolean(taskId));
  const task = await find('FocusTask', { ownerId, id: taskId }, taskFields); requireRule(task, 'notFound');
  const page = await list('TaskSession', { ownerId, taskId, acceptedSeconds: { gt: 0 }, ...await beforeRecord('TaskSession', ownerId, before, 'createdAt', { taskId, acceptedSeconds: { gt: 0 } }) }, taskSessionFields, 11, [{ createdAt: 'desc' }, { id: 'desc' }]);
  const entries = page.slice(0, 10);
  const rows = entries.length ? await list('FocusSession', { ownerId, id: { in: entries.map(row => row.id) }, status: 'settled' }, evidenceSessionFields, 10) : [];
  const sessions = entries.map(entry => { const row = rows.find(row => row.id === entry.id); requireRule(row, 'storage'); return { ...row, taskTitle: entry.taskTitle, allocations: JSON.parse(row.allocationSummary).allocations || [] }; });
  const ids = [...new Set(sessions.flatMap(row => row.allocations.map(lane => lane.jobId).filter(Boolean)))];
  const jobs = ids.length ? await list('WorkJob', { ownerId, id: { in: ids } }, evidenceJobFields, 30) : [];
  return { task, sessions, jobs: jobs.map(evidenceJob), nextCursor: page.length > 10 ? sessions.at(-1).id : null };
}
export async function productSourcesFor(ownerId, jobId, before = null) {
  owner(ownerId); evidenceCursor(jobId); evidenceCursor(before); requireRule(Boolean(jobId));
  const job = await find('WorkJob', { ownerId, id: jobId }, evidenceJobFields); requireRule(job, 'notFound');
  const page = await list('FocusAllocation', { ownerId, jobId, allocationKind: 'work', ...await beforeRecord('FocusAllocation', ownerId, before, 'createdAt', { jobId, allocationKind: 'work' }) }, select('id sourceKind sourceId workerId seconds createdAt'), 11, [{ createdAt: 'desc' }, { id: 'desc' }]);
  const rows = page.slice(0, 10), ids = [...new Set(rows.filter(row => row.sourceKind === 'session').map(row => row.sourceId))];
  const sessions = ids.length ? await list('FocusSession', { ownerId, id: { in: ids } }, select('id intention startedAt'), 10) : [];
  const links = ids.length ? await list('TaskSession', { ownerId, id: { in: ids } }, taskSessionFields, 10) : [];
  return { job: evidenceJob(job), sources: rows.map(row => { const session = sessions.find(session => session.id === row.sourceId); const link = links.find(link => link.id === row.sourceId); return { ...row, session: session ? { ...session, taskId: link?.taskId ?? null, taskTitle: link?.taskTitle || '' } : null }; }), nextCursor: page.length > 10 ? rows.at(-1).id : null };
}
