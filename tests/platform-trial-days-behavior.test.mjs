import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("mudança da configuração não reescreve datas de testes existentes", async () => {
  const settings = await read("db/platform-trial.ts");
  assert.doesNotMatch(settings, /organizations/);
  assert.doesNotMatch(settings, /trialEndsAt/);
});

test("duração é copiada para a verificação de e-mail no momento do cadastro", async () => {
  const auth = await read("db/auth.ts");
  assert.match(auth, /trialDays:\s*options\.trialDays/);
  assert.match(auth, /verification\.trialDays \* 24 \* 60 \* 60 \* 1000/);
});

test("configuração pública não pode ser alterada sem administrador da plataforma", async () => {
  const settings = await read("db/platform-trial.ts");
  const api = await read("app/api/platform/trial-days/route.ts");
  assert.match(settings, /requirePlatformAdmin\(access\)/);
  assert.match(api, /getSessionAccess\(\)/);
  assert.match(api, /savePlatformTrialDays\(access, data\.trialDays\)/);
});
