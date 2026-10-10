import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { openDatabase } from '../runtime/storage.mjs';
const require=createRequire(import.meta.url);
function loader(mocks) {
 const cache=new Map();
 return function load(file) {file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;
 const module={exports:{}};cache.set(file,module);
 vm.runInNewContext(ts.transpile(fs.readFileSync(file,'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}),{module,exports:module.exports,Date,Error,process,console,crypto,TextEncoder,URL,Response,require:name=>name in mocks?mocks[name]:name.startsWith('.')?load(path.resolve(path.dirname(file),`${name}.ts`)):require(name)},{filename:file});return module.exports;};
}
test('bound invitation ignores submitted identity, verifies correct email, and does not create account before confirmation',async()=>{
 const storage=openDatabase(':memory:');const sent=[];
 const mocks={'../runtime/env':{env:{DB:storage}},'../lib/owner-email':{ownerEmailVerificationIsConfigured:async()=>true,sendAccessVerificationEmail:async data=>sent.push(data)}};
 const load=loader(mocks);const schema=load('db/schema.ts');const db=require('drizzle-orm/d1').drizzle(storage,{schema});mocks['./index']={getDb:async()=>db};
 try {
 await storage.prepare("INSERT INTO organizations (id,name,slug) VALUES (900,'Shop fixture','bound-fixture')").run();
 const token='a'.repeat(32);const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))).toString('hex');
 await storage.prepare("INSERT INTO team_invites (organization_id,token_hash,invited_name,invited_email,created_by_team_member_id,expires_at) VALUES (900,?,'Employee fixture','employee@example.invalid',900,?)").bind(hash,new Date(Date.now()+86400000).toISOString()).run();
 const auth=load('db/verified-registration.ts');
 await auth.startTeamInviteVerification(token,{name:'Attacker fixture',email:'wrong@example.invalid',password:'fixture-password'});
 assert.equal(sent[0].email,'employee@example.invalid');assert.equal(sent[0].name,'Employee fixture');
 const pending=await storage.prepare("SELECT name,email FROM pending_registrations WHERE organization_id=900").first();assert.equal(pending.email,'employee@example.invalid');
 assert.equal((await storage.prepare('SELECT COUNT(*) AS n FROM auth_accounts').first()).n,0);
 await assert.rejects(auth.startTeamInviteVerification(token,{name:'Fixture',email:'fixture@example.invalid',password:'fixture-password'}),/não está mais disponível/);
 }finally{storage.close();}
});

test('missing request identity still consumes a shared rate-limit bucket',async()=>{
 const storage=openDatabase(':memory:');const load=loader({'@/runtime/env':{env:{DB:storage}}});
 try {const {enforceRateLimit}=load('db/rate-limit.ts');const input={scope:'fixture-no-identity',limit:1,windowMs:60000,message:'Fixture rate limit'};
 await enforceRateLimit(input);await assert.rejects(enforceRateLimit(input),/Fixture rate limit/);
 }finally{storage.close();}
});
test('public errors hide SQL and parameters while keeping validation messages',()=>{
 const {publicErrorMessage}=loader({})('lib/api-error.ts');
 assert.match(publicErrorMessage(Error('Failed query: INSERT INTO team params: private@example.invalid'),'Não foi possível salvar.'),/^Não foi possível salvar. Referência:/);
 assert.equal(publicErrorMessage(Error('Informe seu nome.'),'Falha.'),'Informe seu nome.');
});
