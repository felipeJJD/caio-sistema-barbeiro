import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pbkdf2Sync, webcrypto } from 'node:crypto';
import ts from 'typescript';
import { openDatabase } from '../runtime/storage.mjs';
const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const module = { exports: {} };
  const source = ts.transpile(fs.readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
  vm.runInNewContext(source, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), crypto: webcrypto, TextEncoder, Date, Error, process, console }, { filename: file });
  return module.exports;
}
async function fixture({ verified = true, status = 'trial', active = true, platformAdmin = false } = {}) {
  const storage = openDatabase(':memory:');
  const schema = load('db/schema.ts');
  const db = require('drizzle-orm/d1').drizzle(storage, { schema });
  const mocks = { './index': { getDb: async () => db }, './schema': schema };
  const access = load('db/access.ts', mocks);
  const sent = [];
  const auth = load('db/auth.ts', { ...mocks, './access': access, 'next/headers': {}, '../lib/app-date': {}, './affiliates': {}, './platform-trial': { getPlatformTrialDays: async () => 20 }, '../lib/owner-email': {
    ownerEmailVerificationIsConfigured: async () => true,
    sendOwnerVerificationEmail: async input => sent.push({ kind: 'confirmation', ...input }),
    sendPasswordResetEmail: async input => sent.push({ kind: 'reset', ...input }),
  } });
  await storage.prepare("INSERT INTO organizations (id,name,slug,status,trial_ends_at) VALUES (900,'Recovery fixture','recovery-fixture',?,?)").bind(status, '2000-01-01T00:00:00.000Z').run();
  await storage.prepare("INSERT INTO team (id,organization_id,name,role,login_email,access_role,commission_cents,active,platform_admin) VALUES (900,900,'Fixture owner','Owner','owner@example.invalid','owner',0,?,?)").bind(Number(active), Number(platformAdmin)).run();
  await storage.prepare("INSERT INTO auth_accounts (id,organization_id,team_member_id,email,password_hash,password_salt,email_verified_at) VALUES (900,900,900,'owner@example.invalid','previous-hash','previous-salt',?)").bind(verified ? '2026-01-01T00:00:00.000Z' : null).run();
  const admin = { organizationId: 1, isOwner: true, isPlatformAdmin: true };
  return { storage, auth, sent, admin };
}
test('assisted recovery changes only target credentials, revokes sessions and links, and preserves expired trial', async () => {
  const f = await fixture();
  try {
    await f.storage.prepare("INSERT INTO auth_sessions (token_hash,account_id,expires_at) VALUES ('target',900,'2099-01-01'),('other',901,'2099-01-01')").run();
    await f.storage.prepare("INSERT INTO password_resets (account_id,token_hash,expires_at) VALUES (900,'target','2099-01-01'),(901,'other','2099-01-01')").run();
    const shopBefore = await f.storage.prepare('SELECT * FROM organizations WHERE id=900').first();
    await f.auth.setBarbershopOwnerPassword(f.admin, 900, 'new-fixture-password');
    const account = await f.storage.prepare('SELECT * FROM auth_accounts WHERE id=900').first();
    assert.equal(account.password_hash, pbkdf2Sync('new-fixture-password', Buffer.from(account.password_salt,'hex'),100000,32,'sha256').toString('hex'));
    assert.equal(account.email_verified_at, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(await f.storage.prepare('SELECT * FROM organizations WHERE id=900').first(), shopBefore);
    assert.equal(await f.storage.prepare("SELECT * FROM auth_sessions WHERE token_hash='target'").first(), null);
    assert.ok(await f.storage.prepare("SELECT * FROM auth_sessions WHERE token_hash='other'").first());
    assert.ok((await f.storage.prepare("SELECT used_at FROM password_resets WHERE token_hash='target'").first()).used_at);
    assert.equal((await f.storage.prepare("SELECT used_at FROM password_resets WHERE token_hash='other'").first()).used_at, null);
  } finally { f.storage.close(); }
});
test('assisted recovery rejects non-admin, own workspace, unconfirmed, blocked, inactive and privileged owners', async () => {
  for (const options of [{ verified:false, status:'pending_email' },{ status:'blocked' },{ active:false },{ platformAdmin:true },{}]) {
    const f = await fixture(options);
    try {
      const before = await f.storage.prepare('SELECT * FROM auth_accounts WHERE id=900').first();
      await assert.rejects(f.auth.setBarbershopOwnerPassword(options.verified === undefined && Object.keys(options).length === 0 ? { ...f.admin,isPlatformAdmin:false } : f.admin,900,'new-fixture-password'));
      await assert.rejects(f.auth.setBarbershopOwnerPassword({ ...f.admin,organizationId:900 },900,'new-fixture-password'));
      assert.deepEqual(await f.storage.prepare('SELECT * FROM auth_accounts WHERE id=900').first(), before);
    } finally { f.storage.close(); }
  }
});
test('forgot password for pending owner resends confirmation without granting access or starting trial', async () => {
  const f = await fixture({ verified:false,status:'pending_email' });
  try {
    await f.auth.requestPasswordReset(' OWNER@EXAMPLE.INVALID ');
    assert.equal(f.sent.length,1);
    assert.equal(f.sent[0].kind,'confirmation');
    assert.equal(f.sent[0].email,'owner@example.invalid');
    assert.equal((await f.storage.prepare('SELECT email_verified_at FROM auth_accounts WHERE id=900').first()).email_verified_at,null);
    assert.equal((await f.storage.prepare('SELECT status FROM organizations WHERE id=900').first()).status,'pending_email');
    assert.equal((await f.storage.prepare('SELECT COUNT(*) n FROM password_resets').first()).n,0);
    assert.equal((await f.storage.prepare('SELECT COUNT(*) n FROM auth_sessions').first()).n,0);
  } finally { f.storage.close(); }
});
test('expired trial can recover password and unknown email creates no token or mail', async () => {
  const f = await fixture();
  try {
    await f.auth.requestPasswordReset('unknown@example.invalid');
    assert.equal(f.sent.length,0);
    await f.auth.requestPasswordReset('owner@example.invalid');
    assert.equal(f.sent.length,1);
    assert.equal(f.sent[0].kind,'reset');
    assert.equal((await f.storage.prepare('SELECT COUNT(*) n FROM password_resets').first()).n,1);
  } finally { f.storage.close(); }
});
