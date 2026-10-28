'use client';

import { Check, Leaf, Hammer, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { t } from '@/lib/i18n/index.js';
import { eligibleTargets, styleChoices, workerCanDoStage } from '@/lib/game/rules.js';
import { keptObjectPreview } from '@/components/small-works/presentation.js';
import { hasUnlock, expansionProgress, preferredTargets, nextAssignment, plannedShares } from '@/components/small-works/journey.js';
export { hasUnlock } from '@/components/small-works/journey.js';

export function sessionLanes(session) {
  return session?.lanes || (session?.jobId ? [{ workerId: 'maker', jobId: session.jobId, share: 100 }] : []);
}
export const activeWorkers = snapshot => ['maker', ...['apprentice', 'blacksmith', 'carver', 'finisher'].filter(id => snapshot?.crew?.some(item => item.staffId === id && item.status === 'active'))];
export const eligible = (workerId, job, stageId) => Boolean(job && job.status === 'making' && eligibleTargets(job, workerId).some(target => target.stageId === stageId));
export const workerLabel = (workerId, words) => words(`crew.${workerId}Name`);
export const jobTitle = (job, locale) => job ? t(job.spec?.nameKey || `sw.recipe.${job.recipeId}`, locale) : '';
export function stageTitle(job, stageId, locale) {
  const stage = (job?.stages || job?.spec?.stages || []).find(item => item.id === stageId);
  return stage ? t(stage.nameKey, locale) : '';
}
export const targetTitle = (job, stageId, locale) => [jobTitle(job, locale), stageTitle(job, stageId, locale)].filter(Boolean).join(' · ');
const targetKey = lane => `${lane.jobId || ''}:${lane.stageId || ''}`;
export function workTargets(jobs, workerId) {
  return jobs.filter(job => job.status === 'making').flatMap(job => eligibleTargets(job, workerId).map(target => ({ jobId: job.id, ...(target.stageId ? { stageId: target.stageId } : {}) })));
}
export function validAssignments(lanes, jobs, workers, capacity) {
  const maxLanes = typeof capacity === 'number' ? capacity : capacity ? 2 : 1;
  return lanes.length > 0 && lanes.length <= maxLanes && new Set(lanes.map(item => item.workerId)).size === lanes.length && new Set(lanes.map(targetKey)).size === lanes.length && lanes.every(item => workers.includes(item.workerId) && eligible(item.workerId, jobs.find(job => job.id === item.jobId), item.stageId) && Number.isInteger(item.share) && item.share >= 10 && item.share <= 100 && item.share % 10 === 0) && lanes.reduce((sum, item) => sum + item.share, 0) === 100;
}
export function Requirements({ items, words }) {
  return <div className="sw-requirements">{items.map(item => <div className="sw-requirement" key={item.label}><span className={item.complete ? 'sw-requirement-done' : ''}>{item.complete ? <Check /> : <Leaf />}</span><div><strong>{item.label}</strong>{item.value !== undefined ? <small>{words('growth.soFar', { value: item.value })}</small> : null}</div></div>)}</div>;
}
export function StageList({ job, words, locale, duration, pending = {} }) {
  const stages = job?.stages || job?.spec?.stages || [];
  return <div className="sw-stage-list">{stages.map((stage, index) => {
    const applied = stage.appliedSeconds || 0;
    const complete = applied >= stage.seconds;
    return <div className="sw-stage" key={stage.id}><span className={complete ? 'sw-stage-complete' : ''}>{complete ? <Check /> : index + 1}</span><div><strong>{stage.finish > 0 ? words(stage.role === 'metal-finishing' ? 'detail.metal' : stage.role === 'joinery' && !job.spec?.mixed ? 'detail.joinery' : 'detail.wood') : t(stage.nameKey, locale)}</strong>{stage.finish > 0 ? <small>{words('detail.optional')}</small> : null}<small>{words(`skill.${stage.role}`)} · {duration(applied)} / {duration(stage.seconds)}</small><details className="sw-stage-details"><summary>{words('stages.details')}</summary><small>{words('stages.workers', { value: ['maker', 'apprentice', 'blacksmith', 'carver', 'finisher'].filter(id => workerCanDoStage(id, stage)).map(id => workerLabel(id, words)).join(', ') })}</small>{stage.requires?.length ? <small>{words('stages.requires', { value: stage.requires.map(id => t(stages.find(item => item.id === id)?.nameKey || `sw.stage.${id}`, locale)).join(', ') })}</small> : null}{!complete && stage.available === false ? <small>{words('stages.waiting')}</small> : null}</details>{pending[stage.id] > 0 ? <small>{words('progress.pending', { value: duration(pending[stage.id]) })}</small> : null}</div></div>;
  })}</div>;
}
export function WorkAssignments({ lanes, onChange, jobs, apprentice, blacksmith = false, carver = false, finisher = false, maxLanes = apprentice ? 2 : 1, words, locale, disabled, fixed = false, compact = false, plannedSeconds = 1500 }) {
  const workers = ['maker', ...(apprentice ? ['apprentice'] : []), ...(blacksmith ? ['blacksmith'] : []), ...(carver ? ['carver'] : []), ...(finisher ? ['finisher'] : [])];
  const valid = fixed || validAssignments(lanes, jobs, workers, maxLanes);
  const preferredJobId = lanes[0]?.jobId;
  const choices = (workerId, index) => preferredTargets(jobs, workerId, preferredJobId).filter(target => !lanes.some((other, at) => at !== index && targetKey(other) === targetKey(target)));
  const next = nextAssignment(lanes, jobs, workers, preferredJobId);
  function editWorker(index, workerId) {
    const target = choices(workerId, index).find(item => item.jobId === lanes[index].jobId) || choices(workerId, index)[0];
    onChange(lanes.map((item, at) => at === index ? { workerId, jobId: target?.jobId || '', ...(target?.stageId ? { stageId: target.stageId } : {}), share: item.share } : item));
  }
  function editTarget(index, value) {
    const target = choices(lanes[index].workerId, index).find(item => targetKey(item) === value);
    if (target) onChange(lanes.map((item, at) => at === index ? { workerId: item.workerId, ...target, share: item.share } : item));
  }
  function resize(size) {
    if (size === 1) onChange([{ ...lanes[0], share: 100 }]);
    else if (size === 2) onChange(lanes.length === 3 ? lanes.slice(0, 2).map(item => ({ ...item, share: 50 })) : [{ ...lanes[0], share: 50 }, { ...next, share: 50 }]);
    else onChange([...lanes, next].map((item, index) => ({ ...item, share: index === 0 ? 40 : 30 })));
  }
  const prefix = fixed ? 'paused' : 'setup';
  const duration = seconds => words('duration', { minutes: Math.floor(seconds / 60), seconds: seconds % 60 });
  const shares = valid ? plannedShares(lanes, plannedSeconds) : [];
  const onlyMaker = !fixed && workers.length === 1 && lanes.length === 1;
  if (onlyMaker && valid && choices('maker', 0).length === 1) return null;
  const controls = <fieldset className="sw-assignment-editor" disabled={disabled}>
    <legend>{words('allocation.title')}</legend>
    {fixed || (!compact && lanes.length > 1) ? <p className="sw-fine">{words(fixed ? 'allocation.fixed' : 'allocation.sharedFocus')}</p> : null}
    {lanes.map((lane, index) => <div className="sw-assignment" key={index}>
      {!onlyMaker ? <><Label htmlFor={`worker-${prefix}-${index}`}>{words('allocation.worker')}</Label>{fixed ? <strong>{workerLabel(lane.workerId, words)}</strong> : <NativeSelect id={`worker-${prefix}-${index}`} value={lane.workerId} onChange={event => editWorker(index, event.target.value)}>{workers.map(id => <NativeSelectOption key={id} value={id} disabled={lanes.some((item, at) => at !== index && item.workerId === id)}>{workerLabel(id, words)}</NativeSelectOption>)}</NativeSelect>}</> : null}
      <Label htmlFor={`target-${prefix}-${index}`}>{words('allocation.target')}</Label>
      {fixed ? <strong>{targetTitle(jobs.find(item => item.id === lane.jobId), lane.stageId, locale) || words('allocation.savedTarget')}</strong> : <NativeSelect id={`target-${prefix}-${index}`} value={targetKey(lane)} onChange={event => editTarget(index, event.target.value)}><NativeSelectOption value="" disabled>{words('allocation.chooseTarget')}</NativeSelectOption>{choices(lane.workerId, index).map(target => <NativeSelectOption key={targetKey(target)} value={targetKey(target)}>{targetTitle(jobs.find(item => item.id === target.jobId), target.stageId, locale)}</NativeSelectOption>)}</NativeSelect>}
      {lanes.length > 1 ? <span>{words('allocation.share', { value: lane.share })}</span> : null}
      {!fixed && choices(lane.workerId, index).length === 0 ? <p className="sw-fine">{words('allocation.noEligible')}</p> : null}
    </div>)}
    {lanes.length > 1 ? <details className="sw-disclosure" open={fixed || undefined}><summary>{words('allocation.editShares')}</summary>
      {lanes.length === 2 ? <><Label htmlFor={`${prefix}-share`}>{words('allocation.firstShare', { name: workerLabel(lanes[0].workerId, words) })}</Label><NativeSelect id={`${prefix}-share`} value={lanes[0].share} onChange={event => onChange(lanes.map((item, index) => ({ ...item, share: index === 0 ? Number(event.target.value) : 100 - Number(event.target.value) })))}>{Array.from({ length: 9 }, (_, index) => (index + 1) * 10).map(value => <NativeSelectOption key={value} value={value}>{words('allocation.split', { first: value, second: 100 - value })}</NativeSelectOption>)}</NativeSelect></> : <>{lanes.slice(0, 2).map((lane, index) => <div className="sw-share-control" key={lane.workerId}><Label htmlFor={`${prefix}-share-${index}`}>{words('allocation.firstShare', { name: workerLabel(lane.workerId, words) })}</Label><NativeSelect id={`${prefix}-share-${index}`} value={lane.share} onChange={event => { const value = Number(event.target.value); const other = lanes[index === 0 ? 1 : 0].share; onChange(lanes.map((item, at) => ({ ...item, share: at === index ? value : at === 2 ? 100 - value - other : item.share }))); }}>{Array.from({ length: 8 }, (_, at) => (at + 1) * 10).filter(value => value + lanes[index === 0 ? 1 : 0].share <= 90).map(value => <NativeSelectOption key={value} value={value}>{value}%</NativeSelectOption>)}</NativeSelect></div>)}<p className="sw-fine">{words('allocation.remainingShare', { name: workerLabel(lanes[2].workerId, words), value: lanes[2].share })}</p></>}
    </details> : null}
    {!fixed && maxLanes > 1 && (lanes.length > 1 || next) ? <Button type="button" variant="outline" disabled={disabled || (lanes.length === 1 && !next)} onClick={() => resize(lanes.length === 1 || lanes.length === 3 ? 2 : 1)}>{words(lanes.length === 2 ? 'allocation.oneWorker' : 'allocation.twoWorkers')}</Button> : null}
    {!fixed && maxLanes === 3 && lanes.length === 2 && next ? <Button type="button" variant="outline" disabled={disabled} onClick={() => resize(3)}>{words('allocation.threeWorkers')}</Button> : null}
    {!valid ? <p className="sw-fine" role="status">{words('allocation.invalid')}</p> : null}
  </fieldset>;
  if (!compact || fixed || onlyMaker) return controls;
  return <div className="sw-compact-assignments">
    <div className="sw-assignment-summary">{lanes.map((lane, index) => <div className="sw-assignment-summary-row" key={lane.workerId}>
      <div><strong>{workerLabel(lane.workerId, words)}</strong><span>{shares[index] ? duration(shares[index].seconds) : `${lane.share}%`}</span></div>
      <small>{targetTitle(jobs.find(job => job.id === lane.jobId), lane.stageId, locale) || words('allocation.chooseTarget')}</small>
    </div>)}</div>
    {lanes.length > 1 ? <p className="sw-fine">{words('allocation.sharedFocus')}</p> : null}
    <details className="sw-disclosure" open={!valid || undefined}><summary>{words('allocation.edit')}</summary>{controls}</details>
  </div>;
}
export function BankAssignment({ job, workers, workerId, stageId, onChange, bankSeconds, words, locale, duration, disabled, command }) {
  const targets = eligibleTargets(job, workerId);
  const target = targets.find(item => item.stageId === stageId);
  const stage = job.spec?.mixed ? job.stages?.find(item => item.id === stageId) : null;
  const seconds = target ? Math.min(bankSeconds, stage ? stage.seconds - stage.appliedSeconds : job.requiredSeconds - (job.progressSeconds ?? job.appliedSeconds)) : 0;
  return <><Label htmlFor="bank-worker">{words('allocation.bankWorker')}</Label><NativeSelect id="bank-worker" value={workerId} disabled={disabled} onChange={event => { const id = event.target.value; onChange(id, eligibleTargets(job, id)[0]?.stageId); }}>{workers.map(id => <NativeSelectOption key={id} value={id}>{workerLabel(id, words)}</NativeSelectOption>)}</NativeSelect>{job.spec?.mixed ? <><Label htmlFor="bank-stage">{words('allocation.component')}</Label><NativeSelect id="bank-stage" value={stageId || ''} disabled={disabled} onChange={event => onChange(workerId, event.target.value)}><NativeSelectOption value="" disabled>{words('allocation.chooseTarget')}</NativeSelectOption>{targets.map(item => <NativeSelectOption key={item.stageId} value={item.stageId}>{t(item.nameKey, locale)}</NativeSelectOption>)}</NativeSelect></> : null}{!targets.length ? <p className="sw-note">{words('allocation.wrongSkill')}</p> : null}<Button variant="outline" disabled={disabled || seconds <= 0 || !target} onClick={() => command('job.allocate', { jobId: job.id, workerId, ...(stageId ? { stageId } : {}), seconds })}><Leaf />{words('effort.apply', { value: duration(seconds) })}</Button><p className="sw-fine">{words('allocation.bankExplanation')}</p></>;
}
export function AllocationSummary({ allocations, bankedSeconds, acceptedSeconds, words, duration, titleOf, estimated = false }) {
  return <div className="sw-allocation-summary"><strong>{words(estimated ? 'allocation.preview' : 'allocation.kept')}</strong>{acceptedSeconds !== undefined ? <p>{words('allocation.total', { value: duration(acceptedSeconds) })}</p> : null}{allocations?.filter(item => item.jobId !== null).map((item, index) => <p key={`${item.workerId}-${item.jobId}-${index}`}>{words('allocation.line', { name: workerLabel(item.workerId, words), target: titleOf(item.jobId, item.stageId), value: duration(item.appliedSeconds) })}</p>)}{bankedSeconds > 0 || !allocations?.some(item => item.jobId) ? <p>{words('allocation.banked', { value: duration(bankedSeconds) })}</p> : null}</div>;
}
export function CrewPanel({ snapshot, words, duration, coins, command, blocked, returnToJob }) {
  return <><p className="sw-fine">{words('crew.focusSessions')} {words('crew.splitExample')}</p><div className="sw-crew-grid"><Card><CardHeader><span className="sw-recipe-icon"><Hammer /></span><CardTitle>{words('crew.makerName')}</CardTitle><CardDescription>{words('crew.makerBio')}</CardDescription></CardHeader><CardContent><p>{words('crew.makerSkills')}</p><p>{words(sessionLanes(snapshot.session).some(item => item.workerId === 'maker') ? 'crew.assigned' : 'crew.offDuty')}</p></CardContent></Card>{(snapshot.content?.staff || []).map(staff => {
    const id = staff.id;
    const crew = snapshot.crew?.find(item => item.staffId === id);
    const onboarding = snapshot.jobs.find(item => item.kind === 'onboarding' && item.recipeId === id && item.status === 'making');
    const otherImprovement = snapshot.jobs.some(item => ['onboarding', 'improvement'].includes(item.kind) && item.status === 'making' && item.id !== onboarding?.id);
    const requirements = [{ complete: hasUnlock(snapshot, staff.requiredUnlock), label: words(`growth.${staff.requiredUnlock === 'craft-yard' ? 'yardRequired' : staff.requiredUnlock === 'forge' ? 'forgeRequired' : 'roomRequired'}`) }, ...(staff.requiredFocusSeconds ? [{ complete: snapshot.workshop.lifetimeFocusSeconds >= staff.requiredFocusSeconds, label: words('growth.focus', { value: duration(staff.requiredFocusSeconds) }), value: duration(snapshot.workshop.lifetimeFocusSeconds) }] : []), { complete: snapshot.workshop.coinMinor >= staff.materialMinor || Boolean(onboarding), label: words('crew.welcomeCost', { value: coins(staff.materialMinor) }), value: coins(snapshot.workshop.coinMinor) }];
    const key = id;
    const held = sessionLanes(snapshot.session).some(item => item.jobId === onboarding?.id);
    return <Card key={id}><CardHeader><span className="sw-recipe-icon"><Users /></span><CardTitle>{words(`crew.${key}Name`)}</CardTitle><CardDescription>{words(`crew.${key}Bio`)}</CardDescription></CardHeader><CardContent><p>{words(`crew.${key}Benefit`)}</p><p>{words(`crew.${key}Skills`)}</p>{crew?.status === 'active' ? <><p>{words(sessionLanes(snapshot.session).some(item => item.workerId === id) ? 'crew.assigned' : 'crew.offDuty')}</p><p>{words('crew.experience', { value: duration(crew.allocatedSeconds) })}</p></> : <><Requirements words={words} items={requirements} /><p className="sw-note">{words('crew.training', { value: duration(staff.baseSeconds) })}</p>{onboarding ? <><p>{words('crew.trainingProgress', { value: duration(onboarding.progressSeconds ?? onboarding.appliedSeconds), total: duration(onboarding.requiredSeconds) })}</p><Button disabled={blocked || Boolean(snapshot.session && !held)} onClick={() => returnToJob(onboarding.id)}><ArrowRight />{words('crew.continueTraining')}</Button>{snapshot.session && !held ? <p className="sw-fine">{words('allocation.fixed')}</p> : null}<p className="sw-fine">{words('crew.cancelTrainingExplanation', { value: coins(staff.materialMinor) })}</p><Button variant="outline" disabled={blocked || held} onClick={() => command('job.salvage', { jobId: onboarding.id })}>{words('crew.cancelTraining', { value: coins(staff.materialMinor) })}</Button></> : <><Button disabled={blocked || otherImprovement || requirements.some(item => !item.complete)} onClick={() => command('crew.welcome', { staffId: id })}>{words('crew.welcomeWorker', { name: words(`crew.${key}Name`), value: coins(staff.materialMinor) })}</Button>{otherImprovement ? <p className="sw-fine">{words('growth.oneImprovement')}</p> : null}</>}</>}</CardContent></Card>;
  })}</div></>;
}
export function expansionRequirementItems(progress, { words, coins, duration, number }) {
  return progress.requirements.map(item => {
    if (item.key === 'activeWorker') return { ...item, label: words('growth.activeWorker', { name: workerLabel(item.id, words) }) };
    if (item.key === 'unlock') return { ...item, label: words(`growth.${item.id === 'forge' ? 'forgeRequired' : item.id === 'joinery-bench' ? 'joineryRequired' : item.id === 'craft-yard' ? 'yardRequired' : 'roomRequired'}`) };
    const format = item.key === 'coins' ? coins : item.key === 'focus' ? duration : number;
    return { ...item, label: words(`growth.${item.key}`, { value: format(item.required) }), value: format(item.current) };
  });
}
export function GrowthPanel({ snapshot, words, locale, duration, coins, number, command, blocked, returnToJob }) {
  return <div className="sw-growth-grid">{snapshot.content.expansions.map(expansion => {
    const progress = expansionProgress(snapshot, expansion);
    const { complete, current, otherImprovement } = progress;
    const requirements = expansionRequirementItems(progress, { words, coins, duration, number });
    const held = sessionLanes(snapshot.session).some(item => item.jobId === current?.id);
    return <Card className="sw-growth-card" key={expansion.id}><CardHeader><span className="sw-recipe-icon"><Leaf /></span><CardTitle>{t(expansion.nameKey, locale)}</CardTitle><CardDescription>{words(expansion.id === 'craft-yard' ? 'growth.yardCopy' : expansion.id === 'forge' ? 'growth.forgeCopy' : expansion.id === 'joinery-bench' ? 'growth.joineryCopy' : 'growth.copy')}</CardDescription></CardHeader><CardContent>{!complete ? <Requirements items={requirements} words={words} /> : null}<p className="sw-note">{words(complete ? 'growth.facilityComplete' : 'growth.construction', { value: duration(expansion.baseSeconds) })}</p>{current ? <><p>{words('crew.trainingProgress', { value: duration(current.progressSeconds ?? current.appliedSeconds), total: duration(current.requiredSeconds) })}</p><Button disabled={blocked || Boolean(snapshot.session && !held)} onClick={() => returnToJob(current.id)}>{words('workbench.return')}<ArrowRight /></Button>{snapshot.session && !held ? <p className="sw-fine">{words('allocation.fixed')}</p> : null}<p className="sw-fine">{words('growth.cancelExplanation')}</p><Button variant="outline" disabled={blocked || held} onClick={() => command('job.salvage', { jobId: current.id })}>{words('growth.cancel')}</Button></> : !complete ? <><Button disabled={blocked || otherImprovement || requirements.some(item => !item.complete)} onClick={() => command('room.expand', { expansionId: expansion.id })}><Hammer />{words('growth.fund')}</Button>{otherImprovement ? <p className="sw-fine">{words('growth.oneImprovement')}</p> : null}</> : null}</CardContent></Card>;
  })}</div>;
}

export function CommunityThanks({ words }) {
  return <div className="sw-community-thanks"><span className="sw-recipe-icon"><Leaf /></span><h3>{words('community.displayTitle')}</h3><p>{words('community.thanks')}</p><p className="sw-fine">{words('community.permanent')}</p></div>;
}

export function CommunityPanel({ snapshot, words, locale, duration, coins, command, blocked, returnToJob, pendingFor = () => ({}) }) {
  return <div className="sw-community-grid">{(snapshot.content.communityProjects || []).map(project => {
    const complete = hasUnlock(snapshot, project.id);
    const current = snapshot.jobs.find(item => item.kind === 'community' && item.recipeId === project.id && ['making', 'ready'].includes(item.status));
    const held = sessionLanes(snapshot.session).some(lane => lane.jobId === current?.id);
    return <Card className="sw-community-card" key={project.id}><CardHeader><span className="sw-recipe-icon"><Leaf /></span><CardTitle>{t(project.nameKey, locale)}</CardTitle><CardDescription>{words('community.gift')}</CardDescription></CardHeader><CardContent>{complete ? <CommunityThanks words={words} /> : <><p>{words('community.cost', { value: coins(project.materialMinor) })}</p><p>{words('community.focus', { value: duration(project.baseSeconds) })}</p><p className="sw-note">{words('community.noPayout')}</p><StageList job={current || { spec: project }} words={words} locale={locale} duration={duration} pending={current ? pendingFor(current) : {}} />{current ? <><p>{words('crew.trainingProgress', { value: duration(current.progressSeconds ?? current.appliedSeconds), total: duration(current.requiredSeconds) })}</p>{current.status === 'ready' ? <><p>{words('community.ready')}</p><Button disabled={blocked || held} onClick={() => command('community.deliver', { jobId: current.id })}><Check />{words('community.deliver')}</Button></> : <Button disabled={blocked || Boolean(snapshot.session && !held)} onClick={() => returnToJob(current.id)}>{words('workbench.return')}<ArrowRight /></Button>}<p className="sw-fine">{words('community.cancelExplanation', { value: coins(project.materialMinor) })}</p><Button variant="outline" disabled={blocked || held} onClick={() => command('job.salvage', { jobId: current.id })}>{words('community.cancel', { value: coins(project.materialMinor) })}</Button>{held ? <p className="sw-fine">{words('allocation.fixed')}</p> : null}</> : <><Requirements words={words} items={[{ complete: hasUnlock(snapshot, project.requiredUnlock), label: words('growth.yardRequired') }, { complete: snapshot.workshop.coinMinor >= project.materialMinor, label: words('growth.coins', { value: coins(project.materialMinor) }) }]} /><Button disabled={blocked || !hasUnlock(snapshot, project.requiredUnlock) || snapshot.workshop.coinMinor < project.materialMinor} onClick={() => command('community.fund', { projectId: project.id })}>{words('community.fund', { value: coins(project.materialMinor) })}</Button></>}</>}</CardContent></Card>;
  })}</div>;
}

export function ObjectStyles({ job, snapshot, words, locale, command, blocked }) {
  if (job?.kind !== 'object' || !['making', 'ready', 'kept'].includes(job.status)) return null;
  const choices = styleChoices(job, snapshot.crew || []);
  const held = sessionLanes(snapshot.session).some(lane => lane.jobId === job.id);
  return <details className="sw-disclosure sw-appearance"><summary>{words('styles.title')}</summary><fieldset className="sw-style-editor" disabled={blocked || held}><legend className="sw-sr-only">{words('styles.title')}</legend><p className="sw-fine">{words('styles.promise')}</p>{[['patterns', 'patternId', 'pattern', 'plain', 'carver'], ['finishStyles', 'finishStyleId', 'finishStyle', 'natural', 'finisher']].map(([list, field, key, fallback, worker]) => {
    const allowed = choices[list] || [];
    if (!allowed.length) return null;
    const options = list === 'patterns' ? allowed : snapshot.content[list] || allowed;
    return <div className="sw-style-choice" key={field}><Label htmlFor={`${field}-${job.id}`}>{words(`styles.${field}`)}</Label><NativeSelect id={`${field}-${job.id}`} value={job[field] || fallback} onChange={event => command('job.style', { jobId: job.id, [field]: event.target.value })}>{options.map(option => <NativeSelectOption key={option.id} value={option.id} disabled={!allowed.some(item => item.id === option.id)}>{t(option.nameKey, locale)}{!allowed.some(item => item.id === option.id) ? ` · ${words('styles.requires', { name: workerLabel(worker, words) })}` : ''}</NativeSelectOption>)}</NativeSelect>{list === 'patterns' && allowed.length === 1 ? <small>{words('styles.patternUnlock')}</small> : null}</div>;
  })}{held ? <p className="sw-fine">{words('styles.held')}</p> : null}</fieldset></details>;
}


export function KeptObjectPreview({ job, Scene, locale, words, onClose }) {
  const preview = keptObjectPreview(job);
  if (!preview) return null;
  const label = words('showroom.previewLabel', { name: jobTitle(job, locale) });
  return <Card className="sw-kept-preview"><CardHeader><CardTitle>{label}</CardTitle></CardHeader><CardContent><div className="sw-kept-preview-scene" aria-label={label}><Scene {...preview} locale={locale} label={label} /></div><p className="sw-fine">{t(`sw.pattern.${preview.patternId}`, locale)} · {t(`sw.finishStyle.${preview.finishStyleId}`, locale)}</p><Button variant="outline" onClick={onClose}>{words('showroom.closePreview')}</Button></CardContent></Card>;
}
