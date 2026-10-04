import 'server-only';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { getStorage } from '../runtime/storage.mjs';

const MAX_UPLOAD = 6 * 1024 * 1024;
const MAX_VOICE = 2 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
type Profile = { script: string; audioId: string; durationSeconds: number; mimeType: string; recordedAt: string; versions: string[] };
const empty = (): Profile => ({ script: '', audioId: '', durationSeconds: 0, mimeType: '', recordedAt: '',versions:[] });

function ownerPath(owner: string) {
  if (!/^(admin|affiliate):[1-9]\d{0,11}$/.test(owner)) throw new Error('Acesso de prospecção inválido.');
  return `affiliate-prospecting/voice/${owner.replace(':', '/')}`;
}
function bucket() {
  return getStorage().BUCKET as { put(key: string, value: Buffer): Promise<void>; get(key: string): Promise<{body: ReadableStream<Uint8Array>}|null>; delete(key: string): Promise<void> };
}
async function read(key: string): Promise<Buffer|null> {
  const object = await bucket().get(key);
  return object ? Buffer.from(await new Response(object.body).arrayBuffer()) : null;
}
export async function getVoiceProfile(owner: string): Promise<Profile> {
  const value = await read(`${ownerPath(owner)}/profile.json`);
  if (!value) return empty();
  const profile = JSON.parse(value.toString('utf8')) as Profile;
  return { script: String(profile.script || ''), audioId: String(profile.audioId || ''), durationSeconds: Number(profile.durationSeconds) || 0,
    mimeType: String(profile.mimeType || ''), recordedAt: String(profile.recordedAt || ''),versions:Array.isArray(profile.versions)?profile.versions.filter(value=>typeof value==='string'&&UUID.test(value)):[] };
}
async function saveProfile(owner: string, profile: Profile) {
  await bucket().put(`${ownerPath(owner)}/profile.json`, Buffer.from(JSON.stringify(profile)));
}
export async function saveVoiceScript(owner: string, script: string) {
  if (script.length > 3000) throw new Error('O roteiro pode ter até 3.000 caracteres.');
  const profile = await getVoiceProfile(owner);
  profile.script = script;
  await saveProfile(owner, profile);
  return profile;
}
export function transcodeVoice(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try { child = spawn('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-i','pipe:0','-t','120','-vn','-ac','1','-ar','48000','-c:a','libopus','-b:a','32k','-f','ogg','pipe:1'],{stdio:['pipe','pipe','ignore']}); }
    catch { reject(new Error('Não foi possível preparar o áudio.')); return; }
    let total=0; const chunks:Buffer[]=[]; let done=false;
    const finish=(value?:Buffer)=>{if(done)return;done=true;clearTimeout(timer);if(value)resolve(value);else reject(new Error('Áudio inválido ou longo demais. Grave novamente.'));};
    const timer=setTimeout(()=>{child.kill();finish();},25_000);
    child.stdout!.on('data',(chunk:Buffer)=>{total+=chunk.length;if(total>MAX_VOICE){child.kill();finish();}else chunks.push(chunk);});
    child.on('error',()=>finish());
    child.on('close',(code)=>finish(code===0 && total>64 && total<=MAX_VOICE && Buffer.concat(chunks).subarray(0,4).toString()==='OggS'?Buffer.concat(chunks):undefined));
    child.stdin!.on('error',()=>{});
    child.stdin!.end(input);
  });
}
export async function saveVoiceAudio(owner: string, bytes: Buffer, mimeType: string, durationSeconds: number) {
  const mime = mimeType.toLowerCase().split(';')[0];
  if (!['audio/mp4','audio/m4a','audio/webm','audio/ogg','audio/opus'].includes(mime) || bytes.length < 128 || bytes.length > MAX_UPLOAD ||
      !Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 120) throw new Error('Áudio inválido. Grave por até 2 minutos e tente novamente.');
  const ogg=await transcodeVoice(bytes);
  const id=randomUUID(), path=ownerPath(owner), profile=await getVoiceProfile(owner);
  // Immutable versions keep an already queued batch bound to the voice heard in its preview.
  await bucket().put(`${path}/${id}.ogg`,ogg);
  await bucket().put(`${path}/${id}.preview`,bytes);
  const next={...profile,audioId:id,durationSeconds:Math.round(durationSeconds),mimeType:mime,recordedAt:new Date().toISOString(),versions:[...new Set([...profile.versions,profile.audioId,id].filter(Boolean))]};
  await saveProfile(owner,next);
  console.info('[prospecting-voice]',{event:'saved',owner,voiceId:id,bytes:ogg.length});
  return next;
}
export async function getVoiceAudio(owner: string, id: string, kind:'ogg'|'preview') {
  if (!UUID.test(id)) return null;
  return read(`${ownerPath(owner)}/${id}.${kind}`);
}
export async function deleteVoiceAudio(owner: string) {
  const profile=await getVoiceProfile(owner);
  const next={...profile,audioId:'',durationSeconds:0,mimeType:'',recordedAt:'',versions:[]};
  await saveProfile(owner,next);
  for(const id of new Set([...profile.versions,profile.audioId].filter(Boolean))) {
    await bucket().delete(`${ownerPath(owner)}/${id}.ogg`);
    await bucket().delete(`${ownerPath(owner)}/${id}.preview`);
  }
  console.info('[prospecting-voice]',{event:'deleted',owner,count:profile.versions.length});
  return next;
}
export function validVoiceId(id: string) { return UUID.test(id); }
