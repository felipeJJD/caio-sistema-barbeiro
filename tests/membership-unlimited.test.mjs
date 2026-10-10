import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { openDatabase } from '../runtime/storage.mjs';
import os from 'node:os';
import { appDate } from '../lib/app-date.ts';

const require = createRequire(import.meta.url);
const today = appDate();
function day(offset) { const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+offset); return date.toISOString().slice(0,10); }
function loader(mocks) {
  const cache = new Map();
  return function load(file) {
    file=path.resolve(file);
    if(cache.has(file)) return cache.get(file).exports;
    const module={ exports:{} };cache.set(file,module);
    vm.runInNewContext(ts.transpile(fs.readFileSync(file,'utf8'),{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 }),{
      module,exports:module.exports,Date,Error,process,console,crypto,TextEncoder,URL,Request,Response,
      require:name => name in mocks ? mocks[name] : name.startsWith('.') ? load(path.resolve(path.dirname(file),`${name}.ts`)) : require(name),
    },{ filename:file });
    return module.exports;
  };
}
async function fixture({ unlimited=true, balance=0 }={}) {
  const storage=openDatabase(':memory:');
  const notices=[];
  const mocks={
    './auth':{}, './notifications':{ notifyOwnersOfAttendance:async (_,data)=>notices.push(data),notifyOwnersOfPublicBooking:async data=>notices.push(data),notifyBookingChange:async()=>{},notifyOwnersOfAppointmentCancellation:async()=>{} },
    './platform-billing':{}, './products':{ deleteProductSalesForDailyRecord:async()=>{} }, './team-money':{},
    './whatsapp':{ queueAppointmentWhatsappSafely:async()=>({ queued:false }),queueAppointmentReminderOnlySafely:async()=>({ queued:false }) }, './whatsapp-dispatch':{ processConnectedWhatsappQueueSafely:async()=>{ throw Error('No real provider allowed in this test'); } },
    './public-gallery':{ listPublicGalleryImages:async()=>[] },
    './booking-payments':{ getBookingPaymentSettings:async()=>({ pixEnabled:false,cashEnabled:true,debitEnabled:false,creditEnabled:false,pixKey:'' }) },
    '@/runtime/env':{ env:{ DB:storage } },
  };
  const load=loader(mocks);const schema=load('db/schema.ts');
  const db=require('drizzle-orm/d1').drizzle(storage,{ schema });mocks['./index']={ getDb:async()=>db };
  const hours=JSON.stringify(Array.from({ length:7 },(_,day)=>({ day,enabled:true,openingTime:'08:00',closingTime:'20:00' })));
  await storage.prepare("INSERT INTO organizations (id,name,slug,weekly_booking_hours,public_booking_requires_approval) VALUES (900,'Unlimited fixture','unlimited-fixture',?,0),(901,'Other fixture','other-fixture',?,0)").bind(hours,hours).run();
  await storage.prepare("INSERT INTO team (id,organization_id,name,role,login_email,access_role,commission_cents,active) VALUES (900,900,'Owner','Owner','owner@example.invalid','owner',0,1),(902,900,'Staff','Barbeiro','staff@example.invalid','barber',0,1),(901,901,'Other','Owner','other@example.invalid','owner',0,1)").run();
  await storage.prepare("INSERT INTO services (id,organization_id,name,price_cents,duration_minutes) VALUES (900,900,'Corte',3000,30),(901,901,'Corte',3000,30)").run();
  await storage.prepare("INSERT INTO payment_methods (id,organization_id,name) VALUES (900,900,'Dinheiro'),(901,901,'Dinheiro')").run();
  await storage.prepare("INSERT INTO plans (id,organization_id,name,plan_kind,service_id,monthly_value_cents,max_uses,barber_payout_cents,unlimited_uses) VALUES (900,900,'Corte mensal','Corte',900,9000,4,1500,?),(901,901,'Other plan','Corte',901,9000,4,1500,0)").bind(Number(unlimited)).run();
  await storage.prepare("INSERT INTO clients (id,organization_id,name,phone,plan,plan_kind,balance,max_balance,due_date,status,monthly_value_cents,plan_id,payment_method_id,paid_month,unlimited_uses) VALUES (900,900,'Cliente mensal','41999990000','Corte mensal','Corte',?,4,?,'Ativo',9000,900,900,?,?),(901,901,'Cliente outra loja','41999990001','Other plan','Corte',4,4,?,'Ativo',9000,901,901,?,0)").bind(balance,day(30),today.slice(0,7),Number(unlimited),day(30),today.slice(0,7)).run();
  return { storage,notices,dashboard:load('db/dashboard.ts'),publicBooking:load('db/public-booking.ts'),access:{ organizationId:900,teamMemberId:900,isOwner:true,email:'owner@example.invalid' },staff:{ organizationId:900,teamMemberId:902,isOwner:false,email:'staff@example.invalid' } };
}
async function use(f,barberId=902) { await f.dashboard.createDailyRecord(f.access,{ occurredAt:today,recordType:'Mensalista',membershipClientId:900,barberId }); }
function input() { return { date:day(1),time:'10:00',serviceId:900,barberId:902,clientName:'Cliente mensal',phone:'41999990000',paymentChoice:'Mensalista',isMembership:true,membershipClientId:900 }; }

