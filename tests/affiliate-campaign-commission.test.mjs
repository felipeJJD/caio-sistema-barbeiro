import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as orm from 'drizzle-orm';
import {SQLiteSyncDialect} from 'drizzle-orm/sqlite-core';
import * as schema from '../db/schema.ts';
const dialect=new SQLiteSyncDialect();
function load(path,db,extras={}) {
 const module={exports:{}};
 const require=name=>name==='drizzle-orm'?orm:name==='./schema'?schema:name==='./index'?{getDb:async()=>db}:name==='./access'?{requirePlatformAdmin(){}}:extras[name]||{};
 vm.runInNewContext(ts.transpile(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{module,exports:module.exports,require,console,Date,process,crypto});return module.exports;
}
function fixture({active=true,ends='2099-01-01T00:00:00Z'}={}) {
 const writes=[];const queries=[];
 const db={select(){let table,condition;const q={from(value){table=value;return q;},innerJoin(){return q;},where(value){condition=value;return q;},limit(){
  const sql=dialect.sqlToQuery(condition).sql;queries.push(sql);
  if(table===schema.subscriptionPayments)return [{id:1,organizationId:7,status:'approved',amountCents:10000}];
  if(table===schema.organizationReferrals){
   // A paused campaign remains eligible. A suspended affiliate must still be excluded.
   if(sql.includes('"affiliate_links"."active"') || (!active && sql.includes('"affiliates"."active"')))return [];
   return [{organizationId:7,affiliateId:42,affiliateLinkId:8,commissionBps:1500,commissionEndsAt:ends}];
  }
  if(table===schema.affiliateMercadoPagoConnections)return [{expiresAt:'2099-01-01T00:00:00Z',encryptedAccessToken:'fixture',accessTokenIv:'fixture'}];
  return [];
 }};return q;},insert(){return {values(row){writes.push(row);return {onConflictDoNothing:async()=>{}};}};}};
 return {db,writes,queries};
}
test('pausar campanha preserva comissão existente; suspensão e prazo encerrado continuam bloqueando',async()=>{
 for(const input of [{},{active:false},{ends:'2000-01-01T00:00:00Z'}]){
  const f=fixture(input);const api=load('db/affiliates.ts',f.db);await api.recordAffiliateCommission(1);
  assert.equal(f.writes.length,(!('active' in input)&&!('ends' in input))?1:0);
  if(f.writes.length)assert.equal(f.writes[0].commissionAmountCents,1500);
 }
});
test('split usa indicação existente com campanha pausada e preserva proteção do afiliado',async()=>{
 const f=fixture();const api=load('db/mercado-pago-affiliates.ts',f.db,{'./platform-secrets':{decryptSecret:async()=> 'fixture-token'}});
 const result=await api.getOrganizationAffiliateSplit(7);assert.equal(result.commissionBps,1500);
 assert.ok(f.queries[0].includes('"affiliates"."active"'));assert.ok(f.queries[0].includes('"affiliates"."payout_status"'));
});
