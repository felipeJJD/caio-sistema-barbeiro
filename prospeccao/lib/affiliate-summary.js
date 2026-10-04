import { ensureClaimsSchema, getPool, normalizeProspectorKey } from "./affiliate-claims.js";

export async function getClaimSummary(owner) {
  const prospectorKey = normalizeProspectorKey(owner);
  await ensureClaimsSchema();
  const [counts, recent] = await Promise.all([
    getPool().query(`SELECT COUNT(*) FILTER (WHERE status IN ('contacted','do_not_contact')) AS contacted,
      COALESCE(SUM(reply_count), 0) AS received
      FROM affiliate_prospecting_claims WHERE prospector_key = $1`, [prospectorKey]),
    getPool().query(`SELECT name, responded_at IS NOT NULL AS received
      FROM affiliate_prospecting_claims WHERE prospector_key = $1 AND status IN ('contacted','do_not_contact')
      ORDER BY contacted_at DESC NULLS LAST, updated_at DESC, lead_key LIMIT 5`, [prospectorKey]),
  ]);
  return {
    contacted: Number(counts.rows[0]?.contacted || 0),
    received: Number(counts.rows[0]?.received || 0),
    recent: recent.rows.map((row) => ({ name: row.name || "Barbearia", received: row.received })),
  };
}
