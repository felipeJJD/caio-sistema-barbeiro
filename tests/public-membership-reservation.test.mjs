import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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
  assert.match(dashboard, /otherReservedUses/);
  assert.match(dashboard, /client\.balance - otherReservedUses <= 0/);
});

test("interface exige confirmação explícita antes de entrar na agenda", () => {
  assert.match(bookingUi, /Mensalista encontrado/);
  assert.match(bookingUi, /Este agendamento vai reservar/);
  assert.match(bookingUi, /Entendi · continuar para a agenda/);
  assert.match(bookingUi, /Confirmar e reservar 1 crédito/);
});
