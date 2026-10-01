import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("salvar configuração não atualiza organizações existentes", async () => {
  const settings = await read("db/platform-trial.ts");
  const saveStart = settings.indexOf("export async function savePlatformTrialDays");
  assert.ok(saveStart >= 0);
  const saveBlock = settings.slice(saveStart);
  assert.doesNotMatch(saveBlock, /organizations/);
  assert.doesNotMatch(saveBlock, /trialEndsAt/);
});
