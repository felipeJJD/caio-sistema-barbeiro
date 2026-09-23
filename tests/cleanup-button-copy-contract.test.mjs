import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("proprietário recebe botão explícito de lixeira", async () => {
  const source = await readFile(new URL("../app/ui/team-cleanup-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /Lixeira da equipe/);
  assert.match(source, /Excluir/);
});
