import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { openDatabase } from '../runtime/storage.mjs';

const require = createRequire(import.meta.url);
const now = Date.parse('2026-10-10T00:25:00.000Z');
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}

async function fixture(provider) {
  const storage = openDatabase(':memory:');
  const cache = new Map();
  const requests = [];
  const mocks = {};
  let beforeSend = async () => {};
  const env = {
    WHATSAPP_GRAPH_VERSION: 'v99.0', EVOLUTION_API_URL: 'https://fixture.invalid',
    EVOLUTION_API_KEY: 'fixture-key-with-at-least-24-characters',
    EVOLUTION_WEBHOOK_SECRET: 'fixture-secret-with-at-least-24-characters',
  };
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpile(fs.readFileSync(file, 'utf8'), { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
    vm.runInNewContext(code, {
      module, exports: module.exports, Date: Clock, Error, TextEncoder, AbortSignal,
      process: { env }, console: { ...console, info() {} },
      require: name => name in mocks ? mocks[name] : name.startsWith('.') ? load(path.resolve(path.dirname(file), `${name}.ts`)) : require(name),
      fetch: async (url, init) => {
        assert.match(url, /^(https:\/\/fixture\.invalid\/message\/sendText\/|https:\/\/graph\.facebook\.com\/v99\.0\/)/);
        const body = JSON.parse(init.body);
        requests.push({ url, body });
        return { ok: true, json: async () => provider === 'evolution' ? { key: { id: `fixture-${requests.length}` } } : { messages: [{ id: `fixture-${requests.length}` }] } };
      },
    }, { filename: file });
    return module.exports;
  }
  const schema = load('db/schema.ts');
  const db = require('drizzle-orm/d1').drizzle(storage, { schema });
  mocks['./index'] = { getDb: async () => db };
  mocks['./platform-secrets'] = { decryptSecret: async () => { await beforeSend(); return 'fixture-token'; } };
  mocks['./whatsapp-entitlement'] = { getWhatsappEntitlementForOrganization: async () => {
    if (provider === 'evolution') await beforeSend();
    return { hasAccess: true };
  } };
  const meta = load('db/whatsapp.ts');
  const evolution = load('db/evolution-whatsapp.ts');
  const dispatch = load('db/whatsapp-dispatch.ts');
  await storage.prepare("INSERT INTO organizations (id,name,slug) VALUES (900,'Fixture shop','fixture-shop'),(901,'Other fixture shop','other-fixture-shop')").run();
  await storage.prepare("INSERT INTO team (id,organization_id,name,role,commission_cents) VALUES (900,900,'Fixture barber','Barbeiro',0)").run();
  await storage.prepare("INSERT INTO services (id,organization_id,name,price_cents) VALUES (900,900,'Corte',1000)").run();
  await storage.prepare("INSERT INTO whatsapp_connections (organization_id,provider,status,phone_number_id,encrypted_access_token,access_token_iv) VALUES (900,?,'connected','fixture-instance','fixture-token','fixture-iv')").bind(provider).run();
  await storage.prepare("INSERT INTO whatsapp_automation_settings (organization_id,enabled) VALUES (900,1)").run();
  let nextId = 900;
  async function enqueue({ date = '2026-10-10', time = '08:30', status = 'Agendado', kind = 'reminder', phone = '41988811111', queuedPhone = '5541988811111', organizationId = 900, payload, scheduledAt = '2026-10-09T00:00:00.000Z', messageStatus = 'queued', errorText = '' } = {}) {
    const id = nextId++;
    await storage.prepare('INSERT INTO appointments (id,organization_id,appointment_date,appointment_time,client_name,phone,service_id,barber_id,status) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,900,date,time,`Fixture ${id}`,phone,900,900,status).run();
    const content = payload ?? JSON.stringify({ organizationName:'Fixture shop',clientName:`Fixture ${id}`,serviceName:'Corte',barberName:'Fixture barber',date,time });
    await storage.prepare('INSERT INTO whatsapp_messages (id,organization_id,appointment_id,kind,phone,dedupe_key,status,scheduled_at,payload_json,error_text) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,organizationId,id,kind,queuedPhone,`fixture-${id}`,messageStatus,scheduledAt,content,errorText).run();
    return id;
  }
  const processQueue = provider === 'evolution' ? evolution.processEvolutionWhatsappQueue : meta.processWhatsappQueue;
  return { storage, requests, enqueue, dispatch, processQueue, setBeforeSend(fn) { beforeSend = fn; }, row: id => storage.prepare('SELECT * FROM whatsapp_messages WHERE id=?').bind(id).first() };
}

for (const provider of ['meta_cloud', 'evolution']) {
  test(`${provider}: booking dispatch sends only its own appointment, then worker cancels expired reminders`, async () => {
    const f = await fixture(provider);
    try {
      const expired = await f.enqueue({ date:'2026-10-08',phone:'41988822222',queuedPhone:'5541988822222' });
      const other = await f.enqueue({ phone:'41988833333',queuedPhone:'5541988833333' });
      const own = await f.enqueue({ kind:'confirmation' });
      const result = await f.dispatch.processConnectedWhatsappQueueSafely(900, own, 3);
      assert.equal(result.sent,1);
      assert.equal(f.requests.length,1);
      assert.equal(f.requests[0].body.to ?? f.requests[0].body.number,'5541988811111');
      assert.equal((await f.row(own)).status,'sent');
      assert.equal((await f.row(expired)).status,'queued');
      assert.equal((await f.row(other)).status,'queued');
      await f.processQueue({ limit:20 });
      assert.equal((await f.row(expired)).status,'cancelled');
      assert.match((await f.row(expired)).error_text,/horário já passou/);
      assert.equal((await f.row(other)).status,'sent');
      assert.deepEqual(f.requests.map(r => r.body.to ?? r.body.number),['5541988811111','5541988833333']);
    } finally { f.storage.close(); }
  });

  test(`${provider}: stale, changed, removed, unconfirmed and foreign appointments never reach the provider`, async () => {
    const f = await fixture(provider);
    try {
      const ids = [];
      ids.push(await f.enqueue({ date:'2026-10-08' }));
      ids.push(await f.enqueue({ date:'2026-10-09',time:'21:25' })); // Exact local start, UTC day differs.
      ids.push(await f.enqueue({ phone:'41988844444' }));
      for (const status of ['Cancelado','Atendido','Aguardando','Aguardando pagamento']) ids.push(await f.enqueue({ status }));
      const changedTime = await f.enqueue(); ids.push(changedTime);
      await f.storage.prepare("UPDATE appointments SET appointment_time='09:30' WHERE id=?").bind(changedTime).run();
      const changedClient = await f.enqueue(); ids.push(changedClient);
      await f.storage.prepare("UPDATE appointments SET client_name='Different client' WHERE id=?").bind(changedClient).run();
      const deleted = await f.enqueue(); ids.push(deleted);
      await f.storage.prepare('DELETE FROM appointments WHERE id=?').bind(deleted).run();
      const foreign = await f.enqueue({ organizationId:901 }); ids.push(foreign);
      for (const payload of ['{','null','[]','{}']) ids.push(await f.enqueue({ payload }));
      ids.push(await f.enqueue({ kind:'cancellation' }));
      await f.processQueue({ limit:50 });
      assert.equal(f.requests.length,0);
      for (const id of ids) {
        const row = await f.row(id);
        if (row.organization_id === 901) continue;
        assert.equal(row.status,'cancelled',`message ${id}`);
        assert.ok(row.error_text);
      }
      // Same connection, but an appointment belonging to another organization.
      await f.storage.prepare('UPDATE whatsapp_messages SET organization_id=900 WHERE id=?').bind(foreign).run();
      await f.storage.prepare('UPDATE appointments SET organization_id=901 WHERE id=?').bind(foreign).run();
      await f.processQueue({ limit:50 });
      assert.equal((await f.row(foreign)).status,'cancelled');
      assert.equal(f.requests.length,0);
    } finally { f.storage.close(); }
  });

  test(`${provider}: current reminders, cancellation and bot replies still work; future jobs wait and duplicate workers cannot resend`, async () => {
    const f = await fixture(provider);
    try {
      const current = await f.enqueue({ date:'2026-10-09',time:'21:26',phone:'(41) 98881-1111' });
      const cancellation = await f.enqueue({ kind:'cancellation',status:'Cancelado' });
      const bot = await f.enqueue({ kind:'bot_text',payload:JSON.stringify({ text:'Fixture reply' }) });
      await f.storage.prepare('UPDATE whatsapp_messages SET appointment_id=NULL WHERE id=?').bind(bot).run();
      const future = await f.enqueue({ scheduledAt:'2026-10-10T08:00:00.000Z' });
      await Promise.all([f.processQueue({ limit:50 }), f.processQueue({ limit:50 })]);
      assert.equal(f.requests.length,3);
      for (const id of [current,cancellation,bot]) assert.equal((await f.row(id)).status,'sent');
      assert.equal((await f.row(future)).status,'queued');
    } finally { f.storage.close(); }
  });

  test(`${provider}: phone edited after queue selection is checked again before delivery`, async () => {
    const f = await fixture(provider);
    try {
      const id = await f.enqueue();
      f.setBeforeSend(async () => { await f.storage.prepare("UPDATE appointments SET phone='41988844444' WHERE id=?").bind(id).run(); });
      await f.processQueue({ limit:20 });
      assert.equal(f.requests.length,0);
      assert.equal((await f.row(id)).status,'cancelled');
    } finally { f.storage.close(); }
  });
}

test('Evolution never retries an expired appointment left over from the previous provider', async () => {
  const f = await fixture('evolution');
  try {
    const id = await f.enqueue({ date:'2026-10-08',messageStatus:'failed',errorText:'A conexão do WhatsApp desta barbearia não está ativa.' });
    await f.processQueue({ limit:20 });
    assert.equal(f.requests.length,0);
    assert.equal((await f.row(id)).status,'cancelled');
  } finally { f.storage.close(); }
});
