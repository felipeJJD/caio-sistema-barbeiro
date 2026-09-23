import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cadastro por convite de funcionário exige confirmação antes de criar sessão", async () => {
  const route = await read("app/api/auth/invite/route.ts");
  const verification = await read("db/verified-registration.ts");
  assert.match(route, /startTeamInviteVerification/);
  assert.match(route, /verificationRequired:\s*true/);
  assert.doesNotMatch(route, /sessionCookie/);
  assert.match(verification, /sendAccessVerificationEmail/);
  assert.match(verification, /emailVerifiedAt:\s*now/);
});

test("cadastro de afiliado exige confirmação antes de criar sessão", async () => {
  const route = await read("app/api/affiliate/auth/invite/route.ts");
  const verification = await read("db/verified-registration.ts");
  assert.match(route, /startAffiliateInviteVerification/);
  assert.match(route, /verificationRequired:\s*true/);
  assert.doesNotMatch(route, /affiliateSessionCookie/);
  assert.match(verification, /kind:\s*"affiliate"/);
});

test("confirmação cria a sessão somente depois de validar o token", async () => {
  const confirmation = await read("app/confirmar-email/[token]/route.ts");
  assert.match(confirmation, /confirmPendingRegistration/);
  assert.match(confirmation, /sessionCookie\(pending\.token\)/);
  assert.match(confirmation, /affiliateSessionCookie\(pending\.token\)/);
});

test("lixeira exige funcionário suspenso e preserva registros históricos", async () => {
  const cleanup = await read("db/team-cleanup.ts");
  assert.match(cleanup, /Suspenda o funcionário antes de excluí-lo/);
  assert.match(cleanup, /deleted_team_members/);
  assert.match(cleanup, /DELETE FROM auth_sessions/);
  assert.doesNotMatch(cleanup, /DELETE FROM daily_records/);
  assert.doesNotMatch(cleanup, /DELETE FROM team_payments/);
  assert.doesNotMatch(cleanup, /DELETE FROM team_payment_closures/);
  assert.doesNotMatch(cleanup, /DELETE FROM app_notifications/);
});

test("migração de cadastro verificado não altera ids históricos da equipe", async () => {
  const migration = await read("drizzle/0048_verified_account_creation.sql");
  assert.match(migration, /CREATE TABLE `deleted_team_members`/);
  assert.match(migration, /CREATE TABLE `pending_registrations`/);
  assert.doesNotMatch(migration, /DROP TABLE `team`/);
  assert.doesNotMatch(migration, /DELETE FROM `team`/);
});
