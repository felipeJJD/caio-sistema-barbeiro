import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ORGANIZATIONS = Number(process.env.LOAD_ORGANIZATIONS ?? 10);
const INITIAL_RECORDS_PER_ORGANIZATION = Number(process.env.LOAD_RECORDS_PER_ORGANIZATION ?? 1_000);
const INITIAL_SALES_PER_ORGANIZATION = Number(process.env.LOAD_SALES_PER_ORGANIZATION ?? 200);
const TOTAL_VIRTUAL_USERS = Number(process.env.LOAD_VIRTUAL_USERS ?? 20);
const CURRENT_MONTH = "2026-08";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "cortou-anotou-load-"));
const databasePath = join(temporaryDirectory, "load-test.sqlite");
const db = new DatabaseSync(databasePath);

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function createSchema() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE organizations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE team (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE services (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT NOT NULL, price_cents INTEGER NOT NULL);
    CREATE TABLE payment_methods (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT NOT NULL, fee_bps INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE shop_products (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, name TEXT NOT NULL, cost_cents INTEGER NOT NULL, price_cents INTEGER NOT NULL);
    CREATE TABLE daily_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      client_name TEXT NOT NULL,
      barber_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      payment_method_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      value_cents INTEGER NOT NULL,
      commission_cents INTEGER NOT NULL,
      tip_cents INTEGER NOT NULL DEFAULT 0,
      fee_cents INTEGER NOT NULL DEFAULT 0,
      origin TEXT NOT NULL DEFAULT 'Retorno',
      record_type TEXT NOT NULL DEFAULT 'Avulso'
    );
    CREATE TABLE product_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      seller_team_member_id INTEGER NOT NULL,
      payment_method_id INTEGER NOT NULL,
      occurred_at TEXT NOT NULL,
      client_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      unit_cost_cents INTEGER NOT NULL,
      commission_cents INTEGER NOT NULL,
      fee_cents INTEGER NOT NULL
    );
    CREATE INDEX daily_records_organization_date_idx ON daily_records (organization_id, occurred_at);
    CREATE INDEX daily_records_barber_date_idx ON daily_records (barber_id, occurred_at);
    CREATE INDEX product_sales_organization_date_idx ON product_sales (organization_id, occurred_at);
    CREATE INDEX product_sales_seller_date_idx ON product_sales (seller_team_member_id, occurred_at);
  `);
}

function seed() {
  const insertOrganization = db.prepare("INSERT INTO organizations (id, name) VALUES (?, ?)");
  const insertTeam = db.prepare("INSERT INTO team (id, organization_id, name) VALUES (?, ?, ?)");
  const insertService = db.prepare("INSERT INTO services (id, organization_id, name, price_cents) VALUES (?, ?, ?, ?)");
  const insertPayment = db.prepare("INSERT INTO payment_methods (id, organization_id, name, fee_bps) VALUES (?, ?, ?, ?)");
  const insertProduct = db.prepare("INSERT INTO shop_products (id, organization_id, name, cost_cents, price_cents) VALUES (?, ?, ?, ?, ?)");
  const insertRecord = db.prepare(`
    INSERT INTO daily_records
      (organization_id, occurred_at, client_name, barber_id, service_id, payment_method_id, quantity, value_cents, commission_cents, tip_cents, fee_cents, origin, record_type)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
  `);
  const insertSale = db.prepare(`
    INSERT INTO product_sales
      (organization_id, product_id, seller_team_member_id, payment_method_id, occurred_at, client_name, quantity, unit_price_cents, unit_cost_cents, commission_cents, fee_cents)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (let organizationId = 1; organizationId <= ORGANIZATIONS; organizationId += 1) {
      const baseId = organizationId * 100;
      insertOrganization.run(organizationId, `Barbearia Teste ${organizationId}`);
      insertTeam.run(baseId + 1, organizationId, `Proprietário ${organizationId}`);
      insertTeam.run(baseId + 2, organizationId, `Barbeiro ${organizationId}`);
      insertService.run(baseId + 1, organizationId, "Corte", 4500);
      insertService.run(baseId + 2, organizationId, "Cabelo e barba", 7000);
      insertPayment.run(baseId + 1, organizationId, "Pix", 0);
      insertPayment.run(baseId + 2, organizationId, "Crédito", 350);
      insertProduct.run(baseId + 1, organizationId, "Pomada", 1500, 3000);

      for (let index = 0; index < INITIAL_RECORDS_PER_ORGANIZATION; index += 1) {
        const day = String((index % 28) + 1).padStart(2, "0");
        const month = index < 600 ? CURRENT_MONTH : index < 850 ? "2026-07" : "2026-06";
        const valueCents = index % 3 === 0 ? 7000 : 4500;
        const barberId = baseId + (index % 2) + 1;
        const serviceId = baseId + (index % 3 === 0 ? 2 : 1);
        const paymentId = baseId + (index % 4 === 0 ? 2 : 1);
        insertRecord.run(organizationId, `${month}-${day}`, `Cliente ${organizationId}-${index}`, barberId, serviceId, paymentId, valueCents, Math.round(valueCents * 0.5), index % 25 === 0 ? 1000 : 0, paymentId === baseId + 2 ? Math.round(valueCents * 0.035) : 0, index % 3 === 0 ? "Indicação" : "Retorno", "Avulso");
      }

      for (let index = 0; index < INITIAL_SALES_PER_ORGANIZATION; index += 1) {
        const day = String((index % 28) + 1).padStart(2, "0");
        insertSale.run(organizationId, baseId + 1, baseId + (index % 2) + 1, baseId + 1, `${CURRENT_MONTH}-${day}`, `Cliente Produto ${organizationId}-${index}`, 1, 3000, 1500, 300, 0);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

let readRecords;
let readSales;
let createRecord;

function prepareStatements() {
  readRecords = db.prepare(`
  SELECT r.id, r.organization_id, r.occurred_at, r.client_name, r.quantity,
         r.value_cents, r.commission_cents, r.tip_cents, r.fee_cents,
         t.name AS barber_name, s.name AS service_name, p.name AS payment_name
  FROM daily_records r
  INNER JOIN team t ON r.barber_id = t.id
  INNER JOIN services s ON r.service_id = s.id
  INNER JOIN payment_methods p ON r.payment_method_id = p.id
  WHERE r.organization_id = ? AND r.occurred_at >= ? AND r.occurred_at <= ?
  ORDER BY r.occurred_at DESC, r.id DESC
  `);

  readSales = db.prepare(`
  SELECT ps.id, ps.organization_id, ps.occurred_at, ps.client_name, ps.quantity,
         ps.unit_price_cents, ps.unit_cost_cents, ps.commission_cents, ps.fee_cents,
         sp.name AS product_name, t.name AS seller_name, p.name AS payment_name
  FROM product_sales ps
  INNER JOIN shop_products sp ON ps.product_id = sp.id
  INNER JOIN team t ON ps.seller_team_member_id = t.id
  INNER JOIN payment_methods p ON ps.payment_method_id = p.id
  WHERE ps.organization_id = ? AND ps.occurred_at >= ? AND ps.occurred_at <= ?
  ORDER BY ps.occurred_at DESC, ps.id DESC
  `);

  createRecord = db.prepare(`
  INSERT INTO daily_records
    (organization_id, occurred_at, client_name, barber_id, service_id, payment_method_id, quantity, value_cents, commission_cents, tip_cents, fee_cents, origin, record_type)
  VALUES (?, '2026-08-26', ?, ?, ?, ?, 1, 4500, 2250, 0, 0, 'Retorno', 'Avulso')
  `);
}

function dashboardSnapshot(organizationId) {
  const records = readRecords.all(organizationId, `${CURRENT_MONTH}-01`, `${CURRENT_MONTH}-31`);
  const sales = readSales.all(organizationId, `${CURRENT_MONTH}-01`, `${CURRENT_MONTH}-31`);
  if (records.some((record) => Number(record.organization_id) !== organizationId)) throw new Error("Vazamento de dados entre barbearias em atendimentos");
  if (sales.some((sale) => Number(sale.organization_id) !== organizationId)) throw new Error("Vazamento de dados entre barbearias em vendas");

  const currentRecords = records.filter((record) => String(record.occurred_at).startsWith(CURRENT_MONTH));
  const revenueCents = currentRecords.reduce((sum, record) => sum + Number(record.value_cents) + Number(record.tip_cents), 0);
  const commissionCents = currentRecords.reduce((sum, record) => sum + Number(record.commission_cents) + Number(record.tip_cents), 0);
  const currentSales = sales.filter((sale) => String(sale.occurred_at).startsWith(CURRENT_MONTH));
  const payload = JSON.stringify({ records, sales, stats: { revenueCents, commissionCents, visits: currentRecords.length, productSales: currentSales.length } });
  return { rows: records.length + sales.length, payloadBytes: Buffer.byteLength(payload) };
}

function virtualUserOperation(userId, sequence) {
  const organizationId = (userId % ORGANIZATIONS) + 1;
  const startedAt = performance.now();
  let kind = "read";
  try {
    if (sequence % 5 === 0) {
      kind = "write";
      const baseId = organizationId * 100;
      createRecord.run(organizationId, `Carga ${userId}-${sequence}`, baseId + (userId % 2) + 1, baseId + 1, baseId + 1);
    }
    const snapshot = dashboardSnapshot(organizationId);
    return { kind, durationMs: performance.now() - startedAt, payloadBytes: snapshot.payloadBytes, error: null };
  } catch (error) {
    return { kind, durationMs: performance.now() - startedAt, payloadBytes: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function runStage(virtualUsers, rounds) {
  const results = [];
  for (let sequence = 1; sequence <= rounds; sequence += 1) {
    const waveStartedAt = performance.now();
    const wave = Array.from({ length: virtualUsers }, (_, userId) => new Promise((resolve) => {
      setImmediate(() => {
        const result = virtualUserOperation(userId, sequence);
        resolve({ ...result, endToEndMs: performance.now() - waveStartedAt });
      });
    }));
    results.push(...await Promise.all(wave));
  }
  return results;
}

function summarize(stage, virtualUsers, results) {
  const successful = results.filter((result) => !result.error);
  const readResults = successful.filter((result) => result.kind === "read");
  const writeResults = successful.filter((result) => result.kind === "write");
  return {
    stage,
    virtualUsers,
    operations: results.length,
    errors: results.length - successful.length,
    errorRatePercent: round(((results.length - successful.length) / results.length) * 100),
    readP95Ms: round(percentile(readResults.map((result) => result.endToEndMs), 0.95)),
    writeP95Ms: round(percentile(writeResults.map((result) => result.endToEndMs), 0.95)),
    maxMs: round(Math.max(...successful.map((result) => result.endToEndMs))),
    averagePayloadKb: round(successful.reduce((sum, result) => sum + result.payloadBytes, 0) / Math.max(1, successful.length) / 1024),
  };
}

function indexPlan(sql, organizationId) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(organizationId, `${CURRENT_MONTH}-01`, `${CURRENT_MONTH}-31`).map((row) => String(row.detail));
}

try {
  createSchema();
  prepareStatements();
  const seedStartedAt = performance.now();
  seed();
  const seededInMs = performance.now() - seedStartedAt;
  const stages = [];
  stages.push(summarize("aquecimento", 5, await runStage(5, 5)));
  stages.push(summarize("intermediário", 10, await runStage(10, 10)));
  stages.push(summarize("principal", TOTAL_VIRTUAL_USERS, await runStage(TOTAL_VIRTUAL_USERS, 20)));

  const recordCount = Number(db.prepare("SELECT count(*) AS count FROM daily_records").get().count);
  const saleCount = Number(db.prepare("SELECT count(*) AS count FROM product_sales").get().count);
  const indexPlans = {
    records: indexPlan("SELECT id FROM daily_records WHERE organization_id = ? AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at DESC, id DESC", 1),
    sales: indexPlan("SELECT id FROM product_sales WHERE organization_id = ? AND occurred_at >= ? AND occurred_at <= ? ORDER BY occurred_at DESC, id DESC", 1),
  };
  const failures = stages.flatMap((stage) => [
    ...(stage.errors > 0 ? [`${stage.stage}: houve ${stage.errors} erro(s)`] : []),
    ...(stage.readP95Ms > 1_000 ? [`${stage.stage}: leitura p95 acima de 1 segundo`] : []),
    ...(stage.writeP95Ms > 1_500 ? [`${stage.stage}: gravação p95 acima de 1,5 segundo`] : []),
  ]);

  const report = {
    configuration: {
      organizations: ORGANIZATIONS,
      simultaneousVirtualUsers: TOTAL_VIRTUAL_USERS,
      initialRecordsPerOrganization: INITIAL_RECORDS_PER_ORGANIZATION,
      initialSalesPerOrganization: INITIAL_SALES_PER_ORGANIZATION,
      seededInMs: round(seededInMs),
    },
    finalDatabase: { dailyRecords: recordCount, productSales: saleCount },
    stages,
    indexPlans,
    passed: failures.length === 0,
    failures,
  };
  console.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 1;
} finally {
  db.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
