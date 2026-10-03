import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { affiliateProspectingFetch,affiliateProspectorIdentity } from "../../../../../lib/affiliate-prospecting-bridge";
export async function GET() {
  try {const access=await getAffiliateSessionAccess();if(!access?.active)return Response.json({error:'Entre como afiliado.'},{status:401});
    const result=await affiliateProspectingFetch('/api/queue',affiliateProspectorIdentity(access));return Response.json(result.payload,{status:result.response.status,headers:{'cache-control':'no-store'}});
  }catch{return Response.json({error:'Não foi possível atualizar o progresso.'},{status:503});}
}
