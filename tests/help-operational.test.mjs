import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

async function load(entry,plugins=[]) {
  const result=await build({entryPoints:[fileURLToPath(new URL(entry,import.meta.url))],bundle:true,write:false,platform:"node",format:"esm",plugins});
  return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
}
const intents=await load("../lib/help-intent.ts");
const actions=await load("../lib/help-actions.ts");
const now=new Date("2026-09-20T12:00:00Z");

test("conversa sobre faturamento altera só data, profissional e métrica explicitamente citados",()=>{
  let query=intents.fallbackHelpIntent("Quanto a barbearia faturou ontem?",null,true,now);
  assert.deepEqual({tool:query.tool,start:query.start,scope:query.scope,metric:query.metric},{tool:"get_revenue",start:"2026-09-19",scope:"shop",metric:"summary"});
  query=intents.fallbackHelpIntent("E sexta?",query,true,now);
  assert.deepEqual({tool:query.tool,start:query.start,scope:query.scope,metric:query.metric},{tool:"get_revenue",start:"2026-09-18",scope:"shop",metric:"summary"});
  query=intents.fallbackHelpIntent("E o Davi?",query,true,now);
  assert.deepEqual({person:query.person,start:query.start,metric:query.metric},{person:"Davi",start:"2026-09-18",metric:"summary"});
  query=intents.fallbackHelpIntent("Agora o Eduardo.",query,true,now);
  assert.equal(query.person,"Eduardo");
  const month=intents.fallbackHelpIntent("Quanto o Davi fez esse mês?",null,true,now);
  assert.equal(intents.fallbackHelpIntent("E o Eduardo?",month,true,now).start,"2026-09-01");
  assert.equal(intents.fallbackHelpIntent("Quantos reais eu fiz na sexta?",null,true,now).metric,"summary");
  const agenda=intents.fallbackHelpIntent("Agenda hoje",null,true,now);
  assert.equal(intents.fallbackHelpIntent("Quanto a barbearia faturou ontem?",agenda,true,now).tool,"get_revenue");
  const revenue=intents.fallbackHelpIntent("Quanto a barbearia faturou hoje?",null,true,now);
  const analysis=intents.fallbackHelpIntent("E o que você acha desse faturamento? Você acha que tá bom?",revenue,true,now);
  assert.equal(analysis.tool,"analyze_performance");
  assert.equal(analysis.start,revenue.start);assert.equal(analysis.end,revenue.end);assert.equal(analysis.scope,"shop");
});

test("agenda mantém domínio de appointments entre cinco turnos e aceita áudio coloquial",()=>{
  let intent=intents.fallbackHelpIntent("Quais são os agendamentos de hoje?",null,true,now);
  assert.equal(intent.tool,"get_appointments");
  intent=intents.fallbackHelpIntent("Me mostra os horários",intent,true,now);
  intent=intents.fallbackHelpIntent("Só do Davi",intent,true,now);
  assert.equal(intent.person,"Davi");
  intent=intents.fallbackHelpIntent("Depois das três",intent,true,now);
  assert.equal(intent.afterTime,"15:00");
  intent=intents.fallbackHelpIntent("Agora todos",intent,true,now);
  assert.deepEqual({tool:intent.tool,date:intent.start,person:intent.person,after:intent.afterTime},{tool:"get_appointments",date:"2026-09-20",person:"",after:"15:00"});
  assert.equal(intents.fallbackHelpIntent("Quem é meu próximo cliente?",null,false,now).tool,"get_next_appointment");
  assert.equal(intents.fallbackHelpIntent("Tem horário livre amanhã?",null,true,now).tool,"get_available_slots");
  assert.equal(intents.fallbackHelpIntent("Tem alguém marcado às 17?",null,true,now).atTime,"17:00");
  assert.equal(intents.fallbackHelpIntent("Meu cliente não consegue agendar",null,true,now).tool,"diagnose_booking_problem");
  assert.equal(intents.fallbackHelpIntent("Como mando meu link pro cliente?",null,true,now).tool,"get_public_booking_status");
});

