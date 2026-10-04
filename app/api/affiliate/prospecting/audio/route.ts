import { getAffiliateSessionAccess } from '../../../../../db/affiliate-auth';
import { affiliateProspectorIdentity, affiliateProspectingFetch } from '../../../../../lib/affiliate-prospecting-bridge';
import { deleteVoiceAudio, getVoiceAudio, getVoiceProfile, saveVoiceAudio, saveVoiceScript } from '../../../../../lib/affiliate-prospecting-audio';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
async function identity() {
  const access=await getAffiliateSessionAccess();
  return access?.active?affiliateProspectorIdentity(access).prospectorKey:null;
}
function sameOrigin(request:Request) {
  const origin=request.headers.get('origin');
  return !origin || origin===new URL(request.url).origin;
}
export async function GET(request:Request) {
  try {
    const owner=await identity();if(!owner)return reply({error:'Entre como afiliado.'},401);
    const profile=await getVoiceProfile(owner);
    if(new URL(request.url).searchParams.get('play')==='1') {
      if(!profile.audioId)return reply({error:'Áudio não encontrado.'},404);
      const bytes=await getVoiceAudio(owner,profile.audioId,'preview');
      if(!bytes)return reply({error:'Áudio não encontrado.'},404);
      const range=request.headers.get('range');
      const match=range?.match(/^bytes=(\d+)-(\d*)$/);
      if(match) {
        const start=Number(match[1]),end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
        if(start>=bytes.length||end<start)return new Response(null,{status:416,headers:{...headers,'content-range':`bytes */${bytes.length}`}});
        return new Response(new Uint8Array(bytes.subarray(start,end+1)),{status:206,headers:{...headers,'content-type':profile.mimeType,'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':String(end-start+1)}});
      }
      return new Response(new Uint8Array(bytes),{headers:{...headers,'content-type':profile.mimeType,'accept-ranges':'bytes','content-length':String(bytes.length)}});
    }
    return reply({profile});
  }catch{return reply({error:'Não foi possível carregar seu áudio.'},503);}
}
export async function POST(request:Request) {
  try {
    const owner=await identity();if(!owner)return reply({error:'Entre como afiliado.'},401);
    if(!sameOrigin(request))return reply({error:'Origem inválida.'},403);
    if(request.headers.get('content-type')?.startsWith('application/json')) {
      if(Number(request.headers.get('content-length')||0)>16_384)return reply({error:'Roteiro muito longo.'},413);
      const data=await request.json() as {script?:unknown};
      if(typeof data.script!=='string')return reply({error:'Roteiro inválido.'},400);
      return reply({profile:await saveVoiceScript(owner,data.script)});
    }
    const mime=request.headers.get('content-type')||'';
    if(!mime.startsWith('audio/'))return reply({error:'Formato de gravação inválido.'},415);
    if(Number(request.headers.get('content-length')||0)>6*1024*1024)return reply({error:'Gravação muito grande.'},413);
    const reader=request.body?.getReader();if(!reader)return reply({error:'Gravação vazia.'},400);
    const chunks:Buffer[]=[];let total=0;
    while(true) {
      const {value,done}=await reader.read();if(done)break;
      total+=value.byteLength;
      if(total>6*1024*1024){await reader.cancel();return reply({error:'Gravação muito grande.'},413);}
      chunks.push(Buffer.from(value));
    }
    const profile=await saveVoiceAudio(owner,Buffer.concat(chunks),mime,Number(request.headers.get('x-audio-duration')));
    return reply({profile});
  }catch(error){return reply({error:error instanceof Error?error.message:'Não foi possível salvar seu áudio.'},400);}
}
export async function DELETE(request:Request) {
  try {const owner=await identity();if(!owner)return reply({error:'Entre como afiliado.'},401);
    if(!sameOrigin(request))return reply({error:'Origem inválida.'},403);
    const {response,payload}=await affiliateProspectingFetch('/api/queue',{method:'POST',prospectorKey:owner,prospectorName:'',body:{action:'audio_in_use'}});
    if(!response.ok)return reply({error:'Não foi possível conferir os envios de áudio. Tente novamente.'},503);
    if((payload as {inUse?:boolean}).inUse)return reply({error:'Há um lote usando sua gravação. Termine ou resolva os envios antes de excluir.'},409);
    return reply({profile:await deleteVoiceAudio(owner)});
  }catch(error){return reply({error:error instanceof Error?error.message:'Não foi possível excluir seu áudio.'},Number((error as {status?:number})?.status)||503);}
}
