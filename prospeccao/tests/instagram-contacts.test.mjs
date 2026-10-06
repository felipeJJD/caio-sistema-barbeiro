import test from 'node:test';import assert from 'node:assert/strict';
import {instagramUsername,ensureInstagramSchema,updateInstagramContact,listInstagramContacts,enqueueInstagramContacts} from '../lib/instagram-contacts.js';
import {getPool} from '../lib/affiliate-claims.js';
test('Instagram aceita perfil canônico e recusa publicação, domínio falso e código',()=>{
 for(const input of ['@Kaio.Barbearia','https://www.instagram.com/Kaio.Barbearia/?igsh=test'])assert.equal(instagramUsername(input),'kaio.barbearia');
 for(const input of ['https://instagram.com.evil.test/kaio','https://evil.test/kaio','https://instagram.com/p/abc','https://instagram.com/direct','user/other','javascript:alert(1)','foo..bar','a'.repeat(31)])assert.throws(()=>instagramUsername(input));
});
const url=process.env.PROSPECCAO_TEST_DATABASE_URL;
test('Instagram PostgreSQL: contatos por afiliado, confirmação manual e bloqueio',{skip:!url},async()=>{
 if(new URL(url).pathname!=='/prospecting_test')throw Error('Dedicated test database required');
 process.env.PROSPECCAO_DATABASE_URL=url;await ensureInstagramSchema();const db=getPool();const owner='affiliate:930';
 try{
  const data={prospectorKey:owner,action:'save_instagram',username:'@barbearia.teste',name:'Teste',city:'Colombo'};
  let saved=await updateInstagramContact(data);assert.equal(saved.item.status,'ready');assert.equal(saved.item.contactedAt,null);
  assert.equal((await listInstagramContacts({prospectorKey:'affiliate:931'})).items.length,0);
  await assert.rejects(updateInstagramContact({...data,prospectorKey:'affiliate:931',action:'instagram_contacted'}));
  let queued=await enqueueInstagramContacts({prospectorKey:owner,items:[{username:data.username,name:data.name,city:data.city}]});assert.equal(queued.queued,1);assert.equal(queued.items[0].queued,true);
  assert.equal((await listInstagramContacts({prospectorKey:owner,view:'queue'})).items.length,1);
  assert.equal((await listInstagramContacts({prospectorKey:'affiliate:931',view:'queue'})).items.length,0);
  await assert.rejects(enqueueInstagramContacts({prospectorKey:owner,items:[{username:'other',name:'Other'},null]}));
  assert.equal((await listInstagramContacts({prospectorKey:owner})).items.length,1,'malformed batch cannot partially save');
  saved=await updateInstagramContact({...data,action:'instagram_contacted'});assert.equal(saved.item.queued,false);
  assert.equal((await listInstagramContacts({prospectorKey:owner,view:'queue'})).items.length,0);
  assert.equal((await listInstagramContacts({prospectorKey:owner,view:'history'})).items.length,1);assert.equal(saved.item.status,'contacted');const first=saved.item.contactedAt;
  assert.equal((await updateInstagramContact({...data,action:'instagram_contacted'})).item.contactedAt,first);
  await updateInstagramContact({...data,action:'instagram_block'});
  assert.equal((await updateInstagramContact(data)).item.status,'blocked','editing or re-saving cannot undo block');
  await assert.rejects(updateInstagramContact({...data,action:'instagram_contacted'}));
  queued=await enqueueInstagramContacts({prospectorKey:owner,items:[{username:data.username,name:'Renamed'}]});assert.equal(queued.queued,0);assert.equal(queued.skipped,1);
  assert.equal((await listInstagramContacts({prospectorKey:owner,view:'queue'})).items.length,0,'blocked cannot return to queue');
  assert.equal((await listInstagramContacts({prospectorKey:owner,query:'Colombo'})).items.length,1);
 }finally{await db.query('DELETE FROM affiliate_instagram_contacts WHERE prospector_key=$1',[owner]);await db.end();}
});
