import { databaseHealth } from "../../../lib/prospecting-db.js";
import { ensureClaimsSchema } from "../../../lib/affiliate-claims.js";
export const dynamic='force-dynamic';
export async function GET() {
  try{await databaseHealth();await ensureClaimsSchema();return Response.json({ok:true},{headers:{'cache-control':'no-store'}});}
  catch{console.error('[prospeccao-health]',{event:'database_unavailable'});return Response.json({ok:false},{status:503});}
}
