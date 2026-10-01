import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const fakeModules = {
  "next/server":"export function after(fn){globalThis.__audioAfter.push(fn)}",
  "../../../../../db/evolution-whatsapp":`export function validEvolutionWebhookAuthorization(){return true}
    export async function handleEvolutionWebhook(){return globalThis.__audioWebhookResult}
    export async function processEvolutionWhatsappQueue(input){globalThis.__audioCalls.push(['send',input])}`,
  "../../../../../db/evolution-audio":`export function isEvolutionAudioWebhook(){return true}
    export async function transcribeEvolutionAudioWebhook(){globalThis.__audioCalls.push(['transcribe']);return globalThis.__audioTranscription}`,
  "../../../../../db/ca-atende-smart":"export async function processCaAtendeSmartInboundSafely(input){globalThis.__audioCalls.push(['bot',input])}",
  "../../../../../db/whatsapp":"export async function queueWhatsappTextReply(input){globalThis.__audioCalls.push(['queue',input]);return {queued:true}}",
};
const bundled = await build({
  entryPoints:[fileURLToPath(new URL("../app/api/whatsapp/evolution/webhook/route.ts", import.meta.url))],
  bundle:true, write:false, platform:"node", format:"esm",
  plugins:[{name:"fake-boundary",setup(plugin){
    plugin.onResolve({filter:/.*/},args=>args.path in fakeModules ? {path:args.path,namespace:"fake"} : null);
    plugin.onLoad({filter:/.*/,namespace:"fake"},args=>({contents:fakeModules[args.path],loader:"js"}));
  }}],
});
const { POST } = await import("data:text/javascript;base64,"+Buffer.from(bundled.outputFiles[0].text).toString("base64"));

async function dispatch(result, transcription) {
  globalThis.__audioAfter=[];
  globalThis.__audioCalls=[];
  globalThis.__audioWebhookResult=result;
  globalThis.__audioTranscription=transcription;
  const response=await POST(new Request("https://cortouanotou.com.br/api/whatsapp/evolution/webhook", {
    method:"POST",body:JSON.stringify({instance:"ca-org-999999",event:"messages.upsert"}),
  }));
  for (const task of globalThis.__audioAfter) await task();
  return response;
}

test("webhook duplicado ou instância não reconhecida não transcreve nem responde", async () => {
  const response=await dispatch({received:0,statuses:0,inboundTextEvents:[]},{kind:"failed",organizationId:1,phone:"5541999999999",providerMessageId:"id"});
  assert.equal(response.status,200);
  assert.deepEqual(globalThis.__audioCalls,[]);
});

test("falha de áudio usa somente organização e telefone validados pelo servidor", async () => {
  await dispatch({received:1,statuses:0,inboundTextEvents:[]},{kind:"failed",organizationId:42,phone:"5541999999999",providerMessageId:"audio-id"});
  assert.deepEqual(globalThis.__audioCalls.map(item=>item[0]),["transcribe","queue","send"]);
  assert.equal(globalThis.__audioCalls[1][1].organizationId,42);
  assert.equal(globalThis.__audioCalls[1][1].inboundProviderMessageId,"audio-id");
  assert.equal(globalThis.__audioCalls[2][1].organizationId,42);
});

test("áudio transcrito entra na mesma guarda inteligente do texto", async () => {
  await dispatch({received:1,statuses:0,inboundTextEvents:[]},{kind:"transcribed",event:{organizationId:42,phone:"5541999999999",providerMessageId:"audio-id",text:"tem horário amanhã?"}});
  assert.deepEqual(globalThis.__audioCalls.map(item=>item[0]),["transcribe","bot","send"]);
});

test("áudio já ignorado por atendimento humano não gera resposta", async () => {
  await dispatch({received:1,statuses:0,inboundTextEvents:[]},{kind:"ignored"});
  assert.deepEqual(globalThis.__audioCalls.map(item=>item[0]),["transcribe"]);
});