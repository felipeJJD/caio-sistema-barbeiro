import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function runtime(path,imports={},extra={}) {
 const module={exports:{}};
 const source=ts.transpile(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
 const context={module,exports:module.exports,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);},console,process,crypto,TextEncoder,AbortSignal,setTimeout,clearTimeout,Response,...extra};
 vm.runInNewContext(source,context,{filename:path});return module.exports;
}
const ok=body=>Promise.resolve(Response.json(body));
const credentials={EVOLUTION_API_URL:'https://evolution.test',EVOLUTION_API_KEY:'unit-key-not-real-0123456789',EVOLUTION_WEBHOOK_SECRET:'unit-hook-not-real-0123456789'};
test('instâncias são por afiliado, ADM atual é preservado e normalização não duplica 55',()=>{
 const api=runtime('lib/affiliate-prospecting-whatsapp.ts');
 assert.equal(api.prospectingInstanceFor({affiliateId:42}),'ca-prospeccao-affiliate-42');
 assert.equal(api.prospectingInstanceFor({affiliateId:1,isAdmin:true}),'ca-prospeccao-outbound');
 assert.throws(()=>api.prospectingInstanceFor({affiliateId:0}));
 assert.equal(api.isProspectingInstance('ca-org-42'),false);
 for(const value of ['(41) 99999-9999','+55 41 99999-9999'])assert.equal(api.normalizeProspectingWhatsappPhone(value),'5541999999999');
 assert.equal(api.normalizeProspectingWhatsappPhone('554195824583'),'554195824583');
});
test('conectar afiliado não recria nem desconecta a instância ADM',async()=>{
 const calls=[];
 const api=runtime('lib/affiliate-prospecting-whatsapp.ts',{}, {process:{env:credentials},fetch:(url,init={})=>{
   calls.push({url,body:init.body});
   if(url.includes('connectionState'))return ok({instance:{state:'close'}});
   if(url.includes('fetchInstances?'))return ok([]);
   if(url.endsWith('fetchInstances'))return ok([{name:'ca-prospeccao-outbound',ownerJid:'5541888888888@s.whatsapp.net'}]);
   if(url.includes('/instance/create'))return ok({pairingCode:'ABCD1234'});
   throw Error('unexpected '+url);
 }});
 const result=await api.beginProspectingWhatsappPairing('(41) 99999-9999','ca-prospeccao-affiliate-42');
 assert.equal(result.pairingCode,'ABCD1234');
 assert.ok(calls.find(call=>call.body&&JSON.parse(call.body).instanceName==='ca-prospeccao-affiliate-42'));
 assert.ok(!calls.some(call=>call.url.includes('/delete/')||call.url.includes('/logout/')||call.url.includes('/connect/ca-prospeccao-outbound')));
});
test('webhook aceita lista, usa remoteJidAlt e ignora LID sem telefone e grupos',async()=>{
 const calls=[];
 const helpers=runtime('lib/affiliate-prospecting-whatsapp.ts');
 const api=runtime('lib/affiliate-prospecting-inbound.ts',{'./affiliate-prospecting-whatsapp':helpers,'./affiliate-prospecting-bridge':{affiliateProspectingFetch:async(path,options)=>{calls.push({path,...options});return {response:{ok:true},payload:{matched:true}};}}});
 const message=(id,jid,alt,fromMe=false)=>({key:{id,remoteJid:jid,remoteJidAlt:alt,fromMe},message:{conversation:'oi'}});
 const result=await api.captureProspectingEvolutionInbound({instance:'ca-prospeccao-affiliate-42',event:'MESSAGES_UPSERT',data:[message('a','123456789@lid','5541999999999@s.whatsapp.net'),message('b','5541999999999@lid'),message('c','123@g.us','5541999999999@s.whatsapp.net'),message('d','5541888888888@s.whatsapp.net')]});
 assert.equal(result.recorded,true);assert.equal(calls.length,2);
 assert.equal(calls[0].body.phoneE164,'5541999999999');assert.equal(calls[0].body.instance,'ca-prospeccao-affiliate-42');
 assert.equal((await api.captureProspectingEvolutionInbound({instance:'ca-org-42',event:'MESSAGES_UPSERT',data:message('x','5541999999999@s.whatsapp.net')})).handled,false);
 await api.captureProspectingEvolutionInbound({instance:'ca-prospeccao-affiliate-42',event:'MESSAGES_UPSERT',data:message('e','5541999999999@s.whatsapp.net',undefined,true)});
 assert.equal(calls.at(-1).body.action,'outbound');
});
test('falha após Evolution aceitar não manda a mensagem novamente',async()=>{
 let sends=0;const commands=[];
 const job={id:'job',owner:'affiliate:42',instance:'ca-prospeccao-affiliate-42',phoneE164:'5541999999999',message:'teste',leaseToken:'lease',attempts:0};
 const api=runtime('lib/affiliate-prospecting-processor.ts',{
 '../db/affiliate-auth':{getAffiliateProspectorAccess:async()=>({active:true,affiliateId:42})},
 './affiliate-prospecting-whatsapp':{prospectingInstanceFor:()=>job.instance,getProspectingWhatsappState:async()=>({connected:true}),sendProspectingWhatsappText:async()=>{sends++;return {providerMessageId:'accepted'};}},
 './affiliate-prospecting-bridge':{affiliateProspectingFetch:async(path,{body})=>{commands.push(body);if(body.action==='lease')return {response:{ok:true},payload:{job}};if(body.action==='dispatch')return {response:{ok:true},payload:{allowed:true}};if(body.status==='sent')throw Error('database temporarily unavailable');return {response:{ok:true},payload:{ok:true}};}}
 });
 await api.runProspectingQueue();assert.equal(sends,1);assert.equal(commands.at(-1).status,'uncertain');
});
test('afiliado pausado cancela o trabalho sem enviar',async()=>{
 let sends=0;const commands=[];const job={id:'j',owner:'affiliate:42',instance:'ca-prospeccao-affiliate-42',leaseToken:'l'};
 const api=runtime('lib/affiliate-prospecting-processor.ts',{
 '../db/affiliate-auth':{getAffiliateProspectorAccess:async()=>({active:false,affiliateId:42})},
 './affiliate-prospecting-whatsapp':{prospectingInstanceFor:()=>job.instance,sendProspectingWhatsappText:async()=>sends++},
 './affiliate-prospecting-bridge':{affiliateProspectingFetch:async(path,{body})=>{commands.push(body);return {response:{ok:true},payload:body.action==='lease'?{job}:{ok:true}};}}
 });await api.runProspectingQueue();assert.equal(sends,0);assert.equal(commands.at(-1).status,'cancelled');
});
