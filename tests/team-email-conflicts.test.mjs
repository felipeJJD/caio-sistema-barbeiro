import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { openDatabase } from '../runtime/storage.mjs';

const require = createRequire(import.meta.url);
function loader(mocks) {
  const cache = new Map();
  return function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file,module);
    const source = ts.transpile(fs.readFileSync(file,'utf8'), { module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 });
    vm.runInNewContext(source, { module,exports:module.exports,Date,Error,Request,Response,process,console,
      require:name => name in mocks ? mocks[name] : name.startsWith('.') ? load(path.resolve(path.dirname(file),`${name}.ts`)) : require(name),
    },{ filename:file });
    return module.exports;
  };
}
async function fixture() {
  const storage = openDatabase(':memory:');
  const synced = [];
  const mocks = {
    './auth': { syncTeamAccount:async (...args) => synced.push(args) },
    './notifications':{},'./platform-billing':{},'./products':{},'./team-money':{},'./whatsapp':{},'./whatsapp-dispatch':{},
  };
  const load = loader(mocks);
  const schema = load('db/schema.ts');
  const db = require('drizzle-orm/d1').drizzle(storage,{ schema });
  let beforeInsert = () => {};
  const proxy = new Proxy(db, { get(target,key) {
    if (key === 'insert') return table => { beforeInsert(table); return target.insert(table); };
    const value = Reflect.get(target,key);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  mocks['./index'] = { getDb:async () => proxy };
  const dashboard = load('db/dashboard.ts');
  await storage.prepare("INSERT INTO organizations (id,name,slug) VALUES (900,'Team fixture','team-fixture'),(901,'Other team fixture','other-team-fixture')").run();
  await storage.prepare("INSERT INTO team (id,organization_id,name,role,login_email,access_role,commission_cents,active) VALUES (900,900,'Owner','Owner','owner@example.invalid','owner',0,1),(901,901,'Existing professional','Barbeiro','existing@example.invalid','barber',0,0)").run();
  const access = { organizationId:900,teamMemberId:900,isOwner:true,email:'owner@example.invalid' };
  const input = { name:'Teste',role:'Barbeiro',loginEmail:'new@example.invalid',commissionRateBps:5000,active:true };
  return { storage,synced,dashboard,access,input,schema,setBeforeInsert(fn) { beforeInsert = fn; } };
}

test('email already registered in another shop gives a clear error and preserves every user',async () => {
  const f = await fixture();
  try {
    const before = await f.storage.prepare('SELECT * FROM team ORDER BY id').all();
    await assert.rejects(f.dashboard.saveTeamMember(f.access,{ ...f.input,loginEmail:' EXISTING@EXAMPLE.INVALID ' }),/Este e-mail já está em uso/);
    assert.deepEqual(await f.storage.prepare('SELECT * FROM team ORDER BY id').all(),before);
    assert.equal(f.synced.length,0);
  } finally { f.storage.close(); }
});

test('email held by an authentication account is checked before changing the professional',async () => {
  const f = await fixture();
  try {
    await f.storage.prepare("INSERT INTO auth_accounts (organization_id,team_member_id,email,password_hash,password_salt) VALUES (901,901,'account-only@example.invalid','fixture-hash','fixture-salt')").run();
    const before = await f.storage.prepare('SELECT * FROM team WHERE id=900').first();
    await assert.rejects(f.dashboard.saveTeamMember(f.access,{ ...f.input,loginEmail:'account-only@example.invalid' }),/Este e-mail já está em uso/);
    assert.deepEqual(await f.storage.prepare('SELECT * FROM team WHERE id=900').first(),before);
    assert.equal((await f.storage.prepare('SELECT COUNT(*) n FROM team').first()).n,2);
  } finally { f.storage.close(); }
});

test('new professional and owner editing keep valid email and schedule settings',async () => {
  const f = await fixture();
  try {
    await f.dashboard.saveTeamMember(f.access,{ ...f.input,loginEmail:' NEW@EXAMPLE.INVALID ',weeklyHours:Array.from({ length:7 },(_,day) => ({ day,enabled:day === 1,openingTime:'09:00',closingTime:'18:00' })) });
    const added = await f.storage.prepare("SELECT * FROM team WHERE login_email='new@example.invalid'").first();
    assert.equal(added.organization_id,900);
    assert.equal(added.commission_rate_bps,5000);
    assert.ok(JSON.parse(added.weekly_booking_hours).some(h => h.day === 1 && h.openingTime === '09:00'));
    await f.dashboard.saveTeamMember(f.access,{ ...f.input,id:900,loginEmail:'existing@example.invalid',active:false });
    const owner = await f.storage.prepare('SELECT * FROM team WHERE id=900').first();
    assert.equal(owner.login_email,'owner@example.invalid');
    assert.equal(owner.active,1);
    assert.equal(owner.access_role,'owner');
  } finally { f.storage.close(); }
});

test('concurrent duplicate insertion is translated instead of exposing SQL and submitted data',async () => {
  const f = await fixture();
  try {
    f.setBeforeInsert(table => {
      if (table === f.schema.team) {
        f.setBeforeInsert(() => {});
        f.storage.prepare("INSERT INTO team (organization_id,name,role,login_email,commission_cents) VALUES (901,'Concurrent fixture','Barbeiro','new@example.invalid',0)").run();
      }
    });
    await assert.rejects(f.dashboard.saveTeamMember(f.access,f.input),error => {
      assert.equal(error.message,'Este e-mail já está em uso. Use outro e-mail para este profissional.');
      assert.doesNotMatch(error.message,/Failed query|insert into|params:/i);
      return true;
    });
    assert.equal((await f.storage.prepare("SELECT COUNT(*) n FROM team WHERE organization_id=900 AND login_email='new@example.invalid'").first()).n,0);
  } finally { f.storage.close(); }
});

test('an update cannot synchronize an account belonging to another shop',async () => {
  const f = await fixture();
  try {
    const before = await f.storage.prepare('SELECT * FROM team WHERE id=901').first();
    await assert.rejects(f.dashboard.saveTeamMember(f.access,{ ...f.input,id:901 }),/Profissional não encontrado/);
    assert.deepEqual(await f.storage.prepare('SELECT * FROM team WHERE id=901').first(),before);
    assert.equal(f.synced.length,0);
  } finally { f.storage.close(); }
});

test('action endpoint does not display an unexpected database query to the customer',async () => {
  const mocks = {
    '../../../db/auth':{ getSessionAccess:async () => ({ isOwner:true }) },
    '../../../db/access':{ isOrganizationAccessExpired:() => false },
    '../../../db/dashboard':{ ensureDemoData:async () => {},saveTeamMember:async () => { throw new Error('Failed query: insert into team params: private-fixture'); } },
    '../../../db/owner-commission':{},'../../../db/products':{},'../../../lib/app-date':{},
  };
  const route = loader(mocks)('app/api/action/route.ts');
  const response = await route.POST(new Request('https://fixture.invalid/api/action',{ method:'POST',body:JSON.stringify({ action:'save-team' }) }));
  assert.equal(response.status,400);
  const body = await response.json();
  assert.equal(body.error,'Não foi possível salvar a alteração. Confira os dados e tente novamente.');
  assert.doesNotMatch(body.error,/private-fixture|Failed query|params:/);
});
