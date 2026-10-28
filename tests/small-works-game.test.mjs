import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test, after } from 'node:test';
import { recipes } from '../lib/game/content.js';
import { integer, applyEffort, initialProgress, jobView, availableStages, validateCommand, readSpec } from '../lib/game/rules.js';
const previousDirectory = process.cwd(), scratch = mkdtempSync(path.join(os.tmpdir(), 'small-works-'));
process.chdir(path.join(import.meta.dirname, '..')); process.env.APP_DATA_FILE = path.join(scratch, 'app.db');
const { getWorkshopFor, executeWorkshopFor, operationReceiptFor, taskHistoryFor, productSourcesFor, modelAction, modelBatch, closeStorage } = await import('../lib/data/index.js');
after(async () => { await closeStorage(); process.chdir(previousDirectory); rmSync(scratch, { recursive: true, force: true }); });
let instant = Date.UTC(2026, 9, 28, 10);
const options = { now: () => instant }, advance = seconds => { instant += seconds * 1000; };
async function command(owner, kind, fields = {}) {
  const snapshot = await getWorkshopFor(owner, options);
  const result = await executeWorkshopFor(owner, { operationId: randomUUID(), revision: snapshot.revision, kind, ...fields }, options);
  assert.equal(result.ok, true, JSON.stringify(result.error)); return result;
}
async function newOwner() { const owner = randomUUID(); await command(owner, 'initialize'); return owner; }
async function focus(owner, seconds, jobId = null) {
  await command(owner, 'session.start', { mode: 'countup', jobId }); advance(seconds); return command(owner, 'session.settle');
}
async function object(owner, recipeId, detail = 0) {
  const jobId = (await command(owner, 'job.start', { recipeId })).receipt.result.jobId;
  const recipe = recipes.find(r => r.id === recipeId); await focus(owner, recipe.baseSeconds, jobId);
  for (let n = 1; n <= detail; n++) { await command(owner, 'job.detail', { jobId, detailId: `d${n}` }); await focus(owner, recipe.detailSeconds[n - 1], jobId); }
  return jobId;
}
function longestList(v) { return Array.isArray(v) ? Math.max(v.length, ...v.map(longestList)) : v && typeof v === 'object' ? Math.max(0, ...Object.values(v).map(longestList)) : 0; }
function countValues(v) { return Array.isArray(v) ? 1 + v.reduce((n, v) => n + countValues(v), 0) : v && typeof v === 'object' ? 2 + Object.values(v).reduce((n, v) => n + countValues(v), 0) : 1; }
async function bounded(work, { loseReply = false, loseRead = false, failAfterWrites = 0, inspectSteps } = {}) {
  const store = globalThis[Symbol.for('tellop.template.storage')]; assert.ok(store?.client);
  const key = Symbol.for('tellop.internalRecordsAction'); let calls = 0, concurrent = 0, lost = false, maxValues = 0, maxBytes = 0;
  process.env.TELLOP_INTERNAL_RECORDS = '1';
  globalThis[key] = async steps => {
    inspectSteps?.(steps);
    calls++; concurrent++; assert.ok(longestList(steps) <= 256); assert.ok(Buffer.byteLength(JSON.stringify(steps)) <= 1024 * 1024); assert.ok(calls <= 16, `records calls: ${calls}`); assert.ok(steps.length <= 32); assert.ok(concurrent <= 4);
    const run = async (client, step) => {
      assert.ok(step.args.select, 'named scalar fields');
      if (step.action === 'findMany') assert.ok(step.args.take <= 256);
      return await client[step.model[0].toLowerCase() + step.model.slice(1)][step.action](step.args);
    };
    try {
      if (lost && loseRead) throw new Error('records-unavailable');
      const values = steps.length === 1 ? [await run(store.client, steps[0])] : await store.client.$transaction(async client => {
        const results = []; for (const step of steps) { results.push(await run(client, step)); if (failAfterWrites && steps.some(step => ['create', 'update', 'delete'].includes(step.action)) && results.length === failAfterWrites) throw new Error('injected-transaction-failure'); } return results;
      });
      for (const v of values) { if (Array.isArray(v)) assert.ok(v.length <= 256); maxValues = Math.max(maxValues, countValues(v)); assert.ok(countValues(v) <= 2048); }
      maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(values)));
      assert.ok(Buffer.byteLength(JSON.stringify(values)) <= 256 * 1024);
      if (loseReply && steps.some(s => s.action === 'create') && !lost) { lost = true; throw new Error('records-delivery-uncertain'); }
      return values;
    } finally { concurrent--; }
  };
  try { return await work(); } finally { delete process.env.TELLOP_INTERNAL_RECORDS; delete globalThis[key]; assert.ok(calls <= 16, `complete request: ${calls} calls`); assert.ok(maxValues <= 2048); assert.ok(maxBytes <= 256 * 1024); }
}
test('reads never initialize and the forty-coin starting receipt is replay safe', async () => {
  const owner = randomUUID(); assert.equal((await getWorkshopFor(owner)).initialized, false); assert.equal((await getWorkshopFor(owner)).initialized, false);
  const request = { operationId: randomUUID(), revision: 0, kind: 'initialize' };
  const result = await executeWorkshopFor(owner, request, options); assert.equal(result.snapshot.workshop.coinMinor, 4000);
  assert.deepEqual((await executeWorkshopFor(owner, request, options)).receipt, result.receipt);
  assert.equal((await executeWorkshopFor(owner, { ...request, name: 'changed' })).error.code, 'operationReuse'); assert.equal((await getWorkshopFor(owner)).revision, 1);
});
test('stool commission pays 78 reaching 106 coins; a D2 stool pays 183 exactly once', async () => {
  const owner = await newOwner(), jobId = await object(owner, 'stool');
  const delivered = await command(owner, 'commission.deliver', { jobId, commissionId: 'first-stool' });
  assert.equal(delivered.receipt.result.saleMinor, 7800); assert.equal(delivered.snapshot.workshop.coinMinor, 10600);
  const secondOwner = await newOwner(), detailed = await object(secondOwner, 'stool', 2);
  const sale = await command(secondOwner, 'commission.deliver', { jobId: detailed, commissionId: 'first-stool' }); assert.equal(sale.receipt.result.saleMinor, 18300);
  assert.equal((await executeWorkshopFor(secondOwner, { operationId: randomUUID(), revision: sale.snapshot.revision, kind: 'job.sell', jobId: detailed })).ok, false);
});
test('all pinned starter and advanced recipes conserve split-session work and integer prices', () => {
  for (const recipe of recipes.filter(r => r.version === 1)) {
    assert.equal(recipe.stages.filter(s => s.finish === 0).reduce((n, s) => n + s.seconds, 0), recipe.baseSeconds);
    const job = { specSnapshot: JSON.stringify(recipe), progressSnapshot: '{"version":1,"seconds":0}', status: 'making', chosenFinish: 2, completedFinish: -1, appliedSeconds: 0, kind: 'object' };
    const seconds = recipe.baseSeconds + recipe.detailSeconds.reduce((a, b) => a + b), one = applyEffort(job, seconds);
    let split = job; for (let i = 0; i < seconds; i += 17) split = { ...split, ...applyEffort(split, Math.min(17, seconds - i)).update };
    assert.equal(split.progressSnapshot, one.update.progressSnapshot); assert.equal(one.update.saleableSeconds * 5 + recipe.materialMinor, seconds * 5 + recipe.materialMinor);
  }
});
test('pause excludes time, trim reduces effort, overflow banks, bank use does not create focus', async () => {
  const owner = await newOwner(), jobId = (await command(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  await command(owner, 'session.start', { mode: 'countup', jobId }); advance(130); await command(owner, 'session.pause'); advance(1000);
  await command(owner, 'session.resume'); advance(280); let result = await command(owner, 'session.trim', { seconds: 350 }); assert.equal(result.snapshot.session.candidateSeconds, 350);
  result = await command(owner, 'session.settle'); assert.equal(result.snapshot.workshop.bankSeconds, 50); assert.equal(result.snapshot.workshop.lifetimeFocusSeconds, 350);
  await command(owner, 'job.sell', { jobId }); const next = (await command(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  const allocation = await command(owner, 'job.allocate', { jobId: next, seconds: 50 }); assert.equal(allocation.snapshot.workshop.bankSeconds, 0);
  assert.equal(allocation.snapshot.workshop.lifetimeFocusSeconds, 350); assert.equal(allocation.snapshot.jobs.find(j => j.id === next).appliedSeconds, 50);
});
test('recovery and clock jumps cannot silently reward time; break and discard earn zero', async () => {
  const owner = await newOwner(); await command(owner, 'session.start', { mode: 'countdown', plannedSeconds: 60 });
  advance(-500); assert.equal((await getWorkshopFor(owner, options)).session.candidateSeconds, 0);
  advance(90000); assert.equal((await getWorkshopFor(owner, options)).session.candidateSeconds, 60);
  const recover = await command(owner, 'session.recover'); assert.equal(recover.snapshot.session.status, 'paused'); assert.equal(recover.snapshot.workshop.lifetimeFocusSeconds, 0);
  await command(owner, 'session.settle', { seconds: 20 }); await command(owner, 'session.start', { mode: 'break', plannedSeconds: 60 }); advance(60); await command(owner, 'session.settle');
  await command(owner, 'session.start', { mode: 'countup' }); advance(20000); assert.equal((await getWorkshopFor(owner, options)).session.candidateSeconds, 10800);
  assert.equal((await command(owner, 'session.discard')).snapshot.workshop.lifetimeFocusSeconds, 20);
});
test('abandoning detail preserves spent time; salvage refunds only materials once', async () => {
  const owner = await newOwner(), jobId = await object(owner, 'stool'); await command(owner, 'job.detail', { jobId, detailId: 'd1' }); await focus(owner, 111, jobId);
  const job = (await command(owner, 'job.abandon', { jobId })).snapshot.jobs.find(j => j.id === jobId);
  assert.equal(job.appliedSeconds, 1311); assert.equal(job.saleableSeconds, 1200); assert.equal(job.marketPriceMinor, 7200);
  const result = await command(owner, 'job.salvage', { jobId }); assert.equal(result.snapshot.workshop.coinMinor, 4000);
  assert.equal(result.snapshot.workshop.bankSeconds, 0); assert.equal(result.snapshot.workshop.lifetimeFocusSeconds, 1311);
  assert.equal((await executeWorkshopFor(owner, { kind: 'job.salvage', jobId, revision: result.snapshot.revision, operationId: randomUUID() })).ok, false);
});
test('room requires breadth, costs 120 coins and completes only after 1200 seconds', async () => {
  const owner = await newOwner(), initial = await getWorkshopFor(owner);
  assert.equal((await executeWorkshopFor(owner, { kind: 'room.expand', expansionId: 'carpenter-room', revision: initial.revision, operationId: randomUUID() })).error.code, 'requirements');
  for (const recipeId of ['stool', 'birdhouse', 'wooden-spoon', 'toy-boat']) {
    const jobId = await object(owner, recipeId);
    await command(owner, recipeId === 'stool' ? 'commission.deliver' : 'job.sell', { jobId, ...(recipeId === 'stool' ? { commissionId: 'first-stool' } : {}) });
  }
  const funded = await command(owner, 'room.expand', { expansionId: 'carpenter-room' }); assert.equal(funded.snapshot.workshop.coinMinor, 16600);
  assert.equal(funded.snapshot.unlocks.some(u => u.unlockId === 'carpenter-room'), false);
  const built = await focus(owner, 1200, funded.receipt.result.jobId); assert.equal(built.snapshot.workshop.lifetimeFocusSeconds, 6000);
  assert.equal(built.snapshot.workshop.coinMinor, 16600); assert.equal(built.snapshot.unlocks.some(u => u.unlockId === 'carpenter-room'), true);
});
test('forged owners, unknown fields and numeric boundaries refuse without state changes', async () => {
  const owner = await newOwner(), other = await newOwner(), jobId = (await command(other, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  const revision = (await getWorkshopFor(owner)).revision;
  for (const fields of [{ kind: 'job.sell', jobId }, { kind: 'initialize', coinMinor: 99999 },
    ...[0, 59, 61, 10801, 10860, -1, 1.5].map(plannedSeconds => ({ kind: 'session.start', mode: 'countdown', plannedSeconds })),
    { kind: 'session.start', mode: 'countup', ownerId: other }, { kind: 'session.start', mode: 'countup', intention: 'x'.repeat(241) }, { kind: 'session.start', mode: 'countup', timeZone: 'bad-zone' }]) {
    assert.equal((await executeWorkshopFor(owner, { operationId: randomUUID(), revision, ...fields })).ok, false); assert.equal((await getWorkshopFor(owner)).revision, revision);
  }
  for (const n of [-1, 2147483648, 0.1, NaN, Infinity]) assert.throws(() => integer(n)); assert.equal(integer(2147483647), 2147483647);
});
test('concurrent sale and commission share one revision winner with no partial payout', async () => {
  const owner = await newOwner(), jobId = await object(owner, 'stool'), revision = (await getWorkshopFor(owner)).revision;
  const results = await Promise.all([
    executeWorkshopFor(owner, { kind: 'job.sell', jobId, revision, operationId: randomUUID() }),
    executeWorkshopFor(owner, { kind: 'commission.deliver', commissionId: 'first-stool', jobId, revision, operationId: randomUUID() }),
  ]);
  assert.equal(results.filter(r => r.ok).length, 1); const snapshot = await getWorkshopFor(owner);
  assert.equal(snapshot.revision, revision + 1); assert.ok([10000, 10600].includes(snapshot.workshop.coinMinor));
  assert.equal((await modelAction('WorkshopOperation', 'findMany', { where: { ownerId: owner, revision: revision + 1 }, take: 2 })).length, 1);
});
test('a duplicate-key batch rolls back an earlier wallet write', async () => {
  const owner = await newOwner(), before = await getWorkshopFor(owner);
  await assert.rejects(modelBatch([
    { model: 'Workshop', action: 'update', args: { where: { ownerId: owner }, data: { coinMinor: 1 } } },
    { model: 'Workshop', action: 'create', args: { data: before.workshop } },
  ])); assert.equal((await getWorkshopFor(owner)).workshop.coinMinor, 4000);
});
test('bounded contained adapter reconciles lost settlement reply and real storage restart', async () => {
  const owner = await newOwner(); await command(owner, 'session.start', { mode: 'countup' }); advance(83);
  const revision = (await getWorkshopFor(owner)).revision, request = { kind: 'session.settle', revision, operationId: randomUUID() };
  const saved = await bounded(() => executeWorkshopFor(owner, request, options), { loseReply: true }); assert.equal(saved.ok, true); assert.equal(saved.receipt.result.acceptedSeconds, 83);
  await closeStorage(); assert.equal((await getWorkshopFor(owner)).workshop.bankSeconds, 83);
  assert.deepEqual((await bounded(() => executeWorkshopFor(owner, request, options))).receipt, saved.receipt); await bounded(() => getWorkshopFor(owner));
});
test('unknown save stays uncertain until receipt inspection; retry cannot award twice', async () => {
  const owner = await newOwner(), jobId = await object(owner, 'wooden-spoon'), revision = (await getWorkshopFor(owner)).revision;
  const request = { kind: 'job.sell', jobId, revision, operationId: randomUUID() };
  const unknown = await bounded(() => executeWorkshopFor(owner, request), { loseReply: true, loseRead: true }); assert.equal(unknown.error.code, 'uncertain');
  assert.equal((await operationReceiptFor(owner, request.operationId)).result.saleMinor, 1500); await bounded(() => executeWorkshopFor(owner, request));
  assert.equal((await getWorkshopFor(owner)).workshop.coinMinor, 5500);
});

test('all successful command paths fit one contained request, including snapshot refresh', async () => {
  const owner = await newOwner();
  async function run(kind, fields = {}) {
    const revision = (await getWorkshopFor(owner, options)).revision;
    const response = await bounded(() => executeWorkshopFor(owner, { kind, revision, operationId: randomUUID(), ...fields }, options));
    assert.equal(response.ok, true, JSON.stringify(response.error)); return response;
  }
  const jobId = (await run('job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  await run('session.start', { mode: 'countup', jobId }); advance(100);
  await run('session.pause'); await run('session.resume'); advance(250);
  await run('session.settle'); await run('job.detail', { jobId, detailId: 'd1' });
  await run('job.allocate', { jobId, seconds: 50 }); await run('job.abandon', { jobId });
  await run('job.keep', { jobId }); await run('job.sell', { jobId });
});
test('showroom pages retain every kept object and older objects still sell within bounds', async () => {
  const owner = await newOwner(); const ids = [];
  for (let n = 0; n < 14; n++) { const jobId = await object(owner, 'wooden-spoon'); ids.push(jobId); await command(owner, 'job.keep', { jobId }); }
  const first = await bounded(() => getWorkshopFor(owner)); assert.equal(first.jobs.length, 12); assert.ok(first.keptNextCursor);
  const second = await bounded(() => getWorkshopFor(owner, { keptBefore: first.keptNextCursor })); assert.equal(second.jobs.length, 2); assert.equal(second.keptNextCursor, null);
  assert.deepEqual(new Set([...first.jobs, ...second.jobs].map(j => j.id)), new Set(ids));
  const offPage = second.jobs[0].id;
  const sale = await bounded(() => executeWorkshopFor(owner, { kind: 'job.sell', jobId: offPage, revision: second.revision, operationId: randomUUID() }));
  assert.equal(sale.ok, true); assert.equal(sale.receipt.result.saleMinor, 1500); assert.equal(sale.snapshot, undefined);
  assert.equal((await getWorkshopFor(owner)).workshop.coinMinor, 5500);
});
test('two concurrent starts cannot leave two active sessions', async () => {
  const owner = await newOwner(), revision = (await getWorkshopFor(owner)).revision;
  const requests = [0, 1].map(() => ({ kind: 'session.start', mode: 'countup', revision, operationId: randomUUID() }));
  const results = await Promise.all(requests.map(request => executeWorkshopFor(owner, request, options)));
  assert.equal(results.filter(r => r.ok).length, 1);
  const sessions = await modelAction('FocusSession', 'findMany', { where: { ownerId: owner, status: 'running' }, take: 4 }); assert.equal(sessions.length, 1);
  assert.equal((await getWorkshopFor(owner)).workshop.activeSessionId, sessions[0].id);
});
test('part boundary forces settlement before another resume and all pauses remain non-awarding', async () => {
  const owner = await newOwner(); await command(owner, 'session.start', { mode: 'countup' });
  for (let n = 0; n < 32; n++) {
    advance(1); await command(owner, 'session.pause');
    if (n < 31) await command(owner, 'session.resume');
  }
  const snapshot = await getWorkshopFor(owner, options); assert.equal(snapshot.session.partCount, 32); assert.equal(snapshot.workshop.lifetimeFocusSeconds, 0);
  const refused = await executeWorkshopFor(owner, { kind: 'session.resume', revision: snapshot.revision, operationId: randomUUID() }, options); assert.equal(refused.error.code, 'limit');
  assert.equal((await command(owner, 'session.settle')).snapshot.workshop.bankSeconds, 32);
});
test('selected jobs remain held while running or paused; exact bounds and zero confirmation work', async () => {
  const owner = await newOwner(), jobId = (await command(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  await command(owner, 'session.start', { mode: 'countdown', plannedSeconds: 10800, jobId });
  const revision = (await getWorkshopFor(owner)).revision;
  for (const kind of ['job.salvage', 'job.detail', 'job.allocate']) {
    const result = await executeWorkshopFor(owner, { kind, jobId, revision, operationId: randomUUID(), ...(kind === 'job.detail' ? { detailId: 'd1' } : kind === 'job.allocate' ? { seconds: 1 } : {}) });
    assert.equal(result.error.code, 'sessionActive');
  }
  advance(10); const zero = await command(owner, 'session.settle', { seconds: 0 }); assert.equal(zero.snapshot.workshop.lifetimeFocusSeconds, 0);
  await command(owner, 'session.start', { mode: 'break', plannedSeconds: 3600 }); await command(owner, 'session.discard');
  await command(owner, 'session.start', { mode: 'countdown', plannedSeconds: 60 }); await command(owner, 'session.discard');
});

test('a workshop at zero coins can complete, sell and replace free offcut spoons', async () => {
  const owner = await newOwner();
  const first = await object(owner, 'keepsake-box'); await command(owner, 'job.keep', { jobId: first });
  const second = await object(owner, 'keepsake-box'); await command(owner, 'job.keep', { jobId: second });
  assert.equal((await getWorkshopFor(owner)).workshop.coinMinor, 0);
  const spoon = await object(owner, 'wooden-spoon');
  assert.equal((await command(owner, 'job.sell', { jobId: spoon })).snapshot.workshop.coinMinor, 1500);
});
test('a lost expansion funding reply charges once and cancelling returns only its deposit', async () => {
  const owner = await newOwner();
  for (const recipeId of ['stool', 'birdhouse', 'wooden-spoon', 'toy-boat']) {
    const jobId = await object(owner, recipeId); await command(owner, 'job.sell', { jobId });
  }
  const before = await getWorkshopFor(owner), request = { kind: 'room.expand', expansionId: 'carpenter-room', revision: before.revision, operationId: randomUUID() };
  const funded = await bounded(() => executeWorkshopFor(owner, request, options), { loseReply: true }); assert.equal(funded.ok, true);
  const replay = await executeWorkshopFor(owner, request, options); assert.deepEqual(replay.receipt, funded.receipt);
  assert.equal(replay.snapshot.workshop.coinMinor, before.workshop.coinMinor - 12000);
  await focus(owner, 100, funded.receipt.result.jobId);
  const cancel = await command(owner, 'job.salvage', { jobId: funded.receipt.result.jobId });
  assert.equal(cancel.snapshot.workshop.coinMinor, before.workshop.coinMinor); assert.equal(cancel.snapshot.workshop.bankSeconds, 0);
  assert.equal(cancel.snapshot.workshop.lifetimeFocusSeconds, before.workshop.lifetimeFocusSeconds + 100);
});

test('trim then resume retains the correct part evidence for future history by day', async () => {
  const owner = await newOwner(); await command(owner, 'session.start', { mode: 'countup', timeZone: 'Europe/Istanbul' });
  advance(100); await command(owner, 'session.pause'); await command(owner, 'session.resume');
  advance(100); await command(owner, 'session.trim', { seconds: 120 }); await command(owner, 'session.resume');
  advance(100); const settled = await command(owner, 'session.settle', { seconds: 200 });
  assert.equal(settled.snapshot.workshop.lifetimeFocusSeconds, 200);
  assert.deepEqual(JSON.parse(settled.snapshot.history[0].allocationSummary).spans, [100, 20, 80]);
});

async function carpenter(owner) {
  for (const recipeId of ['stool', 'birdhouse', 'wooden-spoon', 'toy-boat']) {
    const jobId = await object(owner, recipeId);
    await command(owner, recipeId === 'stool' ? 'commission.deliver' : 'job.sell', { jobId, ...(recipeId === 'stool' ? { commissionId: 'first-stool' } : {}) });
  }
  const room = await command(owner, 'room.expand', { expansionId: 'carpenter-room' });
  await focus(owner, 1200, room.receipt.result.jobId);
  const box = await object(owner, 'keepsake-box'); await command(owner, 'job.sell', { jobId: box });
}
async function boundedCommand(owner, kind, fields = {}) {
  const revision = (await getWorkshopFor(owner, options)).revision;
  const response = await bounded(() => executeWorkshopFor(owner, { operationId: randomUUID(), revision, kind, ...fields }, options));
  assert.equal(response.ok, true, JSON.stringify(response.error)); return response;
}
async function apprentice(owner) {
  await carpenter(owner);
  const welcome = await boundedCommand(owner, 'crew.welcome', { staffId: 'apprentice' });
  await focus(owner, 900, welcome.receipt.result.jobId);
  assert.equal((await getWorkshopFor(owner)).crew[0].status, 'active');
}
test('apprentice gates, atomic welcome, one refund and rerecruit preserve used time', async () => {
  const owner = await newOwner();
  let snapshot = await getWorkshopFor(owner);
  assert.equal((await executeWorkshopFor(owner, { kind: 'crew.welcome', staffId: 'apprentice', revision: snapshot.revision, operationId: randomUUID() })).error.code, 'requirements');
  await carpenter(owner); snapshot = await getWorkshopFor(owner);
  const requests = [0, 1].map(() => ({ kind: 'crew.welcome', staffId: 'apprentice', revision: snapshot.revision, operationId: randomUUID() }));
  const results = await Promise.all(requests.map(r => executeWorkshopFor(owner, r, options)));
  assert.equal(results.filter(r => r.ok).length, 1);
  const funded = results.find(r => r.ok), jobId = funded.receipt.result.jobId;
  snapshot = await getWorkshopFor(owner); assert.equal(snapshot.crew.length, 1); assert.equal(snapshot.crew[0].status, 'onboarding');
  assert.equal(snapshot.workshop.coinMinor, 18100);
  await focus(owner, 120, jobId);
  const cancelRequest = { kind: 'job.salvage', jobId, revision: (await getWorkshopFor(owner)).revision, operationId: randomUUID() };
  const cancelled = await bounded(() => executeWorkshopFor(owner, cancelRequest, options), { loseReply: true }); assert.ok(cancelled.ok);
  const replay = await bounded(() => executeWorkshopFor(owner, cancelRequest, options)); assert.ok(replay.replayed);
  assert.equal(replay.snapshot.workshop.coinMinor, 27100); assert.equal(replay.snapshot.workshop.lifetimeFocusSeconds, 8220);
  assert.equal(replay.snapshot.crew[0].status, 'cancelled');
  const next = await boundedCommand(owner, 'crew.welcome', { staffId: 'apprentice' });
  assert.notEqual(next.receipt.result.jobId, jobId); assert.equal(next.snapshot.crew.length, 1);
  assert.equal(next.snapshot.workshop.coinMinor, 18100);
  await focus(owner, 900, next.receipt.result.jobId);
  snapshot = await getWorkshopFor(owner); assert.equal(snapshot.crew[0].status, 'active');
  assert.equal((await executeWorkshopFor(owner, { kind: 'crew.welcome', staffId: 'apprentice', revision: snapshot.revision, operationId: randomUUID() })).error.code, 'jobState');
  assert.equal((await executeWorkshopFor(owner, { kind: 'job.salvage', jobId: next.receipt.result.jobId, revision: snapshot.revision, operationId: randomUUID() })).error.code, 'jobState');
});
test('60/40 conserves odd seconds across pauses, edits and retained trimming with fixed identities', async () => {
  const owner = await newOwner(); await apprentice(owner);
  const a = (await command(owner, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  const b = (await command(owner, 'job.start', { recipeId: 'birdhouse' })).receipt.result.jobId;
  const lanes = [{ workerId: 'maker', jobId: a, share: 60 }, { workerId: 'apprentice', jobId: b, share: 40 }];
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes });
  for (let i = 0; i < 3; i++) { advance(1); await boundedCommand(owner, 'session.pause'); if (i < 2) await boundedCommand(owner, 'session.resume'); }
  let snapshot = await getWorkshopFor(owner, options); assert.deepEqual(snapshot.session.allocationPreview.map(l => l.seconds), [2, 1]);
  for (const jobId of [a, b]) assert.equal((await executeWorkshopFor(owner, { kind: 'job.salvage', jobId, revision: snapshot.revision, operationId: randomUUID() })).error.code, 'sessionActive');
  await boundedCommand(owner, 'session.shares', { shares: [20, 80] });
  await boundedCommand(owner, 'session.resume'); advance(7); await boundedCommand(owner, 'session.pause');
  snapshot = await getWorkshopFor(owner, options); assert.deepEqual(snapshot.session.allocationPreview.map(l => l.seconds), [3, 7]);
  await boundedCommand(owner, 'session.trim', { seconds: 5 });
  await boundedCommand(owner, 'session.shares', { shares: [60, 40] });
  await boundedCommand(owner, 'session.resume'); advance(5);
  const settled = await boundedCommand(owner, 'session.settle', { seconds: 8 });
  // Retain 3 old seconds at60%,2 at20%,3 new at60%: first quota400/100.
  assert.deepEqual(settled.receipt.result.allocations.map(l => l.seconds), [4, 4]);
  assert.equal(settled.snapshot.crew[0].allocatedSeconds, 4);
  assert.equal(settled.snapshot.workshop.lifetimeFocusSeconds, 9008);
  assert.deepEqual(JSON.parse(settled.snapshot.history[0].allocationSummary).spans, [1, 1, 1, 2, 3]);
});
test('each lane banks its own overflow and bank application awards experience once without new time', async () => {
  const owner = await newOwner(); await apprentice(owner);
  const a = (await command(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  const b = (await command(owner, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes: [{ workerId: 'maker', jobId: a, share: 60 }, { workerId: 'apprentice', jobId: b, share: 40 }] });
  advance(1001); const settled = await boundedCommand(owner, 'session.settle');
  assert.deepEqual(settled.receipt.result.allocations.map(l => [l.seconds, l.appliedSeconds, l.bankedSeconds]), [[601, 300, 301], [400, 400, 0]]);
  assert.equal(settled.snapshot.crew[0].allocatedSeconds, 400);
  const request = { kind: 'job.allocate', jobId: b, workerId: 'apprentice', seconds: 301, revision: settled.snapshot.revision, operationId: randomUUID() };
  const first = await bounded(() => executeWorkshopFor(owner, request, options), { loseReply: true }); assert.ok(first.ok);
  const second = await bounded(() => executeWorkshopFor(owner, request, options));
  assert.equal(second.snapshot.crew[0].allocatedSeconds, 701); assert.equal(second.snapshot.workshop.lifetimeFocusSeconds, 10001);
  assert.equal(second.snapshot.workshop.bankSeconds, 0);
});
test('worker, lane, role and share forgery cannot change balances or allocate', async () => {
  const owner = await newOwner(); await carpenter(owner);
  const welcome = await command(owner, 'crew.welcome', { staffId: 'apprentice' });
  let revision = welcome.snapshot.revision;
  const a = welcome.receipt.result.jobId;
  let bad = await executeWorkshopFor(owner, { operationId: randomUUID(), revision, kind: 'session.start', mode: 'countup', lanes: [{ workerId: 'apprentice', jobId: a, share: 100 }] });
  assert.equal(bad.error.code, 'workerUnavailable');
  await focus(owner, 900, a);
  const b = (await command(owner, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  const c = (await command(owner, 'job.start', { recipeId: 'birdhouse' })).receipt.result.jobId;
  const snapshot = await getWorkshopFor(owner); revision = snapshot.revision;
  for (const lanes of [
    [{ workerId: 'maker', jobId: b, share: 60 }, { workerId: 'maker', jobId: c, share: 40 }],
    [{ workerId: 'maker', jobId: b, share: 60 }, { workerId: 'apprentice', jobId: b, share: 40 }],
    [{ workerId: 'maker', jobId: b, share: 65 }, { workerId: 'apprentice', jobId: c, share: 35 }],
    [{ workerId: 'maker', jobId: b, share: 60 }, { workerId: 'apprentice', jobId: c, share: 50 }],
    [{ workerId: 'maker', jobId: b, share: 0 }, { workerId: 'apprentice', jobId: c, share: 100 }],
    [{ workerId: 'stranger', jobId: b, share: 100 }],
  ]) assert.equal((await executeWorkshopFor(owner, { operationId: randomUUID(), revision, kind: 'session.start', mode: 'countup', lanes })).ok, false);
  assert.deepEqual((await getWorkshopFor(owner)).workshop, snapshot.workshop);
  await command(owner, 'session.start', { mode: 'countup', jobId: b });
  revision = (await getWorkshopFor(owner)).revision;
  assert.equal((await executeWorkshopFor(owner, { operationId: randomUUID(), revision, kind: 'session.shares', shares: [100] })).error.code, 'sessionState');
  await command(owner, 'session.discard');
});
test('honest solvent route completes joinery and all advanced base and detailed work', async () => {
  const owner = await newOwner(); await apprentice(owner);
  let snapshot = await getWorkshopFor(owner);
  assert.equal((await executeWorkshopFor(owner, { operationId: randomUUID(), revision: snapshot.revision, kind: 'job.start', recipeId: 'dining-chair' })).error.code, 'requirements');
  assert.equal((await executeWorkshopFor(owner, { operationId: randomUUID(), revision: snapshot.revision, kind: 'room.expand', expansionId: 'joinery-bench' })).error.code, 'requirements');
  const shelf = await object(owner, 'wall-shelf'); await command(owner, 'job.sell', { jobId: shelf });
  const detailedStool = await object(owner, 'stool', 2); await command(owner, 'job.sell', { jobId: detailedStool });
  const bench = await boundedCommand(owner, 'room.expand', { expansionId: 'joinery-bench' });
  assert.ok(bench.snapshot.workshop.coinMinor >= 0); assert.ok(!bench.snapshot.unlocks.some(u => u.unlockId === 'joinery-bench'));
  assert.equal((await executeWorkshopFor(owner, { operationId: randomUUID(), revision: bench.snapshot.revision, kind: 'session.start', mode: 'countup', lanes: [{ workerId: 'apprentice', jobId: bench.receipt.result.jobId, share: 100 }] })).error.code, 'workerRole');
  await focus(owner, 1800, bench.receipt.result.jobId);
  for (const recipeId of ['dining-chair', 'writing-desk', 'cabinet']) {
    const start = await boundedCommand(owner, 'job.start', { recipeId }); const jobId = start.receipt.result.jobId;
    const spec = recipes.find(r => r.id === recipeId);
    assert.equal((await executeWorkshopFor(owner, { operationId: randomUUID(), revision: start.snapshot.revision, kind: 'session.start', mode: 'countup', lanes: [{ workerId: 'apprentice', jobId, share: 100 }] })).error.code, 'workerRole');
    await focus(owner, spec.baseSeconds, jobId);
    for (const [index, seconds] of spec.detailSeconds.entries()) { await command(owner, 'job.detail', { jobId, detailId: `d${index + 1}` }); await focus(owner, seconds, jobId); }
    const sale = await boundedCommand(owner, 'job.sell', { jobId });
    assert.equal(sale.receipt.result.saleMinor, spec.materialMinor + (spec.baseSeconds + spec.detailSeconds[0] + spec.detailSeconds[1]) * 5);
    assert.ok(sale.snapshot.workshop.coinMinor > 0);
  }
});
test('old v1 plan, spans and pinned recipes read without rewrites and settle unchanged', async () => {
  const owner = await newOwner(), jobId = (await command(owner, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  await command(owner, 'session.start', { mode: 'countup', jobId }); advance(3); await command(owner, 'session.pause');
  const snapshot = await getWorkshopFor(owner), sessionId = snapshot.session.id;
  const legacy = { currentPlan: JSON.stringify({ version: 1, jobId, workerId: 'maker' }), allocationSummary: JSON.stringify({ version: 1, appliedSeconds: 0, bankSeconds: 0, spans: [3] }) };
  await modelAction('FocusSession', 'update', { where: { id: sessionId }, data: legacy });
  await bounded(() => getWorkshopFor(owner, options));
  const stored = await modelAction('FocusSession', 'findFirst', { where: { id: sessionId } });
  assert.equal(stored.currentPlan, legacy.currentPlan); assert.equal(stored.allocationSummary, legacy.allocationSummary);
  await command(owner, 'session.shares', { shares: [100] }); await command(owner, 'session.resume'); advance(2);
  const settled = await boundedCommand(owner, 'session.settle'); assert.equal(settled.receipt.result.allocations[0].appliedSeconds, 5);
  assert.equal(settled.snapshot.jobs.find(j => j.id === jobId).appliedSeconds, 5);
});
test('failed welcome batch rolls back deposit, job, receipt and crew together', async () => {
  const owner = await newOwner(); await carpenter(owner); const before = await getWorkshopFor(owner);
  const request = { kind: 'crew.welcome', staffId: 'apprentice', operationId: randomUUID(), revision: before.revision };
  const failed = await bounded(() => executeWorkshopFor(owner, request, options), { failAfterWrites: 3 });
  assert.equal(failed.ok, false);
  const after = await getWorkshopFor(owner); assert.deepEqual(after.workshop, before.workshop); assert.deepEqual(after.crew, []);
  assert.equal(after.jobs.some(j => j.kind === 'onboarding'), false); assert.equal(await operationReceiptFor(owner, request.operationId), null);
  const retry = await bounded(() => executeWorkshopFor(owner, request, options)); assert.equal(retry.ok, true);
  assert.equal(retry.snapshot.workshop.coinMinor, before.workshop.coinMinor - 9000); assert.equal(retry.snapshot.crew.length, 1);
});
test('concurrent dual-lane settlement awards a single pool and apprentice experience once', async () => {
  const owner = await newOwner(); await apprentice(owner);
  const a = (await command(owner, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  const b = (await command(owner, 'job.start', { recipeId: 'birdhouse' })).receipt.result.jobId;
  await command(owner, 'session.start', { mode: 'countup', lanes: [{ workerId: 'maker', jobId: a, share: 60 }, { workerId: 'apprentice', jobId: b, share: 40 }] });
  advance(101); const revision = (await getWorkshopFor(owner)).revision;
  const requests = [0, 1].map(() => ({ kind: 'session.settle', revision, operationId: randomUUID() }));
  const results = await Promise.all(requests.map(r => executeWorkshopFor(owner, r, options)));
  assert.equal(results.filter(r => r.ok).length, 1);
  const snapshot = await getWorkshopFor(owner); assert.equal(snapshot.workshop.lifetimeFocusSeconds, 9101); assert.equal(snapshot.crew[0].allocatedSeconds, 40);
  assert.equal(snapshot.jobs.find(j => j.id === a).appliedSeconds, 61); assert.equal(snapshot.jobs.find(j => j.id === b).appliedSeconds, 40);
  const won = requests[results.findIndex(r => r.ok)]; assert.equal((await bounded(() => executeWorkshopFor(owner, won, options))).replayed, true);
  assert.equal((await getWorkshopFor(owner)).crew[0].allocatedSeconds, 40);
});
test('two lanes, 32 varied spans and full postread remain bounded; clock jumps only count accepted time', async () => {
  const owner = await newOwner(); await apprentice(owner);
  const a = (await command(owner, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  const b = (await command(owner, 'job.start', { recipeId: 'birdhouse' })).receipt.result.jobId;
  await boundedCommand(owner, 'session.start', { mode: 'countdown', plannedSeconds: 60, lanes: [{ workerId: 'maker', jobId: a, share: 60 }, { workerId: 'apprentice', jobId: b, share: 40 }] });
  advance(-100); assert.equal((await getWorkshopFor(owner, options)).session.candidateSeconds, 0);
  advance(100);
  for (let n = 0; n < 32; n++) {
    advance(1); await boundedCommand(owner, 'session.pause');
    if (n < 31) { await boundedCommand(owner, 'session.shares', { shares: n % 2 ? [60, 40] : [40, 60] }); await boundedCommand(owner, 'session.resume'); }
  }
  const saved = await boundedCommand(owner, 'session.settle');
  assert.equal(saved.receipt.result.allocations.reduce((n, l) => n + l.seconds, 0), 32);
  await boundedCommand(owner, 'session.start', { mode: 'countdown', plannedSeconds: 60, lanes: [{ workerId: 'maker', jobId: a, share: 60 }, { workerId: 'apprentice', jobId: b, share: 40 }] });
  advance(100000); const recover = await boundedCommand(owner, 'session.recover'); assert.equal(recover.snapshot.session.candidateSeconds, 60);
  const trimmed = await boundedCommand(owner, 'session.settle', { seconds: 3 });
  assert.deepEqual(trimmed.receipt.result.allocations.map(l => l.seconds), [2, 1]); assert.equal(trimmed.snapshot.workshop.lifetimeFocusSeconds, 9035);
});
test('dual lanes finishing the same new recipe create one unlock and retry without duplicate work', async () => {
  const owner = await newOwner(); await apprentice(owner);
  const a = (await command(owner, 'job.start', { recipeId: 'wall-shelf' })).receipt.result.jobId;
  const b = (await command(owner, 'job.start', { recipeId: 'wall-shelf' })).receipt.result.jobId;
  const before = await getWorkshopFor(owner);
  assert.equal(before.unlocks.some(u => u.unlockId === 'recipe:wall-shelf'), false);
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes: [{ workerId: 'maker', jobId: a, share: 50 }, { workerId: 'apprentice', jobId: b, share: 50 }] });
  advance(4800);
  const request = { kind: 'session.settle', revision: (await getWorkshopFor(owner)).revision, operationId: randomUUID() };
  const settled = await bounded(() => executeWorkshopFor(owner, request, options));
  assert.equal(settled.ok, true, JSON.stringify(settled.error));
  assert.deepEqual(settled.receipt.result.allocations.map(l => [l.seconds, l.appliedSeconds, l.bankedSeconds]), [[2400, 2400, 0], [2400, 2400, 0]]);
  assert.equal(settled.snapshot.unlocks.filter(u => u.unlockId === 'recipe:wall-shelf').length, 1);
  assert.equal(settled.snapshot.workshop.lifetimeFocusSeconds, before.workshop.lifetimeFocusSeconds + 4800);
  assert.equal(settled.snapshot.crew[0].allocatedSeconds, 2400);
  for (const jobId of [a, b]) assert.equal(settled.snapshot.jobs.find(j => j.id === jobId).status, 'ready');
  const replay = await bounded(() => executeWorkshopFor(owner, request, options));
  assert.equal(replay.replayed, true); assert.deepEqual(replay.receipt, settled.receipt);
  assert.deepEqual(replay.snapshot.workshop, settled.snapshot.workshop);
  assert.equal(replay.snapshot.crew[0].allocatedSeconds, 2400);
  assert.equal(replay.snapshot.unlocks.filter(u => u.unlockId === 'recipe:wall-shelf').length, 1);
  const allocations = await modelAction('FocusAllocation', 'findMany', { where: { ownerId: owner, sourceKind: 'session', sourceId: settled.receipt.result.sessionId }, take: 8 });
  assert.equal(allocations.length, 2); assert.equal(allocations.reduce((n, row) => n + row.seconds, 0), 4800);
});

async function refuse(owner, kind, fields, code) {
  const before = await getWorkshopFor(owner, options);
  const result = await bounded(() => executeWorkshopFor(owner, { operationId: randomUUID(), revision: before.revision, kind, ...fields }, options));
  assert.equal(result.ok, false); if (code) assert.equal(result.error.code, code);
  assert.deepEqual((await getWorkshopFor(owner, options)).workshop, before.workshop);
}
async function joinery(owner, withApprentice = true) {
  if (withApprentice) await apprentice(owner); else await carpenter(owner);
  for (const [recipeId, detail] of [['wall-shelf', 0], ['stool', 2]]) {
    await command(owner, 'job.sell', { jobId: await object(owner, recipeId, detail) });
  }
  if (!withApprentice) await focus(owner, 900);
  const bench = await boundedCommand(owner, 'room.expand', { expansionId: 'joinery-bench' });
  await focus(owner, 1800, bench.receipt.result.jobId);
}
async function workingForge(owner, withApprentice = true) {
  await joinery(owner, withApprentice);
  for (const recipeId of ['writing-desk', 'dining-chair', 'cabinet']) await command(owner, 'job.sell', { jobId: await object(owner, recipeId) });
  const forge = await boundedCommand(owner, 'room.expand', { expansionId: 'forge' });
  await focus(owner, 3600, forge.receipt.result.jobId);
  const welcome = await boundedCommand(owner, 'crew.welcome', { staffId: 'blacksmith' });
  await focus(owner, 1200, welcome.receipt.result.jobId);
  return getWorkshopFor(owner, options);
}
async function stageFocus(owner, jobId, workerId, seconds, stageId) {
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes: [{ workerId, jobId, share: 100, ...(stageId ? { stageId } : {}) }] });
  advance(seconds); return boundedCommand(owner, 'session.settle');
}

test('normal solvent route reaches forge and Ivo at 625 minutes and 576 coins, then sells all seven new D2 recipes', async () => {
  const owner = await newOwner(), ready = await workingForge(owner);
  assert.equal(ready.workshop.lifetimeFocusSeconds, 625 * 60); assert.equal(ready.workshop.coinMinor, 57600);
  assert.equal(ready.crew.find(c => c.staffId === 'blacksmith').status, 'active');
  for (const spec of recipes.filter(r => r.version === 2)) {
    const start = await boundedCommand(owner, 'job.start', { recipeId: spec.id }), jobId = start.receipt.result.jobId;
    assert.equal(start.snapshot.jobs.find(j => j.id === jobId).reservedMaterialMinor, spec.materialMinor);
    for (let finish = 0; finish <= 2; finish++) {
      if (finish) await boundedCommand(owner, 'job.detail', { jobId, detailId: `d${finish}` });
      for (const stage of spec.stages.filter(s => s.finish === finish)) {
        const worker = ['metal', 'metal-finishing'].includes(stage.role) ? 'blacksmith' : 'maker';
        await stageFocus(owner, jobId, worker, stage.seconds, spec.mixed ? stage.id : undefined);
      }
      const job = (await getWorkshopFor(owner)).jobs.find(j => j.id === jobId);
      assert.equal(job.status, 'ready'); assert.equal(job.completedFinish, finish);
    }
    const sold = await boundedCommand(owner, 'job.sell', { jobId });
    assert.equal(sold.receipt.result.saleMinor, spec.materialMinor + 5 * (spec.baseSeconds + spec.detailSeconds.reduce((a, b) => a + b, 0)));
    assert.ok(sold.snapshot.workshop.coinMinor > 0);
  }
});

test('forge gates, one construction/onboarding and blacksmith reservation/refund remain atomic', async () => {
  const owner = await newOwner(); await joinery(owner);
  await refuse(owner, 'room.expand', { expansionId: 'forge' }, 'requirements');
  await focus(owner, 10800); await focus(owner, 1500);
  await refuse(owner, 'room.expand', { expansionId: 'forge' }, 'requirements');
  await command(owner, 'job.sell', { jobId: await object(owner, 'dining-chair', 2) });
  const built = await boundedCommand(owner, 'room.expand', { expansionId: 'forge' }), jobId = built.receipt.result.jobId;
  assert.equal(built.receipt.coinDeltaMinor, -36000);
  await refuse(owner, 'crew.welcome', { staffId: 'blacksmith' }, 'requirements');
  await refuse(owner, 'job.start', { recipeId: 'hinge-set' }, 'requirements');
  await focus(owner, 3599, jobId); assert.ok(!(await getWorkshopFor(owner)).unlocks.some(u => u.unlockId === 'forge'));
  await focus(owner, 1, jobId);
  const welcome = await boundedCommand(owner, 'crew.welcome', { staffId: 'blacksmith' }), onboarding = welcome.receipt.result.jobId;
  assert.equal(welcome.receipt.coinDeltaMinor, -16000);
  await refuse(owner, 'job.start', { recipeId: 'hinge-set' }, 'requirements');
  await refuse(owner, 'crew.welcome', { staffId: 'blacksmith' }, 'jobState');
  await refuse(owner, 'session.start', { mode: 'countup', lanes: [{ workerId: 'blacksmith', jobId: onboarding, share: 100 }] }, 'workerUnavailable');
  await focus(owner, 40, onboarding);
  const revision = (await getWorkshopFor(owner)).revision, request = { kind: 'job.salvage', jobId: onboarding, revision, operationId: randomUUID() };
  const cancelled = await bounded(() => executeWorkshopFor(owner, request, options), { loseReply: true });
  assert.equal(cancelled.receipt.coinDeltaMinor, 16000);
  const replay = await bounded(() => executeWorkshopFor(owner, request, options)); assert.equal(replay.replayed, true);
  assert.equal(replay.snapshot.crew.find(c => c.staffId === 'blacksmith').status, 'cancelled');
  await refuse(owner, 'job.salvage', { jobId: onboarding }, 'jobState');
  const again = await boundedCommand(owner, 'crew.welcome', { staffId: 'blacksmith' });
  await focus(owner, 1200, again.receipt.result.jobId);
  assert.equal((await getWorkshopFor(owner)).crew.filter(c => c.staffId === 'blacksmith').length, 1);
  // An eligible unstaffed apprentice cannot be recruited while construction is in progress.
  const other = await newOwner(); await carpenter(other); await focus(other, 10800);
  await command(other, 'job.sell', { jobId: await object(other, 'wall-shelf') });
  const construction = await command(other, 'room.expand', { expansionId: 'joinery-bench' });
  await refuse(other, 'crew.welcome', { staffId: 'apprentice' }, 'jobState');
  await command(other, 'job.salvage', { jobId: construction.receipt.result.jobId });
  await command(other, 'crew.welcome', { staffId: 'apprentice' });
  await refuse(other, 'room.expand', { expansionId: 'joinery-bench' }, 'jobState');
});

test('same-job independent lanes merge one write, bank overflow, preview exactly, and defer assembly to saved prerequisites', async () => {
  const owner = await newOwner(); await workingForge(owner);
  const jobId = (await boundedCommand(owner, 'job.start', { recipeId: 'garden-bench' })).receipt.result.jobId;
  const lanes = [{ workerId: 'maker', jobId, stageId: 'wood', share: 50 }, { workerId: 'blacksmith', jobId, stageId: 'metal', share: 50 }];
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes }); advance(10800);
  const before = await getWorkshopFor(owner, options), preview = before.session.allocationPreview;
  assert.deepEqual(preview.map(l => [l.seconds, l.appliedSeconds, l.bankedSeconds]), [[5400, 4200, 1200], [5400, 3600, 1800]]);
  let jobWrites = 0;
  const request = { kind: 'session.settle', operationId: randomUUID(), revision: before.revision };
  const saved = await bounded(() => executeWorkshopFor(owner, request, options), { inspectSteps: steps => { jobWrites += steps.filter(s => s.model === 'WorkJob' && s.action === 'update').length; } });
  assert.equal(jobWrites, 1); assert.equal(saved.ok, true);
  assert.deepEqual(saved.receipt.result.allocations.map(l => [l.appliedSeconds, l.bankedSeconds]), preview.map(l => [l.appliedSeconds, l.bankedSeconds]));
  let job = saved.snapshot.jobs.find(j => j.id === jobId);
  assert.equal(job.progressSeconds, 7800); assert.equal(job.stages.find(s => s.id === 'assemble').appliedSeconds, 0);
  assert.equal(job.stages.find(s => s.id === 'assemble').available, true); assert.equal(job.completedFinish, -1);
  assert.equal(saved.snapshot.workshop.bankSeconds, 3000); assert.equal(saved.snapshot.crew.find(c => c.staffId === 'blacksmith').allocatedSeconds, 3600);
  const bank = await boundedCommand(owner, 'job.allocate', { jobId, stageId: 'assemble', workerId: 'maker', seconds: 3000 });
  job = bank.snapshot.jobs.find(j => j.id === jobId); assert.equal(job.status, 'ready'); assert.equal(job.progressSeconds, 9600);
  assert.equal(bank.snapshot.workshop.bankSeconds, 1200); assert.equal(bank.snapshot.workshop.lifetimeFocusSeconds, saved.snapshot.workshop.lifetimeFocusSeconds);
  assert.equal((await bounded(() => executeWorkshopFor(owner, request, options))).replayed, true);
  await boundedCommand(owner, 'job.detail', { jobId, detailId: 'd1' });
  await boundedCommand(owner, 'job.allocate', { jobId, stageId: 'd1', seconds: 100 });
  const abandoned = await boundedCommand(owner, 'job.abandon', { jobId });
  job = abandoned.snapshot.jobs.find(j => j.id === jobId);
  assert.equal(job.progressSeconds, 9600); assert.equal(job.appliedSeconds, 9700); assert.equal(job.marketPriceMinor, 57600);
  await boundedCommand(owner, 'job.keep', { jobId }); await boundedCommand(owner, 'job.sell', { jobId });
});

test('forged stages, specialist roles, dependent targets, owner targets and nonmixed target tricks refuse unchanged', async () => {
  const owner = await newOwner(); await workingForge(owner);
  const chest = (await command(owner, 'job.start', { recipeId: 'reinforced-chest' })).receipt.result.jobId;
  const metal = (await command(owner, 'job.start', { recipeId: 'hinge-set' })).receipt.result.jobId;
  const stool = (await command(owner, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  const other = await newOwner(), foreign = (await command(other, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  const lane = (jobId, workerId, stageId) => ({ jobId, workerId, share: 100, ...(stageId === undefined ? {} : { stageId }) });
  for (const [target, code] of [
    [lane(chest, 'maker'), 'stageRequired'], [lane(chest, 'maker', 'unknown'), 'stageUnavailable'],
    [lane(chest, 'blacksmith', 'metal'), 'stageUnavailable'], [lane(chest, 'maker', 'assemble'), 'stageUnavailable'],
    [lane(chest, 'blacksmith', 'wood'), 'workerRole'], [lane(chest, 'apprentice', 'wood'), 'workerRole'],
    [lane(metal, 'maker'), 'workerRole'], [lane(stool, 'blacksmith'), 'workerRole'],
    [lane(stool, 'maker', 'assemble'), 'stageUnavailable'], [lane(stool, 'maker', 'unknown'), 'stageUnavailable'],
    [lane(foreign, 'maker'), 'notFound'],
  ]) await refuse(owner, 'session.start', { mode: 'countup', lanes: [target] }, code);
  await refuse(owner, 'session.start', { mode: 'countup', lanes: [{ ...lane(chest, 'maker', 'wood'), share: 50 }, { ...lane(chest, 'blacksmith', 'wood'), share: 50 }] }, 'lanes');
  await focus(owner, 100);
  await refuse(owner, 'job.allocate', { jobId: chest, seconds: 50 }, 'stageRequired');
  await refuse(owner, 'job.allocate', { jobId: chest, stageId: 'metal', workerId: 'blacksmith', seconds: 50 }, 'stageUnavailable');
  const wood = await stageFocus(owner, chest, 'maker', 5000, 'wood');
  assert.equal(wood.receipt.result.allocations[0].appliedSeconds, 3600); assert.equal(wood.receipt.result.allocations[0].bankedSeconds, 1400);
  assert.equal(wood.snapshot.jobs.find(j => j.id === chest).stages.find(s => s.id === 'metal').appliedSeconds, 0);
  await refuse(owner, 'job.allocate', { jobId: chest, stageId: 'metal', seconds: 50 }, 'workerRole');
  await stageFocus(owner, chest, 'blacksmith', 1200, 'metal');
  await stageFocus(owner, chest, 'maker', 1200, 'assemble');
});

test('same-job rounding, trim, held targets, lost replies and concurrency award one pool and experience once', async () => {
  const owner = await newOwner(); await workingForge(owner);
  const jobId = (await command(owner, 'job.start', { recipeId: 'standing-lamp' })).receipt.result.jobId;
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes: [{ jobId, stageId: 'wood', workerId: 'maker', share: 60 }, { jobId, stageId: 'metal', workerId: 'blacksmith', share: 40 }] });
  advance(3); await boundedCommand(owner, 'session.pause');
  for (const kind of ['job.salvage', 'job.detail', 'job.allocate', 'job.sell']) await refuse(owner, kind, { jobId, ...(kind === 'job.allocate' ? { stageId: 'wood', seconds: 1 } : kind === 'job.detail' ? { detailId: 'd1' } : {}) }, 'sessionActive');
  await boundedCommand(owner, 'session.shares', { shares: [20, 80] }); await boundedCommand(owner, 'session.resume'); advance(7);
  await boundedCommand(owner, 'session.trim', { seconds: 5 }); await boundedCommand(owner, 'session.shares', { shares: [60, 40] });
  await boundedCommand(owner, 'session.resume'); advance(5);
  const before = await getWorkshopFor(owner, options), request = { kind: 'session.settle', seconds: 8, operationId: randomUUID(), revision: before.revision };
  const saved = await bounded(() => executeWorkshopFor(owner, request, options), { loseReply: true }); assert.ok(saved.ok);
  assert.deepEqual(saved.receipt.result.allocations.map(l => l.appliedSeconds), [4, 4]);
  const replay = await bounded(() => executeWorkshopFor(owner, request, options)); assert.ok(replay.replayed);
  assert.equal(replay.snapshot.crew.find(c => c.staffId === 'blacksmith').allocatedSeconds, 4);
  assert.equal(replay.snapshot.jobs.find(j => j.id === jobId).progressSeconds, 8);
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes: [{ jobId, stageId: 'wood', workerId: 'maker', share: 50 }, { jobId, stageId: 'metal', workerId: 'blacksmith', share: 50 }] });
  advance(101); const revision = (await getWorkshopFor(owner)).revision;
  const requests = [0, 1].map(() => ({ kind: 'session.settle', revision, operationId: randomUUID() }));
  const results = await Promise.all(requests.map(r => executeWorkshopFor(owner, r, options))); assert.equal(results.filter(r => r.ok).length, 1);
  const end = await getWorkshopFor(owner); assert.equal(end.jobs.find(j => j.id === jobId).progressSeconds, 109);
  assert.equal(end.crew.find(c => c.staffId === 'blacksmith').allocatedSeconds, 54);
  assert.equal(end.workshop.lifetimeFocusSeconds, 625 * 60 + 109);
});

test('blacksmith does not grant a second lane without apprentice; same-job 32-span sessions fit bounded storage', async () => {
  const owner = await newOwner(); await workingForge(owner, false);
  const jobId = (await command(owner, 'job.start', { recipeId: 'garden-bench' })).receipt.result.jobId;
  const lanes = [{ jobId, stageId: 'wood', workerId: 'maker', share: 60 }, { jobId, stageId: 'metal', workerId: 'blacksmith', share: 40 }];
  await refuse(owner, 'session.start', { mode: 'countup', lanes }, 'workerUnavailable');
  const welcome = await command(owner, 'crew.welcome', { staffId: 'apprentice' }); await focus(owner, 900, welcome.receipt.result.jobId);
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes });
  for (let n = 0; n < 32; n++) {
    advance(1); await boundedCommand(owner, 'session.pause');
    if (n < 31) { await boundedCommand(owner, 'session.shares', { shares: n % 2 ? [60, 40] : [30, 70] }); await boundedCommand(owner, 'session.resume'); }
  }
  await refuse(owner, 'session.resume', {}, 'limit');
  const saved = await boundedCommand(owner, 'session.settle');
  assert.equal(saved.receipt.result.allocations.reduce((n, l) => n + l.appliedSeconds, 0), 32);
  assert.equal(saved.snapshot.jobs.find(j => j.id === jobId).progressSeconds, 32);
});

test('mixed snapshots are bounded typed state; pinned old prices and unknown client state remain protected', () => {
  const spec = recipes.find(r => r.id === 'standing-lamp');
  const job = { id: 'j', specSnapshot: JSON.stringify(spec), progressSnapshot: initialProgress(spec), status: 'making', chosenFinish: 0, completedFinish: -1, appliedSeconds: 0, saleableSeconds: 0, reservedMaterialMinor: spec.materialMinor, kind: 'object' };
  assert.deepEqual(availableStages(job, 'maker').map(s => s.id), ['wood']); assert.deepEqual(availableStages(job, 'blacksmith').map(s => s.id), ['metal']);
  for (const progress of [{ version: 7 }, { version: 1, seconds: 0 }, { version: 2, stages: [], injected: 1 }, { version: 2, stages: [{ id: 'wood', seconds: -1 }] }]) assert.throws(() => jobView({ ...job, progressSnapshot: JSON.stringify(progress) }));
  const invalid = JSON.parse(initialProgress(spec)); invalid.stages[2].seconds = 1;
  assert.throws(() => jobView({ ...job, progressSnapshot: JSON.stringify(invalid) }));
  const cycle = structuredClone(spec); cycle.stages[0].requires = ['assemble']; assert.throws(() => readSpec({ specSnapshot: JSON.stringify(cycle) }));
  assert.throws(() => validateCommand({ kind: 'job.allocate', jobId: 'j', stageId: 'wood', progressSnapshot: '{}', seconds: 1, revision: 1, operationId: randomUUID() }));
  const legacy = { ...recipes.find(r => r.id === 'stool'), materialMinor: 777, workmanshipMinorPerSecond: 3 };
  const oldJob = { ...job, recipeId: 'stool', specSnapshot: JSON.stringify(legacy), reservedMaterialMinor: 777, progressSnapshot: '{"version":1,"seconds":0}' };
  const completed = applyEffort(oldJob, 1200); assert.equal(jobView({ ...oldJob, ...completed.update }).marketPriceMinor, 4377);
  assert.equal(oldJob.specSnapshot, JSON.stringify(legacy));
});

test('specialist bank allocations award experience once and failed merged settlement rolls back every change', async () => {
  const owner = await newOwner(); await workingForge(owner);
  const jobId = (await command(owner, 'job.start', { recipeId: 'standing-lamp' })).receipt.result.jobId;
  await focus(owner, 101);
  const beforeBank = await getWorkshopFor(owner), bankRequest = { kind: 'job.allocate', jobId, stageId: 'metal', workerId: 'blacksmith', seconds: 101, revision: beforeBank.revision, operationId: randomUUID() };
  const bank = await bounded(() => executeWorkshopFor(owner, bankRequest, options), { loseReply: true }); assert.ok(bank.ok);
  const retry = await bounded(() => executeWorkshopFor(owner, bankRequest, options)); assert.ok(retry.replayed);
  assert.equal(retry.snapshot.crew.find(c => c.staffId === 'blacksmith').allocatedSeconds, 101);
  assert.equal(retry.snapshot.workshop.bankSeconds, 0); assert.equal(retry.snapshot.workshop.lifetimeFocusSeconds, 625 * 60 + 101);
  await command(owner, 'session.start', { mode: 'countup', lanes: [{ jobId, stageId: 'wood', workerId: 'maker', share: 50 }, { jobId, stageId: 'metal', workerId: 'blacksmith', share: 50 }] }); advance(200);
  const before = await getWorkshopFor(owner), request = { kind: 'session.settle', operationId: randomUUID(), revision: before.revision };
  const failed = await bounded(() => executeWorkshopFor(owner, request, options), { failAfterWrites: 4 }); assert.equal(failed.ok, false);
  const after = await getWorkshopFor(owner); assert.deepEqual(after.workshop, before.workshop); assert.deepEqual(after.jobs, before.jobs); assert.deepEqual(after.crew, before.crew);
  assert.equal(await operationReceiptFor(owner, request.operationId), null);
  const saved = await bounded(() => executeWorkshopFor(owner, request, options)); assert.ok(saved.ok);
  assert.equal(saved.snapshot.jobs.find(j => j.id === jobId).progressSeconds, 301);
  assert.equal(saved.snapshot.crew.find(c => c.staffId === 'blacksmith').allocatedSeconds, 201);
});

test('a pinned sequential mixed-role legacy job banks role-blocked time in both previews and application', async () => {
  const { allocationPreview } = await import('../lib/game/allocation.js');
  const spec = { id: 'legacy-role-example', version: 2, kind: 'object', nameKey: 'sw.recipe.stool', materialMinor: 0, baseSeconds: 200, detailSeconds: [], workmanshipMinorPerSecond: 5,
    stages: [{ id: 'wood', nameKey: 'sw.stage.wood', seconds: 100, finish: 0, role: 'joinery' }, { id: 'metal', nameKey: 'sw.stage.metal', seconds: 100, finish: 0, role: 'metal' }] };
  const job = { id: 'role-job', specSnapshot: JSON.stringify(spec), progressSnapshot: '{"version":1,"seconds":0}', status: 'making', chosenFinish: 0, completedFinish: -1, appliedSeconds: 0, saleableSeconds: 0, reservedMaterialMinor: 0, kind: 'object' };
  const result = applyEffort(job, 200); assert.equal(result.applied, 100); assert.equal(result.update.completedFinish, -1);
  const session = { activeSince: null, candidateClosedSeconds: 200, limitSeconds: 10800, partCount: 1,
    currentPlan: JSON.stringify({ version: 1, jobId: job.id, workerId: 'maker' }), allocationSummary: JSON.stringify({ version: 1, spans: [200] }) };
  assert.deepEqual(allocationPreview(session, [job], 200).map(l => [l.appliedSeconds, l.bankedSeconds]), [[100, 100]]);
  assert.equal(applyEffort({ ...job, ...result.update }, 100, 'blacksmith').update.completedFinish, 0);
});

async function finishRecipeStages(owner, recipeId, finish = 0) {
  const spec = recipes.find(r => r.id === recipeId), jobId = (await boundedCommand(owner, 'job.start', { recipeId })).receipt.result.jobId;
  for (let level = 0; level <= finish; level++) {
    if (level) await boundedCommand(owner, 'job.detail', { jobId, detailId: `d${level}` });
    for (const stage of spec.stages.filter(s => s.finish === level)) await stageFocus(owner, jobId,
      ['metal', 'metal-finishing'].includes(stage.role) ? 'blacksmith' : 'maker', stage.seconds, spec.mixed ? stage.id : undefined);
  }
  return jobId;
}
async function yardReady(owner, crew = false) {
  await workingForge(owner);
  for (const [recipeId, finish] of [['lantern', 0], ['standing-lamp', 2], ['writing-desk', 2], ['wooden-spoon', 1]]) {
    await boundedCommand(owner, 'job.sell', { jobId: await finishRecipeStages(owner, recipeId, finish) });
  }
  const yard = await boundedCommand(owner, 'room.expand', { expansionId: 'craft-yard' });
  await stageFocus(owner, yard.receipt.result.jobId, 'maker', 7200);
  if (crew) for (const staffId of ['carver', 'finisher']) {
    const welcome = await boundedCommand(owner, 'crew.welcome', { staffId });
    await stageFocus(owner, welcome.receipt.result.jobId, 'maker', 1200);
  }
  return getWorkshopFor(owner, options);
}
async function greenhouse(owner) { return (await boundedCommand(owner, 'community.fund', { projectId: 'neighborhood-greenhouse' })).receipt.result.jobId; }
const greenhouseLanes = jobId => [
  { workerId: 'maker', jobId, stageId: 'panel-a', share: 30 },
  { workerId: 'carver', jobId, stageId: 'panel-b', share: 30 },
  { workerId: 'blacksmith', jobId, stageId: 'frame', share: 40 },
];

// Every setup action is an ordinary funded, timed command. No seeded wallet,
// unlock, bank or focus totals are used to make this progression solvent.
test('ordinary full-crew greenhouse route finishes at 1540 minutes and 621 coins with no community payout', async () => {
  const { workshopCapacity } = await import('../lib/game/rules.js');
  const owner = await newOwner(), yard = await yardReady(owner, true);
  assert.equal(yard.workshop.lifetimeFocusSeconds, 1180 * 60); assert.equal(yard.workshop.coinMinor, 80100);
  assert.equal(yard.crew.length, 4); assert.ok(yard.crew.every(c => c.status === 'active'));
  assert.deepEqual(workshopCapacity(yard.unlocks, yard.crew), { openJobs: 6, lanes: 3 });
  const jobId = await greenhouse(owner), initial = (await getWorkshopFor(owner)).jobs.find(j => j.id === jobId);
  assert.equal(initial.kind, 'community'); assert.equal(initial.requiredSeconds, 360 * 60); assert.equal(initial.marketPriceMinor, 0);
  for (const [stageId, workerId, seconds] of [['panel-a', 'apprentice', 4800], ['panel-b', 'carver', 4800], ['frame', 'blacksmith', 6000], ['assemble', 'maker', 6000]]) {
    await stageFocus(owner, jobId, workerId, seconds, stageId);
  }
  const ready = await getWorkshopFor(owner); assert.equal(ready.jobs.find(j => j.id === jobId).status, 'ready');
  assert.ok(!ready.unlocks.some(u => u.unlockId === 'neighborhood-greenhouse'));
  for (const [kind, fields] of [['job.sell', {}], ['job.keep', {}], ['job.detail', { detailId: 'd1' }], ['commission.deliver', { commissionId: 'first-stool' }], ['job.style', { patternId: 'plain' }]]) {
    await refuse(owner, kind, { jobId, ...fields }, 'jobState');
  }
  const delivered = await boundedCommand(owner, 'community.deliver', { jobId });
  assert.equal(delivered.receipt.coinDeltaMinor, 0); assert.equal(delivered.receipt.result.saleMinor, 0);
  assert.equal(delivered.snapshot.workshop.lifetimeFocusSeconds, 1540 * 60); assert.equal(delivered.snapshot.workshop.coinMinor, 62100);
  assert.equal(delivered.snapshot.workshop.bankSeconds, 0); assert.equal(delivered.snapshot.unlocks.filter(u => u.unlockId === 'neighborhood-greenhouse').length, 1);
  assert.ok(!delivered.snapshot.jobs.some(j => j.id === jobId));
  await refuse(owner, 'community.fund', { projectId: 'neighborhood-greenhouse' }, 'jobState');
  await refuse(owner, 'job.salvage', { jobId }, 'jobState');
});

test('yard gates require active forge crew, thousand minutes and completed metal plus mixed work; yard and welcomes refund once', async () => {
  const owner = await newOwner();
  await refuse(owner, 'community.fund', { projectId: 'neighborhood-greenhouse' }, 'requirements');
  await refuse(owner, 'crew.welcome', { staffId: 'carver' }, 'requirements');
  await workingForge(owner); await refuse(owner, 'room.expand', { expansionId: 'craft-yard' }, 'requirements');
  await focus(owner, 10800); await focus(owner, 10800); await focus(owner, 900);
  await refuse(owner, 'room.expand', { expansionId: 'craft-yard' }, 'requirements');
  await boundedCommand(owner, 'job.sell', { jobId: await finishRecipeStages(owner, 'lantern') });
  await refuse(owner, 'room.expand', { expansionId: 'craft-yard' }, 'requirements');
  await boundedCommand(owner, 'job.sell', { jobId: await finishRecipeStages(owner, 'standing-lamp') });
  const funded = await boundedCommand(owner, 'room.expand', { expansionId: 'craft-yard' }), yardId = funded.receipt.result.jobId;
  assert.equal(funded.receipt.coinDeltaMinor, -60000); await focus(owner, 17, yardId);
  await refuse(owner, 'crew.welcome', { staffId: 'carver' }, 'requirements');
  const cancelled = await boundedCommand(owner, 'job.salvage', { jobId: yardId });
  assert.equal(cancelled.receipt.coinDeltaMinor, 60000); assert.equal(cancelled.receipt.bankDeltaSeconds, 0);
  await refuse(owner, 'job.salvage', { jobId: yardId }, 'jobState');
  const retry = await boundedCommand(owner, 'room.expand', { expansionId: 'craft-yard' }); await focus(owner, 7200, retry.receipt.result.jobId);
  const welcome = await boundedCommand(owner, 'crew.welcome', { staffId: 'carver' });
  await refuse(owner, 'crew.welcome', { staffId: 'finisher' }, 'jobState');
  await focus(owner, 19, welcome.receipt.result.jobId);
  const cancel = await boundedCommand(owner, 'job.salvage', { jobId: welcome.receipt.result.jobId });
  assert.equal(cancel.receipt.coinDeltaMinor, 18000); assert.equal(cancel.receipt.bankDeltaSeconds, 0);
  await refuse(owner, 'job.salvage', { jobId: welcome.receipt.result.jobId }, 'jobState');
  const again = await boundedCommand(owner, 'crew.welcome', { staffId: 'carver' });
  await stageFocus(owner, again.receipt.result.jobId, 'maker', 1200);
  const end = await getWorkshopFor(owner); assert.equal(end.crew.filter(c => c.staffId === 'carver').length, 1);
  await refuse(owner, 'crew.welcome', { staffId: 'carver' }, 'jobState');
});

test('three greenhouse component lanes merge one job write, keep prerequisites saved and bank overflow without multiplying focus', async () => {
  const owner = await newOwner(); await yardReady(owner, true); const jobId = await greenhouse(owner), lanes = greenhouseLanes(jobId);
  await refuse(owner, 'session.start', { mode: 'countup', lanes: [{ workerId: 'maker', jobId, stageId: 'assemble', share: 100 }] }, 'stageUnavailable');
  for (const invalid of [
    [{ ...lanes[0], workerId: 'finisher', share: 100 }],
    [{ ...lanes[2], workerId: 'carver', share: 100 }],
    [lanes[0], { ...lanes[1], stageId: 'panel-a' }, lanes[2]],
  ]) await refuse(owner, 'session.start', { mode: 'countup', lanes: invalid });
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes }); advance(10800);
  const before = await getWorkshopFor(owner, options), request = { kind: 'session.settle', operationId: randomUUID(), revision: before.revision };
  const saved = await bounded(() => executeWorkshopFor(owner, request, options), { inspectSteps(steps) {
    if (steps.some(s => s.action === 'update')) assert.equal(steps.filter(s => s.model === 'WorkJob' && s.action === 'update').length, 1);
  }, loseReply: true }); assert.ok(saved.ok);
  const replay = await bounded(() => executeWorkshopFor(owner, request, options)); assert.ok(replay.replayed);
  assert.deepEqual(replay.receipt.result.allocations.map(l => l.appliedSeconds), [3240, 3240, 4320]);
  assert.equal(replay.snapshot.jobs.find(j => j.id === jobId).progressSeconds, 10800);
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes }); advance(6000);
  const complete = await boundedCommand(owner, 'session.settle');
  assert.deepEqual(complete.receipt.result.allocations.map(l => [l.appliedSeconds, l.bankedSeconds]), [[1560, 240], [1560, 240], [1680, 720]]);
  const job = complete.snapshot.jobs.find(j => j.id === jobId); assert.equal(job.progressSeconds, 15600); assert.equal(job.status, 'making');
  assert.equal(job.stages.find(s => s.id === 'assemble').available, true); assert.equal(complete.receipt.result.bankedSeconds, 1200);
  await refuse(owner, 'job.allocate', { jobId, stageId: 'assemble', workerId: 'carver', seconds: 1200 }, 'workerRole');
  const bank = await boundedCommand(owner, 'job.allocate', { jobId, stageId: 'assemble', seconds: 1200 }); assert.equal(bank.receipt.focusDeltaSeconds, 0);
  await stageFocus(owner, jobId, 'maker', 4800, 'assemble');
  const end = await getWorkshopFor(owner); assert.equal(end.jobs.find(j => j.id === jobId).progressSeconds, 21600);
  assert.equal(end.workshop.lifetimeFocusSeconds, 1540 * 60); assert.equal(end.workshop.bankSeconds, 0);
});

test('three-lane integrated rounding, share edits, trimming and 32 compact spans remain bounded with exact legacy allocations', async () => {
  const { sessionAllocations, spanSummary } = await import('../lib/game/allocation.js');
  for (let seconds = 0; seconds < 100; seconds++) for (let share = 10; share <= 90; share += 10) {
    const lanes = [{ workerId: 'maker', jobId: 'one', share }, { workerId: 'apprentice', jobId: 'two', share: 100 - share }];
    const session = { currentPlan: JSON.stringify({ version: 2, lanes }), allocationSummary: spanSummary([{ seconds, lanes }]), partCount: 1, candidateClosedSeconds: seconds, activeSince: null, limitSeconds: 10800 };
    assert.deepEqual(sessionAllocations(session, seconds).map(l => l.seconds), [Math.floor((seconds * share + 50) / 100), seconds - Math.floor((seconds * share + 50) / 100)]);
  }
  const owner = await newOwner(); await yardReady(owner, true); const jobId = await greenhouse(owner), lanes = greenhouseLanes(jobId);
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes });
  for (let i = 0; i < 32; i++) {
    advance(3); await boundedCommand(owner, 'session.pause');
    if (i < 31) { await boundedCommand(owner, 'session.shares', { shares: i % 2 ? [30, 30, 40] : [10, 70, 20] }); await boundedCommand(owner, 'session.resume'); }
  }
  await refuse(owner, 'session.resume', {}, 'limit'); await boundedCommand(owner, 'session.trim', { seconds: 83 });
  const before = await getWorkshopFor(owner, options); assert.ok(before.session.allocationSummary.length < 2048);
  const preview = before.session.allocationPreview; assert.equal(preview.reduce((n, l) => n + l.seconds, 0), 83);
  const saved = await boundedCommand(owner, 'session.settle');
  assert.deepEqual(saved.receipt.result.allocations.map(l => [l.appliedSeconds, l.bankedSeconds]), preview.map(l => [l.appliedSeconds, l.bankedSeconds]));
  assert.equal(saved.snapshot.jobs.find(j => j.id === jobId).progressSeconds, 83);
  const summary = JSON.parse(saved.snapshot.history[0].allocationSummary); assert.equal(summary.version, 3); assert.equal(summary.spans.length, 32);
  assert.deepEqual(summary.spans.slice(26), [3, 2, 0, 0, 0, 0]);
  const longLanes = lanes.map((l, i) => ({ ...l, jobId: String(i).repeat(100), stageId: String(i).repeat(80) }));
  const longSession = { ...before.session, currentPlan: JSON.stringify({ version: 2, lanes: longLanes }), allocationSummary: spanSummary(Array.from({ length: 32 }, () => ({ seconds: 3, lanes: longLanes }))), candidateClosedSeconds: 96 };
  assert.ok(longSession.allocationSummary.length < 1024); assert.equal(sessionAllocations(longSession, 96).reduce((n, l) => n + l.seconds, 0), 96);
});

test('community funding, refund, delivery races and lost replies settle each deposit and permanent reward once', async () => {
  const owner = await newOwner(); await yardReady(owner, true);
  const before = await getWorkshopFor(owner), request = { kind: 'community.fund', projectId: 'neighborhood-greenhouse', revision: before.revision, operationId: randomUUID() };
  const funded = await bounded(() => executeWorkshopFor(owner, request, options), { loseReply: true }); assert.ok(funded.ok);
  const retry = await bounded(() => executeWorkshopFor(owner, request, options)); assert.ok(retry.replayed); const jobId = retry.receipt.result.jobId;
  assert.equal(retry.snapshot.workshop.coinMinor, before.workshop.coinMinor - 18000);
  await refuse(owner, 'community.fund', { projectId: 'neighborhood-greenhouse' }, 'jobState');
  await stageFocus(owner, jobId, 'carver', 31, 'panel-a');
  const cancelled = await boundedCommand(owner, 'job.salvage', { jobId }); assert.equal(cancelled.receipt.coinDeltaMinor, 18000); assert.equal(cancelled.receipt.bankDeltaSeconds, 0);
  await refuse(owner, 'job.salvage', { jobId }, 'jobState');
  const second = await greenhouse(owner);
  for (const [stage, worker, seconds] of [['panel-a', 'maker', 4800], ['panel-b', 'carver', 4800], ['frame', 'blacksmith', 6000], ['assemble', 'maker', 6000]]) await stageFocus(owner, second, worker, seconds, stage);
  const ready = await getWorkshopFor(owner), delivery = { kind: 'community.deliver', jobId: second, revision: ready.revision, operationId: randomUUID() };
  const results = await Promise.all([executeWorkshopFor(owner, delivery, options), executeWorkshopFor(owner, { ...delivery, operationId: randomUUID(), kind: 'job.salvage' }, options)]);
  assert.equal(results.filter(r => r.ok).length, 1);
  const end = await getWorkshopFor(owner);
  if (results[0].ok) {
    assert.equal(end.workshop.coinMinor, ready.workshop.coinMinor); assert.equal(end.unlocks.filter(u => u.unlockId === 'neighborhood-greenhouse').length, 1);
    const replay = await bounded(() => executeWorkshopFor(owner, delivery, options)); assert.ok(replay.replayed);
  } else { assert.equal(end.workshop.coinMinor, ready.workshop.coinMinor + 18000); assert.ok(!end.unlocks.some(u => u.unlockId === 'neighborhood-greenhouse')); }
  assert.equal(end.workshop.bankSeconds, 0);
});

test('styles are validated owner choices, locked until staff activate and immutable in price, effort and held sessions', async () => {
  const { styleChoices } = await import('../lib/game/rules.js');
  const owner = await newOwner(); await yardReady(owner); const jobId = (await boundedCommand(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  await refuse(owner, 'job.style', { jobId, patternId: 'carved-ripples' }, 'requirements');
  await refuse(owner, 'job.style', { jobId, finishStyleId: 'warm-honey' }, 'requirements');
  const welcome = await boundedCommand(owner, 'crew.welcome', { staffId: 'carver' });
  await refuse(owner, 'job.style', { jobId, patternId: 'carved-ripples' }, 'requirements');
  await stageFocus(owner, welcome.receipt.result.jobId, 'maker', 1200);
  const finisher = await boundedCommand(owner, 'crew.welcome', { staffId: 'finisher' }); await stageFocus(owner, finisher.receipt.result.jobId, 'maker', 1200);
  const before = (await getWorkshopFor(owner)).jobs.find(j => j.id === jobId);
  const styled = await boundedCommand(owner, 'job.style', { jobId, patternId: 'carved-ripples', finishStyleId: 'dusk-blue' });
  const afterJob = styled.snapshot.jobs.find(j => j.id === jobId);
  for (const key of ['specSnapshot', 'progressSnapshot', 'reservedMaterialMinor', 'appliedSeconds', 'saleableSeconds', 'marketPriceMinor', 'requiredSeconds']) assert.equal(afterJob[key], before[key]);
  assert.deepEqual(styleChoices(afterJob, styled.snapshot.crew).patterns.map(p => p.id), ['plain', 'carved-ripples', 'carved-leaves']);
  for (const choice of [{ patternId: 'unknown' }, { finishStyleId: '#ff0000' }, { finishStyleId: 'https://example.com/style' }, { color: 'red' }]) await refuse(owner, 'job.style', { jobId, ...choice });
  const other = await newOwner(); await refuse(other, 'job.style', { jobId, patternId: 'plain' }, 'notFound');
  await boundedCommand(owner, 'session.start', { mode: 'countup', jobId });
  await refuse(owner, 'job.style', { jobId, patternId: 'plain' }, 'sessionActive'); advance(300); await boundedCommand(owner, 'session.settle');
  await boundedCommand(owner, 'job.keep', { jobId });
  const kept = await boundedCommand(owner, 'job.style', { jobId, patternId: 'carved-leaves', finishStyleId: 'warm-honey' }); assert.equal(kept.receipt.coinDeltaMinor, 0);
  const savedKept = (await getWorkshopFor(owner)).jobs.find(j => j.id === jobId); assert.equal(savedKept.patternId, 'carved-leaves'); assert.equal(savedKept.marketPriceMinor, 1500);
  await boundedCommand(owner, 'job.sell', { jobId }); await refuse(owner, 'job.style', { jobId, patternId: 'plain' }, 'jobState');
  const metalId = (await boundedCommand(owner, 'job.start', { recipeId: 'hinge-set' })).receipt.result.jobId;
  await refuse(owner, 'job.style', { jobId: metalId, patternId: 'carved-leaves' }, 'requirements');
  await boundedCommand(owner, 'job.style', { jobId: metalId, finishStyleId: 'dusk-blue' });
});

test('specialists interpret pinned wood roles without rewriting them and bank role-blocked work', async () => {
  const { workerCanDoStage } = await import('../lib/game/rules.js');
  const spec = recipes.find(r => r.id === 'stool'), job = { id: 'pinned', kind: 'object', status: 'making', chosenFinish: 0, completedFinish: -1, appliedSeconds: 0,
    reservedMaterialMinor: spec.materialMinor, saleableSeconds: 0, specSnapshot: JSON.stringify(spec), progressSnapshot: initialProgress(spec) };
  assert.equal(workerCanDoStage('carver', spec.stages[0]), true); assert.equal(workerCanDoStage('carver', spec.stages[1]), false);
  assert.equal(workerCanDoStage('finisher', spec.stages[0]), false); assert.equal(workerCanDoStage('finisher', spec.stages[2]), true);
  const carved = applyEffort(job, 1200, 'carver'); assert.equal(carved.applied, 480);
  const assembled = applyEffort({ ...job, ...carved.update }, 480); assert.equal(assembled.applied, 480);
  const finished = applyEffort({ ...job, ...assembled.update }, 600, 'finisher'); assert.equal(finished.applied, 240); assert.equal(finished.update.status, 'ready');
  assert.equal(job.specSnapshot, JSON.stringify(spec));
  for (const worker of ['carver', 'finisher']) for (const role of ['assembly', 'construction', 'onboarding', 'metal']) assert.equal(workerCanDoStage(worker, { id: 'x', role }), false);
  const owner = await newOwner(); await yardReady(owner, true); const started = await boundedCommand(owner, 'job.start', { recipeId: 'stool' }), jobId = started.receipt.result.jobId;
  const settled = await stageFocus(owner, jobId, 'carver', 1200); assert.equal(settled.receipt.result.bankedSeconds, 720);
  assert.equal(settled.snapshot.crew.find(c => c.staffId === 'carver').allocatedSeconds, 480);
  await boundedCommand(owner, 'job.allocate', { jobId, seconds: 480 });
  const last = await boundedCommand(owner, 'job.allocate', { jobId, seconds: 240, workerId: 'finisher' });
  assert.equal(last.snapshot.crew.find(c => c.staffId === 'finisher').allocatedSeconds, 240); assert.equal(last.snapshot.workshop.bankSeconds, 0);
});

test('six objects coexist with community and onboarding, full roster stays visible, capacity and foreign targets refuse', async () => {
  const owner = await newOwner(); await yardReady(owner);
  const jobs = []; for (let i = 0; i < 6; i++) jobs.push((await boundedCommand(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId);
  await refuse(owner, 'job.start', { recipeId: 'wooden-spoon' }, 'jobLimit');
  const communityId = await greenhouse(owner), welcome = await boundedCommand(owner, 'crew.welcome', { staffId: 'carver' });
  const snapshot = await bounded(() => getWorkshopFor(owner, options)); assert.equal(snapshot.jobs.length, 8);
  assert.ok([...jobs, communityId, welcome.receipt.result.jobId].every(id => snapshot.jobs.some(j => j.id === id)));
  // Imported older saves may have separately active improvement/onboarding.
  // Loading that ninth row must not hide a held target or a prerequisite job.
  const legacy = await modelAction('WorkJob', 'findFirst', { where: { ownerId: owner, recipeId: 'carpenter-room', status: 'completed' } });
  const legacyId = randomUUID(); await modelAction('WorkJob', 'create', { data: { ...legacy, id: legacyId, status: 'making', completedFinish: -1, appliedSeconds: 0, progressSnapshot: initialProgress(readSpec(legacy)) } });
  const nine = await bounded(() => getWorkshopFor(owner, options)); assert.equal(nine.jobs.length, 9);
  assert.ok([...jobs, communityId, welcome.receipt.result.jobId, legacyId].every(id => nine.jobs.some(j => j.id === id)));
  await boundedCommand(owner, 'job.salvage', { jobId: legacyId });
  await boundedCommand(owner, 'job.salvage', { jobId: jobs[0] }); await boundedCommand(owner, 'job.start', { recipeId: 'wooden-spoon' });
  const other = await newOwner(); await refuse(other, 'community.deliver', { jobId: communityId }, 'notFound');
  await refuse(owner, 'session.start', { mode: 'countup', lanes: [{ workerId: 'carver', jobId: jobs[1], share: 100 }] }, 'workerUnavailable');
  await stageFocus(owner, welcome.receipt.result.jobId, 'maker', 1200);
  const finished = await boundedCommand(owner, 'crew.welcome', { staffId: 'finisher' }); await stageFocus(owner, finished.receipt.result.jobId, 'maker', 1200);
  assert.equal((await bounded(() => getWorkshopFor(owner))).crew.length, 4);
  await refuse(owner, 'session.start', { mode: 'countup', lanes: ['maker', 'apprentice', 'carver', 'blacksmith'].map((workerId, i) => ({ workerId, jobId: jobs[i + 1], share: i ? 20 : 40 })) }, 'lanes');
});

test('three distinct finishing jobs and all three staff updates remain atomic, bounded and replay safe', async () => {
  const owner = await newOwner(); await yardReady(owner, true);
  const lanes = [];
  for (const [i, recipeId] of ['wooden-spoon', 'stool', 'birdhouse'].entries()) {
    const spec = recipes.find(r => r.id === recipeId), jobId = (await boundedCommand(owner, 'job.start', { recipeId })).receipt.result.jobId;
    await stageFocus(owner, jobId, 'maker', spec.stages[0].seconds + spec.stages[1].seconds);
    lanes.push({ jobId, workerId: ['apprentice', 'carver', 'finisher'][i], share: [30, 30, 40][i] });
  }
  await boundedCommand(owner, 'session.start', { mode: 'countup', lanes }); advance(2400);
  const before = await getWorkshopFor(owner, options), request = { kind: 'session.settle', revision: before.revision, operationId: randomUUID() };
  const failed = await bounded(() => executeWorkshopFor(owner, request, options), { failAfterWrites: 8 }); assert.equal(failed.ok, false);
  const after = await getWorkshopFor(owner, options); assert.deepEqual(after.workshop, before.workshop); assert.deepEqual(after.jobs, before.jobs); assert.deepEqual(after.crew, before.crew);
  const saved = await bounded(() => executeWorkshopFor(owner, request, options), { inspectSteps(steps) {
    if (steps.some(s => s.action === 'update')) {
      assert.equal(steps.filter(s => s.model === 'WorkJob' && s.action === 'update').length, 3);
      assert.equal(steps.filter(s => s.model === 'CrewMember' && s.action === 'update').length, 3);
      for (const step of steps.filter(s => s.action === 'update')) assert.equal(step.args.where.ownerId, owner);
    }
  } }); assert.ok(saved.ok); assert.ok(saved.snapshot.jobs.filter(j => lanes.some(l => l.jobId === j.id)).every(j => j.status === 'ready'));
  assert.equal(saved.receipt.result.allocations.reduce((n, l) => n + l.appliedSeconds + l.bankedSeconds, 0), 2400);
  const retry = await bounded(() => executeWorkshopFor(owner, request, options)); assert.ok(retry.replayed);
  assert.deepEqual(retry.snapshot.crew, saved.snapshot.crew); assert.deepEqual(retry.snapshot.workshop, saved.snapshot.workshop);
});

test('tasks keep only confirmed focus, survive restart and preserve task names in sold product evidence', async () => {
  const owner = await newOwner();
  const taskId = (await command(owner, 'task.add', { title: 'Write the proposal' })).receipt.result.taskId;
  const jobId = (await command(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  await boundedCommand(owner, 'session.start', { mode: 'countup', taskId, jobId });
  advance(90); await command(owner, 'session.pause'); advance(600);
  await command(owner, 'session.resume'); advance(60);
  await command(owner, 'session.trim', { seconds: 120 });
  const snapshot = await getWorkshopFor(owner);
  assert.equal(snapshot.tasks[0].focusSeconds, 0); assert.equal(snapshot.session.taskTitle, 'Write the proposal');
  const request = { operationId: randomUUID(), revision: snapshot.revision, kind: 'session.settle', seconds: 110 };
  const settled = await bounded(() => executeWorkshopFor(owner, request, options), { loseReply: true }); assert.ok(settled.ok);
  await bounded(() => executeWorkshopFor(owner, request, options));
  let saved = await getWorkshopFor(owner); assert.equal(saved.tasks[0].focusSeconds, 110); assert.equal(saved.tasks[0].sessionCount, 1);
  await command(owner, 'task.rename', { taskId, title: 'Proposal sent' });
  await command(owner, 'task.complete', { taskId });
  await focus(owner, 190, jobId); await command(owner, 'job.sell', { jobId });
  await closeStorage();
  saved = await getWorkshopFor(owner); assert.equal(saved.completedTasks[0].title, 'Proposal sent'); assert.equal(saved.completedTasks[0].focusSeconds, 110);
  const evidence = await bounded(() => productSourcesFor(owner, jobId));
  assert.equal(evidence.sources.find(row => row.session?.taskId === taskId).session.taskTitle, 'Write the proposal');
  const history = await bounded(() => taskHistoryFor(owner, taskId));
  assert.equal(history.sessions[0].acceptedSeconds, 110); assert.equal(history.jobs[0].recipeId, 'wooden-spoon');
  assert.equal(history.sessions[0].allocations[0].appliedSeconds, 110);
});

test('task assignment, ownership, completion and title boundaries are enforced without lost time', async () => {
  const owner = await newOwner(), other = await newOwner();
  const taskId = (await command(owner, 'task.add', { title: 'Study' })).receipt.result.taskId;
  await refuse(other, 'task.complete', { taskId }, 'notFound');
  await refuse(other, 'session.start', { mode: 'countup', taskId }, 'taskState');
  for (const title of ['', ' ', 'x'.repeat(161)]) await refuse(owner, 'task.add', { title }, 'invalid');
  await command(owner, 'task.add', { title: 'x'.repeat(160) });
  await refuse(owner, 'task.rename', { title: 'Bad target' }, 'invalid');
  await command(owner, 'session.start', { mode: 'countup', taskId });
  await refuse(owner, 'task.rename', { taskId, title: 'Changed' }, 'taskActive');
  await refuse(owner, 'task.complete', { taskId }, 'taskActive');
  advance(80); await command(owner, 'session.discard');
  await command(owner, 'session.start', { mode: 'countup', taskId }); advance(30); await command(owner, 'session.settle', { seconds: 0 });
  assert.equal((await getWorkshopFor(owner)).tasks.find(task => task.id === taskId).focusSeconds, 0);
  await command(owner, 'task.complete', { taskId }); await refuse(owner, 'session.start', { mode: 'countup', taskId }, 'taskState');
  await command(owner, 'task.reopen', { taskId });
  await refuse(owner, 'session.start', { mode: 'break', plannedSeconds: 60, taskId }, 'taskState');
  await assert.rejects(() => taskHistoryFor(other, taskId));
});

test('a task receives one shared session total, with product and pooled focus separated', async () => {
  const owner = await newOwner();
  const taskId = (await command(owner, 'task.add', { title: 'Read chapter two' })).receipt.result.taskId;
  const jobId = (await command(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  await command(owner, 'session.start', { mode: 'countup', taskId, jobId }); advance(400); await command(owner, 'session.settle');
  const saved = await getWorkshopFor(owner); assert.equal(saved.tasks[0].focusSeconds, 400); assert.equal(saved.workshop.bankSeconds, 100);
  const otherJob = (await command(owner, 'job.start', { recipeId: 'wooden-spoon' })).receipt.result.jobId;
  await command(owner, 'job.allocate', { jobId: otherJob, seconds: 100 });
  const evidence = await productSourcesFor(owner, otherJob); assert.equal(evidence.sources[0].sourceKind, 'bank'); assert.equal(evidence.sources[0].session, null);
  assert.equal((await getWorkshopFor(owner)).tasks[0].focusSeconds, 400);
  const history = await taskHistoryFor(owner, taskId); assert.equal(history.sessions[0].allocations[0].bankedSeconds, 100);
});

test('task reads paginate completed records and stay inside the private channel at the open-task limit', async () => {
  const owner = await newOwner();
  for (let i = 0; i < 101; i++) {
    if (i === 100) { await refuse(owner, 'task.add', { title: 'One too many' }, 'taskLimit'); break; }
    await command(owner, 'task.add', { title: `Task ${i}` });
  }
  let snapshot = await bounded(() => getWorkshopFor(owner)); assert.equal(snapshot.tasks.length, 100);
  for (const task of snapshot.tasks.slice(0, 12)) await boundedCommand(owner, 'task.complete', { taskId: task.id });
  snapshot = await bounded(() => getWorkshopFor(owner)); assert.equal(snapshot.completedTasks.length, 10); assert.ok(snapshot.taskNextCursor);
  const next = await bounded(() => getWorkshopFor(owner, { taskBefore: snapshot.taskNextCursor })); assert.equal(next.completedTasks.length, 2);
  assert.equal(new Set([...snapshot.completedTasks, ...next.completedTasks].map(row => row.id)).size, 12);
  await command(owner, 'task.reopen', { taskId: next.completedTasks[0].id });
  assert.equal((await getWorkshopFor(owner)).tasks.length, 89);
});

test('task sessions and product sources page by time without losing sessions after a rename', async () => {
  const owner = await newOwner(), taskId = (await command(owner, 'task.add', { title: 'Review drawings' })).receipt.result.taskId;
  const jobId = (await command(owner, 'job.start', { recipeId: 'stool' })).receipt.result.jobId;
  for (let i = 0; i < 12; i++) { await command(owner, 'session.start', { mode: 'countup', taskId, jobId }); advance(10); await command(owner, 'session.settle'); advance(60); }
  for (const [read, id, key] of [[taskHistoryFor, taskId, 'sessions'], [productSourcesFor, jobId, 'sources']]) {
    const first = await bounded(() => read(owner, id)); assert.equal(first[key].length, 10); assert.ok(first.nextCursor);
    const second = await bounded(() => read(owner, id, first.nextCursor)); assert.equal(second[key].length, 2); assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first[key], ...second[key]].map(item => item.id)).size, 12);
    const stamps = [...first[key], ...second[key]].map(item => item.startedAt || item.createdAt); assert.deepEqual(stamps, [...stamps].sort().reverse());
  }
});
