import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  bookingWeekday,
  isPublicBookingDateAllowed,
  parseBookingWeekdays,
  serializeBookingWeekdays,
} from "../lib/booking-weekdays.ts";

test("domingo fica fechado por padrão e segunda a sábado permanecem ativos", () => {
  assert.deepEqual(parseBookingWeekdays(null), [1, 2, 3, 4, 5, 6]);
  assert.equal(bookingWeekday("2026-08-30"), 0);
  assert.equal(bookingWeekday("2026-08-31"), 1);
  assert.equal(isPublicBookingDateAllowed("2026-08-30", parseBookingWeekdays(null)), false);
  assert.equal(isPublicBookingDateAllowed("2026-08-31", parseBookingWeekdays(null)), true);
});

test("dias configurados são normalizados sem repetições", () => {
  assert.equal(serializeBookingWeekdays([6, 1, 1, 3, 9, -1]), "1,3,6");
  assert.deepEqual(parseBookingWeekdays("0,2,4"), [0, 2, 4]);
  assert.equal(isPublicBookingDateAllowed("2026-08-30", [0, 2, 4]), true);
});

test("datas inválidas nunca são liberadas", () => {
  assert.equal(bookingWeekday("2026-02-30"), -1);
  assert.equal(isPublicBookingDateAllowed("texto", [0, 1, 2, 3, 4, 5, 6]), false);
});

test("calendário e servidor aplicam a mesma regra de dias fechados", async () => {
  const [publicApp, bookingDb] = await Promise.all([
    readFile(new URL("../app/ui/public-booking-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../db/public-booking.ts", import.meta.url), "utf8"),
  ]);
  assert.match(publicApp, /const closed = !isPublicBookingDateAllowed/);
  assert.match(bookingDb, /const dayHours = bookingHoursForDate\(data\.organization\.weeklyHours, date\)/);
  assert.match(bookingDb, /if \(!dayHours\?\.enabled\)/);
});
