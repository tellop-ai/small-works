'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Circle, Play, Plus, Pencil, ListTodo, ArrowRight, Hammer, Timer, Pause, Undo2, X, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { t } from '@/lib/i18n/index.js';
import { formatDate } from '@/lib/format.js';
import { workerLabel, jobTitle, sessionLanes } from '@/components/small-works/crew-ui.jsx';

export function AddTask({ command, words, blocked, onAdded, compact = false }) {
  const [title, setTitle] = useState('');
  const inputRef = useRef(null), restoreFocus = useRef(false);
  useEffect(() => { if (compact) inputRef.current?.focus(); }, [compact]);
  useEffect(() => { if (restoreFocus.current && !blocked) { restoreFocus.current = false; inputRef.current?.focus(); } }, [blocked, title]);
  async function add(event) {
    event.preventDefault();
    if (!title.trim() || blocked) return;
    const result = await command('task.add', { title: title.trim() });
    if (result?.ok) { restoreFocus.current = true; setTitle(''); onAdded?.(result.receipt.result.taskId); }
  }
  return <form className="sw-task-add" onSubmit={add}>
    <Label htmlFor={compact ? 'quick-task' : 'new-task'}>{words('tasks.new')}</Label>
    <div className="sw-task-input-row"><Input ref={inputRef} autoComplete="off" id={compact ? 'quick-task' : 'new-task'} value={title} maxLength={160} onChange={event => setTitle(event.target.value)} placeholder={words('tasks.placeholder')} disabled={blocked} /><Button type="submit" disabled={blocked || !title.trim()}><Plus />{words('tasks.addShort')}</Button></div>
  </form>;
}

export function TaskPicker({ tasks, value, onChange, command, words, blocked }) {
  const [adding, setAdding] = useState(false);
  const selectRef = useRef(null), restoreFocus = useRef(false);
  useEffect(() => { if (!adding && !blocked && restoreFocus.current) { restoreFocus.current = false; selectRef.current?.focus(); } }, [adding, blocked]);
  function close() { restoreFocus.current = true; setAdding(false); }
  return <div className="sw-task-picker">
    {!adding ? <div className="sw-task-picker-label"><Label htmlFor="focus-task">{words('tasks.taskLabel')}</Label>
      <Button variant="ghost" size="sm" onClick={() => setAdding(true)} disabled={blocked}><Plus />{words('tasks.newShort')}</Button>
    </div> : null}
    {adding ? <><AddTask command={command} words={words} blocked={blocked} compact onAdded={id => { onChange(id); close(); }} /><Button variant="ghost" disabled={blocked} onClick={close}>{words('tasks.cancel')}</Button></> : <NativeSelect ref={selectRef} id="focus-task" value={value || ''} onChange={event => onChange(event.target.value || null)} disabled={blocked}>
      <NativeSelectOption value="">{words('tasks.noTask')}</NativeSelectOption>
      {[...tasks].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(task => <NativeSelectOption value={task.id} key={task.id}>{task.title}</NativeSelectOption>)}
    </NativeSelect>}
  </div>;
}

export function TaskSource({ session, words }) {
  if (!session || session.mode === 'break') return null;
  return <div className="sw-task-source"><span>{words('tasks.workingOn')}</span><strong>{session.taskTitle || words('tasks.unassigned')}</strong></div>;
}

export function TaskSessionBanner({ session, focusState, seconds, onReturn, words, duration }) {
  if (!session) return null;
  const state = focusState || (session.status === 'running' ? 'running' : 'paused');
  const Icon = state === 'running' ? Timer : state === 'review' ? ListTodo : Pause;
  return <section className="sw-task-session" aria-label={words('tasks.currentSession')}>
    <span className="sw-task-session-icon"><Icon /></span>
    <div><span className="sw-task-session-state">{words(`tasks.session.${state}`)} · {duration(seconds ?? session.candidateSeconds ?? 0)}</span>
      <strong>{session.mode === 'break' ? words('focus.breakLabel') : session.taskTitle || words('tasks.unassigned')}</strong>
      <small>{words('tasks.finishFirst')}</small>
    </div>
    <Button onClick={onReturn}>{words(state === 'review' ? 'tasks.reviewSession' : 'tasks.returnSession')}<ArrowRight /></Button>
  </section>;
}

