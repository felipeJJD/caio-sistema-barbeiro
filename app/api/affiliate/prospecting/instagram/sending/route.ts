import {getAffiliateSessionAccess} from '../../../../../../db/affiliate-auth';
import {getAffiliateDashboard} from '../../../../../../db/affiliate-portal';
import {affiliateProspectingFetch,affiliateProspectorIdentity} from '../../../../../../lib/affiliate-prospecting-bridge';
import {validAppOrigin} from '../../../../../../lib/request-origin';
import {instagramProfileUsername} from '../../../../../../lib/affiliate-instagram-profile';
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
   const username=instagramProfileUsername(body.username);
   if(!username)return reply({error:'Informe seu @ ou o link do seu perfil no Instagram.'},400);
   const code=String(body.code||'').replace(/\s/g,'');
   if(code&&!/^\d{6,8}$/.test(code))return reply({error:'O código de autenticação deve ter de 6 a 8 números.'},400);
   // Checking the connection must never trigger another login. Respect the bridge's
   // waiting period on the server too, even if the browser has an old screen open.
   const current=await affiliateProspectingFetch('/api/connections/instagram',affiliateProspectorIdentity(access));
   if(!current.response.ok)return reply({error:'Não consegui conferir a conexão. Tente Conferir conexão antes de autorizar novamente.'},503);
   const state=current.payload as {enabled?:boolean;connection?:{username?:string;status?:string;retryAt?:string}};
   if(state.connection?.status==='connected')return reply(current.payload);
   const retryAt=Date.parse(state.connection?.retryAt||'');
   if(Number.isFinite(retryAt)&&retryAt>Date.now())return reply({error:'O Instagram pediu uma pausa. Aguarde o prazo indicado e confira sua conta no aplicativo antes de tentar novamente.',code:'rate_limited',retryAt:new Date(retryAt).toISOString()},429);
   if(state.enabled===false)return reply({error:'O serviço de conexão está indisponível. A busca e os perfis salvos continuam disponíveis.'},503);
   input={...input,username,password:body.password,code};
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
