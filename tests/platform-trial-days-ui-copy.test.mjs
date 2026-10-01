import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("fluxos públicos não mantêm textos promocionais presos em 14 dias", async () => {
  const page = await read("app/comece/page.tsx");
  const form = await read("app/ui/public-signup-form.tsx");
  const dashboard = await read("app/ui/dashboard-app.tsx");

  for (const source of [page, form]) {
    assert.doesNotMatch(source, /14 dias/i);
  }
  assert.doesNotMatch(dashboard, /por mais 14 dias/i);
  assert.doesNotMatch(dashboard, /Reabrir teste · 14 dias/i);
  assert.doesNotMatch(dashboard, /recebe 14 dias grátis/i);
});