export function WorkshopQueue({ snapshot, words, locale, duration, focusState, onChooseProduct, onWorkbench }) {
  const session = snapshot.session;
  const jobs = snapshot.jobs.filter(job => ['making', 'ready'].includes(job.status));
  const lanes = session && session.mode !== 'break' ? sessionLanes(session) : [];
  const running = (focusState || session?.status) === 'running';
  return <Card className="sw-workshop-queue"><CardHeader><CardTitle><Hammer />{words('tasks.workshop')}</CardTitle></CardHeader><CardContent>
    <p className="sw-task-queue-hint">{words('tasks.sharedShort')}</p>
    {session && session.mode !== 'break' ? <TaskSource session={session} words={words} /> : null}
    {jobs.length ? <ul className="sw-task-queue">{jobs.map(job => {
      const assigned = lanes.filter(lane => lane.jobId === job.id);
      const ready = job.status === 'ready';
      const done = Math.min(job.requiredSeconds || 0, job.progressSeconds ?? job.appliedSeconds ?? 0);
      const remaining = Math.max(0, (job.requiredSeconds || 0) - done);
      const status = ready ? 'ready' : assigned.length ? focusState === 'review' ? 'needsReview' : running ? 'receiving' : 'paused' : 'waiting';
      return <li key={job.id}>
        <div className="sw-queue-heading"><strong>{jobTitle(job, locale)}</strong>{ready ? <Check aria-label={words('tasks.ready')} /> : null}</div>
        <span className="sw-queue-status">{words(`tasks.${status}`)}</span>
        <progress className="sw-product-progress" value={done} max={job.requiredSeconds || 1} aria-label={words('tasks.productProgress', { title: jobTitle(job, locale) })} />
        <small>{words(ready ? 'tasks.productFinished' : 'tasks.remaining', { value: duration(ready ? done : remaining) })}</small>
        {assigned.length ? <ul className="sw-queue-workers">{assigned.map(lane => <li key={lane.workerId}><span>{workerLabel(lane.workerId, words)}<small>{words(lane.workerId === 'maker' ? 'tasks.mainLabel' : 'tasks.backgroundLabel')}</small></span><strong>{lane.share}%</strong></li>)}</ul> : null}
        {!session ? <Button variant="ghost" className="sw-queue-next" onClick={() => onChooseProduct?.(job.id)}>{words(ready ? 'tasks.openProduct' : 'tasks.chooseProduct')}<ArrowRight /></Button> : null}
        {job.appliedSeconds > 0 ? <FocusEvidence kind="product" id={job.id} revision={snapshot.revision} words={words} locale={locale} duration={duration} /> : null}
      </li>;
    })}</ul> : <div className="sw-task-queue-empty"><p>{words('tasks.noProductsShort')}</p><Button variant="outline" onClick={onWorkbench}>{words('tasks.chooseFirstProduct')}<ArrowRight /></Button></div>}
  </CardContent></Card>;
}

export function FocusEvidence({ kind, id, revision, words, locale, duration }) {
  const [open, setOpen] = useState(false);
  return <details className="sw-disclosure sw-task-evidence" onToggle={event => setOpen(event.currentTarget.open)}><summary>{words(kind === 'task' ? 'tasks.history' : 'tasks.sources')}</summary>
    {open ? <EvidenceRows key={`${kind}:${id}:${revision}`} kind={kind} id={id} words={words} locale={locale} duration={duration} /> : null}
  </details>;
}

