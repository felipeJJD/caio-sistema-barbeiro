import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const result = await build({
  entryPoints: [fileURLToPath(new URL("../lib/evolution-status.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "esm",
});
const { evolutionDeliveryStatus, evolutionRetryDelay } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));

test("delivery receipts progress only for acknowledgements from WhatsApp", () => {
  assert.equal(evolutionDeliveryStatus("PENDING"), null);
  assert.equal(evolutionDeliveryStatus("SERVER_ACK"), null);
  assert.equal(evolutionDeliveryStatus("DELIVERY_ACK"), "delivered");
  assert.equal(evolutionDeliveryStatus("READ"), "read");
});

test("only explicit rate limiting is retried, at most three times", () => {
  assert.deepEqual([0, 1, 2, 3].map(attempt => evolutionRetryDelay(429, attempt)), [60000, 120000, 240000, null]);
  assert.equal(evolutionRetryDelay(503, 0), null);
  assert.equal(evolutionRetryDelay(0, 0), null);
});
