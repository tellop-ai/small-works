import assert from 'node:assert/strict';
import { test } from 'node:test';
import { content } from '../lib/game/content.js';
import { initialProgress, jobView, applyEffort } from '../lib/game/rules.js';
import { visiblePanels, nextMilestone, expansionProgress, suggestedRecipe, recipeAdvancesMilestone, suggestedMinutes, nextAssignment, plannedAllocation, plannedShares, finishingValue, saleReceipt } from '../components/small-works/journey.js';

const base = extra => ({ initialized: true, workshop: { coinMinor: 4000, lifetimeFocusSeconds: 0 }, content, jobs: [], crew: [], unlocks: [], history: [], ...extra });
const unlocks = (...ids) => ids.map(unlockId => ({ unlockId }));
function job(recipeId, id = recipeId, spec = content.recipes.find(item => item.id === recipeId)) {
  return jobView({ id, recipeId, kind: spec.kind, status: 'making', reservedMaterialMinor: spec.materialMinor, specSnapshot: JSON.stringify(spec), progressSnapshot: initialProgress(spec), chosenFinish: 0, completedFinish: -1, appliedSeconds: 0, saleableSeconds: 0 });
}
const progressed = (item, seconds, worker = 'maker', stage) => jobView({ ...item, ...applyEffort(item, seconds, worker, stage).update });

test('navigation follows earned milestones and always retains an explicitly opened panel', () => {
  assert.deepEqual(visiblePanels({ initialized: false }), ['workshop']);
  assert.deepEqual(visiblePanels({ initialized: false }, 'community'), ['workshop', 'community']);
  assert.deepEqual(visiblePanels(base()), ['workshop', 'tasks', 'workbench']);
  assert.deepEqual(visiblePanels(base({ history: [{ mode: 'break', acceptedSeconds: 0 }] })), ['workshop', 'tasks', 'workbench', 'history']);
  const crafted = visiblePanels(base({ unlocks: unlocks('recipe:stool') }));
  assert.ok(crafted.includes('growth') && crafted.includes('showroom'));
  assert.ok(!crafted.includes('crew') && !crafted.includes('community'));
  assert.ok(visiblePanels(base({ unlocks: unlocks('carpenter-room') })).includes('crew'));
  assert.deepEqual(visiblePanels(base({ unlocks: unlocks('carpenter-room', 'craft-yard'), workshop: { lifetimeFocusSeconds: 60000 } })), ['workshop', 'tasks', 'workbench', 'crew', 'showroom', 'growth', 'community', 'history']);
});

test('next milestone counts distinct completed recipe categories, staff and paid construction truthfully', () => {
  const saved = base({ workshop: { coinMinor: 11900, lifetimeFocusSeconds: 3599 }, unlocks: unlocks('recipe:stool', 'recipe:stool', 'recipe:wooden-spoon') });
  const room = nextMilestone(saved);
  assert.equal(room.expansion.id, 'carpenter-room');
  assert.deepEqual(room.requirements.map(({ key, current, required, complete }) => ({ key, current, required, complete })), [
    { key: 'coins', current: 11900, required: 12000, complete: false },
    { key: 'focus', current: 3599, required: 3600, complete: false },
    { key: 'starterRecipes', current: 2, required: 3, complete: false },
  ]);
  const building = { id: 'room-build', kind: 'improvement', recipeId: 'carpenter-room', status: 'making' };
  assert.equal(nextMilestone(base({ jobs: [building], workshop: { coinMinor: 0 } })).requirements[0].complete, true, 'construction has already paid for materials');
  assert.equal(nextMilestone(base({ jobs: [building] })).current.id, building.id);
  const yard = expansionProgress(base({ workshop: { coinMinor: 60000, lifetimeFocusSeconds: 60000 }, unlocks: unlocks('forge', 'recipe:lantern', 'recipe:garden-bench') }), content.expansions.find(item => item.id === 'craft-yard'));
  assert.equal(yard.requirements.find(item => item.key === 'metalRecipes').current, 1);
  assert.equal(yard.requirements.find(item => item.key === 'mixedRecipes').current, 1);
  assert.equal(yard.requirements.find(item => item.key === 'activeWorker').complete, false);
  assert.equal(yard.requirements.find(item => item.key === 'unlock').complete, true);
  const training = { id: 'ivo', recipeId: 'blacksmith', kind: 'onboarding', status: 'making' };
  assert.equal(expansionProgress(base({ jobs: [training] }), yard.expansion).otherImprovement.id, 'ivo');
  assert.equal(nextMilestone(base({ unlocks: unlocks(...content.expansions.map(item => item.id)) })), null);
});

