import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("exclusão da equipe usa tombstone em vez de remover profissional do histórico", async () => {
  const source = await readFile(new URL("../db/team-cleanup.ts", import.meta.url), "utf8");
  assert.match(source, /INSERT INTO deleted_team_members/);
  assert.doesNotMatch(source, /DELETE FROM team /);
});
