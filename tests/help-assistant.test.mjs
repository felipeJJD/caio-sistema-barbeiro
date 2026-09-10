import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

async function load(entry, plugins=[]) {
  const result = await build({entryPoints:[fileURLToPath(new URL(entry,import.meta.url))],bundle:true,write:false,platform:"node",format:"esm",plugins});
  return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
}
const guide = await load("../lib/help-guide.ts");
const reports = await load("../lib/help-reports.ts");
const speech = await load("../lib/help-dictation.ts");
const now = new Date("2026-09-08T12:00:00Z");

test("informal app overview and concrete navigation cover the failing user examples",()=>{
  assert.equal(guide.findGuide("Opa tudo bem tem como você me explicar sobre o corto anotou e o que que ele faz"),"overview");
  assert.equal(guide.findGuide("como registrar um corte"),"register");
  assert.equal(guide.guideReply("subscription",true).destination.section,"Meu plano");
  assert.equal(guide.guideReply("booking",true).destination.tab,"Agendamento público");
  assert.equal(guide.destinationAllowed({section:"Plataforma",label:"admin"},false),false);
  assert.equal(guide.destinationAllowed({section:"Configurações",tab:"Equipe",label:"equipe"},false),false);
  assert.equal(guide.guideReply("commissions",false).destination.section,"Histórico");
});
test("questions never start write workflows; explicit requests still need the UI confirmation",()=>{
  for(const q of ["Como registrar um corte?","Me explica as despesas","Quanto gastei hoje?","Onde agendar?","Qual é minha agenda?"]) assert.equal(guide.requestedHelpAction(q),null,q);
  assert.equal(guide.requestedHelpAction("Registre um corte para o cliente João"),"record");
  assert.equal(guide.requestedHelpAction("Anote uma despesa de 30 reais"),"expense");
});
test("report periods and self/shop scopes are explicit and invalid dates never fall back to today",()=>{
  assert.deepEqual(reports.parseReport("Quanto eu fiz hoje?",true,now),{start:"2026-09-08",end:"2026-09-08",scope:"self",person:null,metric:"summary"});
  assert.equal(reports.parseReport("Quanto a barbearia fez ontem?",true,now).scope,"shop");
  assert.equal(reports.parseReport("Quanto Davi fez hoje?",true,now).person,"Davi");
  assert.equal(reports.parseReport("Quanto eu fiz mês passado?",true,now).end,"2026-08-31");
  assert.equal(reports.parseReport("Quanto fiz essa semana?",true,now).start,"2026-09-07");
  assert.ok(reports.parseReport("Quanto fiz 31/02/2026?",true,now).clarification);
  assert.ok(reports.parseReport("Quanto entrou em Pix?",true,now).clarification);
  assert.equal(reports.parseReport("Como vejo meu faturamento?",true,now),null);
});

const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`CREATE TABLE team (id INTEGER,name TEXT,organization_id INTEGER);
 CREATE TABLE daily_records (organization_id INTEGER,barber_id INTEGER,occurred_at TEXT,quantity INTEGER,value_cents INTEGER,commission_cents INTEGER,tip_cents INTEGER,fee_cents INTEGER);
 CREATE TABLE product_sales (organization_id INTEGER,seller_team_member_id INTEGER,occurred_at TEXT,quantity INTEGER,unit_price_cents INTEGER,unit_cost_cents INTEGER,commission_cents INTEGER,fee_cents INTEGER);
 CREATE TABLE membership_payments (organization_id INTEGER,occurred_at TEXT,amount_cents INTEGER,fee_cents INTEGER);
 CREATE TABLE expenses (organization_id INTEGER,occurred_at TEXT,value_cents INTEGER);
 INSERT INTO team VALUES (1,'Ana',10),(2,'Beto',10),(3,'Carlos',20);
 INSERT INTO daily_records VALUES (10,1,'2026-09-08',1,10000,5000,1000,100),(10,2,'2026-09-08',1,0,1500,0,0),(20,3,'2026-09-08',10,999999,999999,0,0),(10,2,'2026-09-07',1,30000,10000,0,0);
 INSERT INTO product_sales VALUES (10,2,'2026-09-08',2,5000,2000,1000,100),(20,3,'2026-09-08',2,88888,11111,22222,0);
 INSERT INTO membership_payments VALUES (10,'2026-09-08',20000,200),(10,'2026-09-01',30000,0),(20,'2026-09-08',999999,0);
 INSERT INTO expenses VALUES(10,'2026-09-08',2000),(20,'2026-09-08',100000);`);
