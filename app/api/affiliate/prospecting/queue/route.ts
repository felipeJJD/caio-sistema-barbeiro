import { getAffiliateSessionAccess } from "../../../../../db/affiliate-auth";
import { affiliateProspectingFetch,affiliateProspectorIdentity } from "../../../../../lib/affiliate-prospecting-bridge";
export async function GET() {
  try {const access=await getAffiliateSessionAccess();if(!access?.active)return Response.json({error:'Entre como afiliado.'},{status:401});
    const result=await affiliateProspectingFetch('/api/queue',affiliateProspectorIdentity(access));return Response.json(result.payload,{status:result.response.status,headers:{'cache-control':'no-store'}});
  }catch{return Response.json({error:'Não foi possível atualizar o progresso.'},{status:503});}
}

export async function POST(request:Request) {
  try {
    const access=await getAffiliateSessionAccess();
    if(!access?.active)return Response.json({error:'Entre como afiliado.'},{status:401});
    const body=await request.json().catch(()=>null) as {action?:string;id?:string}|null;
    if(!body || !['retry','confirm_sent','cancel_failed'].includes(body.action||'') || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.id||''))return Response.json({error:'Ação ou envio inválido.'},{status:400});
    const result=await affiliateProspectingFetch('/api/queue',{method:'POST',...affiliateProspectorIdentity(access),body:{action:body.action,id:body.id}});
    return Response.json(result.payload,{status:result.response.status,headers:{'cache-control':'no-store'}});
  }catch{return Response.json({error:'Não foi possível atualizar esse envio.'},{status:503});}
}
