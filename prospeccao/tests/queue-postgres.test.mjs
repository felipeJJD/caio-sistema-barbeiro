import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureClaimsSchema,getPool,reserveClaimLeads,markClaimContacted,recordClaimInbound,listClaims } from '../lib/affiliate-claims.js';
import { enqueue,leaseNext,authorizeDispatch,completeJob,markDoNotContact,registerConnection,recordOutboundReceipt,resolveQueueJob } from '../lib/prospecting-queue.js';
const url=process.env.PROSPECCAO_TEST_DATABASE_URL;
test('fila real em PostgreSQL: concorrência, recuperação, isolamento e deduplicação', {skip:!url}, async t=>{
 if(new URL(url).pathname!=='/prospecting_test')throw Error('Integration tests require the dedicated prospecting_test database.');
 process.env.PROSPECCAO_DATABASE_URL=url;
 await ensureClaimsSchema();const db=getPool();
 const owner=id=>({prospectorKey:`affiliate:${id}`,prospectorName:`Afiliado ${id}`});
 const lead=id=>({id:`test-source-${id}`,name:`Teste ${id}`,phoneE164:`55419990${String(id).padStart(5,'0')}`,city:'Colombo'});
 const queued=(id,key)=>enqueue(`affiliate:${id}`,{keys:[key],template:'Oi {barbearia} {link}',signupUrl:`https://cortouanotou.com.br/comece?ref=afiliado${id}`});
 await t.test('dois afiliados disputam o mesmo contato: apenas um reserva',async()=>{
  const results=await Promise.all([reserveClaimLeads([lead(1)],owner(41)),reserveClaimLeads([lead(1)],owner(42))]);
  assert.equal(results.reduce((sum,r)=>sum+r.reserved.length,0),1);
  assert.equal(results.reduce((sum,r)=>sum+r.blocked.length,0),1);
 });
 await t.test('confirmação manual de outro afiliado não muda o dono nem expõe o contato',async()=>{
  const reserved=(await reserveClaimLeads([lead(2)],owner(42))).reserved[0];
  await markClaimContacted(reserved.key,owner(42));
  await assert.rejects(markClaimContacted(reserved.key,owner(43)),error=>error.status===403);
  assert.equal((await listClaims({...owner(43)})).items.length,0);
  assert.equal((await listClaims({...owner(42)})).items[0].prospectorKey,'affiliate:42');
 });
 await t.test('duplo clique produz uma única mensagem, e dois workers só recebem uma concessão',async()=>{
  const key=(await reserveClaimLeads([lead(3)],owner(43))).reserved[0].key;
  const results=await Promise.all([queued(43,key),queued(43,key)]);
  assert.equal(results[0].jobs[0].id,results[1].jobs[0].id);
  const leased=await Promise.all([leaseNext(),leaseNext()]);assert.equal(leased.filter(r=>r.job).length,1);
  const job=leased.find(r=>r.job).job;
  assert.equal((await authorizeDispatch(job)).allowed,true);
  await completeJob({...job,status:'sent',providerMessageId:'test-msg-3'});
  await completeJob({...job,status:'sent',providerMessageId:'test-msg-3'});
  assert.equal((await db.query(`SELECT COUNT(*) AS count FROM affiliate_prospecting_queue WHERE lead_key=$1`,[key])).rows[0].count,'1');
  assert.equal((await db.query(`SELECT status FROM affiliate_prospecting_claims WHERE lead_key=$1`,[key])).rows[0].status,'contacted');
 });
 await t.test('mensagem enviada e histórico são persistidos na mesma transação',async()=>{
  const key=(await reserveClaimLeads([lead(4)],owner(44))).reserved[0].key;await queued(44,key);
  const {job}=await leaseNext();assert.equal(job.owner,'affiliate:44');
  await authorizeDispatch(job);
  await completeJob({...job,status:'sent',providerMessageId:'accepted-4'});
  const claim=(await db.query(`SELECT * FROM affiliate_prospecting_claims WHERE lead_key=$1`,[key])).rows[0];
  assert.equal(claim.last_outbound_provider_id,'accepted-4');assert.equal(claim.prospector_key,'affiliate:44');
 });
 await t.test('queda antes de enviar recupera; queda depois de despachar exige conferência',async()=>{
  const key=(await reserveClaimLeads([lead(5)],owner(45))).reserved[0].key;await queued(45,key);
  const first=(await leaseNext()).job;
  await db.query(`UPDATE affiliate_prospecting_queue SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1`,[first.id]);
  const recovered=(await leaseNext()).job;assert.equal(recovered.id,first.id);assert.notEqual(recovered.leaseToken,first.leaseToken);
  assert.equal((await authorizeDispatch(first)).allowed,false);
  await authorizeDispatch(recovered);
  await db.query(`UPDATE affiliate_prospecting_queue SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1`,[recovered.id]);
  await leaseNext();
  assert.equal((await db.query(`SELECT status FROM affiliate_prospecting_queue WHERE id=$1`,[first.id])).rows[0].status,'uncertain');
  assert.equal((await queued(45,key)).jobs[0].id,first.id);
  const receipt=await recordOutboundReceipt({instance:recovered.instance,phoneE164:lead(5).phoneE164,message:recovered.message,providerMessageId:'webhook-5'});
  assert.equal(receipt.matched,true);
  assert.equal((await db.query(`SELECT status FROM affiliate_prospecting_queue WHERE id=$1`,[first.id])).rows[0].status,'sent');
 });
 await t.test('A B A são duas respostas, e resposta do WhatsApp de outro afiliado é ignorada',async()=>{
  const key=(await reserveClaimLeads([lead(6)],owner(46))).reserved[0].key;
  const inbound={instance:'ca-prospeccao-affiliate-46',phoneE164:lead(6).phoneE164,message:'oi'};
  assert.equal((await recordClaimInbound({...inbound,instance:'ca-prospeccao-affiliate-47',providerMessageId:'wrong'})).matched,false);
  await recordClaimInbound({...inbound,providerMessageId:'a'});await recordClaimInbound({...inbound,providerMessageId:'b'});
  assert.equal((await recordClaimInbound({...inbound,providerMessageId:'a'})).duplicate,true);
  assert.equal((await db.query(`SELECT reply_count FROM affiliate_prospecting_claims WHERE lead_key=$1`,[key])).rows[0].reply_count,2);
 });
 await t.test('responder ou não ter interesse impede despacho pendente',async()=>{
  const key=(await reserveClaimLeads([lead(7)],owner(47))).reserved[0].key;const item=(await queued(47,key)).jobs[0];
  const {job}=await leaseNext();assert.equal(job.id,item.id);
  await recordClaimInbound({instance:'ca-prospeccao-affiliate-47',phoneE164:lead(7).phoneE164,message:'não tenho interesse',providerMessageId:'optout-7'});
  assert.equal((await authorizeDispatch(job)).allowed,false);
  assert.equal((await db.query(`SELECT status FROM affiliate_prospecting_claims WHERE lead_key=$1`,[key])).rows[0].status,'do_not_contact');
  assert.equal((await reserveClaimLeads([lead(7)],owner(48))).reserved.length,0);
 });
 await t.test('mesma empresa em dois telefones e recusa antiga são bloqueadas',async()=>{
  const a=lead(8);const b={...lead(9),id:a.id};
  const r=await reserveClaimLeads([a,b],owner(48));assert.equal(r.reserved.length,1);assert.equal(r.blocked.length,1);
  await markDoNotContact('affiliate:48',r.reserved[0].key);
  const old=lead(10);
  await db.query(`INSERT INTO prospecting_funnel(workspace_id,lead_key,source_id,name,phone_e164,status,do_not_contact) VALUES ('owner-preview',$1,$2,'Teste antigo',$3,'sem_interesse',TRUE)`,[`phone:${old.phoneE164}`,old.id,old.phoneE164]);
  assert.equal((await reserveClaimLeads([old],owner(49))).reserved.length,0);
 });
 await t.test('conexão do mesmo telefone não pode ser apropriada por outro afiliado',async()=>{
  await registerConnection('affiliate:50','5541999999950');
  await assert.rejects(registerConnection('affiliate:51','5541999999950'),/outro afiliado/);
 });
 await t.test('retentativa manual é isolada e dois cliques não criam dois envios',async()=>{
  const key=(await reserveClaimLeads([lead(21)],owner(61))).reserved[0].key;
  const item=(await queued(61,key)).jobs[0];
  await db.query(`UPDATE affiliate_prospecting_queue SET status='failed' WHERE id=$1`,[item.id]);
  await assert.rejects(resolveQueueJob('affiliate:62',{action:'retry',id:item.id}),error=>error.status===403);
  const results=await Promise.all([resolveQueueJob('affiliate:61',{action:'retry',id:item.id}),resolveQueueJob('affiliate:61',{action:'retry',id:item.id})]);
  assert.equal(results[0].job.id,results[1].job.id);
  assert.ok(results.every(result=>result.job.status==='pending'));
  assert.equal((await db.query(`SELECT COUNT(*) AS count FROM affiliate_prospecting_queue WHERE lead_key=$1`,[key])).rows[0].count,'1');
  await markDoNotContact('affiliate:61',key);
 });
 await t.test('envio incerto exige confirmação e nunca entra na retentativa de falhas',async()=>{
  const key=(await reserveClaimLeads([lead(22)],owner(62))).reserved[0].key;
  const item=(await queued(62,key)).jobs[0];
  await db.query(`UPDATE affiliate_prospecting_queue SET status='uncertain' WHERE id=$1`,[item.id]);
  await assert.rejects(resolveQueueJob('affiliate:62',{action:'retry',id:item.id}),/incertos/);
  await assert.rejects(resolveQueueJob('affiliate:63',{action:'confirm_sent',id:item.id}),error=>error.status===403);
  assert.equal((await resolveQueueJob('affiliate:62',{action:'confirm_sent',id:item.id})).job.status,'sent');
  assert.equal((await resolveQueueJob('affiliate:62',{action:'confirm_sent',id:item.id})).job.status,'sent');
  assert.equal((await db.query(`SELECT status FROM affiliate_prospecting_claims WHERE lead_key=$1`,[key])).rows[0].status,'contacted');
  await assert.rejects(resolveQueueJob('affiliate:62',{action:'retry',id:item.id}),/enviados/);
 });
 await t.test('recusa no funil antigo depois de enfileirar também impede despacho e retentativa',async()=>{
  const itemLead=lead(23),key=(await reserveClaimLeads([itemLead],owner(63))).reserved[0].key;
  const item=(await queued(63,key)).jobs[0];const {job}=await leaseNext();assert.equal(job.id,item.id);
  await db.query(`INSERT INTO prospecting_funnel(workspace_id,lead_key,source_id,name,phone_e164,status,do_not_contact) VALUES ('owner-preview',$1,$2,'Recusa recente',$3,'sem_interesse',TRUE)`,[key,itemLead.id,itemLead.phoneE164]);
  assert.equal((await authorizeDispatch(job)).allowed,false);
  await db.query(`UPDATE affiliate_prospecting_queue SET status='failed' WHERE id=$1`,[item.id]);
  await assert.rejects(resolveQueueJob('affiliate:63',{action:'retry',id:item.id}),/bloqueado/);
 });
 await t.test('resposta e perda da reserva impedem reenvio de uma falha antiga',async()=>{
  const itemLead=lead(24),key=(await reserveClaimLeads([itemLead],owner(64))).reserved[0].key;
  const item=(await queued(64,key)).jobs[0];await db.query(`UPDATE affiliate_prospecting_queue SET status='failed' WHERE id=$1`,[item.id]);
  await recordClaimInbound({instance:'ca-prospeccao-affiliate-64',phoneE164:itemLead.phoneE164,message:'oi',providerMessageId:'reply-before-retry'});
  await assert.rejects(resolveQueueJob('affiliate:64',{action:'retry',id:item.id}),/respondeu/);
  const otherKey=(await reserveClaimLeads([lead(25)],owner(65))).reserved[0].key;
  const other=(await queued(65,otherKey)).jobs[0];await db.query(`UPDATE affiliate_prospecting_queue SET status='failed' WHERE id=$1`,[other.id]);
  await db.query(`UPDATE affiliate_prospecting_claims SET reserved_until=NOW()-INTERVAL '1 second' WHERE lead_key=$1`,[otherKey]);
  await reserveClaimLeads([lead(25)],owner(66));
  await assert.rejects(resolveQueueJob('affiliate:65',{action:'retry',id:other.id}),error=>error.status===403);
  const replacement=await queued(66,otherKey);assert.equal(replacement.jobs.length,1);assert.notEqual(replacement.jobs[0].id,other.id);
  await markDoNotContact('affiliate:66',otherKey);
 });
 await t.test('intervalo é persistido mesmo em falha, concessão de outra instância segue livre',async()=>{
  const a=(await reserveClaimLeads([lead(11),lead(12)],owner(51))).reserved;
  await enqueue('affiliate:51',{keys:a.map(c=>c.key),template:'teste {link}',signupUrl:'https://cortouanotou.com.br/comece?ref=test51'});
  const {job}=await leaseNext();await authorizeDispatch(job);await completeJob({...job,status:'failed',error:'rejeitado'});
  const next=await leaseNext();assert.equal(next.job,null);
  const due=(await db.query(`SELECT next_at>NOW() AS blocked FROM affiliate_prospecting_send_slots WHERE instance=$1`,[job.instance])).rows[0];assert.equal(due.blocked,true);
  const fresh=(await reserveClaimLeads([lead(13)],owner(52))).reserved[0];await queued(52,fresh.key);
  assert.equal((await leaseNext()).job.owner,'affiliate:52');
 });
 await db.end();
});
