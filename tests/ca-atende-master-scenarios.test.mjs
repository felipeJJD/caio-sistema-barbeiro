import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function load(entry) {
  const result = await build({
    entryPoints:[fileURLToPath(new URL(entry, import.meta.url))],
    bundle:true, write:false, platform:"node", format:"esm",
  });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}

const helper = await load("../lib/ca-atende.ts");

const fixtureModule = `
const TIMES=["08:00","09:00","10:00","11:00","12:00","13:00","14:00","15:30","17:00","17:30","18:00","19:00"];
const BARBERS=[{id:1,name:"Eduardo"},{id:2,name:"Davi"},{id:3,name:"Kaio"}];
export async function getPublicBookingSlotsExpanded(slug,date,serviceId,barberId){
  globalThis.__caSlots.push({slug,date,serviceId,barberId});
  return BARBERS.flatMap(barber => TIMES.map(time => ({time,barberId:barber.id,barberName:barber.name})))
    .filter(slot => !barberId || slot.barberId === barberId);
}`;

const fakeModules = {
  "drizzle-orm": "export const and=()=>{},eq=()=>{},isNull=()=>{};",
  "./index": "export const getDb=()=>{throw Error('No database in master scenarios')};",
  "./notifications": "export const notifyOwnersOfWhatsappHandoff=()=>{throw Error('No notification in master scenarios')};",
  "./whatsapp": "export const processWhatsappQueueSafely=()=>{throw Error('No queue in master scenarios')},queueWhatsappTextReply=()=>{throw Error('No messages in master scenarios')};",
  "./schema": "export const organizations={},services={},team={},whatsappAutomationSettings={},whatsappConnections={},whatsappConversations={};",
  "./public-booking": fixtureModule,
  "../lib/ca-atende-model": `
    export async function interpretCaAtendeWithAi(input){
      globalThis.__caAiCalls++;
      const mapped=globalThis.__caAiMap?.[input.message];
      return mapped ? {...mapped,source:"ai"} : null;
    }`,
};

const bundled = await build({
  entryPoints:[fileURLToPath(new URL("../db/ca-atende.ts", import.meta.url))],
  bundle:true, write:false, platform:"node", format:"esm",
  plugins:[{name:"fake-external-boundary",setup(plugin){
    plugin.onResolve({filter:/.*/}, args => args.path in fakeModules ? {path:args.path,namespace:"fake"} : null);
    plugin.onLoad({filter:/.*/,namespace:"fake"}, args => ({contents:fakeModules[args.path],loader:"js"}));
  }}],
});
const { composeReply } = await import("data:text/javascript;base64," + Buffer.from(bundled.outputFiles[0].text).toString("base64"));

const context = {
  organization:{id:42,name:"Barbearia Cenários",slug:"cenarios"},
  services:[
    {id:11,name:"Corte",priceCents:3500,durationMinutes:30},
    {id:12,name:"Barba",priceCents:2500,durationMinutes:30},
    {id:13,name:"Corte + barba",priceCents:5500,durationMinutes:60},
    {id:14,name:"Sobrancelha",priceCents:1500,durationMinutes:20},
    {id:15,name:"Pezinho",priceCents:1500,durationMinutes:15},
    {id:16,name:"Luzes",priceCents:12000,durationMinutes:90},
    {id:17,name:"Pigmentação",priceCents:2500,durationMinutes:30},
  ],
  barbers:[{id:1,name:"Eduardo"},{id:2,name:"Davi"},{id:3,name:"Kaio"}],
  settings:{enabled:true,botEnabled:true,economyMode:true,bookingLinkFirst:true,spamFilterEnabled:true,aiFallbackEnabled:true,greetingText:"",handoffText:"",monthlyMessageLimit:1000},
  connected:false,
};