test("contexto serializado só aceita ferramenta, datas e horários válidos",()=>{
  const intent=intents.fallbackHelpIntent("Como está a agenda hoje?",null,true,now);
  assert.equal(intent.tool,"get_appointments");
  const valid=intents.fallbackHelpIntent("Agenda hoje",null,true,now);
  assert.deepEqual(intents.lastHelpIntent([{role:"assistant",content:intents.helpIntentContext(valid)}]),valid);
  assert.equal(intents.normalizeHelpIntent({...valid,tool:"free_sql"}),null);
  assert.equal(intents.normalizeHelpIntent({...valid,afterTime:"15:99"}),null);
  assert.equal(intents.normalizeHelpIntent({...valid,atTime:"99:00"}),null);
  assert.equal(intents.normalizeHelpIntent({...valid,end:"2028-12-31"}),null);
  const wrongModel={...valid,tool:"get_revenue",start:"2026-09-19",end:"2026-09-19"};
  const repaired=intents.reconcileHelpIntent("Como está a agenda hoje?",wrongModel,true,now);
  assert.equal(repaired.tool,"get_appointments");assert.equal(repaired.start,"2026-09-20");
  const guessed={...valid,tool:"get_revenue",scope:"shop",person:"",metric:"count"};
  const corrected=intents.reconcileHelpIntent("Quantos reais o Davi fez mês passado?",guessed,true,now);
  assert.equal(corrected.tool,"get_employee_results");assert.equal(corrected.person,"Davi");
  assert.equal(corrected.scope,"self");assert.equal(corrected.metric,"summary");
});

test("correção de proposta conserva o serviço e não executa ação",()=>{
  const proposed=actions.parseHelpAction("Muda o corte para 35 minutos",true).action;
  assert.equal(proposed.priceCents,0);
  const revised=actions.revisePendingHelpAction(proposed,"Na verdade coloca 40");
  assert.equal(revised.target,proposed.target);
  assert.equal(revised.durationMinutes,40);
  assert.equal(proposed.durationMinutes,35);
  assert.equal(actions.revisePendingHelpAction(proposed,"quanto a barbearia faturou?"),null);
});

test("interpretação usa uma chamada com catálogo fechado e recusa função não autorizada",async()=>{
  const model=await load("../lib/help-model.ts",[{name:"model-env",setup(b){
    b.onResolve({filter:/^@\/runtime\/env$/},()=>({path:"model-env",namespace:"mock"}));
    b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const env={OPENAI_API_KEY:'test-only'};",loader:"js"}));
  }}]);
  const original=globalThis.fetch;
  let calls=0,toolNames=[];
  const sample={kind:"tool",tool_id:"get_appointments",topic:"",answer:"",start:"2026-09-20",end:"2026-09-20",scope:"self",metric:"summary",person:"",after_time:"15:00",at_time:"",service:"",client:"",action:{kind:"none",mode:"",target:"",name:"",serviceName:"",priceCents:0,durationMinutes:0,monthlyValueCents:0,maxUses:0,barberPayoutCents:0,feeBps:0,useServiceDuration:"",scheduleChanges:[],summary:""}};
  globalThis.fetch=async(_url,options)=>{
    calls++;
    const sent=JSON.parse(options.body);
    toolNames=sent.text.format.schema.properties.tool_id.enum;
    assert.match(sent.instructions,/appointments/);
    return {ok:true,json:async()=>({status:"completed",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(sample)}]}]})};
  };
  try {
    const messages=[{role:"user",content:"Quais são meus horários depois das 15?"}];
    const parsed=await model.interpretHelp(messages,false);
    assert.equal(parsed.kind,"tool");assert.equal(parsed.intent.afterTime,"15:00");assert.equal(calls,1);
    assert.ok(toolNames.includes("get_appointments"));assert.ok(!toolNames.includes("run_sql"));
    sample.tool_id="run_sql";
    assert.equal(await model.interpretHelp(messages,false),null);
  } finally {globalThis.fetch=original;}
});

