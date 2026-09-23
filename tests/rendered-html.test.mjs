import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
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
  const sentEmails = [];
  const emailServer = createHttpServer(async (request, response) => {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    sentEmails.push(JSON.parse(raw || '{}'));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: `test-email-${sentEmails.length}` }));
  });
  await new Promise(resolve => emailServer.listen(0, '127.0.0.1', resolve));
  const emailPort = emailServer.address().port;
  const emailApiUrl = `http://127.0.0.1:${emailPort}/emails`;
  const password = randomBytes(24).toString('hex');
  const db = openDatabase(join(directory, 'app.sqlite'));
  await bootstrapAdmin(db, { email: 'admin@example.invalid', password });
  await db.batch([
    db.prepare("INSERT INTO organizations (id, name, slug) VALUES (999, 'Other shop', 'other-shop')"),
    db.prepare("INSERT INTO team (id, organization_id, name, role, commission_cents) VALUES (999, 999, 'Other barber', 'Barbeiro', 0)"),
    db.prepare("INSERT INTO services (id, organization_id, name, price_cents) VALUES (999, 999, 'Other service', 9900)"),
    db.prepare("INSERT INTO payment_methods (id, organization_id, name) VALUES (999, 999, 'Other payment')"),
    db.prepare("INSERT INTO daily_records (organization_id, occurred_at, client_name, barber_id, service_id, payment_method_id, value_cents, commission_rate_bps, commission_cents) VALUES (999, ?, 'Other tenant private record', 999, 999, 999, 9900, 5000, 4950)").bind(appDate()),
  ]);
  db.close();
  let server;
  let diagnostics = '';
  const start = async () => {
    server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
      env: {
        ...process.env,
        DATA_DIR: directory,
        NODE_ENV: 'production',
        PUBLIC_APP_URL: base,
        RESEND_API_KEY: 'test-key',
        RESEND_API_URL: emailApiUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
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
    for (const [origin, expectedStatus] of [['https://cortouanotou.com.br', 200], ['https://shop.example.invalid', 403], ['https://evil.invalid', 403]]) {
      const response = await fetch(`${base}/api/notifications`, {
        method: 'POST', headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-read' }),
      });
      assert.equal(response.status, expectedStatus, await response.text());
    }
    const unauthenticatedNotification = await fetch(`${base}/api/notifications`, {
      method: 'POST', headers: { Origin: 'https://cortouanotou.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'mark-read' }),
    });
    assert.equal(unauthenticatedNotification.status, 401);
    const saved = await jsonPost('/api/action', { action: 'save-service', name: 'Corte de verificação', priceCents: 4500, durationMinutes: 30, active: true }, cookie);
    const savedBody = await saved.json();
    assert.equal(saved.status, 200, JSON.stringify(savedBody));
    assert.ok(savedBody.data.services.some(service => service.name === 'Corte de verificação' && service.priceCents === 4500));
    const employeeResponse = await jsonPost('/api/action', { action: 'save-team', name: 'Davi', role: 'Barbeiro', loginEmail: '', accessRole: 'barber', commissionRateBps: 5000, active: true }, cookie);
    const employeeBody = await employeeResponse.json();
    assert.equal(employeeResponse.status, 200, JSON.stringify(employeeBody));
    const employee = employeeBody.data.team.find(member => member.name === 'Davi');
    assert.ok(employee);
    // Independent logins model separate devices; all fixtures stay in the temporary database.
    const secondLogin = await jsonPost('/api/auth/login', { email: 'admin@example.invalid', password });
    assert.equal(secondLogin.status, 200);
    const secondOwnerCookie = secondLogin.headers.get('set-cookie').split(';')[0];
    assert.notEqual(secondOwnerCookie, cookie);
    const readDashboard = async (session) => {
      const response = await fetch(`${base}/api/dashboard-period`, { headers: { Cookie: session } });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /no-store/);
      return (await response.json()).data;
    };
    const staffSessions = [];
    for (const name of ['Davi', 'Eduardo']) {
      const invitation = await jsonPost('/api/invites', {
        action: 'create', ...(name === 'Davi' ? { teamMemberId: employee.id } : { invitedName: name }),
      }, cookie);
      const invitationBody = await invitation.json();
      assert.equal(invitation.status, 200, JSON.stringify(invitationBody));
      const inviteToken = new URL(invitationBody.inviteUrl).pathname.split('/').pop();
      const emailAddress = `${name.toLowerCase()}@example.invalid`;
      const emailCountBefore = sentEmails.length;
      const accepted = await jsonPost('/api/auth/invite', {
        inviteToken, name, email: emailAddress, password,
      });
      const acceptedBody = await accepted.clone().json();
      assert.equal(accepted.status, 200, JSON.stringify(acceptedBody));
      assert.equal(acceptedBody.verificationRequired, true);
      assert.equal(accepted.headers.get('set-cookie'), null);
      assert.equal(sentEmails.length, emailCountBefore + 1);
      assert.equal((await jsonPost('/api/auth/login', { email: emailAddress, password })).status, 401);
      const sentEmail = sentEmails.at(-1);
      assert.deepEqual(sentEmail.to, [emailAddress]);
      assert.match(sentEmail.subject, /Confirme seu e-mail/);
      const confirmationUrl = String(sentEmail.text ?? '').match(/http:\/\/127\.0\.0\.1:\d+\/confirmar-email\/[0-9a-f]+/i)?.[0];
      assert.ok(confirmationUrl, JSON.stringify(sentEmail));
      const confirmation = await fetch(confirmationUrl, { redirect: 'manual' });
      assert.equal(confirmation.status, 303, await confirmation.clone().text());
      const setCookie = confirmation.headers.get('set-cookie');
      assert.ok(setCookie);
      const staffCookie = setCookie.split(';')[0];
      const staffData = await readDashboard(staffCookie);
      assert.equal(staffData.viewer.isOwner, false);
      const record = await jsonPost('/api/action', {
        action: 'daily-record', occurredAt: appDate(), recordType: 'Avulso',
        clientName: `Sync ${name}`, barberId: staffData.viewer.teamMemberId,
        serviceId: staffData.services[0].id, paymentMethodId: staffData.paymentMethods[0].id,
      }, staffCookie);
      assert.equal(record.status, 200, await record.clone().text());
      staffSessions.push(staffCookie);
    }
    for (const ownerSession of [cookie, secondOwnerCookie]) {
      const data = await readDashboard(ownerSession);
      assert.equal(data.viewer.isOwner, true);
      assert.equal(data.records.some(row => row.clientName === 'Other tenant private record'), false);
      assert.equal(data.team.some(member => member.id === 999), false);
      assert.deepEqual(data.records.filter(row => row.clientName.startsWith('Sync ')).map(row => row.clientName).sort(), ['Sync Davi', 'Sync Eduardo']);
    }
    const ownerNotices = (await readDashboard(cookie)).notifications;
    const noticeToDelete = ownerNotices.find(item => item.kind === 'attendance' && item.body.includes('Sync Davi'));
    assert.ok(noticeToDelete);
    const deleteNotice = await fetch(`${base}/api/notifications`, {
      method: 'POST', headers: { Cookie: cookie, Origin: 'https://cortouanotou.com.br', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete-notification', notificationId: noticeToDelete.id }),
    });
    assert.equal(deleteNotice.status, 200, await deleteNotice.clone().text());
    assert.equal((await readDashboard(secondOwnerCookie)).notifications.some(item => item.id === noticeToDelete.id), false);
    assert.equal((await readDashboard(secondOwnerCookie)).records.some(row => row.clientName === 'Sync Davi'), true);
    for (const [index, staffSession] of staffSessions.entries()) {
      const data = await readDashboard(staffSession);
      assert.deepEqual(data.records.map(row => row.clientName), [`Sync ${['Davi', 'Eduardo'][index]}`]);
      const forbidden = await jsonPost('/api/action', {
        action: 'daily-record', occurredAt: appDate(), recordType: 'Avulso',
        clientName: 'Forbidden', barberId: savedBody.data.viewer.teamMemberId,
        serviceId: data.services[0].id, paymentMethodId: data.paymentMethods[0].id,
      }, staffSession);
      assert.equal(forbidden.ok, false);
    }
    const beforeDiagnostic = await readDashboard(cookie);
    const diagnosticResponse = await fetch(`${base}/diagnostico-sincronizacao`, { headers: { Cookie: cookie } });
    assert.equal(diagnosticResponse.status, 200);
    const diagnosticHtml = await diagnosticResponse.text();
    assert.match(diagnosticHtml, /authAccountId/);
    assert.match(diagnosticHtml, /selectedByDashboardQuery/);
    assert.doesNotMatch(diagnosticHtml, /Sync Davi|Sync Eduardo/);
    const forbiddenDiagnostic = await fetch(`${base}/diagnostico-sincronizacao`, { headers: { Cookie: staffSessions[0] } });
    assert.doesNotMatch(await forbiddenDiagnostic.text(), /authAccountId|selectedByDashboardQuery/);
    const afterDiagnostic = await readDashboard(cookie);
    assert.deepEqual(afterDiagnostic.records.map(record => record.id), beforeDiagnostic.records.map(record => record.id));
    const recoveredRecord = {
      id: 90001, organization_id: 1, occurred_at: appDate(), client_name: 'Recovered Davi',
      barber_id: employee.id, service_id: savedBody.data.services.find(service => service.name === 'Corte de verificação').id,
      payment_method_id: beforeDiagnostic.paymentMethods[0].id, quantity: 1,
      value_cents: 4500, commission_rate_bps: 5000, commission_cents: 2250,
      tip_cents: 0, fee_cents: 0, origin: 'Retorno', record_type: 'Avulso',
      membership_client_id: null, created_at: new Date().toISOString(),
    };
    const importRequest = (session, mode, records, origin = 'https://cortouanotou.com.br') => fetch(`${base}/api/admin/legacy-record-import`, {
      method: 'POST', headers: { Cookie: session, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, rows: records }),
    });
    assert.equal((await importRequest(staffSessions[0], 'preview', [recoveredRecord])).status, 403);
    assert.equal((await importRequest(cookie, 'preview', [recoveredRecord], 'https://evil.invalid')).status, 403);
    assert.equal((await importRequest(cookie, 'preview', [{ ...recoveredRecord, organization_id: 999 }])).status, 400);
    const preview = await importRequest(cookie, 'preview', [recoveredRecord]);
    assert.equal(preview.status, 200, await preview.clone().text());
    assert.deepEqual((await preview.json()).pendingIds, [90001]);
    assert.equal((await readDashboard(secondOwnerCookie)).records.some(record => record.clientName === 'Recovered Davi'), false);
    const importedResponse = await importRequest(cookie, 'apply', [recoveredRecord]);
    assert.equal(importedResponse.status, 200, await importedResponse.clone().text());
    assert.equal((await importedResponse.json()).imported, 1);
    const backupFiles = await readdir(join(directory, 'legacy-import-backups'));
    assert.equal(backupFiles.length, 1);
    const beforeImport = new DatabaseSync(join(directory, 'legacy-import-backups', backupFiles[0]), { readOnly: true });
    try { assert.equal(beforeImport.prepare("SELECT count(*) AS total FROM daily_records WHERE client_name = 'Recovered Davi'").get().total, 0); }
    finally { beforeImport.close(); }
    for (const ownerSession of [cookie, secondOwnerCookie]) {
      assert.equal((await readDashboard(ownerSession)).records.filter(record => record.clientName === 'Recovered Davi').length, 1);
    }
    const duplicatePreview = await importRequest(cookie, 'preview', [recoveredRecord]);
    assert.deepEqual((await duplicatePreview.json()).alreadyImported, [90001]);
    assert.equal((await importRequest(cookie, 'apply', [recoveredRecord])).status, 409);
    assert.equal((await readDashboard(staffSessions[1])).records.some(record => record.clientName === 'Recovered Davi'), false);
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
    const teamMoneyBefore = await fetch(`${base}/api/team-money`, { headers: { Cookie: cookie } });
    const teamMoneyBeforeBody = await teamMoneyBefore.json();
    assert.equal(teamMoneyBefore.status, 200, JSON.stringify(teamMoneyBeforeBody));
    const daviMoneyBefore = teamMoneyBeforeBody.data.rows.find(row => row.teamMemberId === employee.id);
    assert.ok(daviMoneyBefore);
    assert.equal(daviMoneyBefore.paidCents, 4500);

    const staffTeamMoney = await fetch(`${base}/api/team-money`, { headers: { Cookie: staffSessions[0] } });
    const staffTeamMoneyBody = await staffTeamMoney.json();
    assert.equal(staffTeamMoney.status, 200, JSON.stringify(staffTeamMoneyBody));
    assert.deepEqual(staffTeamMoneyBody.data.rows.map(row => row.teamMemberName), ['Davi']);

    const forbiddenPaymentDay = await jsonPost('/api/team-money', { action: 'save-payment-day', teamMemberId: employee.id, paymentDay: 15 }, staffSessions[0]);
    assert.equal(forbiddenPaymentDay.status, 400);

    const paymentDayResponse = await jsonPost('/api/team-money', { action: 'save-payment-day', teamMemberId: employee.id, paymentDay: 15 }, cookie);
    const paymentDayBody = await paymentDayResponse.json();
    assert.equal(paymentDayResponse.status, 200, JSON.stringify(paymentDayBody));
    assert.equal(paymentDayBody.data.rows.find(row => row.teamMemberId === employee.id).paymentDay, 15);

    const closeResponse = await jsonPost('/api/team-money', { action: 'close', teamMemberId: employee.id }, cookie);
    const closeBody = await closeResponse.json();
    assert.equal(closeResponse.status, 200, JSON.stringify(closeBody));
    assert.ok(closeBody.closureId);
    assert.equal(closeBody.data.rows.find(row => row.teamMemberId === employee.id).currentBalanceCents, 0);

    const closedEntryEdit = await jsonPost('/api/action', { action: 'team-payment', id: teamPayment.id, teamMemberId: employee.id, occurredAt: appDate(), kind: 'Pagamento', reason: 'Não pode mudar fechamento', valueCents: 1 }, cookie);
    assert.equal(closedEntryEdit.status, 400);

    for (const session of [cookie, staffSessions[0]]) {
      const pdfResponse = await fetch(`${base}/api/team-money/closures/${closeBody.closureId}/pdf`, { headers: { Cookie: session } });
      assert.equal(pdfResponse.status, 200, await pdfResponse.clone().text());
      assert.match(pdfResponse.headers.get('content-type') ?? '', /application\/pdf/);
      const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
      assert.equal(pdfBytes.subarray(0, 8).toString('latin1'), '%PDF-1.4');
    }

    const daviAfterClose = await readDashboard(staffSessions[0]);
    const postCloseCut = await jsonPost('/api/action', {
      action: 'daily-record', occurredAt: appDate(), recordType: 'Avulso',
      clientName: 'Depois do fechamento', barberId: daviAfterClose.viewer.teamMemberId,
      serviceId: daviAfterClose.services[0].id, paymentMethodId: daviAfterClose.paymentMethods[0].id,
      tipCents: 700,
    }, staffSessions[0]);
    const postCloseCutBody = await postCloseCut.json();
    assert.equal(postCloseCut.status, 200, JSON.stringify(postCloseCutBody));
    const newRecord = postCloseCutBody.data.records.find(row => row.clientName === 'Depois do fechamento');
    assert.ok(newRecord);
    const expectedNewBalance = newRecord.commissionCents + newRecord.tipCents;
    const teamMoneyAfter = await fetch(`${base}/api/team-money`, { headers: { Cookie: staffSessions[0] } });
    const teamMoneyAfterBody = await teamMoneyAfter.json();
    assert.equal(teamMoneyAfter.status, 200, JSON.stringify(teamMoneyAfterBody));
    assert.equal(teamMoneyAfterBody.data.rows[0].currentBalanceCents, expectedNewBalance);
    assert.equal(teamMoneyAfterBody.data.rows[0].tipCents, 700);

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
    assert.deepEqual(afterRestartBody.data.records.filter(row => row.clientName.startsWith('Sync ')).map(row => row.clientName).sort(), ['Sync Davi', 'Sync Eduardo']);
    assert.ok(afterRestartBody.data.services.some(service => service.name === 'Corte de verificação'));
    assert.ok(afterRestartBody.data.teamPayments.some(entry => entry.teamMemberName === 'Davi' && entry.kind === 'Pagamento' && entry.reason === 'Acerto de teste' && entry.valueCents === 4500));
    assert.equal(afterRestartBody.data.teamPayments.some(entry => entry.reason === 'Excluir no teste'), false);
    const notificationsAfterRestart = await fetch(`${base}/api/notifications`, { headers: { Cookie: cookie } });
    const notificationsAfterRestartBody = await notificationsAfterRestart.json();
    assert.equal(notificationsAfterRestartBody.publicKey, notificationsBody.publicKey);
  } finally {
    await stop();
    await new Promise(resolve => emailServer.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
