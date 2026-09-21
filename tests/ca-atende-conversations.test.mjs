import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const callLog = [];
const fixtures = `
export async function getPublicBookingSlotsExpanded(slug,date,serviceId,barberId) {
  globalThis.__caSlots.push({slug,date,serviceId,barberId});
  return [
    {time:"10:00",barberId:1,barberName:"Eduardo"},
    {time:"11:00",barberId:2,barberName:"Davi"},
    {time:"17:30",barberId:1,barberName:"Eduardo"},
    {time:"18:00",barberId:2,barberName:"Davi"},
  ].filter(slot => !barberId || slot.barberId === barberId);
}`;
const noopModules = {
  "drizzle-orm": "export const and=()=>{},eq=()=>{},isNull=()=>{};",
  "./index": "export const getDb=()=>{throw Error('No database in conversation tests')};",
  "./notifications": "export const notifyOwnersOfWhatsappHandoff=()=>{throw Error('No notification in tests')};",
  "./whatsapp": "export const processWhatsappQueueSafely=()=>{throw Error('No queue in tests')},queueWhatsappTextReply=()=>{throw Error('No messages in tests')};",
  "./schema": "export const organizations={},services={},team={},whatsappAutomationSettings={},whatsappConnections={},whatsappConversations={};",
  "./ai-usage": "export async function recordAiUsageSafely(){};",
  "./public-booking": fixtures,
  "../lib/ca-atende-model": "export async function interpretCaAtendeWithAi(){ globalThis.__caAiCalls++; return null; }",
};
const result = await build({
  entryPoints: [fileURLToPath(new URL("../db/ca-atende.ts", import.meta.url))],
  bundle:true, write:false, platform:"node", format:"esm",
  plugins:[{name:"fake-external-boundary",setup(plugin){
    plugin.onResolve({filter:/.*/}, args => args.path in noopModules ? {path:args.path,namespace:"fake"} : null);
    plugin.onLoad({filter:/.*/,namespace:"fake"}, args => ({contents:noopModules[args.path],loader:"js"}));
  }}],
});
const { composeReply } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));

const context = {
  organization:{id:42,name:"Barbearia Exemplo",slug:"exemplo"},
  services:[{id:11,name:"Corte",priceCents:3500,durationMinutes:30},{id:12,name:"Barba",priceCents:2500,durationMinutes:30}],
  barbers:[{id:1,name:"Eduardo"},{id:2,name:"Davi"}],
  settings:{enabled:true,botEnabled:true,economyMode:true,bookingLinkFirst:true,spamFilterEnabled:true,aiFallbackEnabled:true,greetingText:"",handoffText:"",monthlyMessageLimit:100},
  connected:false,
};
async function chat(messages, shop=context) {
  globalThis.__caSlots=[];
  globalThis.__caAiCalls=0;
  let last={state:"",memory:{}};
  const replies=[];
  for(const text of messages){
    const decision=await composeReply({organizationId:shop.organization.id,text,phone:"550000000",providerMessageId:"test",receivedAt:"",messageRowId:0},shop,{botState:last.state,botContextJson:JSON.stringify(last.memory)});
    replies.push(decision);
    last=decision;
  }
  callLog.push({messages,replies});
  return replies;
}

test("saudação, opções e link público passam pelo mesmo motor sem IA",async()=>{
  const [hello,menu,booking,link]=await chat(["oi boa tarde","Ver opções","Agendar horário","Agendar pelo link"]);
  assert.match(hello.reply,/Barbearia Exemplo/);
  assert.deepEqual(hello.choices,["Ver opções"]);
  assert.equal(menu.choices.length,5);
  assert.deepEqual(booking.choices,["Agendar pelo link","Quero ajuda por aqui"]);
  assert.equal(link.reply,"https://cortouanotou.com.br/agendar/exemplo");
  assert.equal(globalThis.__caAiCalls,0);
});

