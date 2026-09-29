from pathlib import Path


def replace_once(path, before, after):
    p = Path(path)
    source = p.read_text()
    count = source.count(before)
    if count != 1:
        raise RuntimeError(f"{path}: esperado 1 trecho, encontrado {count}")
    p.write_text(source.replace(before, after, 1))


def append_once(path, marker, text):
    p = Path(path)
    source = p.read_text()
    if marker not in source:
        p.write_text(source.rstrip() + "\n" + text + "\n")

replace_once('lib/ca-atende.ts', r'''export function mergeCaAtendeMemory(memory: CaAtendeContextMemory, next: Partial<CaAtendeContextMemory>) {
  return {
    intent: next.intent || memory.intent || "",
    date: next.date || memory.date || "",
    time: next.time || memory.time || "",
    service: next.service || memory.service || "",
    barber: next.barber || memory.barber || "",
    clientName: next.clientName || memory.clientName || "",
    paymentChoice: next.paymentChoice || memory.paymentChoice || "",
    appointmentId: next.appointmentId !== undefined ? next.appointmentId : (memory.appointmentId || 0),
    manageAction: next.manageAction !== undefined ? next.manageAction : (memory.manageAction || ""),
    afterTime: next.afterTime || memory.afterTime || "",
    beforeTime: next.beforeTime || memory.beforeTime || "",
  };
}
''', r'''export function mergeCaAtendeMemory(memory: CaAtendeContextMemory, next: Partial<CaAtendeContextMemory>) {
  return {
    intent: next.intent !== undefined ? next.intent : (memory.intent || ""),
    date: next.date !== undefined ? next.date : (memory.date || ""),
    time: next.time !== undefined ? next.time : (memory.time || ""),
    service: next.service !== undefined ? next.service : (memory.service || ""),
    barber: next.barber !== undefined ? next.barber : (memory.barber || ""),
    clientName: next.clientName !== undefined ? next.clientName : (memory.clientName || ""),
    paymentChoice: next.paymentChoice !== undefined ? next.paymentChoice : (memory.paymentChoice || ""),
    appointmentId: next.appointmentId !== undefined ? next.appointmentId : (memory.appointmentId || 0),
    manageAction: next.manageAction !== undefined ? next.manageAction : (memory.manageAction || ""),
    afterTime: next.afterTime !== undefined ? next.afterTime : (memory.afterTime || ""),
    beforeTime: next.beforeTime !== undefined ? next.beforeTime : (memory.beforeTime || ""),
  };
}
''')

