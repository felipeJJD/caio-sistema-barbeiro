import { getAffiliateProspectorAccess } from "../db/affiliate-auth";
import { affiliateProspectingFetch } from "./affiliate-prospecting-bridge";
import { getProspectingWhatsappState, prospectingInstanceFor, sendProspectingWhatsappText } from "./affiliate-prospecting-whatsapp";

type Job={id:string;owner:string;instance:string;phoneE164:string;message:string;leaseToken:string;attempts:number};
async function command(body:unknown) {
  const {response,payload}=await affiliateProspectingFetch('/api/queue',{method:'POST',body});
  if(!response.ok)throw new Error('Fila da prospecção indisponível.');
  return payload as {job?:Job|null;allowed?:boolean};
}
export async function runProspectingQueue() {
  const {job}=await command({action:'lease'});
  if(!job)return {processed:false};
  const base={action:'complete',id:job.id,leaseToken:job.leaseToken};
  let dispatched=false;
  try {
    const access=await getAffiliateProspectorAccess(job.owner);
    if(!access?.active || prospectingInstanceFor(access)!==job.instance) {
      await command({...base,status:'cancelled',error:'Acesso do afiliado pausado.'});return {processed:true};
    }
    const state=await getProspectingWhatsappState(job.instance);
    if(!state.connected) {
      await command({...base,status:'pending',error:'Reconecte seu WhatsApp para continuar.',retryAfter:60});return {processed:true};
    }
    const permission=await command({action:'dispatch',id:job.id,leaseToken:job.leaseToken});
    if(!permission.allowed)return {processed:false};
    dispatched=true;
    const result=await sendProspectingWhatsappText(job.phoneE164,job.message,job.instance);
    // Persisting history is part of the same DB transaction as completing the queue item.
    // If this request fails, a webhook receipt or stale-send reconciliation handles it; never resend.
    await command({...base,status:'sent',providerMessageId:result.providerMessageId});
    return {processed:true};
  }catch(error) {
    const status=Number((error as {status?:number})?.status);
    const rejected=dispatched && [400,422].includes(status);
    const retrySafe=!dispatched || [401,403,404,409,429].includes(status);
    const exhausted=status===429 && job.attempts>=2;
    const next=rejected||exhausted?'failed':retrySafe?'pending':'uncertain';
    const message=next==='uncertain'?'Não foi possível confirmar o envio. Confira no WhatsApp antes de repetir.':next==='failed'?'WhatsApp recusou o envio. Confira o número ou fale com o suporte.':'Envio temporariamente indisponível; a fila tentará novamente.';
    try {await command({...base,status:next,error:message,retrySafe,retryAfter:60});}
    catch {console.error('[prospecting-worker]',{event:'completion_unavailable',phase:dispatched?'sending':'leased'});}
    console.error('[prospecting-worker]',{event:'send_unavailable',phase:dispatched?'sending':'leased',status:status||0});
    return {processed:true};
  }
}