async function chat(messages, shop=context, aiMap={}) {
  globalThis.__caSlots=[];
  globalThis.__caAiCalls=0;
  globalThis.__caAiMap=aiMap;
  let last={state:"",memory:{}};
  const replies=[];
  for (const text of messages) {
    const decision=await composeReply(
      {organizationId:shop.organization.id,text,phone:"550000000",providerMessageId:"master",receivedAt:"",messageRowId:0},
      shop,
      {botState:last.state,botContextJson:JSON.stringify(last.memory)}
    );
    replies.push(decision);
    last=decision;
  }
  return replies;
}

function choiceTimes(decision) {
  return (decision.choices||[]).map(choice => /([0-2]\d:[0-5]\d)$/.exec(choice)?.[1]).filter(Boolean);
}

let scenarioCount=0;
function scenario(category,name,fn){
  scenarioCount++;
  test(`[MASTER ${String(scenarioCount).padStart(3,"0")}] ${category} · ${name}`,fn);
}

// 1-70: regras e intenção
const greetings=[
  "oi","oii","oiii","olá","olaa","opa","opaa","e ai","eai","eae",
  "bom dia","bomdia","bo dia","boa tarde","boatarde","boua tarde","boa noite","boanoite","salve","fala parceiro",
];
const pricePhrases=[
  "quanto custa o corte","qual valor da barba","preço do corte","precos","valores",
  "tabela","quanto e a barba","quanto ta o corte","qto custa barba","vlr do corte",
];
const availabilityPhrases=[
  "tem horario hoje","horarios amanha","tem vaga","vagas","disponivel hoje",
  "disponibilidade","tem hora hoje","tem hr amanha","algum encaixe hoje","tem corte hoje",
];
const bookingPhrases=[
  "quero cortar","quero fazer a barba","quero agendar","marcar horario",
  "agenda pra mim","quero cortar amanha","quero marcar corte","agendar horario",
];
const humanPhrases=[
  "quero falar com o dono","preciso conversar com o proprietario","posso falar com uma pessoa",
  "gostaria de conversar com o responsavel","falar com o dono","falar com proprietario",
  "atendimento humano","quero falar com atendente","preciso falar com barbeiro","quero conversar com responsavel",
];
const spamPhrases=[
  "sou consultor da Claro e tenho uma oferta comercial",
  "sou representante da Vivo e tenho uma oferta comercial",
  "falo da TIM e temos uma oferta comercial para sua empresa",
  "gostaria de apresentar uma proposta comercial de internet",
  "temos uma oferta comercial de emprestimo empresarial",
  "sou vendedor de maquininha e tenho uma oferta comercial",
  "represento uma empresa de marketing e temos uma oferta comercial",
  "sou consultor de energia solar e tenho uma proposta comercial",
  "sou representante de seguro e tenho uma oferta comercial",
  "equipe comercial de telefonia com condicao especial para sua empresa",
  "sou consultor de consorcio e tenho uma oferta comercial",
  "sou especialista comercial de fibra e gostaria de apresentar uma proposta comercial",
];

for (const phrase of greetings) scenario("intenção","saudação: "+phrase,()=>{
  assert.equal(helper.classifyCaAtendeByRule(phrase).intent,"greeting");
});
for (const phrase of pricePhrases) scenario("intenção","preço: "+phrase,()=>{
  assert.equal(helper.classifyCaAtendeByRule(phrase).intent,"prices");
});
for (const phrase of availabilityPhrases) scenario("intenção","disponibilidade: "+phrase,()=>{
  assert.equal(helper.classifyCaAtendeByRule(phrase).intent,"availability");
});
for (const phrase of bookingPhrases) scenario("intenção","agendamento: "+phrase,()=>{
  assert.equal(helper.classifyCaAtendeByRule(phrase).intent,"booking");
});
for (const phrase of humanPhrases) scenario("intenção","humano: "+phrase,()=>{
  assert.equal(helper.classifyCaAtendeByRule(phrase).intent,"human");
});
for (const phrase of spamPhrases) scenario("intenção","oferta comercial: "+phrase,()=>{
  assert.equal(helper.classifyCaAtendeByRule(phrase).intent,"spam");
});

