import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entitlement = await readFile(new URL("../db/whatsapp-entitlement.ts", import.meta.url), "utf8");
const whatsapp = await readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8");
const evolution = await readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url), "utf8");
const caAtende = await readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8");

test("WhatsApp centralizes platform-admin and subscription entitlements", () => {
  assert.match(entitlement, /eq\(team\.platformAdmin, true\)/);
  assert.match(entitlement, /source: "platform_admin"/);
  assert.match(entitlement, /source: "subscription"/);
  assert.match(entitlement, /source: "trial"/);
  assert.doesNotMatch(entitlement, /monthlyMessageLimit/);
  assert.match(entitlement, /source: "none"/);
  assert.doesNotMatch(entitlement, /organizationId\s*===\s*1/);
});

test("C.A. Atende and both outbound queues use the same entitlement", () => {
  assert.match(caAtende, /getWhatsappEntitlementForOrganization\(event\.organizationId/);
  assert.match(caAtende, /!entitlement\.hasAccess/);
  assert.match(whatsapp, /getWhatsappEntitlementForOrganization\(appointment\.organizationId/);
  assert.match(whatsapp, /getWhatsappEntitlementForOrganization\(input\.organizationId/);
  assert.match(evolution, /getWhatsappEntitlementForOrganization\(message\.organizationId/);
  assert.match(evolution, /!entitlement\.hasAccess/);
});

test("platform admin is perpetual; expired customers cannot send", () => {
  assert.match(entitlement, /if \(input\.platformAdmin\) return/);
  assert.match(entitlement, /Date\.parse\(input\.trialEndsAt\) <= Date\.now\(\)/);
  assert.match(ui, /Acesso administrativo completo/);
  assert.match(ui, /data\?\.entitlement\.hasAccess/);
  assert.doesNotMatch(ui, /source === "package"/);
});
