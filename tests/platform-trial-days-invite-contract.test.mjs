import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("reabertura manual usa a duração central configurada", async () => {
  const route = await read("app/api/platform/invites/route.ts");
  assert.match(route, /await getPlatformTrialDays\(\)/);
  assert.doesNotMatch(route, /restartBarbershopTrial\([^\n]*,\s*14\)/);
});

test("novo convite administrativo herda a duração central quando não informa outra", async () => {
  const auth = await read("db/auth.ts");
  assert.match(auth, /input\.trialDays \?\? await getPlatformTrialDays\(\)/);
  assert.match(auth, /MAX_PUBLIC_TRIAL_DAYS/);
});
