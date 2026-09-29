import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const result = await build({
  entryPoints: [fileURLToPath(new URL("../db/platform-billing.ts", import.meta.url))],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [{ name: "billing-db-boundary", setup(plugin) {
    const fake = {
      "drizzle-orm": "export const eq=()=>{};",
      "./access": "export const requirePlatformAdmin=()=>{};",
      "./index": "export const getDb=()=>{throw Error('No database in pure tests')};",
      "./schema": "export const platformBillingSettings={};",
    };
    plugin.onResolve({ filter: /.*/ }, args => args.path in fake ? { path: args.path, namespace: "fake" } : null);
    plugin.onLoad({ filter: /.*/, namespace: "fake" }, args => ({ contents: fake[args.path], loader: "js" }));
  } }],
});
const { withPlans, getPixPlan } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));

test("one monthly base price produces four discounted periods for both account types", () => {
  const offer = withPlans({
    pixPriceCents: 3990,
    barberPixPriceCents: 999,
    pixPeriodDays: 30,
    quarterlyDiscountBps: 1000,
    semiannualDiscountBps: 1500,
    annualDiscountBps: 2000,
  });
  assert.deepEqual(offer.pixPlans.map(plan => plan.code), ["monthly", "quarterly", "semiannual", "annual"]);
  assert.deepEqual(offer.pixPlans.map(plan => plan.priceCents), [3990, 10773, 20349, 38304]);
  assert.deepEqual(offer.pixPlans.map(plan => plan.periodDays), [30, 90, 180, 365]);
  assert.deepEqual(offer.barberPixPlans, offer.pixPlans);
  assert.equal(offer.barberPixPriceCents, 3990);
  assert.equal(getPixPlan(offer).priceCents, 3990);
  assert.equal(getPixPlan(offer, "quarterly").priceCents, 10773);
  assert.equal(getPixPlan(offer, "semiannual").priceCents, 20349);
  assert.equal(getPixPlan(offer, "annual").priceCents, 38304);
  assert.throws(() => getPixPlan(offer, "message_1000"), /Período de assinatura inválido/);
});

test("configured discounts are respected without silently replacing zero with defaults", () => {
  const offer = withPlans({
    pixPriceCents: 3990,
    barberPixPriceCents: 999,
    pixPeriodDays: 30,
    quarterlyDiscountBps: 0,
    semiannualDiscountBps: 750,
    annualDiscountBps: 1250,
  });
  assert.deepEqual(offer.pixPlans.map(plan => plan.priceCents), [3990, 11970, 22145, 41895]);
  assert.deepEqual(offer.barberPixPlans, offer.pixPlans);
});
