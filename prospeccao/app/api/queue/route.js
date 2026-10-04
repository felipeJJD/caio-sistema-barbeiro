import { enqueue,listQueue,leaseNext,authorizeDispatch,completeJob,recordOutboundReceipt,recordDelivery,resolveQueueJob,audioInUse } from "../../../lib/prospecting-queue.js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"no-store"};
export async function GET(request) {
  try { return Response.json(await listQueue(request.headers.get("x-ca-prospector-key")),{headers}); }
  catch(error){ return Response.json({error:error.message},{status:error.status||503,headers}); }
}
export async function POST(request) {
  try {
    const body=await request.json(); const owner=request.headers.get("x-ca-prospector-key");
    // User requests always have an owner signed by the main application. Worker operations have none.
    let result;
    if(body.action==='enqueue' && owner) result=await enqueue(owner,body);
    else if(body.action==='audio_in_use' && owner) result=await audioInUse(owner);
    else if(owner && ['retry','confirm_sent','cancel_failed'].includes(body.action)) result=await resolveQueueJob(owner,body);
    else if(!owner && body.action==='lease') result=await leaseNext();
    else if(!owner && body.action==='dispatch') result=await authorizeDispatch(body);
    else if(!owner && body.action==='complete') result=await completeJob(body);
    else if(!owner && body.action==='delivery') result=await recordDelivery(body);
    else if(!owner && body.action==='outbound') result=await recordOutboundReceipt(body);
    else return Response.json({error:"Ação inválida."},{status:400,headers});
    return Response.json(result,{headers});
  } catch(error){console.error('[prospeccao-queue]',{type:error.name,status:error.status||503});return Response.json({error:error.message},{status:error.status||503,headers});}
}
