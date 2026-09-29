import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const callLog = [];
const fixtures = `
export async function listWhatsappManagedBookings(){ return globalThis.__caManagedBookings || []; }
export async function cancelWhatsappManagedBooking(){ throw Error("No real cancellation in tests"); }
export async function rescheduleWhatsappManagedBooking(){ throw Error("No real reschedule in tests"); }
export async function getPublicBookingSlotsExpanded(slug,date,serviceId,barberId) {
  globalThis.__caSlots.push({slug,date,serviceId,barberId});
  return [
    {time:"10:00",barberId:1,barberName:"Eduardo"},
    {time:"11:00",barberId:2,barberName:"Davi"},
    {time:"17:30",barberId:1,barberName:"Eduardo"},
    {time:"18:00",barberId:2,barberName:"Davi"},
  ].filter(slot => !barberId || slot.barberId === barberId);
}
export async function getPublicBookingData(){
  return {payments:{pixEnabled:false,cashEnabled:true,debitEnabled:true,creditEnabled:true}};
}
export async function createPublicBooking(){
  throw Error("Simulation must never create a real appointment");
}
`;
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
  settings:{enabled:true,botEnabled:true,cancellationEnabled:true,rescheduleEnabled:true,economyMode:true,bookingLinkFirst:true,spamFilterEnabled:true,aiFallbackEnabled:true,greetingText:"",handoffText:"",monthlyMessageLimit:100},
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
  assert.match(hello.reply,/https:\/\/cortouanotou\.com\.br\/agendar\/exemplo/);
  assert.equal(hello.choices,undefined);
  assert.equal(menu.choices.length,5);
  assert.equal(booking.state,"awaiting_service");
  assert.ok(booking.choices.includes("Corte"));
  assert.doesNotMatch(booking.reply,/Como prefere agendar/i);
  assert.equal(link.reply,"https://cortouanotou.com.br/agendar/exemplo");
  assert.equal(globalThis.__caAiCalls,0);
});

test("saudação usa nome e link da própria organização",async()=>{
  const another={...context,organization:{id:43,name:"Outra Barbearia",slug:"outra"}};
  const [hello]=await chat(["e aí beleza?"],another);
  assert.match(hello.reply,/Outra Barbearia/);
  assert.match(hello.reply,/\/agendar\/outra/);
  assert.doesNotMatch(hello.reply,/Barbearia Exemplo|\/agendar\/exemplo/);
});

test("consulta preço de um serviço sem oferecer preços inventados",async()=>{
  const [price,list]=await chat(["quanto custa o corte?","quais os preços?"]);
  assert.match(price.reply,/Corte custa R\$\s+35,00/);
  assert.doesNotMatch(price.reply,/Barba custa/);
  assert.match(list.reply,/Barba: R\$\s+25,00/);
  assert.equal(globalThis.__caAiCalls,0);
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
  assert.equal(globalThis.__caAiCalls,0);
  assert.ok(globalThis.__caSlots.every(slot=>slot.slug==="exemplo" && slot.serviceId===11));
});

test("pedido direto usa IA para interpretar a conversa livre e mantém execução segura",async()=>{
  const [candidate,confirmed]=await chat(["quero cortar com Eduardo amanhã às10","quero que vc marque pra mim"]);
  assert.equal(candidate.state,"awaiting_confirmation");
  assert.equal(confirmed.memory.service,"Corte");
  assert.equal(confirmed.memory.barber,"Eduardo");
  assert.equal(confirmed.confirmationRequested,true);
  assert.equal(confirmed.state,"test_confirmation");
  assert.equal(globalThis.__caAiCalls,1);
});

test("troca profissional não perde serviço e dia, e consulta alternativas",async()=>{
  const [first,swap]=await chat(["quero cortar amanhã com Eduardo às10","quero outro profissional"]);
  assert.equal(first.memory.barber,"Eduardo");
  assert.equal(swap.memory.service,"Corte");
  assert.equal(swap.memory.date,first.memory.date);
  assert.notEqual(swap.memory.barber,"Eduardo");
  assert.match(swap.reply,/Davi/);
  assert.equal(globalThis.__caAiCalls,1);
});

test("consultar todos e após 17h mantém todos os profissionais",async()=>{
  const [first,next]=await chat(["tem corte amanhã?","depois das 17"]);
  assert.match(first.reply,/Eduardo:/);
  assert.match(first.reply,/Davi:/);
  assert.match(next.reply,/Eduardo: 17:30/);
  assert.match(next.reply,/Davi: 18:00/);
  assert.doesNotMatch(next.reply,/10:00|11:00/);
  assert.equal(globalThis.__caAiCalls,0);
});

test("cancelamento identifica o horário e exige confirmação antes da alteração real",async()=>{
  globalThis.__caManagedBookings=[{appointmentId:77,clientName:"Cliente",date:"2099-12-31",time:"10:00",serviceId:11,serviceName:"Corte",durationMinutes:30,barberId:1,barberName:"Eduardo",status:"Agendado",canChange:true}];
  const [request,confirmation]=await chat(["quero cancelar meu horario","Confirmar cancelamento"]);
  assert.equal(request.state,"awaiting_cancel_confirmation");
  assert.equal(request.memory.appointmentId,77);
  assert.equal(request.handoff,undefined);
  assert.equal(confirmation.state,"management_commit");
  assert.deepEqual(confirmation.managementRequest,{action:"cancel",appointmentId:77});
  globalThis.__caManagedBookings=[];
});

test("remarcação preserva o agendamento, consulta agenda real e exige confirmação",async()=>{
  globalThis.__caManagedBookings=[{appointmentId:88,clientName:"Cliente",date:"2099-12-31",time:"17:30",serviceId:11,serviceName:"Corte",durationMinutes:30,barberId:1,barberName:"Eduardo",status:"Agendado",canChange:true}];
  const [request,day,hour,confirmation]=await chat(["quero remarcar meu horario","amanhã","10","Confirmar remarcação"]);
  assert.equal(request.state,"awaiting_reschedule_date");
  assert.equal(request.memory.appointmentId,88);
  assert.equal(day.state,"awaiting_reschedule_time");
  assert.ok(globalThis.__caSlots.some(slot=>slot.barberId===1 && slot.serviceId===11));
  assert.equal(hour.state,"awaiting_reschedule_confirmation");
  assert.equal(hour.memory.time,"10:00");
  assert.equal(confirmation.state,"management_commit");
  assert.equal(confirmation.managementRequest.action,"reschedule");
  assert.equal(confirmation.managementRequest.appointmentId,88);
  assert.equal(confirmation.managementRequest.time,"10:00");
  globalThis.__caManagedBookings=[];
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
