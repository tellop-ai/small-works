import { applyEffort, jobView, workerCanDoStage } from '../../lib/game/rules.js';

const lanesFor = session => session?.lanes || (session?.jobId ? [{ workerId: 'maker', jobId: session.jobId, share: 100 }] : []);
const fraction = job => job ? Math.min(1, job.progressSeconds / job.requiredSeconds) : 0;
const stageFractions = job => Object.fromEntries((job?.stages || []).map(stage => [stage.id, stage.appliedSeconds / stage.seconds]));

/** Replay only already-bounded preview effort through the same stage rules as settlement.
 * This never changes a saved job or infers completed prerequisites from an animation. */
export function projectedJobViews(jobs, allocations) {
  const originals = new Map(jobs.map(job => [job.id, job]));
  const changed = new Map();
  for (const allocation of allocations) {
    const original = originals.get(allocation.jobId);
    if (!original || allocation.appliedSeconds <= 0) continue;
    const current = changed.get(original.id) || original;
    const { update } = applyEffort(current, allocation.appliedSeconds, allocation.workerId, allocation.stageId, original);
    changed.set(original.id, { ...current, ...update });
  }
  return new Map(jobs.map(job => [job.id, changed.has(job.id) ? jobView(changed.get(job.id)) : job]));
}

/** Object selection is independent of motion: pausing, reviewing, and completing
 * work leave the selected piece at its craft station. Only allocated workers move. */
