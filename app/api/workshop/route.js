import { getWorkshopFor, executeWorkshopFor } from '@/lib/data/index.js';
import { WORKSHOP_OWNER_ID } from '@/lib/owner.js';
export const dynamic = 'force-dynamic';
const fields = {
  'task.add': ['title'], 'task.rename': ['taskId', 'title'], 'task.complete': ['taskId'], 'task.reopen': ['taskId'],
  initialize: ['name', 'makerName'], 'job.start': ['recipeId'], 'job.detail': ['jobId', 'detailId'],
  'job.allocate': ['jobId', 'seconds', 'workerId', 'stageId'], 'job.abandon': ['jobId'], 'job.salvage': ['jobId'],
  'job.style': ['jobId', 'patternId', 'finishStyleId'], 'community.fund': ['projectId'], 'community.deliver': ['jobId'],
  'job.keep': ['jobId'], 'job.sell': ['jobId'], 'commission.deliver': ['commissionId', 'jobId'],
  'room.expand': ['expansionId'], 'crew.welcome': ['staffId'], 'session.shares': ['shares'], 'session.start': ['lanes', 'mode', 'plannedSeconds', 'jobId', 'intention', 'tag', 'timeZone', 'taskId'],
  'session.pause': [], 'session.resume': [], 'session.recover': [], 'session.trim': ['seconds'],
  'session.settle': ['seconds'], 'session.discard': [],
};
function workshopJson(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
function invalid() { return workshopJson({ ok: false, error: { code: 'invalid', messageKey: 'sw.error.invalid' } }, 400); }
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const keptBefore = params.get('keptBefore');
  const taskBefore = params.get('taskBefore');
  if ((taskBefore !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(taskBefore)) || params.getAll('taskBefore').length > 1 || [...params].some(([key]) => !['keptBefore', 'taskBefore'].includes(key)) || params.getAll('keptBefore').length > 1 || (keptBefore !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(keptBefore))) return invalid();
  try { return workshopJson({ ok: true, snapshot: await getWorkshopFor(WORKSHOP_OWNER_ID, { keptBefore, taskBefore }) }); }
  catch { return workshopJson({ ok: false, error: { code: 'storage', messageKey: 'sw.error.storage' } }, 503); }
}
export async function POST(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return invalid();
  const origin = request.headers.get('origin');
  if (origin !== null) {
    try { if (new URL(origin).origin !== new URL(request.url).origin) return invalid(); }
    catch { return invalid(); }
  }
  if (Number(request.headers.get('content-length') || 0) > 12000) return invalid();
  let command;
  try {
    if (!request.body) return invalid();
    const reader = request.body.getReader();
    const chunks = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 12000) { await reader.cancel(); return invalid(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    command = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return invalid(); }
  if (!command || typeof command !== 'object' || Array.isArray(command) || !Object.hasOwn(fields, command.kind)) return invalid();
  const allowed = ['operationId', 'revision', 'kind', ...fields[command.kind]];
  if (Object.keys(command).some(key => !allowed.includes(key))) return invalid();
  if (typeof command.operationId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/u.test(command.operationId) || !Number.isSafeInteger(command.revision) || command.revision < 0) return invalid();
  for (const [key, value] of Object.entries(command)) {
    if (key === 'lanes') {
      if (!Array.isArray(value) || value.length < 1 || value.length > 3 || value.some(lane => !lane || typeof lane !== 'object' || Array.isArray(lane) || !['workerId', 'jobId', 'share'].every(name => Object.hasOwn(lane, name)) || !Object.keys(lane).every(name => ['workerId', 'jobId', 'share', 'stageId'].includes(name)) || ('stageId' in lane && (lane.jobId === null || typeof lane.stageId !== 'string' || !/^[a-z0-9-]{1,80}$/.test(lane.stageId))) || !['maker', 'apprentice', 'blacksmith', 'carver', 'finisher'].includes(lane.workerId) || (lane.jobId !== null && (typeof lane.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(lane.jobId))) || !Number.isSafeInteger(lane.share) || lane.share < 10 || lane.share > 100 || lane.share % 10 !== 0)) return invalid();
    } else if (['stageId', 'patternId', 'finishStyleId', 'projectId'].includes(key)) {
      if (typeof value !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value)) return invalid();
    } else if (key === 'shares') {
      if (!Array.isArray(value) || value.length < 1 || value.length > 3 || value.some(share => !Number.isSafeInteger(share) || share < 10 || share > 100 || share % 10 !== 0) || value.reduce((total, share) => total + share, 0) !== 100) return invalid();
    } else if (['revision', 'seconds', 'plannedSeconds'].includes(key)) {
      if (!Number.isSafeInteger(value) || value < 0 || value > 86400 * 365) return invalid();
    } else if (typeof value !== 'string' || value.length > (key === 'intention' ? 500 : 160)) return invalid();
  }
  if (command.kind === 'community.fund' && typeof command.projectId !== 'string') return invalid();
  if (['community.deliver', 'job.style'].includes(command.kind) && (typeof command.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(command.jobId))) return invalid();
  if (command.kind === 'job.style' && !Object.hasOwn(command, 'patternId') && !Object.hasOwn(command, 'finishStyleId')) return invalid();
  try {
    const result = await executeWorkshopFor(WORKSHOP_OWNER_ID, command);
    return workshopJson(result, result.ok ? 200 : result.error?.code === 'uncertain' ? 503 : 409);
  } catch { return workshopJson({ ok: false, error: { code: 'uncertain', messageKey: 'sw.error.uncertain' } }, 503); }
}
export function OPTIONS() { return new Response(null, { status: 405, headers: { allow: 'GET, POST' } }); }
