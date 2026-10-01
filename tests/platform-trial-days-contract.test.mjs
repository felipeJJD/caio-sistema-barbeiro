import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("configuração central de teste nasce em 14 dias e é persistida em tabela própria", async () => {
  const source = await read("db/platform-trial.ts");
  const migration = await read("drizzle/0050_platform_trial_settings.sql");
  const journal = await read("drizzle/meta/_journal.json");

  assert.match(source, /DEFAULT_PUBLIC_TRIAL_DAYS\s*=\s*14/);
  assert.match(source, /requirePlatformAdmin\(access\)/);
  assert.match(source, /onConflictDoUpdate/);
  assert.match(migration, /CREATE TABLE `platform_trial_settings`/);
  assert.match(migration, /`trial_days` integer DEFAULT 14 NOT NULL/);
  assert.match(migration, /INSERT OR IGNORE/);
  assert.match(journal, /"tag": "0050_platform_trial_settings"/);
});

test("cadastro público usa apenas a duração salva no servidor", async () => {
  const auth = await read("db/auth.ts");
  const route = await read("app/api/auth/public-signup/route.ts");

  const barbershopStart = auth.indexOf("export async function createPublicBarbershop");
  const individualStart = auth.indexOf("export async function createPublicIndividualBarber");
  const inviteStart = auth.indexOf("export async function acceptBarbershopInvite");
  assert.ok(barbershopStart >= 0 && individualStart > barbershopStart && inviteStart > individualStart);

  const barbershopBlock = auth.slice(barbershopStart, individualStart);
  const individualBlock = auth.slice(individualStart, inviteStart);
  assert.match(barbershopBlock, /trialDays:\s*await getPlatformTrialDays\(\)/);
  assert.match(individualBlock, /trialDays:\s*await getPlatformTrialDays\(\)/);
  assert.doesNotMatch(barbershopBlock, /trialDays:\s*14/);
  assert.doesNotMatch(individualBlock, /trialDays:\s*14/);
  assert.doesNotMatch(route, /trialDays/);
});

test("página pública e formulário exibem a mesma duração configurada", async () => {
  const page = await read("app/comece/page.tsx");
  const form = await read("app/ui/public-signup-form.tsx");

  assert.match(page, /getPlatformTrialDays\(\)/);
  assert.match(page, /trialDays=\{trialDays\}/);
  assert.match(page, /Começar \{trialLabel\} grátis/);
  assert.doesNotMatch(page, /14 DIAS GRÁTIS/);
  assert.doesNotMatch(page, /durante 14 dias/);
  assert.match(form, /trialDays:\s*number/);
  assert.match(form, /TESTE GRÁTIS · \{trialLabel\.toUpperCase\(\)\}/);
  assert.match(form, /Começar meus \$\{trialLabel\} grátis/);
  assert.doesNotMatch(form, /meus 14 dias grátis/);
});

test("administrador consegue editar os dias sem alterar testes já iniciados", async () => {
  const api = await read("app/api/platform/trial-days/route.ts");
  const editor = await read("app/ui/platform-trial-settings.tsx");
  const auth = await read("db/auth.ts");
  const adminRoute = await read("app/api/platform/invites/route.ts");
  const dashboard = await read("app/ui/dashboard-app.tsx");

  assert.match(api, /savePlatformTrialDays/);
  assert.match(editor, /name="trialDays"/);
  assert.match(editor, /min="1" max="3650"/);
  assert.match(editor, /Vale para novos cadastros/);
  assert.match(dashboard, /<PlatformTrialSettings \/>/);
  assert.match(auth, /latestVerification\?\.trialDays \?\? await getPlatformTrialDays\(\)/);
  assert.match(adminRoute, /restartBarbershopTrial\(access, Number\(data\.organizationId\), await getPlatformTrialDays\(\)\)/);
});
