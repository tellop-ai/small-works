import { taskHistoryFor, productSourcesFor } from '@/lib/data/index.js';
import { WORKSHOP_OWNER_ID } from '@/lib/owner.js';
export const dynamic = 'force-dynamic';
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const kind = params.get('kind'), id = params.get('id'), before = params.get('before');
  if (!['task', 'product'].includes(kind) || !id || !/^[A-Za-z0-9_-]{1,100}$/.test(id) || (before !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(before)) || [...params].some(([key]) => !['kind', 'id', 'before'].includes(key) || params.getAll(key).length !== 1)) return reply({ ok: false }, 400);
  try { return reply({ ok: true, evidence: await (kind === 'task' ? taskHistoryFor : productSourcesFor)(WORKSHOP_OWNER_ID, id, before) }); }
  catch (error) { return reply({ ok: false, error: { messageKey: error?.messageKey || 'sw.error.storage' } }, error?.code === 'notFound' ? 404 : 503); }
}
