import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { getAffiliateDashboard } from "../../../../../db/affiliate-portal";
import { affiliateProspectingFetch, affiliateProspectorIdentity } from "../../../../../lib/affiliate-prospecting-bridge";
import { beginProspectingWhatsappPairing, getProspectingWhatsappState, normalizeProspectingWhatsappPhone, canonicalProspectingPhone, prospectingInstanceFor } from "../../../../../lib/affiliate-prospecting-whatsapp";
const reply=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{"cache-control":"no-store"}});
export async function GET() {
  try {
    const access=await getAffiliateSessionAccess();
    if(!access?.active)return reply({error:"Entre como afiliado para usar a prospecção."},401);
    const state=await getProspectingWhatsappState(prospectingInstanceFor(access));
    if(state.connected) {
      const result=await affiliateProspectingFetch('/api/connections',{method:'POST',...affiliateProspectorIdentity(access),body:{action:'connected'}});
      if(!result.response.ok)return reply(result.payload,result.response.status);
    }
    return reply({...state,canConnect:true});
  }catch(error){return reply({error:error instanceof Error?error.message:"Não foi possível consultar seu WhatsApp."},Number((error as {status?:number})?.status)||503);}
}
export async function POST(request:Request) {
  try {
    const access=await getAffiliateSessionAccess();
    if(!access?.active)return reply({error:"Entre como afiliado para usar a prospecção."},401);
    const body=await request.json() as {action?:string;phone?:string;keys?:string[];template?:string};
    const identity=affiliateProspectorIdentity(access);const instance=prospectingInstanceFor(access);
    if(body.action==='connect') {
      const phone=normalizeProspectingWhatsappPhone(String(body.phone||''));
      if(!phone)return reply({error:"Informe o DDD e o número do seu WhatsApp."},400);
      // Never replace a connected instance or change its registered phone on a repeated click.
      const state=await getProspectingWhatsappState(instance);
      if(state.connected)return reply({...state,pairingCode:''});
      const registration=await affiliateProspectingFetch('/api/connections',{method:'POST',...identity,body:{phone:canonicalProspectingPhone(phone)}});
      if(!registration.response.ok)return reply(registration.payload,registration.response.status);
      return reply(await beginProspectingWhatsappPairing(phone,instance));
    }
    if(body.action==='enqueue') {
      const data=await getAffiliateDashboard(access);
      const link=data.links.find(item=>item.active&&item.isMain)??data.links.find(item=>item.active);
      const signupUrl=access.isAdmin?'https://cortouanotou.com.br/comece':link?.url;
      if(!signupUrl)return reply({error:"Ative seu link de indicação antes de enviar."},409);
      const state=await getProspectingWhatsappState(instance);
      if(!state.connected)return reply({error:"Conecte seu WhatsApp antes de enviar."},409);
      const result=await affiliateProspectingFetch('/api/queue',{method:'POST',...identity,body:{action:'enqueue',keys:body.keys,template:String(body.template||''),signupUrl}});
      return reply(result.payload,result.response.status);
    }
    return reply({error:"Ação inválida."},400);
  }catch(error){console.error('[prospecting-whatsapp]',{type:error instanceof Error?error.name:'Unknown'});return reply({error:error instanceof Error?error.message:"Não foi possível atualizar seu WhatsApp."},Number((error as {status?:number})?.status)||503);}
}