let sqlCalls = 0;
const database = {
 prepare(sql){ return {sql,args:[],bind(...args){this.args=args;return this;},async all(){sqlCalls++;return {success:true,results:sqlite.prepare(sql).all(...this.args)};}}; },
 async batch(statements){ return Promise.all(statements.map(s=>s.all())); }
};
globalThis.__helpTestEnv = {DB:database};
const dbReports = await load("../db/help-reports.ts",[{name:"test-d1",setup(b){b.onResolve({filter:/^@\/runtime\/env$/},()=>({path:"cloudflare",namespace:"mock"}));b.onLoad({filter:/.*/,namespace:"mock"},()=>({contents:"export const env = globalThis.__helpTestEnv;",loader:"js"}));}}]);
const owner = {organizationId:10,teamMemberId:1,isOwner:true};
const staff = {organizationId:10,teamMemberId:2,isOwner:false};
const query = {start:"2026-09-08",end:"2026-09-08",scope:"shop",metric:"summary",person:null};
test("real SQLite report reconciles memberships, service use, tips, costs and owner's commission without double counting",async()=>{
 const result = await dbReports.readHelpReport(owner,query);
 assert.match(result.answer,/41\.000|410,00/); // 11,000 service + 10,000 products + 20,000 membership cents
 assert.match(result.answer,/26[.,]100|261,00/); // 41,000 - 8,500 payouts - 400 fees - 4,000 costs - 2,000 expenses
 assert.match(result.answer,/Sua comissão: R\$\s*50,00/);
 assert.match(result.answer,/Ana/);assert.match(result.answer,/Beto/);assert.doesNotMatch(result.answer,/Carlos|999\.999/);
});
test("staff reports never query another employee or shop totals",async()=>{
 const callsBefore = sqlCalls;
 const denied = await dbReports.readHelpReport(staff,query);
 assert.match(denied.answer,/somente seus próprios/); assert.equal(sqlCalls,callsBefore);
 const result = await dbReports.readHelpReport(staff,{...query,scope:"self"});
 assert.match(result.answer,/Beto/);assert.match(result.answer,/25,00/);assert.doesNotMatch(result.answer,/Ana|Carlos|Sobra|261,00/);
 const named = await dbReports.readHelpReport(staff,{...query,person:"Ana"});
 assert.match(named.answer,/somente seus próprios/);
});
test("named owner query stays in its tenant and database failure cannot become a zero result",async()=>{
 const result = await dbReports.readHelpReport(owner,{...query,person:"Beto"});
 assert.match(result.answer,/Beto/);assert.doesNotMatch(result.answer,/Ana|Sobra/);
 const other = await dbReports.readHelpReport(owner,{...query,person:"Carlos"});
 assert.match(other.answer,/Não encontrei/);
 const original=database.batch;database.batch=async()=>{throw new Error("offline");};
 try { await assert.rejects(dbReports.readHelpReport(owner,query),/offline/); } finally { database.batch=original; }
});

test("voice permits pauses, ends without an automatic microphone restart and ignores late callbacks",async(t)=>{
 t.mock.timers.enable({apis:["setTimeout"]});
 const instances=[];
 class Recognition { constructor(){instances.push(this);} start(){} stop(){} }
 let text="",active=false;
 const controller=speech.createHelpDictation(Recognition,{text:v=>text=v,listening:v=>active=v,error:()=>{}});
 controller.start("Olá");
 const first=instances[0];
 first.onresult({results:[{0:{transcript:"quanto eu"}}]});
 first.onresult({results:[{0:{transcript:"quanto eu fiz hoje"}}]});
 assert.equal(text,"Olá quanto eu fiz hoje");
 t.mock.timers.tick(10000); assert.equal(active,true);
 const late=first.onresult;
 first.onend();t.mock.timers.tick(400);
 assert.equal(instances.length,1);assert.equal(active,false);
 text="";
 late({results:[{0:{transcript:"texto atrasado"}}]});
 t.mock.timers.tick(40000);assert.equal(text,"");assert.equal(active,false);
});
test("a denied microphone permission stops restart attempts and preserves typed text",async(t)=>{
 t.mock.timers.enable({apis:["setTimeout"]});let instance,starts=0,notice="";
 class Recognition {constructor(){instance=this;}start(){starts++;}stop(){}}
 const controller=speech.createHelpDictation(Recognition,{text:()=>{},listening:()=>{},error:v=>notice=v});
 controller.start("rascunho");instance.onerror({error:"not-allowed"});t.mock.timers.tick(60000);
 assert.equal(starts,1);assert.match(notice,/permissão/);
});