test('recipe advice advances unmet variety, respects skill gates and falls back to a free spoon', () => {
  const saved = base({ unlocks: unlocks('recipe:stool') });
  assert.equal(suggestedRecipe(saved).id, 'wooden-spoon');
  assert.equal(suggestedRecipe(base({ ...saved, unlocks: unlocks('recipe:stool', 'recipe:wooden-spoon') })).id, 'birdhouse');
  assert.equal(suggestedRecipe(base({ ...saved, workshop: { coinMinor: 0 } })).id, 'wooden-spoon');
  const advanced = base({ workshop: { coinMinor: 100000, lifetimeFocusSeconds: 30000 }, unlocks: unlocks('carpenter-room', 'joinery-bench', ...content.recipes.filter(item => !item.requiredUnlock).map(item => `recipe:${item.id}`)) });
  assert.equal(suggestedRecipe(advanced).id, 'dining-chair');
  const metal = base({ ...advanced, unlocks: unlocks(...advanced.unlocks.map(item => item.unlockId), 'forge', 'recipe:dining-chair'), crew: [{ staffId: 'blacksmith', status: 'onboarding' }] });
  assert.ok(!suggestedRecipe(metal).requiredStaff, 'onboarding cannot unlock metal advice');
  assert.equal(suggestedRecipe({ ...metal, crew: [{ staffId: 'blacksmith', status: 'active' }] }).id, 'hinge-set');
});

test('fallback recipes never claim to advance a different unmet variety requirement', () => {
  const advanced = base({ workshop: { coinMinor: 0, lifetimeFocusSeconds: 30000 }, unlocks: unlocks('carpenter-room', 'joinery-bench', 'recipe:wooden-spoon') });
  const fallback = suggestedRecipe(advanced);
  assert.equal(fallback.id, 'wooden-spoon');
  assert.equal(nextMilestone(advanced).expansion.id, 'forge');
  assert.equal(recipeAdvancesMilestone(advanced, fallback), false);
  const funded = { ...advanced, workshop: { ...advanced.workshop, coinMinor: 100000 } };
  assert.equal(suggestedRecipe(funded).id, 'dining-chair');
  assert.equal(recipeAdvancesMilestone(funded, suggestedRecipe(funded)), true);
});

test('time defaults follow remaining eligible work, while overflow uses actual settlement boundaries', () => {
  const stool = job('stool');
  const lane = { workerId: 'maker', jobId: stool.id, share: 100 };
  assert.equal(suggestedMinutes(stool, [lane]), 20);
  const partial = progressed(stool, 901);
  assert.equal(suggestedMinutes(partial, [lane]), 5);
  const spoon = job('wooden-spoon');
  assert.equal(suggestedMinutes(spoon, [{ ...lane, jobId: spoon.id }]), 5);
  const desk = job('writing-desk');
  assert.equal(suggestedMinutes(desk, [{ ...lane, jobId: desk.id }]), 25);
  assert.equal(plannedAllocation([lane], [stool], 1500)[0].bankedSeconds, 300);
  const advanced = job('dining-chair');
  const finisherLane = { workerId: 'finisher', jobId: advanced.id, share: 100 };
  const finishing = progressed(advanced, 2880);
  assert.equal(plannedAllocation([finisherLane], [finishing], 1500)[0].appliedSeconds, 720, 'specialist preview stops at its actual role boundary');
});

