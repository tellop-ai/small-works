import { operationReceiptFor } from '@/lib/data/index.js';
import { WORKSHOP_OWNER_ID } from '@/lib/owner.js';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const operationId = params.get('operationId');
  const headers = { 'cache-control': 'no-store' };
  if ([...params].length !== 1 || !operationId || !/^[A-Za-z0-9_-]{16,100}$/u.test(operationId)) return Response.json({ ok: false, error: { code: 'invalid', messageKey: 'sw.error.invalid' } }, { status: 400, headers });
  try { return Response.json({ ok: true, receipt: await operationReceiptFor(WORKSHOP_OWNER_ID, operationId) }, { headers }); }
  catch { return Response.json({ ok: false, error: { code: 'storage', messageKey: 'sw.error.storage' } }, { status: 503, headers }); }
}
