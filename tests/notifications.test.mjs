import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [center, server] = await Promise.all([
  readFile(new URL("../app/ui/notification-center.tsx", import.meta.url), "utf8"),
  readFile(new URL("../db/notifications.ts", import.meta.url), "utf8"),
]);

test("notification polling also refreshes dashboard data", () => {
  assert.match(center, /method === "GET"/);
  assert.match(center, /cortou-anotou:refresh-data/);
});

test("notification service uses persistent runtime VAPID keys", () => {
  assert.match(server, /getRuntimeVapidConfig/);
  assert.doesNotMatch(server, /runtime\.VAPID_PUBLIC_KEY/);
});
