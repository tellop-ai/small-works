import { candidate, eligibleTargets } from '../../lib/game/rules.js';

// A removed project or completed component must not leave a stale draft selected.
// Keep intentionally empty worker assignments so their validation remains visible.
export function currentDraftLanes(lanes, jobs, workers) {
  return lanes.every(lane => workers.includes(lane.workerId) && (!lane.jobId || jobs.some(job => job.id === lane.jobId && job.status === 'making' && eligibleTargets(job, lane.workerId).some(target => target.stageId === lane.stageId)))) ? lanes : [];
}

export function focusJob(jobs, session, selectedJobId, draftLanes) {
  const sessionTarget = session?.lanes?.[0]?.jobId || session?.jobId;
  if (sessionTarget) return jobs.find(job => job.id === sessionTarget);
  const draftTarget = !session && draftLanes[0]?.jobId;
  return jobs.find(job => job.id === draftTarget) || jobs.find(job => job.id === selectedJobId) || jobs[0];
}

/** A live page may be throttled for minutes without losing its clock. A clock
 * disagreement or an explicit page suspension requires review. Some platforms
 * advance both clocks during OS sleep; browsers cannot reliably distinguish that
 * from throttling. All elapsed time stays a capped candidate until confirmation. */
export function watchSessionClock(session, onTick, onRecovery) {
  const wallStart = Date.now();
  const monoStart = performance.now();
  let lastWall = wallStart;
  let lastMono = monoStart;
  let interrupted = false;
  const interrupt = () => {
    if (interrupted) return;
    interrupted = true;
    onRecovery();
  };
  const tick = () => {
    if (interrupted) return;
    const wall = Date.now();
    const mono = performance.now();
    const wallElapsed = wall - wallStart;
    const monoElapsed = mono - monoStart;
    // Allow subsecond sampling/clock precision differences, never a backwards
    // sample or accumulated clock drift beyond one second.
    if (!Number.isFinite(wallElapsed) || !Number.isFinite(monoElapsed) || wall < lastWall || mono < lastMono || Math.abs(wallElapsed - monoElapsed) > 1000) {
      interrupt(); return;
    }
    lastWall = wall; lastMono = mono;
    onTick(Math.min(candidate(session, wall), session.candidateSeconds + Math.floor(monoElapsed / 1000)));
  };
  const visibility = () => { if (document.visibilityState === 'visible') tick(); };
  const restore = event => { if (event.persisted) interrupt(); };
  const timer = setInterval(tick, 250);
  document.addEventListener('visibilitychange', visibility);
  document.addEventListener('freeze', interrupt);
  window.addEventListener('pagehide', interrupt);
  window.addEventListener('pageshow', restore);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', visibility);
    document.removeEventListener('freeze', interrupt);
    window.removeEventListener('pagehide', interrupt);
    window.removeEventListener('pageshow', restore);
  };
}
