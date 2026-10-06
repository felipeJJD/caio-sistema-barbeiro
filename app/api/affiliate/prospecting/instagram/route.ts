import {getAffiliateSessionAccess} from '../../../../../db/affiliate-auth';
import {affiliateProspectingFetch,affiliateProspectorIdentity} from '../../../../../lib/affiliate-prospecting-bridge';
import {validAppOrigin} from '../../../../../lib/request-origin';
const reply=(payload:unknown,status=200)=>Response.json(payload,{status,headers:{'cache-control':'no-store'}});
export async function GET(request:Request){
 try{
  const access=await getAffiliateSessionAccess();if(!access?.active)return reply({error:'Entre como afiliado.'},401);
  const url=new URL(request.url);const params=new URLSearchParams({instagram:'1',query:(url.searchParams.get('query')||'').slice(0,120),offset:String(Math.max(0,Math.min(100000,Number(url.searchParams.get('offset'))||0)))});
  if(url.searchParams.get('discover')==='1'){params.set('discover','1');params.set('city',(url.searchParams.get('city')||'').slice(0,90));params.set('uf',(url.searchParams.get('uf')||'').slice(0,2).toUpperCase());params.set('name',(url.searchParams.get('name')||'').slice(0,80));}
  params.set('view',['queue','history'].includes(url.searchParams.get('view')||'')?url.searchParams.get('view')!:'all');
  const {response,payload}=await affiliateProspectingFetch(`/api/claims?${params}`,affiliateProspectorIdentity(access));return reply(payload,response.status);
 }catch{return reply({error:'Não foi possível carregar seus contatos do Instagram.'},503);}
}
export async function POST(request:Request){
 try{
  if(!validAppOrigin(request))return reply({error:'Origem inválida.'},403);
  const access=await getAffiliateSessionAccess();if(!access?.active)return reply({error:'Entre como afiliado.'},401);
  const body=await request.json().catch(()=>null);
  if(!['save_instagram','instagram_contacted','instagram_block','instagram_enqueue','instagram_unqueue'].includes(body?.action))return reply({error:'Ação inválida.'},400);
  if(body.action==='instagram_enqueue'&&(!Array.isArray(body.items)||!body.items.length||body.items.length>40))return reply({error:'Selecione de 1 a 40 perfis.'},400);
  const {response,payload}=await affiliateProspectingFetch('/api/claims',{method:'POST',...affiliateProspectorIdentity(access),body:{action:body.action,username:String(body.username||'').slice(0,400),name:String(body.name||'').slice(0,120),city:String(body.city||'').slice(0,180),...(body.action==='instagram_enqueue'?{items:body.items.map((item:Record<string,unknown>)=>({username:String(item?.username||'').slice(0,400),name:String(item?.name||'').slice(0,120),city:String(item?.city||'').slice(0,180)}))}:{})}});
  return reply(payload,response.status);
 }catch{return reply({error:'Não foi possível salvar este contato.'},503);}
}