replace_once('db/ca-atende.ts', r'''function findServiceByMessage(message: string, items: CaAtendeRuntimeContext["services"]) {
  const text = normalizeCaAtendeText(message);
  if (/\b(cortar|corte|cabelo)\b/.test(text) && /\bbarba\b/.test(text)) {
    const combined = items.find(item => /corte/.test(normalizeCaAtendeText(item.name)) && /barba/.test(normalizeCaAtendeText(item.name)));
    if (combined) return combined;
    // Do not silently replace a requested combination with only one service.
    return null;
  }
  const direct = findNamedItem(message, "", items);
  if (direct) return direct;
''', r'''function singleService(items: CaAtendeRuntimeContext["services"], wanted: "cut" | "beard") {
  return items.find((item) => {
    const name = normalizeCaAtendeText(item.name);
    if (wanted === "cut") return /\b(corte|cabelo)\b/.test(name) && !/\bbarba\b/.test(name);
    return /\bbarba\b/.test(name) && !/\b(corte|cabelo)\b/.test(name);
  }) ?? null;
}

function serviceIntentSignals(message: string) {
  const text = normalizeCaAtendeText(message);
  const mentionsCut = /\b(cortar|corte|cabelo|cabeca)\b/.test(text);
  const mentionsBeard = /\b(barba|barbear|barbinha)\b/.test(text);
  const rejectBeard = /\bsem\s+(?:a\s+)?barba\b/.test(text)
    || /\bnao\s+(?:quero|preciso|vou querer|faz|fazer)\s+(?:a\s+)?barba\b/.test(text)
    || /\bbarba\s+nao(?:\s+(?:quero|preciso))?\b/.test(text)
    || /\b(?:so|somente|apenas)\s+(?:o\s+)?(?:corte|cabelo)\b/.test(text);
  const rejectCut = /\bsem\s+(?:o\s+)?(?:corte|cabelo)\b/.test(text)
    || /\bnao\s+(?:quero|preciso|vou querer|faz|fazer)\s+(?:o\s+)?(?:corte|cabelo)\b/.test(text)
    || /\b(?:corte|cabelo)\s+nao(?:\s+(?:quero|preciso))?\b/.test(text)
    || /\b(?:so|somente|apenas)\s+(?:a\s+)?barba\b/.test(text);
  return { text, mentionsCut, mentionsBeard, rejectBeard, rejectCut };
}

function findServiceByMessage(message: string, items: CaAtendeRuntimeContext["services"]) {
  const { text, mentionsCut, mentionsBeard, rejectBeard, rejectCut } = serviceIntentSignals(message);
  if (mentionsCut && rejectBeard && !rejectCut) return singleService(items, "cut");
  if (mentionsBeard && rejectCut && !rejectBeard) return singleService(items, "beard");
  if (mentionsCut && mentionsBeard && !rejectBeard && !rejectCut) {
    const combined = items.find(item => /\b(corte|cabelo)\b/.test(normalizeCaAtendeText(item.name)) && /\bbarba\b/.test(normalizeCaAtendeText(item.name)));
    if (combined) return combined;
    // Do not silently replace a requested combination with only one service.
    return null;
  }
  const direct = findNamedItem(message, "", items);
  if (direct) return direct;
''')

replace_once('db/ca-atende.ts', r'''  if (/\b(cortar|corte|cabelo)\b/.test(normalized) && /\bbarba\b/.test(normalized) && !findServiceByMessage(event.text, context.services)) {
    return { reply:"Não encontrei corte com barba como um serviço único aqui. Qual serviço você prefere?", intent:"booking", state:"awaiting_service", memory:{ ...oldMemory, intent:"booking", service:"" }, source:"rule", choices:serviceChoices(context) };
  }
''', r'''  const serviceSignals = serviceIntentSignals(event.text);
  if (serviceSignals.mentionsCut && serviceSignals.mentionsBeard && !serviceSignals.rejectBeard && !serviceSignals.rejectCut && !findServiceByMessage(event.text, context.services)) {
    return { reply:"Não encontrei corte com barba como um serviço único aqui. Qual serviço você prefere?", intent:"booking", state:"awaiting_service", memory:{ ...oldMemory, intent:"booking", service:"" }, source:"rule", choices:serviceChoices(context) };
  }
''')

replace_once('db/ca-atende.ts', r'''  if (stage === "booking_pix_pending" && /^(ok|blz|beleza|obrigado|obrigada|certo|combinado)$/.test(normalized)) {
    return { reply:"Combinado! O horário aguarda o Pix e a conferência da barbearia.", intent:"booking", state:"", memory:{}, source:"rule" };
  }
''', r'''  const acknowledgement = /^(ok|blz|beleza|obrigado|obrigada|certo|combinado)$/.test(normalized);
  if (stage === "booking_pix_pending" && acknowledgement) {
    return { reply:"Combinado! O horário aguarda o Pix e a conferência da barbearia.", intent:"booking", state:"", memory:{}, source:"rule" };
  }
  if (acknowledgement && stage === "awaiting_confirmation") {
    return { reply:"Certo. Para fechar esse horário, escreva “confirmar” ou escolha Confirmar.", intent:oldMemory.intent || "booking", state:stage, memory:oldMemory, source:"rule", dataSource:"agenda", choices:["Confirmar", "Escolher outro horário", "Trocar profissional", "Cancelar"] };
  }
  if (acknowledgement && stage === "awaiting_payment") {
    const payments = await bookingPaymentChoices(context);
    return { reply:"Certo. Só falta me dizer como prefere pagar.", intent:"booking", state:stage, memory:oldMemory, source:"rule", choices:payments, dataSource:"agenda" };
  }
  if (acknowledgement && (stage === "awaiting_service" || stage === "awaiting_professional" || stage === "awaiting_booking_details" || stage === "awaiting_booking_choice" || stage === "awaiting_availability_details")) {
    const reply = stage === "awaiting_service" ? "Certo. Qual serviço você quer?"
      : stage === "awaiting_professional" ? "Certo. Qual profissional você prefere?"
        : stage === "awaiting_booking_choice" ? "Certo. Qual horário você prefere?"
          : "Certo. Continuamos daqui — me diga só o detalhe que falta.";
    return { reply, intent:oldMemory.intent || "booking", state:stage, memory:oldMemory, source:"rule", dataSource:"agenda" };
  }
''')

