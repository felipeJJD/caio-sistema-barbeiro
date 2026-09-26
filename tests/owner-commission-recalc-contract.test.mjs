import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routeSource = await readFile(new URL("../app/api/action/route.ts", import.meta.url), "utf8");
const recalcSource = await readFile(new URL("../db/owner-commission.ts", import.meta.url), "utf8");

test("owner commission update recalculates only the owner's open avulso records", () => {
  assert.match(routeSource, /teamMemberId === access\.teamMemberId/);
  assert.match(routeSource, /recalculateOpenOwnerAvulsoCommissions\(access, commissionRateBps\)/);
  assert.match(recalcSource, /eq\(dailyRecords\.recordType, "Avulso"\)/);
  assert.match(recalcSource, /teamPaymentClosures\.lastDailyRecordId/);
  assert.match(recalcSource, /gt\(dailyRecords\.id, latestClosure\.lastDailyRecordId\)/);
  assert.match(recalcSource, /gte\(dailyRecords\.occurredAt, `\$\{appMonth\(\)\}-01`\)/);
  assert.match(recalcSource, /dailyRecords\.valueCents/);
  assert.match(recalcSource, /commissionRateBps: normalizedRate/);
});

test("owner commission recalc keeps memberships and closed records protected by construction", () => {
  assert.doesNotMatch(recalcSource, /recordType, "Mensalista"/);
  assert.match(recalcSource, /openPeriodCondition/);
  assert.match(recalcSource, /eq\(dailyRecords\.barberId, access\.teamMemberId\)/);
  assert.match(recalcSource, /eq\(dailyRecords\.organizationId, access\.organizationId\)/);
});