const sqlite=new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE organizations (id INTEGER,name TEXT,slug TEXT,public_booking_enabled INTEGER,public_booking_requires_approval INTEGER,opening_time TEXT,closing_time TEXT,public_booking_weekdays TEXT,weekly_booking_hours TEXT,status TEXT,status_before_block TEXT,trial_ends_at TEXT,booking_pix_enabled INTEGER,booking_cash_enabled INTEGER,booking_debit_enabled INTEGER,booking_credit_enabled INTEGER,deleted_at TEXT);
CREATE TABLE team(id INTEGER,name TEXT,organization_id INTEGER,active INTEGER,weekly_booking_hours TEXT);
CREATE TABLE services(id INTEGER,name TEXT,organization_id INTEGER,active INTEGER,deleted_at TEXT,price_cents INTEGER,duration_minutes INTEGER);
CREATE TABLE appointments(id INTEGER,organization_id INTEGER,appointment_date TEXT,appointment_time TEXT,client_name TEXT,service_id INTEGER,barber_id INTEGER,status TEXT);
CREATE TABLE daily_records(id INTEGER,organization_id INTEGER,occurred_at TEXT,client_name TEXT,barber_id INTEGER,value_cents INTEGER,tip_cents INTEGER DEFAULT 0,quantity INTEGER DEFAULT 1,created_at TEXT);
CREATE TABLE product_sales(id INTEGER,organization_id INTEGER,occurred_at TEXT,seller_team_member_id INTEGER,quantity INTEGER,unit_price_cents INTEGER,created_at TEXT);
CREATE TABLE membership_payments(id INTEGER,organization_id INTEGER,occurred_at TEXT,amount_cents INTEGER,created_at TEXT);
INSERT INTO organizations VALUES (10,'Kaio Barbearia','kaio',1,1,'08:00','19:00','1,2,3,4,5,6','', 'active',NULL,NULL,0,1,1,1,NULL),(20,'Outra','outra',1,1,'08:00','19:00','1,2,3,4,5,6','', 'active',NULL,NULL,0,1,1,1,NULL);
INSERT INTO team VALUES (1,'Kaio',10,1,''),(2,'Davi',10,1,''),(3,'Eduardo',10,1,''),(4,'Pessoa externa',20,1,'');
INSERT INTO services VALUES (1,'Corte',10,1,NULL,3000,30),(2,'Corte',20,1,NULL,999999,30);
INSERT INTO appointments VALUES (11,10,'2026-09-20','09:00','João',1,2,'Agendado'),(12,10,'2026-09-20','16:00','Carlos',1,3,'Aguardando'),(13,10,'2026-09-20','17:00','Ana',1,2,'Cancelado'),(14,20,'2026-09-20','18:00','Vazamento',2,4,'Agendado');
INSERT INTO daily_records (id,organization_id,occurred_at,client_name,barber_id,value_cents,tip_cents,quantity,created_at) VALUES
(21,10,'2026-09-20','João',2,3000,0,1,'2026-09-20 10:00:00'),
(22,20,'2026-09-20','Vazamento',4,999999,0,1,'2026-09-20 10:00:00'),
(31,10,'2026-09-13','A',2,10000,0,2,'2026-09-13 10:00:00'),
(32,10,'2026-09-06','B',2,9000,0,2,'2026-09-06 10:00:00'),
(33,10,'2026-08-30','C',2,11000,0,3,'2026-08-30 10:00:00'),
(34,10,'2026-08-23','D',2,10000,0,2,'2026-08-23 10:00:00');`);
let calls=0;
const db={prepare(sql){return {sql,args:[],bind(...args){this.args=args;return this;},async all(){calls++;return {success:true,results:sqlite.prepare(sql).all(...this.args)};}};}};
globalThis.__operationalTestEnv={DB:db};
const tools=await load("../db/help-tools.ts",[{name:"mock-d1",setup(b){
  b.onResolve({filter:/^@\/runtime\/env$/},()=>({path:"mock",namespace:"mock"}));
  b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const env=globalThis.__operationalTestEnv;",loader:"js"}));
}}]);
const owner={organizationId:10,teamMemberId:1,isOwner:true,name:"Kaio"};
const staff={organizationId:10,teamMemberId:2,isOwner:false,name:"Davi"};
const intent=intents.fallbackHelpIntent("Agenda hoje",null,true,now);
test("appointments é consultado realmente; exclui cancelados, dados de outros tenants e segue horário",async()=>{
  const all=await tools.executeHelpTool(owner,intent);
  assert.match(all.answer,/2 agendamentos/);
  assert.match(all.answer,/João/);assert.match(all.answer,/Carlos/);
  assert.doesNotMatch(all.answer,/Vazamento|Ana|999999/);
  const after=await tools.executeHelpTool(owner,{...intent,afterTime:"15:00"});
  assert.match(after.answer,/Carlos/);assert.doesNotMatch(after.answer,/João/);
  const edu=await tools.executeHelpTool(owner,{...intent,person:"Eduardo",scope:"self"});
  assert.match(edu.answer,/Carlos/);assert.doesNotMatch(edu.answer,/João/);
  const atFour=await tools.executeHelpTool(owner,{...intent,atTime:"16:00"});
  assert.match(atFour.answer,/Carlos/);assert.doesNotMatch(atFour.answer,/João/);
  const atFive=await tools.executeHelpTool(owner,{...intent,atTime:"17:00"});
  assert.match(atFive.answer,/Não encontrei/);
});
test("pergunta de opinião sobre faturamento vira análise comparativa, não relatório repetido",async()=>{
  const analysis=intents.fallbackHelpIntent("Você acha que esse faturamento tá bom?",intents.fallbackHelpIntent("Quanto a barbearia faturou hoje?",null,true,now),true,now);
  const result=await tools.executeHelpTool(owner,analysis);
  assert.match(result.answer,/R\$\s*30,00|R\$ 30,00/);
  assert.match(result.answer,/histórico|média|ritmo/i);
  assert.doesNotMatch(result.answer,/Sobra da barbearia/);
  assert.equal(result.contextMessage.includes('"tool":"analyze_performance"'),true);
});
test("funcionário não recebe equipe nem colega, nem via troca de tool",async()=>{
  const before=calls;
  const denied=await tools.executeHelpTool(staff,intent);
  assert.match(denied.answer,/somente seus próprios/);assert.equal(calls,before);
  const named=await tools.executeHelpTool(staff,{...intent,person:"Eduardo",scope:"self"});
  assert.match(named.answer,/somente seus próprios/);assert.equal(calls,before);
  const mine=await tools.executeHelpTool(staff,{...intent,scope:"self"});
  assert.match(mine.answer,/João/);assert.doesNotMatch(mine.answer,/Carlos|Vazamento/);
  const records=await tools.executeHelpTool(staff,{...intent,tool:"get_recent_records",scope:"self"});
  assert.match(records.answer,/João/);assert.doesNotMatch(records.answer,/Vazamento/);
  const catalog=await tools.executeHelpTool(staff,{...intent,tool:"get_services"});
  assert.match(catalog.answer,/Corte/);assert.doesNotMatch(catalog.answer,/999999/);
});
test("diagnóstico usa a configuração do tenant da sessão, sem revelar outra barbearia",async()=>{
  const result=await tools.executeHelpTool(owner,{...intent,tool:"get_public_booking_status"});
  assert.match(result.answer,/\/agendar\/kaio/);assert.doesNotMatch(result.answer,/outra/);
  assert.equal(result.action.kind,"public-booking-link");
  const missingService=await tools.executeHelpTool(owner,{...intent,tool:"get_available_slots"});
  assert.match(missingService.answer,/Qual serviço/);
  sqlite.exec("UPDATE organizations SET public_booking_enabled = 0 WHERE id = 10");
  try {
    const blocked=await tools.executeHelpTool(owner,{...intent,tool:"diagnose_booking_problem"});
    assert.match(blocked.answer,/link público está desligado/);
  } finally {sqlite.exec("UPDATE organizations SET public_booking_enabled = 1 WHERE id = 10");}
});