test('adding workers prefers eligible unused components on the chosen project and keeps dependency gates', () => {
  const garden = job('garden-bench');
  const lantern = job('lantern');
  const lanes = [{ workerId: 'maker', jobId: garden.id, stageId: 'wood', share: 100 }];
  assert.deepEqual(nextAssignment(lanes, [lantern, garden], ['maker', 'blacksmith']), { workerId: 'blacksmith', jobId: garden.id, stageId: 'metal' });
  const chest = job('reinforced-chest');
  assert.deepEqual(nextAssignment([{ ...lanes[0], jobId: chest.id }], [chest, lantern], ['maker', 'blacksmith']), { workerId: 'blacksmith', jobId: lantern.id });
  assert.equal(nextAssignment(lanes, [garden], ['maker', 'apprentice']), null, 'Ada cannot take joinery or a dependency-locked component');
  const split = [{ workerId: 'maker', jobId: garden.id, stageId: 'wood', share: 50 }, { workerId: 'blacksmith', jobId: garden.id, stageId: 'metal', share: 50 }];
  assert.deepEqual(plannedShares(split, 1500).map(item => item.seconds), [750, 750]);
  assert.deepEqual(plannedShares(split, 61).map(item => item.seconds), [31, 30], 'saved lane order breaks an odd-second tie');
  const triple = [...split.map((item, index) => ({ ...item, share: index ? 30 : 40 })), { workerId: 'apprentice', jobId: 'other', share: 30 }];
  assert.deepEqual(plannedShares(triple, 62).map(item => item.seconds), [25, 19, 18]);
  assert.equal(plannedShares(triple, 62).reduce((sum, item) => sum + item.seconds, 0), 62);
});

test('finishing quote uses the pinned spec, saleable state and correct next detail level for wood and mixed work', () => {
  const ready = progressed(job('stool'), 1200);
  assert.deepEqual(finishingValue(ready), { seconds: 900, current: 7200, final: 11700, increment: 4500 });
  const firstDetail = progressed(jobView({ ...ready, status: 'making', chosenFinish: 1 }), 900);
  assert.deepEqual(finishingValue(firstDetail), { seconds: 1200, current: 11700, final: 17700, increment: 6000 });
  const legacy = { ...content.recipes.find(item => item.id === 'stool'), workmanshipMinorPerSecond: 3 };
  const oldReady = progressed(job('stool', 'old-stool', legacy), 1200);
  assert.deepEqual(finishingValue(oldReady), { seconds: 900, current: 4800, final: 7500, increment: 2700 });
  let mixed = job('garden-bench');
  for (const [seconds, worker, stage] of [[4200, 'maker', 'wood'], [3600, 'blacksmith', 'metal'], [1800, 'maker', 'assemble']]) mixed = progressed(mixed, seconds, worker, stage);
  assert.equal(finishingValue(mixed).increment, 12000);
  assert.equal(finishingValue(mixed).seconds, 2400);
  assert.equal(finishingValue(job('stool')), null);
  assert.equal(finishingValue({ ...ready, completedFinish: undefined }), null);
});

test('sale receipt and replay display the actual awarded delta once, never an inferred market or commission payout', () => {
  const ready = progressed(job('stool'), 1200);
  const command = { operationId: 'sale-operation', kind: 'commission.deliver', jobId: ready.id };
  const receipt = { coinDeltaMinor: 7800, result: { jobId: ready.id, saleMinor: 99999 } };
  const actual = saleReceipt(command, receipt, [ready]);
  assert.equal(actual.coinDeltaMinor, 7800);
  assert.equal(actual.nameKey, 'sw.recipe.stool');
  assert.deepEqual(saleReceipt(command, structuredClone(receipt), [ready]), actual);
  assert.equal(saleReceipt(command, { result: { saleMinor: 7800 } }, [ready]), null);
  assert.equal(saleReceipt({ ...command, kind: 'job.keep' }, receipt, [ready]), null);
  assert.equal(saleReceipt(command, null, [ready]), null);
});
