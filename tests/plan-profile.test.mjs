import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [signup, route, auth, schema, migration, dashboard] = await Promise.all([
  readFile(new URL("../app/ui/public-signup-form.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/auth/public-signup/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/auth.ts", import.meta.url), "utf8"),
  readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
  readFile(new URL("../drizzle/0047_plan_profile.sql", import.meta.url), "utf8"),
  readFile(new URL("../app/ui/dashboard-app.tsx", import.meta.url), "utf8"),
]);

test("cadastro público começa direto e não exige questionário de perfil", () => {
  assert.doesNotMatch(signup, /Quantos clientes vocês atendem por mês/);
  assert.doesNotMatch(signup, /Digite uma média mensal/);
  assert.doesNotMatch(signup, /PERFIL DA BARBEARIA/);
  assert.doesNotMatch(signup, /Recebi convite da barbearia/);
  assert.match(signup, /initialAccountType/);
  assert.match(signup, /estimatedMonthlyClients/);
  assert.match(signup, /estimatedMonthlyWhatsappContacts/);
  assert.match(signup, /estimatedProfessionals/);
});

test("cadastro continua enviando um perfil compatível com a validação existente", () => {
  for (const field of ["estimatedMonthlyClients","estimatedMonthlyWhatsappContacts","estimatedProfessionals","serviceMode","automationGoal"]) {
    assert.match(signup, new RegExp(field));
    assert.match(route, new RegExp(field));
    assert.match(auth, new RegExp(field));
  }
  assert.match(auth, /validateBarbershopUsageProfile/);
  assert.match(auth, /usageProfile/);
});

test("migração é aditiva e preserva barbearias existentes", () => {
  assert.match(migration, /ALTER TABLE organizations ADD COLUMN estimated_monthly_clients/);
  assert.match(migration, /DEFAULT 0/);
  assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|UPDATE organizations/i);
  assert.match(schema, /estimatedMonthlyClients/);
});

test("administrador enxerga o perfil informado por cada barbearia", () => {
  assert.match(auth, /estimatedMonthlyClients: shop\.estimatedMonthlyClients/);
  assert.match(dashboard, /Clientes\/mês informados/);
  assert.match(dashboard, /WhatsApp\/mês estimado/);
  assert.match(dashboard, /Profissionais informados/);
});
