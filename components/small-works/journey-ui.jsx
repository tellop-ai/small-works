'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t } from '@/lib/i18n/index.js';
import { Requirements, expansionRequirementItems, jobTitle } from '@/components/small-works/crew-ui.jsx';

export function ReviewDuration({ candidateSeconds, value, onChange, words, duration, disabled }) {
  const seconds = Math.min(candidateSeconds, Math.max(0, Number(value) || 0));
  const update = (minutes, remainder) => onChange(String(Math.min(candidateSeconds, Math.max(0, Math.floor(minutes * 60 + remainder)))));
  return <div className="sw-review-duration">
    <span className="sw-fine">{words('focus.acceptedTime')}</span>
    <div className="sw-review-total">{duration(seconds)}</div>
    <details className="sw-disclosure"><summary>{words('focus.adjustTime')}</summary>
      <div className="sw-duration-fields">
        <div><Label htmlFor="review-minutes">{words('focus.minutesLabel')}</Label><Input id="review-minutes" type="number" min="0" max={Math.floor(candidateSeconds / 60)} step="1" disabled={disabled} value={Math.floor(seconds / 60)} onChange={event => update(Number(event.target.value) || 0, seconds % 60)} /></div>
        <div><Label htmlFor="review-seconds">{words('focus.secondsLabel')}</Label><Input id="review-seconds" type="number" min="0" max="59" step="1" disabled={disabled} value={seconds % 60} onChange={event => update(Math.floor(seconds / 60), Math.max(0, Math.min(59, Number(event.target.value) || 0)))} /></div>
      </div><p className="sw-fine">{words('focus.trimExplanation')}</p>
    </details>
  </div>;
}

export function WorkshopMilestone({ progress, snapshot, words, locale, duration, coins, number, onPanel, returnToJob }) {
  if (!progress) return null;
  const { expansion, current, otherImprovement } = progress;
  const items = expansionRequirementItems(progress, { words, duration, coins, number });
  const staff = progress.requirements.find(item => item.key === 'activeWorker' && !item.complete);
  return <details className="sw-disclosure sw-milestone">
    <summary><span className="sw-milestone-title">{words('journey.nextMilestone', { name: t(expansion.nameKey, locale) })}</span>
      {current ? <span className="sw-milestone-counts">{words('journey.building', { value: duration(current.progressSeconds ?? current.appliedSeconds), total: duration(current.requiredSeconds) })}</span> : <span className="sw-milestone-counts">{progress.requirements.map((item, index) => {
        const copy = ['coins', 'focus', 'starterRecipes', 'advancedRecipes', 'metalRecipes', 'mixedRecipes'].includes(item.key) ? words(`journey.progress.${item.key}`, { current: item.key === 'coins' ? coins(item.current) : number(item.key === 'focus' ? Math.floor(item.current / 60) : item.current), required: item.key === 'coins' ? coins(item.required) : number(item.key === 'focus' ? Math.ceil(item.required / 60) : item.required) }) : items[index].label;
        return <span key={item.key} className={item.complete ? 'sw-milestone-done' : undefined}><span aria-label={words(item.complete ? 'journey.met' : 'journey.unmet')}>{item.complete ? '✓' : '○'}</span> {copy}</span>;
      })}</span>}
    </summary>
    {current ? <><p className="sw-fine">{words('journey.building', { value: duration(current.progressSeconds ?? current.appliedSeconds), total: duration(current.requiredSeconds) })}</p><Button variant="outline" onClick={() => returnToJob(current.id)}>{words('workbench.return')}</Button></> : <>
      <Requirements words={words} items={items} />
      {otherImprovement ? <p className="sw-fine">{words('journey.finishFirst', { name: jobTitle(otherImprovement, locale) })}</p> : null}
      <Button variant="ghost" onClick={() => onPanel(staff ? 'crew' : 'growth')}>{words(staff ? 'nav.crew' : 'journey.viewMilestone')}</Button>
    </>}
  </details>;
}

export function ShowpieceGoal({ words, onPanel, hasKept }) {
  return <div className="sw-showpiece-goal"><strong>{words('journey.showpieceTitle')}</strong><p className="sw-fine">{words('journey.showpieceCopy')}</p><Button variant="ghost" onClick={() => onPanel(hasKept ? 'showroom' : 'workbench')}>{words(hasKept ? 'journey.styleShowpiece' : 'journey.chooseShowpiece')}</Button></div>;
}
