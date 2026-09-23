import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("proprietário não consegue excluir o próprio acesso", async () => {
  const source = await readFile(new URL("../db/team-cleanup.ts", import.meta.url), "utf8");
  assert.match(source, /Você não pode excluir seu próprio acesso/);
  assert.match(source, /teamMemberId === access\.teamMemberId/);
});
