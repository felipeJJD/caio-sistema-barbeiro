import {authorizedBridge} from '../../../../lib/bridge-auth.js';
import {instagramSendingStatus,connectInstagram,disconnectInstagram,startInstagramBatch,controlInstagramBatch} from '../../../../lib/instagram-sending.js';
export const runtime='nodejs';export const dynamic='force-dynamic';
const reply=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store'}});
export async function GET(request){
 if(!await authorizedBridge(request))return reply({error:'Acesso não autorizado.'},401);
 try{return reply(await instagramSendingStatus({prospectorKey:request.headers.get('x-ca-prospector-key')}));}catch{return reply({error:'Não foi possível consultar a conexão do Instagram.'},503);}
}
export async function POST(request){
 if(!await authorizedBridge(request))return reply({error:'Acesso não autorizado.'},401);
 try{
  const body=await request.json(),input={...body,prospectorKey:request.headers.get('x-ca-prospector-key')};
  if(body.action==='connect')return reply(await connectInstagram(input));
  if(body.action==='disconnect')return reply(await disconnectInstagram(input));
  if(body.action==='start')return reply(await startInstagramBatch(input));
  if(['pause','resume','stop'].includes(body.action))return reply(await controlInstagramBatch(input));
  return reply({error:'Ação inválida.'},400);
 }catch(error){return reply({error:Number(error?.status)?error.message:'Não foi possível concluir a operação do Instagram.',...(error?.code?{code:error.code}:{}),...(error?.reference?{reference:error.reference}:{}),...(error?.retryAt?{retryAt:error.retryAt}:{})},Number(error?.status)||503);}
}
