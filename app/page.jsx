import { getWorkshopFor } from '@/lib/data/index.js';
import { WORKSHOP_OWNER_ID } from '@/lib/owner.js';
import { getLocale } from '@/lib/i18n/index.js';
import { SmallWorks } from './small-works.jsx';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let snapshot = null;
  try { snapshot = JSON.parse(JSON.stringify(await getWorkshopFor(WORKSHOP_OWNER_ID))); } catch { /* The retry control preserves a read-only opening. */ }
  return <SmallWorks initialSnapshot={snapshot} initialLocale={getLocale()} />;
}
