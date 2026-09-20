import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
async function load(entry, plugins=[]) {
  const result = await build({
    entryPoints:[fileURLToPath(new URL(entry,import.meta.url))],
    bundle:true,write:false,platform:"node",format:"esm",plugins,
  });
  return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
}

const conversation = await load("../lib/help-conversation.ts");
const reports = await load("../lib/help-reports.ts");

async function loadProfile() {
  const result = await build({
    entryPoints:[fileURLToPath(new URL("../db/assistant-profile.ts",import.meta.url))],
    bundle:true,write:false,platform:"node",format:"esm",
    plugins:[{name:"mock-env",setup(b){
      b.onResolve({filter:/^@\/runtime\/env$/},()=>({path:"env",namespace:"mock"}));
      b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:`
        export const env = { DB: { prepare(){ return { bind(){ return this }, async run(){ return {} }, async first(){ return null } } } } };
      `,loader:"js"}));
    }}],
  });
  return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
}

test("contexto seguro dura oito horas e nunca restaura texto de assistente comum",()=>{
  const now=1_800_000_000_000;
  let memory={updatedAt:now,messages:[]};
  memory=conversation.appendHelpConversation(memory,{role:"user",content:"quanto faturou ontem?"},now);
  memory=conversation.appendHelpConversation(memory,{role:"assistant",content:"[contexto seguro] Última consulta: ontem."},now+1);
  const raw=JSON.stringify({...memory,messages:[...memory.messages,{role:"assistant",content:"R$ 9.000 de faturamento"}]});
  const loaded=conversation.parseHelpConversationMemory(raw,now+1000);
  assert.equal(loaded.messages.length,2);
  assert.equal(loaded.messages[0].content,"quanto faturou ontem?");
  assert.match(loaded.messages[1].content,/contexto seguro/);
  assert.equal(conversation.parseHelpConversationMemory(raw,now+conversation.HELP_CONTEXT_TTL_MS+1).messages.length,0);
});

test("relatório entende sexta-feira sem transformar o dia em profissional",()=>{
  const now=new Date("2026-09-20T12:00:00Z"); // domingo
  const report=reports.parseReport("Quanto a barbearia faturou sexta?",true,now);
  assert.deepEqual(report,{start:"2026-09-18",end:"2026-09-18",scope:"shop",person:null,metric:"summary"});
});

test("perfil aprende preferências explícitas rapidamente e sinais casuais aos poucos",async()=>{
  const profile=await loadProfile();
  const access={organizationId:1,teamMemberId:2};
  const base={interactionCount:0,detailScore:55,warmthScore:75,humorScore:25,emojiScore:10,initiativeScore:70};
  const playful=await profile.learnAssistantProfile(access,"pode brincar comigo e pode usar emoji",base);
  assert.ok(playful.humorScore>=60);
  assert.ok(playful.emojiScore>=60);
  assert.match(profile.assistantStyleInstruction(playful),/emoji ocasional/i);
  const terse=await profile.learnAssistantProfile(access,"só me fala o valor sem enrolar",{...base,detailScore:55});
  assert.ok(terse.detailScore<=30);
});
