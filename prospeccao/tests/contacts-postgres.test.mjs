import test from 'node:test';
import assert from 'node:assert/strict';
import {getPool,reserveClaimLeads,markClaimContacted} from '../lib/affiliate-claims.js';
import {ensureContactSchema,getContact,listContacts,saveContact} from '../lib/affiliate-contacts.js';
import {markDoNotContact} from '../lib/prospecting-queue.js';
const url=process.env.PROSPECCAO_TEST_DATABASE_URL;
test('CRM PostgreSQL: persistência, busca completa, retornos, histórico e isolamento',{skip:!url},async t=>{
 if(new URL(url).pathname!=='/prospecting_test')throw Error('CRM tests require the dedicated prospecting_test database.');
 process.env.PROSPECCAO_DATABASE_URL=url;await ensureContactSchema();const db=getPool();
 const owner={prospectorKey:'affiliate:920',prospectorName:'CRM Teste'};
 const keys=[];
 try {
  for(let i=0;i<55;i++) {
   const phone=`55419992${String(i).padStart(5,'0')}`;
   const key=(await reserveClaimLeads([{id:`crm-test-${i}`,name:i===54?'Antiga Escondida':'CRM '+i,phoneE164:phone,city:'Colombo'}],owner)).reserved[0].key;
   keys.push(key);await markClaimContacted(key,owner);
  }
  const key=keys[54];const values={...owner,key,contactName:'Responsável',notes:'Quer demonstração',nextStep:'Apresentar agenda',stage:'not_now',followupAt:'2026-01-01T10:00:00Z'};
  await t.test('pesquisa encontra contato além da primeira página sem misturar afiliados',async()=>{
   assert.equal((await listContacts({...owner,view:'contacted'})).hasMore,true);
   assert.equal((await listContacts({...owner,query:'Escondida'})).items[0].key,key);
   assert.equal((await listContacts({prospectorKey:'affiliate:921',query:'Escondida'})).items.length,0);
   assert.equal((await listContacts({...owner,query:"' OR 1=1 --"})).items.length,0);
   await assert.rejects(getContact({prospectorKey:'affiliate:921',key}),e=>e.status===404);
   await assert.rejects(saveContact({...values,prospectorKey:'affiliate:921'}),e=>e.status===404);
  });
  await t.test('ficha fica salva e Agora não permite um retorno posterior',async()=>{
   await saveContact(values);const card=await getContact({...owner,key});
   assert.equal(card.item.notes,values.notes);assert.equal(card.item.status,'contacted');assert.equal(card.item.stage,'not_now');
   assert.equal((await listContacts({...owner,view:'returns'})).items[0].key,key);
   assert.equal((await listContacts({...owner,query:'Responsável'})).items[0].key,key);
   await saveContact({...values,followupAt:null,completeReturn:true});
   assert.equal((await listContacts({...owner,view:'returns'})).items.length,0);
   assert.ok((await getContact({...owner,key})).timeline.some(event=>event.message.includes('Retorno concluído')));
  });
  await t.test('mensagens futuras ficam no histórico e repetição do estado não duplica',async()=>{
   for(let i=0;i<2;i++)await db.query(`UPDATE affiliate_prospecting_claims SET last_inbound_at=$3,last_inbound_message=$4 WHERE prospector_key=$1 AND lead_key=$2`,[owner.prospectorKey,key,`2026-01-0${i+1}T12:00:00Z`,`Resposta ${i}`]);
   await db.query(`UPDATE affiliate_prospecting_claims SET last_inbound_message=last_inbound_message WHERE lead_key=$1`,[key]);
   const timeline=(await getContact({...owner,key})).timeline.filter(event=>event.kind==='inbound');assert.equal(timeline.length,2);
  });
  await t.test('bloqueio definitivo retira retorno e impede novo agendamento',async()=>{
   await saveContact(values);await markDoNotContact(owner.prospectorKey,key);
   assert.equal((await listContacts({...owner,view:'returns'})).items.length,0);
   await assert.rejects(saveContact(values),e=>e.status===409);
  });
 } finally {
  await db.query('DELETE FROM affiliate_contact_events WHERE prospector_key=$1',[owner.prospectorKey]);
  await db.query('DELETE FROM affiliate_contact_profiles WHERE prospector_key=$1',[owner.prospectorKey]);
  await db.query('DELETE FROM affiliate_prospecting_claims WHERE lead_key=ANY($1::text[])',[keys]);await db.end();
 }
});
