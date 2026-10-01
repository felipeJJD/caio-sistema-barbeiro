import { and, eq } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { getDb } from "./index";

export const CA_ATENDE_FLOW_TTL_MS = 5 * 24 * 60 * 60 * 1000;

const caAtendeFlowTags = sqliteTable("ca_atende_flow_tags", {
  organizationId: integer("organization_id").notNull(),
  phone: text("phone").notNull(),
  startedAt: text("started_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.organizationId, table.phone] }),
]);

export async function getCaAtendeFlowState(organizationId: number, phone: string, now = new Date()) {
  const db = await getDb();
  const row = (await db.select({
    startedAt: caAtendeFlowTags.startedAt,
    expiresAt: caAtendeFlowTags.expiresAt,
  }).from(caAtendeFlowTags).where(and(
    eq(caAtendeFlowTags.organizationId, organizationId),
    eq(caAtendeFlowTags.phone, phone),
  )).limit(1))[0] ?? null;

  const expiresAtMs = row ? Date.parse(row.expiresAt) : Number.NaN;
  return {
    active: Boolean(row) && Number.isFinite(expiresAtMs) && expiresAtMs > now.getTime(),
    startedAt: row?.startedAt ?? null,
    expiresAt: row?.expiresAt ?? null,
  };
}

export async function startCaAtendeFlow(organizationId: number, phone: string, now = new Date()) {
  const db = await getDb();
  const startedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + CA_ATENDE_FLOW_TTL_MS).toISOString();

  await db.insert(caAtendeFlowTags).values({
    organizationId,
    phone,
    startedAt,
    expiresAt,
    updatedAt: startedAt,
  }).onConflictDoUpdate({
    target: [caAtendeFlowTags.organizationId, caAtendeFlowTags.phone],
    set: {
      startedAt,
      expiresAt,
      updatedAt: startedAt,
    },
  });

  return { startedAt, expiresAt };
}
