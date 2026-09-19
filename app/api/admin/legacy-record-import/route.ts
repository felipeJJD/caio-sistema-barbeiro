import { backup, DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getSessionAccess } from "../../../../db/auth";
import { prepareLegacyImport, LEGACY_SOURCE, validateLegacyRows } from "../../../../db/legacy-import";
import { dataDirectory, getStorage } from "../../../../runtime/storage.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await getSessionAccess();
  if (!access?.isOwner || !access.isPlatformAdmin) return Response.json({ error: "Acesso negado." }, { status: 403 });
  if (request.headers.get("origin") !== "https://cortouanotou.com.br" &&
    !(process.env.NODE_ENV !== "production" && request.headers.get("origin") === new URL(request.url).origin)) {
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > 80000) return Response.json({ error: "Arquivo muito grande." }, { status: 413 });
  try {
    const input = JSON.parse(raw);
    const rows = validateLegacyRows(input.rows);
    const prepared = await prepareLegacyImport(rows, access);
    if (input.mode === "preview") return Response.json(prepared.summary, { headers: { "cache-control": "private, no-store" } });
    if (input.mode !== "apply" || prepared.problems.length || !prepared.pending.length) {
      return Response.json({ error: "A importação não pode prosseguir sem uma conferência sem conflitos.", ...prepared.summary }, { status: 409 });
    }
    // Make a consistent SQLite snapshot before the first write. Keep the original WAL untouched.
    const directory = dataDirectory();
    const snapshotDirectory = join(directory, "legacy-import-backups");
    await mkdir(snapshotDirectory, { recursive: true });
    const snapshot = join(snapshotDirectory, `before-staff-import-${Date.now()}-${randomUUID()}.sqlite`);
    const source = new DatabaseSync(join(directory, "app.sqlite"), { readOnly: true });
    try { await backup(source, snapshot); } finally { source.close(); }
    const connection = getStorage().DB;
    const statements = prepared.pending.flatMap((row) => [
      connection.prepare(`INSERT INTO daily_records
        (organization_id, occurred_at, client_name, barber_id, service_id, payment_method_id,
         quantity, value_cents, commission_rate_bps, commission_cents, tip_cents, fee_cents,
         origin, record_type, membership_client_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        access.organizationId, row.occurred_at, row.client_name, row.barber_id, row.service_id,
        row.payment_method_id, row.quantity, row.value_cents, row.commission_rate_bps,
        row.commission_cents, row.tip_cents, row.fee_cents, row.origin, row.record_type,
        row.membership_client_id, row.created_at,
      ),
      connection.prepare(`INSERT INTO legacy_record_imports
        (source_system, source_record_id, organization_id, daily_record_id)
        VALUES (?, ?, ?, last_insert_rowid())`).bind(LEGACY_SOURCE, row.id, access.organizationId),
    ]);
    await connection.batch(statements);
    return Response.json({ imported: prepared.pending.length, sourceIds: prepared.summary.pendingIds,
      snapshotCreated: true }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Falha na importação." }, { status: 400 });
  }
}
