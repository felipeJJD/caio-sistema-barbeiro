import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { spawn, spawnSync } from 'node:child_process';
import ts from 'typescript';
import { validAppOrigin } from '../lib/request-origin.ts';
function runtime(path,imports={},extra={}) {
 const module={exports:{}};
 const source=ts.transpile(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022});
 const context={module,exports:module.exports,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);},console,process,crypto,TextEncoder,AbortSignal,setTimeout,clearTimeout,Response,URL,URLSearchParams,...extra};
 vm.runInNewContext(source,context,{filename:path});return module.exports;
}
const ok=body=>Promise.resolve(Response.json(body));
const credentials={EVOLUTION_API_URL:'https://evolution.test',EVOLUTION_API_KEY:'unit-key-not-real-0123456789',EVOLUTION_WEBHOOK_SECRET:'unit-hook-not-real-0123456789'};
test('roteiro e áudio aceitam origem pública atrás do proxy e recusam origem externa',async()=>{
 let scriptWrites=0,audioWrites=0;
 const prefix='../'.repeat(5);
 const profile={script:'Oi',audioId:'12345678-1234-1234-1234-123456789012'};
 const api=runtime('app/api/affiliate/prospecting/audio/route.ts',{
  [prefix+'db/affiliate-auth']:{getAffiliateSessionAccess:async()=>({active:true,affiliateId:42})},
  [prefix+'lib/affiliate-prospecting-bridge']:{affiliateProspectorIdentity:()=>({prospectorKey:'affiliate:42'})},
  [prefix+'lib/affiliate-prospecting-audio']:{saveVoiceScript:async(owner)=>{assert.equal(owner,'affiliate:42');scriptWrites++;return profile;},saveVoiceAudio:async(owner)=>{assert.equal(owner,'affiliate:42');audioWrites++;return profile;}},
  [prefix+'lib/request-origin']:{validAppOrigin}
 },{Buffer});
 const target='http://0.0.0.0:8080/api/affiliate/prospecting/audio';
 const headers={origin:'https://cortouanotou.com.br','x-forwarded-host':'cortouanotou.com.br','x-forwarded-proto':'https'};
 assert.equal((await api.POST(new Request(target,{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({script:'Oi'})}))).status,200);
 assert.equal((await api.POST(new Request(target,{method:'POST',headers:{...headers,'content-type':'audio/mp4','x-audio-duration':'26'},body:Buffer.alloc(200)}))).status,200);
 assert.equal(scriptWrites,1);assert.equal(audioWrites,1);
 for(const origin of ['https://evil.invalid','null','http://cortouanotou.com.br','https://cortouanotou.com.br.evil.invalid']) {
  const response=await api.POST(new Request(target,{method:'POST',headers:{...headers,origin,'content-type':'application/json'},body:JSON.stringify({script:'No'})}));
  assert.equal(response.status,403);
 }
 assert.equal(scriptWrites,1);
});
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
 './affiliate-prospecting-audio':{getVoiceAudio:async()=>null},
 './affiliate-prospecting-bridge':{affiliateProspectingFetch:async(path,{body})=>{commands.push(body);if(body.action==='lease')return {response:{ok:true},payload:{job}};if(body.action==='dispatch')return {response:{ok:true},payload:{allowed:true}};if(body.status==='sent')throw Error('database temporarily unavailable');return {response:{ok:true},payload:{ok:true}};}}
 });
 await api.runProspectingQueue();assert.equal(sends,1);assert.equal(commands.at(-1).status,'uncertain');
});
test('ações na fila usam a identidade da sessão e rejeitam acesso inativo e ações indevidas',async()=>{
 let active=true;const calls=[];
 const api=runtime('app/api/affiliate/prospecting/queue/route.ts',{
 ['../'.repeat(5)+'db/affiliate-auth']:{getAffiliateSessionAccess:async()=>({active,affiliateId:42,name:'Afiliado'})},
 ['../'.repeat(5)+'lib/affiliate-prospecting-bridge']:{affiliateProspectorIdentity:()=>({prospectorKey:'affiliate:42'}),affiliateProspectingFetch:async(path,options)=>{calls.push({path,...options});return {response:{status:200},payload:{ok:true}};}}
 });
 const request=body=>new Request('https://app.test/api/affiliate/prospecting/queue',{method:'POST',body:JSON.stringify(body)});
 const id='12345678-1234-1234-1234-123456789012';
 assert.equal((await api.POST(request({action:'retry',id,prospectorKey:'affiliate:99'}))).status,200);
 assert.equal(calls[0].prospectorKey,'affiliate:42');assert.equal(calls[0].body.action,'retry');
 assert.equal('prospectorKey' in calls[0].body,false);
 assert.equal((await api.POST(request({action:'dispatch',id}))).status,400);
 assert.equal((await api.POST(request({action:'retry',id:'------------------------------------'}))).status,400);
 active=false;assert.equal((await api.POST(request({action:'confirm_sent',id}))).status,401);assert.equal(calls.length,1);
});
test('afiliado pausado cancela o trabalho sem enviar',async()=>{
 let sends=0;const commands=[];const job={id:'j',owner:'affiliate:42',instance:'ca-prospeccao-affiliate-42',leaseToken:'l'};
 const api=runtime('lib/affiliate-prospecting-processor.ts',{
 '../db/affiliate-auth':{getAffiliateProspectorAccess:async()=>({active:false,affiliateId:42})},
 './affiliate-prospecting-whatsapp':{prospectingInstanceFor:()=>job.instance,sendProspectingWhatsappText:async()=>sends++},
 './affiliate-prospecting-audio':{getVoiceAudio:async()=>null},
 './affiliate-prospecting-bridge':{affiliateProspectingFetch:async(path,{body})=>{commands.push(body);return {response:{ok:true},payload:body.action==='lease'?{job}:{ok:true}};}}
 });await api.runProspectingQueue();assert.equal(sends,0);assert.equal(commands.at(-1).status,'cancelled');
});
test('envio de voz usa Ogg/Opus em base64 e apenas instância de Prospecção',async()=>{
 const calls=[];
 const api=runtime('lib/affiliate-prospecting-whatsapp.ts',{}, {Buffer,process:{env:credentials},fetch:async(url,init={})=>{
   calls.push({url,body:init.body});
   if(url.includes('connectionState'))return ok({instance:{state:'open'}});
   if(url.includes('/webhook/set/'))return ok({ok:true});
   if(url.includes('/message/sendWhatsAppAudio/'))return ok({key:{id:'voice-provider-1'}});
   throw Error('unexpected '+url);
 }});
 const bytes=Buffer.concat([Buffer.from('OggS'),Buffer.alloc(200)]);
 const result=await api.sendProspectingWhatsappAudio('5541999999999',bytes,'ca-prospeccao-affiliate-42');
 assert.equal(result.providerMessageId,'voice-provider-1');
 const outbound=calls.find(call=>call.url.includes('/message/sendWhatsAppAudio/'));
 assert.ok(outbound.url.endsWith('/ca-prospeccao-affiliate-42'));
 const payload=JSON.parse(outbound.body);
 assert.equal(payload.audio,bytes.toString('base64'));assert.equal(payload.encoding,true);
 await assert.rejects(api.sendProspectingWhatsappAudio('5541999999999',bytes,'ca-org-42'));
});
test('retentativa do áudio não repete texto; falha da etapa é explícita',async()=>{
 let textSends=0,audioSends=0;const commands=[];
 const job={id:'voice-job',owner:'affiliate:42',instance:'ca-prospeccao-affiliate-42',phoneE164:'5541999999999',message:'Oi',leaseToken:'token',stage:'audio',audioId:'12345678-1234-1234-1234-123456789012',approachMode:'audio_wait',attempts:0};
 const api=runtime('lib/affiliate-prospecting-processor.ts',{
   '../db/affiliate-auth':{getAffiliateProspectorAccess:async()=>({active:true,affiliateId:42})},
   './affiliate-prospecting-audio':{getVoiceAudio:async(owner,id)=>{assert.equal(owner,'affiliate:42');assert.equal(id,job.audioId);return Buffer.from('OggS');}},
   './affiliate-prospecting-whatsapp':{prospectingInstanceFor:()=>job.instance,getProspectingWhatsappState:async()=>({connected:true}),sendProspectingWhatsappText:async()=>textSends++,sendProspectingWhatsappAudio:async()=>{audioSends++;const error=Error('rejected');error.status=422;throw error;}},
   './affiliate-prospecting-bridge':{affiliateProspectingFetch:async(path,{body})=>{commands.push(body);return {response:{ok:true},payload:body.action==='lease'?{job}:body.action==='dispatch'?{allowed:true}:{ok:true}};}}
 });
 await api.runProspectingQueue();assert.equal(audioSends,1);assert.equal(textSends,0);
 assert.equal(commands.at(-1).status,'failed');assert.equal(commands.at(-1).stage,'audio');
});
test('roteiro e bytes privados são separados por afiliado e pelo ADM',async()=>{
 const objects=new Map();
 const bucket={put:async(key,value)=>objects.set(key,Buffer.from(value)),get:async key=>objects.has(key)?{body:new Response(objects.get(key)).body}:null,delete:async key=>objects.delete(key)};
 const audio=runtime('lib/affiliate-prospecting-audio.ts',{
   'server-only':{},'node:crypto':{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},'node:child_process':{spawn:()=>{throw Error('not used');}},
   '../runtime/storage.mjs':{getStorage:()=>({BUCKET:bucket})}
 },{Buffer,URL});
 await audio.saveVoiceScript('affiliate:42','Roteiro do 42');
 assert.equal((await audio.getVoiceProfile('affiliate:42')).script,'Roteiro do 42');
 assert.equal((await audio.getVoiceProfile('affiliate:43')).script,'');
 assert.equal((await audio.getVoiceProfile('admin:42')).script,'');
 const id='12345678-1234-1234-1234-123456789012';
 await bucket.put(`affiliate-prospecting/voice/affiliate/42/${id}.ogg`,Buffer.from('OggS'));
 assert.ok(await audio.getVoiceAudio('affiliate:42',id,'ogg'));
 assert.equal(await audio.getVoiceAudio('affiliate:43',id,'ogg'),null);
 assert.equal(await audio.getVoiceAudio('admin:42',id,'ogg'),null);
});
test('MP4 do iPhone é convertido para Ogg/Opus antes de chegar à Evolution',{skip:spawnSync('ffmpeg',['-version']).status!==0},async()=>{
 const input=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=400:duration=1','-c:a','aac','-movflags','frag_keyframe+empty_moov','-f','mp4','pipe:1'],{maxBuffer:2*1024*1024});
 assert.equal(input.status,0);
 const audio=runtime('lib/affiliate-prospecting-audio.ts',{'server-only':{},'node:crypto':{randomUUID:()=>''},'node:child_process':{spawn},'../runtime/storage.mjs':{getStorage:()=>{throw Error('not needed');}}},{Buffer});
 const ogg=await audio.transcodeVoice(input.stdout);
 assert.equal(ogg.subarray(0,4).toString(),'OggS');
 const info=spawnSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name,sample_rate','-of','default=noprint_wrappers=1','pipe:0'],{input:ogg,encoding:'utf8'});
 assert.match(info.stdout,/codec_name=opus/);assert.match(info.stdout,/sample_rate=48000/);
});
test('URL da abordagem continua derivada no servidor: ADM sem ref e afiliado com ref real',async()=>{
 let admin=true;const calls=[];
 const prefix='../'.repeat(5),id='12345678-1234-4234-8234-123456789012';
 const route=runtime('app/api/affiliate/prospecting/whatsapp/route.ts',{
   [prefix+'db/affiliate-auth']:{getAffiliateSessionAccess:async()=>({active:true,affiliateId:42,isAdmin:admin,name:'Pessoa'})},
   [prefix+'db/affiliate-portal']:{getAffiliateDashboard:async()=>({links:[{active:true,isMain:true,url:'https://cortouanotou.com.br/comece?ref=CODIGO_REAL'}]})},
   [prefix+'lib/affiliate-prospecting-bridge']:{affiliateProspectorIdentity:access=>({prospectorKey:`${access.isAdmin?'admin':'affiliate'}:${access.affiliateId}`}),affiliateProspectingFetch:async(path,options)=>{calls.push(options);return {response:{status:200},payload:{jobs:[]}};}},
   [prefix+'lib/affiliate-prospecting-whatsapp']:{prospectingInstanceFor:()=> 'ca-prospeccao-outbound',getProspectingWhatsappState:async()=>({connected:true})},
   [prefix+'lib/affiliate-prospecting-audio']:{getVoiceProfile:async()=>({audioId:id}),getVoiceAudio:async()=>Buffer.from('OggS'),validVoiceId:()=>true}
 },{Buffer});
 const request=()=>new Request('https://cortouanotou.com.br/api/affiliate/prospecting/whatsapp',{method:'POST',body:JSON.stringify({action:'enqueue',keys:['phone:5541999999999'],template:'Oi {barbearia}',approachMode:'audio_wait',audioId:id})});
 assert.equal((await route.POST(request())).status,200);
 assert.equal(calls[0].body.signupUrl,'https://cortouanotou.com.br/comece');
 assert.equal(calls[0].prospectorKey,'admin:42');
 admin=false;assert.equal((await route.POST(request())).status,200);
 assert.equal(calls[1].body.signupUrl,'https://cortouanotou.com.br/comece?ref=CODIGO_REAL');
 assert.equal(calls[1].prospectorKey,'affiliate:42');
});
test('prévia de áudio autenticada suporta Range do Safari e ignora dono informado pelo cliente',async()=>{
 const id='12345678-1234-4234-8234-123456789012';let ownerSeen='';
 const prefix='../'.repeat(5);
 const api=runtime('app/api/affiliate/prospecting/audio/route.ts',{
  [prefix+'db/affiliate-auth']:{getAffiliateSessionAccess:async()=>({active:true,affiliateId:42,name:'Afiliado'})},
  [prefix+'lib/affiliate-prospecting-bridge']:{affiliateProspectorIdentity:()=>({prospectorKey:'affiliate:42'})},
  [prefix+'lib/affiliate-prospecting-audio']:{getVoiceProfile:async()=>({audioId:id,mimeType:'audio/mp4',durationSeconds:10,script:''}),getVoiceAudio:async(owner)=>{ownerSeen=owner;return Buffer.from('0123456789');}},
  [prefix+'lib/request-origin']:{validAppOrigin}
 },{Buffer,URL});
 const response=await api.GET(new Request(`https://app.test/api/affiliate/prospecting/audio?play=1&owner=affiliate:99`,{headers:{range:'bytes=2-5'}}));
 assert.equal(response.status,206);assert.equal(ownerSeen,'affiliate:42');assert.equal(await response.text(),'2345');
 assert.equal(response.headers.get('content-range'),'bytes 2-5/10');
 assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('status conectado continua verdadeiro quando o webhook está indisponível',async()=>{
 const calls=[];
 const api=runtime('lib/affiliate-prospecting-whatsapp.ts',{}, {process:{env:credentials},console:{warn(){}},fetch:(url)=>{
  calls.push(url);
  if(url.includes('connectionState'))return ok({instance:{state:'open'}});
  if(url.includes('fetchInstances'))return ok([{ownerJid:'5541999999999@s.whatsapp.net',disconnectionReasonCode:401}]);
  if(url.includes('/webhook/set/'))return Promise.resolve(Response.json({error:'offline'},{status:503}));
  throw Error('unexpected '+url);
 }});
 const state=await api.getProspectingWhatsappState('ca-prospeccao-affiliate-42');
 assert.equal(state.connected,true);assert.equal(state.webhookReady,false);
 assert.equal(state.requiresPairing,false);assert.equal(state.canRecover,false);
 assert.ok(calls.some(url=>url.includes('/webhook/set/')));
});
test('401 exige novo vínculo e reconexão nunca apaga ou reinicia outra instância',async()=>{
 const calls=[];
 const api=runtime('lib/affiliate-prospecting-whatsapp.ts',{}, {process:{env:credentials},fetch:(url)=>{
  calls.push(url);
  if(url.includes('connectionState'))return ok({instance:{state:'close'}});
  if(url.includes('fetchInstances'))return ok([{ownerJid:'5541999999999@s.whatsapp.net',disconnectionReasonCode:401}]);
  throw Error('unexpected '+url);
 }});
 const state=await api.getProspectingWhatsappState('ca-prospeccao-affiliate-42');
 assert.equal(state.requiresPairing,true);assert.equal(state.reason,'device_removed');assert.equal(state.canRecover,false);
 await assert.rejects(api.recoverProspectingWhatsappConnection('ca-prospeccao-affiliate-42'),error=>error.status===409);
 assert.ok(!calls.some(url=>/\/connect\/|\/logout\/|\/delete\/|\/restart\//.test(url)));
});
test('interrupção temporária reutiliza sessão sem gerar código nem substituir credenciais',async()=>{
 const calls=[];let reopened=false;
 const api=runtime('lib/affiliate-prospecting-whatsapp.ts',{}, {process:{env:credentials},fetch:(url)=>{
  calls.push(url);
  if(url.includes('connectionState'))return ok({instance:{state:reopened?'open':'close'}});
  if(url.includes('fetchInstances'))return ok([{ownerJid:'5541999999999@s.whatsapp.net',disconnectionReasonCode:428}]);
  if(url.endsWith('/instance/connect/ca-prospeccao-affiliate-42')){reopened=true;return ok({});}
  if(url.includes('/webhook/set/'))return ok({});
  throw Error('unexpected '+url);
 }});
 await assert.rejects(api.beginProspectingWhatsappPairing('41999999999','ca-prospeccao-affiliate-42'),error=>error.status===409);
 const result=await api.recoverProspectingWhatsappConnection('ca-prospeccao-affiliate-42');assert.equal(result.connected,true);
 assert.equal(calls.filter(url=>url.includes('/instance/connect/')).length,1);
 assert.ok(!calls.some(url=>url.includes('?number=')||/\/logout\/|\/delete\/|\/restart\/|\/create/.test(url)));
});
test('cliques simultâneos e repetidos compartilham o mesmo pareamento e registro',async()=>{
 let creates=0,registrations=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 const api=runtime('lib/affiliate-prospecting-whatsapp.ts',{}, {process:{env:credentials},fetch:async(url)=>{
  if(url.includes('connectionState')){await gate;return Response.json({instance:{state:'close'}});}
  if(url.includes('fetchInstances'))return Response.json([]);
  if(url.includes('/instance/create')){creates++;return Response.json({pairingCode:'TEST1234'});}
  throw Error('unexpected '+url);
 }});
 const register=async()=>{registrations++;};
 const first=api.beginProspectingWhatsappPairing('41999999999','ca-prospeccao-affiliate-42',register);
 const second=api.beginProspectingWhatsappPairing('41999999999','ca-prospeccao-affiliate-42',register);
 await assert.rejects(api.beginProspectingWhatsappPairing('41888888888','ca-prospeccao-affiliate-42',register),error=>error.status===409);
 release();assert.equal((await first).pairingCode,(await second).pairingCode);
 assert.equal((await api.beginProspectingWhatsappPairing('41999999999','ca-prospeccao-affiliate-42')).pairingCode,'TEST1234');
 assert.equal(creates,1);assert.equal(registrations,1);
});
test('ponte de prospecção indisponível não falsifica desconexão e recuperação usa o dono autenticado',async()=>{
 const prefix='../'.repeat(5);let recovered;
 const api=runtime('app/api/affiliate/prospecting/whatsapp/route.ts',{
  [prefix+'db/affiliate-auth']:{getAffiliateSessionAccess:async()=>({active:true,affiliateId:42})},
  [prefix+'db/affiliate-portal']:{},
  [prefix+'lib/affiliate-prospecting-bridge']:{affiliateProspectorIdentity:()=>({prospectorKey:'affiliate:42'}),affiliateProspectingFetch:async()=>{throw Error('bridge unavailable');}},
  [prefix+'lib/affiliate-prospecting-audio']:{},
  [prefix+'lib/affiliate-prospecting-whatsapp']:{prospectingInstanceFor:access=>`ca-prospeccao-affiliate-${access.affiliateId}`,getProspectingWhatsappState:async()=>({state:'open',connected:true}),recoverProspectingWhatsappConnection:async instance=>{recovered=instance;return {connected:true};}}
 });
 const response=await api.GET();assert.equal(response.status,200);const body=await response.json();assert.equal(body.connected,true);assert.ok(body.syncWarning);
 assert.equal((await api.POST(new Request('https://app.test/api/affiliate/prospecting/whatsapp',{method:'POST',body:JSON.stringify({action:'recover',instance:'ca-prospeccao-outbound'})}))).status,200);
 assert.equal(recovered,'ca-prospeccao-affiliate-42');
});

 test('ficha e pesquisa remota usam identidade da sessão e limitam os campos',async()=>{
 const calls=[];const prefix='../'.repeat(5);
 const api=runtime('app/api/affiliate/prospecting/claims/route.ts',{
 [prefix+'db/affiliate-auth']:{getAffiliateSessionAccess:async()=>({active:true,affiliateId:42})},
 [prefix+'lib/affiliate-prospecting-bridge']:{affiliateProspectorIdentity:()=>({prospectorKey:'affiliate:42'}),affiliateProspectingFetch:async(path,options)=>{calls.push({path,...options});return {response:{status:200},payload:{items:[]}};}}
 });
 await api.GET(new Request('https://fixture.test/api/claims?crm=1&view=returns&query=Barbearia%20Antiga&offset=50'));
 assert.match(calls[0].path,/crm=1/);assert.match(calls[0].path,/query=Barbearia\+Antiga/);assert.match(calls[0].path,/view=returns/);assert.equal(calls[0].prospectorKey,'affiliate:42');
 await api.POST(new Request('https://fixture.test/api/claims',{method:'POST',body:JSON.stringify({action:'save_contact',key:'phone:5541999990001',prospectorKey:'affiliate:99',notes:'a'.repeat(6000),stage:'not_now',followupAt:null})}));
 assert.equal(calls[1].prospectorKey,'affiliate:42');assert.equal(calls[1].body.notes.length,5000);assert.equal(calls[1].body.prospectorKey,undefined);
 });

test('Instagram usa sessão ativa, protege origem e não expõe ação de envio automático',async()=>{
 const calls=[];const prefix='../'.repeat(5);let active=true;
 const api=runtime('app/api/affiliate/prospecting/instagram/route.ts',{
 [prefix+'db/affiliate-auth']:{getAffiliateSessionAccess:async()=>({active,affiliateId:42})},
 [prefix+'lib/request-origin']:{validAppOrigin},
 [prefix+'lib/affiliate-prospecting-bridge']:{affiliateProspectorIdentity:()=>({prospectorKey:'affiliate:42'}),affiliateProspectingFetch:async(path,options)=>{calls.push({path,...options});return {response:{status:200},payload:{items:[]}};}}
 });
 const request=(body,origin='https://cortouanotou.com.br')=>new Request('https://fixture.test/api/instagram',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 await api.GET(new Request('https://fixture.test/api/instagram?query=Kaio&prospectorKey=affiliate:99'));
 assert.equal(calls[0].prospectorKey,'affiliate:42');assert.match(calls[0].path,/instagram=1/);
 assert.equal((await api.POST(request({action:'save_instagram',username:'@kaio',name:'Teste',prospectorKey:'affiliate:99'}))).status,200);
 assert.equal(calls[1].prospectorKey,'affiliate:42');assert.equal(calls[1].body.prospectorKey,undefined);
 assert.equal((await api.POST(request({action:'send_instagram'}))).status,400);
 assert.equal((await api.POST(request({action:'save_instagram'},'https://evil.test'))).status,403);
 await api.GET(new Request('https://fixture.test/api/instagram?discover=1&city=Colombo%2C%20PR&name=Teste&prospectorKey=affiliate:99'));
 const params=new URL(calls[2].path,'https://fixture.test').searchParams;assert.equal(params.get('city'),'Colombo, PR');assert.equal(params.get('name'),'Teste');assert.equal(params.get('discover'),'1');assert.equal(calls[2].prospectorKey,'affiliate:42');
 assert.equal((await api.POST(request({action:'instagram_enqueue',items:[{username:'teste',name:'Teste',city:'Colombo',prospectorKey:'affiliate:99'}]}))).status,200);
 assert.equal(calls[3].body.items[0].prospectorKey,undefined);assert.equal(calls[3].prospectorKey,'affiliate:42');
 assert.equal((await api.POST(request({action:'instagram_enqueue',items:[]}))).status,400);
 assert.equal((await api.POST(request({action:'instagram_enqueue',items:Array(41).fill({username:'test'})}))).status,400);
 active=false;assert.equal((await api.GET(new Request('https://fixture.test/api/instagram'))).status,401);assert.equal(calls.length,4);
});