replace_once('db/dashboard.ts', 'export async function cancelAppointment(access: AccessContext, id: number) {\n', r'''export async function updateAppointmentDetails(access: AccessContext, input: { id: number; clientName: string; phone?: string; serviceId: number; notes?: string }) {
  const db = await getDb();
  const existing = (await db.select().from(appointments).where(and(eq(appointments.id, input.id), eq(appointments.organizationId, access.organizationId))).limit(1))[0];
  if (!existing) throw new Error("Agendamento não encontrado.");
  requireOwnBarber(access, existing.barberId);
  if (existing.status === "Cancelado") throw new Error("Este horário está cancelado. Use Remarcar para reativá-lo.");
  const previousReminder = existing.reminderSentAt;
  await saveAppointment(access, {
    id: existing.id, appointmentDate: existing.appointmentDate, appointmentTime: existing.appointmentTime,
    clientName: input.clientName, phone: input.phone ?? "", serviceId: input.serviceId, barberId: existing.barberId, notes: input.notes ?? "",
  });
  if (previousReminder) await db.update(appointments).set({ reminderSentAt: previousReminder }).where(and(
    eq(appointments.id, existing.id), eq(appointments.organizationId, access.organizationId), eq(appointments.status, existing.status),
  ));
}

export async function rescheduleAppointmentFromAgenda(access: AccessContext, input: { id: number; appointmentDate: string; appointmentTime: string; barberId: number }) {
  const db = await getDb();
  const existing = (await db.select().from(appointments).where(and(eq(appointments.id, input.id), eq(appointments.organizationId, access.organizationId))).limit(1))[0];
  if (!existing) throw new Error("Agendamento não encontrado.");
  requireOwnBarber(access, existing.barberId);
  await saveAppointment(access, {
    id: existing.id, appointmentDate: input.appointmentDate, appointmentTime: input.appointmentTime,
    clientName: existing.clientName, phone: existing.phone, serviceId: existing.serviceId, barberId: input.barberId, notes: existing.notes,
  });
}

export async function cancelAppointment(access: AccessContext, id: number) {
''')

