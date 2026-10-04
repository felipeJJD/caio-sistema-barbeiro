import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const qualificationUrl = new URL("../lib/affiliate-qualification.js", import.meta.url);
const routeUrl = new URL("../app/api/claims/route.js", import.meta.url);

test("interesse fica separado do status que bloqueia novos envios", async () => {
  const source = await readFile(qualificationUrl, "utf8");

  assert.match(source, /ADD COLUMN IF NOT EXISTS qualification TEXT NOT NULL DEFAULT ''/);
  assert.match(source, /SET qualification = 'interested'/);
  assert.match(source, /AND prospector_key = \$2/);
  assert.match(source, /AND status = 'contacted'/);
  assert.match(source, /AND responded_at IS NOT NULL/);
  assert.match(source, /qualification = 'interested'/);
  assert.doesNotMatch(source, /SET status = 'interested'/);
  assert.doesNotMatch(source, /reserved_until\s*=/);
});

test("rota de claims aceita a aba e a ação de interesse", async () => {
  const source = await readFile(routeUrl, "utf8");

  assert.match(source, /view === "interested"/);
  assert.match(source, /listInterestedClaims/);
  assert.match(source, /action === "interested"/);
  assert.match(source, /markClaimInterested/);
  assert.match(source, /enrichClaimQualifications/);
});
