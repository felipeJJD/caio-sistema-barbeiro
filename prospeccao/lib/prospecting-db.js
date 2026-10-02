import pg from "pg";
import { normalizeLead, statusTransition, text } from "./funnel-records.js";

const { Pool } = pg;
let pool;
let schemaReady;

function databaseUrl() {
  return String(process.env.PROSPECCAO_DATABASE_URL || "").trim();
}

function workspaceId() {
  return text(process.env.PROSPECCAO_WORKSPACE_ID || "owner-preview", 120) || "owner-preview";
}

function getPool() {
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

export async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = getPool();
    await db.query(`
      CREATE TABLE IF NOT EXISTS prospecting_funnel (
        workspace_id TEXT NOT NULL,
        lead_key TEXT NOT NULL,
        source_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        phone_e164 TEXT NOT NULL,
        address TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL DEFAULT '',
        message TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'preparado'
          CHECK (status IN ('preparado','contatado','respondeu','interessado','sem_interesse')),
        do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (workspace_id, lead_key)
      );
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS prospecting_funnel_phone_idx ON prospecting_funnel (workspace_id, phone_e164);`);
    await db.query(`CREATE INDEX IF NOT EXISTS prospecting_funnel_source_idx ON prospecting_funnel (workspace_id, source_id) WHERE source_id <> '';`);
    await db.query(`CREATE INDEX IF NOT EXISTS prospecting_funnel_active_idx ON prospecting_funnel (workspace_id, updated_at DESC) WHERE archived_at IS NULL;`);
    await db.query(`CREATE INDEX IF NOT EXISTS prospecting_funnel_dnc_idx ON prospecting_funnel (workspace_id, do_not_contact) WHERE do_not_contact = TRUE;`);
  })().catch((error) => {
    schemaReady = undefined;
    throw error;
  });
  return schemaReady;
}

function rowToItem(row) {
  return {
    key: row.lead_key,
    id: row.source_id,
    name: row.name,
    phone: row.phone,
    phoneE164: row.phone_e164,
    whatsappCandidate: /^55\d{11}$/.test(String(row.phone_e164 || "")),
    address: row.address,
    sourceUrl: row.source_url,
    city: row.city,
    status: row.status,
    message: row.message,
    doNotContact: Boolean(row.do_not_contact),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

async function listWith(db) {
  const result = await db.query(
    `SELECT * FROM prospecting_funnel
     WHERE workspace_id = $1 AND archived_at IS NULL
     ORDER BY updated_at DESC`,
    [workspaceId()],
  );
  return result.rows.map(rowToItem);
}

export async function listFunnel() {
  await ensureSchema();
  return listWith(getPool());
}

export async function addFunnelContacts(rawLeads, fallbackCity = "") {
  await ensureSchema();
  const db = getPool();
  const client = await db.connect();
  const added = [];
  const duplicates = [];
  const blocked = [];

  try {
    await client.query("BEGIN");
    for (const raw of Array.isArray(rawLeads) ? rawLeads : []) {
      let lead;
      try {
        lead = normalizeLead(raw, fallbackCity);
      } catch (error) {
        blocked.push({ name: text(raw?.name || "Contato", 240), reason: error.message });
        continue;
      }

      const existingResult = await client.query(
        `SELECT * FROM prospecting_funnel
         WHERE workspace_id = $1
           AND (phone_e164 = $2 OR ($3 <> '' AND source_id = $3))
         ORDER BY do_not_contact DESC, updated_at DESC
         LIMIT 1
         FOR UPDATE`,
        [workspaceId(), lead.phoneE164, lead.sourceId],
      );
      const existing = existingResult.rows[0];

      if (existing?.do_not_contact) {
        blocked.push({ name: existing.name || lead.name, reason: "Marcado como não contatar." });
        continue;
      }

      if (existing && !existing.archived_at) {
        duplicates.push({ name: existing.name || lead.name, key: existing.lead_key });
        continue;
      }

      if (existing) {
        const restored = await client.query(
          `UPDATE prospecting_funnel
           SET source_id = $3, name = $4, phone = $5, phone_e164 = $6,
               address = $7, city = $8, source_url = $9, message = $10,
               archived_at = NULL, updated_at = NOW()
           WHERE workspace_id = $1 AND lead_key = $2
           RETURNING *`,
          [workspaceId(), existing.lead_key, lead.sourceId, lead.name, lead.phone, lead.phoneE164, lead.address, lead.city, lead.sourceUrl, lead.message],
        );
        added.push(rowToItem(restored.rows[0]));
        continue;
      }

      const inserted = await client.query(
        `INSERT INTO prospecting_funnel
          (workspace_id, lead_key, source_id, name, phone, phone_e164, address, city, source_url, message, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'preparado')
         RETURNING *`,
        [workspaceId(), lead.leadKey, lead.sourceId, lead.name, lead.phone, lead.phoneE164, lead.address, lead.city, lead.sourceUrl, lead.message],
      );
      added.push(rowToItem(inserted.rows[0]));
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return { added, duplicates, blocked, funnel: await listFunnel() };
}

export async function updateFunnelStatus(key, nextStatus) {
  await ensureSchema();
  const db = getPool();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const currentResult = await client.query(
      `SELECT * FROM prospecting_funnel WHERE workspace_id = $1 AND lead_key = $2 LIMIT 1 FOR UPDATE`,
      [workspaceId(), text(key, 220)],
    );
    const current = currentResult.rows[0];
    if (!current) {
      const error = new Error("Contato não encontrado no funil.");
      error.status = 404;
      throw error;
    }
    const transition = statusTransition({ doNotContact: current.do_not_contact }, nextStatus);
    const updated = await client.query(
      `UPDATE prospecting_funnel
       SET status = $3, do_not_contact = $4, updated_at = NOW()
       WHERE workspace_id = $1 AND lead_key = $2
       RETURNING *`,
      [workspaceId(), current.lead_key, transition.status, transition.doNotContact],
    );
    await client.query("COMMIT");
    return rowToItem(updated.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function archiveFunnelContact(key) {
  await ensureSchema();
  const result = await getPool().query(
    `UPDATE prospecting_funnel
     SET archived_at = NOW(), updated_at = NOW()
     WHERE workspace_id = $1 AND lead_key = $2
     RETURNING lead_key, do_not_contact`,
    [workspaceId(), text(key, 220)],
  );
  if (!result.rowCount) {
    const error = new Error("Contato não encontrado no funil.");
    error.status = 404;
    throw error;
  }
  return { key: result.rows[0].lead_key, doNotContact: Boolean(result.rows[0].do_not_contact) };
}

export async function databaseHealth() {
  await ensureSchema();
  const result = await getPool().query("SELECT NOW() AS now");
  return { ok: true, now: result.rows[0]?.now };
}
