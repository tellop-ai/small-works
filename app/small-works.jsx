'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Hammer, Coins, Timer, Pause, Play, ArrowRight, Check, Leaf, PackageCheck, Armchair, BookOpen, Sun, Moon, Move, CircleStop, Sprout, ArrowUpRight, RefreshCw, Users, ListTodo } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { PageFrame } from '@/components/ui/page-frame';
import { CountsLine } from '@/components/ui/counts-line';
import { t } from '@/lib/i18n/index.js';
import { PANEL_IDS } from '@/lib/pages.js';
import { formatNumber, formatDate } from '@/lib/format.js';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { allocationPreview } from '@/lib/game/allocation.js';
import { candidate, eligibleTargets, workshopCapacity } from '@/lib/game/rules.js';
import { workshopPresentation } from '@/components/small-works/presentation.js';
import { focusJob, currentDraftLanes, watchSessionClock } from '@/components/small-works/client-state.js';
import { hasCrafted, visiblePanels, nextMilestone, suggestedRecipe, recipeAdvancesMilestone, suggestedMinutes, plannedAllocation, finishingValue, saleReceipt } from '@/components/small-works/journey.js';
import { TasksPanel, TaskPicker, TaskSource, FocusEvidence } from '@/components/small-works/tasks-ui.jsx';
import { ReviewDuration, WorkshopMilestone, ShowpieceGoal } from '@/components/small-works/journey-ui.jsx';
import { CrewPanel, GrowthPanel, CommunityPanel, CommunityThanks, ObjectStyles, KeptObjectPreview, WorkAssignments, AllocationSummary, hasUnlock, sessionLanes, eligible, workerLabel, jobTitle, activeWorkers, workTargets, validAssignments, targetTitle, StageList, BankAssignment } from '@/components/small-works/crew-ui.jsx';

const WorkshopScene = dynamic(() => import('@/components/small-works/workshop-scene.jsx').then(module => module.WorkshopScene), { ssr: false });
const recipeIcons = { 'wooden-spoon': Leaf, stool: Armchair, birdhouse: Sprout, 'wall-shelf': BookOpen, 'keepsake-box': PackageCheck, 'toy-boat': Move, 'dining-chair': Armchair, 'writing-desk': BookOpen, cabinet: PackageCheck };
const clock = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;
const idleKinds = ['kept', 'sold', 'delivered', 'salvaged', 'completed'];

