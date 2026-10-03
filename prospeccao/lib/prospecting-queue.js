import { randomUUID } from "node:crypto";
import { ensureClaimsSchema, getPool, normalizeProspectorKey, rowToClaim } from "./affiliate-claims.js";
import { text } from "./funnel-records.js";

function fail(message, status = 409) { const error = new Error(message); error.status = status; throw error; }
export function instanceForOwner(owner) {
  const key = normalizeProspectorKey(owner);
  return key.startsWith("admin:") ? "ca-prospeccao-outbound" : `ca-prospeccao-affiliate-${key.split(":")[1]}`;
}
export async function transaction(fn) {
  await ensureClaimsSchema(); const client = await getPool().connect();
  try { await client.query("BEGIN"); await client.query("SELECT pg_advisory_xact_lock(728421)"); const result = await fn(client); await client.query("COMMIT"); return result; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
function jobView(row) {
  return { id: row.id, batchId: row.batch_id, key: row.lead_key, name: row.name || "Barbearia", phoneE164: row.phone_e164, status: row.status,
    delivery: row.delivery_status || "", attempts: row.attempts, error: row.error, providerMessageId: row.provider_id, updatedAt: row.updated_at };
}
export async function registerConnection(owner, phone) {
  const key = normalizeProspectorKey(owner);
  if (!/^55\d{10,11}$/.test(phone)) fail("Informe DDD e número.", 400);
  return transaction(async db => {
    const same = await db.query(`SELECT prospector_key FROM affiliate_prospecting_connections WHERE phone = $1 AND prospector_key <> $2 AND (expires_at IS NULL OR expires_at > NOW())`, [phone, key]);
    if (same.rowCount) fail("Esse WhatsApp já está vinculado a outro afiliado.");
    await db.query(`DELETE FROM affiliate_prospecting_connections WHERE phone=$1 AND prospector_key<>$2 AND expires_at<NOW()`,[phone,key]);
    await db.query(`INSERT INTO affiliate_prospecting_connections(prospector_key, instance, phone,expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '10 minutes')
      ON CONFLICT(prospector_key) DO UPDATE SET phone = EXCLUDED.phone,expires_at=NOW()+INTERVAL '10 minutes', updated_at = NOW()`, [key, instanceForOwner(key), phone]);
    return { instance: instanceForOwner(key) };
  });
}
export async function enqueue(owner, input) {
  const key = normalizeProspectorKey(owner);
  const keys = [...new Set(Array.isArray(input.keys) ? input.keys : [])];
  if (!keys.length || keys.length > 1000 || keys.some(value => !/^phone:55\d{11}$/.test(value))) fail("Seleção inválida. Prepare as barbearias antes de enviar.", 400);
  const template = text(input.template, 1200); const signupUrl = text(input.signupUrl, 500);
  if (!template || !/^https:\/\/cortouanotou\.com\.br\/comece(?:\?ref=[A-Za-z0-9_-]+)?$/.test(signupUrl)) fail("Mensagem ou link de indicação inválido.", 400);
  const batchId = randomUUID(); const blocked = [];
  const result = await transaction(async db => {
    const jobs = [];
    for (const leadKey of keys.sort()) {
      const claim = (await db.query(`SELECT * FROM affiliate_prospecting_claims WHERE lead_key = $1 FOR UPDATE`, [leadKey])).rows[0];
      if (!claim || claim.prospector_key !== key) { blocked.push({ key: leadKey, reason: "Contato não reservado para você." }); continue; }
      const old = (await db.query(`SELECT * FROM affiliate_prospecting_queue WHERE lead_key = $1`, [leadKey])).rows[0];
      if (old && old.prospector_key === key && ['pending','leased','sending','uncertain','sent'].includes(old.status)) { jobs.push(jobView({ ...old, ...{name: claim.name,phone_e164:claim.phone_e164} })); continue; }
      if (claim.status !== 'reserved' || claim.responded_at || !(new Date(claim.reserved_until).getTime() > Date.now())) { blocked.push({ key: leadKey, reason: "Contato indisponível ou reserva expirada." }); continue; }
      if (old && old.status === 'failed' && old.prospector_key === key) { blocked.push({key:leadKey,reason:"Veja a falha no progresso antes de tentar novamente."}); continue; }
      let message = template.replaceAll("{barbearia}", claim.name).replaceAll("{link}", signupUrl);
      if (!message.includes(signupUrl)) message += `\n${signupUrl}`;
      if (message.length > 1200) { blocked.push({key:leadKey,reason:"Mensagem final muito longa. Reduza o texto."}); continue; }
      const row = (await db.query(`INSERT INTO affiliate_prospecting_queue(id, batch_id, lead_key, prospector_key, instance, message, status)
        VALUES ($1,$2,$3,$4,$5,$6,'pending') ON CONFLICT(lead_key) DO UPDATE SET id=EXCLUDED.id, batch_id=EXCLUDED.batch_id, prospector_key=EXCLUDED.prospector_key,
        instance=EXCLUDED.instance, message=EXCLUDED.message, status='pending', attempts=0, available_at=NOW(), lease_token=NULL, lease_until=NULL, provider_id='', error='', created_at=NOW(), updated_at=NOW() RETURNING *`,
        [randomUUID(),batchId,leadKey,key,instanceForOwner(key),message])).rows[0];
      await db.query(`UPDATE affiliate_prospecting_claims SET reserved_until = 'infinity', updated_at = NOW() WHERE lead_key = $1`, [leadKey]);
      jobs.push(jobView({...row,name:claim.name,phone_e164:claim.phone_e164}));
    }
    return jobs;
  });
  return { batchId, jobs: result, blocked };
}
export async function listQueue(owner) {
  await ensureClaimsSchema();
  const result = await getPool().query(`SELECT q.*, c.name,c.phone_e164 FROM affiliate_prospecting_queue q JOIN affiliate_prospecting_claims c USING(lead_key)
    WHERE q.prospector_key = $1 ORDER BY (q.status IN ('pending','leased','sending','uncertain')) DESC, q.created_at DESC LIMIT 1000`, [normalizeProspectorKey(owner)]);
  return { jobs: result.rows.map(jobView) };
}
export async function resolveQueueJob(owner, input) {
  const key = normalizeProspectorKey(owner);
  if (!['retry','confirm_sent'].includes(input.action)) fail('Ação inválida.',400);
  return transaction(async db => {
    const row = (await db.query(`SELECT q.*,c.prospector_key AS claim_owner,c.status AS claim_status,c.responded_at,c.source_id,c.name,c.phone_e164
      FROM affiliate_prospecting_queue q JOIN affiliate_prospecting_claims c USING(lead_key) WHERE q.id=$1 FOR UPDATE OF q,c`,[input.id])).rows[0];
    if (!row || row.prospector_key !== key || row.claim_owner !== key) fail('Esse envio não pertence a você.',403);
    if (input.action === 'confirm_sent') {
      if (row.status === 'sent') return {job:jobView(row)};
      if (row.status !== 'uncertain') fail('Somente um envio incerto pode ser confirmado. Atualize o progresso.');
      await db.query(`UPDATE affiliate_prospecting_queue SET status='sent',error='Envio confirmado por você no WhatsApp.',lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE id=$1`,[row.id]);
      await db.query(`UPDATE affiliate_prospecting_claims SET status=CASE WHEN status='do_not_contact' THEN status ELSE 'contacted' END,
        reserved_until=NULL,contacted_at=COALESCE(contacted_at,NOW()),last_outbound_message=$2,last_outbound_at=NOW(),updated_at=NOW() WHERE lead_key=$1`,[row.lead_key,row.message]);
      return {job:jobView({...row,status:'sent',error:'Envio confirmado por você no WhatsApp.'})};
    }
    // A repeated tap must not reset a job that is already back in the queue.
    if (['pending','leased','sending'].includes(row.status)) return {job:jobView(row)};
    if (row.status !== 'failed') fail('Envios já enviados ou incertos não podem ser repetidos por esta ação.');
    const blocked = await db.query(`SELECT 1 FROM prospecting_funnel WHERE do_not_contact=TRUE AND (lead_key=$1 OR ($2<>'' AND source_id=$2)) LIMIT 1`,[row.lead_key,row.source_id]);
    const sameBusiness = await db.query(`SELECT 1 FROM affiliate_prospecting_claims WHERE source_id=$1 AND source_id<>'' AND lead_key<>$2 AND (status IN ('contacted','do_not_contact') OR responded_at IS NOT NULL OR reserved_until>NOW()) LIMIT 1`,[row.source_id,row.lead_key]);
    if (row.claim_status !== 'reserved' || row.responded_at || blocked.rowCount || sameBusiness.rowCount) fail('Contato já respondeu, foi contatado ou está bloqueado.');
    await db.query(`UPDATE affiliate_prospecting_queue SET status='pending',attempts=0,error='',provider_id='',delivery_status='',lease_token=NULL,lease_until=NULL,available_at=NOW(),updated_at=NOW() WHERE id=$1`,[row.id]);
    await db.query(`UPDATE affiliate_prospecting_claims SET reserved_until='infinity',updated_at=NOW() WHERE lead_key=$1`,[row.lead_key]);
    return {job:jobView({...row,status:'pending',attempts:0,error:'',provider_id:'',delivery_status:''})};
  });
}

export async function leaseNext() {
  return transaction(async db => {
    // Leased work has not reached Evolution. Sending work may have reached it: never resend blindly.
    await db.query(`UPDATE affiliate_prospecting_queue SET status='pending', lease_token=NULL, lease_until=NULL WHERE status='leased' AND lease_until < NOW()`);
    await db.query(`UPDATE affiliate_prospecting_queue SET status='uncertain', error='Envio interrompido. Confira no WhatsApp antes de repetir.', updated_at=NOW() WHERE status='sending' AND lease_until < NOW()`);
    await db.query(`UPDATE affiliate_prospecting_queue q SET status='cancelled', error='Contato indisponível ou já respondeu.', updated_at=NOW()
      FROM affiliate_prospecting_claims c WHERE q.lead_key=c.lead_key AND q.status='pending' AND (c.status <> 'reserved' OR c.responded_at IS NOT NULL OR c.prospector_key <> q.prospector_key)`);
    const row = (await db.query(`SELECT q.*,c.phone_e164,c.name FROM affiliate_prospecting_queue q JOIN affiliate_prospecting_claims c USING(lead_key)
      LEFT JOIN affiliate_prospecting_send_slots s ON s.instance=q.instance
      WHERE q.status='pending' AND q.available_at <= NOW() AND (s.next_at IS NULL OR s.next_at <= NOW())
      AND NOT EXISTS (SELECT 1 FROM affiliate_prospecting_queue busy WHERE busy.instance=q.instance AND busy.status IN ('leased','sending'))
      ORDER BY q.available_at,q.created_at LIMIT 1 FOR UPDATE OF q SKIP LOCKED`)).rows[0];
    if (!row) return { job: null };
    const leaseToken = randomUUID();
    await db.query(`UPDATE affiliate_prospecting_queue SET status='leased', lease_token=$2, lease_until=NOW()+INTERVAL '90 seconds', updated_at=NOW() WHERE id=$1`,[row.id,leaseToken]);
    return { job: { ...jobView(row), owner: row.prospector_key, instance:row.instance,message:row.message,leaseToken } };
  });
}
export async function authorizeDispatch(input) {
  return transaction(async db => {
    const row=(await db.query(`SELECT q.*, c.status AS claim_status,c.responded_at,c.source_id FROM affiliate_prospecting_queue q JOIN affiliate_prospecting_claims c USING(lead_key) WHERE q.id=$1 FOR UPDATE OF q,c`,[input.id])).rows[0];
    if (!row || row.status !== 'leased' || row.lease_token !== input.leaseToken || !(new Date(row.lease_until).getTime() > Date.now())) return { allowed:false };
    const blocked = await db.query(`SELECT 1 FROM prospecting_funnel WHERE do_not_contact=TRUE AND (lead_key=$1 OR ($2<>'' AND source_id=$2)) LIMIT 1`, [row.lead_key,row.source_id]);
    if (row.claim_status !== 'reserved' || row.responded_at || blocked.rowCount) { await db.query(`UPDATE affiliate_prospecting_queue SET status='cancelled',updated_at=NOW() WHERE id=$1`,[row.id]); return {allowed:false}; }
    await db.query(`UPDATE affiliate_prospecting_queue SET status='sending',attempts=attempts+1,lease_until=NOW()+INTERVAL '90 seconds',updated_at=NOW() WHERE id=$1`,[row.id]);
    await db.query(`INSERT INTO affiliate_prospecting_send_slots(instance,next_at) VALUES ($1,NOW()+INTERVAL '12 seconds') ON CONFLICT(instance) DO UPDATE SET next_at=EXCLUDED.next_at`,[row.instance]);
    return {allowed:true};
  });
}
export async function completeJob(input) {
  return transaction(async db => {
    const row=(await db.query(`SELECT * FROM affiliate_prospecting_queue WHERE id=$1 FOR UPDATE`,[input.id])).rows[0];
    if (!row || row.lease_token !== input.leaseToken) fail("Envio não pertence a este processamento.");
    if (['sent','failed','cancelled'].includes(row.status)) return {ok:true};
    const allowed=['sent','failed','uncertain','pending','cancelled'];
    const status=allowed.includes(input.status)?input.status:'uncertain';
    const providerId=text(input.providerMessageId,240);
    if(status==='sent' && !providerId) fail("Identificação do envio ausente.",400);
    if(status==='pending' && row.status==='sending' && input.retrySafe !== true) fail("Envio incerto não pode ser repetido automaticamente.");
    const delay=Math.min(900,Math.max(15,Number(input.retryAfter)||60));
    const error=text(input.error,500);
    await db.query(`UPDATE affiliate_prospecting_queue SET status=$2,provider_id=$3,error=$4,available_at=NOW()+($5*INTERVAL '1 second'),lease_until=NULL,updated_at=NOW() WHERE id=$1`,[row.id,status,providerId,error,delay]);
    // At least 12s after completion, including rejected attempts; serial across replicas.
    await db.query(`INSERT INTO affiliate_prospecting_send_slots(instance,next_at) VALUES ($1,NOW()+INTERVAL '12 seconds') ON CONFLICT(instance) DO UPDATE SET next_at=GREATEST(affiliate_prospecting_send_slots.next_at,EXCLUDED.next_at)`,[row.instance]);
    if(status==='sent') await db.query(`UPDATE affiliate_prospecting_claims SET status=CASE WHEN status='do_not_contact' THEN status ELSE 'contacted' END, reserved_until=NULL,
      contacted_at=COALESCE(contacted_at,NOW()),last_outbound_message=$2,last_outbound_provider_id=$3,last_outbound_at=NOW(),updated_at=NOW() WHERE lead_key=$1`,[row.lead_key,row.message,providerId]);
    if(status==='failed'||status==='cancelled') await db.query(`UPDATE affiliate_prospecting_claims SET reserved_until=NOW()+INTERVAL '60 minutes',updated_at=NOW() WHERE lead_key=$1 AND status='reserved'`,[row.lead_key]);
    return {ok:true};
  });
}
export async function markDoNotContact(owner, key) {
  return transaction(async db => {
    const row=(await db.query(`SELECT * FROM affiliate_prospecting_claims WHERE lead_key=$1 FOR UPDATE`,[text(key,220)])).rows[0];
    if (!row || row.prospector_key !== normalizeProspectorKey(owner)) fail("Contato não pertence a você.",403);
    const updated=(await db.query(`UPDATE affiliate_prospecting_claims SET status='do_not_contact',reserved_until=NULL,updated_at=NOW() WHERE lead_key=$1 RETURNING *`,[row.lead_key])).rows[0];
    await db.query(`UPDATE affiliate_prospecting_queue SET status='cancelled',error='Marcado para não contatar.',updated_at=NOW() WHERE lead_key=$1 AND status IN ('pending','leased')`,[row.lead_key]);
    return {item:rowToClaim(updated)};
  });
}
export async function recordOutboundReceipt(input) {
  return transaction(async db=>{
    const rows=await db.query(`SELECT * FROM affiliate_prospecting_queue WHERE instance=$1 AND lead_key=$2 AND status IN ('sending','uncertain','sent')`,[text(input.instance,120),`phone:${input.phoneE164}`]);
    const row=rows.rows[0];
    if (!row || !input.providerMessageId || row.message.trim() !== String(input.message||'').trim()) return {matched:false};
    if(row.status==='sent') return {matched:row.provider_id===input.providerMessageId};
    await db.query(`UPDATE affiliate_prospecting_queue SET provider_id=$2,status='sent',error='',lease_until=NULL,updated_at=NOW() WHERE id=$1`,[row.id,text(input.providerMessageId,240)]);
    await db.query(`UPDATE affiliate_prospecting_claims SET status=CASE WHEN status='do_not_contact' THEN status ELSE 'contacted' END,reserved_until=NULL,contacted_at=COALESCE(contacted_at,NOW()),last_outbound_message=$2,last_outbound_provider_id=$3,last_outbound_at=NOW(),updated_at=NOW() WHERE lead_key=$1`,[row.lead_key,row.message,text(input.providerMessageId,240)]);
    return {matched:true};
  });
}

export async function recordDelivery(input) {
  await ensureClaimsSchema();
  if (!['delivered','read'].includes(input.delivery)) return {matched:false};
  const result = await getPool().query(`UPDATE affiliate_prospecting_queue SET delivery_status = CASE WHEN delivery_status='read' THEN 'read' ELSE $3 END,updated_at=NOW() WHERE instance=$1 AND provider_id=$2 RETURNING id`,[text(input.instance,120),text(input.providerMessageId,240),input.delivery]);
  return {matched:Boolean(result.rowCount)};
}

export async function confirmConnection(owner) {
  await ensureClaimsSchema();
  await getPool().query(`UPDATE affiliate_prospecting_connections SET expires_at=NULL,updated_at=NOW() WHERE prospector_key=$1`,[normalizeProspectorKey(owner)]);
  return {ok:true};
}
