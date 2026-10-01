import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const fixtures = `
export async function listWhatsappManagedBookings(){ return []; }
export async function cancelWhatsappManagedBooking(){ throw Error("No real cancellation in tests"); }
export async function rescheduleWhatsappManagedBooking(){ throw Error("No real reschedule in tests"); }
export async function getPublicBookingSlotsExpanded(slug,date,serviceId,barberId) {
  return [
    {time:"10:00",barberId:1,barberName:"Eduardo"},
    {time:"11:00",barberId:2,barberName:"Davi"},
    {time:"17:30",barberId:1,barberName:"Eduardo"},
    {time:"18:00",barberId:2,barberName:"Davi"},
  ].filter(slot => !barberId || slot.barberId === barberId);
}
export async function getPublicBookingData(){
  return {payments:{pixEnabled:true,cashEnabled:true,debitEnabled:true,creditEnabled:true}};
}
export async function createPublicBooking(){ throw Error("No real booking in tests"); }
`;

const noopModules = {
  "drizzle-orm": "export const and=()=>{},eq=()=>{},isNull=()=>{};",
  "./index": "export const getDb=()=>{throw Error('No database in numbered choice tests')};",
  "./notifications": "export const notifyOwnersOfWhatsappHandoff=async()=>{};",
  "./whatsapp": "export const processWhatsappQueueSafely=async()=>{},queueWhatsappTextReply=async()=>({queued:true});",
  "./schema": "export const organizations={},services={},team={},whatsappAutomationSettings={},whatsappConnections={},whatsappConversations={};",
  "./ai-usage": "export async function recordAiUsageSafely(){};",
  "./public-booking": fixtures,
  "../lib/ca-atende-model": "export async function interpretCaAtendeWithAi(){ return null; }",
};

const result = await build({
  entryPoints: [fileURLToPath(new URL("../db/ca-atende.ts", import.meta.url))],
  bundle:true,
  write:false,
  platform:"node",
  format:"esm",
  plugins:[{name:"fake-boundary",setup(plugin){
    plugin.onResolve({filter:/.*/}, args => args.path in noopModules ? {path:args.path,namespace:"fake"} : null);
    plugin.onLoad({filter:/.*/,namespace:"fake"}, args => ({contents:noopModules[args.path],loader:"js"}));
  }}],
});
const { composeReply } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));

const context = {
  organization:{id:42,name:"Barbearia Exemplo",slug:"exemplo"},
  services:[
    {id:11,name:"Corte",priceCents:3500,durationMinutes:30},
    {id:12,name:"Barba",priceCents:2500,durationMinutes:30},
  ],
  barbers:[{id:1,name:"Eduardo"},{id:2,name:"Davi"}],
  settings:{enabled:true,botEnabled:true,cancellationEnabled:true,rescheduleEnabled:true,economyMode:true,bookingLinkFirst:true,spamFilterEnabled:true,aiFallbackEnabled:true,greetingText:"",handoffText:"",monthlyMessageLimit:100},
  connected:false,
};

async function step(text, previous={state:"",memory:{}}) {
  const decision = await composeReply(
    {organizationId:42,text,phone:"550000000",providerMessageId:"test",receivedAt:"",messageRowId:0},
    context,
    {botState:previous.state,botContextJson:JSON.stringify(previous.memory)},
  );
  return {
    decision,
    next:{
      state:decision.state,
      memory:{...decision.memory,lastChoices:decision.choices ?? []},
    },
  };
}

test("número sempre escolhe a opção da etapa atual, inclusive com emoji keycap", async () => {
  const servicePrompt = await step("Agendar horário");
  assert.deepEqual(servicePrompt.decision.choices,["Corte","Barba"]);

  const service = await step("2️⃣", servicePrompt.next);
  assert.equal(service.decision.memory.service,"Barba");
  assert.equal(service.decision.state,"awaiting_professional");
  assert.deepEqual(service.decision.choices,["Eduardo","Davi","Qualquer profissional"]);

  const barber = await step("2", service.next);
  assert.equal(barber.decision.memory.barber,"Davi");
  assert.equal(barber.decision.state,"awaiting_booking_details");
  assert.ok(barber.decision.choices.length >= 2);

  const day = await step("2️⃣", barber.next);
  assert.equal(day.decision.state,"awaiting_booking_choice");
  assert.ok(day.decision.memory.date);
  assert.deepEqual(day.decision.choices,["Davi · 11:00","Davi · 18:00"]);

  const hour = await step("1", day.next);
  assert.equal(hour.decision.state,"awaiting_confirmation");
  assert.equal(hour.decision.memory.barber,"Davi");
  assert.equal(hour.decision.memory.time,"11:00");
});

test("mesmo número muda de significado quando a pergunta muda", async () => {
  const menu = await step("Ver opções");
  assert.equal(menu.decision.choices[1],"Ver horários disponíveis");

  const availability = await step("2", menu.next);
  assert.equal(availability.decision.intent,"availability");
  assert.equal(availability.decision.state,"awaiting_availability_details");
  assert.deepEqual(availability.decision.choices,["Corte","Barba"]);

  const service = await step("2", availability.next);
  assert.equal(service.decision.memory.service,"Barba");
  assert.notEqual(service.decision.intent,"human");
});

test("WhatsApp renderiza números com emoji e a entrada inteligente segue o mesmo padrão", async () => {
  const [dbSource, smartSource] = await Promise.all([
    readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8"),
  ]);
  assert.match(dbSource,/choiceNumberEmoji = \["1️⃣", "2️⃣", "3️⃣"/);
  assert.match(dbSource,/formatChoiceLine\(choice,index\)/);
  assert.match(dbSource,/lastChoices:safeChoices\(decision\.choices\)/);
  assert.match(smartSource,/1️⃣ 💬 Continuar por aqui/);
  assert.match(smartSource,/2️⃣ 👤 Falar com alguém/);
  assert.match(smartSource,/1️⃣ 📅 Agendar horário/);
  assert.match(smartSource,/4️⃣ 👤 Falar com alguém/);
  assert.match(smartSource,/conversation\?\.botState === "smart_clarify"/);
  assert.match(smartSource,/hasStageNumberedChoice\(event\.text, memory\)/);
  const numericGate = smartSource.indexOf("hasStageNumberedChoice(event.text, memory)");
  const aiCall = smartSource.indexOf("const ai = await interpretCaAtendeWithAi", numericGate);
  assert.ok(numericGate >= 0 && aiCall > numericGate, "escolha numérica da etapa deve ser resolvida antes da IA");
});
