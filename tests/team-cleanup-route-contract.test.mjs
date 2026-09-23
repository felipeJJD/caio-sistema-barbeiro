import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = () => readFile(new URL("../app/api/team-cleanup/route.ts", import.meta.url), "utf8");

test("lixeira da equipe exige proprietário e organização ativa", async () => {
  const source = await route();
  assert.match(source, /!access\.isOwner/);
  assert.match(source, /isOrganizationAccessExpired/);
  assert.match(source, /delete-user/);
  assert.match(source, /delete-invite/);
  assert.match(source, /delete-pending/);
});
