import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entitlement = await readFile(new URL("../db/whatsapp-entitlement.ts", import.meta.url), "utf8");
const whatsapp = await readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8");
const evolution = await readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url), "utf8");
const caAtende = await readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8");

test("WhatsApp centralizes platform-admin entitlement without a fake package", () => {
  assert.match(entitlement, /eq\(team\.platformAdmin, true\)/);
  assert.match(entitlement, /source: "platform_admin"/);
  assert.match(entitlement, /if \(limit > 0\)/);
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

test("Platform admin bypasses only the package limit while customer package rules remain", () => {
  assert.match(whatsapp, /if \(!entitlement\.unlimited\)/);
  assert.match(whatsapp, /sentThisMonth >= entitlement\.monthlyMessageLimit/);
  assert.match(ui, /Acesso administrativo completo/);
  assert.match(ui, /data\?\.entitlement\.hasAccess/);
  assert.match(ui, /source === "package"/);
});