test('unlimited membership records more than four uses, staff commissions, and owner payout without draining credits',async()=>{
  const f=await fixture();try {
    for(let i=0;i<8;i++) await use(f);
    await use(f,900);
    const client=await f.storage.prepare('SELECT balance FROM clients WHERE id=900').first();assert.equal(client.balance,0);
    const records=await f.storage.prepare('SELECT commission_cents FROM daily_records WHERE organization_id=900 ORDER BY id').all();
    assert.equal(records.results.length,9);assert.equal(records.results.slice(0,8).reduce((s,r)=>s+r.commission_cents,0),12000);assert.equal(records.results[8].commission_cents,0);
    const first=await f.storage.prepare('SELECT id FROM daily_records WHERE organization_id=900 LIMIT 1').first();
    await f.dashboard.deleteDailyRecord(f.access,first.id);assert.equal((await f.storage.prepare('SELECT balance FROM clients WHERE id=900').first()).balance,0);
  }finally{f.storage.close();}
});

test('finite membership still stops at the last available credit and respects reservations',async()=>{
  const f=await fixture({ unlimited:false,balance:1 });try{
    await f.publicBooking.createPublicBooking('unlimited-fixture',input());
    await assert.rejects(use(f),/não tem créditos disponíveis/);
    const appointment=await f.storage.prepare('SELECT id FROM appointments WHERE organization_id=900').first();
    await f.dashboard.completeAppointment(f.access,{ id:appointment.id,occurredAt:today,paymentMethodId:900 });
    await assert.rejects(use(f),/não tem créditos disponíveis/);
    assert.equal((await f.storage.prepare('SELECT balance FROM clients WHERE id=900').first()).balance,0);
  }finally{f.storage.close();}
});

test('unlimited public booking has no credit cap but keeps conflicts, expiry, cancellation, and completion idempotency',async()=>{
  const f=await fixture();try{
    const found=await f.publicBooking.findPublicMembership('unlimited-fixture','Cliente mensal','',900);
    assert.equal(found.unlimitedUses,true);assert.equal(found.remainingUses,0);
    const a=await f.publicBooking.createPublicBooking('unlimited-fixture',input());
    await assert.rejects(f.publicBooking.createPublicBooking('unlimited-fixture',input()),/ocupado|disponível/);
    await f.publicBooking.createPublicBooking('unlimited-fixture',{...input(),time:'11:00'});
    for(const time of ['12:00','13:00','14:00','15:00','16:00']) await f.publicBooking.createPublicBooking('unlimited-fixture',{...input(),time});
    assert.equal((await f.storage.prepare('SELECT COUNT(*) n FROM appointments WHERE membership_client_id=900').first()).n,7);
    await f.dashboard.completeAppointment(f.access,{ id:a.id,occurredAt:day(1),paymentMethodId:900 });
    await f.dashboard.completeAppointment(f.access,{ id:a.id,occurredAt:day(1),paymentMethodId:900 });
    assert.equal((await f.storage.prepare('SELECT COUNT(*) n FROM daily_records WHERE appointment_id=?').bind(a.id).first()).n,1);
    const b=await f.storage.prepare("SELECT id FROM appointments WHERE appointment_time='11:00'").first();await f.dashboard.cancelAppointment(f.access,b.id);
    assert.equal((await f.storage.prepare('SELECT balance FROM clients WHERE id=900').first()).balance,0);
    await assert.rejects(f.publicBooking.createPublicBooking('unlimited-fixture',{...input(),date:day(31)}),/vencimento/);
    await f.storage.prepare('UPDATE clients SET due_date=? WHERE id=900').bind(day(-1)).run();
    await assert.rejects(f.publicBooking.findPublicMembership('unlimited-fixture','Cliente mensal','',900),/venceu/);
    await assert.rejects(use(f),/venceu/);
  }finally{f.storage.close();}
});