test("consulta preço de um serviço sem oferecer preços inventados",async()=>{
  const [price,list]=await chat(["quanto custa o corte?","quais os preços?"]);
  assert.match(price.reply,/Corte custa R\$\s+35,00/);
  assert.doesNotMatch(price.reply,/Barba custa/);
  assert.match(list.reply,/Barba: R\$\s+25,00/);
  assert.ok(globalThis.__caAiCalls>=1);
});

test("conversa guiada mantém serviço, data e profissional até confirmação segura",async()=>{
  const [start,service,barber,day,hour,confirmation]=await chat(["Agendar horário","Quero ajuda por aqui","Corte","Eduardo","amanhã","10"]);
  assert.equal(service.state,"awaiting_service");
  assert.equal(barber.state,"awaiting_professional");
  assert.equal(day.memory.barber,"Eduardo");
  assert.equal(hour.memory.service,"Corte");
  assert.equal(confirmation.state,"awaiting_confirmation");
  assert.equal(confirmation.memory.time,"10:00");
  assert.deepEqual(confirmation.choices,["Confirmar","Escolher outro horário","Trocar profissional","Cancelar"]);
  assert.ok(globalThis.__caAiCalls>=1);
  assert.ok(globalThis.__caSlots.every(slot=>slot.slug==="exemplo" && slot.serviceId===11));
});

test("pedido direto consulta agenda real, confirma sem trocar serviço e não cria reserva",async()=>{
  const [candidate,confirmed]=await chat(["quero cortar com Eduardo amanhã às10","quero que vc marque pra mim"]);
  assert.equal(candidate.state,"awaiting_confirmation");
  assert.equal(confirmed.memory.service,"Corte");
  assert.equal(confirmed.memory.barber,"Eduardo");
  assert.equal(confirmed.confirmationRequested,true);
  assert.equal(confirmed.state,"test_confirmation");
  assert.ok(globalThis.__caAiCalls>=1);
});

test("troca profissional não perde serviço e dia, e consulta alternativas",async()=>{
  const [first,swap]=await chat(["quero cortar amanhã com Eduardo às10","quero outro profissional"]);
  assert.equal(first.memory.barber,"Eduardo");
  assert.equal(swap.memory.service,"Corte");
  assert.equal(swap.memory.date,first.memory.date);
  assert.notEqual(swap.memory.barber,"Eduardo");
  assert.match(swap.reply,/Davi/);
  assert.ok(globalThis.__caAiCalls>=1);
});

test("consultar todos e após 17h mantém todos os profissionais",async()=>{
  const [first,next]=await chat(["tem corte amanhã?","depois das 17"]);
  assert.match(first.reply,/Eduardo:/);
  assert.match(first.reply,/Davi:/);
  assert.match(next.reply,/Eduardo: 17:30/);
  assert.match(next.reply,/Davi: 18:00/);
  assert.doesNotMatch(next.reply,/10:00|11:00/);
  assert.ok(globalThis.__caAiCalls>=1);
});

test("falar com pessoa pausa bot; selecionar Eduardo não transfere",async()=>{
  const [choice]=await chat(["quero o Eduardo"]);
  assert.equal(choice.handoff,undefined);
  assert.equal(choice.memory.barber,"Eduardo");
  const [human]=await chat(["quero falar com o dono"]);
  assert.equal(human.handoff,true);
  assert.equal(human.state,"human_takeover");
  const [seller]=await chat(["sou consultor da Claro e tenho uma oferta comercial"]);
  assert.equal(seller.spam,true);
  assert.equal(seller.reply,"");
});

test("organizações mantêm seus próprios serviços, nomes e slug",async()=>{
  const second={...context,organization:{id:43,name:"Outra Barbearia",slug:"outra"},services:[{id:20,name:"Barba",priceCents:4800,durationMinutes:45}]};
  const [price]=await chat(["quanto custa a barba?"],second);
  assert.match(price.reply,/R\$\s+48,00/);
  assert.doesNotMatch(price.reply,/R\$\s+25,00|Corte/);
  const [link]=await chat(["Agendar pelo link"],second);
  assert.equal(link.reply,"https://cortouanotou.com.br/agendar/outra");
});
