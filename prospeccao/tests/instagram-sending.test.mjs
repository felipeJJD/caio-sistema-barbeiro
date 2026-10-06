import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {sealSession,openSession} from '../lib/instagram-session.js';
import {ensureInstagramSendingSchema,connectInstagram,disconnectInstagram,startInstagramBatch,controlInstagramBatch,instagramSendingStatus,processInstagramDelivery,recoverInstagramSending,deliveryMessage} from '../lib/instagram-sending.js';
import {getPool} from '../lib/affiliate-claims.js';
import {enqueueInstagramContacts,updateInstagramContact} from '../lib/instagram-contacts.js';
process.env.PROSPECCAO_INSTAGRAM_SESSION_KEY=randomBytes(32).toString('hex');
test('sessão do Instagram autenticada, criptografada e vinculada ao proprietário',()=>{
 const secret={authorization_data:{sessionid:'fixture-session'}},encoded=sealSession('affiliate:945',secret);
 assert.ok(!encoded.includes('fixture-session'));assert.deepEqual(openSession('affiliate:945',encoded),secret);
 assert.throws(()=>openSession('affiliate:946',encoded));const bytes=Buffer.from(encoded,'base64');bytes[30]^=1;assert.throws(()=>openSession('affiliate:945',bytes.toString('base64')));
 assert.equal(deliveryMessage('Oi {barbearia} {link}','https://cortouanotou.com.br/comece?ref=test','Teste'),'Oi Teste https://cortouanotou.com.br/comece?ref=test');
 assert.match(deliveryMessage('Oi {barbearia}','https://cortouanotou.com.br/comece','Teste'),/\nhttps:/);
});
test('adaptador do Instagram envia para um único destinatário e não repete operação incerta',()=>{
 assert.equal(execFileSync('python3',['scripts/test-instagram-account.py'],{encoding:'utf8'}).trim(),'Instagram adapter OK');
});
const url=process.env.PROSPECCAO_TEST_DATABASE_URL;
test('Instagram PostgreSQL: contas isoladas, envio confirmado, pausa, bloqueio e falha sem repetição',{skip:!url},async()=>{
 if(new URL(url).pathname!=='/prospecting_test')throw Error('Dedicated test database required');
 process.env.PROSPECCAO_DATABASE_URL=url;await ensureInstagramSendingSchema();const db=getPool(),owner='affiliate:945',other='affiliate:946';let calls=0;
 const login=async data=>{assert.equal(data.action,'connect');assert.equal(data.password,'fixture-password');return {ok:true,username:'fixture.sender',accountId:'fixture-945',session:{authorization_data:{sessionid:'fixture-session'}}};};
 try{
  await db.query('INSERT INTO affiliate_instagram_worker(id,heartbeat_at) VALUES(1,NOW()) ON CONFLICT(id) DO UPDATE SET heartbeat_at=NOW()');
  const connect={prospectorKey:owner,username:'https://www.instagram.com/fixture.sender/',password:'fixture-password'};
  await assert.rejects(connectInstagram(connect,async()=>({ok:false,code:'access_denied',errorType:'ClientForbiddenError',httpStatus:403,error:'Tentativa recusada.',session:{uuid:'same-device'}})),error=>error.code==='access_denied'&&/^IG-/.test(error.reference)&&error.status===422);
  let status=await instagramSendingStatus({prospectorKey:owner});assert.equal(status.connection.status,'disconnected');assert.match(status.connection.error,/Referência: IG-/);assert.equal(status.batch,null);
  await db.query("UPDATE affiliate_instagram_connections SET attempted_at=NOW()-INTERVAL '30 seconds' WHERE prospector_key=$1",[owner]);
  status=await connectInstagram(connect,async input=>{assert.deepEqual(input.session,{uuid:'same-device'});return login(input);});
  assert.equal(status.connection.status,'connected');assert.ok(!JSON.stringify(status).includes('fixture-session'));
  assert.equal((await instagramSendingStatus({prospectorKey:other})).connection.status,'disconnected');
  await assert.rejects(connectInstagram({prospectorKey:other,username:'fixture.sender',password:'fixture-password'},login),/outro afiliado/);
  const contacts=['fixture.one','fixture.two','fixture.zthree'].map(username=>({username,name:username,city:'Colombo'}));
  await enqueueInstagramContacts({prospectorKey:owner,items:contacts});
  const start={prospectorKey:owner,usernames:contacts.map(item=>item.username),template:'Oi {barbearia} {link}',link:'https://cortouanotou.com.br/comece?ref=fixture'};
  await assert.rejects(startInstagramBatch({...start,prospectorKey:other}),/Conecte/);
  await assert.rejects(startInstagramBatch({...start,usernames:['not.owned']}),/fila mudou/);
  status=await startInstagramBatch(start);const id=status.batch.id;
  await assert.rejects(startInstagramBatch(start),/andamento/);
  assert.equal((await instagramSendingStatus({prospectorKey:other})).batch,null);
  await assert.rejects(controlInstagramBatch({prospectorKey:other,batchId:id,action:'pause'}),/encerrado/);
  await controlInstagramBatch({prospectorKey:owner,batchId:id,action:'pause'});
  assert.equal(await processInstagramDelivery(async()=>{calls++;}),false);assert.equal(calls,0);
  await controlInstagramBatch({prospectorKey:owner,batchId:id,action:'resume'});
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const sending=processInstagramDelivery(async data=>{calls++;assert.equal(data.recipient,'fixture.one');assert.equal(data.accountId,'fixture-945');assert.match(data.message,/ref=fixture/);await gate;return {ok:true,messageId:'fixture-message-1',session:data.session};});
  for(let index=0;index<30;index++){const row=(await db.query("SELECT 1 FROM affiliate_instagram_deliveries WHERE batch_id=$1 AND status='sending'",[id])).rowCount;if(row)break;await new Promise(resolve=>setTimeout(resolve,10));}
  assert.equal(await processInstagramDelivery(async()=>{throw Error('duplicate send');}),false);
  release();await sending;assert.equal(calls,1);
  status=await instagramSendingStatus({prospectorKey:owner});assert.equal(status.batch.items[0].status,'sent');assert.equal(status.batch.items[0].confirmed,true);
  assert.equal((await db.query('SELECT status FROM affiliate_instagram_contacts WHERE prospector_key=$1 AND username=$2',[owner,'fixture.one'])).rows[0].status,'contacted');
  await updateInstagramContact({prospectorKey:owner,username:'fixture.two',action:'instagram_block'});
  await db.query('UPDATE affiliate_instagram_batches SET next_at=NOW() WHERE id=$1',[id]);
  await processInstagramDelivery(async()=>{throw Error('blocked recipient must not send');});
  await processInstagramDelivery(async()=>{calls++;return {ok:false,code:'unknown',uncertain:true,error:'Confira a conversa'};});
  assert.equal(calls,2);status=await instagramSendingStatus({prospectorKey:owner});assert.equal(status.batch.status,'paused');assert.equal(status.batch.items[1].status,'skipped');assert.equal(status.batch.items[2].status,'uncertain');assert.equal(status.batch.items[2].confirmed,false);
  assert.equal((await db.query('SELECT status FROM affiliate_instagram_contacts WHERE prospector_key=$1 AND username=$2',[owner,'fixture.zthree'])).rows[0].status,'ready');
  await assert.rejects(controlInstagramBatch({prospectorKey:owner,batchId:id,action:'resume'}),/sem confirmação/);
  await controlInstagramBatch({prospectorKey:owner,batchId:id,action:'stop'});
  await assert.rejects(startInstagramBatch({...start,usernames:['fixture.zthree']}),/sem confirmação/);
  await db.query("UPDATE affiliate_instagram_deliveries SET status='sending' WHERE batch_id=$1 AND username='fixture.zthree'",[id]);await recoverInstagramSending();
  assert.equal((await instagramSendingStatus({prospectorKey:owner})).batch.items[2].status,'uncertain');
  await disconnectInstagram({prospectorKey:owner});
  assert.equal((await db.query('SELECT session_encrypted,account_id FROM affiliate_instagram_connections WHERE prospector_key=$1',[owner])).rows[0].session_encrypted,null);
  await db.query("UPDATE affiliate_instagram_connections SET attempted_at=NOW()-INTERVAL '30 seconds' WHERE prospector_key=$1",[owner]);
  await assert.rejects(connectInstagram(connect,async()=>({ok:false,code:'rate_limited',errorType:'ClientThrottledError',httpStatus:429,error:'Aguarde.',retryAfterSeconds:300,session:{uuid:'same-device'}})),error=>error.code==='rate_limited'&&Boolean(error.retryAt));
  await assert.rejects(connectInstagram(connect,async()=>{throw Error('provider must not be retried during cooldown');}),error=>error.status===429&&error.code==='rate_limited');
  assert.ok(new Date((await instagramSendingStatus({prospectorKey:owner})).connection.retryAt).getTime()>Date.now());
 }finally{
  await db.query('DELETE FROM affiliate_instagram_deliveries WHERE prospector_key=ANY($1::text[])',[[owner,other]]);
  await db.query('DELETE FROM affiliate_instagram_batches WHERE prospector_key=ANY($1::text[])',[[owner,other]]);
  await db.query('DELETE FROM affiliate_instagram_connections WHERE prospector_key=ANY($1::text[])',[[owner,other]]);
  await db.query('DELETE FROM affiliate_instagram_contacts WHERE prospector_key=ANY($1::text[])',[[owner,other]]);await db.end();
 }
});