replace_once('app/api/action/route.ts', 'import { cancelAppointment, completeAppointment, confirmAppointment, createDailyRecord, deleteAppointment, deleteClient, deleteDailyRecord, deleteExpense, deleteMembershipPayment, deletePlan, deleteService, deleteTeamPayment, ensureDemoData, getDashboardData, markAppointmentReminderSent, registerAttendance, renewClient, saveAgendaSettings, saveAppointment, saveClient, saveExpense, saveGoal, savePayment, savePlan, saveService, saveTeamMember, saveTeamPayment, syncFinishedAppointments, updateDailyRecord } from "../../../db/dashboard";', 'import { cancelAppointment, completeAppointment, confirmAppointment, createDailyRecord, deleteAppointment, deleteClient, deleteDailyRecord, deleteExpense, deleteMembershipPayment, deletePlan, deleteService, deleteTeamPayment, ensureDemoData, getDashboardData, markAppointmentReminderSent, registerAttendance, renewClient, saveAgendaSettings, saveAppointment, saveClient, saveExpense, saveGoal, savePayment, savePlan, saveService, saveTeamMember, saveTeamPayment, syncFinishedAppointments, updateAppointmentDetails, rescheduleAppointmentFromAgenda, updateDailyRecord } from "../../../db/dashboard";')
replace_once('app/api/action/route.ts', '    else if (data.action === "appointment") await saveAppointment(access, { id: data.id ? Number(data.id) : undefined, appointmentDate: String(data.appointmentDate), appointmentTime: String(data.appointmentTime), clientName: String(data.clientName ?? ""), phone: String(data.phone ?? ""), serviceId: Number(data.serviceId), barberId: Number(data.barberId), notes: String(data.notes ?? "") });\n    else if (data.action === "confirm-appointment")', '    else if (data.action === "appointment") await saveAppointment(access, { id: data.id ? Number(data.id) : undefined, appointmentDate: String(data.appointmentDate), appointmentTime: String(data.appointmentTime), clientName: String(data.clientName ?? ""), phone: String(data.phone ?? ""), serviceId: Number(data.serviceId), barberId: Number(data.barberId), notes: String(data.notes ?? "") });\n    else if (data.action === "appointment-update-details") await updateAppointmentDetails(access, { id: Number(data.id), clientName: String(data.clientName ?? ""), phone: String(data.phone ?? ""), serviceId: Number(data.serviceId), notes: String(data.notes ?? "") });\n    else if (data.action === "appointment-reschedule") await rescheduleAppointmentFromAgenda(access, { id: Number(data.id), appointmentDate: String(data.appointmentDate), appointmentTime: String(data.appointmentTime), barberId: Number(data.barberId) });\n    else if (data.action === "confirm-appointment")')

replace_once('app/ui/dashboard-app.tsx', r'''function Agenda({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const editorRef = useEditorAutoScroll<HTMLDivElement>(editingId);
  const editing = data.appointments.find((item) => item.id === editingId);
  const completingAppointment = data.appointments.find((item) => item.id === completingId);
  const activeAppointments = data.appointments.filter((item) => item.status !== "Concluído" && item.status !== "Atendido");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); const ok = await post({ action: "appointment", id: editingId ?? 0, appointmentDate: String(fields.get("appointmentDate")), appointmentTime: String(fields.get("appointmentTime")), clientName: String(fields.get("clientName")), phone: String(fields.get("phone")), serviceId: Number(fields.get("serviceId")), barberId: Number(fields.get("barberId")), notes: String(fields.get("notes")) }, editing ? "Agendamento atualizado. Se estava pendente, ainda precisa de confirmação." : "Horário incluído na agenda."); if (ok) { setEditingId(null); form.reset(); } }
''', r'''function Agenda({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingMode, setEditingMode] = useState<"details" | "reschedule">("details");
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const focusedFromNotificationRef = useRef(0);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const editorRef = useEditorAutoScroll<HTMLDivElement>(editingId);
  const editing = data.appointments.find((item) => item.id === editingId);
  const completingAppointment = data.appointments.find((item) => item.id === completingId);
  const activeAppointments = data.appointments.filter((item) => item.status !== "Concluído" && item.status !== "Atendido");
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("appointment") || 0);
    if (!Number.isInteger(id) || id <= 0 || focusedFromNotificationRef.current === id || !data.appointments.some((item) => item.id === id)) return;
    focusedFromNotificationRef.current = id;
    setFocusedId(id);
    const frame = window.requestAnimationFrame(() => document.getElementById("appointment-" + id)?.scrollIntoView({ behavior:"smooth", block:"center" }));
    const timer = window.setTimeout(() => setFocusedId((current) => current === id ? null : current), 6500);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [data.appointments]);
  function editDetails(id: number) { setEditingMode("details"); setEditingId(id); }
  function reschedule(id: number) { setEditingMode("reschedule"); setEditingId(id); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const payload = editing
      ? editingMode === "reschedule"
        ? { action:"appointment-reschedule", id:editing.id, appointmentDate:String(fields.get("appointmentDate")), appointmentTime:String(fields.get("appointmentTime")), barberId:Number(fields.get("barberId")) }
        : { action:"appointment-update-details", id:editing.id, clientName:String(fields.get("clientName")), phone:String(fields.get("phone")), serviceId:Number(fields.get("serviceId")), notes:String(fields.get("notes")) }
      : { action:"appointment", id:0, appointmentDate:String(fields.get("appointmentDate")), appointmentTime:String(fields.get("appointmentTime")), clientName:String(fields.get("clientName")), phone:String(fields.get("phone")), serviceId:Number(fields.get("serviceId")), barberId:Number(fields.get("barberId")), notes:String(fields.get("notes")) };
    const ok = await post(payload, editing ? editingMode === "reschedule" ? "Horário remarcado. Pendências e pagamento foram preservados." : "Dados do agendamento atualizados sem alterar horário ou confirmação." : "Horário incluído na agenda.");
    if (ok) { setEditingId(null); form.reset(); }
  }
''')

