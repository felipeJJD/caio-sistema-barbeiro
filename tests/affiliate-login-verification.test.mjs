import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pbkdf2Sync, webcrypto } from 'node:crypto';
import ts from 'typescript';
import { openDatabase } from '../runtime/storage.mjs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(file, mocks) {
  const module = { exports: {} };
  const source = ts.transpile(fs.readFileSync(file, 'utf8'), {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  });
  vm.runInNewContext(source, {
    module, exports: module.exports,
    require: name => name in mocks ? mocks[name] : require(name),
    crypto: webcrypto, TextEncoder, Date, Error, process, Request, Response, console,
  }, { filename: file });
  return module.exports;
}

async function fixture({ account = true, active = true, kind = 'affiliate', expired = false } = {}) {
  const storage = openDatabase(':memory:');
  const schema = load('db/schema.ts', {});
  const { drizzle } = require('drizzle-orm/d1');
  const db = drizzle(storage, { schema });
  const mocks = { './index': { getDb: async () => db }, './schema': schema };
  const verification = load('db/verified-registration.ts', {
    ...mocks, '../runtime/env': { env: { DB: storage } },
    '../lib/owner-email': {},
  });
  const auth = load('db/affiliate-auth.ts', {
    ...mocks, './verified-registration': verification,
    './access': {}, 'next/headers': {},
  });
  const limits = [];
  const prefix = '../'.repeat(5);
  const route = load('app/api/affiliate/auth/login/route.ts', {
    [prefix + 'db/affiliate-auth']: auth,
    [prefix + 'db/verified-registration']: verification,
    [prefix + 'db/rate-limit']: {
      enforceRateLimit: async input => { limits.push(input.scope); },
      RateLimitError: class RateLimitError extends Error {},
    },
  });
  const email = 'confirmed@example.invalid';
  const salt = 'ab'.repeat(16);
  const password = 'fixture-password';
  const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex');
  await storage.prepare('INSERT INTO affiliates (id, name, email, active) VALUES (900, ?, ?, ?)')
    .bind('Confirmed fixture', email, Number(active)).run();
  if (account) await storage.prepare(`INSERT INTO affiliate_accounts
    (affiliate_id, email, password_hash, password_salt, password_iterations)
    VALUES (900, ?, ?, ?, 100000)`).bind(email, hash, salt).run();
  // A distinct invitation can leave a pending row for the same email.
  await storage.prepare(`INSERT INTO pending_registrations
    (kind, source_invite_id, affiliate_id, name, email, password_hash,
     password_salt, token_hash, expires_at)
    VALUES (?, 901, 901, 'Pending fixture', ?, ?, ?, ?, ?)`)
    .bind(kind, email, hash, salt, 'cd'.repeat(32),
      new Date(Date.now() + (expired ? -86400000 : 86400000)).toISOString()).run();
  return {
    storage, limits,
    login: (value = password) => route.POST(new Request('https://cortouanotou.com.br/api/affiliate/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `  ${email.toUpperCase()}  `, password: value }),
    })),
  };
}

test('existing affiliate can log in from a fresh session despite another pending invitation', async () => {
  const f = await fixture();
  try {
    const response = await f.login();
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.match(response.headers.get('set-cookie'), /cortou_anotou_affiliate_session=[0-9a-f]{64};.*HttpOnly; Secure; SameSite=Lax/);
    assert.equal((await f.storage.prepare('SELECT COUNT(*) AS n FROM affiliate_sessions').first()).n, 1);
    assert.equal((await f.storage.prepare('SELECT COUNT(*) AS n FROM affiliate_accounts').first()).n, 1);
    assert.equal((await f.storage.prepare('SELECT used_at FROM pending_registrations').first()).used_at, null);
    assert.deepEqual(f.limits, ['affiliate-login', 'affiliate-login-ip']);
  } finally { f.storage.close(); }
});

test('an unconfirmed affiliate remains blocked and no account or session is created', async () => {
  const f = await fixture({ account: false });
  try {
    const response = await f.login();
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Confirme seu e-mail/);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal((await f.storage.prepare('SELECT COUNT(*) AS n FROM affiliate_accounts').first()).n, 0);
    assert.equal((await f.storage.prepare('SELECT COUNT(*) AS n FROM affiliate_sessions').first()).n, 0);
  } finally { f.storage.close(); }
});

test('wrong password and inactive affiliate remain blocked even with a pending registration', async () => {
  for (const active of [true, false]) {
    const f = await fixture({ active });
    try {
      const response = await f.login(active ? 'wrong-password' : undefined);
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, active ? /E-mail ou senha incorretos/ : /acesso está pausado/);
      assert.equal(response.headers.get('set-cookie'), null);
      assert.equal((await f.storage.prepare('SELECT COUNT(*) AS n FROM affiliate_sessions').first()).n, 0);
    } finally { f.storage.close(); }
  }
});

test('team registrations and expired invitations do not count as pending affiliate access', async () => {
  for (const options of [{ account: false, kind: 'team' }, { account: false, expired: true }]) {
    const f = await fixture(options);
    try {
      const response = await f.login();
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /E-mail ou senha incorretos/);
      assert.equal(response.headers.get('set-cookie'), null);
    } finally { f.storage.close(); }
  }
});

test('invalid and expired confirmation links offer affiliate login and resend without granting access', async () => {
  const page = load('app/confirmacao-email/page.tsx', {
    'next/link': { __esModule: true, default: props => React.createElement('a', props) },
    '../ui/brand-logo': { BrandLogo: () => null },
    '../ui/email-security': { SupportContactLinks: () => null },
  });
  for (const status of ['invalid', 'expired']) {
    const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({ status }) }));
    assert.match(html, /href="\/afiliado"[^>]*>Entrar como afiliado/);
    assert.match(html, /href="\/"[^>]*>Entrar na barbearia/);
    assert.match(html, /href="\/reenviar-confirmacao"/);
  }
});