// 71-120: faixas de horário
const morning=[
  "de manhã","pela manhã","na parte da manhã","manha cedo","quero de manhã",
  "tem algo pela manhã","prefiro na parte da manhã","pode ser manha cedo",
];
const afternoon=[
  "à tarde","a tarde","de tarde","pela tarde","na parte da tarde",
  "depois do almoço","quero à tarde","tem algo de tarde","prefiro pela tarde","pode ser depois do almoço",
];
const night=[
  "à noite","a noite","de noite","pela noite","na parte da noite",
  "quero à noite","tem algo de noite","prefiro pela noite",
];
const before=[
  ["antes das 11","11:00"],["antes de 11","11:00"],["antes das 11h","11:00"],["antes de 10 horas","10:00"],
  ["antes das 14:30","14:30"],["quero antes das 17","17:00"],["tem algo antes de 12h","12:00"],["pode ser antes das 19","19:00"],
];
const after=[
  ["depois das 17","17:00"],["depois de 17","17:00"],["depois das 17h","17:00"],["apos 14","14:00"],
  ["após 14:30","14:30"],["a partir das 17","16:59"],["a partir de 13h","12:59"],["quero depois das 10","10:00"],
];
const between=[
  ["entre 8 e 11","07:59","11:00"],["entre 09 e 12","08:59","12:00"],["entre 10h e 14h","09:59","14:00"],["entre 12 e 17","11:59","17:00"],
  ["entre 13:30 e 17:30","13:29","17:30"],["entre 14 e 18","13:59","18:00"],["entre 15 e 19","14:59","19:00"],["entre 17 e 20","16:59","20:00"],
];
for(const phrase of morning) scenario("faixa","manhã: "+phrase,()=>{
  assert.deepEqual(helper.extractCaAtendeTimeWindow(phrase),{afterTime:"06:59",beforeTime:"12:00"});
});
for(const phrase of afternoon) scenario("faixa","tarde: "+phrase,()=>{
  assert.deepEqual(helper.extractCaAtendeTimeWindow(phrase),{afterTime:"11:59",beforeTime:"18:00"});
});
for(const phrase of night) scenario("faixa","noite: "+phrase,()=>{
  assert.deepEqual(helper.extractCaAtendeTimeWindow(phrase),{afterTime:"17:59",beforeTime:""});
});
for(const [phrase,end] of before) scenario("faixa","antes: "+phrase,()=>{
  assert.deepEqual(helper.extractCaAtendeTimeWindow(phrase),{afterTime:"",beforeTime:end});
});
for(const [phrase,start] of after) scenario("faixa","depois: "+phrase,()=>{
  assert.deepEqual(helper.extractCaAtendeTimeWindow(phrase),{afterTime:start,beforeTime:""});
});
for(const [phrase,start,end] of between) scenario("faixa","entre: "+phrase,()=>{
  assert.deepEqual(helper.extractCaAtendeTimeWindow(phrase),{afterTime:start,beforeTime:end});
});

// 121-200: conversas diretas
const serviceNames=context.services.map(item=>item.name);
const pricePrefixes=["quanto custa","qual valor do","preço do"];
for(const service of serviceNames) for(const prefix of pricePrefixes) scenario("direto",`${prefix} ${service}`,async()=>{
  const [answer]=await chat([`${prefix} ${service}`]);
  assert.equal(answer.dataSource,"services");
  assert.match(answer.reply,new RegExp(service.replace(/[+]/g,"\\+"),"i"));
  assert.doesNotMatch(answer.reply,/Valores da Barbearia Cenários:/);
  assert.equal(globalThis.__caAiCalls,0);
});