replace_once('app/ui/dashboard-app.tsx', '{activeAppointments.map((item) => <article className={item.status === "Cancelado" ? "appointment canceled" : item.status === "Aguardando" || item.status === "Aguardando pagamento" ? "appointment awaiting" : "appointment"} key={item.id}>', '{activeAppointments.map((item) => <article id={"appointment-" + item.id} className={(item.status === "Cancelado" ? "appointment canceled" : item.status === "Aguardando" || item.status === "Aguardando pagamento" ? "appointment awaiting" : "appointment") + (focusedId === item.id ? " notification-focus" : "")} key={item.id}>')
replace_once('app/ui/dashboard-app.tsx', r'''<div className="appointment-info"><strong>{item.clientName}</strong><p>{item.paymentChoice === "Mensalista" ? "Mensalista" : item.serviceName} com {item.barberName}</p><small>{item.phone}{item.notes ? ` · ${item.notes}` : ""}</small><small>{item.paymentChoice === "Mensalista" ? "Uso do plano mensal · conferir cadastro" : `Pagamento escolhido: ${item.paymentChoice}`}</small>{item.reminderSentAt && <small className="appointment-reminder-status">✓ {reminderSentLabel(item.reminderSentAt)}</small>}</div>''', r'''<div className="appointment-info"><strong>{item.clientName}</strong><p>{item.paymentChoice === "Mensalista" ? "Mensalista" : item.serviceName} com {item.barberName}</p><small>{date(item.appointmentDate)} às {item.appointmentTime}</small><small>{item.phone}{item.notes ? ` · ${item.notes}` : ""}</small><small>{item.paymentChoice === "Mensalista" ? "Uso do plano mensal · conferir cadastro" : `Pagamento escolhido: ${item.paymentChoice}`}</small><small className="appointment-state-note">{item.status === "Agendado" ? "Horário confirmado" : item.status === "Aguardando pagamento" ? "Pagamento pendente · ainda não confirmado" : item.status === "Aguardando" && item.paymentChoice === "Pix" ? "Pix informado · confira o recebimento antes de confirmar" : item.status === "Aguardando" ? "Pedido pendente · confirme o horário" : item.status === "Cancelado" ? "Cancelado · use Remarcar para reativar" : item.status}</small>{item.reminderSentAt && <small className="appointment-reminder-status">✓ {reminderSentLabel(item.reminderSentAt)}</small>}</div>''')
replace_once('app/ui/dashboard-app.tsx', '            <button onClick={() => setEditingId(item.id)}>{item.status === "Cancelado" || item.status === "Aguardando pagamento" || item.status === "Aguardando" ? "Remarcar" : "Editar"}</button>\n', '            <button className="reschedule-appointment" disabled={pending} onClick={() => reschedule(item.id)}>Remarcar</button>\n            {item.status !== "Cancelado" && <button disabled={pending} onClick={() => editDetails(item.id)}>Editar dados</button>}\n')

