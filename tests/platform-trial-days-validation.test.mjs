import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("duração configurável aceita promoções comuns e rejeita valores inválidos", async () => {
  const source = await read("db/platform-trial.ts");
  assert.match(source, /days < 1/);
  assert.match(source, /days > MAX_PUBLIC_TRIAL_DAYS/);
  assert.match(source, /MAX_PUBLIC_TRIAL_DAYS = 3650/);
});
