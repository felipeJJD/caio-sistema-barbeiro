import {getPool} from '../lib/affiliate-claims.js';
import {instagramKey} from '../lib/instagram-session.js';
import {ensureInstagramSendingSchema,recoverInstagramSending,processInstagramDelivery} from '../lib/instagram-sending.js';
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{instagramKey();}catch{console.log('[Instagram] conexão não configurada; worker inativo.');process.exit(0);}
let lease;
try{
 await ensureInstagramSendingSchema();
 while(!stopping){
  lease=await getPool().connect();
  const acquired=(await lease.query("SELECT pg_try_advisory_lock(hashtext('ca:instagram-worker')) AS acquired")).rows[0].acquired;
  if(!acquired){lease.release();lease=null;await delay(3000);continue;}
  lease.on('error',()=>{stopping=true;});
  await recoverInstagramSending();console.log('[Instagram] worker de envios individuais iniciado.');
  while(!stopping){
   await lease.query('INSERT INTO affiliate_instagram_worker(id,heartbeat_at) VALUES(1,NOW()) ON CONFLICT(id) DO UPDATE SET heartbeat_at=NOW()');
   await processInstagramDelivery();await delay(3000);
  }
 }
}catch{console.error('[Instagram] worker interrompido; os envios sem confirmação serão revisados.');process.exitCode=1;}
finally{if(lease){await lease.query("SELECT pg_advisory_unlock(hashtext('ca:instagram-worker'))").catch(()=>{});lease.release();}await getPool().end();}