test('plan editing preserves purchased allowance; renewal adopts unlimited mode and snapshots it',async()=>{
  const f=await fixture({ unlimited:false,balance:1 });try{
    await f.dashboard.savePlan(f.access,{ id:900,name:'Corte ilimitado',planKind:'Corte',monthlyValueCents:12000,maxUses:4,unlimitedUses:true,barberPayoutCents:1700,active:true });
    let client=await f.storage.prepare('SELECT * FROM clients WHERE id=900').first();assert.equal(client.unlimited_uses,0);assert.equal(client.balance,1);assert.equal(client.max_balance,4);
    await f.dashboard.renewClient(f.access,900);client=await f.storage.prepare('SELECT * FROM clients WHERE id=900').first();assert.equal(client.unlimited_uses,1);
    const payment=await f.storage.prepare('SELECT * FROM membership_payments WHERE client_id=900').first();assert.equal(payment.unlimited_uses,1);assert.equal(payment.amount_cents,12000);
    await f.dashboard.savePlan(f.access,{ id:900,name:'Corte limitado',planKind:'Corte',monthlyValueCents:12000,maxUses:2,unlimitedUses:false,barberPayoutCents:1700,active:true });
    assert.equal((await f.storage.prepare('SELECT unlimited_uses FROM clients WHERE id=900').first()).unlimited_uses,1);
    assert.equal((await f.storage.prepare('SELECT unlimited_uses FROM membership_payments WHERE client_id=900').first()).unlimited_uses,1);
  }finally{f.storage.close();}
});

test('new clients inherit unlimited mode and editing contact details preserves a purchased mode',async()=>{
  const f=await fixture();try{
    await f.dashboard.saveClient(f.access,{ name:'Novo mensalista',phone:'41999990002',planId:900,paymentMethodId:900,status:'Ativo',dueDate:day(30),paidMonth:today.slice(0,7) });
    const c=await f.storage.prepare("SELECT * FROM clients WHERE name='Novo mensalista'").first();assert.equal(c.unlimited_uses,1);
    await f.storage.prepare('UPDATE plans SET unlimited_uses=0 WHERE id=900').run();
    await f.dashboard.saveClient(f.access,{ id:c.id,name:c.name,phone:'41999990003',planId:900,paymentMethodId:900,status:'Ativo',dueDate:c.due_date,paidMonth:c.paid_month });
    assert.equal((await f.storage.prepare('SELECT unlimited_uses FROM clients WHERE id=?').bind(c.id).first()).unlimited_uses,1);
    assert.equal((await f.storage.prepare('SELECT unlimited_uses FROM membership_payments WHERE client_id=?').bind(c.id).first()).unlimited_uses,1);
  }finally{f.storage.close();}
});

