import { timingSafeEqual } from "node:crypto";
import { runProspectingQueue } from "../../../../../lib/affiliate-prospecting-processor";
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
  const secret=String(process.env.WHATSAPP_JOB_SECRET||'').trim();
  const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
  if(secret.length<24||Buffer.byteLength(token)!==Buffer.byteLength(secret)||!timingSafeEqual(Buffer.from(token),Buffer.from(secret)))return Response.json({error:'Não autorizado.'},{status:401});
  try{return Response.json(await runProspectingQueue(),{headers:{'cache-control':'no-store'}});}
  catch{console.error('[prospecting-worker]',{event:'queue_unavailable'});return Response.json({error:'Fila indisponível.'},{status:503});}
}