export function SmallWorks({ initialSnapshot, initialLocale }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [locale, setLocale] = useState(initialLocale);
  const [theme, setTheme] = useState('light');
  const [motion, setMotion] = useState('full');
  const [reduced, setReduced] = useState(false);
  const [panel, setPanelState] = useState('workshop');
  function setPanel(value) {
    setPanelState(value);
    const url = new URL(window.location.href);
    if (value === 'workshop') url.searchParams.delete('panel'); else url.searchParams.set('panel', value);
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(null);
  const [problem, setProblem] = useState(initialSnapshot ? '' : 'sw.error.storage');
  const [notice, setNotice] = useState('');
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [minutes, setMinutes] = useState(25);
  const [timerEdited, setTimerEdited] = useState(false);
  const [custom, setCustom] = useState('20');
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [completedTaskPage, setCompletedTaskPage] = useState(false);
  const [intention, setIntention] = useState('');
  const [tag, setTag] = useState('');
  const [workshopName, setWorkshopName] = useState('');
  const [focusOnly, setFocusOnly] = useState(false);
  const [draftLanes, setDraftLanes] = useState([]);
  const [pausedShares, setPausedShares] = useState(null);
  const [bankWorker, setBankWorker] = useState(null);
  const [bankStage, setBankStage] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [lastSale, setLastSale] = useState(null);
  const [previewJobId, setPreviewJobId] = useState(null);
  const [keptPage, setKeptPage] = useState(false);
  const [review, setReview] = useState(false);
  const [reviewSeconds, setReviewSeconds] = useState('0');
  const [liveCandidate, setLiveCandidate] = useState(0);
  const [runningId, setRunningId] = useState(null);
  const [recovery, setRecovery] = useState(Boolean(initialSnapshot?.session));
  const previewRef = useRef(null);
  const focusPanelRef = useRef(null), focusSetupRequested = useRef(false);
  const sending = useRef(false);
  const session = snapshot?.session;
  const workshop = snapshot?.workshop;
  const words = (key, values) => t(`smallWorks.${key}`, locale, values);
  const number = value => formatNumber(Number(value || 0), locale);
  const coins = amount => number((amount || 0) / 100);
  const duration = seconds => words('duration', { minutes: number(Math.floor((seconds || 0) / 60)), seconds: number(Math.floor((seconds || 0) % 60)) });
  const tasks = snapshot?.tasks || [];
  const selectedTask = tasks.find(task => task.id === selectedTaskId);
  const jobs = snapshot?.jobs || [];
  const previewJob = jobs.find(item => item.id === previewJobId && item.kind === 'object' && item.status === 'kept');
  const openJobs = jobs.filter(job => !idleKinds.includes(job.status));
  const recipes = snapshot?.content?.recipes || [];
  const isRunning = Boolean(session && session.status === 'running' && runningId === session.id && !recovery);
  const blocked = busy || Boolean(uncertain);
  const expanded = hasUnlock(snapshot, 'carpenter-room');
  const joinery = hasUnlock(snapshot, 'joinery-bench');
  const apprentice = snapshot?.crew?.some(item => item.staffId === 'apprentice' && item.status === 'active');
  const yard = hasUnlock(snapshot, 'craft-yard');
  const carver = snapshot?.crew?.some(item => item.staffId === 'carver' && item.status === 'active');
  const finisher = snapshot?.crew?.some(item => item.staffId === 'finisher' && item.status === 'active');
  const { openJobs: capacity, lanes: laneCapacity } = workshopCapacity(snapshot?.unlocks || [], snapshot?.crew || []);
  const forge = hasUnlock(snapshot, 'forge');
  const blacksmith = snapshot?.crew?.some(item => item.staffId === 'blacksmith' && item.status === 'active');
  const workers = activeWorkers(snapshot);
  const currentDraft = currentDraftLanes(draftLanes, openJobs, workers);
  const job = focusJob(openJobs, session, selectedJobId, currentDraft);
  const selectedSpec = job?.spec || recipes.find(item => item.id === job?.recipeId);
  const firstTarget = workers.flatMap(workerId => workTargets(job ? [job] : [], workerId).map(target => ({ workerId, ...target, share: 100 })))[0];
  const setupLanes = currentDraft.length ? currentDraft : firstTarget ? [firstTarget] : [];
  const setupValid = validAssignments(setupLanes, jobs, workers, laneCapacity);
  const durationChoice = timerEdited ? minutes : focusOnly ? 25 : suggestedMinutes(job, setupLanes);
  const plannedSeconds = durationChoice === 'countup' ? null : Math.round(Number(durationChoice === 'custom' ? custom : durationChoice) * 60);
  const planned = setupValid && Number.isInteger(plannedSeconds) && plannedSeconds >= 0 && plannedSeconds <= 10800 ? plannedAllocation(setupLanes, jobs, plannedSeconds) : [];
  const plannedOverflow = planned.reduce((sum, lane) => sum + lane.bankedSeconds, 0);
  const milestone = nextMilestone(snapshot);
  const recommendation = suggestedRecipe(snapshot, milestone);
  const detailValue = finishingValue(job);

  const bankWorkerId = bankWorker && workers.includes(bankWorker) ? bankWorker : workers.find(id => job && eligibleTargets(job, id).length) || 'maker';
  const bankTargets = job ? eligibleTargets(job, bankWorkerId) : [];
  const bankTargetId = bankTargets.some(item => item.stageId === bankStage) ? bankStage : bankTargets[0]?.stageId;


  useEffect(() => {
    const navigate = () => { const value = new URLSearchParams(window.location.search).get('panel'); setPanelState(PANEL_IDS.includes(value) ? value : 'workshop'); };
    navigate(); window.addEventListener('popstate', navigate);
    return () => window.removeEventListener('popstate', navigate);
  }, []);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    if (panel !== 'workshop' || !focusSetupRequested.current) return;
    focusSetupRequested.current = false;
    const target = focusPanelRef.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: matchMedia('(max-width: 760px)').matches ? 'start' : 'nearest', behavior: 'instant' });
  }, [panel, selectedTaskId]);
  useEffect(() => {
    if (panel === 'showroom' && previewJobId) previewRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [panel, previewJobId]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
  useEffect(() => {
    setLiveCandidate(session?.candidateSeconds || 0);
    if (!isRunning) return;
    return watchSessionClock(session, setLiveCandidate, () => {
      setRecovery(true); setRunningId(null);
    });
  }, [isRunning, session]);

  async function readSnapshot(keptBefore = null, taskBefore = null) {
    const query = new URLSearchParams({ ...(keptBefore ? { keptBefore } : {}), ...(taskBefore ? { taskBefore } : {}) });
    const response = await fetch(`/api/workshop?${query}`, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok || !result.ok || !result.snapshot) throw new Error('read');
    setSnapshot(result.snapshot); setKeptPage(Boolean(keptBefore)); setCompletedTaskPage(Boolean(taskBefore));
    if (result.snapshot.session && (!isRunning || result.snapshot.session.id !== runningId)) { setRecovery(true); setRunningId(null); }
    return result.snapshot;
  }
  function rememberReceipt(command, receipt) {
    const sale = saleReceipt(command, receipt, jobs);
    if (sale) setLastSale(sale);
    if (command.kind === 'session.settle') setLastResult({ ...receipt?.result, titles: Object.fromEntries(jobs.map(item => [item.id, jobTitle(item, locale)])) });
  }
  function accept(result, command) {
    if (result.snapshot) setSnapshot(result.snapshot);
    setUncertain(null); setProblem(''); setNotice('saved');
    rememberReceipt(command, result.receipt);
    if (command.kind === 'session.start') setLastResult(null);
    if (command.kind === 'task.add') setSelectedTaskId(result.receipt?.result?.taskId || null);
    if (command.kind === 'task.complete' && command.taskId === selectedTaskId) setSelectedTaskId(null);
    if (result.snapshot) setCompletedTaskPage(false);
    setPausedShares(null);
    if (['session.start', 'session.resume'].includes(command.kind) && result.snapshot?.session) {
      setRunningId(result.snapshot.session.id); setRecovery(false); setReview(false);
    }
    if (['session.pause', 'session.recover', 'session.trim'].includes(command.kind)) {
      setRunningId(null); setRecovery(false);
      if (command.kind !== 'session.pause' || review) { setReview(true); setReviewSeconds(String(result.snapshot?.session?.candidateSeconds || 0)); }
    }
    if (['session.settle', 'session.discard'].includes(command.kind)) { setReview(false); setRecovery(false); setRunningId(null); setDraftLanes([]); }
    if (command.kind === 'job.detail') { setDraftLanes([]); setBankStage(null); setTimerEdited(false); }
    if (['job.start', 'room.expand', 'crew.welcome', 'community.fund'].includes(command.kind)) {
      const newest = result.snapshot?.jobs?.find(item => item.id === result.receipt?.result?.jobId) || result.snapshot?.jobs?.find(item => !idleKinds.includes(item.status) && (item.recipeId === command.recipeId || item.recipeId === command.expansionId || item.recipeId === command.projectId || item.recipeId === command.staffId));
      if (newest) setSelectedJobId(newest.id);
      setTimerEdited(false);
      setDraftLanes([]); setBankWorker(null); setBankStage(null);
      setPanel('workshop'); setFocusOnly(false);
    }
  }
  async function send(command) {
    const response = await fetch('/api/workshop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) });
    const result = await response.json();
    if (result.ok && result.receipt) {
      if (result.snapshot) { accept(result, command); return result; }
      const restored = await readSnapshot();
      setUncertain(null); setProblem(''); setNotice('recoveredSave');
      rememberReceipt(command, result.receipt);
      return { ...result, snapshot: restored };
    }
    if (['uncertain', 'storage'].includes(result.error?.code) || response.status >= 500) {
      setUncertain(command); setProblem('sw.error.uncertain'); return null;
    }
    if (result.snapshot) { setSnapshot(result.snapshot); if (result.snapshot.session && (!isRunning || result.snapshot.session.id !== runningId)) { setRecovery(true); setRunningId(null); } }
    setProblem(result.error?.messageKey || 'sw.error.invalid');
    return null;
  }
  async function command(kind, fields = {}) {
    if (sending.current || uncertain) return null;
    const draft = { operationId: crypto.randomUUID(), revision: snapshot?.revision || 0, kind, ...fields };
    sending.current = true; setBusy(true); setProblem(''); setNotice('');
    try { return await send(draft); }
    catch { setUncertain(draft); setProblem('sw.error.uncertain'); return null; }
    finally { sending.current = false; setBusy(false); }
  }
  async function loadKept(cursor) {
    if (sending.current || busy) return;
    setBusy(true); setProblem('');
    try { await readSnapshot(cursor); } catch { setProblem('sw.error.storage'); }
    finally { setBusy(false); }
  }
  async function loadCompleted(cursor) {
    if (sending.current || busy) return;
    setBusy(true); setProblem('');
    try { await readSnapshot(null, cursor); } catch { setProblem('sw.error.storage'); }
    finally { setBusy(false); }
  }
  function focusTask(id) {
    if (session || blocked) return;
    setSelectedTaskId(id);
    const target = job?.status === 'making' ? job : openJobs.find(item => item.status === 'making');
    if (target) { setSelectedJobId(target.id); if (target.id !== job?.id) setDraftLanes([]); }
    setFocusOnly(!target); focusSetupRequested.current = true; setPanel('workshop');
  }
  function returnToSession() { focusSetupRequested.current = true; setPanel('workshop'); if (recovery && !blocked) void finish(); }
  async function reconcile() {
    if (!uncertain || sending.current) return;
    sending.current = true; setBusy(true); setNotice('');
    try {
      const response = await fetch(`/api/workshop/receipt?operationId=${encodeURIComponent(uncertain.operationId)}`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error('receipt');
      if (result.receipt) {
        await readSnapshot(); setUncertain(null); setProblem(''); setNotice('recoveredSave');
        rememberReceipt(uncertain, result.receipt);
      } else {
        // Retry only the exact original command and id after inspecting its receipt.
        await send(uncertain);
      }
    } catch { setProblem('sw.error.uncertain'); }
    finally { sending.current = false; setBusy(false); }
  }
  async function finish() {
    if (!session) return;
    if (session.status === 'running') {
      const result = await command(recovery ? 'session.recover' : 'session.pause');
      if (!result) return;
      setReviewSeconds(String(result.snapshot.session?.candidateSeconds || 0));
    } else setReviewSeconds(String(session.candidateSeconds || 0));
    setReview(true); setRecovery(false); setRunningId(null);
  }
  async function startSession() {
    const fields = { mode: durationChoice === 'countup' ? 'countup' : 'countdown', intention, tag, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
    if (selectedTask) fields.taskId = selectedTask.id;
    if (plannedSeconds !== null) fields.plannedSeconds = plannedSeconds;
    if (job?.status === 'making' && !focusOnly) fields.lanes = setupLanes;
    await command('session.start', fields);
  }

  // One wall-clock sample bounds every presentation preview. A cached timer can be
  // ahead after a clock rollback; retained closed spans still remain available.
  const presentationNow = Date.now();
  const previewLimit = session ? candidate(session, presentationNow) : 0;
  const transient = Math.min(isRunning ? liveCandidate : session?.candidateSeconds || 0, previewLimit);
  const presentationSeconds = review && !recovery ? Math.min(transient, Math.max(0, Math.floor(Number(reviewSeconds) || 0))) : transient;
  const projected = session && session.mode !== 'break' ? allocationPreview(session, jobs, presentationSeconds, presentationNow) : [];
  const pendingFor = id => projected.filter(item => item.jobId === id).reduce((total, item) => total + item.appliedSeconds, 0);
  const presentation = workshopPresentation({ jobs, selectedJob: job, session, crew: snapshot?.crew || [], allocations: projected, isRunning, seconds: transient, unlocks: snapshot?.unlocks || [] });
  const { main, crew: crewScene, stagePending } = presentation;
  const scenePerson = presentation.context === 'team' ? words('scene.team') : workerLabel(presentation.context, words);
  const hasCommission = (snapshot?.commissions || []).some(item => (item.templateId || item.contentId || item.commissionId || item.id) === 'first-stool' && !['completed', 'delivered'].includes(item.status));
  const titleOf = item => jobTitle(item, locale);
  const returnToJob = id => { if (id !== job?.id) setTimerEdited(false); setSelectedJobId(id); setDraftLanes([]); setBankWorker(null); setBankStage(null); setFocusOnly(false); setPanel('workshop'); };
  const allocationLines = seconds => {
    seconds = Math.min(seconds, previewLimit);
    const allocations = allocationPreview(session, jobs, seconds, presentationNow);
    return <AllocationSummary allocations={allocations} acceptedSeconds={seconds} bankedSeconds={session.mode === 'break' ? 0 : seconds - allocations.reduce((total, item) => total + item.appliedSeconds, 0)} words={words} duration={duration} titleOf={(id, stageId) => targetTitle(jobs.find(item => item.id === id), stageId, locale) || words('allocation.savedTarget')} estimated />;
  };
  const button = (label, onClick, variant = 'default', icon = null, disabled = false) => <Button variant={variant} disabled={blocked || disabled} onClick={onClick}>{icon}{label}</Button>;

  function focusPanel() {
    if (!snapshot) return <><span className="sw-eyebrow">{words('welcome')}</span><h2>{words('return')}</h2><p>{words('readFailed')}</p>{button(words('retry'), async () => { setBusy(true); try { await readSnapshot(); setProblem(''); } catch { setProblem('sw.error.storage'); } finally { setBusy(false); } }, 'default', <RefreshCw />)}</>;
    if (!snapshot.initialized) return <><span className="sw-eyebrow">{words('welcome')}</span><h2>{words('onboarding.title')}</h2><p className="sw-copy">{words('onboarding.description')}</p><div className="sw-note"><Leaf /><span>{words('onboarding.promise')}</span></div><Label htmlFor="workshop-name">{words('onboarding.name')}</Label><Input id="workshop-name" value={workshopName} onChange={event => setWorkshopName(event.target.value)} maxLength={80} placeholder={words('onboarding.placeholder')} />{button(words('onboarding.open'), () => command('initialize', workshopName.trim() ? { name: workshopName.trim() } : {}), 'default', <ArrowRight />)}<p className="sw-fine">{words('onboarding.starting')}</p></>;
    if (session && (review || recovery)) return <><TaskSource session={session} words={words} /><span className="sw-eyebrow">{words(recovery ? 'focus.recoveryLabel' : 'focus.reviewLabel')}</span><h2>{words(recovery ? 'focus.recoveryTitle' : 'focus.reviewTitle')}</h2><p className="sw-copy">{words(recovery ? 'focus.recoveryDescription' : 'focus.reviewDescription')}</p>{recovery ? <>{button(words('focus.reviewRecovered'), finish, 'default', <Timer />)}<p className="sw-fine">{words('focus.recoveryFine')}</p></> : <>{session.mode === 'break' ? <p className="sw-note">{words('focus.breakDescription')}</p> : <ReviewDuration candidateSeconds={session.candidateSeconds} value={reviewSeconds} onChange={setReviewSeconds} words={words} duration={duration} disabled={blocked} />}{session.mode !== 'break' ? allocationLines(Math.min(session.candidateSeconds, Math.max(0, Math.floor(Number(reviewSeconds) || 0)))) : null}{button(words(session.mode === 'break' ? 'focus.finishBreak' : 'focus.keep'), () => command('session.settle', { seconds: session.mode === 'break' ? 0 : Number(reviewSeconds) }), 'default', <Check />, !/^\d+$/.test(reviewSeconds) || Number(reviewSeconds) > session.candidateSeconds)}{button(words('focus.discard'), () => command('session.discard'), 'outline')}<p className="sw-fine">{words('focus.bankOverflow')}</p></>}</>;
    if (session) return <><TaskSource session={session} words={words} /><span className="sw-eyebrow sw-focus-state"><span className={isRunning ? 'sw-live-dot' : 'sw-rest-dot'} />{words(session.mode === 'break' ? 'focus.breakLabel' : isRunning ? 'focus.running' : 'focus.paused')}</span><div className="sw-timer" role="timer" aria-label={words('focus.timerLabel')}>{clock(session.mode === 'countup' ? transient : session.limitSeconds - transient)}</div>{session.intention ? <h2 className="sw-session-intention">{session.intention}</h2> : null}{session.mode !== 'countup' ? <div className="sw-row"><span>{words('focus.thisSession')}</span><strong>{duration(transient)}</strong></div> : null}{session.mode !== 'countup' && transient >= session.limitSeconds ? <p className="sw-note">{words('focus.timeReached')}</p> : null}{isRunning ? button(words('focus.pause'), () => command('session.pause'), 'default', <Pause />) : button(words('focus.resume'), () => command('session.resume'), 'default', <Play />, session.candidateSeconds >= session.limitSeconds || Boolean(pausedShares))}{button(words('focus.finish'), finish, 'ghost', <ArrowRight />)}{session.mode !== 'break' ? <><details className="sw-disclosure"><summary>{words('allocation.preview')}</summary>{allocationLines(transient)}</details>{!isRunning && sessionLanes(session).length > 1 ? <><WorkAssignments lanes={sessionLanes(session).map((item, index) => ({ ...item, share: pausedShares?.[index] ?? item.share }))} onChange={items => setPausedShares(items.map(item => item.share))} jobs={jobs} apprentice={apprentice} blacksmith={blacksmith} carver={carver} finisher={finisher} maxLanes={laneCapacity} words={words} locale={locale} disabled={blocked} fixed />{pausedShares ? <p className="sw-fine">{words('allocation.unsavedShares')}</p> : null}{button(words('allocation.saveShares'), () => command('session.shares', { shares: pausedShares }), 'outline', null, !pausedShares)}</> : null}{isRunning && sessionLanes(session).length > 1 ? <p className="sw-fine">{words('allocation.fixed')}</p> : null}</> : null}<p className="sw-fine">{words('focus.noAutoCredit')}</p></>;
    if (job?.kind === 'community' && job.status === 'ready' && !focusOnly) return <><span className="sw-eyebrow">{words('community.readyLabel')}</span><h2>{titleOf(job)}</h2><p className="sw-copy">{words('community.ready')}</p><p className="sw-note">{words('community.noPayout')}</p>{button(words('community.deliver'), () => command('community.deliver', { jobId: job.id }), 'default', <PackageCheck />)}<p className="sw-fine">{words('community.cancelExplanation', { value: coins(job.spec?.materialMinor) })}</p>{button(words('community.cancel', { value: coins(job.spec?.materialMinor) }), () => command('job.salvage', { jobId: job.id }), 'outline')}{button(words('focus.only'), () => setFocusOnly(true), 'ghost', <Timer />)}</>;
    if (job?.status === 'ready' && !focusOnly) return <><span className="sw-eyebrow">{words('object.readyLabel')}</span><h2>{titleOf(job)}</h2><span className="sw-finish-badge"><Check />{words(`finish.${Math.max(0, job.completedFinish)}`)}</span><div className="sw-price"><span>{words('object.marketValue')}</span><strong>{coins(job.marketPriceMinor)}<Coins /></strong></div>{job.recipeId === 'stool' && hasCommission ? button(words('object.deliver', { amount: coins(job.commissionPriceMinor) }), () => command('commission.deliver', { jobId: job.id, commissionId: 'first-stool' }), 'default', <PackageCheck />) : null}{button(words('object.sell', { amount: coins(job.marketPriceMinor) }), () => command('job.sell', { jobId: job.id }), hasCommission && job.recipeId === 'stool' ? 'outline' : 'default', <Coins />)}{button(words('object.keep'), () => command('job.keep', { jobId: job.id }), 'outline', <Armchair />)}<p className="sw-fine">{words('object.keepConsequence')}</p>{detailValue ? <p className="sw-fine sw-detail-value">{words('detail.valuePreview', { current: coins(detailValue.current), final: coins(detailValue.final), increment: coins(detailValue.increment), value: duration(detailValue.seconds) })}</p> : null}{job.completedFinish < 2 ? <p className="sw-fine">{words('detail.noMaterials')}</p> : null}{job.completedFinish < 2 ? button(words('object.namedDetail', { name: words(selectedSpec?.mixed ? job.completedFinish === 0 ? 'detail.wood' : 'detail.metal' : selectedSpec?.requiredStaff === 'blacksmith' ? 'detail.metal' : selectedSpec?.requiredUnlock === 'joinery-bench' ? 'detail.joinery' : 'detail.wood'), minutes: number((selectedSpec?.detailSeconds?.[job.completedFinish] || 0) / 60) }), () => command('job.detail', { jobId: job.id, detailId: job.completedFinish === 0 ? 'd1' : 'd2' }), 'ghost', <Leaf />) : null}<ObjectStyles job={job} snapshot={snapshot} words={words} locale={locale} command={command} blocked={blocked} />{button(words('focus.only'), () => setFocusOnly(true), 'ghost', <Timer />)}</>;
    return <>{job || focusOnly || hasCommission ? <span className="sw-eyebrow">{words(job || focusOnly ? 'focus.setupLabel' : 'commission.label')}</span> : null}<h2>{focusOnly ? words('focus.onlyTitle') : job ? titleOf(job) : words(hasCommission ? 'commission.title' : 'workbench.recipes')}</h2>{!job && !focusOnly && hasCommission ? <p className="sw-copy">{words('commission.description')}</p> : null}{!job && !focusOnly ? <>{hasCommission ? <div className="sw-commission"><div className="sw-row"><span>{words('recipe.focus')}</span><strong>{words('minutes', { value: 20 })}</strong></div><div className="sw-row"><span>{words('recipe.materials')}</span><strong>{coins(1200)} <Coins /></strong></div><div className="sw-row"><span>{words('commission.delivery')}</span><strong>{coins(7800)} <Coins /></strong></div></div> : null}{!hasCommission && recommendation ? <p className="sw-fine">{words('journey.recipeCost', { minutes: number(recommendation.baseSeconds / 60), coins: coins(recommendation.materialMinor) })}</p> : null}{recommendation || hasCommission ? button(hasCommission ? words('commission.begin') : words('journey.makeSuggested', { name: t(recommendation.nameKey, locale) }), () => command('job.start', { recipeId: hasCommission ? 'stool' : recommendation.id }), 'default', <Hammer />, (workshop?.coinMinor || 0) < (hasCommission ? 1200 : recommendation.materialMinor) || openJobs.filter(item => item.kind === 'object').length >= capacity) : null}{!hasCommission && recipeAdvancesMilestone(snapshot, recommendation, milestone) ? <p className="sw-fine">{words('journey.variety')}</p> : null}{button(words('recipe.choose'), () => setPanel('workbench'), 'outline', <ArrowUpRight />)}{button(words('focus.only'), () => setFocusOnly(true), 'ghost', <Timer />)}{button(words('focus.break'), () => command('session.start', { mode: 'break', plannedSeconds: 300 }), 'ghost', <Leaf />)}</> : <><TaskPicker tasks={tasks} value={selectedTask?.id} onChange={setSelectedTaskId} command={command} words={words} blocked={blocked} /><div className="sw-time-options" aria-label={words('focus.length')}>{[...new Set([5, 15, 20, 25, 50, ...(typeof durationChoice === 'number' ? [durationChoice] : [])])].sort((a, b) => a - b).concat(['custom', 'countup']).map(value => <Button key={value} variant={durationChoice === value ? 'default' : 'outline'} aria-pressed={durationChoice === value} disabled={blocked} onClick={() => { setTimerEdited(true); setMinutes(value); }}>{typeof value === 'number' ? words('minutes', { value }) : words(`focus.${value}`)}</Button>)}</div>{durationChoice === 'custom' ? <><Label htmlFor="custom-minutes">{words('focus.customMinutes')}</Label><Input id="custom-minutes" type="number" min="1" max="180" value={custom} onChange={event => setCustom(event.target.value)} /></> : null}{!focusOnly ? <WorkAssignments lanes={setupLanes} onChange={setDraftLanes} jobs={openJobs} apprentice={apprentice} blacksmith={blacksmith} carver={carver} finisher={finisher} maxLanes={laneCapacity} words={words} locale={locale} disabled={blocked} compact plannedSeconds={plannedSeconds} /> : <p className="sw-note">{words('allocation.bankOnly')}</p>}{!focusOnly && plannedOverflow > 0 ? <p className="sw-fine">{words('focus.overflowPlanned', { value: duration(plannedOverflow) })}</p> : null}{button(words('focus.start'), startSession, 'default', <Play />, (!focusOnly && !setupValid) || (durationChoice === 'custom' && (!Number.isFinite(Number(custom)) || Number(custom) < 1 || Number(custom) > 180)))}<details className="sw-disclosure sw-session-note"><summary>{words('focus.note')}</summary><div><Label htmlFor="focus-intention">{words('focus.intention')}</Label><Input id="focus-intention" maxLength={80} value={intention} onChange={event => setIntention(event.target.value)} placeholder={words('focus.intentionPlaceholder')} /><Label htmlFor="focus-tag">{words('focus.tag')}</Label><Input id="focus-tag" maxLength={40} value={tag} onChange={event => setTag(event.target.value)} placeholder={words('focus.tagPlaceholder')} /></div></details>{durationChoice === 'countup' ? <p className="sw-fine">{words('focus.honestTimer')}</p> : null}{!focusOnly ? button(words('focus.only'), () => setFocusOnly(true), 'ghost', <Timer />) : job ? button(words('focus.withPiece'), () => setFocusOnly(false), 'ghost', <Hammer />) : button(words('recipe.choose'), () => { setFocusOnly(false); setPanel('workbench'); }, 'ghost', <Hammer />)}{button(words('focus.break'), () => command('session.start', { mode: 'break', plannedSeconds: 300 }), 'ghost', <Leaf />)}{job?.status === 'making' && !focusOnly && (workshop?.bankSeconds || 0) > 0 ? <BankAssignment job={job} workers={workers} workerId={bankWorkerId} stageId={bankTargetId} onChange={(workerId, stageId) => { setBankWorker(workerId); setBankStage(stageId || null); }} bankSeconds={workshop.bankSeconds} words={words} locale={locale} duration={duration} disabled={blocked} command={command} /> : null}</>}</>;
  }

  return <div className="sw-app" data-tellop-app-marker="ok">
    <header className="sw-topbar"><a href="/" className="sw-brand"><span className="sw-brand-mark"><Hammer /></span><span>{words('brand')}</span></a><span className="sw-save-status" role="status">{notice ? words(notice) : null}</span><div className="sw-wallet"><Coins aria-hidden="true" /><span>{coins(workshop?.coinMinor)}</span><span className="sw-sr-only">{words('coins')}</span></div><Button variant="ghost" size="icon" title={words('settings.sessionOnly')} aria-label={words(motion === 'still' ? 'settings.stillOn' : 'settings.still')} aria-pressed={motion === 'still'} onClick={() => setMotion(motion === 'still' ? 'full' : 'still')}><CircleStop /></Button><Button variant="ghost" size="icon" aria-label={words(theme === 'light' ? 'settings.dark' : 'settings.light')} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <Moon /> : <Sun />}</Button><Button variant="ghost" onClick={() => setLocale(locale === 'en' ? 'tr' : 'en')} aria-label={words('settings.language')}>{locale === 'en' ? 'TR' : 'EN'}</Button></header>
    <nav className="sw-nav" aria-label={words('nav.label')}>{visiblePanels(snapshot, panel).map(value => { const Icon = [Hammer, ListTodo, BookOpen, Users, Armchair, Sprout, Leaf, Timer][PANEL_IDS.indexOf(value)]; return <Button key={value} variant="ghost" aria-current={panel === value ? 'page' : undefined} className={panel === value ? 'sw-nav-active' : ''} onClick={() => setPanel(value)}><Icon />{words(`nav.${value}`)}</Button>; })}</nav>
    {(problem || uncertain) ? <div className={`sw-feedback ${problem ? 'sw-feedback-problem' : ''}`} role="status"><span>{problem ? t(problem, locale) : words(notice)}</span>{uncertain ? <><span>{words('uncertain.keepOpen')}</span><Button variant="outline" disabled={busy} onClick={reconcile}><RefreshCw />{words('uncertain.check')}</Button></> : null}</div> : null}
    {lastSale ? <section className="sw-sale-result" role="status"><div><strong>{words(lastSale.kind === 'commission.deliver' ? 'receipt.delivered' : 'receipt.sold', { name: lastSale.nameKey ? t(lastSale.nameKey, locale) : words('allocation.savedTarget') })}</strong><p>{words('receipt.reward', { value: coins(lastSale.coinDeltaMinor) })}</p></div><Button variant="outline" onClick={() => { setFocusOnly(false); setPanel('workbench'); }}>{words('receipt.next')}</Button><Button variant="ghost" onClick={() => setLastSale(null)}>{words('receipt.dismiss')}</Button></section> : null}
    {lastResult ? <section className="sw-session-result" role="status">{lastResult.taskTitle ? <p className="sw-result-task">{words('tasks.confirmedFor', { title: lastResult.taskTitle })}</p> : null}<AllocationSummary allocations={lastResult.allocations || []} acceptedSeconds={lastResult.acceptedSeconds || 0} bankedSeconds={lastResult.bankedSeconds || 0} words={words} duration={duration} titleOf={(id, stageId) => [lastResult.titles[id] || titleOf(jobs.find(item => item.id === id)) || words('allocation.savedTarget'), stageId ? t(jobs.find(item => item.id === id)?.stages?.find(stage => stage.id === stageId)?.nameKey || `sw.stage.${stageId}`, locale) : ''].filter(Boolean).join(' · ')} />{lastResult.taskId && !session && tasks.some(task => task.id === lastResult.taskId) ? <Button variant="outline" disabled={blocked} onClick={() => command('task.complete', { taskId: lastResult.taskId })}><Check />{words('tasks.markDone')}</Button> : null}<Button variant="ghost" onClick={() => setLastResult(null)}>{words('allocation.closeResult')}</Button></section> : null}
    {panel === 'workshop' ? <>
      <div className="sw-workshop-layout"><section className="sw-world" aria-label={words('scene.label')}><WorkshopScene yard={yard} greenhouse={presentation.greenhouse} patternId={main.patternId} finishStyleId={main.finishStyleId} crew={crewScene} forge={forge} mainStageId={main.stageId} stageProgress={main.stageProgress} joinery={joinery} recipeId={main.recipeId} activity={main.activity} progress={main.progress} motion={motion === 'still' ? 'still' : reduced ? 'reduced' : 'full'} expanded={expanded} locale={locale} label={words('scene.label')} /><div className="sw-world-heading"><h1>{workshop?.name || words('nav.workshop')}</h1><span className="sw-world-badge"><Hammer />{scenePerson} · {words(`activity.${presentation.activity}`)}</span></div></section><aside ref={focusPanelRef} tabIndex={-1} className="sw-focus-panel" aria-label={words('focus.panelLabel')}>{focusPanel()}{snapshot?.initialized && !session && hasCrafted(snapshot) ? <WorkshopMilestone progress={milestone} snapshot={snapshot} words={words} locale={locale} duration={duration} coins={coins} number={number} onPanel={setPanel} returnToJob={returnToJob} /> : null}{snapshot?.initialized && !session && hasUnlock(snapshot, 'neighborhood-greenhouse') ? <ShowpieceGoal words={words} onPanel={setPanel} hasKept={jobs.some(item => item.kind === 'object' && item.status === 'kept')} /> : null}</aside></div>
      {job ? <section className="sw-progress-strip" aria-label={words('progress.label')}><div><span className="sw-eyebrow">{words('progress.current')}</span><h2>{titleOf(job)}</h2><FocusEvidence kind="product" id={job.id} revision={snapshot.revision} words={words} locale={locale} duration={duration} /></div><StageList job={job} words={words} locale={locale} duration={duration} pending={stagePending(job)} /><div className="sw-progress-total"><strong>{duration(job.progressSeconds ?? job.appliedSeconds ?? 0)}</strong><span>{words('progress.confirmed')}</span>{session?.mode !== 'break' && sessionLanes(session).some(item => item.jobId === job.id) ? <small>{words('progress.pending', { value: duration(pendingFor(job.id)) })}</small> : null}</div></section> : null}
    </> : <PageFrame className="sw-page" locale={locale} title={words(`nav.${panel}`)} description={panel === 'community' ? words('community.description') : undefined} counts={snapshot?.initialized && panel !== 'tasks' ? <CountsLine items={[{ label: words('coins'), value: coins(workshop.coinMinor) }, { label: words('effort.label'), value: duration(workshop.bankSeconds) }, { label: words('focus.lifetime'), value: duration(workshop.lifetimeFocusSeconds) }]} /> : null}>
      {!snapshot?.initialized ? <Card><CardContent><p>{words('openFirst')}</p>{button(words('nav.workshop'), () => setPanel('workshop'), 'default', <ArrowRight />)}</CardContent></Card> : null}
      {snapshot?.initialized && panel === 'workbench' ? <>{openJobs.length ? <section className="sw-current-jobs"><h2>{words('workbench.current')}</h2>{openJobs.map(item => <Card key={item.id}><CardContent><div className="sw-job-row"><div><h3>{t(item.spec?.nameKey || `sw.recipe.${item.recipeId}`, locale)}</h3><p>{duration(item.progressSeconds ?? item.appliedSeconds)} · {words(`status.${item.status}`)}</p>{['improvement', 'onboarding', 'community'].includes(item.kind) ? <p>{words(item.kind === 'community' ? 'community.cancelExplanation' : item.kind === 'onboarding' ? 'crew.cancelTrainingExplanation' : 'growth.cancelExplanation', { value: coins(item.spec?.materialMinor) })}</p> : null}<ObjectStyles job={item} snapshot={snapshot} words={words} locale={locale} command={command} blocked={blocked} /><FocusEvidence kind="product" id={item.id} revision={snapshot.revision} words={words} locale={locale} duration={duration} />{session && !sessionLanes(session).some(lane => lane.jobId === item.id) ? <p>{words('allocation.fixed')}</p> : null}</div>{button(words('workbench.return'), () => returnToJob(item.id), 'default', <ArrowRight />, Boolean(session && !sessionLanes(session).some(lane => lane.jobId === item.id)))}{!sessionLanes(session).some(lane => lane.jobId === item.id) && item.status === 'making' ? button(words(item.kind === 'community' ? 'growth.cancel' : ['improvement', 'onboarding'].includes(item.kind) ? 'growth.cancel' : item.completedFinish >= 0 ? 'object.stopDetail' : 'object.salvage'), () => command(item.kind === 'object' && item.completedFinish >= 0 ? 'job.abandon' : 'job.salvage', { jobId: item.id }), 'outline') : null}</div></CardContent></Card>)}</section> : null}<div className="sw-section-heading"><h2>{words('workbench.catalog')}</h2><p>{words('workbench.freeSpoon')}</p></div><div className="sw-recipes">{recipes.map(item => { const Icon = recipeIcons[item.id] || Hammer; return <Card key={item.id} className="sw-recipe"><CardHeader><span className="sw-recipe-icon"><Icon /></span><CardTitle>{t(item.nameKey, locale)}</CardTitle></CardHeader><CardContent><div className="sw-row"><span>{words('recipe.focus')}</span><strong>{words('minutes', { value: item.baseSeconds / 60 })}</strong></div><div className="sw-row"><span>{words('recipe.materials')}</span><strong>{coins(item.materialMinor)} <Coins /></strong></div>{item.requiredUnlock && !hasUnlock(snapshot, item.requiredUnlock) ? <p className="sw-fine">{words(item.requiredUnlock === 'forge' ? 'recipe.forgeRequired' : 'recipe.joineryRequired')}</p> : null}{item.requiredStaff && !blacksmith ? <p className="sw-fine">{words('recipe.blacksmithRequired')}</p> : null}{item.mixed ? <details className="sw-disclosure"><summary>{words('stages.details')}</summary><StageList job={{ spec: item }} words={words} locale={locale} duration={duration} /></details> : null}{workshop.coinMinor < item.materialMinor ? <p className="sw-fine">{words('recipe.coinsRequired')}</p> : null}{openJobs.filter(item => item.kind === 'object').length >= capacity ? <p className="sw-fine">{words('recipe.slotsRequired')}</p> : null}<div className="sw-recipe-actions"><Button variant="outline" aria-label={words('recipe.makeNamed', { name: t(item.nameKey, locale) })} disabled={blocked || Boolean(item.requiredUnlock && !hasUnlock(snapshot, item.requiredUnlock)) || Boolean(item.requiredStaff && !blacksmith) || Boolean(item.mixed && !joinery) || openJobs.filter(item => item.kind === 'object').length >= capacity || workshop.coinMinor < item.materialMinor} onClick={() => command('job.start', { recipeId: item.id })}>{words('recipe.make')}<ArrowRight /></Button></div></CardContent></Card>; })}</div></> : null}
      {snapshot?.initialized && panel === 'showroom' && previewJob ? <div ref={previewRef} className="sw-preview-anchor"><KeptObjectPreview job={previewJob} Scene={WorkshopScene} locale={locale} words={words} onClose={() => setPreviewJobId(null)} /></div> : null}
      {snapshot?.initialized && panel === 'showroom' ? <div className="sw-recipes">{jobs.filter(item => item.kind === 'object' && item.status === 'kept').length ? jobs.filter(item => item.kind === 'object' && item.status === 'kept').map(item => { const Icon = recipeIcons[item.recipeId] || Armchair; return <Card key={item.id} className="sw-showpiece"><CardHeader><span className="sw-recipe-icon"><Icon /></span><CardTitle>{t(item.spec?.nameKey || `sw.recipe.${item.recipeId}`, locale)}</CardTitle><CardDescription>{words(`finish.${item.completedFinish}`)}</CardDescription></CardHeader><CardContent><p>{words('showroom.focus', { value: duration(item.appliedSeconds) })}</p><p>{words('showroom.value', { amount: coins(item.marketPriceMinor) })}</p><ObjectStyles job={item} snapshot={snapshot} words={words} locale={locale} command={command} blocked={blocked} /><FocusEvidence kind="product" id={item.id} revision={snapshot.revision} words={words} locale={locale} duration={duration} /><div className="sw-showpiece-actions"><Button variant="outline" aria-pressed={previewJobId === item.id} onClick={() => setPreviewJobId(item.id)}>{words('showroom.preview')}</Button>{item.recipeId === 'stool' && hasCommission ? button(words('object.deliver', { amount: coins(item.commissionPriceMinor) }), () => command('commission.deliver', { jobId: item.id, commissionId: 'first-stool' }), 'default', <PackageCheck />) : null}{button(words('object.sell', { amount: coins(item.marketPriceMinor) }), () => command('job.sell', { jobId: item.id }), 'outline', <Coins />)}</div></CardContent></Card>; }) : <Card className="sw-empty-card"><CardContent><Armchair /><h2>{words('showroom.emptyTitle')}</h2><p>{words('showroom.emptyDescription')}</p>{button(words('nav.workshop'), () => setPanel('workshop'), 'outline', <ArrowRight />)}</CardContent></Card>}</div> : null}
      {snapshot?.initialized && panel === 'showroom' && hasUnlock(snapshot, 'neighborhood-greenhouse') ? <Card className="sw-commemorative"><CardContent><CommunityThanks words={words} /></CardContent></Card> : null}
      {snapshot?.initialized && panel === 'showroom' && (snapshot.keptNextCursor || keptPage) ? <div className="sw-pagination">{keptPage ? button(words('showroom.newest'), () => loadKept(null), 'outline') : null}{snapshot.keptNextCursor ? button(words('showroom.older'), () => loadKept(snapshot.keptNextCursor), 'outline', <ArrowRight />) : null}</div> : null}
      {snapshot?.initialized && panel === 'tasks' ? <TasksPanel snapshot={snapshot} command={command} onFocus={focusTask} words={words} locale={locale} duration={duration} blocked={blocked} loadCompleted={loadCompleted} completedPage={completedTaskPage} focusState={recovery || review ? 'review' : isRunning ? 'running' : 'paused'} focusSeconds={presentationSeconds} onReturn={returnToSession} onChooseProduct={id => { focusSetupRequested.current = true; returnToJob(id); }} onWorkbench={() => setPanel('workbench')} /> : null}
      {snapshot?.initialized && panel === 'crew' ? <CrewPanel snapshot={snapshot} words={words} locale={locale} duration={duration} coins={coins} number={number} command={command} blocked={blocked} returnToJob={returnToJob} /> : null}
      {snapshot?.initialized && panel === 'growth' ? <GrowthPanel snapshot={snapshot} words={words} locale={locale} duration={duration} coins={coins} number={number} command={command} blocked={blocked} returnToJob={returnToJob} /> : null}
      {snapshot?.initialized && panel === 'community' ? <CommunityPanel snapshot={snapshot} words={words} locale={locale} duration={duration} coins={coins} command={command} blocked={blocked} returnToJob={returnToJob} pendingFor={stagePending} /> : null}
      {snapshot?.initialized && panel === 'history' ? <Card><CardContent>{(snapshot.history || []).length ? <ol className="sw-history">{snapshot.history.map(item => <li key={item.id}><span className="sw-history-icon"><Timer /></span><div><strong>{duration(item.acceptedSeconds || 0)}</strong><p>{item.taskTitle || item.intention || words('focus.defaultIntention')}</p>{item.taskTitle && item.intention ? <p className="sw-fine">{item.intention}</p> : null}<small>{item.startedAt ? formatDate(item.startedAt, locale) : ''} · {words(item.mode === 'break' ? 'focus.breakLabel' : `outcome.${item.outcome || item.status}`)}</small></div>{item.tag ? <span className="sw-tag">{item.tag}</span> : null}</li>)}</ol> : <div className="sw-empty"><Timer /><h2>{words('history.emptyTitle')}</h2><p>{words('history.emptyDescription')}</p></div>}<p className="sw-fine">{words('history.limit')}</p></CardContent></Card> : null}
    </PageFrame>}
    <footer className="sw-footer"><span>{words('footer.promise')}</span></footer>
  </div>;
}
