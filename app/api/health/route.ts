import { getStorage } from '../../../runtime/storage.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await getStorage().DB.prepare('SELECT 1 AS ok').first();
    if (result?.ok !== 1) throw new Error('Database unavailable');
    return Response.json({ ok: true, version: process.env.RAILWAY_GIT_COMMIT_SHA || 'local' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
