import { and, eq, gte } from "drizzle-orm";
import type { AccessContext } from "./access";
import { getDb } from "./index";
import { clients, dailyRecords, legacyRecordImports, paymentMethods, services, team } from "./schema";
import { appDate } from "../lib/app-date";

export const LEGACY_SOURCE = "clube-fiel-v11-d1";

export type LegacyRecord = {
  id: number; organization_id: number; occurred_at: string; client_name: string;
  barber_id: number; service_id: number; payment_method_id: number;
  quantity: number; value_cents: number; commission_rate_bps: number;
  commission_cents: number; tip_cents: number; fee_cents: number;
  origin: string; record_type: string; membership_client_id: number | null;
  created_at: string;
};

const numberFields = ["id", "organization_id", "barber_id", "service_id", "payment_method_id",
  "quantity", "value_cents", "commission_rate_bps", "commission_cents", "tip_cents", "fee_cents"] as const;

export function validateLegacyRows(value: unknown): LegacyRecord[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) throw new Error("Informe de 1 a 100 atendimentos.");
  const seen = new Set<number>();
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Atendimento inválido.");
    const row = candidate as Record<string, unknown>;
    for (const field of numberFields) {
      if (!Number.isSafeInteger(row[field]) || Number(row[field]) < 0) throw new Error(`Valor inválido: ${field}.`);
    }
    if (!row.id || !row.organization_id || !row.barber_id || !row.service_id || !row.payment_method_id || !row.quantity || seen.has(Number(row.id))) {
      throw new Error("ID ou referência inválida ou repetida.");
    }
    seen.add(Number(row.id));
    if (row.membership_client_id !== null && (!Number.isSafeInteger(row.membership_client_id) || Number(row.membership_client_id) <= 0)) {
      throw new Error("Mensalista inválido.");
    }
    if (typeof row.occurred_at !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(row.occurred_at)
      || row.occurred_at < "2026-09-13" || row.occurred_at > appDate()) {
      throw new Error("Data fora do período da recuperação.");
    }
    for (const field of ["client_name", "origin", "record_type", "created_at"]) {
      if (typeof row[field] !== "string" || !row[field] || row[field].length > 200) throw new Error(`Texto inválido: ${field}.`);
    }
    if (!["Avulso", "Mensalista"].includes(String(row.record_type)) || !/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d/.test(String(row.created_at))) {
      throw new Error("Tipo ou criação inválidos.");
    }
    return row as LegacyRecord;
  });
}

export async function prepareLegacyImport(rows: LegacyRecord[], access: AccessContext) {
  if (!access.isOwner || !access.isPlatformAdmin) throw new Error("Acesso restrito ao administrador proprietário.");
  if (rows.some((row) => row.organization_id !== access.organizationId)) throw new Error("Organização diferente da sessão.");
  const db = await getDb();
  const [members, serviceRows, methodRows, membershipRows, targetRows, markers] = await Promise.all([
    db.select({ id: team.id, name: team.name, organizationId: team.organizationId }).from(team).where(eq(team.organizationId, access.organizationId)),
    db.select({ id: services.id }).from(services).where(eq(services.organizationId, access.organizationId)),
    db.select({ id: paymentMethods.id }).from(paymentMethods).where(eq(paymentMethods.organizationId, access.organizationId)),
    db.select({ id: clients.id }).from(clients).where(eq(clients.organizationId, access.organizationId)),
    db.select().from(dailyRecords).where(and(eq(dailyRecords.organizationId, access.organizationId), gte(dailyRecords.occurredAt, "2026-09-13"))),
    db.select({ sourceRecordId: legacyRecordImports.sourceRecordId, dailyRecordId: legacyRecordImports.dailyRecordId })
      .from(legacyRecordImports).where(and(eq(legacyRecordImports.sourceSystem, LEGACY_SOURCE), eq(legacyRecordImports.organizationId, access.organizationId))),
  ]);
  const staffIds = new Set(members.filter((member) => ["davi", "eduardo"].includes(member.name.trim().toLowerCase())).map((member) => member.id));
  const serviceIds = new Set(serviceRows.map((row) => row.id));
  const methodIds = new Set(methodRows.map((row) => row.id));
  const membershipIds = new Set(membershipRows.map((row) => row.id));
  const imported = new Map(markers.map((marker) => [marker.sourceRecordId, marker.dailyRecordId]));
  const pending: LegacyRecord[] = [];
  const alreadyImported: number[] = [];
  const problems: string[] = [];
  for (const row of rows) {
    if (!staffIds.has(row.barber_id) || !serviceIds.has(row.service_id) || !methodIds.has(row.payment_method_id)
      || (row.membership_client_id !== null && !membershipIds.has(row.membership_client_id))) {
      problems.push(`Registro ${row.id}: referência não pertence à barbearia atual.`);
      continue;
    }
    if (imported.has(row.id)) { alreadyImported.push(row.id); continue; }
    const similar = targetRows.filter((target) => target.barberId === row.barber_id && target.occurredAt === row.occurred_at
      && target.clientName.trim().toLocaleLowerCase("pt-BR") === row.client_name.trim().toLocaleLowerCase("pt-BR"));
    if (similar.length) {
      problems.push(`Registro ${row.id}: atendimento semelhante já existe; conferir antes de importar.`);
      continue;
    }
    pending.push(row);
  }
  return { pending, alreadyImported, problems, organizationId: access.organizationId,
    summary: { pendingIds: pending.map((row) => row.id), alreadyImported, problems,
      byBarber: { Davi: pending.filter((row) => members.find((m) => m.id === row.barber_id)?.name.trim().toLowerCase() === "davi").length,
        Eduardo: pending.filter((row) => members.find((m) => m.id === row.barber_id)?.name.trim().toLowerCase() === "eduardo").length } } };
}