replace_once('app/ui/dashboard-app.tsx', r'''      <SectionTitle title={editing ? "Editar ou remarcar" : "Novo horário"} copy={editing ? "Altere os dados e salve. Pedidos e Pix pendentes continuam pendentes; um cancelado volta como agendado." : "Adicione um cliente à agenda."} />
      <form className="app-form" onSubmit={submit} key={editing?.id ?? "new-appointment"}>
        <Field label="Data"><input name="appointmentDate" type="date" defaultValue={editing?.appointmentDate ?? today} required /></Field>
        <Field label="Horário"><input name="appointmentTime" type="time" step="60" defaultValue={editing?.appointmentTime ?? ""} required /></Field>
        <Field label="Cliente"><input name="clientName" placeholder="Nome" defaultValue={editing?.clientName ?? ""} required /></Field>
        <Field label="Telefone"><input name="phone" placeholder="(41) 99999-9999" defaultValue={editing?.phone ?? ""} /></Field>
        <Field label="Serviço"><select name="serviceId" defaultValue={editing?.serviceId ?? data.services[0]?.id}>{editing && !data.services.some((item) => item.id === editing.serviceId) && <option value={editing.serviceId}>{editing.serviceName} · excluído</option>}{data.services.filter((item) => item.active || item.id === editing?.serviceId).map((item) => <option value={item.id} key={item.id}>{item.name}{data.agendaSettings.useServiceDuration ? ` · ${item.durationMinutes} min` : ""}</option>)}</select></Field>
        <Field label="Barbeiro"><select name="barberId" defaultValue={editing?.barberId ?? data.team[0]?.id}>{data.team.filter((item) => item.active || item.id === editing?.barberId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Observações"><textarea name="notes" placeholder="Opcional" defaultValue={editing?.notes ?? ""} /></Field>
        <button className="primary-button" disabled={pending}>{pending ? "Verificando horário..." : editing ? "Salvar alterações" : "Agendar horário"}</button>
''', r'''      <SectionTitle title={!editing ? "Novo horário" : editingMode === "reschedule" ? "Remarcar horário" : "Editar dados"} copy={!editing ? "Adicione um cliente à agenda." : editingMode === "reschedule" ? "Mude apenas data, horário ou profissional. Serviço, pagamento e pendências são preservados." : "Altere cliente, telefone, serviço ou observações sem mexer na confirmação do horário."} />
      {editing && <div className="appointment-editor-summary"><strong>{editing.clientName}</strong><span>{editing.serviceName} · {editing.barberName}</span><small>{date(editing.appointmentDate)} às {editing.appointmentTime} · {editing.status} · {editing.paymentChoice || "Pagamento não informado"}</small></div>}
      <form className="app-form" onSubmit={submit} key={(editing?.id ?? "new-appointment") + "-" + editingMode}>
        {(!editing || editingMode === "reschedule") && <><Field label="Data"><input name="appointmentDate" type="date" defaultValue={editing?.appointmentDate ?? today} required /></Field><Field label="Horário"><input name="appointmentTime" type="time" step="60" defaultValue={editing?.appointmentTime ?? ""} required /></Field></>}
        {(!editing || editingMode === "details") && <><Field label="Cliente"><input name="clientName" placeholder="Nome" defaultValue={editing?.clientName ?? ""} required /></Field><Field label="Telefone"><input name="phone" placeholder="(41) 99999-9999" defaultValue={editing?.phone ?? ""} /></Field><Field label="Serviço"><select name="serviceId" defaultValue={editing?.serviceId ?? data.services[0]?.id}>{editing && !data.services.some((item) => item.id === editing.serviceId) && <option value={editing.serviceId}>{editing.serviceName} · excluído</option>}{data.services.filter((item) => item.active || item.id === editing?.serviceId).map((item) => <option value={item.id} key={item.id}>{item.name}{data.agendaSettings.useServiceDuration ? ` · ${item.durationMinutes} min` : ""}</option>)}</select></Field><Field label="Observações"><textarea name="notes" placeholder="Opcional" defaultValue={editing?.notes ?? ""} /></Field></>}
        {(!editing || editingMode === "reschedule") && <Field label="Barbeiro"><select name="barberId" defaultValue={editing?.barberId ?? data.team[0]?.id}>{data.team.filter((item) => item.active || item.id === editing?.barberId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>}
        <button className="primary-button" disabled={pending}>{pending ? "Verificando..." : !editing ? "Agendar horário" : editingMode === "reschedule" ? "Confirmar remarcação" : "Salvar dados"}</button>
''')

