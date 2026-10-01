import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("landing é dinâmica para refletir alteração sem novo deploy", async () => {
  const page = await read("app/comece/page.tsx");
  assert.match(page, /export const dynamic = "force-dynamic"/);
  assert.match(page, /getPlatformTrialDays\(\)/);
});
