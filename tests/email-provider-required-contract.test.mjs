import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("funcionário e afiliado não pulam confirmação quando provedor de e-mail está indisponível", async () => {
  const text = await read("db/verified-registration.ts");
  const checks = text.match(/ownerEmailVerificationIsConfigured\(\)/g) ?? [];
  assert.ok(checks.length >= 2);
  assert.match(text, /O envio de confirmação por e-mail ainda não está configurado/);
});

test("cadastro público e convite de nova barbearia também falham fechado sem confirmação", async () => {
  const publicSignup = await read("app/api/auth/public-signup/route.ts");
  const invitedShop = await read("app/api/auth/barbershop-invite/route.ts");
  assert.match(publicSignup, /ownerEmailVerificationIsConfigured/);
  assert.match(invitedShop, /ownerEmailVerificationIsConfigured/);
  assert.match(publicSignup, /status = .*503/);
  assert.match(invitedShop, /status = .*503/);
});
