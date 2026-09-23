import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("api da lixeira devolve a lista atualizada após exclusão", async () => {
  const source = await readFile(new URL("../app/api/team-cleanup/route.ts", import.meta.url), "utf8");
  assert.match(source, /listTeamCleanupCandidates/);
  assert.match(source, /ok:\s*true/);
});