export function workshopPresentation({ jobs, selectedJob, session, crew = [], allocations = [], isRunning = false, seconds = 0, unlocks = [] }) {
  const views = projectedJobViews(jobs, allocations);
  const lanes = lanesFor(session);
  const targetFor = workerId => views.get(lanes.find(lane => lane.workerId === workerId)?.jobId);
  const selected = views.get(selectedJob?.id) || selectedJob;
  const stagePending = job => Object.fromEntries((job?.stages || []).map(stage => [stage.id, Math.max(0, (views.get(job.id)?.stages.find(item => item.id === stage.id)?.appliedSeconds || 0) - stage.appliedSeconds)]));
  function activityFor(workerId) {
    const lane = lanes.find(item => item.workerId === workerId);
    const target = targetFor(workerId);
    if (!isRunning || session?.mode === 'break' || seconds >= session?.limitSeconds || !lane?.share || !target) return 'idle';
    const stage = lane.stageId ? target.stages?.find(item => item.id === lane.stageId) : target.stages?.find(item => !item.completed);
    if (!stage || stage.completed || !workerCanDoStage(workerId, stage)) return 'idle';
    if (workerId === 'finisher') return 'sand';
    if (workerId === 'carver' && stage.finish > 0) return 'carve';
    if (workerId === 'blacksmith') return stage.role === 'metal-finishing' ? 'tongs' : seconds % 90 < 30 ? 'heat' : 'hammer';
    return stage.finish > 0 ? 'carve' : ['assembly', 'construction', 'onboarding'].includes(stage.role) || stage.id === 'assemble' ? 'hammer' : stage.id === 'finish' ? 'sand' : seconds % 90 < 45 ? 'saw' : 'plane';
  }
  const selectedObject = selected?.kind === 'object' ? selected : undefined;
  const mainLane = lanes.find(item => item.workerId === 'maker');
  const smithLane = lanes.find(item => item.workerId === 'blacksmith');
  let mainTarget = targetFor('maker');
  let smithTarget = targetFor('blacksmith');
  let mainStageId = mainLane?.stageId;
  let smithStageId = smithLane?.stageId;
  if (!mainTarget) mainTarget = selectedObject?.spec?.mixed || !selectedObject?.spec?.requiredStaff ? selectedObject : undefined;
  if (!smithTarget && selectedObject?.spec?.requiredStaff === 'blacksmith') smithTarget = selectedObject;
  if (selectedObject?.spec?.mixed) {
    const smithHasWholeObject = smithTarget?.id === selectedObject.id && (smithStageId === 'd2' || (!smithLane && selectedObject.status === 'making' && selectedObject.stages?.find(stage => stage.available)?.id === 'd2'));
    const assembled = selectedObject.stages?.find(stage => stage.id === 'assemble')?.completed;
    if (smithHasWholeObject) {
      smithStageId = 'd2';
      if (mainTarget?.id === selectedObject.id) mainTarget = undefined;
    } else if (assembled || ['assemble', 'd1'].includes(mainStageId)) {
      mainStageId ||= assembled ? 'assemble' : mainStageId;
      if (smithTarget?.id === selectedObject.id && !smithLane) smithTarget = undefined;
    } else {
      if (mainTarget?.id === selectedObject.id) mainStageId ||= 'wood';
      if (smithTarget?.id === selectedObject.id) smithStageId ||= 'metal';
    }
  }
  const sceneTarget = (target, workerId, stageId) => ({
    activity: activityFor(workerId), progress: fraction(target),
    recipeId: ['object', 'community'].includes(target?.kind) ? target.recipeId : null,
    patternId: target?.patternId || 'plain', finishStyleId: target?.finishStyleId || 'natural',
    stageId, stageProgress: stageFractions(target),
  });
  const otherSelectedLanes = lanes.filter(lane => lane.jobId === selectedObject?.id);
  if (!mainLane && otherSelectedLanes.some(lane => !lane.stageId || ['wood', 'd1', 'd2', 'assemble'].includes(lane.stageId))) mainTarget = undefined;
  if (!smithLane && otherSelectedLanes.some(lane => lane.workerId === 'finisher' && (!lane.stageId || lane.stageId === 'd2'))) smithTarget = undefined;
  const main = sceneTarget(mainTarget, 'maker', mainStageId);
  if (!selectedJob && !session && !mainTarget) main.recipeId = undefined; // Initial workshop vignette.
  const members = crew.filter(member => ['apprentice', 'blacksmith', 'carver', 'finisher'].includes(member.staffId)).map(member => ({
    staffId: member.staffId, status: member.status,
    ...sceneTarget(member.staffId === 'blacksmith' ? smithTarget : targetFor(member.staffId), member.staffId, member.staffId === 'blacksmith' ? smithStageId : lanes.find(lane => lane.workerId === member.staffId)?.stageId),
  }));
  const contextWorkers = lanes.length ? lanes.map(lane => lane.workerId) : selectedObject?.spec?.mixed ? ['maker', 'blacksmith'] : selectedObject?.spec?.requiredStaff === 'blacksmith' ? ['blacksmith'] : ['maker'];
  const context = contextWorkers.length > 1 ? 'team' : contextWorkers[0] || 'maker';
  const moving = contextWorkers.map(workerId => activityFor(workerId)).filter(activity => activity !== 'idle');
  const community = [...views.values()].find(job => job.kind === 'community' && ['making', 'ready'].includes(job.status));
  const delivered = unlocks.some(item => (item.unlockId || item.key || item.unlockKey || item.id) === 'neighborhood-greenhouse');
  const greenhouse = delivered ? { status: 'delivered', stageProgress: { 'panel-a': 1, 'panel-b': 1, frame: 1, assemble: 1 } } : community ? { status: community.status, stageProgress: stageFractions(community) } : null;
  return { main, greenhouse, crew: members, context, working: moving.length > 0, activity: moving.length > 1 ? 'team' : moving[0] || 'idle', stagePending };
}

/** A kept-piece inspection never borrows targets or pending work from a session. */
export function keptObjectPreview(job) {
  if (job?.kind !== 'object' || job.status !== 'kept') return null;
  return {
    recipeId: job.recipeId, progress: fraction(job), activity: 'idle', motion: 'still', crew: [],
    mainStageId: job.spec?.mixed ? 'assemble' : undefined,
    stageProgress: stageFractions(job), patternId: job.patternId || 'plain', finishStyleId: job.finishStyleId || 'natural',
  };
}
