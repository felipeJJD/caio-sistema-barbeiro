import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("lixeira é montada somente para proprietário autenticado", async () => {
  const page = await read("app/page.tsx");
  const panel = await read("app/ui/team-cleanup-panel.tsx");
  assert.match(page, /sessionAccess\.isOwner && <TeamCleanupPanel/);
  assert.match(panel, /Lixeira da equipe/);
  assert.match(panel, /histórico continuarão guardados/);
});
