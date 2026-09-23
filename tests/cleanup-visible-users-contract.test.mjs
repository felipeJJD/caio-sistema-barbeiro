import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("usuários removidos deixam de aparecer no gerenciamento sem apagar a linha histórica", async () => {
  const source = await readFile(new URL("../db/team-cleanup.ts", import.meta.url), "utf8");
  assert.match(source, /listVisibleTeamUsers/);
  assert.match(source, /deletedTeamIds/);
  assert.match(source, /UPDATE team SET active = 0, login_email = NULL/);
  assert.doesNotMatch(source, /DELETE FROM team WHERE/);
});
