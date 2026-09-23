import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("conta do funcionário nasce somente no confirmPendingRegistration", async () => {
  const source = await readFile(new URL("../db/verified-registration.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function startTeamInviteVerification");
  const confirm = source.indexOf("export async function confirmPendingRegistration");
  assert.ok(start >= 0 && confirm > start);
  const beforeConfirm = source.slice(start, confirm);
  assert.doesNotMatch(beforeConfirm, /db\.insert\(authAccounts\)/);
  assert.match(source.slice(confirm), /db\.insert\(authAccounts\)/);
});
