import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const publicBooking = await readFile(new URL("../db/public-booking.ts", import.meta.url), "utf8");

function membershipInsertSql() {
  const match = publicBooking.match(/const inserted = membership\s+\? await database\.prepare\(`([\s\S]*?)`\)\.bind\(/);
  assert.ok(match?.[1], "SQL do agendamento mensalista não foi encontrado");
  return match[1];
}

function regularInsertSql() {
  const match = publicBooking.match(/\n\s*: await database\.prepare\(`([\s\S]*?)`\)\.bind\(/);
  assert.ok(match?.[1], "SQL do agendamento avulso não foi encontrado");
  return match[1];
}

function setupDb() {
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
      VALUES (1, 7, 'Ativo', NULL, 3, 4);
    INSERT INTO services (id, duration_minutes) VALUES (10, 30);
  `);
  return db;
}

function membershipBindings(time = "10:00") {
  const start = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return [
    7, "2026-09-21", time, "Mensalista", "41999999999",
    10, 2, "Mensalista · Plano · Corte", "Agendado", "Mensalista", null, "hash-mensalista",
    1, 3,
    1, 7, 3, 7,
    7, "2026-09-21", 2, start + 30, start,
  ];
}

function regularBindings(time = "10:00") {
  const start = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return [
    7, "2026-09-21", time, "Cliente avulso", "41988888888",
    10, 2, "Solicitado pelo link público", "Agendado", "Dinheiro", null, "hash-avulso",
    7, "2026-09-21", 2, start + 30, start,
  ];
}

test("avulso ativo bloqueia o mesmo horário para mensalista", () => {
  const db = setupDb();
  const regular = db.prepare(regularInsertSql());
  const membership = db.prepare(membershipInsertSql());

  const first = regular.get(...regularBindings("10:00"));
  assert.ok(first?.id, "o avulso deveria ocupar o horário primeiro");

  const second = membership.get(...membershipBindings("10:00"));
  assert.equal(second, undefined, "mensalista não pode ocupar horário já usado por avulso");
  db.close();
});

test("mensalista ativo bloqueia o mesmo horário para avulso", () => {
  const db = setupDb();
  const regular = db.prepare(regularInsertSql());
  const membership = db.prepare(membershipInsertSql());

  const first = membership.get(...membershipBindings("10:00"));
  assert.ok(first?.id, "o mensalista deveria ocupar o horário primeiro");

  const second = regular.get(...regularBindings("10:00"));
  assert.equal(second, undefined, "avulso não pode ocupar horário já usado por mensalista");
  db.close();
});

test("cancelado libera o horário para o outro tipo de cliente", () => {
  const db = setupDb();
  const regular = db.prepare(regularInsertSql());
  const membership = db.prepare(membershipInsertSql());

  const first = regular.get(...regularBindings("10:00"));
  assert.ok(first?.id);
  db.prepare("UPDATE appointments SET status = 'Cancelado' WHERE id = ?").run(first.id);

  const second = membership.get(...membershipBindings("10:00"));
  assert.ok(second?.id, "um cancelamento deve liberar o horário novamente");
  db.close();
});
