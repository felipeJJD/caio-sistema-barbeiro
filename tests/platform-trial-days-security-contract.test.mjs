import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cliente não envia duração de teste no POST de cadastro", async () => {
  const signupForm = await read("app/ui/public-signup-form.tsx");
  const signupRoute = await read("app/api/auth/public-signup/route.ts");
  const payloadStart = signupForm.indexOf("body: JSON.stringify({");
  const payloadEnd = signupForm.indexOf("}),", payloadStart);
  assert.ok(payloadStart >= 0 && payloadEnd > payloadStart);
  const payload = signupForm.slice(payloadStart, payloadEnd);
  assert.doesNotMatch(payload, /trialDays/);
  assert.doesNotMatch(signupRoute, /trialDays/);
});
