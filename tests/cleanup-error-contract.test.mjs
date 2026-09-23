import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("lixeira mostra erro retornado pelo servidor", async () => {
  const source = await readFile(new URL("../app/ui/team-cleanup-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /throw new Error\(next\.error/);
  assert.match(source, /role="alert"/);
});
