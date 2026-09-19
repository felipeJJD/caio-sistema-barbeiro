import assert from "node:assert/strict";
import test from "node:test";
import {
  bookingHoursForDate,
  bookingWeekdaysFromHours,
  bookingWindowAllows,
  parseTeamWeeklyBookingHours,
  parseWeeklyBookingHours,
  serializeTeamWeeklyBookingHours,
  serializeWeeklyBookingHours,
} from "../lib/booking-hours.ts";

test("horário semanal preserva expediente diferente no domingo", () => {
  const schedule = [
    { day: 0, enabled: true, openingTime: "09:00", closingTime: "13:00" },
    { day: 1, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 2, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 3, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 4, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 5, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 6, enabled: true, openingTime: "08:00", closingTime: "19:30" },
  ];
  const parsed = parseWeeklyBookingHours(serializeWeeklyBookingHours(schedule), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(bookingWeekdaysFromHours(parsed), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(bookingHoursForDate(parsed, "2026-09-20"), schedule[0]);
  assert.deepEqual(bookingHoursForDate(parsed, "2026-09-21"), schedule[1]);
});

test("dados antigos continuam usando dias e horário global como fallback", () => {
  const parsed = parseWeeklyBookingHours("", [1, 2, 3, 4, 5, 6], "10:00", "18:00");
  assert.equal(parsed[0].enabled, false);
  assert.equal(parsed[1].enabled, true);
  assert.equal(parsed[1].openingTime, "10:00");
  assert.equal(parsed[1].closingTime, "18:00");
});

test("horário semanal inválido não substitui silenciosamente um expediente válido", () => {
  assert.throws(() => serializeWeeklyBookingHours([
    { day: 0, enabled: true, openingTime: "13:00", closingTime: "09:00" },
  ]), /Escolha pelo menos um dia|horário/i);
});


test("profissional herda o expediente da barbearia enquanto não tiver horário próprio", () => {
  const shop = parseWeeklyBookingHours("", [1, 2, 3, 4, 5, 6], "08:00", "19:30");
  const professional = parseTeamWeeklyBookingHours("", shop);
  assert.deepEqual(professional, shop);
});

test("profissional pode ter domingo de folga sem fechar o domingo da barbearia", () => {
  const shop = parseWeeklyBookingHours(JSON.stringify([
    { day: 0, enabled: true, openingTime: "09:00", closingTime: "13:00" },
    { day: 1, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 2, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 3, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 4, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 5, enabled: true, openingTime: "08:00", closingTime: "19:30" },
    { day: 6, enabled: true, openingTime: "08:00", closingTime: "19:30" },
  ]), [0, 1, 2, 3, 4, 5, 6], "08:00", "19:30");
  const employee = shop.map((row) => row.day === 0 ? { ...row, enabled: false } : row);
  const parsed = parseTeamWeeklyBookingHours(serializeTeamWeeklyBookingHours(employee), shop);
  assert.equal(parsed[0].enabled, false);
  assert.equal(parsed[1].enabled, true);
});

test("janela do profissional respeita entrada, saída e duração do serviço", () => {
  const sunday = { day: 0, enabled: true, openingTime: "09:00", closingTime: "13:00" };
  assert.equal(bookingWindowAllows(sunday, 9 * 60, 30), true);
  assert.equal(bookingWindowAllows(sunday, 12 * 60 + 30, 30), true);
  assert.equal(bookingWindowAllows(sunday, 12 * 60 + 45, 30), false);
  assert.equal(bookingWindowAllows({ ...sunday, enabled: false }, 9 * 60, 30), false);
});
