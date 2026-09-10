import assert from "node:assert/strict";
import test from "node:test";

import { appDaysUntil, membershipRenewalDates, nextMonthDueDate } from "../lib/app-date.ts";

test("keeps the payment day for the next monthly due date", () => {
  assert.equal(nextMonthDueDate("2026-08-26"), "2026-09-26");
});

test("uses the last valid day when the next month is shorter", () => {
  assert.equal(nextMonthDueDate("2026-01-31"), "2026-02-28");
  assert.equal(nextMonthDueDate("2028-01-31"), "2028-02-29");
});

test("still accepts an explicit billing day when needed", () => {
  assert.equal(nextMonthDueDate("2026-08-26", 8), "2026-09-08");
});

test("counts the days remaining until a membership renewal", () => {
  assert.equal(appDaysUntil("2026-09-02", "2026-08-30"), 3);
  assert.equal(appDaysUntil("2026-08-30", "2026-08-30"), 0);
  assert.equal(appDaysUntil("2026-08-28", "2026-08-30"), -2);
  assert.equal(appDaysUntil("2026-02-30", "2026-02-28"), null);
});

test("an early membership renewal is registered for the upcoming due month", () => {
  assert.deepEqual(membershipRenewalDates("2026-09-08", "2026-08-30"), {
    paidMonth: "2026-09",
    dueDate: "2026-10-08",
  });
});

test("an overdue membership renewal catches up and keeps its billing day", () => {
  assert.deepEqual(membershipRenewalDates("2026-08-08", "2026-09-10"), {
    paidMonth: "2026-09",
    dueDate: "2026-10-08",
  });
});
