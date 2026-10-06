import {ensureClaimsSchema,getPool,normalizeProspectorKey} from './affiliate-claims.js';
let ready;
function fail(message,status=400){const error=new Error(message);error.status=status;throw error;}
export function instagramUsername(value){
 let raw=String(value||'').trim();
 if(/^https?:\/\//i.test(raw)){
  let url;try{url=new URL(raw);}catch{fail('Perfil do Instagram inválido.');}
  if(!['instagram.com','www.instagram.com'].includes(url.hostname.toLowerCase())||url.username||url.password)fail('Use um link de perfil do Instagram.');
  raw=url.pathname.replace(/^\/|\/$/g,'');
 }
 raw=raw.replace(/^@/,'').toLowerCase();
 if(!/^[a-z0-9_](?:[a-z0-9_.]{0,28}[a-z0-9_])?$/.test(raw)||raw.includes('..')||['p','reel','reels','stories','explore','direct','accounts'].includes(raw))fail('Informe o @ ou o link do perfil, sem link de publicação.');
 return raw;
}
export async function ensureInstagramSchema(){
 if(ready)return ready;
 ready=(async()=>{await ensureClaimsSchema();await getPool().query(`CREATE TABLE IF NOT EXISTS affiliate_instagram_contacts (
  prospector_key TEXT NOT NULL, username TEXT NOT NULL, name TEXT NOT NULL, city TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','contacted','blocked')),
  contacted_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(prospector_key,username));
  ALTER TABLE affiliate_instagram_contacts ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
  CREATE INDEX IF NOT EXISTS affiliate_instagram_contacts_owner_idx ON affiliate_instagram_contacts(prospector_key,updated_at DESC);`);
 })().catch(error=>{ready=undefined;throw error;});return ready;
}
const item=row=>({username:row.username,name:row.name,city:row.city,status:row.status,queued:Boolean(row.queued_at),contactedAt:row.contacted_at?new Date(row.contacted_at).toISOString():null});
export async function listInstagramContacts(input){
 await ensureInstagramSchema();const owner=normalizeProspectorKey(input.prospectorKey),query=String(input.query||'').slice(0,120);
 const offset=Math.max(0,Math.min(100000,Math.trunc(Number(input.offset)||0)));
 const result=await getPool().query(`SELECT * FROM affiliate_instagram_contacts WHERE prospector_key=$1
 AND ($4<>'queue' OR (status='ready' AND queued_at IS NOT NULL))
 AND ($4<>'history' OR status<>'ready')
 AND ($2='' OR POSITION(LOWER($2) IN LOWER(CONCAT_WS(' ',name,username,city)))>0)
 ORDER BY CASE WHEN $4='queue' THEN queued_at END ASC,updated_at DESC,username LIMIT 51 OFFSET $3`,[owner,query,offset,input.view||'all']);
 return {items:result.rows.slice(0,50).map(item),hasMore:result.rows.length>50,nextOffset:offset+50};
}
export async function updateInstagramContact(input){
 const owner=normalizeProspectorKey(input.prospectorKey),username=instagramUsername(input.username);
 await ensureInstagramSchema();let result;
 if(input.action==='save_instagram'){
  const name=String(input.name||'').trim().slice(0,120);if(!name)fail('Informe o nome da barbearia.');
  result=await getPool().query(`INSERT INTO affiliate_instagram_contacts(prospector_key,username,name,city) VALUES($1,$2,$3,$4)
  ON CONFLICT(prospector_key,username) DO UPDATE SET name=EXCLUDED.name,city=EXCLUDED.city,updated_at=NOW() RETURNING *`,[owner,username,name,String(input.city||'').trim().slice(0,180)]);
 }else if(input.action==='instagram_contacted'){
  result=await getPool().query(`UPDATE affiliate_instagram_contacts SET status='contacted',queued_at=NULL,contacted_at=COALESCE(contacted_at,NOW()),updated_at=NOW()
  WHERE prospector_key=$1 AND username=$2 AND status<>'blocked' RETURNING *`,[owner,username]);
 }else if(input.action==='instagram_block'){
  result=await getPool().query(`UPDATE affiliate_instagram_contacts SET status='blocked',queued_at=NULL,updated_at=NOW() WHERE prospector_key=$1 AND username=$2 RETURNING *`,[owner,username]);
 }else if(input.action==='instagram_unqueue'){
  result=await getPool().query(`UPDATE affiliate_instagram_contacts SET queued_at=NULL,updated_at=NOW() WHERE prospector_key=$1 AND username=$2 RETURNING *`,[owner,username]);
 }else fail('Ação inválida.');
 if(!result.rowCount)fail('Contato não encontrado ou bloqueado.',409);
 return {item:item(result.rows[0])};
}

export async function enqueueInstagramContacts(input){
 const owner=normalizeProspectorKey(input.prospectorKey);
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>40)fail('Selecione de 1 a 40 perfis.');
 const entries=[...new Map(input.items.map(entry=>{
  if(!entry||typeof entry!=='object')fail('Perfil inválido.');
  const username=instagramUsername(entry.username),name=String(entry.name||'').trim().slice(0,120);
  if(!name)fail('Informe o nome da barbearia.');
  return [username,{username,name,city:String(entry.city||'').trim().slice(0,180)}];
 })).values()];
 await ensureInstagramSchema();
 const result=await getPool().query(`INSERT INTO affiliate_instagram_contacts(prospector_key,username,name,city,queued_at)
 SELECT $1,username,name,city,NOW() FROM UNNEST($2::text[],$3::text[],$4::text[]) AS entries(username,name,city)
 ON CONFLICT(prospector_key,username) DO UPDATE SET queued_at=COALESCE(affiliate_instagram_contacts.queued_at,EXCLUDED.queued_at),updated_at=NOW()
 WHERE affiliate_instagram_contacts.status='ready' RETURNING *`,[owner,entries.map(x=>x.username),entries.map(x=>x.name),entries.map(x=>x.city)]);
 return {items:result.rows.map(item),queued:result.rowCount,skipped:entries.length-result.rowCount};
}
