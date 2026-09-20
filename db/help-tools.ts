import type { AccessContext } from "./access";
import { appDate, appTimeMinutes } from "../lib/app-date";
import { bookingHoursForDate, parseTeamWeeklyBookingHours, parseWeeklyBookingHours } from "../lib/booking-hours";
import { parseBookingWeekdays } from "../lib/booking-weekdays";
import { normalizeHelp, type HelpReply } from "../lib/help-guide";
import { helpIntentContext, type HelpIntent } from "../lib/help-intent";
import { readHelpReport } from "./help-reports";
import { formatClientReturnReply, readClientReturnOpportunities } from "./help-insights";
import { getPublicBookingSlots } from "./public-booking";
import type { AssistantProfile } from "./assistant-profile";

type Result<T> = { success: boolean; results: T[] };
type Statement = { bind(...args: Array<string | number | null>): Statement; all<T>(): Promise<Result<T>> };
type Database = { prepare(sql: string): Statement };
const money = (cents:number) => new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(cents/100);
const dateLabel = (date:string) => date.split("-").reverse().join("/");
const deny = (subject="dados dos outros profissionais") => ({answer:`No seu acesso posso consultar somente seus próprios dados, não ${subject}.`});
const noMember = {answer:"Não encontrei esse profissional nesta barbearia. Confira o nome cadastrado."};

async function database():Promise<Database> {
  const {env} = await import("@/runtime/env");
  const db=(env as unknown as {DB?:Database}).DB;
  if (!db) throw new Error("Dados indisponíveis.");
  return db;
}
async function rows<T>(db:Database, sql:string, ...params:Array<string|number|null>):Promise<T[]> {
  const result=await db.prepare(sql).bind(...params).all<T>();
  if (!result.success) throw new Error("Consulta incompleta.");
  return result.results;
}

type Member = {id:number;name:string;active:number;weekly_booking_hours:string};
async function resolveMember(db:Database, access:AccessContext, person:string):Promise<Member|null> {
  if (!access.isOwner && person) return null;
  if (!access.isOwner) return (await rows<Member>(db,"SELECT id,name,active,weekly_booking_hours FROM team WHERE organization_id = ? AND id = ?",access.organizationId,access.teamMemberId))[0]??null;
  if (!person) return null;
  const members=await rows<Member>(db,"SELECT id,name,active,weekly_booking_hours FROM team WHERE organization_id = ?",access.organizationId);
  const name=normalizeHelp(person);
  const exact=members.filter(m=>normalizeHelp(m.name)===name);
  if (exact.length===1) return exact[0];
  const first=members.filter(m=>normalizeHelp(m.name).split(" ")[0]===name);
  return first.length===1 ? first[0] : null;
}

type Shop = {id:number;name:string;slug:string;public_booking_enabled:number;public_booking_requires_approval:number;opening_time:string;closing_time:string;public_booking_weekdays:string;weekly_booking_hours:string;status:string;status_before_block:string|null;trial_ends_at:string|null;booking_pix_enabled:number;booking_cash_enabled:number;booking_debit_enabled:number;booking_credit_enabled:number};
async function shopSettings(db:Database, access:AccessContext):Promise<Shop> {
  const shop=(await rows<Shop>(db,`SELECT id,name,slug,public_booking_enabled,public_booking_requires_approval,opening_time,closing_time,public_booking_weekdays,weekly_booking_hours,status,status_before_block,trial_ends_at,booking_pix_enabled,booking_cash_enabled,booking_debit_enabled,booking_credit_enabled FROM organizations WHERE id = ? AND deleted_at IS NULL`,access.organizationId))[0];
  if (!shop) throw new Error("Barbearia não encontrada.");
  return shop;
}

function context(reply:HelpReply, intent:HelpIntent):HelpReply { return {...reply,contextMessage:helpIntentContext(intent)}; }