const menuCases=[
  ["Ver opções","menu"],["VER OPÇÕES","menu"],["Menu","menu"],["Opcoes","menu"],
  ["Agendar horário","booking_method"],["AGENDAR HORÁRIO","booking_method"],
  ["Agendar pelo link",""],["agendar pelo link",""],
  ["Ver horários disponíveis","awaiting_availability_details"],
  ["Preços e serviços",""],["PREÇOS E SERVIÇOS",""],
  ["Cancelar ou remarcar","cancel_choice"],
  ["Falar com a barbearia","human_takeover"],
  ["Quero ajuda por aqui","awaiting_service"],
  ["quero ajuda por aqui","awaiting_service"],
];
for(const [phrase,state] of menuCases) scenario("direto","ação guiada: "+phrase,async()=>{
  const [answer]=await chat([phrase]);
  assert.equal(answer.state,state);
  assert.equal(globalThis.__caAiCalls,0);
});

const humanDirect=[
  "quero falar com o dono","quero falar com o responsavel","posso falar com uma pessoa",
  "preciso conversar com o proprietario","gostaria de falar com atendente",
  "quero conversar com o barbeiro","falar com o dono por favor","preciso falar com uma pessoa",
  "quero falar com humano","gostaria de conversar com responsavel",
];
for(const phrase of humanDirect) scenario("direto","handoff: "+phrase,async()=>{
  const [answer]=await chat([phrase]);
  assert.equal(answer.handoff,true);
  assert.equal(answer.state,"human_takeover");
});

const barberDirect=[
  ["quero o Eduardo","Eduardo"],["Eduardo","Eduardo"],["pode ser Eduardo","Eduardo"],["prefiro Eduardo","Eduardo"],
  ["quero Davi","Davi"],["Davi","Davi"],["pode ser Davi","Davi"],
  ["quero Kaio","Kaio"],["Kaio","Kaio"],["prefiro Kaio","Kaio"],
];
for(const [phrase,barber] of barberDirect) scenario("direto","seleção de profissional: "+phrase,async()=>{
  const [answer]=await chat([phrase]);
  assert.notEqual(answer.handoff,true);
  assert.equal(answer.memory.barber,barber);
});

for(const phrase of spamPhrases) scenario("direto","silêncio comercial: "+phrase,async()=>{
  const [answer]=await chat([phrase]);
  assert.equal(answer.spam,true);
  assert.equal(answer.reply,"");
  assert.equal(globalThis.__caAiCalls,0);
});

const directBookings=[
  ["quero cortar amanhã às 10 com Eduardo","Corte","Eduardo","10:00"],
  ["quero corte amanhã 17:30 com Davi","Corte","Davi","17:30"],
  ["tem corte amanhã às 9 com Kaio?","Corte","Kaio","09:00"],
  ["quero barba amanhã às 11 com Eduardo","Barba","Eduardo","11:00"],
  ["quero barba amanhã às 14 com Davi","Barba","Davi","14:00"],
  ["quero corte + barba amanhã às 17 com Kaio","Corte + barba","Kaio","17:00"],
  ["tem sobrancelha amanhã às 13 com Eduardo","Sobrancelha","Eduardo","13:00"],
  ["quero pezinho amanhã às 15:30 com Davi","Pezinho","Davi","15:30"],
  ["tem luzes amanhã às 18 com Kaio","Luzes","Kaio","18:00"],
  ["quero pigmentação amanhã às 19 com Eduardo","Pigmentação","Eduardo","19:00"],
  ["quero corte amanhã às 12 com Davi","Corte","Davi","12:00"],
  ["tem barba amanhã às 8 com Kaio","Barba","Kaio","08:00"],
];
for(const [phrase,service,barber,time] of directBookings) scenario("direto","pedido completo: "+phrase,async()=>{
  const [answer]=await chat([phrase]);
  assert.equal(answer.memory.service,service);
  assert.equal(answer.memory.barber,barber);
  assert.equal(answer.memory.time,time);
  assert.equal(answer.state,"awaiting_confirmation");
  assert.equal(answer.dataSource,"agenda");
});

