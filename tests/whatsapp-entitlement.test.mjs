import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const result = await build({
  entryPoints: [fileURLToPath(new URL("../db/whatsapp-entitlement.ts", import.meta.url))],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [{ name: "entitlement-db-boundary", setup(plugin) {
    const fake = {
      "drizzle-orm": "export const and=()=>{},eq=()=>{};",
      "./index": "export const getDb=()=>{throw Error('No database in pure tests')};",
      "./schema": "export const organizations={},team={};",
    };
    plugin.onResolve({ filter: /.*/ }, args => args.path in fake ? { path: args.path, namespace: "fake" } : null);
    plugin.onLoad({ filter: /.*/, namespace: "fake" }, args => ({ contents: fake[args.path], loader: "js" }));
  } }],
});
const { whatsappEntitlementForState } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const organization = { status: "trial", trialEndsAt: "2099-01-01T00:00:00Z", deletedAt: null, statusBeforeBlock: null, platformAdmin: false };

test("active and trial organizations include WhatsApp without message packages", () => {
  assert.equal(whatsappEntitlementForState(organization).source, "trial");
  assert.equal(whatsappEntitlementForState({ ...organization, status: "active" }).source, "subscription");
});

test("expired and blocked customer organizations cannot send; platform admin stays enabled", () => {
  const expired = { ...organization, trialEndsAt: "2020-01-01T00:00:00Z" };
  assert.equal(whatsappEntitlementForState(expired).hasAccess, false);
  assert.equal(whatsappEntitlementForState({ ...expired, platformAdmin: true }).source, "platform_admin");
  assert.equal(whatsappEntitlementForState({ ...organization, status: "blocked", platformAdmin: true }).hasAccess, false);
  assert.equal(whatsappEntitlementForState({ ...organization, deletedAt: "2020-01-01", platformAdmin: true }).hasAccess, false);
});