function EvidenceRows({ kind, id, words, locale, duration }) {
  const [data, setData] = useState(null), [busy, setBusy] = useState(true), [error, setError] = useState(false);
  const [cursor, setCursor] = useState(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(false);
    const params = new URLSearchParams({ kind, id, ...(cursor ? { before: cursor } : {}) });
    fetch(`/api/workshop/evidence?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const result = await response.json(); if (!response.ok || !result.ok) throw Error('read'); return result.evidence; })
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [kind, id, cursor, retry]);
  const title = job => job?.displayName || (job ? t(job.nameKey, locale) : words('allocation.savedTarget'));
  return <div className="sw-evidence-content" aria-busy={busy}>
    {busy ? <p role="status">{words('tasks.loading')}</p> : error ? <><p role="alert">{words('tasks.readError')}</p><Button variant="outline" onClick={() => setRetry(value => value + 1)}>{words('tasks.retry')}</Button></> : data ? <>
      {kind === 'task' ? data.sessions.length ? <ol className="sw-evidence-list">{data.sessions.map(session => <li key={session.id}><strong>{duration(session.acceptedSeconds)}</strong><span>{formatDate(session.startedAt, locale)}</span><small>{session.taskTitle}</small>
        <ul>{session.allocations.filter(lane => lane.appliedSeconds > 0).map((lane, index) => <li key={index}>{workerLabel(lane.workerId, words)} · {title(data.jobs.find(job => job.id === lane.jobId))} · {duration(lane.appliedSeconds)}</li>)}</ul>
        {session.allocations.some(lane => lane.bankedSeconds > 0) ? <p>{words('tasks.savedFocus', { value: duration(session.allocations.reduce((sum, lane) => sum + lane.bankedSeconds, 0)) })}</p> : null}
      </li>)}</ol> : <p>{words('tasks.noSessions')}</p> : data.sources.length ? <ol className="sw-evidence-list">{data.sources.map(source => <li key={source.id}>
        <strong>{source.sourceKind === 'bank' ? words('tasks.pooled') : source.session?.taskTitle || source.session?.intention || words('tasks.unassigned')}</strong><span>{duration(source.seconds)} · {workerLabel(source.workerId || 'maker', words)}</span><small>{formatDate(source.createdAt, locale)}</small>
        {source.sourceKind === 'bank' ? <p>{words('tasks.poolExplanation')}</p> : null}
      </li>)}</ol> : <p>{words('tasks.noSources')}</p>}
      {cursor || data.nextCursor ? <div className="sw-task-actions">{cursor ? <Button variant="ghost" onClick={() => setCursor(null)}>{words('tasks.firstPage')}</Button> : null}{data.nextCursor ? <Button variant="outline" onClick={() => setCursor(data.nextCursor)}>{words('tasks.more')}</Button> : null}</div> : null}
    </> : null}
  </div>;
}

function TaskRow({ task, active, onStatusChange, command, onFocus, words, duration, locale, blocked, revision, focusDisabled, focusState }) {
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(task.title);
  const editRef = useRef(null), editButtonRef = useRef(null), returnFocus = useRef(false);
  useEffect(() => {
    if (editing) editRef.current?.focus();
    else if (returnFocus.current && !blocked) { returnFocus.current = false; editButtonRef.current?.focus(); }
  }, [editing, blocked]);
  function cancel() { returnFocus.current = true; setEditing(false); setTitle(task.title); }
  async function save(event) {
    event.preventDefault();
    if (blocked || !title.trim()) return;
    const result = await command('task.rename', { taskId: task.id, title: title.trim() });
    if (result?.ok) { returnFocus.current = true; setEditing(false); }
  }
  const done = task.status === 'done';
  return <li className={`sw-task-row${active ? ' sw-task-row-active' : ''}`}>
    <Button variant="ghost" size="icon" className="sw-task-toggle" role="checkbox" aria-checked={done} aria-label={words(done ? 'tasks.reopenNamed' : 'tasks.completeNamed', { title: task.title })} title={active ? words('tasks.finishFirst') : words(done ? 'tasks.reopen' : 'tasks.markDone')} disabled={blocked || active || editing} onClick={() => onStatusChange(task)}>{done ? <Check /> : <Circle />}</Button>
    <div className="sw-task-body">{editing ? <form onSubmit={save} onKeyDown={event => { if (event.key === 'Escape' && !blocked) { event.preventDefault(); cancel(); } }}>
      <Label htmlFor={`task-${task.id}`}>{words('tasks.title')}</Label><Input ref={editRef} id={`task-${task.id}`} value={title} maxLength={160} disabled={blocked} onChange={event => setTitle(event.target.value)} />
      <div className="sw-task-actions"><Button type="submit" disabled={blocked || !title.trim()}>{words('tasks.save')}</Button><Button variant="ghost" disabled={blocked} onClick={cancel}>{words('tasks.cancel')}</Button></div>
    </form> : <>
      <div className="sw-task-row-main"><div className="sw-task-heading"><strong className={done ? 'sw-task-done' : ''}>{task.title}</strong>
        <small>{task.focusSeconds > 0 ? words('tasks.focusedTotal', { value: duration(task.focusSeconds) }) : active ? words('tasks.noSavedFocus') : words('tasks.notStarted')}{active ? <span className="sw-task-active-label">{words(`tasks.session.${focusState || 'paused'}`)}</span> : null}</small>
      </div><div className="sw-task-row-actions">
        {!done && !active ? <Button variant="outline" disabled={blocked || focusDisabled} title={focusDisabled ? words('tasks.finishFirst') : undefined} onClick={() => onFocus(task.id)}><Play />{words('tasks.focusShort')}</Button> : null}
        <Button ref={editButtonRef} variant="ghost" size="icon" aria-label={words('tasks.editNamed', { title: task.title })} title={words('tasks.edit')} disabled={blocked || active} onClick={() => { setTitle(task.title); setEditing(true); }}><Pencil /></Button>
      </div></div>
    </>}
    {task.sessionCount > 0 ? <FocusEvidence kind="task" id={task.id} revision={revision} words={words} locale={locale} duration={duration} /> : null}
    </div>
  </li>;
}

export function TasksPanel({ snapshot, command, onFocus, words, locale, duration, blocked, loadCompleted, completedPage, focusState, focusSeconds, onReturn, onChooseProduct, onWorkbench }) {
  const [filter, setFilter] = useState(''), [page, setPage] = useState(0), [change, setChange] = useState(null);
  const tasks = (snapshot.tasks || []).filter(task => task.title.toLocaleLowerCase(locale).includes(filter.trim().toLocaleLowerCase(locale))).sort((a, b) => Number(b.id === snapshot.session?.taskId) - Number(a.id === snapshot.session?.taskId) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  const safePage = Math.min(page, Math.max(0, Math.ceil(tasks.length / 10) - 1));
  async function changeStatus(task) {
    const result = await command(task.status === 'done' ? 'task.reopen' : 'task.complete', { taskId: task.id });
    if (result?.ok) setChange({ id: task.id, title: task.title, completed: task.status !== 'done' });
  }
  async function undo() {
    const result = await command(change.completed ? 'task.reopen' : 'task.complete', { taskId: change.id });
    if (result?.ok) setChange(null);
  }
  const row = task => <TaskRow key={`${task.id}:${task.status}`} task={task} active={snapshot.session?.taskId === task.id} command={command} onStatusChange={changeStatus} onFocus={onFocus} words={words} locale={locale} duration={duration} blocked={blocked} revision={snapshot.revision} focusDisabled={Boolean(snapshot.session)} focusState={focusState} />;
  const hasCompleted = Boolean(snapshot.completedTasks?.length || completedPage);
  return <>
    <TaskSessionBanner session={snapshot.session} focusState={focusState} seconds={focusSeconds} onReturn={onReturn} words={words} duration={duration} />
    <div className="sw-tasks-layout"><Card className="sw-tasks-card"><CardHeader><CardTitle>{words('tasks.yourTasks')}</CardTitle><span className="sw-task-count">{words('tasks.openCount', { count: snapshot.tasks?.length || 0 })}</span></CardHeader><CardContent>
      <AddTask command={command} words={words} blocked={blocked} />
      {change ? <div className="sw-task-change" role="status"><span>{words(change.completed ? 'tasks.completedNamed' : 'tasks.reopenedNamed', { title: change.title })}</span><Button variant="ghost" disabled={blocked || snapshot.session?.taskId === change.id} onClick={undo}><Undo2 />{words('tasks.undo')}</Button><Button variant="ghost" size="icon" aria-label={words('tasks.dismiss')} onClick={() => setChange(null)}><X /></Button></div> : null}
      {(snapshot.tasks?.length || 0) > 5 || filter ? <div className="sw-task-search"><Label className="sr-only" htmlFor="task-search">{words('tasks.search')}</Label><Search /><Input id="task-search" placeholder={words('tasks.search')} value={filter} onChange={event => { setFilter(event.target.value); setPage(0); }} /></div> : null}
      {tasks.length ? <ul className="sw-task-list">{tasks.slice(safePage * 10, safePage * 10 + 10).map(row)}</ul> : <div className="sw-task-empty"><ListTodo /><strong>{words(filter ? 'tasks.noMatches' : hasCompleted ? 'tasks.allDone' : 'tasks.emptyTitle')}</strong><p>{words(filter ? 'tasks.trySearch' : 'tasks.emptyHint')}</p>{filter ? <Button variant="ghost" onClick={() => { setFilter(''); setPage(0); }}>{words('tasks.clearSearch')}</Button> : null}</div>}
      {tasks.length > 10 ? <div className="sw-task-actions sw-task-pages"><Button variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>{words('tasks.previous')}</Button><span>{words('tasks.page', { page: safePage + 1, pages: Math.ceil(tasks.length / 10) })}</span><Button variant="outline" disabled={(safePage + 1) * 10 >= tasks.length} onClick={() => setPage(safePage + 1)}>{words('tasks.next')}</Button></div> : null}
      {hasCompleted ? <details className="sw-disclosure sw-completed-tasks"><summary>{words('tasks.completed')}</summary><ul className="sw-task-list">{(snapshot.completedTasks || []).map(row)}</ul>{!snapshot.completedTasks?.length ? <p className="sw-fine">{words('tasks.noCompleted')}</p> : null}{completedPage || snapshot.taskNextCursor ? <div className="sw-task-actions">{completedPage ? <Button variant="ghost" disabled={blocked} onClick={() => loadCompleted(null)}>{words('tasks.firstPage')}</Button> : null}{snapshot.taskNextCursor ? <Button variant="outline" disabled={blocked} onClick={() => loadCompleted(snapshot.taskNextCursor)}>{words('tasks.more')}</Button> : null}</div> : null}</details> : null}
    </CardContent></Card><WorkshopQueue snapshot={snapshot} words={words} locale={locale} duration={duration} focusState={focusState} onChooseProduct={onChooseProduct} onWorkbench={onWorkbench} /></div>
  </>;
}
