import { registerConnection,confirmConnection } from "../../../lib/prospecting-queue.js";
export const runtime="nodejs";
export async function POST(request) {
  try {const body=await request.json();return Response.json(await (body.action==="connected"?confirmConnection(request.headers.get("x-ca-prospector-key")):registerConnection(request.headers.get("x-ca-prospector-key"),String(body.phone||""))),{headers:{"cache-control":"no-store"}});}
  catch(error){return Response.json({error:error.message},{status:error.status||503});}
}
