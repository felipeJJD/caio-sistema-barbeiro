import pg from "pg";
import { isClearOptOut } from "./opt-out.js";
import { ensureSchema as ensureLegacySchema } from "./prospecting-db.js";
import { normalizePhoneE164, text } from "./funnel-records.js";

const { Pool } = pg;
const RESERVATION_MINUTES = 60;
let pool;
let schemaReady;

function databaseUrl() {
  return String(process.env.PROSPECCAO_DATABASE_URL || "").trim();
}

export function getPool() {
  if (pool) return pool;
  const connectionString = databaseUrl();
  if (!connectionString) {
    const error = new Error("Banco da Prospecção ainda não foi conectado ao aplicativo.");
    error.status = 503;
    throw error;
  }
  pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: process.env.PROSPECCAO_DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
}

export function normalizeProspectorKey(value) {
  const key = text(value, 120);
  if (!/^(?:admin|affiliate):[1-9]\d{0,11}$/.test(key)) {
    const error = new Error("Identificação do prospector inválida.");
    error.status = 400;
    throw error;
  }
  return key;
}

export function claimViewFrom(value) {
  return String(value || "contacted").toLowerCase() === "responded" ? "responded" : "contacted";
}

export function leadKeyFrom(value) {
  const phoneE164 = normalizePhoneE164(value?.phoneE164);
  return phoneE164 ? `phone:${phoneE164}` : "";
}

export function normalizeClaimLead(input = {}, fallbackCity = "") {
  const phoneE164 = normalizePhoneE164(input.phoneE164);
  if (!phoneE164) {
    const error = new Error("Contato sem celular brasileiro válido.");
    error.status = 400;
    throw error;
  }
  return {
    leadKey: `phone:${phoneE164}`,
    sourceId: text(input.id || input.sourceId, 180),
    name: text(input.name || "Barbearia", 240),
    phone: text(input.phone, 40),
    phoneE164,
    address: text(input.address, 600),
    city: text(input.city || fallbackCity, 180),
  };
}

function iso(value) {
  if (value instanceof Date) return value.toISOString();
  return value ? String(value) : null;
}

export async function ensureClaimsSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = getPool();
    await ensureLegacySchema();
    await db.query(`
      CREATE TABLE IF NOT EXISTS affiliate_prospecting_claims (
        lead_key TEXT PRIMARY KEY,
        source_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        phone_e164 TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        prospector_key TEXT NOT NULL,
        prospector_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'reserved'
          CHECK (status IN ('reserved','contacted','do_not_contact')),
        reserved_until TIMESTAMPTZ,
        contacted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS last_outbound_message TEXT NOT NULL DEFAULT '';`);
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS last_outbound_provider_id TEXT NOT NULL DEFAULT '';`);
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ;`);
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;`);
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS last_inbound_message TEXT NOT NULL DEFAULT '';`);
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS last_inbound_provider_id TEXT NOT NULL DEFAULT '';`);
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;`);
    await db.query(`ALTER TABLE affiliate_prospecting_claims ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;`);
    await db.query(`CREATE TABLE IF NOT EXISTS affiliate_prospecting_connections (
      prospector_key TEXT PRIMARY KEY, instance TEXT UNIQUE NOT NULL, phone TEXT UNIQUE NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`);
    await db.query(`ALTER TABLE affiliate_prospecting_connections ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;`);
    await db.query(`CREATE TABLE IF NOT EXISTS affiliate_prospecting_queue (
      id UUID PRIMARY KEY, batch_id UUID NOT NULL, lead_key TEXT UNIQUE NOT NULL REFERENCES affiliate_prospecting_claims(lead_key),
      prospector_key TEXT NOT NULL, instance TEXT NOT NULL, message TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','leased','sending','sent','failed','uncertain','cancelled')),
      attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_token UUID, lease_until TIMESTAMPTZ, provider_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`);
    await db.query(`ALTER TABLE affiliate_prospecting_queue ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT '';`);
    // Existing text-only jobs keep their original behavior. Audio jobs advance one
    // durable step at a time and retain the first provider ID during audio retries.
    await db.query(`ALTER TABLE affiliate_prospecting_queue ADD COLUMN IF NOT EXISTS approach_mode TEXT NOT NULL DEFAULT 'text';`);
    await db.query(`ALTER TABLE affiliate_prospecting_queue ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'text';`);
    await db.query(`ALTER TABLE affiliate_prospecting_queue ADD COLUMN IF NOT EXISTS audio_id UUID;`);
    await db.query(`ALTER TABLE affiliate_prospecting_queue ADD COLUMN IF NOT EXISTS text_provider_id TEXT NOT NULL DEFAULT '';`);
    await db.query(`ALTER TABLE affiliate_prospecting_queue ADD COLUMN IF NOT EXISTS audio_provider_id TEXT NOT NULL DEFAULT '';`);
    await db.query(`CREATE INDEX IF NOT EXISTS affiliate_prospecting_queue_owner_idx ON affiliate_prospecting_queue(prospector_key, created_at DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS affiliate_prospecting_queue_pending_idx ON affiliate_prospecting_queue(status, available_at);`);
    await db.query(`CREATE TABLE IF NOT EXISTS affiliate_prospecting_send_slots (
      instance TEXT PRIMARY KEY, next_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );`);
    await db.query(`CREATE TABLE IF NOT EXISTS affiliate_prospecting_inbound_events (
      instance TEXT NOT NULL, provider_id TEXT NOT NULL, lead_key TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (instance, provider_id)
    );`);
    await db.query(`CREATE INDEX IF NOT EXISTS affiliate_prospecting_claims_source_idx ON affiliate_prospecting_claims(source_id) WHERE source_id <> '';`);
    await db.query(`CREATE INDEX IF NOT EXISTS affiliate_prospecting_claims_status_idx ON affiliate_prospecting_claims (status, reserved_until);`);
    await db.query(`CREATE INDEX IF NOT EXISTS affiliate_prospecting_claims_owner_idx ON affiliate_prospecting_claims (prospector_key, updated_at DESC);`);
    await db.query(`CREATE INDEX IF NOT EXISTS affiliate_prospecting_claims_responses_idx ON affiliate_prospecting_claims (prospector_key, responded_at DESC) WHERE responded_at IS NOT NULL;`);
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

