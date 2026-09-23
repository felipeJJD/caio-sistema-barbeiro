import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("lixeira não apaga convite já utilizado", async () => {
  const source = await readFile(new URL("../db/team-cleanup.ts", import.meta.url), "utf8");
  assert.match(source, /used_at IS NULL/);
  assert.match(source, /já foi utilizado ou não está disponível/);
});
