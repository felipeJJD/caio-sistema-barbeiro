import {getAffiliateSessionAccess} from '../../../../../../db/affiliate-auth';
import {getAffiliateDashboard} from '../../../../../../db/affiliate-portal';
import {affiliateProspectingFetch,affiliateProspectorIdentity} from '../../../../../../lib/affiliate-prospecting-bridge';
import {validAppOrigin} from '../../../../../../lib/request-origin';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'cache-control':'no-store'}});
export async function GET(){
 try{const access=await getAffiliateSessionAccess();if(!access?.active)return reply({error:'Entre como afiliado.'},401);
  const {response,payload}=await affiliateProspectingFetch('/api/connections/instagram',affiliateProspectorIdentity(access));return reply(payload,response.status);
 }catch{return reply({error:'Não foi possível consultar seu Instagram.'},503);}
}
export async function POST(request:Request){
 try{
  if(!validAppOrigin(request))return reply({error:'Origem inválida.'},403);
  const access=await getAffiliateSessionAccess();if(!access?.active)return reply({error:'Entre como afiliado.'},401);
  const body=await request.json().catch(()=>null);
  if(!body||!['connect','disconnect','start','pause','resume','stop'].includes(body.action))return reply({error:'Ação inválida.'},400);
  let input:Record<string,unknown>={action:body.action};
  if(body.action==='connect'){
   if(typeof body.username!=='string'||body.username.length>400||typeof body.password!=='string'||!body.password||body.password.length>200||String(body.code||'').length>12)return reply({error:'Confira seu perfil, sua senha e o código.'},400);
   input={...input,username:body.username,password:body.password,code:String(body.code||'')};
  }
  if(body.action==='start'){
   if(!Array.isArray(body.usernames)||!body.usernames.length||body.usernames.length>40||body.usernames.some((value:unknown)=>typeof value!=='string'||value.length>30)||typeof body.template!=='string'||!body.template.trim()||body.template.length>1800)return reply({error:'Selecione de 1 a 40 perfis e escreva a mensagem.'},400);
   const dashboard=await getAffiliateDashboard(access),active=dashboard.links.filter(link=>link.active);
   const campaign=body.campaignId==null?null:active.find(link=>link.id===Number(body.campaignId));
   if(body.campaignId!=null&&!campaign)return reply({error:'Esta campanha não está disponível.'},400);
   const link=campaign?.url||(access.isAdmin?'https://cortouanotou.com.br/comece':(active.find(link=>link.isMain)||active[0])?.url);
   if(!link)return reply({error:'Ative seu link em Gerar links.'},409);
   input={...input,usernames:body.usernames,template:body.template,campaignId:body.campaignId??null,link};
  }
  if(['pause','resume','stop'].includes(body.action))input={...input,batchId:String(body.batchId||'').slice(0,36)};
  const {response,payload}=await affiliateProspectingFetch('/api/connections/instagram',{method:'POST',...affiliateProspectorIdentity(access),body:input});return reply(payload,response.status);
 }catch{return reply({error:'Não foi possível concluir a operação do Instagram. Atualize o andamento antes de tentar novamente.'},503);}
}