// 201-280: contexto em múltiplas mensagens
const shortTimes=[
  ["10","10:00"],["10h","10:00"],["10 horas","10:00"],["às10","10:00"],["as 10","10:00"],
  ["pelas 10","10:00"],["umas 10","10:00"],["das 10","10:00"],["10:00","10:00"],["10 hs","10:00"],
  ["17","17:00"],["17h","17:00"],["17 horas","17:00"],["às17","17:00"],["as 17","17:00"],
  ["pelas 17","17:00"],["umas 17","17:00"],["das 17","17:00"],["17:00","17:00"],["17 hs","17:00"],
];
for(const [phrase,time] of shortTimes) scenario("contexto","hora curta: "+phrase,async()=>{
  const replies=await chat(["quero corte amanhã com Eduardo",phrase]);
  const answer=replies.at(-1);
  assert.equal(answer.memory.service,"Corte");
  assert.equal(answer.memory.barber,"Eduardo");
  assert.equal(answer.memory.time,time);
  assert.equal(answer.state,"awaiting_confirmation");
  assert.equal(globalThis.__caAiCalls,0);
});

const switchPhrases=[
  "outro profissional","quero outro profissional","tem outro profissional?","pode ser outro profissional",
  "outra pessoa","quero outra pessoa","pode ser outra pessoa","tem outra pessoa",
  "outro barbeiro","quero outro barbeiro","pode ser outro barbeiro","tem outro barbeiro",
  "outra barbeira","pode ser outra barbeira","tem outro","tem outro?",
  "com outro","pode ser com outro","trocar profissional","quero trocar profissional",
];
for(const phrase of switchPhrases) scenario("contexto","troca profissional preserva dados: "+phrase,async()=>{
  const replies=await chat(["quero corte amanhã às 10 com Eduardo",phrase]);
  const first=replies[0], answer=replies[1];
  assert.equal(answer.memory.service,"Corte");
  assert.equal(answer.memory.date,first.memory.date);
  assert.equal(answer.memory.time,"10:00");
  assert.equal(answer.memory.barber,"");
  assert.ok((answer.choices||[]).every(choice=>!choice.startsWith("Eduardo ·")));
  assert.equal(globalThis.__caAiCalls,0);
});

const confirmPhrases=[
  "confirma","confirmar","confirma pra mim","pode marcar","marca pra mim",
  "marque pra mim","quero que voce marque","quero que vc marque","pode agendar","agende pra mim",
  "pode fechar","fecha pra mim","confirma por favor","pode marcar por favor","marca pra mim por favor",
  "quero que vc marque pra mim","pode agendar pra mim","agende pra mim por favor","pode fechar pra mim","confirma esse pra mim",
];
for(const phrase of confirmPhrases) scenario("contexto","confirma sem trocar dados: "+phrase,async()=>{
  const replies=await chat(["quero corte amanhã às 10 com Eduardo",phrase]);
  const first=replies[0], answer=replies[1];
  assert.equal(first.state,"awaiting_confirmation");
  assert.equal(answer.confirmationRequested,true);
  assert.equal(answer.memory.service,"Corte");
  assert.equal(answer.memory.barber,"Eduardo");
  assert.equal(answer.memory.date,first.memory.date);
  assert.equal(answer.memory.time,"10:00");
  assert.equal(answer.source,"rule");
});

