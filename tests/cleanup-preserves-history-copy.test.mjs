import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("interface explica que exclusão do acesso preserva histórico", async () => {
  const source = await readFile(new URL("../app/ui/team-cleanup-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /atendimentos, comissões, pagamentos e histórico continuarão guardados/);
});
