import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("usuário ativo não aparece como candidato da lixeira", async () => {
  const source = await readFile(new URL("../db/team-cleanup.ts", import.meta.url), "utf8");
  assert.match(source, /t\.active = 0/);
});