const windowConversation=[
  ["de manhã",t=>t<"12:00"],
  ["pela manhã",t=>t<"12:00"],
  ["na parte da manhã",t=>t<"12:00"],
  ["quero de manhã",t=>t<"12:00"],
  ["manha cedo",t=>t<"12:00"],
  ["à tarde",t=>t>="12:00"&&t<"18:00"],
  ["de tarde",t=>t>="12:00"&&t<"18:00"],
  ["pela tarde",t=>t>="12:00"&&t<"18:00"],
  ["na parte da tarde",t=>t>="12:00"&&t<"18:00"],
  ["depois do almoço",t=>t>="12:00"&&t<"18:00"],
  ["à noite",t=>t>="18:00"],
  ["de noite",t=>t>="18:00"],
  ["pela noite",t=>t>="18:00"],
  ["na parte da noite",t=>t>="18:00"],
  ["quero à noite",t=>t>="18:00"],
  ["antes das 11",t=>t<"11:00"],
  ["depois das 17",t=>t>"17:00"],
  ["a partir das 17",t=>t>="17:00"],
  ["entre 12 e 17",t=>t>="12:00"&&t<"17:00"],
  ["entre 14 e 18",t=>t>="14:00"&&t<"18:00"],
];
for(const [phrase,accept] of windowConversation) scenario("contexto","faixa na conversa: "+phrase,async()=>{
  const replies=await chat(["tem corte amanhã?",phrase]);
  const answer=replies.at(-1);
  const times=choiceTimes(answer);
  assert.ok(times.length>0,`sem horários em ${phrase}`);
  assert.ok(times.every(accept),`horários fora da faixa em ${phrase}: ${times.join(",")}`);
  assert.equal(answer.dataSource,"agenda");
  assert.equal(globalThis.__caAiCalls,0);
});

// 281-320: linguagem livre que deve cair na IA, sem deixar a IA inventar dados fora do cadastro.
const slangTemplates=[
  "mano da pra dar um talento no visual amanha com {short} umas {time}",
  "me salva amanha com {short} perto das {time}",
  "preciso ajeitar o visual amanha com {short} pelas {time}",
  "sera q rola aquele grau amanha com {short} umas {time}",
  "to precisando ficar na regua amanha com {short} la pelas {time}",
  "da pra dar um grau amanha com {short} umas {time}",
  "quebra essa pra mim amanha com {short} perto das {time}",
  "queria ajeitar o visual amanha com {short} pelas {time}",
  "tem como dar aquele talento amanha com {short} umas {time}",
  "preciso ficar apresentavel amanha com {short} perto das {time}",
];
const aiPeople=[
  {short:"edu",barber:"Eduardo",time:"10",hh:"10:00"},
  {short:"davi",barber:"Davi",time:"14",hh:"14:00"},
  {short:"kaio",barber:"Kaio",time:"17",hh:"17:00"},
  {short:"edu",barber:"Eduardo",time:"19",hh:"19:00"},
];
for(const template of slangTemplates) for(const person of aiPeople) {
  const phrase=template.replace("{short}",person.short).replace("{time}",person.time);
  scenario("IA","gíria/erro livre: "+phrase,async()=>{
    const aiMap={
      [phrase]:{intent:"booking",date:"",time:person.hh,service:"Corte",barber:person.barber},
    };
    const [answer]=await chat([phrase],context,aiMap);
    assert.ok(globalThis.__caAiCalls>=1);
    assert.equal(answer.source,"ai");
    assert.equal(answer.memory.service,"Corte");
    assert.equal(answer.memory.barber,person.barber);
    assert.equal(answer.memory.time,person.hh);
    assert.notEqual(answer.memory.service,"Pezinho");
  });
}

test("saudação real inclui link público e botão Ver opções sem usar IA",async()=>{
  const [answer]=await chat(["bom dia"]);
  assert.match(answer.reply,/https:\/\/cortouanotou\.com\.br\/agendar\/cenarios/);
  assert.match(answer.reply,/Ver opções/);
  assert.deepEqual(answer.choices,["Ver opções"]);
  assert.equal(globalThis.__caAiCalls,0);
});

test("saudação personalizada também recebe o link se o texto customizado esquecer dele",async()=>{
  const custom={...context,settings:{...context.settings,greetingText:"Olá! Bem-vindo à {barbearia}."}};
  const [answer]=await chat(["bom dia"],custom);
  assert.match(answer.reply,/Olá! Bem-vindo à Barbearia Cenários\./);
  assert.match(answer.reply,/https:\/\/cortouanotou\.com\.br\/agendar\/cenarios/);
});

test("Caderno Mestre contém exatamente 320 cenários automáticos",()=>{
  assert.equal(scenarioCount,320);
});