test('unlimited plans remain scoped to the shop and only owners can configure them',async()=>{
  const f=await fixture();try{
    const p={ id:901,name:'Changed',planKind:'Corte',monthlyValueCents:10000,maxUses:4,unlimitedUses:true,barberPayoutCents:1500,active:true };
    await assert.rejects(f.dashboard.savePlan(f.access,p),/não encontrado nesta barbearia/);
    await assert.rejects(f.dashboard.savePlan(f.staff,{...p,id:900}),/Somente o administrador/);
    await assert.rejects(f.publicBooking.findPublicMembership('unlimited-fixture','Cliente outra loja','',901),/Não encontramos/);
    await assert.rejects(f.dashboard.createDailyRecord(f.access,{ occurredAt:today,recordType:'Mensalista',membershipClientId:901,barberId:902 }),/Escolha o mensalista/);
    assert.equal((await f.storage.prepare('SELECT unlimited_uses FROM plans WHERE id=901').first()).unlimited_uses,0);
  }finally{f.storage.close();}
});


test('additive migration preserves existing clients, payments, records, and finite allowances',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'membership-upgrade-'));
  const migrations=path.join(directory,'migrations');fs.cpSync('drizzle',migrations,{ recursive:true });
  const journalPath=path.join(migrations,'meta','_journal.json');const journal=JSON.parse(fs.readFileSync(journalPath,'utf8'));journal.entries=journal.entries.filter(e=>e.idx<52);fs.writeFileSync(journalPath,JSON.stringify(journal));
  const filename=path.join(directory,'fixture.sqlite');let db;
  try{
    db=openDatabase(filename,migrations);
    await db.prepare("INSERT INTO clients (id,organization_id,name,phone,plan,plan_kind,balance,max_balance,due_date,status,monthly_value_cents,plan_id,payment_method_id,paid_month) VALUES (990,1,'Legacy fixture','','Legacy','Corte',2,4,'2030-01-01','Ativo',9000,0,0,'2026-10')").run();
    await db.prepare("INSERT INTO membership_payments (organization_id,client_id,client_name,plan_name,plan_kind,payment_method_id,payment_name,paid_month,occurred_at,amount_cents,fee_cents) VALUES (1,990,'Legacy fixture','Legacy','Corte',0,'Legacy payment','2026-10','2026-10-01',9000,150)").run();
    const oldPayments=await db.prepare('SELECT * FROM membership_payments WHERE client_id=990').all();
    const oldRecords=await db.prepare('SELECT * FROM daily_records').all();
    const before=await db.prepare('SELECT * FROM clients WHERE id=990').first();db.close();db=openDatabase(filename);
    const after=await db.prepare('SELECT * FROM clients WHERE id=990').first();
    const { unlimited_uses,...original }=after;assert.equal(unlimited_uses,0);assert.deepEqual(original,before);
    const newPayments=await db.prepare('SELECT * FROM membership_payments WHERE client_id=990').all();
    assert.deepEqual(newPayments.results.map(({ unlimited_uses,max_uses,...row })=>row),oldPayments.results);
    assert.equal(newPayments.results[0].unlimited_uses,0);assert.equal(newPayments.results[0].max_uses,null);
    assert.deepEqual(await db.prepare('SELECT * FROM daily_records').all(),oldRecords);
    assert.equal((await db.prepare('SELECT COUNT(*) n FROM _railway_migrations WHERE name=?').bind('0052_membership_unlimited').first()).n,1);
    db.close();db=openDatabase(filename);assert.equal((await db.prepare('SELECT unlimited_uses FROM clients WHERE id=990').first()).unlimited_uses,0);
  }finally{db?.close();fs.rmSync(directory,{recursive:true,force:true});}
});

test('editing without the new flag preserves unlimited mode and invalid numeric limits are rejected',async()=>{
  const f=await fixture();try{
    const values={ id:900,name:'Plano mensal',planKind:'Corte',monthlyValueCents:10000,maxUses:4,barberPayoutCents:1500,active:true };
    await f.dashboard.savePlan(f.access,values);assert.equal((await f.storage.prepare('SELECT unlimited_uses FROM plans WHERE id=900').first()).unlimited_uses,1);
    for(const bad of [NaN,1.5,-1,Infinity]) await assert.rejects(f.dashboard.savePlan(f.access,{...values,unlimitedUses:false,maxUses:bad}),/valores válidos/);
  }finally{f.storage.close();}
});