export async function executeHelpTool(access:AccessContext, intent:HelpIntent, profile?:AssistantProfile):Promise<HelpReply> {
  const publicCatalog=new Set(["get_services","get_payment_methods","get_products","get_public_booking_status","diagnose_booking_problem"]);
  if (!access.isOwner && (intent.person || (intent.scope==="shop" && !publicCatalog.has(intent.tool)))) return deny();
  const staffId=access.isOwner ? null : access.teamMemberId;
  const db=await database();
  const member=intent.person ? await resolveMember(db,access,intent.person) : null;
  if (intent.person && !member) return noMember;
  const memberId=member?.id??(intent.scope==="self"?access.teamMemberId:null);
  const name=member?.name??(intent.scope==="self"?access.name:"a barbearia");
  const reply=(result:HelpReply)=>context(result,intent);

  switch(intent.tool) {
    case "get_revenue": case "get_employee_results": case "get_financial_summary": case "get_commission_breakdown": {
      if (intent.tool==="get_financial_summary" && !access.isOwner) return deny("o financeiro da barbearia");
      const scope=intent.tool==="get_financial_summary"?"shop":intent.tool==="get_employee_results"||intent.tool==="get_commission_breakdown"?"self":intent.scope;
      const result=await readHelpReport(access,{start:intent.start,end:intent.end,scope,metric:intent.tool==="get_commission_breakdown"?"summary":intent.metric,person:intent.person||null},profile);
      if (intent.tool!=="get_commission_breakdown") return reply(result);
      const id=memberId??access.teamMemberId;
      const payments=await rows<{kind:string;amount:number}>(db,`SELECT kind, COALESCE(SUM(value_cents),0) AS amount FROM team_payments WHERE organization_id = ? AND team_member_id = ? AND occurred_at BETWEEN ? AND ? GROUP BY kind`,access.organizationId,id,intent.start,intent.end);
      const breakdown=payments.length?payments.map(row=>`${row.kind}: ${money(Number(row.amount))}`).join("\n"):"Sem vales ou pagamentos registrados nesse período.";
      return reply({...result,answer:`${result.answer}\nOs valores de comissão são gerados pelos registros; pagamentos e vales são lançamentos separados.`,details:`${"details" in result?result.details??"":""}\nVales e pagamentos registrados:\n${breakdown}`.trim()});
    }
    case "get_appointments": case "get_next_appointment": {
      const afterTime=intent.tool==="get_next_appointment"&&intent.start===appDate()?`${String(Math.floor(appTimeMinutes()/60)).padStart(2,"0")}:${String(appTimeMinutes()%60).padStart(2,"0")}`:intent.afterTime;
      const totals=await rows<{total:number}>(db,`SELECT COUNT(*) AS total FROM appointments WHERE organization_id = ? AND appointment_date BETWEEN ? AND ? AND status <> 'Cancelado' AND (? IS NULL OR barber_id = ?) AND (? = '' OR appointment_time >= ?) AND (? = '' OR appointment_time = ?) AND (? = '' OR lower(client_name) LIKE ?)`,access.organizationId,intent.start,intent.end,memberId,memberId,afterTime,afterTime,intent.atTime,intent.atTime,intent.client,`%${intent.client.toLowerCase()}%`);
      const items=await rows<{appointment_date:string;appointment_time:string;client_name:string;service_name:string;barber_name:string;status:string}>(db,`SELECT a.appointment_date,a.appointment_time,a.client_name,COALESCE(s.name,'Serviço removido') AS service_name,COALESCE(t.name,'Profissional removido') AS barber_name,a.status FROM appointments a LEFT JOIN services s ON s.id=a.service_id AND s.organization_id=a.organization_id LEFT JOIN team t ON t.id=a.barber_id AND t.organization_id=a.organization_id WHERE a.organization_id = ? AND a.appointment_date BETWEEN ? AND ? AND a.status <> 'Cancelado' AND (? IS NULL OR a.barber_id = ?) AND (? = '' OR a.appointment_time >= ?) AND (? = '' OR a.appointment_time = ?) AND (? = '' OR lower(a.client_name) LIKE ?) ORDER BY a.appointment_date,a.appointment_time,a.id LIMIT 25`,access.organizationId,intent.start,intent.end,memberId,memberId,afterTime,afterTime,intent.atTime,intent.atTime,intent.client,`%${intent.client.toLowerCase()}%`);
      const total=Number(totals[0]?.total??0);
      if (!total) return reply({answer:`Não encontrei agendamentos ${intent.start===intent.end?"em "+dateLabel(intent.start):"de "+dateLabel(intent.start)+" a "+dateLabel(intent.end)} para ${name}${intent.atTime?` às ${intent.atTime}`:afterTime?` depois de ${afterTime}`:""}. Isso não conta atendimentos já realizados.`,destination:{section:"Agenda",label:"Abrir Agenda"}});
      const lines=items.map(a=>`${a.appointment_date===intent.start&&intent.start===intent.end?"":dateLabel(a.appointment_date)+" · "}${a.appointment_time} — ${a.client_name} — ${a.service_name} — ${a.barber_name}${a.status==="Agendado"?"":` (${a.status})`}`);
      return reply({answer:intent.tool==="get_next_appointment"?`Próximo cliente de ${name}: ${lines[0]}.`:`${total} agendamento${total===1?"":"s"} para ${name}${afterTime?` a partir das ${afterTime}`:""} ${intent.start===intent.end?"em "+dateLabel(intent.start):"no período solicitado"}.\n${lines.slice(0,5).join("\n")}`,details:intent.tool!=="get_next_appointment"&&lines.length>5?`${lines.slice(5).join("\n")}${total>25?"\nMostrando os primeiros 25 horários.":""}`:undefined,destination:{section:"Agenda",label:"Abrir Agenda"}});
    }
    case "get_recent_records": {
      const items=await rows<{occurred_at:string;client_name:string;name:string;value_cents:number}>(db,`SELECT d.occurred_at,d.client_name,COALESCE(t.name,'Profissional removido') AS name,d.value_cents FROM daily_records d LEFT JOIN team t ON t.id=d.barber_id AND t.organization_id=d.organization_id WHERE d.organization_id = ? AND d.occurred_at BETWEEN ? AND ? AND (? IS NULL OR d.barber_id = ?) ORDER BY d.occurred_at DESC,d.id DESC LIMIT 20`,access.organizationId,intent.start,intent.end,memberId,memberId);
      return reply(items.length?{answer:`Encontrei ${items.length}${items.length===20?" ou mais":""} atendimentos registrados para ${name} nesse período.\n${items.slice(0,5).map(r=>`${dateLabel(r.occurred_at)} — ${r.client_name} — ${r.name} — ${money(r.value_cents)}`).join("\n")}`,details:items.slice(5).map(r=>`${dateLabel(r.occurred_at)} — ${r.client_name} — ${r.name} — ${money(r.value_cents)}`).join("\n")||undefined,destination:{section:"Histórico",label:"Abrir Histórico"}}:{answer:`Não achei atendimentos registrados para ${name} no período solicitado. Confira a data e o profissional; se alguém acabou de registrar, peça para confirmar se o salvamento terminou.`,destination:{section:"Histórico",label:"Abrir Histórico"}});
    }
    case "get_client_return_opportunities": return reply(formatClientReturnReply(await readClientReturnOpportunities(access)));
    case "get_services": {
      const items=await rows<{name:string;price_cents:number;duration_minutes:number;active:number}>(db,"SELECT name,price_cents,duration_minutes,active FROM services WHERE organization_id = ? AND deleted_at IS NULL ORDER BY active DESC,name LIMIT 40",access.organizationId);
      return reply({answer:items.length?`${items.length} serviço${items.length===1?"":"s"} cadastrado${items.length===1?"":"s"}.\n${items.slice(0,5).map(s=>`${s.name}: ${money(s.price_cents)} · ${s.duration_minutes} min${s.active?"":" · inativo"}`).join("\n")}`:"Não há serviços cadastrados para esta barbearia.",details:items.length>5?items.slice(5).map(s=>`${s.name}: ${money(s.price_cents)} · ${s.duration_minutes} min${s.active?"":" · inativo"}`).join("\n"):undefined,...(access.isOwner?{destination:{section:"Configurações",tab:"Serviços",label:"Configurar serviços"}}:{})});
    }
    case "get_payment_methods": {
      const items=await rows<{name:string;fee_bps:number}>(db,"SELECT name,fee_bps FROM payment_methods WHERE organization_id = ? ORDER BY name",access.organizationId);
      return reply({answer:items.length?items.map(p=>`${p.name}: taxa de ${(p.fee_bps/100).toLocaleString("pt-BR")}%.`).join("\n"):"Nenhuma forma de pagamento configurada."});
    }
    case "get_monthly_members": {
      if (!access.isOwner) return deny("os mensalistas da barbearia");
      const items=await rows<{name:string;due_date:string;balance:number;status:string}>(db,"SELECT name,due_date,balance,status FROM clients WHERE organization_id = ? AND deleted_at IS NULL AND status = 'Ativo' ORDER BY due_date,name LIMIT 30",access.organizationId);
      return reply({answer:`${items.length}${items.length===30?" ou mais":""} mensalista${items.length===1?"":"s"} ativo${items.length===1?"":"s"}.`,details:items.map(c=>`${c.name}: ${c.balance} uso(s) · vence ${dateLabel(c.due_date)}`).join("\n")||undefined,destination:{section:"Mensalistas",label:"Abrir Mensalistas"}});
    }
    case "get_products": {
      const items=await rows<{name:string;stock_quantity:number;price_cents:number}>(db,"SELECT name,stock_quantity,price_cents FROM shop_products WHERE organization_id = ? AND deleted_at IS NULL AND active = 1 ORDER BY name LIMIT 40",access.organizationId);
      return reply({answer:items.length?`${items.length} produto${items.length===1?"":"s"} ativo${items.length===1?"":"s"}.\n${items.slice(0,5).map(p=>`${p.name}: ${money(p.price_cents)} · estoque ${p.stock_quantity}`).join("\n")}`:"Nenhum produto ativo cadastrado.",details:items.slice(5).map(p=>`${p.name}: ${money(p.price_cents)} · estoque ${p.stock_quantity}`).join("\n")||undefined,destination:{section:"Produtos",label:"Abrir Produtos"}});
    }
    case "get_team_schedule": {
      const shop=await shopSettings(db,access);
      const shopHours=parseWeeklyBookingHours(shop.weekly_booking_hours,parseBookingWeekdays(shop.public_booking_weekdays),shop.opening_time,shop.closing_time);
      const members=await rows<Member>(db,"SELECT id,name,active,weekly_booking_hours FROM team WHERE organization_id = ? AND (? IS NULL OR id = ?) ORDER BY name",access.organizationId,memberId??staffId,memberId??staffId);
      const weekdays=["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
      return reply({answer:members.length?`Expediente cadastrado:\n${members.slice(0,3).map(m=>`${m.name}: ${parseTeamWeeklyBookingHours(m.weekly_booking_hours,shopHours).filter(h=>h.enabled).map(h=>`${weekdays[h.day]} ${h.openingTime}–${h.closingTime}`).join(", ")||"sem dias ativos"}`).join("\n")}`:"Não encontrei profissional no acesso atual.",details:members.slice(3).map(m=>`${m.name}: ${parseTeamWeeklyBookingHours(m.weekly_booking_hours,shopHours).filter(h=>h.enabled).map(h=>`${weekdays[h.day]} ${h.openingTime}–${h.closingTime}`).join(", ")||"sem dias ativos"}`).join("\n")||undefined});
    }
    case "get_public_booking_status": case "diagnose_booking_problem": {
      const shop=await shopSettings(db,access);
      const link=`/agendar/${encodeURIComponent(shop.slug)}`;
      const issues:string[]=[];
      if (!shop.public_booking_enabled) issues.push("o link público está desligado");
      if (shop.status_before_block || shop.status==="blocked" || shop.status==="deleted") issues.push("o acesso à barbearia está bloqueado");
      if (shop.trial_ends_at && Date.parse(shop.trial_ends_at)<=Date.now()) issues.push("o acesso ao plano expirou");
      const hours=parseWeeklyBookingHours(shop.weekly_booking_hours,parseBookingWeekdays(shop.public_booking_weekdays),shop.opening_time,shop.closing_time);
      const today=bookingHoursForDate(hours,intent.start);
      if (!today?.enabled) issues.push(`a barbearia está fechada em ${dateLabel(intent.start)}`);
      const activeServices=await rows<{count:number}>(db,"SELECT COUNT(*) AS count FROM services WHERE organization_id = ? AND active = 1 AND deleted_at IS NULL",access.organizationId);
      if (!activeServices[0]?.count) issues.push("não há serviços ativos para os clientes escolherem");
      const invalidServices=await rows<{count:number}>(db,"SELECT COUNT(*) AS count FROM services WHERE organization_id = ? AND active = 1 AND deleted_at IS NULL AND duration_minutes < 5",access.organizationId);
      if (invalidServices[0]?.count) issues.push("há serviço ativo com duração inválida");
      if (!issues.length && intent.service && intent.start>=appDate()) {
        const found=await rows<{id:number;name:string}>(db,"SELECT id,name FROM services WHERE organization_id = ? AND active = 1 AND deleted_at IS NULL",access.organizationId);
        const selected=found.filter(s=>normalizeHelp(s.name)===normalizeHelp(intent.service));
        if (selected.length!==1) issues.push(`o serviço ${intent.service} não foi encontrado entre os ativos`);
        else {
          try {
            const slots=await getPublicBookingSlots(shop.slug,intent.start,selected[0].id,memberId??0);
            if (!slots.length) issues.push(`não há vagas livres para ${selected[0].name} em ${dateLabel(intent.start)}${member?` com ${member.name}`:""}`);
          } catch { issues.push("não consegui conferir as vagas para esse dia e serviço"); }
        }
      }
      const barbers=await rows<Member>(db,"SELECT id,name,active,weekly_booking_hours FROM team WHERE organization_id = ? AND active = 1",access.organizationId);
      const available=barbers.filter(m=>bookingHoursForDate(parseTeamWeeklyBookingHours(m.weekly_booking_hours,hours),intent.start)?.enabled);
      if (!available.length) issues.push(`nenhum profissional atende em ${dateLabel(intent.start)}`);
      const intro=intent.tool==="diagnose_booking_problem"?"Conferi a configuração do agendamento público.":"Este é o link público da sua barbearia:";
      const result=issues.length?`${intro} Encontrei: ${issues.join("; ")}.`:`${intro} O link está ativo, há serviços e profissionais com expediente em ${dateLabel(intent.start)}. Se o cliente não vir horários, preciso saber dia, profissional e serviço para conferir as vagas.`;
      return reply({answer:`${result}\nLink: ${link}${shop.public_booking_requires_approval?"\nPedidos ficam aguardando confirmação.":""}`,destination:{section:access.isOwner?"Configurações":"Agenda",...(access.isOwner?{tab:"Agendamento público"}:{}),label:access.isOwner?"Configurar agendamento público":"Abrir Agenda"},...(intent.tool==="get_public_booking_status"?{action:{kind:"public-booking-link",mode:"",target:"",name:"",serviceName:"",priceCents:0,durationMinutes:0,monthlyValueCents:0,maxUses:0,barberPayoutCents:0,feeBps:0,useServiceDuration:"",scheduleChanges:[],summary:"Abrir o link público"}}:{})});
    }
    case "get_available_slots": {
      const shop=await shopSettings(db,access);
      if (intent.start!==intent.end || intent.start<appDate()) return reply({answer:"Para conferir vagas reais, informe um único dia de hoje em diante e o serviço desejado."});
      const services=await rows<{id:number;name:string;duration_minutes:number}>(db,"SELECT id,name,duration_minutes FROM services WHERE organization_id = ? AND active = 1 AND deleted_at IS NULL",access.organizationId);
      const service=services.filter(s=>normalizeHelp(s.name)===normalizeHelp(intent.service));
      if (service.length!==1) return reply({answer:`Qual serviço o cliente quer? A duração muda as vagas. ${services.length?`Serviços ativos: ${services.map(s=>s.name).join(", ")}.`:"Ainda não há serviços ativos."}`});
      if (service[0].duration_minutes<5) return reply({answer:`O serviço ${service[0].name} está sem uma duração válida. Peça ao proprietário para conferir esse campo em Configurações > Serviços.`});
      let slots:Awaited<ReturnType<typeof getPublicBookingSlots>>=[];
      try { slots=await getPublicBookingSlots(shop.slug,intent.start,service[0].id,memberId??0); }
      catch (error) { return reply({answer:error instanceof Error?error.message:"Não consegui consultar as vagas agora."}); }
      const label=`${service[0].name} em ${dateLabel(intent.start)}${member?` com ${member.name}`:""}`;
      return reply({answer:slots.length?`${slots.length} horário${slots.length===1?"":"s"} livre${slots.length===1?"":"s"} para ${label}.`:`Nenhum horário livre para ${label}.`,details:slots.map(s=>`${s.time} — ${s.barberName}`).join("\n")||undefined,destination:{section:"Agenda",label:"Abrir Agenda"}});
    }
  }
}