export function rowToClaim(row) {
  return {
    key: row.lead_key,
    id: row.source_id,
    name: row.name,
    phone: row.phone,
    phoneE164: row.phone_e164,
    address: row.address,
    city: row.city,
    prospectorKey: row.prospector_key,
    prospectorName: row.prospector_name,
    status: row.status,
    reservedUntil: iso(row.reserved_until),
    contactedAt: iso(row.contacted_at),
    lastOutboundMessage: row.last_outbound_message || "",
    lastOutboundProviderId: row.last_outbound_provider_id || "",
    lastOutboundAt: iso(row.last_outbound_at),
    respondedAt: iso(row.responded_at),
    lastInboundMessage: row.last_inbound_message || "",
    lastInboundProviderId: row.last_inbound_provider_id || "",
    lastInboundAt: iso(row.last_inbound_at),
    replyCount: Number(row.reply_count || 0),
  };
}

function isActiveReservation(row, now = Date.now()) {
  if (row?.status !== "reserved" || !row?.reserved_until) return false;
  if (row.reserved_until === Infinity || String(row.reserved_until).toLowerCase() === "infinity") return true;
  const value = row.reserved_until instanceof Date ? row.reserved_until.getTime() : Date.parse(String(row.reserved_until));
  return Number.isFinite(value) && value > now;
}

export async function filterAvailableLeads(rawLeads) {
  const leads = Array.isArray(rawLeads) ? rawLeads : [];
  const keys = [...new Set(leads.map(leadKeyFrom).filter(Boolean))];
  if (!keys.length || !databaseUrl()) return { leads, hiddenCount: 0 };
  await ensureClaimsSchema();
  const result = await getPool().query(
    `SELECT lead_key, status, reserved_until, responded_at
     FROM affiliate_prospecting_claims
     WHERE lead_key = ANY($1::text[])`,
    [keys],
  );
  const blocked = new Set();
  const now = Date.now();
  for (const row of result.rows) {
    if (row.status === "contacted" || row.status === "do_not_contact" || row.responded_at || isActiveReservation(row, now)) blocked.add(row.lead_key);
  }
  const legacy = await getPool().query(`SELECT lead_key, source_id FROM prospecting_funnel WHERE do_not_contact = TRUE AND (lead_key = ANY($1::text[]) OR source_id = ANY($2::text[]))`, [keys, leads.map(lead => String(lead.id || ""))]);
  const sourceBlocked = await getPool().query(`SELECT source_id FROM affiliate_prospecting_claims WHERE source_id = ANY($1::text[]) AND source_id <> '' AND (status IN ('contacted','do_not_contact') OR responded_at IS NOT NULL OR reserved_until > NOW())`, [leads.map(lead => String(lead.id || ""))]);
  const blockedSources = new Set([...legacy.rows, ...sourceBlocked.rows].map(row => row.source_id).filter(Boolean));
  for (const row of legacy.rows) blocked.add(row.lead_key);
  const available = leads.filter((lead) => {
    const key = leadKeyFrom(lead);
    return (!key || !blocked.has(key)) && !blockedSources.has(String(lead.id || ""));
  });
  return { leads: available, hiddenCount: leads.length - available.length };
}

