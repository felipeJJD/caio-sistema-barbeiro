import {randomUUID} from 'node:crypto';
import {getPool,normalizeProspectorKey} from './affiliate-claims.js';
import {ensureInstagramSchema,instagramUsername} from './instagram-contacts.js';
import {instagramKey,instagramOperation,sealSession,openSession} from './instagram-session.js';
let schema;
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
export async function ensureInstagramSendingSchema(){
 if(schema)return schema;
 schema=transaction(async client=>{await client.query("SELECT pg_advisory_xact_lock(hashtext('ca:instagram-schema'))");await ensureInstagramSchema();await client.query(`
 CREATE TABLE IF NOT EXISTS affiliate_instagram_connections (
 prospector_key TEXT PRIMARY KEY, username TEXT NOT NULL DEFAULT '', account_id TEXT UNIQUE,
 session_encrypted TEXT, revision UUID NOT NULL, status TEXT NOT NULL DEFAULT 'disconnected',
 last_error TEXT NOT NULL DEFAULT '', attempted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 ALTER TABLE affiliate_instagram_connections ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
 CREATE TABLE IF NOT EXISTS affiliate_instagram_batches (
 id UUID PRIMARY KEY, prospector_key TEXT NOT NULL, connection_revision UUID NOT NULL,
 sender_username TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', reason TEXT NOT NULL DEFAULT '',
 next_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE UNIQUE INDEX IF NOT EXISTS affiliate_instagram_one_active_batch ON affiliate_instagram_batches(prospector_key) WHERE status IN ('running','paused');
 CREATE TABLE IF NOT EXISTS affiliate_instagram_deliveries (
 id UUID PRIMARY KEY, batch_id UUID NOT NULL REFERENCES affiliate_instagram_batches(id),
 prospector_key TEXT NOT NULL, username TEXT NOT NULL, name TEXT NOT NULL, message TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', provider_message_id TEXT, error TEXT NOT NULL DEFAULT '',
 started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ, position INTEGER NOT NULL, UNIQUE(batch_id,username));
 CREATE INDEX IF NOT EXISTS affiliate_instagram_delivery_owner ON affiliate_instagram_deliveries(prospector_key,username);
 CREATE TABLE IF NOT EXISTS affiliate_instagram_worker (id INTEGER PRIMARY KEY, heartbeat_at TIMESTAMPTZ NOT NULL);
 `);}).catch(error=>{schema=undefined;throw error;});return schema;
}
async function transaction(work){const client=await getPool().connect();try{await client.query('BEGIN');const value=await work(client);await client.query('COMMIT');return value;}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
const lock=(client,owner)=>client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`instagram:${owner}`]);
async function available(){instagramKey();const {rows}=await getPool().query("SELECT 1 FROM affiliate_instagram_worker WHERE id=1 AND heartbeat_at>NOW()-INTERVAL '100 seconds'");if(!rows.length)fail('O serviço de envio está iniciando. Tente novamente em instantes.',503);}
export function deliveryMessage(template,link,name){
 const base=template.replaceAll('{barbearia}',name).replaceAll('{link}',link);
 const value=base.includes(link)?base:`${base.trim()}\n${link}`;
 if(value.length>2000)fail('A mensagem com o link deve ter até 2.000 caracteres.');return value;
}
export async function instagramSendingStatus(input){
 const owner=normalizeProspectorKey(input.prospectorKey);await ensureInstagramSendingSchema();
 const connection=(await getPool().query('SELECT username,status,last_error,cooldown_until FROM affiliate_instagram_connections WHERE prospector_key=$1',[owner])).rows[0];
 const batch=(await getPool().query('SELECT id,status,reason,sender_username FROM affiliate_instagram_batches WHERE prospector_key=$1 ORDER BY created_at DESC LIMIT 1',[owner])).rows[0];
 const items=batch?(await getPool().query('SELECT username,name,status,error,provider_message_id FROM affiliate_instagram_deliveries WHERE prospector_key=$1 AND batch_id=$2 ORDER BY position',[owner,batch.id])).rows.map(row=>({username:row.username,name:row.name,status:row.status,error:row.error,confirmed:Boolean(row.provider_message_id)})):[];
 let enabled=false;try{await available();enabled=true;}catch{}
 return {enabled,connection:connection?{username:connection.username,status:connection.status,error:connection.last_error,retryAt:connection.cooldown_until?new Date(connection.cooldown_until).toISOString():null}:{username:'',status:'disconnected',error:'',retryAt:null},batch:batch?{id:batch.id,status:batch.status,reason:batch.reason,sender:batch.sender_username,items}:null};
}
export async function connectInstagram(input,operate=instagramOperation){
 const owner=normalizeProspectorKey(input.prospectorKey),username=instagramUsername(input.username),password=String(input.password||''),code=String(input.code||'').trim();
 if(!password||password.length>200||code.length>12)fail('Informe sua senha do Instagram e confira o código.');
 await ensureInstagramSendingSchema();await available();
 const attempt=randomUUID();
 const old=await transaction(async client=>{await lock(client,owner);
  const current=(await client.query('SELECT * FROM affiliate_instagram_connections WHERE prospector_key=$1 FOR UPDATE',[owner])).rows[0];
  if(current?.status==='connected')fail('Desconecte a conta atual antes de conectar outra.',409);
  if(current?.cooldown_until&&new Date(current.cooldown_until).getTime()>Date.now())throw Object.assign(Error('Aguarde o horário indicado antes de uma nova tentativa de conexão.'),{status:429,code:'rate_limited',retryAt:new Date(current.cooldown_until).toISOString()});
  if(current?.attempted_at&&Date.now()-new Date(current.attempted_at).getTime()<15000)fail('Aguarde alguns segundos antes de tentar conectar novamente.',429);
  const busy=(await client.query("SELECT 1 FROM affiliate_instagram_deliveries WHERE prospector_key=$1 AND status='sending' LIMIT 1",[owner])).rowCount;
  if(busy)fail('Aguarde a conclusão do envio em andamento.',409);
  if((await client.query("SELECT 1 FROM affiliate_instagram_connections WHERE username=$1 AND prospector_key<>$2 AND status='connected'",[username,owner])).rowCount)fail('Este Instagram já está conectado a outro afiliado.',409);
  await client.query(`INSERT INTO affiliate_instagram_connections(prospector_key,revision,attempted_at) VALUES($1,$2,NOW()) ON CONFLICT(prospector_key) DO UPDATE SET revision=EXCLUDED.revision,attempted_at=NOW()`,[owner,attempt]);return current;
 });
 const result=await operate({action:'connect',username,password,code,...(old?.username===username&&old?.session_encrypted?{session:openSession(owner,old.session_encrypted)}:{})});
 if(!result.ok){
  const reference=`IG-${randomUUID().slice(0,8).toUpperCase()}`;
  const retryAt=result.code==='rate_limited'?new Date(Date.now()+Math.max(300,Math.min(86400,Number(result.retryAfterSeconds)||300))*1000).toISOString():null;
  const message=String(result.error||'Não foi possível confirmar a conexão.').slice(0,500);
  await getPool().query('UPDATE affiliate_instagram_connections SET username=$3,session_encrypted=$4,last_error=$5,cooldown_until=$6 WHERE prospector_key=$1 AND revision=$2',[owner,attempt,username,result.session?sealSession(owner,result.session):old?.username===username?old.session_encrypted:null,`${message} Referência: ${reference}.`,retryAt]);
  // Diagnostics contain only a category, exception class, HTTP status and random reference.
  console.warn('[Instagram] conexão recusada',JSON.stringify({reference,code:String(result.code||'unknown').slice(0,40),errorType:String(result.errorType||'').replace(/[^a-zA-Z0-9_]/g,'').slice(0,80),httpStatus:Number(result.httpStatus)||null}));
  throw Object.assign(Error(message),{status:result.code==='two_factor'?428:result.code==='rate_limited'?429:422,code:result.code||'unknown',reference,retryAt});
 }
 if(!result.session||!result.accountId||instagramUsername(result.username)!==username)fail('O Instagram não confirmou a conta solicitada.',422);
 try{await transaction(async client=>{await lock(client,owner);
  const current=(await client.query('SELECT revision FROM affiliate_instagram_connections WHERE prospector_key=$1 FOR UPDATE',[owner])).rows[0];
  if(current?.revision!==attempt)fail('Esta tentativa de conexão foi cancelada. Conecte novamente.',409);
  await client.query("UPDATE affiliate_instagram_batches SET status='stopped',reason='A conta foi reconectada. Inicie um novo envio após conferir a fila.' WHERE prospector_key=$1 AND status IN ('running','paused')",[owner]);
  await client.query("UPDATE affiliate_instagram_connections SET username=$2,account_id=$3,session_encrypted=$4,revision=$5,status='connected',last_error='',cooldown_until=NULL,updated_at=NOW() WHERE prospector_key=$1",[owner,username,String(result.accountId),sealSession(owner,result.session),randomUUID()]);
 });}catch(error){if(error.code==='23505')fail('Este Instagram já está conectado a outro afiliado.',409);throw error;}
 return instagramSendingStatus({prospectorKey:owner});
}
export async function disconnectInstagram(input){
 const owner=normalizeProspectorKey(input.prospectorKey);await ensureInstagramSendingSchema();
 await transaction(async client=>{await lock(client,owner);
  await client.query("UPDATE affiliate_instagram_connections SET status='disconnected',session_encrypted=NULL,account_id=NULL,last_error='',revision=$2,updated_at=NOW() WHERE prospector_key=$1",[owner,randomUUID()]);
  await client.query("UPDATE affiliate_instagram_batches SET status='stopped',reason='Conta desconectada. Um envio já iniciado pode terminar.' WHERE prospector_key=$1 AND status IN ('running','paused')",[owner]);
 });return instagramSendingStatus({prospectorKey:owner});
}
export async function startInstagramBatch(input){
 const owner=normalizeProspectorKey(input.prospectorKey),template=String(input.template||'').trim(),link=String(input.link||'');
 if(!template||template.length>1800)fail('Escreva uma mensagem de até 1.800 caracteres.');
 let url;try{url=new URL(link);}catch{fail('Escolha um link de indicação válido.');}
 if(url.protocol!=='https:'||url.hostname!=='cortouanotou.com.br'||url.pathname!=='/comece'||url.username||url.password||link.length>500)fail('Escolha um link de indicação válido.');
 if(!Array.isArray(input.usernames)||!input.usernames.length||input.usernames.length>40)fail('Selecione de 1 a 40 barbearias da fila.');
 const usernames=[...new Set(input.usernames.map(instagramUsername))];await ensureInstagramSendingSchema();await available();
 await transaction(async client=>{await lock(client,owner);
  const connection=(await client.query('SELECT * FROM affiliate_instagram_connections WHERE prospector_key=$1 FOR UPDATE',[owner])).rows[0];
  if(connection?.status!=='connected'||!connection.session_encrypted)fail('Conecte seu Instagram antes de enviar.',409);
  if((await client.query("SELECT 1 FROM affiliate_instagram_batches WHERE prospector_key=$1 AND status IN ('running','paused')",[owner])).rowCount)fail('Já existe um envio em andamento. Continue ou encerre esse envio primeiro.',409);
  const contacts=(await client.query("SELECT username,name FROM affiliate_instagram_contacts WHERE prospector_key=$1 AND username=ANY($2::text[]) AND status='ready' AND queued_at IS NOT NULL ORDER BY queued_at,username FOR UPDATE",[owner,usernames])).rows;
  if(contacts.length!==usernames.length)fail('A fila mudou. Atualize e selecione apenas perfis disponíveis.',409);
  if(usernames.includes(connection.username))fail('Retire sua própria conta da seleção.');
  if((await client.query("SELECT 1 FROM affiliate_instagram_deliveries WHERE prospector_key=$1 AND username=ANY($2::text[]) AND status IN ('sending','uncertain') LIMIT 1",[owner,usernames])).rowCount)fail('Há um envio sem confirmação nesta seleção. Confira a conversa e registre o envio ou retire esse perfil antes de continuar.',409);
  const messages=contacts.map(contact=>deliveryMessage(template,link,contact.name)),id=randomUUID();
  await client.query('INSERT INTO affiliate_instagram_batches(id,prospector_key,connection_revision,sender_username) VALUES($1,$2,$3,$4)',[id,owner,connection.revision,connection.username]);
  for(let index=0;index<contacts.length;index++)await client.query('INSERT INTO affiliate_instagram_deliveries(id,batch_id,prospector_key,username,name,message,position) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),id,owner,contacts[index].username,contacts[index].name,messages[index],index]);
 });return instagramSendingStatus({prospectorKey:owner});
}
export async function controlInstagramBatch(input){
 const owner=normalizeProspectorKey(input.prospectorKey);await ensureInstagramSendingSchema();
 if(!['pause','resume','stop'].includes(input.action)||!/^[-a-f0-9]{36}$/.test(String(input.batchId||'')))fail('Ação de envio inválida.');
 await transaction(async client=>{await lock(client,owner);
  const batch=(await client.query('SELECT * FROM affiliate_instagram_batches WHERE id=$1 AND prospector_key=$2 FOR UPDATE',[input.batchId,owner])).rows[0];
  if(!batch||!['running','paused'].includes(batch.status))fail('Este envio já foi encerrado.',409);
  if(input.action==='resume'){
   await available();const connection=(await client.query('SELECT status,revision FROM affiliate_instagram_connections WHERE prospector_key=$1',[owner])).rows[0];
   if(connection?.status!=='connected'||connection.revision!==batch.connection_revision)fail('Conecte a conta novamente e inicie um novo envio.',409);
   if((await client.query("SELECT 1 FROM affiliate_instagram_deliveries WHERE batch_id=$1 AND status='uncertain'",[batch.id])).rowCount)fail('Confira os envios sem confirmação antes de encerrar este lote e iniciar outro.',409);
  }
  await client.query('UPDATE affiliate_instagram_batches SET status=$2,reason=$3 WHERE id=$1',[batch.id,input.action==='pause'?'paused':input.action==='stop'?'stopped':'running',input.action==='resume'?'':input.action==='pause'?'Pausado por você. Um envio já iniciado pode terminar.':'Encerrado por você.']);
 });return instagramSendingStatus({prospectorKey:owner});
}
// Called by the sole worker after taking a session advisory lock. Do not retry abandoned sends.
export async function recoverInstagramSending(){
 await getPool().query(`WITH abandoned AS (UPDATE affiliate_instagram_deliveries SET status='uncertain',error='O serviço reiniciou durante o envio. Confira a conversa no Instagram.',finished_at=NOW() WHERE status='sending' RETURNING batch_id)
 UPDATE affiliate_instagram_batches SET status='paused',reason='Confira o envio sem confirmação antes de continuar.' WHERE id IN (SELECT batch_id FROM abandoned) AND status='running'`);
}
export async function processInstagramDelivery(operate=instagramOperation){
 const task=await transaction(async client=>{
  const batch=(await client.query("SELECT b.*,c.account_id,c.session_encrypted,c.revision,c.status AS connection_status FROM affiliate_instagram_batches b JOIN affiliate_instagram_connections c USING(prospector_key) WHERE b.status='running' AND b.next_at<=NOW() AND NOT EXISTS(SELECT 1 FROM affiliate_instagram_deliveries d WHERE d.batch_id=b.id AND d.status='sending') ORDER BY b.next_at,b.created_at LIMIT 1 FOR UPDATE OF b,c SKIP LOCKED")).rows[0];
  if(!batch)return null;
  if(batch.connection_status!=='connected'||batch.revision!==batch.connection_revision){await client.query("UPDATE affiliate_instagram_batches SET status='paused',reason='Conecte seu Instagram novamente.' WHERE id=$1",[batch.id]);return null;}
  const delivery=(await client.query("SELECT * FROM affiliate_instagram_deliveries WHERE batch_id=$1 AND status='pending' ORDER BY position LIMIT 1 FOR UPDATE",[batch.id])).rows[0];
  if(!delivery){await client.query("UPDATE affiliate_instagram_batches SET status='completed' WHERE id=$1",[batch.id]);return null;}
  const contact=(await client.query('SELECT status,queued_at FROM affiliate_instagram_contacts WHERE prospector_key=$1 AND username=$2 FOR UPDATE',[batch.prospector_key,delivery.username])).rows[0];
  if(contact?.status!=='ready'||!contact.queued_at){await client.query("UPDATE affiliate_instagram_deliveries SET status='skipped',error='Perfil retirado, contatado ou bloqueado.',finished_at=NOW() WHERE id=$1",[delivery.id]);return null;}
  await client.query("UPDATE affiliate_instagram_deliveries SET status='sending',started_at=NOW() WHERE id=$1",[delivery.id]);return {batch,delivery};
 });if(!task)return false;
 const {batch,delivery}=task;let result;
 try{result=await operate({action:'send',session:openSession(batch.prospector_key,batch.session_encrypted),accountId:batch.account_id,recipient:delivery.username,message:delivery.message});}catch{result={ok:false,uncertain:true,code:'unknown',error:'Não foi possível confirmar o envio. Confira a conversa no Instagram.'};}
 if(result.ok&&(!result.messageId||!result.session))result={ok:false,uncertain:true,code:'unknown',error:'O Instagram não confirmou o envio.'};
 await transaction(async client=>{
  if(result.ok){
   await client.query("UPDATE affiliate_instagram_deliveries SET status='sent',provider_message_id=$2,finished_at=NOW() WHERE id=$1 AND status='sending'",[delivery.id,String(result.messageId)]);
   await client.query("UPDATE affiliate_instagram_contacts SET status=CASE WHEN status='blocked' THEN status ELSE 'contacted' END,queued_at=NULL,contacted_at=COALESCE(contacted_at,NOW()),updated_at=NOW() WHERE prospector_key=$1 AND username=$2",[batch.prospector_key,delivery.username]);
   await client.query('UPDATE affiliate_instagram_connections SET session_encrypted=$3,updated_at=NOW() WHERE prospector_key=$1 AND revision=$2 AND status=\'connected\'',[batch.prospector_key,batch.revision,sealSession(batch.prospector_key,result.session)]);
  }else{
   await client.query("UPDATE affiliate_instagram_deliveries SET status=$2,error=$3,finished_at=NOW() WHERE id=$1 AND status='sending'",[delivery.id,result.uncertain?'uncertain':'failed',String(result.error||'Envio não confirmado.').slice(0,500)]);
   if(result.code!=='recipient'){
    await client.query("UPDATE affiliate_instagram_batches SET status='paused',reason=$2 WHERE id=$1 AND status='running'",[batch.id,String(result.error||'Confira sua conta antes de continuar.').slice(0,500)]);
    if(['login','restricted','rate_limited','access_denied'].includes(result.code))await client.query('UPDATE affiliate_instagram_connections SET status=$3,last_error=$4,cooldown_until=$5 WHERE prospector_key=$1 AND revision=$2',[batch.prospector_key,batch.revision,result.code==='login'?'reauth':'restricted',result.error,result.code==='rate_limited'?new Date(Date.now()+Math.max(300,Math.min(86400,Number(result.retryAfterSeconds)||300))*1000).toISOString():null]);
   }
  }
  await client.query("UPDATE affiliate_instagram_batches SET next_at=NOW()+INTERVAL '30 seconds',status=CASE WHEN status='running' AND NOT EXISTS(SELECT 1 FROM affiliate_instagram_deliveries WHERE batch_id=$1 AND status='pending') THEN 'completed' ELSE status END WHERE id=$1",[batch.id]);
 });return true;
}