append_once('app/globals.css', '.appointment.notification-focus', '.appointment.notification-focus{outline:2px solid #d7a642;outline-offset:3px;box-shadow:0 0 0 5px #d7a6421f,0 8px 24px #1e211e14}.appointment-state-note{margin-top:5px;font-weight:800;color:#6d725f}.appointment-editor-summary{margin:0 21px 14px;padding:11px 12px;border:1px solid #e5dfcf;border-radius:10px;background:#fbf8ef}.appointment-editor-summary strong,.appointment-editor-summary span,.appointment-editor-summary small{display:block}.appointment-editor-summary strong{font-size:12px}.appointment-editor-summary span{margin-top:4px;font-size:10px}.appointment-editor-summary small{margin-top:4px;color:#777d75;font-size:9px}')

Path('tests/agenda-ca-context-upgrade.test.mjs').write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ca = fs.readFileSync("db/ca-atende.ts", "utf8");
const memory = fs.readFileSync("lib/ca-atende.ts", "utf8");
const agenda = fs.readFileSync("app/ui/dashboard-app.tsx", "utf8");
const dashboard = fs.readFileSync("db/dashboard.ts", "utf8");
const action = fs.readFileSync("app/api/action/route.ts", "utf8");

test("serviço combinado respeita negação e correção", () => {
  assert.match(ca, /rejectBeard/);
  assert.match(ca, /singleService\(items, "cut"\)/);
  assert.match(ca, /mentionsCut && mentionsBeard && !rejectBeard && !rejectCut/);
});

test("memória aceita limpar apenas o campo corrigido", () => {
  assert.match(memory, /next\.barber !== undefined/);
  assert.match(memory, /next\.service !== undefined/);
  assert.match(memory, /next\.time !== undefined/);
});

test("agenda diferencia remarcar de editar dados", () => {
  assert.match(agenda, /appointment-reschedule/);
  assert.match(agenda, /appointment-update-details/);
  assert.match(agenda, />Remarcar<\/button>/);
  assert.match(agenda, />Editar dados<\/button>/);
  assert.match(dashboard, /rescheduleAppointmentFromAgenda/);
  assert.match(dashboard, /updateAppointmentDetails/);
  assert.match(action, /appointment-reschedule/);
  assert.match(action, /appointment-update-details/);
});

test("notificação localiza o agendamento sem executar ação", () => {
  assert.match(agenda, /get\("appointment"\)/);
  assert.match(agenda, /scrollIntoView/);
  assert.match(agenda, /notification-focus/);
});

test("remarcação preserva dados e reaproveita validação central", () => {
  const block = dashboard.slice(dashboard.indexOf("export async function rescheduleAppointmentFromAgenda"), dashboard.indexOf("export async function cancelAppointment"));
  assert.match(block, /serviceId: existing\.serviceId/);
  assert.match(block, /clientName: existing\.clientName/);
  assert.match(block, /saveAppointment\(access/);
});
''')

print('Atualização da Agenda e C.A. Atende aplicada.')
