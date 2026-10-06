import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { getAffiliateDashboard } from "../../../../../db/affiliate-portal";
import { affiliateProspectingFetch, affiliateProspectorIdentity } from "../../../../../lib/affiliate-prospecting-bridge";
import { beginProspectingWhatsappPairing, recoverProspectingWhatsappConnection, getProspectingWhatsappState, normalizeProspectingWhatsappPhone, canonicalProspectingPhone, prospectingInstanceFor } from "../../../../../lib/affiliate-prospecting-whatsapp";
import { getVoiceAudio, getVoiceProfile, validVoiceId } from '../../../../../lib/affiliate-prospecting-audio';
const reply=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{"cache-control":"no-store"}});
export async function GET() {
  try {
    const access=await getAffiliateSessionAccess();
    if(!access?.active)return reply({error:"Entre como afiliado para usar a prospecção."},401);
    const state=await getProspectingWhatsappState(prospectingInstanceFor(access));
    let syncWarning='';
    if(state.connected) {
      try {
        const result=await affiliateProspectingFetch('/api/connections',{method:'POST',...affiliateProspectorIdentity(access),body:{action:'connected'}});
        if(!result.response.ok)syncWarning='WhatsApp conectado. A atualização da prospecção está temporariamente indisponível.';
      } catch { syncWarning='WhatsApp conectado. A atualização da prospecção está temporariamente indisponível.'; }
    }
    return reply({...state,canConnect:true,syncWarning});
  }catch(error){return reply({error:error instanceof Error?error.message:"Não foi possível consultar seu WhatsApp."},Number((error as {status?:number})?.status)||503);}
}
export async function POST(request:Request) {
  try {
    const access=await getAffiliateSessionAccess();
    if(!access?.active)return reply({error:"Entre como afiliado para usar a prospecção."},401);
    const body=await request.json() as {action?:string;phone?:string;keys?:string[];template?:string;approachMode?:string;audioId?:string;linkId?:number | null};
    const identity=affiliateProspectorIdentity(access);const instance=prospectingInstanceFor(access);
    if(body.action==='recover')return reply(await recoverProspectingWhatsappConnection(instance));
    if(body.action==='connect') {
      const phone=normalizeProspectingWhatsappPhone(String(body.phone||''));
      if(!phone)return reply({error:"Informe o DDD e o número do seu WhatsApp."},400);
      return reply(await beginProspectingWhatsappPairing(phone,instance,async()=>{
        const registration=await affiliateProspectingFetch('/api/connections',{method:'POST',...identity,body:{phone:canonicalProspectingPhone(phone)}});
        if(!registration.response.ok)throw Object.assign(new Error(String(registration.payload.error||'Não foi possível registrar este WhatsApp.')),{status:registration.response.status});
      }));
    }
    if(body.action==='enqueue') {
      const mode=body.approachMode||'text';
      if(!['text','text_audio','audio_wait','audio_only'].includes(mode))return reply({error:'Abordagem inválida.'},400);
      if(mode!=='text') {
        const profile=await getVoiceProfile(identity.prospectorKey);
        if(!body.audioId||!validVoiceId(body.audioId)||profile.audioId!==body.audioId||!await getVoiceAudio(identity.prospectorKey,body.audioId,'ogg'))
          return reply({error:'Salve um áudio próprio antes de iniciar esse envio.'},409);
      }
      const data=await getAffiliateDashboard(access);
      const requestedLink = body.linkId != null ? data.links.find(item=>item.id===Number(body.linkId)&&item.active) : null;
      if(body.linkId != null && !requestedLink)return reply({error:"Esta campanha não está ativa ou não pertence a você."},409);
      const link=requestedLink??data.links.find(item=>item.active&&item.isMain)??data.links.find(item=>item.active);
      const signupUrl=access.isAdmin&&!requestedLink?'https://cortouanotou.com.br/comece':link?.url;
      if(!signupUrl)return reply({error:"Ative seu link de indicação antes de enviar."},409);
      const state=await getProspectingWhatsappState(instance);
      if(!state.connected)return reply({error:"Conecte seu WhatsApp antes de enviar."},409);
      if(state.webhookReady===false)return reply({error:'O recebimento das respostas está temporariamente indisponível. Aguarde antes de iniciar novos envios.'},503);
      const result=await affiliateProspectingFetch('/api/queue',{method:'POST',...identity,body:{action:'enqueue',keys:body.keys,template:String(body.template||''),signupUrl,approachMode:mode,audioId:mode==='text'?undefined:body.audioId}});
      return reply(result.payload,result.response.status);
    }
    return reply({error:"Ação inválida."},400);
  }catch(error){console.error('[prospecting-whatsapp]',{type:error instanceof Error?error.name:'Unknown'});return reply({error:error instanceof Error?error.message:"Não foi possível atualizar seu WhatsApp."},Number((error as {status?:number})?.status)||503);}
}