export async function reserveClaimLeads(rawLeads, input = {}) {
  const prospectorKey = normalizeProspectorKey(input.prospectorKey);
  const prospectorName = text(input.prospectorName || prospectorKey, 140);
  const fallbackCity = text(input.city, 180);
  const leads = Array.isArray(rawLeads) ? rawLeads : [];
  if (!leads.length) {
    const error = new Error("Selecione pelo menos uma barbearia.");
    error.status = 400;
    throw error;
  }
  if (leads.length > 1000) {
    const error = new Error("Selecione até 1000 barbearias por operação. Nenhuma seleção será cortada.");
    error.status = 400;
    throw error;
  }

  await ensureClaimsSchema();
  const client = await getPool().connect();
  const reserved = [];
  const blocked = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(728421)");
    for (const rawLead of leads) {
      let lead;
      try {
        lead = normalizeClaimLead(rawLead, fallbackCity);
      } catch (error) {
        blocked.push({ name: text(rawLead?.name || "Barbearia", 240), reason: error instanceof Error ? error.message : "Contato inválido." });
        continue;
      }

      const legacy = await client.query(`SELECT lead_key FROM prospecting_funnel WHERE do_not_contact = TRUE AND (lead_key = $1 OR ($2 <> '' AND source_id = $2)) LIMIT 1`, [lead.leadKey, lead.sourceId]);
      const sameBusiness = await client.query(`SELECT lead_key FROM affiliate_prospecting_claims WHERE source_id = $1 AND source_id <> '' AND lead_key <> $2 AND (status IN ('contacted','do_not_contact') OR responded_at IS NOT NULL OR reserved_until > NOW()) LIMIT 1`, [lead.sourceId, lead.leadKey]);
      if (legacy.rowCount || sameBusiness.rowCount) {
        blocked.push({ name: lead.name, reason: "Essa barbearia já está reservada, contatada ou marcada para não contatar." });
        continue;
      }
      const inserted = await client.query(
        `INSERT INTO affiliate_prospecting_claims
          (lead_key, source_id, name, phone, phone_e164, address, city, prospector_key, prospector_name, status, reserved_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved', NOW() + ($10 * INTERVAL '1 minute'))
         ON CONFLICT (lead_key) DO NOTHING
         RETURNING *`,
        [lead.leadKey, lead.sourceId, lead.name, lead.phone, lead.phoneE164, lead.address, lead.city, prospectorKey, prospectorName, RESERVATION_MINUTES],
      );
      if (inserted.rowCount) {
        reserved.push(rowToClaim(inserted.rows[0]));
        continue;
      }

      const existingResult = await client.query(
        `SELECT * FROM affiliate_prospecting_claims WHERE lead_key = $1 LIMIT 1 FOR UPDATE`,
        [lead.leadKey],
      );
      const existing = existingResult.rows[0];
      if (!existing) {
        blocked.push({ name: lead.name, reason: "Não foi possível reservar agora." });
        continue;
      }
      const activeJob = await client.query(`SELECT id FROM affiliate_prospecting_queue WHERE lead_key = $1 AND status IN ('pending','leased','sending','uncertain')`, [lead.leadKey]);
      if (activeJob.rowCount) { blocked.push({ name: existing.name, reason: "Esse contato já está na fila de envio ou aguardando conferência." }); continue; }
      if (existing.reserved_until && new Date(existing.reserved_until).getTime() > Date.now() && existing.prospector_key === prospectorKey) {
        // Same owner may prepare twice; actual dispatch is made idempotent by the durable queue.
      }
      if (existing.status === "contacted" || existing.status === "do_not_contact" || existing.responded_at) {
        blocked.push({ name: existing.name || lead.name, reason: "Essa barbearia já foi contatada." });
        continue;
      }
      if (isActiveReservation(existing) && existing.prospector_key !== prospectorKey) {
        blocked.push({ name: existing.name || lead.name, reason: "Essa barbearia está reservada por outro afiliado." });
        continue;
      }

      const updated = await client.query(
        `UPDATE affiliate_prospecting_claims
         SET source_id = $2, name = $3, phone = $4, phone_e164 = $5, address = $6, city = $7,
             prospector_key = $8, prospector_name = $9, status = 'reserved',
             reserved_until = NOW() + ($10 * INTERVAL '1 minute'), updated_at = NOW()
         WHERE lead_key = $1
         RETURNING *`,
        [lead.leadKey, lead.sourceId, lead.name, lead.phone, lead.phoneE164, lead.address, lead.city, prospectorKey, prospectorName, RESERVATION_MINUTES],
      );
      reserved.push(rowToClaim(updated.rows[0]));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { reserved, blocked, reservationMinutes: RESERVATION_MINUTES };
}

export async function markClaimContacted(keyValue, input = {}) {
  const prospectorKey = normalizeProspectorKey(input.prospectorKey);
  const key = text(keyValue, 220);
  if (!/^phone:55\d{11}$/.test(key)) {
    const error = new Error("Barbearia inválida.");
    error.status = 400;
    throw error;
  }
  await ensureClaimsSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(728421)");
    const currentResult = await client.query(
      `SELECT * FROM affiliate_prospecting_claims WHERE lead_key = $1 LIMIT 1 FOR UPDATE`,
      [key],
    );
    const current = currentResult.rows[0];
    if (!current) {
      const error = new Error("Reserve a barbearia antes de marcar como contatada.");
      error.status = 404;
      throw error;
    }
    if (current.prospector_key !== prospectorKey) {
      const error = new Error("Esse contato pertence a outro afiliado."); error.status = 403; throw error;
    }
    if (current.status === "reserved" && !isActiveReservation(current)) {
      const error = new Error("A reserva expirou. Prepare a barbearia novamente."); error.status = 409; throw error;
    }
    if (current.status === "do_not_contact") {
      await client.query("COMMIT");
      return rowToClaim(current);
    }
    if (current.status !== "contacted" && isActiveReservation(current) && current.prospector_key !== prospectorKey) {
      const error = new Error("Essa barbearia foi reservada por outro afiliado.");
      error.status = 409;
      throw error;
    }
    const inFlight = await client.query(`SELECT id FROM affiliate_prospecting_queue WHERE lead_key = $1 AND status IN ('sending','uncertain')`, [key]);
    if (inFlight.rowCount) { const error = new Error("O envio está em andamento ou precisa de conferência no WhatsApp."); error.status = 409; throw error; }
    await client.query(`UPDATE affiliate_prospecting_queue SET status = 'cancelled', updated_at = NOW() WHERE lead_key = $1 AND status IN ('pending','leased')`, [key]);
    const outboundMessage = text(input.message, 1200);
    const providerMessageId = text(input.providerMessageId, 240);
    const updated = await client.query(
      `UPDATE affiliate_prospecting_claims
       SET status = 'contacted', prospector_key = $2, prospector_name = $3,
           reserved_until = NULL, contacted_at = COALESCE(contacted_at, NOW()),
           last_outbound_message = CASE WHEN $4 <> '' THEN $4 ELSE last_outbound_message END,
           last_outbound_provider_id = CASE WHEN $5 <> '' THEN $5 ELSE last_outbound_provider_id END,
           last_outbound_at = CASE WHEN $4 <> '' OR $5 <> '' THEN NOW() ELSE last_outbound_at END,
           updated_at = NOW()
       WHERE lead_key = $1
       RETURNING *`,
      [key, prospectorKey, text(input.prospectorName || prospectorKey, 140), outboundMessage, providerMessageId],
    );
    await client.query("COMMIT");
    return rowToClaim(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function recordClaimInbound(input = {}) {
  const phoneE164 = normalizePhoneE164(input.phoneE164);
  const providerMessageId = text(input.providerMessageId, 240);
  const inboundMessage = text(input.message || "Mensagem recebida", 2000);
  if (!phoneE164) return { matched: false, duplicate: false, item: null };
  await ensureClaimsSchema();
  const key = `phone:${phoneE164}`;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(728421)");
    const currentResult = await client.query(
      `SELECT * FROM affiliate_prospecting_claims WHERE lead_key = $1 LIMIT 1 FOR UPDATE`,
      [key],
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("COMMIT");
      return { matched: false, duplicate: false, item: null };
    }
    const instance = text(input.instance || "ca-prospeccao-outbound", 120);
    const affiliateMatch = /^ca-prospeccao-affiliate-([1-9]\d*)$/.exec(instance);
    const ownerMatches = affiliateMatch ? current.prospector_key === `affiliate:${affiliateMatch[1]}` : instance === "ca-prospeccao-outbound" && current.prospector_key.startsWith("admin:");
    if (!ownerMatches) { await client.query("COMMIT"); return { matched: false, duplicate: false, item: null }; }
    if (!providerMessageId) { await client.query("COMMIT"); return { matched: false, duplicate: false, item: null }; }
    const insertedEvent = await client.query(`INSERT INTO affiliate_prospecting_inbound_events(instance, provider_id, lead_key) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING provider_id`, [instance, providerMessageId, key]);
    if (!insertedEvent.rowCount || current.last_inbound_provider_id === providerMessageId) {
      await client.query("COMMIT");
      return { matched: true, duplicate: true, item: rowToClaim(current) };
    }
    const updated = await client.query(
      `UPDATE affiliate_prospecting_claims
       SET status = CASE WHEN status = 'do_not_contact' OR $4 THEN 'do_not_contact' ELSE 'contacted' END,
           reserved_until = NULL,
           contacted_at = COALESCE(contacted_at, NOW()),
           responded_at = COALESCE(responded_at, NOW()),
           last_inbound_message = $2,
           last_inbound_provider_id = $3,
           last_inbound_at = NOW(),
           reply_count = reply_count + 1,
           updated_at = NOW()
       WHERE lead_key = $1
       RETURNING *`,
      [key, inboundMessage, providerMessageId, isClearOptOut(inboundMessage)],
    );
    await client.query(`UPDATE affiliate_prospecting_queue SET status = 'cancelled', error = 'Cliente respondeu; atendimento humano.', updated_at = NOW() WHERE lead_key = $1 AND status IN ('pending','leased')`, [key]);
    await client.query("COMMIT");
    return { matched: true, duplicate: false, item: rowToClaim(updated.rows[0]) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listClaims(input = {}) {
  const prospectorKey = normalizeProspectorKey(input.prospectorKey);
  const view = claimViewFrom(input.view);
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 50));
  const offset = Math.max(0, Math.min(100000, Number(input.offset) || 0));
  await ensureClaimsSchema();
  const conditions = view === "responded"
    ? "prospector_key = $1 AND responded_at IS NOT NULL"
    : "prospector_key = $1 AND status IN ('contacted','do_not_contact')";
  const order = view === "responded" ? "last_inbound_at DESC NULLS LAST" : "contacted_at DESC NULLS LAST";
  const result = await getPool().query(
    `SELECT * FROM affiliate_prospecting_claims WHERE ${conditions} ORDER BY ${order}, updated_at DESC, lead_key LIMIT $2 OFFSET $3`,
    [prospectorKey, limit + 1, offset],
  );
  return { view, items: result.rows.slice(0, limit).map(rowToClaim), hasMore: result.rows.length > limit, nextOffset: offset + limit };
}

export async function getClaimSummary(owner) {
  const prospectorKey = normalizeProspectorKey(owner);
  await ensureClaimsSchema();
  const [counts, recent] = await Promise.all([
    getPool().query(`SELECT COUNT(*) FILTER (WHERE status IN ('contacted','do_not_contact')) AS contacted,
      COUNT(*) FILTER (WHERE responded_at IS NOT NULL) AS received
      FROM affiliate_prospecting_claims WHERE prospector_key = $1`, [prospectorKey]),
    getPool().query(`SELECT name, responded_at IS NOT NULL AS received
      FROM affiliate_prospecting_claims WHERE prospector_key = $1 AND status IN ('contacted','do_not_contact')
      ORDER BY contacted_at DESC NULLS LAST, updated_at DESC, lead_key LIMIT 5`, [prospectorKey]),
  ]);
  return { contacted: Number(counts.rows[0]?.contacted || 0), received: Number(counts.rows[0]?.received || 0),
    recent: recent.rows.map(row => ({ name: row.name || 'Barbearia', received: row.received })) };
}
