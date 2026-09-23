import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("excluir funcionário remove credenciais e push do acesso removido", async () => {
  const source = await readFile(new URL("../db/team-cleanup.ts", import.meta.url), "utf8");
  assert.match(source, /DELETE FROM auth_sessions/);
  assert.match(source, /DELETE FROM auth_accounts/);
  assert.match(source, /DELETE FROM push_subscriptions/);
});
