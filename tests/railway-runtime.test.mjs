import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, LocalBucket } from '../runtime/storage.mjs';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.mjs';
import { randomBytes } from 'node:crypto';

test('migrations, parameter binding, returning, and data survive a restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'barber-runtime-'));
  let db;
  try {
    db = openDatabase(join(dir, 'app.sqlite'));
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM _railway_migrations').first()).n, 34);
    const row = await db.prepare('INSERT INTO services (organization_id, name, price_cents) VALUES (?, ?, ?) RETURNING id, name')
      .bind(1, "Corte d'água", 3500).first();
    assert.equal(row.name, "Corte d'água");
    assert.deepEqual(await db.prepare('SELECT name, price_cents FROM services WHERE id = ?').bind(row.id).raw(), [["Corte d'água", 3500]]);
    const teamPayment = await db.prepare("INSERT INTO team_payments (organization_id, team_member_id, team_member_name, occurred_at, kind, reason, value_cents) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id")
      .bind(1, 2, 'Davi', '2026-09-12', 'Vale', 'Adiantamento', 5000).first();
    db.close();
    db = openDatabase(join(dir, 'app.sqlite'));
    assert.equal(await db.prepare('SELECT name FROM services WHERE id = ?').bind(row.id).first('name'), "Corte d'água");
    assert.deepEqual(await db.prepare('SELECT kind, value_cents FROM team_payments WHERE id = ?').bind(teamPayment.id).raw(), [['Vale', 5000]]);
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM _railway_migrations').first()).n, 34);
  } finally { db?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('batch is atomic and preserves RETURNING rows', async () => {
  const db = openDatabase(':memory:');
  try {
    const results = await db.batch([
      db.prepare('INSERT INTO services (organization_id, name, price_cents) VALUES (1, ?, 100) RETURNING id').bind('One'),
      db.prepare('SELECT COUNT(*) AS n FROM services'),
    ]);
    assert.ok(results[0].results[0].id);
    assert.equal(results[1].results[0].n, 1);
    await assert.rejects(db.batch([
      db.prepare('INSERT INTO services (organization_id, name, price_cents) VALUES (1, ?, 200)').bind('Rolled back'),
      db.prepare('INSERT INTO services (organization_id, name, price_cents) VALUES (1, NULL, 100)'),
    ]));
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM services').first()).n, 1);
  } finally { db.close(); }
});

test('raw rows preserve duplicate selected column names and nulls', async () => {
  const db = openDatabase(':memory:');
  try { assert.deepEqual(await db.prepare('SELECT 1 AS id, 2 AS id, NULL AS name').raw(), [[1, 2, null]]); }
  finally { db.close(); }
});

test('initial administrator is created once and restart cannot reset the password', async () => {
  const db = openDatabase(':memory:');
  try {
    const input = { email: 'admin@example.invalid', password: randomBytes(24).toString('hex') };
    assert.equal(await bootstrapAdmin(db, input), true);
    const original = await db.prepare('SELECT password_hash FROM auth_accounts').first('password_hash');
    assert.equal(await bootstrapAdmin(db, { ...input, password: randomBytes(24).toString('hex') }), false);
    assert.equal(await db.prepare('SELECT password_hash FROM auth_accounts').first('password_hash'), original);
    assert.equal(await db.prepare('SELECT platform_admin FROM team').first('platform_admin'), 1);
  } finally { db.close(); }
});

test('photo objects persist and paths cannot escape the upload directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'barber-photos-'));
  try {
    const bucket = new LocalBucket(dir);
    await bucket.put('public-gallery/1/image', new TextEncoder().encode('synthetic image').buffer);
    const object = await new LocalBucket(dir).get('public-gallery/1/image');
    assert.equal(await new Response(object.body).text(), 'synthetic image');
    assert.ok(object.httpEtag);
    await assert.rejects(bucket.put('../outside', new ArrayBuffer(0)));
    await assert.rejects(bucket.get('/outside'));
    await bucket.delete('public-gallery/1/image');
    assert.equal(await bucket.get('public-gallery/1/image'), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
