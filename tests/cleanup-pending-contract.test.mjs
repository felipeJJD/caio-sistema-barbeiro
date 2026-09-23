import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("excluir cadastro pendente também invalida o convite reservado", async () => {
  const source = await readFile(new URL("../db/team-cleanup.ts", import.meta.url), "utf8");
  assert.match(source, /DELETE FROM pending_registrations/);
  assert.match(source, /DELETE FROM team_invites/);
  assert.match(source, /source_invite_id/);
});
