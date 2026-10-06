import { ensureClaimsSchema, getPool, normalizeProspectorKey, rowToClaim } from './affiliate-claims.js';
import { ensureQualificationSchema } from './affiliate-qualification.js';

let ready;
export async function ensureContactSchema() {
  if (ready) return ready;
  ready = (async () => {
    await ensureClaimsSchema(); await ensureQualificationSchema();
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS affiliate_contact_profiles (
        prospector_key TEXT NOT NULL, lead_key TEXT NOT NULL, contact_name TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', next_step TEXT NOT NULL DEFAULT '', stage TEXT NOT NULL DEFAULT '',
        followup_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(prospector_key,lead_key));
      CREATE INDEX IF NOT EXISTS affiliate_contact_returns_idx ON affiliate_contact_profiles(prospector_key,followup_at) WHERE followup_at IS NOT NULL;
      CREATE TABLE IF NOT EXISTS affiliate_contact_events (
        id BIGSERIAL PRIMARY KEY, prospector_key TEXT NOT NULL, lead_key TEXT NOT NULL,
        kind TEXT NOT NULL, message TEXT NOT NULL, provider_id TEXT NOT NULL DEFAULT '', occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      ALTER TABLE affiliate_contact_events ADD COLUMN IF NOT EXISTS provider_id TEXT NOT NULL DEFAULT '';
      CREATE UNIQUE INDEX IF NOT EXISTS affiliate_contact_event_provider_idx ON affiliate_contact_events(prospector_key,kind,provider_id) WHERE provider_id <> '';
      CREATE INDEX IF NOT EXISTS affiliate_contact_events_idx ON affiliate_contact_events(prospector_key,lead_key,occurred_at DESC);
      CREATE OR REPLACE FUNCTION ca_capture_contact_message() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (NEW.last_outbound_at IS DISTINCT FROM OLD.last_outbound_at OR NEW.last_outbound_provider_id IS DISTINCT FROM OLD.last_outbound_provider_id) AND NEW.last_outbound_at IS NOT NULL THEN
          INSERT INTO affiliate_contact_events(prospector_key,lead_key,kind,message,occurred_at,provider_id)
          VALUES(NEW.prospector_key,NEW.lead_key,'outbound',NEW.last_outbound_message,NEW.last_outbound_at,NEW.last_outbound_provider_id) ON CONFLICT DO NOTHING;
        END IF;
        IF (NEW.last_inbound_at IS DISTINCT FROM OLD.last_inbound_at OR NEW.last_inbound_provider_id IS DISTINCT FROM OLD.last_inbound_provider_id) AND NEW.last_inbound_at IS NOT NULL THEN
          INSERT INTO affiliate_contact_events(prospector_key,lead_key,kind,message,occurred_at,provider_id)
          VALUES(NEW.prospector_key,NEW.lead_key,'inbound',NEW.last_inbound_message,NEW.last_inbound_at,NEW.last_inbound_provider_id) ON CONFLICT DO NOTHING;
        END IF;
        IF NEW.status='do_not_contact' AND OLD.status <> 'do_not_contact' THEN
          INSERT INTO affiliate_contact_events(prospector_key,lead_key,kind,message)
          VALUES(NEW.prospector_key,NEW.lead_key,'note','Contato bloqueado para novas abordagens.');
        END IF;
        RETURN NEW;
      END $$;
      CREATE OR REPLACE TRIGGER ca_contact_message_history AFTER UPDATE ON affiliate_prospecting_claims
        FOR EACH ROW EXECUTE FUNCTION ca_capture_contact_message();
    `);
  })().catch(error => { ready = undefined; throw error; });
  return ready;
}
const select = `SELECT c.*, p.contact_name,p.notes,p.next_step,p.stage,p.followup_at
 FROM affiliate_prospecting_claims c LEFT JOIN affiliate_contact_profiles p
 ON p.lead_key=c.lead_key AND p.prospector_key=c.prospector_key`;
function item(row) {
  return { ...rowToClaim(row), qualification: row.qualification || '', contactName: row.contact_name || '',
    notes: row.notes || '', nextStep: row.next_step || '', stage: row.stage || '',
    followupAt: row.followup_at ? new Date(row.followup_at).toISOString() : null };
}
function fail(message,status) { const error = new Error(message); error.status=status; throw error; }
function keyOf(value) { const key=String(value || ''); if(!/^phone:55\d{11}$/.test(key)) fail('Barbearia inválida.',400); return key; }
export async function listContacts(input) {
  await ensureContactSchema(); const owner=normalizeProspectorKey(input.prospectorKey);
  const view=['contacted','responded','interested','returns'].includes(input.view) ? input.view : 'contacted';
  const offset=Math.max(0,Math.min(100000,Math.trunc(Number(input.offset)||0)));
  const query=String(input.query || '').trim().slice(0,120);
  const conditions={contacted:"c.status IN ('contacted','do_not_contact')",responded:'c.responded_at IS NOT NULL',
    interested:"c.qualification='interested' AND c.status <> 'do_not_contact'",
    returns:"p.followup_at IS NOT NULL AND c.status <> 'do_not_contact'"};
  const result=await getPool().query(`${select} WHERE c.prospector_key=$1 AND ${conditions[view]}
    AND ($2='' OR POSITION(LOWER($2) IN LOWER(CONCAT_WS(' ',c.name,c.phone,c.phone_e164,c.city,p.contact_name)))>0)
    ORDER BY ${view==='returns' ? 'p.followup_at ASC,' : ''} COALESCE(c.last_inbound_at,c.contacted_at,c.updated_at) DESC,c.lead_key
    LIMIT 51 OFFSET $3`,[owner,query,offset]);
  return {view,items:result.rows.slice(0,50).map(item),hasMore:result.rows.length>50,nextOffset:offset+50};
}
export async function getContact(input) {
  await ensureContactSchema(); const owner=normalizeProspectorKey(input.prospectorKey),key=keyOf(input.key);
  const result=await getPool().query(`${select} WHERE c.prospector_key=$1 AND c.lead_key=$2`,[owner,key]);
  if(!result.rowCount) fail('Barbearia não encontrada.',404);
  const contact=item(result.rows[0]);
  const events=await getPool().query(`SELECT id,kind,message,occurred_at,provider_id FROM affiliate_contact_events WHERE prospector_key=$1 AND lead_key=$2 ORDER BY occurred_at DESC,id DESC LIMIT 100`,[owner,key]);
  const timeline=events.rows.map(row=>({id:String(row.id),providerId:row.provider_id,kind:row.kind,message:row.message,at:new Date(row.occurred_at).toISOString()}));
  for(const direction of ['Outbound','Inbound']) {
    const at=contact[`last${direction}At`],kind=direction.toLowerCase();
    if(at && !timeline.some(event=>event.kind===kind && (event.at===at || (contact[`last${direction}ProviderId`] && event.providerId===contact[`last${direction}ProviderId`])))) timeline.push({id:`last-${kind}`,kind,message:contact[`last${direction}Message`],at});
  }
  timeline.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  return {item:contact,timeline};
}
export async function saveContact(input) {
  await ensureContactSchema(); const owner=normalizeProspectorKey(input.prospectorKey),key=keyOf(input.key);
  const stages=['','conversation','interested','link_sent','trial','paying','not_now'];
  if(!stages.includes(input.stage)) fail('Etapa inválida.',400);
  let followup=null;
  if(input.followupAt) { const time=Date.parse(input.followupAt); if(!Number.isFinite(time)) fail('Data de retorno inválida.',400); followup=new Date(time).toISOString(); }
  const text=(value,max)=>String(value || '').trim().slice(0,max);
  const client=await getPool().connect();
  try {
    await client.query('BEGIN');
    const claim=await client.query('SELECT * FROM affiliate_prospecting_claims WHERE prospector_key=$1 AND lead_key=$2 FOR UPDATE',[owner,key]);
    if(!claim.rowCount) fail('Barbearia não encontrada.',404);
    if(claim.rows[0].status==='do_not_contact' && followup) fail('Este contato está bloqueado para novas abordagens.',409);
    await client.query(`INSERT INTO affiliate_contact_profiles(prospector_key,lead_key,contact_name,notes,next_step,stage,followup_at)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(prospector_key,lead_key) DO UPDATE SET contact_name=EXCLUDED.contact_name,
      notes=EXCLUDED.notes,next_step=EXCLUDED.next_step,stage=EXCLUDED.stage,followup_at=EXCLUDED.followup_at,updated_at=NOW()`,
      [owner,key,text(input.contactName,120),text(input.notes,5000),text(input.nextStep,500),input.stage,followup]);
    await client.query(`UPDATE affiliate_prospecting_claims SET qualification=$3 WHERE prospector_key=$1 AND lead_key=$2`,[owner,key,input.stage==='interested'?'interested':'']);
    await client.query(`INSERT INTO affiliate_contact_events(prospector_key,lead_key,kind,message) VALUES($1,$2,'note',$3)`,
      [owner,key,`${input.completeReturn ? 'Retorno concluído.' : 'Ficha atualizada.'}${followup ? ` Próximo retorno: ${followup}.` : ''}${text(input.nextStep,500) ? ` Próxima ação: ${text(input.nextStep,500)}` : ''}${text(input.notes,5000) ? ` Anotações: ${text(input.notes,5000)}` : ''}`]);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return getContact({prospectorKey:owner,key});
}
