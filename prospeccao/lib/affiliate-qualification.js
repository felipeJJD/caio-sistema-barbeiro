import { ensureClaimsSchema, getPool, normalizeProspectorKey, rowToClaim } from "./affiliate-claims.js";
import { text } from "./funnel-records.js";

let qualificationSchemaReady;

async function ensureQualificationSchema() {
  if (qualificationSchemaReady) return qualificationSchemaReady;
  qualificationSchemaReady = (async () => {
    await ensureClaimsSchema();
    const db = getPool();
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS qualification TEXT NOT NULL DEFAULT '';`);
    await db.query(`CREATE INDEX IF NOT EXISTS affiliate_prospecting_claims_qualification_idx ON affiliate_prospecting_claims (prospector_key, qualification, updated_at DESC) WHERE qualification <> '';`);
  })().catch((error) => {
    qualificationSchemaReady = undefined;
    throw error;
  });
  return qualificationSchemaReady;
}

function qualifiedClaim(row) {
  return { ...rowToClaim(row), qualification: String(row.qualification || "") };
}

export async function enrichClaimQualifications(result) {
  const items = Array.isArray(result?.items) ? result.items : [];
  if (!items.length) return result;
  await ensureQualificationSchema();
  const keys = items.map((item) => String(item.key || "")).filter(Boolean);
  const rows = await getPool().query(
    `SELECT lead_key, qualification FROM affiliate_prospecting_claims WHERE lead_key = ANY($1::text[])`,
    [keys],
  );
  const qualifications = new Map(rows.rows.map((row) => [row.lead_key, String(row.qualification || "")]));
  return {
    ...result,
    items: items.map((item) => ({ ...item, qualification: qualifications.get(item.key) || "" })),
  };
}

export async function markClaimInterested(keyValue, input = {}) {
  const prospectorKey = normalizeProspectorKey(input.prospectorKey);
  const key = text(keyValue, 220);
  if (!/^phone:55\d{11}$/.test(key)) {
    const error = new Error("Barbearia inválida.");
    error.status = 400;
    throw error;
  }
  await ensureQualificationSchema();
  const result = await getPool().query(
    `UPDATE affiliate_prospecting_claims
     SET qualification = 'interested', updated_at = NOW()
     WHERE lead_key = $1
       AND prospector_key = $2
       AND status = 'contacted'
       AND responded_at IS NOT NULL
     RETURNING *`,
    [key, prospectorKey],
  );
  if (!result.rowCount) {
    const error = new Error("Só é possível marcar como interessado um contato que respondeu e pertence a você.");
    error.status = 409;
    throw error;
  }
  return qualifiedClaim(result.rows[0]);
}

export async function listInterestedClaims(input = {}) {
  const prospectorKey = normalizeProspectorKey(input.prospectorKey);
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 50));
  const offset = Math.max(0, Math.min(100000, Number(input.offset) || 0));
  await ensureQualificationSchema();
  const result = await getPool().query(
    `SELECT * FROM affiliate_prospecting_claims
     WHERE prospector_key = $1
       AND qualification = 'interested'
       AND status = 'contacted'
     ORDER BY COALESCE(last_inbound_at, contacted_at) DESC NULLS LAST, updated_at DESC, lead_key
     LIMIT $2 OFFSET $3`,
    [prospectorKey, limit + 1, offset],
  );
  return {
    view: "interested",
    items: result.rows.slice(0, limit).map(qualifiedClaim),
    hasMore: result.rows.length > limit,
    nextOffset: offset + limit,
  };
}
