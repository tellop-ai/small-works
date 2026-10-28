import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import swc from 'next/dist/build/swc/index.js';
import { t } from '../lib/i18n/index.js';
import { content } from '../lib/game/content.js';
import { allocationPreview } from '../lib/game/allocation.js';
import * as awaitJourney from '../components/small-works/journey.js';
import { workshopPresentation, keptObjectPreview } from '../components/small-works/presentation.js';
import { initialProgress, jobView, applyEffort } from '../lib/game/rules.js';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'node_modules', '.cache', `sw-ui-${process.pid}`);
mkdirSync(scratch, { recursive: true });
after(() => rmSync(scratch, { recursive: true, force: true }));
await swc.loadBindings();
const compiled = new Map();
async function jsxModule(file) {
  if (compiled.has(file)) return compiled.get(file);
  const out = path.join(scratch, `${compiled.size}.mjs`);
  compiled.set(file, out);
  let source = readFileSync(file, 'utf8').replace("import dynamic from 'next/dynamic';", 'const dynamic = () => () => null;');
  const imports = [...source.matchAll(/(['"])(@\/[^'"]+)\1/g)];
  for (const match of imports) {
    let dependency = path.join(root, match[2].slice(2));
    if (!path.extname(dependency)) dependency = ['.js', '.jsx', '/index.js'].map(ext => dependency + ext).find(existsSync);
    const resolved = dependency.endsWith('.jsx') ? await jsxModule(dependency) : dependency;
    source = source.replaceAll(match[0], JSON.stringify(pathToFileURL(resolved).href));
  }
  const result = await swc.transform(source, { filename: file, jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } } }, module: { type: 'es6' } });
  writeFileSync(out, result.code);
  return out;
}
const ui = await import(pathToFileURL(await jsxModule(path.join(root, 'components/small-works/crew-ui.jsx'))));
const { SmallWorks } = await import(pathToFileURL(await jsxModule(path.join(root, 'app/small-works.jsx'))));
const snapshot = { workshop: { coinMinor: 4000, lifetimeFocusSeconds: 0 }, content, jobs: [], crew: [], unlocks: [], session: null };
const props = locale => ({ snapshot, locale, words: (key, values) => t(`smallWorks.${key}`, locale, values), duration: n => `${n}s`, coins: n => `${n / 100}`, number: String, command() {}, returnToJob() {}, blocked: false });

// Seed React's draft state to render the actual screen after an assignment edit.
// The production component and its derived selection/presentation code stay intact.
const draftHarnessFile = path.join(scratch, 'draft-selection.jsx');
writeFileSync(draftHarnessFile, readFileSync(path.join(root, 'app/small-works.jsx'), 'utf8')
  .replace('const [draftLanes, setDraftLanes] = useState([]);', 'const [draftLanes, setDraftLanes] = useState(initialSnapshot.testDraftLanes || []);')
  .replace('const [selectedJobId, setSelectedJobId] = useState(null);', 'const [selectedJobId, setSelectedJobId] = useState(initialSnapshot.testSelectedJobId || null);'));
const { SmallWorks: DraftScreen } = await import(pathToFileURL(await jsxModule(draftHarnessFile)));
const { focusJob, currentDraftLanes, watchSessionClock } = await import('../components/small-works/client-state.js');

const journeyUi = await import(pathToFileURL(await jsxModule(path.join(root, 'components/small-works/journey-ui.jsx'))));
const journeyHarnessFile = path.join(scratch, 'journey-interactions.jsx');
writeFileSync(journeyHarnessFile, readFileSync(path.join(root, 'app/small-works.jsx'), 'utf8')
  .replace("import { useEffect, useRef, useState } from 'react';", "const useState = (...args) => globalThis.__journeyHooks.useState(...args); const useRef = (...args) => globalThis.__journeyHooks.useRef(...args); const useEffect = () => {};"));
const { SmallWorks: JourneyScreen } = await import(pathToFileURL(await jsxModule(journeyHarnessFile)));

test('crew and facility requirements render from content before they are available, in both languages', () => {
  for (const locale of ['en', 'tr']) {
    const crew = renderToStaticMarkup(React.createElement(ui.CrewPanel, props(locale)));
    const growth = renderToStaticMarkup(React.createElement(ui.GrowthPanel, props(locale)));
    assert.ok(crew.includes('Ada'));
    assert.ok(crew.includes('90'));
    assert.ok(crew.includes('7200s'));
    assert.ok(crew.includes('900s'));
    assert.ok(growth.includes(t('sw.expansion.joinery-bench', locale)));
    assert.ok(growth.includes('14400s'));
    assert.ok(growth.includes('1800s'));
    assert.ok(!/smallWorks\.|sw\.staff\.|sw\.expansion\./.test(crew + growth));
    assert.ok(crew.includes('disabled=""'));
  }
});

test('off-duty apprentice shows actual allocated experience; cancelling onboarding explains the retained time', () => {
  const active = { ...snapshot, crew: [{ staffId: 'apprentice', status: 'active', allocatedSeconds: 61 }] };
  const activeHtml = renderToStaticMarkup(React.createElement(ui.CrewPanel, { ...props('en'), snapshot: active }));
  assert.ok(activeHtml.includes('61s'));
  assert.ok(activeHtml.includes('Off duty'));
  const job = { id: 'onboarding', kind: 'onboarding', status: 'making', recipeId: 'apprentice', appliedSeconds: 60, requiredSeconds: 900 };
  const training = renderToStaticMarkup(React.createElement(ui.CrewPanel, { ...props('en'), snapshot: { ...snapshot, jobs: [job], crew: [{ staffId: 'apprentice', status: 'onboarding' }] } }));
  assert.ok(training.includes('cannot be used again'));
  assert.ok(training.includes('refund 90 coins'));
});

// Exercise the real route parser in isolation: rejected bodies must never reach the mutation boundary.
let calls = 0;
globalThis.__smallWorksRouteTest = command => { calls++; return { ok: true, receipt: { result: { kind: command.kind } } }; };
after(() => { delete globalThis.__smallWorksRouteTest; });
const routeSource = readFileSync(path.join(root, 'app/api/workshop/route.js'), 'utf8')
  .replace("import { getWorkshopFor, executeWorkshopFor } from '@/lib/data/index.js';", 'const getWorkshopFor = async () => ({}); const executeWorkshopFor = async (_, command) => globalThis.__smallWorksRouteTest(command);')
  .replace("import { WORKSHOP_OWNER_ID } from '@/lib/owner.js';", "const WORKSHOP_OWNER_ID = 'test';");
const route = await import(`data:text/javascript;base64,${Buffer.from(routeSource).toString('base64')}`);
const request = command => new Request('https://small-works.invalid/api/workshop', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://small-works.invalid' }, body: JSON.stringify({ operationId: 'operation-with-enough-length', revision: 0, ...command }) });

test('API accepts shared plans and paused share edits, rejecting malformed nested payloads before mutation', async () => {
  for (const command of [
    { kind: 'session.start', mode: 'countdown', plannedSeconds: 300, lanes: [{ workerId: 'maker', jobId: 'one', share: 60 }, { workerId: 'apprentice', jobId: 'two', share: 40 }] },
    { kind: 'session.start', mode: 'countup', lanes: [{ workerId: 'maker', jobId: 'mixed', stageId: 'wood', share: 60 }, { workerId: 'blacksmith', jobId: 'mixed', stageId: 'metal', share: 40 }] },
    { kind: 'session.shares', shares: [50, 50] },
    { kind: 'crew.welcome', staffId: 'apprentice' },
    { kind: 'job.allocate', jobId: 'one', seconds: 60, workerId: 'apprentice' },
    { kind: 'job.allocate', jobId: 'mixed', seconds: 60, workerId: 'blacksmith', stageId: 'metal' },
  ]) assert.equal((await route.POST(request(command))).status, 200);
  const before = calls;
  for (const command of [
    { kind: 'session.start', lanes: [{ workerId: 'maker', jobId: 'one', share: 100, nested: {} }] },
    { kind: 'session.start', lanes: [null] },
    ...[null, {}, ['wood'], '', 'wood:metal', 'WOOd'].map(stageId => ({ kind: 'session.start', lanes: [{ workerId: 'maker', jobId: 'mixed', stageId, share: 100 }] })),
    { kind: 'session.start', lanes: [{ workerId: 'maker', stageId: 'wood', share: 100 }] },
    { kind: 'session.start', lanes: [{ workerId: 'maker', jobId: null, stageId: 'wood', share: 100 }] },
    { kind: 'job.allocate', jobId: 'mixed', workerId: 'blacksmith', seconds: 60, stageId: {} },
    { kind: 'session.start', lanes: [{ workerId: 'maker', jobId: {}, share: 100 }] },
    { kind: 'session.shares', shares: [50, 40] },
    { kind: 'session.shares', shares: [100, '0'] },
  ]) assert.equal((await route.POST(request(command))).status, 400);
  assert.equal(calls, before);
});

test('workshop renders unreadable, new, legacy-session and shared-session saves without mutating them', () => {
  const saved = { ...snapshot, initialized: true, revision: 1, workshop: { ...snapshot.workshop, name: 'Test workshop', bankSeconds: 0 }, commissions: [], history: [] };
  const session = { id: 'session', mode: 'countdown', status: 'paused', limitSeconds: 300, candidateSeconds: 60, candidateClosedSeconds: 60, activeSince: null, partCount: 1, currentPlan: JSON.stringify({ version: 1, jobId: null, workerId: null }), allocationSummary: JSON.stringify({ version: 1, spans: [60] }) };
  const shared = { ...session, currentPlan: JSON.stringify({ version: 2, lanes: [{ workerId: 'maker', jobId: 'one', share: 60 }, { workerId: 'apprentice', jobId: 'two', share: 40 }] }), allocationSummary: JSON.stringify({ version: 2, spans: [60], plans: [[{ workerId: 'maker', jobId: 'one', share: 60 }, { workerId: 'apprentice', jobId: 'two', share: 40 }]] }), lanes: [{ workerId: 'maker', jobId: 'one', share: 60 }, { workerId: 'apprentice', jobId: 'two', share: 40 }] };
  for (const initialSnapshot of [null, { ...snapshot, initialized: false }, saved, { ...saved, session }, { ...saved, session: shared }]) {
    const before = JSON.stringify(initialSnapshot);
    const html = renderToStaticMarkup(React.createElement(SmallWorks, { initialSnapshot, initialLocale: 'en' }));
    assert.ok(html.includes('data-tellop-app-marker="ok"'));
    assert.ok(!html.includes('NaN'));
    assert.equal(JSON.stringify(initialSnapshot), before);
  }
});


test('a running save still renders after the wall clock moves behind its cached time, preserving closed spans', context => {
  const now = Date.parse('2026-10-28T12:00:10Z');
  context.mock.method(Date, 'now', () => now);
  const lanes = [{ workerId: 'maker', jobId: 'one', share: 20 }, { workerId: 'apprentice', jobId: 'two', share: 80 }];
  const previousLanes = lanes.map((lane, index) => ({ ...lane, share: index === 0 ? 60 : 40 }));
  const spec = content.recipes.find(recipe => recipe.id === 'stool');
  const jobs = ['one', 'two'].map(id => jobView({ id, kind: 'object', recipeId: 'stool', specSnapshot: JSON.stringify(spec), progressSnapshot: initialProgress(spec), status: 'making', appliedSeconds: 0, completedFinish: -1, chosenFinish: 0 }));
  for (const retained of [false, true]) {
    const session = { id: 'running', mode: 'countdown', status: 'running', limitSeconds: 300,
      candidateSeconds: retained ? 50 : 30, candidateClosedSeconds: retained ? 20 : 0,
      activeSince: '2026-10-28T12:00:00Z', partCount: retained ? 1 : 0,
      currentPlan: JSON.stringify(retained ? { version: 2, lanes } : { version: 1, jobId: 'one', workerId: 'maker' }),
      allocationSummary: JSON.stringify(retained ? { version: 2, spans: [20], plans: [previousLanes] } : { version: 1, spans: [] }),
      ...(retained ? { lanes } : { jobId: 'one' }) };
    const initialSnapshot = { ...snapshot, initialized: true, revision: 1, workshop: { ...snapshot.workshop, name: 'Test workshop', bankSeconds: 0 }, jobs, session, commissions: [], history: [] };
    const before = JSON.stringify(initialSnapshot);
    const html = renderToStaticMarkup(React.createElement(SmallWorks, { initialSnapshot, initialLocale: 'en' }));
    assert.ok(html.includes('Review the open session'));
    // Ten currently available seconds, or 20 retained at 60% plus ten at 20%.
    assert.ok(html.includes(`0 min ${retained ? 14 : 10} s awaiting review`));
    assert.ok(!html.includes('NaN'));
    assert.equal(JSON.stringify(initialSnapshot), before);
  }
});

function objectView(recipeId, id = recipeId) {
  const spec = content.recipes.find(item => item.id === recipeId);
  return jobView({ id, recipeId, kind: 'object', status: 'making', specSnapshot: JSON.stringify(spec), progressSnapshot: initialProgress(spec), chosenFinish: 0, completedFinish: -1, appliedSeconds: 0 });
}

test('a shared mixed piece offers independent skill-matched components and preserves held identities', () => {
  const garden = objectView('garden-bench');
  const chest = objectView('reinforced-chest');
  const metal = objectView('lantern');
  const lanes = [{ workerId: 'maker', jobId: garden.id, stageId: 'wood', share: 60 }, { workerId: 'blacksmith', jobId: garden.id, stageId: 'metal', share: 40 }];
  assert.equal(ui.validAssignments(lanes, [garden], ['maker', 'apprentice', 'blacksmith'], true), true);
  assert.equal(ui.validAssignments(lanes, [garden], ['maker', 'blacksmith'], false), false, 'Ada opens the second lane even when she is off duty');
  assert.equal(ui.validAssignments(lanes.map(lane => ({ ...lane, stageId: 'wood' })), [garden], ['maker', 'apprentice', 'blacksmith'], true), false);
  assert.equal(ui.eligible('maker', metal), false);
  assert.equal(ui.eligible('blacksmith', chest, 'metal'), false, 'chest fittings wait for persisted wood');
  assert.equal(ui.eligible('blacksmith', garden, 'metal'), true);
  assert.equal(ui.eligible('apprentice', garden, 'wood'), false);
  for (const locale of ['en', 'tr']) {
    const base = { ...props(locale), jobs: [garden, chest, metal], lanes, apprentice: true, blacksmith: true, onChange() {} };
    const html = renderToStaticMarkup(React.createElement(ui.WorkAssignments, base));
    assert.ok(html.includes('Ivo'));
    assert.ok(html.includes(t('sw.stage.wood', locale)));
    assert.ok(html.includes(t('sw.stage.metal', locale)));
    assert.ok(!html.includes('value="garden-bench:assemble"'));
    const held = renderToStaticMarkup(React.createElement(ui.WorkAssignments, { ...base, fixed: true }));
    assert.ok(held.includes('Ivo'));
    assert.ok(held.includes(t('sw.stage.metal', locale)));
    assert.ok(!held.includes('id="worker-setup'));
    const bank = renderToStaticMarkup(React.createElement(ui.BankAssignment, { ...props(locale), job: garden, workers: ['maker', 'apprentice', 'blacksmith'], workerId: 'blacksmith', stageId: 'metal', bankSeconds: 60, onChange() {} }));
    assert.ok(bank.includes('id="bank-stage"'));
    assert.ok(bank.includes('value="metal" selected=""'));
    assert.ok(!bank.includes('value="wood"'));
    assert.ok(!/smallWorks\.|sw\.stage\./.test(html + held + bank));
  }
});

test('forge gating, blacksmith experience and component dependencies have complete localized presentation', () => {
  for (const locale of ['en', 'tr']) {
    const base = props(locale);
    const growth = renderToStaticMarkup(React.createElement(ui.GrowthPanel, base));
    assert.ok(growth.includes('360'));
    assert.ok(growth.includes('28800s'));
    assert.ok(growth.includes('3600s'));
    assert.ok(growth.includes(t('smallWorks.growth.advancedRecipes', locale, { value: '1' })));
    assert.ok(growth.includes(t('smallWorks.growth.joineryRequired', locale)));
    const active = { ...snapshot, crew: [{ staffId: 'blacksmith', status: 'active', allocatedSeconds: 123 }] };
    const crew = renderToStaticMarkup(React.createElement(ui.CrewPanel, { ...base, snapshot: active }));
    assert.ok(crew.includes('Ivo'));
    assert.ok(crew.includes('123s'));
    assert.ok(crew.includes(t('smallWorks.crew.offDuty', locale)));
    const invitation = renderToStaticMarkup(React.createElement(ui.CrewPanel, base));
    assert.ok(invitation.includes('160'));
    assert.ok(invitation.includes('1200s'));
    const job = objectView('reinforced-chest');
    const stages = renderToStaticMarkup(React.createElement(ui.StageList, { ...base, job }));
    assert.ok(stages.includes(t('smallWorks.stages.requires', locale, { value: t('sw.stage.wood', locale) })));
    assert.ok(stages.includes(t('smallWorks.skill.metal', locale)));
    assert.ok(stages.includes('0s / 1200s'));
    assert.ok(!/smallWorks\.|sw\.staff\.|sw\.expansion\./.test(growth + crew + invitation + stages));
  }
});

test('real mixed views render a same-job session with stage-specific progress in both languages', () => {
  const job = objectView('garden-bench');
  const lanes = [{ workerId: 'maker', jobId: job.id, stageId: 'wood', share: 50 }, { workerId: 'blacksmith', jobId: job.id, stageId: 'metal', share: 50 }];
  const session = { id: 'mixed-session', mode: 'countup', status: 'paused', limitSeconds: 10800, candidateSeconds: 120, candidateClosedSeconds: 120, activeSince: null, partCount: 1, currentPlan: JSON.stringify({ version: 2, lanes }), allocationSummary: JSON.stringify({ version: 2, spans: [120], plans: [lanes] }), lanes };
  const saved = { ...snapshot, initialized: true, revision: 1, workshop: { ...snapshot.workshop, name: 'Mixed workshop', bankSeconds: 60 }, jobs: [job], crew: [{ staffId: 'apprentice', status: 'active' }, { staffId: 'blacksmith', status: 'active' }], session, commissions: [], history: [] };
  const before = JSON.stringify(saved);
  for (const locale of ['en', 'tr']) {
    const html = renderToStaticMarkup(React.createElement(SmallWorks, { initialSnapshot: saved, initialLocale: locale }));
    assert.ok(html.includes(t('sw.stage.wood', locale)));
    assert.ok(html.includes(t('sw.stage.metal', locale)));
    assert.ok(!html.includes('NaN'));
    const summary = renderToStaticMarkup(React.createElement(ui.AllocationSummary, { ...props(locale), allocations: [{ workerId: 'blacksmith', jobId: job.id, stageId: 'metal', appliedSeconds: 60 }], acceptedSeconds: 60, bankedSeconds: 0, titleOf: (id, stageId) => ui.targetTitle(job, stageId, locale) }));
    assert.ok(summary.includes('Ivo'));
    assert.ok(summary.includes(t('sw.stage.metal', locale)));
  }
  assert.equal(JSON.stringify(saved), before);
});

function pausedSession(lanes, seconds) {
  return { id: 'presentation-session', mode: 'countup', status: 'paused', limitSeconds: 10800, candidateSeconds: seconds, candidateClosedSeconds: seconds, activeSince: null, partCount: 1, currentPlan: JSON.stringify({ version: 2, lanes }), allocationSummary: JSON.stringify({ version: 2, spans: [seconds], plans: [lanes] }), lanes };
}
const activeCrew = [{ staffId: 'apprentice', status: 'active' }, { staffId: 'blacksmith', status: 'active' }];
const progressed = (job, seconds, workerId, stageId) => jobView({ ...job, ...applyEffort(job, seconds, workerId, stageId).update });

test('a real half-made lantern preview advances its metal stage and stays at Ivo’s idle station', () => {
  const job = objectView('lantern');
  const session = pausedSession([{ workerId: 'blacksmith', jobId: job.id, share: 100 }], 1350);
  const allocations = allocationPreview(session, [job], 1350);
  const before = JSON.stringify(job);
  for (const isRunning of [true, false]) {
    const view = workshopPresentation({ jobs: [job], selectedJob: job, session, crew: activeCrew, allocations, isRunning, seconds: 1350 });
    const ivo = view.crew.find(member => member.staffId === 'blacksmith');
    assert.equal(ivo.recipeId, 'lantern');
    assert.equal(ivo.progress, 0.5);
    assert.equal(ivo.stageProgress.metal, 0.5);
    assert.equal(view.stagePending(job).metal, 1350);
    assert.equal(view.main.recipeId, null, 'Nora does not receive a default stool or Ivo’s metal target');
    assert.equal(view.main.activity, 'idle');
    assert.equal(view.context, 'blacksmith');
    assert.equal(ivo.activity === 'idle', !isRunning);
  }
  const settled = progressed(job, 1350, 'blacksmith');
  const ready = progressed(job, 2700, 'blacksmith');
  for (const selectedJob of [settled, ready]) {
    const view = workshopPresentation({ jobs: [selectedJob], selectedJob, crew: activeCrew });
    const ivo = view.crew.find(member => member.staffId === 'blacksmith');
    assert.equal(ivo.recipeId, 'lantern');
    assert.equal(ivo.stageProgress.metal, selectedJob === ready ? 1 : 0.5);
    assert.equal(ivo.activity, 'idle');
    assert.equal(view.main.recipeId, null);
    for (const locale of ['en', 'tr']) {
      const saved = { ...snapshot, initialized: true, workshop: { ...snapshot.workshop, name: 'Forge workshop', bankSeconds: 0 }, crew: activeCrew, jobs: [selectedJob], history: [] };
      const html = renderToStaticMarkup(React.createElement(SmallWorks, { initialSnapshot: saved, initialLocale: locale }));
      assert.ok(html.includes(t('smallWorks.crew.blacksmithName', locale)));
      assert.ok(!html.includes(`<strong>${t('smallWorks.scene.maker', locale)}</strong>`));
    }
  }
  assert.equal(JSON.stringify(job), before);
});

test('mixed previews retain separate component maps, honor review trimming, and show one assembled object', () => {
  const job = objectView('garden-bench');
  const lanes = [{ workerId: 'maker', jobId: job.id, stageId: 'wood', share: 50 }, { workerId: 'blacksmith', jobId: job.id, stageId: 'metal', share: 50 }];
  const session = pausedSession(lanes, 55);
  const view = workshopPresentation({ jobs: [job], selectedJob: job, session, crew: activeCrew, allocations: allocationPreview(session, [job], 31), seconds: 55 });
  const ivo = view.crew.find(member => member.staffId === 'blacksmith');
  assert.equal(view.main.recipeId, 'garden-bench');
  assert.equal(view.main.stageId, 'wood');
  assert.equal(ivo.recipeId, 'garden-bench');
  assert.equal(ivo.stageId, 'metal');
  assert.equal(view.main.stageProgress.wood, 16 / 4200);
  assert.equal(ivo.stageProgress.metal, 15 / 3600);
  assert.deepEqual(view.stagePending(job), { wood: 16, metal: 15, assemble: 0 });
  assert.equal(view.context, 'team');
  assert.equal(view.main.activity, 'idle');
  assert.equal(ivo.activity, 'idle');
  let complete = progressed(job, 4200, 'maker', 'wood');
  complete = progressed(complete, 3600, 'blacksmith', 'metal');
  const assemblySession = pausedSession([{ workerId: 'maker', jobId: job.id, stageId: 'assemble', share: 100 }], 900);
  const assembling = workshopPresentation({ jobs: [complete], selectedJob: complete, session: assemblySession, crew: activeCrew, allocations: allocationPreview(assemblySession, [complete], 900) });
  assert.equal(assembling.main.recipeId, 'garden-bench');
  assert.equal(assembling.main.stageId, 'assemble');
  assert.equal(assembling.main.stageProgress.assemble, 0.5);
  assert.equal(assembling.crew.find(member => member.staffId === 'blacksmith').recipeId, null);
  complete = progressed(complete, 1800, 'maker', 'assemble');
  const ready = workshopPresentation({ jobs: [complete], selectedJob: complete, crew: activeCrew });
  assert.equal(ready.main.recipeId, 'garden-bench');
  assert.equal(ready.main.stageId, 'assemble');
  assert.equal(ready.main.progress, 1);
  assert.equal(ready.crew.find(member => member.staffId === 'blacksmith').recipeId, null);
});

function communityView(id = 'greenhouse') {
  const spec = content.communityProjects[0];
  return jobView({ id, recipeId: spec.id, kind: 'community', status: 'making', specSnapshot: JSON.stringify(spec), progressSnapshot: initialProgress(spec), chosenFinish: 0, completedFinish: -1, appliedSeconds: 0 });
}
const fullCrew = ['apprentice', 'blacksmith', 'carver', 'finisher'].map(staffId => ({ staffId, status: 'active', allocatedSeconds: 123 }));
const yardSnapshot = extra => ({ ...snapshot, initialized: true, revision: 1, workshop: { ...snapshot.workshop, name: 'Yard workshop', coinMinor: 100000, bankSeconds: 0, lifetimeFocusSeconds: 60000 }, crew: fullCrew, unlocks: [{ unlockId: 'craft-yard' }, { unlockId: 'forge' }], history: [], commissions: [], ...extra });

test('yard and full crew show original identities, all prerequisites and real skill eligibility in both locales', () => {
  const yard = content.expansions.find(item => item.id === 'craft-yard');
  assert.equal(yard.requiredMetalRecipes, 1);
  assert.equal(yard.requiredMixedRecipes, 1);
  for (const locale of ['en', 'tr']) {
    const base = { ...props(locale), snapshot: yardSnapshot({}) };
    const crew = renderToStaticMarkup(React.createElement(ui.CrewPanel, base));
    const growth = renderToStaticMarkup(React.createElement(ui.GrowthPanel, { ...base, snapshot: { ...base.snapshot, unlocks: [{ unlockId: 'forge' }] } }));
    assert.ok(crew.includes('Mara'));
    assert.ok(crew.includes('Lale'));
    assert.ok(crew.includes('123s'));
    assert.ok(growth.includes(t('sw.expansion.craft-yard', locale)));
    assert.ok(growth.includes('600'));
    assert.ok(growth.includes('7200s'));
    for (const key of ['metalRecipes', 'mixedRecipes']) assert.ok(growth.includes(t(`smallWorks.growth.${key}`, locale, { value: '1' })));
    assert.ok(growth.includes(t('smallWorks.growth.activeWorker', locale, { name: t('smallWorks.crew.blacksmithName', locale) })));
    assert.ok(!/smallWorks\.|sw\.staff\.|sw\.expansion\./.test(crew + growth));
  }
});

test('three community components use distinct eligible workers and paused editors preserve all identities', () => {
  const greenhouse = communityView();
  const lanes = [{ workerId: 'maker', jobId: greenhouse.id, stageId: 'panel-a', share: 40 }, { workerId: 'carver', jobId: greenhouse.id, stageId: 'panel-b', share: 30 }, { workerId: 'blacksmith', jobId: greenhouse.id, stageId: 'frame', share: 30 }];
  const workers = ['maker', ...fullCrew.map(item => item.staffId)];
  assert.equal(ui.validAssignments(lanes, [greenhouse], workers, 3), true);
  assert.equal(ui.validAssignments(lanes, [greenhouse], workers, 2), false);
  assert.equal(ui.validAssignments(lanes.map((lane, index) => ({ ...lane, workerId: index === 1 ? 'finisher' : lane.workerId })), [greenhouse], workers, 3), false);
  assert.equal(ui.validAssignments(lanes.map((lane, index) => ({ ...lane, stageId: index === 1 ? 'panel-a' : lane.stageId })), [greenhouse], workers, 3), false);
  assert.equal(ui.validAssignments(lanes.map((lane, index) => ({ ...lane, share: index === 0 ? 50 : lane.share })), [greenhouse], workers, 3), false);
  for (const locale of ['en', 'tr']) {
    const base = { ...props(locale), jobs: [greenhouse], lanes, apprentice: true, blacksmith: true, carver: true, finisher: true, maxLanes: 3, onChange() {} };
    const setup = renderToStaticMarkup(React.createElement(ui.WorkAssignments, base));
    const paused = renderToStaticMarkup(React.createElement(ui.WorkAssignments, { ...base, fixed: true }));
    assert.ok(setup.includes('id="worker-setup-2"'));
    assert.ok(paused.includes('id="paused-share-0"'));
    assert.ok(paused.includes('id="paused-share-1"'));
    assert.ok(!paused.includes('id="worker-setup'));
    assert.ok(paused.includes('Mara'));
    assert.ok(paused.includes(t('sw.stage.frame', locale)));
    assert.ok(!setup.includes('value="greenhouse:assemble"'));
    assert.ok(!/smallWorks\.|sw\.stage\.|sw\.community\./.test(setup + paused));
  }
});

test('community gift stays available beside six objects, with explicit delivery and a permanent localized thank-you', () => {
  let greenhouse = communityView();
  const initial = JSON.stringify(greenhouse);
  for (const [seconds, worker, stage] of [[4800, 'maker', 'panel-a'], [4800, 'carver', 'panel-b'], [6000, 'blacksmith', 'frame'], [6000, 'maker', 'assemble']]) greenhouse = progressed(greenhouse, seconds, worker, stage);
  assert.equal(greenhouse.status, 'ready');
  for (const locale of ['en', 'tr']) {
    const saved = yardSnapshot({ jobs: [...Array.from({ length: 6 }, (_, index) => objectView('stool', `stool-${index}`)), greenhouse] });
    const base = { ...props(locale), snapshot: saved };
    const panel = renderToStaticMarkup(React.createElement(ui.CommunityPanel, base));
    assert.ok(panel.includes(t('smallWorks.community.deliver', locale)));
    assert.ok(panel.includes(t('smallWorks.community.noPayout', locale)));
    assert.ok(panel.includes(t('smallWorks.community.cancel', locale, { value: '180' })));
    for (const forbidden of ['object.sell', 'object.keep', 'object.namedDetail', 'object.marketValue']) assert.ok(!panel.includes(t(`smallWorks.${forbidden}`, locale)));
    const workshop = renderToStaticMarkup(React.createElement(SmallWorks, { initialSnapshot: yardSnapshot({ jobs: [greenhouse] }), initialLocale: locale }));
    assert.ok(workshop.includes(t('smallWorks.community.deliver', locale)));
    assert.ok(!workshop.includes(t('smallWorks.object.keep', locale)));
    assert.ok(!workshop.includes(t('smallWorks.object.marketValue', locale)));
    assert.ok(!workshop.includes('NaN'));
    const complete = renderToStaticMarkup(React.createElement(ui.CommunityPanel, { ...base, snapshot: yardSnapshot({ jobs: [], unlocks: [{ unlockId: 'craft-yard' }, { unlockId: 'neighborhood-greenhouse' }] }) }));
    assert.ok(complete.includes(t('smallWorks.community.displayTitle', locale)));
    assert.ok(complete.includes(t('smallWorks.community.permanent', locale)));
    assert.ok(!complete.includes(t('smallWorks.community.fund', locale, { value: '180' })));
  }
  assert.equal(JSON.parse(initial).status, 'making');
});

test('style selectors respect core choices, preserve kept styles, and disable session-held pieces', () => {
  const job = { ...objectView('garden-bench'), status: 'kept', completedFinish: 0, patternId: 'carved-leaves', finishStyleId: 'dusk-blue' };
  const before = JSON.stringify(job);
  for (const locale of ['en', 'tr']) {
    const base = { ...props(locale), snapshot: yardSnapshot({ jobs: [job] }), job };
    const styles = renderToStaticMarkup(React.createElement(ui.ObjectStyles, base));
    assert.ok(styles.includes('value="carved-leaves" selected=""'));
    assert.ok(styles.includes('value="dusk-blue" selected=""'));
    assert.ok(styles.includes(t('smallWorks.styles.promise', locale)));
    const held = renderToStaticMarkup(React.createElement(ui.ObjectStyles, { ...base, snapshot: { ...base.snapshot, session: pausedSession([{ workerId: 'maker', jobId: job.id, share: 100 }], 0) } }));
    assert.ok(held.includes('<fieldset class="sw-style-editor" disabled=""'));
    assert.ok(held.includes(t('smallWorks.styles.held', locale)));
    const metal = renderToStaticMarkup(React.createElement(ui.ObjectStyles, { ...base, job: objectView('lantern') }));
    assert.ok(!metal.includes('value="carved-leaves"'));
    assert.ok(metal.includes('value="warm-honey"'));
    const noCrew = renderToStaticMarkup(React.createElement(ui.ObjectStyles, { ...base, job: objectView('stool'), snapshot: { ...base.snapshot, crew: [] } }));
    assert.ok(!noCrew.includes('value="carved-ripples"'));
    assert.ok(noCrew.includes('value="dusk-blue" disabled=""'));
    assert.equal(renderToStaticMarkup(React.createElement(ui.ObjectStyles, { ...base, job: communityView() })), '');
    assert.equal(renderToStaticMarkup(React.createElement(ui.ObjectStyles, { ...base, job: { ...job, status: 'sold' } })), '');
    assert.ok(!/smallWorks\.|sw\.pattern\.|sw\.finishStyle\./.test(styles + held + metal + noCrew));
  }
  assert.equal(JSON.stringify(job), before);
});

test('three-lane presentation replays actual community rules, keeps off-duty staff and carries original styles', () => {
  const greenhouse = communityView();
  const lanes = [{ workerId: 'apprentice', jobId: greenhouse.id, stageId: 'panel-a', share: 40 }, { workerId: 'carver', jobId: greenhouse.id, stageId: 'panel-b', share: 30 }, { workerId: 'blacksmith', jobId: greenhouse.id, stageId: 'frame', share: 30 }];
  const session = pausedSession(lanes, 100);
  const allocations = allocationPreview(session, [greenhouse], 100);
  const view = workshopPresentation({ jobs: [greenhouse], selectedJob: greenhouse, session, crew: fullCrew, allocations, isRunning: true, seconds: 100 });
  assert.equal(view.crew.length, 4);
  assert.equal(view.main.activity, 'idle');
  assert.equal(view.crew.filter(item => item.activity !== 'idle').length, 3);
  assert.equal(view.crew.find(item => item.staffId === 'finisher').activity, 'idle');
  assert.deepEqual(view.stagePending(greenhouse), { 'panel-a': 40, 'panel-b': 30, frame: 30, assemble: 0 });
  assert.deepEqual(view.greenhouse, { status: 'making', stageProgress: { 'panel-a': 40 / 4800, 'panel-b': 30 / 4800, frame: 30 / 6000, assemble: 0 } });
  assert.equal(view.crew.find(item => item.staffId === 'carver').recipeId, 'neighborhood-greenhouse');
  const styled = { ...objectView('stool'), patternId: 'carved-ripples', finishStyleId: 'warm-honey' };
  const styleView = workshopPresentation({ jobs: [styled], selectedJob: styled, crew: fullCrew });
  assert.equal(styleView.main.patternId, 'carved-ripples');
  assert.equal(styleView.main.finishStyleId, 'warm-honey');
  const delivered = workshopPresentation({ jobs: [], crew: fullCrew, unlocks: [{ unlockId: 'neighborhood-greenhouse' }] });
  assert.equal(delivered.greenhouse.status, 'delivered');
  assert.equal(delivered.greenhouse.stageProgress.assemble, 1);
  for (const locale of ['en', 'tr']) {
    const html = renderToStaticMarkup(React.createElement(SmallWorks, { initialSnapshot: yardSnapshot({ jobs: [greenhouse], session }), initialLocale: locale }));
    assert.ok(html.includes('Mara'));
    assert.ok(html.includes(t('sw.stage.frame', locale)));
    assert.ok(!html.includes('NaN'));
  }
});

test('real API parser accepts yard styles and three lanes while bounding malformed community and style payloads', async () => {
  for (const command of [
    { kind: 'session.start', mode: 'countup', lanes: [{ workerId: 'maker', jobId: 'greenhouse', stageId: 'panel-a', share: 40 }, { workerId: 'carver', jobId: 'greenhouse', stageId: 'panel-b', share: 30 }, { workerId: 'blacksmith', jobId: 'greenhouse', stageId: 'frame', share: 30 }] },
    { kind: 'session.shares', shares: [20, 30, 50] },
    { kind: 'crew.welcome', staffId: 'finisher' },
    { kind: 'community.fund', projectId: 'neighborhood-greenhouse' },
    { kind: 'community.deliver', jobId: 'greenhouse' },
    { kind: 'job.style', jobId: 'stool', patternId: 'carved-ripples', finishStyleId: 'dusk-blue' },
  ]) assert.equal((await route.POST(request(command))).status, 200);
  const before = calls;
  for (const command of [
    { kind: 'community.fund', projectId: {} },
    { kind: 'community.deliver', jobId: null },
    { kind: 'job.style', jobId: 'stool', patternId: {} },
    { kind: 'job.style', jobId: 'stool', finishStyleId: ['natural'] },
    { kind: 'job.style', jobId: 'stool', finishStyleId: 'dusk-blue', color: '#ffffff' },
    { kind: 'session.shares', shares: [40, 30, 20] },
    { kind: 'session.start', lanes: Array.from({ length: 4 }, (_, index) => ({ workerId: ['maker', 'carver', 'blacksmith', 'apprentice'][index], jobId: `job-${index}`, share: index < 2 ? 30 : 20 })) },
  ]) assert.equal((await route.POST(request(command))).status, 400);
  assert.equal(calls, before);
});

function findElement(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

test('three-lane controls emit conserved shares and style controls emit only the chosen validated field', () => {
  const greenhouse = communityView();
  const lanes = [{ workerId: 'maker', jobId: greenhouse.id, stageId: 'panel-a', share: 40 }, { workerId: 'carver', jobId: greenhouse.id, stageId: 'panel-b', share: 30 }, { workerId: 'blacksmith', jobId: greenhouse.id, stageId: 'frame', share: 30 }];
  let changed;
  const editor = ui.WorkAssignments({ ...props('en'), jobs: [greenhouse], lanes, apprentice: true, blacksmith: true, carver: true, finisher: true, maxLanes: 3, fixed: true, onChange: value => { changed = value; } });
  findElement(editor, element => element.props?.id === 'paused-share-0').props.onChange({ target: { value: '50' } });
  assert.deepEqual(changed.map(item => item.share), [50, 30, 20]);
  assert.deepEqual(changed.map(({ share, ...identity }) => identity), lanes.map(({ share, ...identity }) => identity));
  assert.equal(ui.validAssignments(changed, [greenhouse], ['maker', 'carver', 'blacksmith'], 3), true);
  const piece = objectView('stool');
  let sent;
  const styles = ui.ObjectStyles({ ...props('en'), job: piece, snapshot: yardSnapshot({ jobs: [piece] }), command: (kind, fields) => { sent = { kind, ...fields }; } });
  findElement(styles, element => element.props?.id === `patternId-${piece.id}`).props.onChange({ target: { value: 'carved-leaves' } });
  assert.deepEqual(sent, { kind: 'job.style', jobId: piece.id, patternId: 'carved-leaves' });
  findElement(styles, element => element.props?.id === `finishStyleId-${piece.id}`).props.onChange({ target: { value: 'dusk-blue' } });
  assert.deepEqual(sent, { kind: 'job.style', jobId: piece.id, finishStyleId: 'dusk-blue' });
});

test('a finisher’s allocated object stays at that worker without a duplicate at Ivo’s idle station', () => {
  const lantern = progressed(objectView('lantern'), 2700, 'blacksmith');
  const detail = jobView({ ...lantern, status: 'making', chosenFinish: 1 });
  const session = pausedSession([{ workerId: 'finisher', jobId: detail.id, share: 100 }], 60);
  const view = workshopPresentation({ jobs: [detail], selectedJob: detail, session, crew: fullCrew, allocations: allocationPreview(session, [detail], 60), isRunning: true, seconds: 60 });
  assert.equal(view.main.recipeId, null);
  assert.equal(view.crew.find(item => item.staffId === 'blacksmith').recipeId, null);
  assert.equal(view.crew.find(item => item.staffId === 'finisher').recipeId, 'lantern');
  assert.equal(view.crew.find(item => item.staffId === 'finisher').activity, 'sand');
});

test('kept appearance preview renders saved styles in a read-only still scene and follows later style saves', () => {
  const finished = progressed(progressed(progressed(objectView('garden-bench'), 4200, 'maker', 'wood'), 3600, 'blacksmith', 'metal'), 1800, 'maker', 'assemble');
  const kept = { ...finished, status: 'kept', patternId: 'carved-leaves', finishStyleId: 'dusk-blue' };
  const preview = keptObjectPreview(kept);
  assert.equal(preview.recipeId, 'garden-bench');
  assert.equal(preview.mainStageId, 'assemble');
  assert.equal(preview.patternId, 'carved-leaves');
  assert.equal(preview.finishStyleId, 'dusk-blue');
  assert.equal(preview.motion, 'still');
  assert.equal(preview.activity, 'idle');
  assert.deepEqual(preview.crew, []);
  assert.deepEqual(preview.stageProgress, Object.fromEntries(kept.stages.map(stage => [stage.id, stage.appliedSeconds / stage.seconds])));
  for (const job of [objectView('stool'), communityView(), { ...kept, status: 'sold' }]) assert.equal(keptObjectPreview(job), null);
  const Scene = scene => React.createElement('div', { 'data-preview-recipe': scene.recipeId, 'data-preview-pattern': scene.patternId, 'data-preview-finish': scene.finishStyleId, 'data-preview-motion': scene.motion });
  for (const locale of ['en', 'tr']) {
    const properties = { ...props(locale), job: kept, Scene, onClose() {} };
    const html = renderToStaticMarkup(React.createElement(ui.KeptObjectPreview, properties));
    assert.ok(html.includes('data-preview-recipe="garden-bench"'));
    assert.ok(html.includes('data-preview-pattern="carved-leaves"'));
    assert.ok(html.includes('data-preview-finish="dusk-blue"'));
    assert.ok(html.includes('data-preview-motion="still"'));
    assert.ok(html.includes(t('smallWorks.showroom.previewLabel', locale, { name: t(kept.spec.nameKey, locale) })));
    assert.ok(html.includes(t('sw.pattern.carved-leaves', locale)));
    assert.equal((html.match(/<button/g) || []).length, 1, 'preview exposes only its close control');
    assert.ok(html.includes(t('smallWorks.showroom.closePreview', locale)));
    assert.ok(!html.includes('<select'));
    assert.ok(!/smallWorks\.|sw\.pattern\.|sw\.finishStyle\./.test(html));
    const saved = renderToStaticMarkup(React.createElement(ui.KeptObjectPreview, { ...properties, job: { ...kept, patternId: 'carved-ripples', finishStyleId: 'warm-honey' } }));
    assert.ok(saved.includes('data-preview-pattern="carved-ripples"'));
    assert.ok(saved.includes('data-preview-finish="warm-honey"'));
    assert.ok(t('smallWorks.scene.label', locale).includes('Mara'));
    assert.ok(t('smallWorks.scene.label', locale).includes('Lale'));
  }
});

test('inspecting a kept piece does not replace or advance active session targets', () => {
  const active = communityView();
  const kept = { ...progressed(objectView('lantern'), 2700, 'blacksmith'), status: 'kept', patternId: 'plain', finishStyleId: 'warm-honey' };
  const lanes = [{ workerId: 'maker', jobId: active.id, stageId: 'panel-a', share: 60 }, { workerId: 'blacksmith', jobId: active.id, stageId: 'frame', share: 40 }];
  const session = pausedSession(lanes, 100);
  const jobs = [active, kept];
  const before = JSON.stringify({ jobs, session });
  const inputs = { jobs, selectedJob: active, session, crew: fullCrew, allocations: allocationPreview(session, jobs, 100), isRunning: true, seconds: 100 };
  const working = workshopPresentation(inputs);
  const preview = keptObjectPreview(kept);
  assert.equal(preview.recipeId, 'lantern');
  assert.equal(preview.activity, 'idle');
  assert.equal(working.main.recipeId, 'neighborhood-greenhouse');
  assert.equal(working.crew.find(member => member.staffId === 'blacksmith').recipeId, 'neighborhood-greenhouse');
  assert.equal(JSON.stringify(workshopPresentation(inputs)), JSON.stringify(working));
  assert.deepEqual(workshopPresentation(inputs).stagePending(active), working.stagePending(active));
  assert.equal(JSON.stringify({ jobs, session }), before);
});


test('first draft target drives the setup heading, progress and scene; saved session targets stay authoritative', () => {
  const jobs = [objectView('wooden-spoon', 'spoon'), objectView('stool', 'stool')];
  const draft = [{ workerId: 'maker', jobId: 'stool', share: 100 }];
  const saved = { ...snapshot, initialized: true, revision: 1, jobs, commissions: [], history: [], testSelectedJobId: 'spoon', testDraftLanes: draft };
  for (const locale of ['en', 'tr']) {
    const html = renderToStaticMarkup(React.createElement(DraftScreen, { initialSnapshot: saved, initialLocale: locale }));
    const title = t(jobs[1].spec.nameKey, locale);
    assert.ok(html.includes(`<h2>${title}</h2>`));
    assert.match(html, new RegExp(`sw-progress-strip[^]*?<h2>${title}</h2>`));
    assert.ok(html.includes('value="stool:" selected=""'));
  }
  const chosen = focusJob(jobs, null, 'spoon', draft);
  assert.equal(chosen.id, 'stool');
  assert.equal(workshopPresentation({ jobs, selectedJob: chosen }).main.recipeId, 'stool');
  for (const status of ['running', 'paused']) {
    const session = { status, lanes: [{ workerId: 'maker', jobId: 'spoon', share: 100 }] };
    assert.equal(focusJob(jobs, session, 'stool', draft).id, 'spoon');
    assert.equal(workshopPresentation({ jobs, selectedJob: focusJob(jobs, session, 'stool', draft), session }).main.recipeId, 'wooden-spoon');
  }
  assert.equal(focusJob(jobs, { jobId: 'spoon' }, 'stool', draft).id, 'spoon', 'legacy session target is authoritative too');
  assert.equal(focusJob(jobs, { jobId: 'missing' }, 'stool', draft), undefined, 'a missing saved target never displays a different project');
});

test('stale draft projects, stages and workers reset safely while intentional incomplete assignments remain editable', () => {
  const jobs = [objectView('wooden-spoon', 'spoon'), objectView('stool', 'stool')];
  const valid = [{ workerId: 'maker', jobId: 'stool', share: 100 }];
  assert.equal(currentDraftLanes(valid, jobs, ['maker']), valid);
  assert.deepEqual(currentDraftLanes(valid, jobs.slice(0, 1), ['maker']), []);
  assert.deepEqual(currentDraftLanes(valid, [{ ...jobs[1], status: 'ready' }], ['maker']), []);
  assert.deepEqual(currentDraftLanes(valid.map(lane => ({ ...lane, stageId: 'missing' })), jobs, ['maker']), []);
  assert.deepEqual(currentDraftLanes(valid.map(lane => ({ ...lane, workerId: 'apprentice' })), jobs, ['maker']), []);
  const incomplete = [{ workerId: 'maker', jobId: '', share: 100 }];
  assert.equal(currentDraftLanes(incomplete, jobs, ['maker']), incomplete);
  assert.equal(focusJob(jobs, null, 'removed', []).id, 'spoon');
});

function clockHarness(context) {
  let wall = Date.parse('2026-10-28T12:00:00Z');
  let mono = 100;
  let callback;
  const documentTarget = new EventTarget();
  documentTarget.visibilityState = 'visible';
  const windowTarget = new EventTarget();
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  globalThis.document = documentTarget; globalThis.window = windowTarget;
  context.after(() => {
    if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
  });
  context.mock.method(Date, 'now', () => wall);
  context.mock.method(performance, 'now', () => mono);
  context.mock.method(globalThis, 'setInterval', fn => { callback = fn; return 7; });
  const clear = context.mock.method(globalThis, 'clearInterval', () => {});
  const ticks = [];
  let recoveries = 0;
  const session = { status: 'running', candidateSeconds: 20, candidateClosedSeconds: 20, activeSince: new Date(wall).toISOString(), limitSeconds: 300 };
  const stop = watchSessionClock(session, seconds => ticks.push(seconds), () => recoveries++);
  return {
    ticks, document: documentTarget, window: windowTarget, stop, clear,
    get recoveries() { return recoveries; },
    advance(wallMs, monoMs = wallMs) { wall += wallMs; mono += monoMs; },
    tick() { callback(); },
  };
}

test('background visibility and multi-minute throttling preserve the bounded live candidate without recovery', context => {
  const h = clockHarness(context);
  h.advance(2000); h.tick();
  assert.equal(h.ticks.at(-1), 22);
  h.document.visibilityState = 'hidden';
  h.document.dispatchEvent(new Event('visibilitychange'));
  h.advance(120000); h.tick();
  assert.equal(h.ticks.at(-1), 142);
  h.advance(10000);
  h.document.visibilityState = 'visible';
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.ticks.at(-1), 152);
  h.advance(600000); h.tick();
  assert.equal(h.ticks.at(-1), 300, 'session cap still applies');
  assert.equal(h.recoveries, 0);
  h.stop();
  assert.equal(h.clear.mock.calls.length, 1);
  const count = h.ticks.length;
  h.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(h.ticks.length, count, 'observer cleanup removes listeners');
});

test('clock disagreement, backwards samples and explicit suspension require review without adding the uncertain gap', async context => {
  for (const anomaly of ['wall-forward', 'wall-backward', 'mono-backward', 'freeze', 'pagehide', 'bfcache']) {
    await context.test(anomaly, sub => {
      const h = clockHarness(sub);
      h.advance(2000); h.tick();
      if (anomaly === 'wall-forward') h.advance(60000, 0);
      if (anomaly === 'wall-backward') h.advance(-100, 250);
      if (anomaly === 'mono-backward') h.advance(250, -100);
      if (anomaly === 'freeze') h.document.dispatchEvent(new Event('freeze'));
      if (anomaly === 'pagehide') h.window.dispatchEvent(new Event('pagehide'));
      if (anomaly === 'bfcache') {
        const event = new Event('pageshow'); event.persisted = true; h.window.dispatchEvent(event);
      }
      h.tick();
      assert.equal(h.recoveries, 1);
      assert.deepEqual(h.ticks, [22]);
      h.advance(60000); h.tick();
      assert.deepEqual(h.ticks, [22], 'recovery cannot restart itself or silently add elapsed time');
      h.stop();
    });
  }
});

function interactiveScreen(initialSnapshot) {
  const states = [];
  let cursor = 0;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useRef(initial) { return hooks.useState(() => ({ current: initial }))[0]; },
  };
  return () => { cursor = 0; globalThis.__journeyHooks = hooks; return JourneyScreen({ initialSnapshot, initialLocale: 'en' }); };
}
function contents(element) {
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  return React.Children.toArray(element?.props?.children).map(contents).join('');
}
const clickNamed = (tree, name) => {
  const element = findElement(tree, item => typeof item.props?.onClick === 'function' && contents(item) === name);
  assert.ok(element, `Missing action: ${name}`);
  return element.props.onClick();
};

test('live setup defaults to 20 minutes, retains a deliberate edit when Work changes, and previews overflow', () => {
  const stool = objectView('stool');
  const spoon = objectView('wooden-spoon');
  const render = interactiveScreen({ ...snapshot, initialized: true, jobs: [stool, spoon], commissions: [] });
  let tree = render();
  assert.equal(findElement(tree, element => element.props?.['aria-pressed'] && contents(element) === '20 min')?.props['aria-pressed'], true);
  const assignments = () => { const element = findElement(tree, item => item.props?.compact && item.props?.lanes); return element.type(element.props); };
  assert.equal(findElement(assignments(), element => element.props?.id === 'worker-setup-0'), null, 'only Nora needs no worker selector');
  assert.ok(findElement(assignments(), element => element.props?.id === 'target-setup-0'), 'multiple jobs retain Work');
  clickNamed(tree, '25 min');
  tree = render();
  assert.ok(contents(tree).includes('Extra 5 min 0 s is saved for your next piece.'));
  findElement(assignments(), element => element.props?.id === 'target-setup-0').props.onChange({ target: { value: 'wooden-spoon:' } });
  tree = render();
  assert.ok(contents(tree).includes(t('sw.recipe.wooden-spoon', 'en')));
  assert.equal(findElement(tree, element => element.props?.['aria-pressed'] && contents(element) === '25 min')?.props['aria-pressed'], true, 'changing work must not undo the explicit duration');
  assert.ok(contents(tree).includes('Extra 20 min 0 s is saved for your next piece.'));
});

test('readable optional review fields clamp minute and second edits to the confirmed candidate', () => {
  let value = '65';
  const make = () => journeyUi.ReviewDuration({ candidateSeconds: 65, value, onChange: next => { value = next; }, ...props('en') });
  let tree = make();
  assert.equal(findElement(tree, element => element.type === 'details').props.open, undefined);
  assert.ok(contents(tree).includes('65s'));
  findElement(tree, element => element.props?.id === 'review-minutes').props.onChange({ target: { value: '10' } });
  assert.equal(value, '65');
  findElement(make(), element => element.props?.id === 'review-seconds').props.onChange({ target: { value: '-1' } });
  assert.equal(value, '60');
  findElement(make(), element => element.props?.id === 'review-minutes').props.onChange({ target: { value: '0' } });
  assert.equal(value, '0');
  findElement(make(), element => element.props?.id === 'review-seconds').props.onChange({ target: { value: '0' } });
  assert.equal(value, '0');
});

test('compact assignments expose invalid drafts and add a valid same-project worker before unrelated work', () => {
  const garden = objectView('garden-bench');
  const lantern = objectView('lantern');
  let lanes = [{ workerId: 'maker', jobId: garden.id, stageId: 'wood', share: 100 }];
  const base = { ...props('en'), jobs: [lantern, garden], blacksmith: true, maxLanes: 2, compact: true, onChange: next => { lanes = next; } };
  const tree = ui.WorkAssignments({ ...base, lanes });
  assert.equal(findElement(tree, element => element.type === 'details').props.open, undefined);
  clickNamed(tree, t('smallWorks.allocation.twoWorkers', 'en'));
  assert.deepEqual(lanes, [{ workerId: 'maker', jobId: garden.id, stageId: 'wood', share: 50 }, { workerId: 'blacksmith', jobId: garden.id, stageId: 'metal', share: 50 }]);
  const invalid = ui.WorkAssignments({ ...base, lanes: [{ workerId: 'maker', jobId: '', share: 100 }] });
  assert.equal(findElement(invalid, element => element.type === 'details').props.open, true);
  assert.ok(contents(invalid).includes(t('smallWorks.allocation.invalid', 'en')));
});

test('receipt-only success and uncertain reconciliation keep the actual reward without issuing another sale', async () => {
  const priorFetch = globalThis.fetch;
  const priorWindow = globalThis.window;
  globalThis.window = { location: { href: 'http://localhost/' }, history: { replaceState() {} } };
  const stool = progressed({ ...objectView('stool'), reservedMaterialMinor: 1200 }, 1200);
  const readySnapshot = { ...snapshot, initialized: true, revision: 1, jobs: [stool], commissions: [{ templateId: 'first-stool', status: 'accepted' }] };
  const soldSnapshot = { ...readySnapshot, revision: 2, jobs: [], commissions: [{ templateId: 'first-stool', status: 'delivered' }] };
  try {
    for (const uncertain of [false, true]) {
      const render = interactiveScreen(readySnapshot);
      const requests = [];
      let operation;
      globalThis.fetch = async (url, options) => {
        requests.push({ url, method: options?.method || 'GET' });
        if (options?.method === 'POST') {
          operation = JSON.parse(options.body);
          if (uncertain) throw new Error('lost response');
          return { ok: true, json: async () => ({ ok: true, receipt: { coinDeltaMinor: 7800, result: { jobId: stool.id } } }) };
        }
        if (url.startsWith('/api/workshop/receipt?')) return { ok: true, json: async () => ({ ok: true, receipt: { coinDeltaMinor: 7800, result: { jobId: stool.id } } }) };
        return { ok: true, json: async () => ({ ok: true, snapshot: soldSnapshot }) };
      };
      await clickNamed(render(), t('smallWorks.object.deliver', 'en', { amount: '78' }));
      if (uncertain) {
        assert.ok(contents(render()).includes(t('smallWorks.uncertain.keepOpen', 'en')));
        await clickNamed(render(), t('smallWorks.uncertain.check', 'en'));
      }
      const tree = render();
      assert.equal(operation.kind, 'commission.deliver');
      assert.ok(contents(tree).includes(t('smallWorks.receipt.delivered', 'en', { name: t('sw.recipe.stool', 'en') })));
      assert.ok(contents(tree).includes('+78 coins received'));
      assert.equal(requests.filter(item => item.method === 'POST').length, 1);
      clickNamed(tree, t('smallWorks.receipt.next', 'en'));
      assert.ok(contents(render()).includes('+78 coins received'), 'navigation preserves the result');
      clickNamed(render(), t('smallWorks.receipt.dismiss', 'en'));
      assert.ok(!contents(render()).includes('+78 coins received'));
    }
  } finally { globalThis.fetch = priorFetch; globalThis.window = priorWindow; delete globalThis.__journeyHooks; }
});

test('returning from Workbench preserves a deliberate duration on the same piece and resets for another piece', () => {
  const priorWindow = globalThis.window;
  globalThis.window = { location: { href: 'http://localhost/' }, history: { replaceState() {} } };
  const stool = objectView('stool');
  const spoon = objectView('wooden-spoon');
  try {
    for (const choice of [50, 'custom', 'countup']) {
      const render = interactiveScreen({ ...snapshot, initialized: true, jobs: [stool, spoon], commissions: [] });
      const label = typeof choice === 'number' ? `${choice} min` : t(`smallWorks.focus.${choice}`, 'en');
      clickNamed(render(), label);
      if (choice === 'custom') findElement(render(), item => item.props?.id === 'custom-minutes').props.onChange({ target: { value: '37' } });
      clickNamed(render(), t('smallWorks.nav.workbench', 'en'));
      clickNamed(render(), t('smallWorks.workbench.return', 'en'));
      assert.equal(findElement(render(), item => item.props?.['aria-pressed'] && contents(item) === label)?.props['aria-pressed'], true);
      if (choice === 'custom') assert.equal(findElement(render(), item => item.props?.id === 'custom-minutes').props.value, '37');
      clickNamed(render(), t('smallWorks.nav.workbench', 'en'));
      const spoonRow = findElement(render(), item => item.props?.className === 'sw-job-row' && contents(item).includes(t('sw.recipe.wooden-spoon', 'en')));
      clickNamed(spoonRow, t('smallWorks.workbench.return', 'en'));
      assert.equal(findElement(render(), item => item.props?.['aria-pressed'] && contents(item) === '5 min')?.props['aria-pressed'], true);
    }
  } finally { globalThis.window = priorWindow; delete globalThis.__journeyHooks; }
});

test('count-up assignment setup displays conserved percentages without inventing a 25-minute plan', () => {
  const render = interactiveScreen({ ...snapshot, initialized: true, jobs: [objectView('stool'), objectView('wooden-spoon')], crew: [{ staffId: 'apprentice', status: 'active' }], unlocks: [{ unlockId: 'carpenter-room' }], commissions: [] });
  clickNamed(render(), t('smallWorks.focus.countup', 'en'));
  let element = findElement(render(), item => item.props?.compact && item.props?.lanes);
  clickNamed(element.type(element.props), t('smallWorks.allocation.twoWorkers', 'en'));
  element = findElement(render(), item => item.props?.compact && item.props?.lanes);
  assert.equal(element.props.plannedSeconds, null);
  const editor = element.type(element.props);
  const summary = findElement(editor, item => item.props?.className === 'sw-assignment-summary');
  assert.ok(contents(summary).includes('50%'));
  assert.ok(!contents(summary).includes('12 min 30 s'));
  assert.equal(React.Children.count(summary.props.children), 2, 'each worker gets its own summary row');
  assert.equal(contents(editor).split(t('smallWorks.allocation.sharedFocus', 'en')).length - 1, 1, 'compact and expanded editor must not repeat the explanation');
});

test('milestone counters remain visible in the closed summary and guidance stays accurate for a free fallback', () => {
  const saved = { ...snapshot, initialized: true, workshop: { coinMinor: 10600, lifetimeFocusSeconds: 1200 }, unlocks: [{ unlockId: 'recipe:stool' }], commissions: [] };
  const { nextMilestone } = awaitJourney;
  for (const locale of ['en', 'tr']) {
    const element = journeyUi.WorkshopMilestone({ ...props(locale), snapshot: saved, progress: nextMilestone(saved), onPanel() {} });
    assert.equal(element.props.open, undefined);
    const summary = findElement(element, item => item.type === 'summary');
    assert.ok(contents(summary).includes(locale === 'en' ? '106/120 coins' : '106/120 sikke'));
    assert.ok(contents(summary).includes(locale === 'en' ? '20/60 min focus' : '20/60 dk odak'));
    assert.ok(contents(summary).includes(locale === 'en' ? '1/3 starter recipes' : '1/3 başlangıç tarifi'));
  }
  const advanced = { ...saved, workshop: { coinMinor: 0, lifetimeFocusSeconds: 30000 }, unlocks: ['carpenter-room', 'joinery-bench', 'recipe:wooden-spoon'].map(unlockId => ({ unlockId })) };
  const tree = interactiveScreen(advanced)();
  assert.ok(contents(tree).includes(t('smallWorks.journey.makeSuggested', 'en', { name: t('sw.recipe.wooden-spoon', 'en') })));
  assert.ok(!contents(tree).includes(t('smallWorks.journey.variety', 'en')));
});

const tasksUi = await import(pathToFileURL(await jsxModule(path.join(root, 'components/small-works/tasks-ui.jsx'))));
test('task picker, task list and workshop links render readable states in both languages', () => {
  const tasks = [{ id: 'task-one', title: 'Write the proposal', status: 'open', focusSeconds: 600, sessionCount: 2, createdAt: '2026-10-28T12:00:00Z' }];
  const jobs = [objectView('stool', 'one'), objectView('wooden-spoon', 'two')];
  for (const locale of ['en', 'tr']) {
    const args = props(locale);
    const panel = renderToStaticMarkup(React.createElement(tasksUi.TasksPanel, { ...args, snapshot: { ...snapshot, tasks, jobs }, onFocus() {}, loadCompleted() {} }));
    assert.ok(panel.includes('Write the proposal')); assert.ok(panel.includes('600s')); assert.ok(!panel.includes('smallWorks.tasks.'));
    const picker = renderToStaticMarkup(React.createElement(tasksUi.TaskPicker, { ...args, tasks, value: 'task-one', onChange() {} }));
    assert.ok(picker.includes('value="task-one" selected=""')); assert.ok(picker.includes('maxLength="160"') === false);
    const active = { ...snapshot, jobs, session: { mode: 'countup', status: 'running', taskTitle: 'Write the proposal', lanes: [{ workerId: 'maker', jobId: 'one', share: 60 }, { workerId: 'apprentice', jobId: 'two', share: 40 }] } };
    const queue = renderToStaticMarkup(React.createElement(tasksUi.WorkshopQueue, { ...args, snapshot: active }));
    assert.ok(queue.includes('60%') || queue.includes('%60')); assert.ok(queue.includes('40%') || queue.includes('%40')); assert.ok(queue.includes('Write the proposal'));
    assert.ok(!queue.includes('sw.recipe.')); assert.ok(!queue.includes('smallWorks.'));
  }
});

test('task source is visible for active and recovered work and absent during breaks', () => {
  const args = props('en');
  for (const mode of ['countdown', 'countup']) {
    const html = renderToStaticMarkup(React.createElement(tasksUi.TaskSource, { ...args, session: { mode, taskTitle: 'Study chapter one' } }));
    assert.ok(html.includes('Study chapter one'));
  }
  assert.equal(renderToStaticMarkup(React.createElement(tasksUi.TaskSource, { ...args, session: { mode: 'break', taskTitle: 'Study' } })), '');
});

test('recovered focus stays awaiting confirmation in the task banner and product queue', () => {
  const args = props('en');
  const jobs = [objectView('stool', 'one')];
  const session = { mode: 'countup', status: 'running', taskTitle: 'Read chapter one', lanes: [{ workerId: 'maker', jobId: 'one', share: 100 }] };
  const queue = renderToStaticMarkup(React.createElement(tasksUi.WorkshopQueue, { ...args, snapshot: { ...snapshot, jobs, session }, focusState: 'review' }));
  assert.ok(queue.includes('Awaiting confirmation'));
  assert.ok(!queue.includes('Receiving focus'));
  assert.ok(!queue.includes('Work on this next'));
  let returned = false;
  const banner = tasksUi.TaskSessionBanner({ ...args, session, focusState: 'review', seconds: 75, onReturn() { returned = true; } });
  assert.ok(contents(banner).includes('Awaiting review · 75s'));
  clickNamed(banner, 'Review session');
  assert.equal(returned, true);
});

test('the active task remains on the first page and other tasks cannot switch an unfinished session', () => {
  const tasks = Array.from({ length: 12 }, (_, index) => ({ id: `task-${index}`, title: `Task ${index}`, status: 'open', createdAt: `2026-10-${String(index + 1).padStart(2, '0')}T12:00:00Z`, focusSeconds: 0, sessionCount: 0 }));
  const html = renderToStaticMarkup(React.createElement(tasksUi.TasksPanel, { ...props('en'), snapshot: { ...snapshot, tasks, session: { mode: 'countup', status: 'paused', taskId: 'task-0', taskTitle: 'Task 0' } }, focusState: 'paused' }));
  assert.ok(html.includes('aria-label="Mark Task 0 done"'));
  assert.ok(html.indexOf('aria-label="Mark Task 0 done"') < html.indexOf('aria-label="Mark Task 11 done"'));
  assert.ok(!html.includes('aria-label="Mark Task 1 done"'));
  assert.ok(html.includes('Finish this session before switching tasks.'));
});

test('choosing a task opens focus setup without starting a session and retains the chosen duration', () => {
  const priorWindow = globalThis.window;
  globalThis.window = { location: { href: 'http://localhost/' }, history: { replaceState() {} } };
  try {
    const render = interactiveScreen({ ...snapshot, initialized: true, jobs: [objectView('stool')], tasks: [{ id: 'reading', status: 'open', title: 'Read chapter one' }], commissions: [] });
    clickNamed(render(), '50 min');
    clickNamed(render(), t('smallWorks.nav.tasks', 'en'));
    const taskPanel = findElement(render(), element => typeof element.props?.onFocus === 'function');
    assert.ok(taskPanel);
    taskPanel.props.onFocus('reading');
    const tree = render();
    const picker = findElement(tree, element => element.props?.tasks && element.props?.value === 'reading');
    assert.ok(picker);
    assert.equal(findElement(tree, element => element.props?.['aria-pressed'] && contents(element) === '50 min')?.props['aria-pressed'], true);
    assert.ok(contents(tree).includes(t('smallWorks.focus.start', 'en')));
  } finally { globalThis.window = priorWindow; delete globalThis.__journeyHooks; }
});
