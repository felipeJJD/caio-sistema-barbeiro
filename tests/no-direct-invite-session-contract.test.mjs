import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("rotas de convite não devolvem cookie antes da confirmação", async () => {
  const team = await read("app/api/auth/invite/route.ts");
  const affiliate = await read("app/api/affiliate/auth/invite/route.ts");
  assert.doesNotMatch(team, /set-cookie/i);
  assert.doesNotMatch(affiliate, /set-cookie/i);
});
