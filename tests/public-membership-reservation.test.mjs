import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const [publicBooking, dashboard, schema, membershipRoute, bookingUi, migration] = await Promise.all([
  readFile(new URL("../db/public-booking.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/dashboard.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/api/public-booking/[slug]/membership/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/public-booking-app.tsx", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0042_membership_credit_reservations.sql", import.meta.url), "utf8"),
]);

test("busca pública mostra apenas candidatos da organização e exige ao menos 3 letras", () => {
  assert.match(membershipRoute, /query\.length < 3/);
  assert.match(publicBooking, /eq\(clients\.organizationId, organization\.id\)/);
  assert.match(publicBooking, /slice\(0, 8\)/);
  assert.match(publicBooking, /membershipNameNeedsPhone/);
});

test("agendamento mensalista reserva crédito de forma atômica no mesmo INSERT", () => {
  assert.match(publicBooking, /membership_credit_state/);
  assert.match(publicBooking, /'reserved'/);
  assert.match(publicBooking, /membership_client\.balance > \(/);
  assert.match(publicBooking, /reserved_credit\.membership_credit_state = 'reserved'/);
  assert.match(publicBooking, /membership_plan_id/);
});

test("cancelamento libera reserva e remarcação não cria outra", () => {
  assert.match(publicBooking, /membershipCreditState: row\.membershipCreditState === "reserved" \? "released"/);
  assert.match(dashboard, /membershipCreditState: existing\.membershipCreditState === "reserved" \? "released"/);
  assert.doesNotMatch(publicBooking, /reschedulePublicBooking[\s\S]*membershipCreditState:\s*"reserved"/);
});

test("conclusão é idempotente por appointment_id e consome apenas uma vez", () => {
  assert.match(schema, /appointmentId: integer\("appointment_id"\)/);
  assert.match(schema, /uniqueIndex\("daily_records_appointment_unique"\)/);
  assert.match(dashboard, /eq\(dailyRecords\.appointmentId, appointment\.id\)/);
  assert.match(dashboard, /appointmentId: appointment\.id/);
  assert.match(dashboard, /membershipCreditState: appointment\.paymentChoice === "Mensalista" \? "consumed"/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS `daily_records_appointment_unique`/);
});

test("uso manual não pode roubar crédito já reservado", () => {
  assert.match(dashboard, /claimedCredit/);
  assert.match(dashboard, /membership_credit_state = 'reserved'/);
  assert.match(dashboard, /reserved_credit\.id <>/);
});

test("interface exige confirmação explícita antes de entrar na agenda", () => {
  assert.match(bookingUi, /Mensalista encontrado/);
  assert.match(bookingUi, /Quando você confirmar o horário/);
  assert.match(bookingUi, /será reservado/);
  assert.match(bookingUi, /Entendi · continuar para a agenda/);
  assert.match(bookingUi, /Confirmar e reservar 1 crédito/);
});


function membershipInsertSql() {
  const match = publicBooking.match(/const inserted = membership\s+\? await database\.prepare\(`([\s\S]*?)`\)\.bind\(/);
  assert.ok(match?.[1], "SQL atômico do agendamento mensalista não foi encontrado");
  return match[1];
}

function membershipInsertBindings({ time, clientId = 1, planId = 3, balanceOrganizationId = 7 } = {}) {
  const start = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return [
    7, "2026-09-21", time, "João Silva", "(41) 99999-9999",
    10, 2, "Mensalista · Plano · Corte", "Agendado", "Mensalista", null, "hash",
    clientId, planId,
    clientId, balanceOrganizationId, planId, 7,
    7, "2026-09-21", 2, start + 30, start,
  ];
}

test("último crédito não pode ser reservado duas vezes e cancelamento libera a reserva", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE clients (
      id INTEGER PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      deleted_at TEXT,
      plan_id INTEGER NOT NULL,
      balance INTEGER NOT NULL
    );
    CREATE TABLE services (
      id INTEGER PRIMARY KEY,
      duration_minutes INTEGER NOT NULL
    );
    CREATE TABLE appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      client_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      service_id INTEGER NOT NULL,
      barber_id INTEGER NOT NULL,
      notes TEXT NOT NULL,
      status TEXT NOT NULL,
      payment_choice TEXT NOT NULL,
      payment_confirmation_token TEXT,
      management_token_hash TEXT,
      membership_client_id INTEGER,
      membership_plan_id INTEGER,
      membership_credit_state TEXT
    );
    INSERT INTO clients (id, organization_id, status, deleted_at, plan_id, balance)
      VALUES (1, 7, 'Ativo', NULL, 3, 1);
    INSERT INTO services (id, duration_minutes) VALUES (10, 30);
  `);
  const statement = db.prepare(membershipInsertSql());

  const first = statement.get(...membershipInsertBindings({ time: "10:00" }));
  assert.ok(first?.id, "primeira reserva deveria usar o único crédito");

  const second = statement.get(...membershipInsertBindings({ time: "11:00" }));
  assert.equal(second, undefined, "o mesmo último crédito não pode gerar outra reserva");

  db.prepare("UPDATE appointments SET appointment_date = ?, appointment_time = ? WHERE id = ?")
    .run("2026-09-22", "12:00", first.id);
  const afterReschedule = statement.get(...membershipInsertBindings({ time: "13:00" }));
  assert.equal(afterReschedule, undefined, "remarcar deve manter o mesmo crédito reservado");

  db.prepare("UPDATE appointments SET status = 'Cancelado', membership_credit_state = 'released' WHERE id = ?")
    .run(first.id);
  const afterCancel = statement.get(...membershipInsertBindings({ time: "14:00" }));
  assert.ok(afterCancel?.id, "cancelamento deve liberar o crédito para uma nova reserva");

  db.close();
});
