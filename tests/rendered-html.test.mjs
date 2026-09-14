import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { openDatabase } from '../runtime/storage.mjs';
import { bootstrapAdmin } from '../scripts/bootstrap-admin.mjs';
import { appDate } from '../lib/app-date.ts';

test('production server: login, dashboard, writes, authorization, photos, and restart', { timeout: 120000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'barber-server-'));
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const password = randomBytes(24).toString('hex');
  const db = openDatabase(join(directory, 'app.sqlite'));
  await bootstrapAdmin(db, { email: 'admin@example.invalid', password });
  db.close();
  let server;
  let diagnostics = '';
  const start = async () => {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
      env: { ...process.env, DATA_DIR: directory, NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
    server.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error(`Server exited: ${diagnostics}`);
      const response = await fetch(`${base}/api/health`).catch(() => null);
      if (response?.ok) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`Server did not become healthy: ${diagnostics}`);
  };
  const stop = async () => {
    if (server?.exitCode === null) {
      const exited = new Promise(resolve => server.once('exit', resolve));
      server.kill('SIGTERM');
      await exited;
    }
  };
  const jsonPost = (path, data, cookie) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data),
  });
  try {
    await start();
    const publicPage = await fetch(base);
    assert.equal(publicPage.status, 200);
    assert.match(await publicPage.text(), /Entrar|entrar/);
    assert.equal((await fetch(`${base}/comece`)).status, 200);
    assert.equal((await fetch(`${base}/manifest.webmanifest`)).status, 200);
    assert.equal((await fetch(`${base}/api/dashboard-period`)).status, 401);
    assert.equal((await jsonPost('/api/action', { action: 'save-service', name: 'Denied', priceCents: 1 })).status, 401);
    const spoofed = await fetch(`${base}/api/auth/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-email': 'admin@example.invalid' }, body: JSON.stringify({ password }) });
    assert.equal(spoofed.status, 401);
    assert.equal((await jsonPost('/api/auth/login', { email: 'admin@example.invalid', password: randomBytes(16).toString('hex') })).status, 401);
    const login = await jsonPost('/api/auth/login', { email: 'admin@example.invalid', password });
    assert.equal(login.status, 200, await login.text());
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.match(login.headers.get('set-cookie'), /HttpOnly/i);
    const dashboard = await fetch(base, { headers: { Cookie: cookie } });
    assert.equal(dashboard.status, 200);
    const dashboardHtml = await dashboard.text();
    assert.match(dashboardHtml, /Caio Barbearia/);
    const notifications = await fetch(`${base}/api/notifications`, { headers: { Cookie: cookie } });
    const notificationsBody = await notifications.json();
    assert.equal(notifications.status, 200, JSON.stringify(notificationsBody));
    assert.equal(notificationsBody.configured, true);
    assert.equal(Buffer.from(notificationsBody.publicKey, 'base64url').length, 65);
    const saved = await jsonPost('/api/action', { action: 'save-service', name: 'Corte de verificação', priceCents: 4500, durationMinutes: 30, active: true }, cookie);
    const savedBody = await saved.json();
    assert.equal(saved.status, 200, JSON.stringify(savedBody));
    assert.ok(savedBody.data.services.some(service => service.name === 'Corte de verificação' && service.priceCents === 4500));
    const employeeResponse = await jsonPost('/api/action', { action: 'save-team', name: 'Davi', role: 'Barbeiro', loginEmail: '', accessRole: 'barber', commissionRateBps: 5000, active: true }, cookie);
    const employeeBody = await employeeResponse.json();
    assert.equal(employeeResponse.status, 200, JSON.stringify(employeeBody));
    const employee = employeeBody.data.team.find(member => member.name === 'Davi');
    assert.ok(employee);
    const teamPaymentResponse = await jsonPost('/api/action', { action: 'team-payment', teamMemberId: employee.id, occurredAt: appDate(), kind: 'Vale', reason: 'Adiantamento de teste', valueCents: 5000 }, cookie);
    const teamPaymentBody = await teamPaymentResponse.json();
    assert.equal(teamPaymentResponse.status, 200, JSON.stringify(teamPaymentBody));
    const teamPayment = teamPaymentBody.data.teamPayments.find(entry => entry.teamMemberId === employee.id && entry.kind === 'Vale' && entry.valueCents === 5000);
    assert.ok(teamPayment);
    const editedTeamPaymentResponse = await jsonPost('/api/action', { action: 'team-payment', id: teamPayment.id, teamMemberId: employee.id, occurredAt: appDate(), kind: 'Pagamento', reason: 'Acerto de teste', valueCents: 4500 }, cookie);
    const editedTeamPaymentBody = await editedTeamPaymentResponse.json();
    assert.equal(editedTeamPaymentResponse.status, 200, JSON.stringify(editedTeamPaymentBody));
    assert.ok(editedTeamPaymentBody.data.teamPayments.some(entry => entry.id === teamPayment.id && entry.kind === 'Pagamento' && entry.reason === 'Acerto de teste' && entry.valueCents === 4500));
    const disposableTeamPaymentResponse = await jsonPost('/api/action', { action: 'team-payment', teamMemberId: employee.id, occurredAt: appDate(), kind: 'Vale', reason: 'Excluir no teste', valueCents: 1000 }, cookie);
    const disposableTeamPaymentBody = await disposableTeamPaymentResponse.json();
    assert.equal(disposableTeamPaymentResponse.status, 200, JSON.stringify(disposableTeamPaymentBody));
    const disposableTeamPayment = disposableTeamPaymentBody.data.teamPayments.find(entry => entry.reason === 'Excluir no teste');
    assert.ok(disposableTeamPayment);
    const deletedTeamPaymentResponse = await jsonPost('/api/action', { action: 'delete-team-payment', id: disposableTeamPayment.id }, cookie);
    const deletedTeamPaymentBody = await deletedTeamPaymentResponse.json();
    assert.equal(deletedTeamPaymentResponse.status, 200, JSON.stringify(deletedTeamPaymentBody));
    assert.equal(deletedTeamPaymentBody.data.teamPayments.some(entry => entry.id === disposableTeamPayment.id), false);
    const form = new FormData();
    form.set('kind', 'shop');
    form.set('consent', 'true');
    form.set('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aIhkAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
    const gallery = await fetch(`${base}/api/public-gallery`, { method: 'POST', headers: { Cookie: cookie }, body: form });
    const galleryBody = await gallery.json();
    assert.equal(gallery.status, 200, JSON.stringify(galleryBody));
    const image = galleryBody.images.find(item => item.kind === 'shop');
    assert.ok(image);
    assert.equal((await fetch(`${base}/api/public-gallery/image/${image.id}`)).status, 200);
    await stop();
    await start();
    const persisted = await fetch(`${base}/api/public-gallery`, { headers: { Cookie: cookie } });
    assert.equal(persisted.status, 200);
    assert.ok((await persisted.json()).images.some(item => item.id === image.id));
    assert.equal((await fetch(`${base}/api/public-gallery/image/${image.id}`)).status, 200);
    const afterRestart = await fetch(`${base}/api/dashboard-period`, { headers: { Cookie: cookie } });
    assert.equal(afterRestart.status, 200);
    const afterRestartBody = await afterRestart.json();
    assert.ok(afterRestartBody.data.services.some(service => service.name === 'Corte de verificação'));
    assert.ok(afterRestartBody.data.teamPayments.some(entry => entry.teamMemberName === 'Davi' && entry.kind === 'Pagamento' && entry.reason === 'Acerto de teste' && entry.valueCents === 4500));
    assert.equal(afterRestartBody.data.teamPayments.some(entry => entry.reason === 'Excluir no teste'), false);
    const notificationsAfterRestart = await fetch(`${base}/api/notifications`, { headers: { Cookie: cookie } });
    const notificationsAfterRestartBody = await notificationsAfterRestart.json();
    assert.equal(notificationsAfterRestartBody.publicKey, notificationsBody.publicKey);
  } finally { await stop(); await rm(directory, { recursive: true, force: true }); }
});
