from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho, encontrado {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new, 1))


def replace_all(path, old, new, minimum=1):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"{path}: esperado >= {minimum}, encontrado {count}: {old[:80]!r}")
    p.write_text(text.replace(old, new))


replace_once(
    "db/dashboard.ts",
    'import { processWhatsappQueueSafely, queueAppointmentWhatsappSafely } from "./whatsapp";',
    'import { queueAppointmentWhatsappSafely } from "./whatsapp";\nimport { processConnectedWhatsappQueueSafely } from "./whatsapp-dispatch";'
)
replace_all("db/dashboard.ts", "processWhatsappQueueSafely(access.organizationId, 3)", "processConnectedWhatsappQueueSafely(access.organizationId, 3)", 2)

replace_once("db/public-booking.ts", 'import { and, eq, isNull } from "drizzle-orm";', 'import { and, eq, gte, isNull } from "drizzle-orm";')
replace_once(
    "db/public-booking.ts",
    'import { processWhatsappQueueSafely, queueAppointmentReminderOnlySafely, queueAppointmentWhatsappSafely } from "./whatsapp";',
    'import { queueAppointmentReminderOnlySafely, queueAppointmentWhatsappSafely } from "./whatsapp";\nimport { processConnectedWhatsappQueueSafely } from "./whatsapp-dispatch";'
)
replace_all("db/public-booking.ts", "processWhatsappQueueSafely(", "processConnectedWhatsappQueueSafely(", 3)

public_helper = r'''
export type WhatsappManagedBooking = {
  appointmentId: number;
  clientName: string;
  date: string;
  time: string;
  serviceId: number;
  serviceName: string;
  durationMinutes: number;
  barberId: number;
  barberName: string;
  status: string;
  canChange: boolean;
};

function sameWhatsappPhone(left: string, right: string) {
  const a = phoneDigits(left);
  const b = phoneDigits(right);
  const compareLength = Math.min(11, a.length, b.length);
  return compareLength >= 10 && a.slice(-compareLength) === b.slice(-compareLength);
}

export async function listWhatsappManagedBookings(slugValue: string, phoneValue: string): Promise<WhatsappManagedBooking[]> {
  const slug = cleanSlug(slugValue);
  if (!slug || phoneDigits(phoneValue).length < 10) return [];
  const db = await getDb();
  const organization = (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1))[0];
  if (!organization) return [];
  const rows = await db.select({
    appointmentId: appointments.id,
    phone: appointments.phone,
    clientName: appointments.clientName,
    date: appointments.appointmentDate,
    time: appointments.appointmentTime,
    serviceId: appointments.serviceId,
    serviceName: services.name,
    durationMinutes: services.durationMinutes,
    barberId: appointments.barberId,
    barberName: team.name,
    status: appointments.status,
  }).from(appointments)
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .innerJoin(team, eq(appointments.barberId, team.id))
    .where(and(
      eq(appointments.organizationId, organization.id),
      gte(appointments.appointmentDate, appDate()),
    ))
    .orderBy(appointments.appointmentDate, appointments.appointmentTime);
  return rows
    .filter((row) => row.status !== "Cancelado" && sameWhatsappPhone(row.phone, phoneValue))
    .map((row) => ({
      appointmentId: row.appointmentId,
      clientName: row.clientName,
      date: row.date,
      time: row.time,
      serviceId: row.serviceId,
      serviceName: row.serviceName,
      durationMinutes: row.durationMinutes,
      barberId: row.barberId,
      barberName: row.barberName,
      status: row.status,
      canChange: clientCanChangeAppointment(row.date, row.time),
    }));
}

async function findWhatsappManagedBooking(slugValue: string, phoneValue: string, appointmentId: number) {
  const slug = cleanSlug(slugValue);
  if (!slug || !Number.isInteger(appointmentId) || appointmentId <= 0) return null;
  const db = await getDb();
  const row = (await db.select({
    appointmentId: appointments.id,
    organizationId: appointments.organizationId,
    phone: appointments.phone,
    clientName: appointments.clientName,
    date: appointments.appointmentDate,
    time: appointments.appointmentTime,
    serviceId: appointments.serviceId,
    serviceName: services.name,
    durationMinutes: services.durationMinutes,
    barberId: appointments.barberId,
    barberName: team.name,
    status: appointments.status,
    membershipCreditState: appointments.membershipCreditState,
  }).from(appointments)
    .innerJoin(organizations, eq(appointments.organizationId, organizations.id))
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .innerJoin(team, eq(appointments.barberId, team.id))
    .where(and(
      eq(organizations.slug, slug),
      eq(appointments.id, appointmentId),
    )).limit(1))[0] ?? null;
  if (!row || !sameWhatsappPhone(row.phone, phoneValue)) return null;
  return row;
}

export async function cancelWhatsappManagedBooking(slugValue: string, phoneValue: string, appointmentId: number, options: { skipWhatsappNotice?: boolean } = {}) {
  const row = await findWhatsappManagedBooking(slugValue, phoneValue, appointmentId);
  if (!row) throw new Error("Não encontrei esse agendamento para este WhatsApp.");
  if (row.status === "Cancelado") throw new Error("Este horário já foi cancelado.");
  if (!clientCanChangeAppointment(row.date, row.time)) throw new Error("Faltam menos de 2 horas para o atendimento. Vou chamar a barbearia para ajudar.");
  const db = await getDb();
  await db.update(appointments).set({
    status: "Cancelado",
    membershipCreditState: row.membershipCreditState === "reserved" ? "released" : row.membershipCreditState,
  }).where(and(
    eq(appointments.id, row.appointmentId),
    eq(appointments.organizationId, row.organizationId),
  ));
  await notifyBookingChange({ organizationId: row.organizationId, appointmentId: row.appointmentId, clientName: row.clientName, serviceName: row.serviceName, barberId: row.barberId, barberName: row.barberName, date: row.date, time: row.time, status: "Cancelado" }, "cancelled");
  if (!options.skipWhatsappNotice) {
    const queued = await queueAppointmentWhatsappSafely("cancellation", row.appointmentId);
    if (queued.queued) await processConnectedWhatsappQueueSafely(row.organizationId, 3);
  }
  return { ...row, status:"Cancelado" };
}

export async function rescheduleWhatsappManagedBooking(slugValue: string, phoneValue: string, appointmentId: number, date: string, time: string, options: { skipWhatsappNotice?: boolean } = {}) {
  const row = await findWhatsappManagedBooking(slugValue, phoneValue, appointmentId);
  if (!row) throw new Error("Não encontrei esse agendamento para este WhatsApp.");
  if (row.status === "Cancelado") throw new Error("Um horário cancelado não pode ser remarcado.");
  if (!clientCanChangeAppointment(row.date, row.time)) throw new Error("Faltam menos de 2 horas para o atendimento. Vou chamar a barbearia para ajudar.");
  const slots = await getPublicBookingSlots(slugValue, date, row.serviceId, row.barberId);
  if (!slots.some((slot) => slot.time === time && slot.barberId === row.barberId)) throw new Error("Esse horário não está mais disponível. Escolha outro.");
  const data = await getPublicBookingData(slugValue);
  if (!data) throw new Error("Barbearia não encontrada.");
  const newStatus = data.organization.requiresApproval ? "Aguardando" : "Agendado";
  const { env } = await import("@/runtime/env");
  const database = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!database) throw new Error("Não foi possível remarcar o horário.");
  const requestedStart = toMinutes(time);
  const requestedEnd = requestedStart + row.durationMinutes;
  const updated = await database.prepare(`
    UPDATE appointments
    SET appointment_date = ?, appointment_time = ?, status = ?
    WHERE id = ? AND organization_id = ? AND status <> 'Cancelado'
      AND NOT EXISTS (
        SELECT 1 FROM appointments AS existing
        INNER JOIN services AS existing_service ON existing_service.id = existing.service_id
        WHERE existing.organization_id = ? AND existing.appointment_date = ?
          AND existing.barber_id = ? AND existing.id <> ? AND existing.status <> 'Cancelado'
          AND (CAST(SUBSTR(existing.appointment_time, 1, 2) AS INTEGER) * 60 + CAST(SUBSTR(existing.appointment_time, 4, 2) AS INTEGER)) < ?
          AND ? < (CAST(SUBSTR(existing.appointment_time, 1, 2) AS INTEGER) * 60 + CAST(SUBSTR(existing.appointment_time, 4, 2) AS INTEGER) + existing_service.duration_minutes)
      )
    RETURNING id
  `).bind(date, time, newStatus, row.appointmentId, row.organizationId, row.organizationId, date, row.barberId, row.appointmentId, requestedEnd, requestedStart).first<{ id: number }>();
  if (!updated) throw new Error("Esse horário acabou de ser ocupado. Escolha outro.");
  await notifyBookingChange({ organizationId: row.organizationId, appointmentId: row.appointmentId, clientName: row.clientName, serviceName: row.serviceName, barberId: row.barberId, barberName: row.barberName, date, time, status: newStatus }, "rescheduled");
  if (newStatus === "Agendado" && !options.skipWhatsappNotice) {
    const queued = await queueAppointmentWhatsappSafely("rescheduled", row.appointmentId);
    if (queued.queued) await processConnectedWhatsappQueueSafely(row.organizationId, 3);
  }
  return { ...row, date, time, status:newStatus };
}
'''
replace_once("db/public-booking.ts", 'export async function cancelPublicBooking(slug: string, token: string) {', public_helper + '\nexport async function cancelPublicBooking(slug: string, token: string) {')

replace_once(
    "lib/ca-atende.ts",
    "  paymentChoice?: string;\n  // The customer's explicit selection is kept separate from the last displayed options.",
    "  paymentChoice?: string;\n  appointmentId?: number;\n  manageAction?: \"cancel\" | \"reschedule\" | \"\";\n  // The customer's explicit selection is kept separate from the last displayed options."
)
replace_once(
    "lib/ca-atende.ts",
    '    paymentChoice: next.paymentChoice || memory.paymentChoice || "",\n    afterTime: next.afterTime || memory.afterTime || "",',
    '    paymentChoice: next.paymentChoice || memory.paymentChoice || "",\n    appointmentId: next.appointmentId !== undefined ? next.appointmentId : (memory.appointmentId || 0),\n    manageAction: next.manageAction !== undefined ? next.manageAction : (memory.manageAction || ""),\n    afterTime: next.afterTime || memory.afterTime || "",'
)

replace_once(
    "db/ca-atende.ts",
    'import { createPublicBooking, getPublicBookingData, getPublicBookingSlotsExpanded } from "./public-booking";',
    'import { cancelWhatsappManagedBooking, createPublicBooking, getPublicBookingData, getPublicBookingSlotsExpanded, listWhatsappManagedBookings, rescheduleWhatsappManagedBooking, type WhatsappManagedBooking } from "./public-booking";'
)
replace_once("db/ca-atende.ts", '    botEnabled: boolean;\n    economyMode: boolean;', '    botEnabled: boolean;\n    cancellationEnabled: boolean;\n    rescheduleEnabled: boolean;\n    economyMode: boolean;')
replace_once(
    "db/ca-atende.ts",
    '      paymentChoice: String(parsed.paymentChoice || "").slice(0,30),\n      afterTime: String(parsed.afterTime || "").slice(0,5),',
    '      paymentChoice: String(parsed.paymentChoice || "").slice(0,30),\n      appointmentId: Math.max(0, Math.round(Number(parsed.appointmentId || 0))),\n      manageAction: parsed.manageAction === "cancel" || parsed.manageAction === "reschedule" ? parsed.manageAction : "",\n      afterTime: String(parsed.afterTime || "").slice(0,5),'
)
replace_once(
    "db/ca-atende.ts",
    '      botEnabled: Boolean(current?.botEnabled),\n      economyMode: current?.economyMode === undefined ? true : Boolean(current.economyMode),',
    '      botEnabled: Boolean(current?.botEnabled),\n      cancellationEnabled: current?.cancellationEnabled === undefined ? true : Boolean(current.cancellationEnabled),\n      rescheduleEnabled: current?.rescheduleEnabled === undefined ? true : Boolean(current.rescheduleEnabled),\n      economyMode: current?.economyMode === undefined ? true : Boolean(current.economyMode),'
)
replace_once(
    "db/ca-atende.ts",
    '  bookingRequest?: { date:string; time:string; serviceId:number; barberId:number; clientName:string; paymentChoice:string };\n};',
    '  bookingRequest?: { date:string; time:string; serviceId:number; barberId:number; clientName:string; paymentChoice:string };\n  managementRequest?: { action:"cancel" | "reschedule"; appointmentId:number; date?:string; time?:string };\n};'
)

management_helpers = r'''
function managedBookingLabel(item: WhatsappManagedBooking, index?: number) {
  const prefix = index === undefined ? "" : `${index + 1}. `;
  return `${prefix}${humanDate(item.date)} às ${item.time} · ${item.serviceName} · ${item.barberName}`;
}

function managedBookingChoices(items: WhatsappManagedBooking[]) {
  return items.slice(0,5).map((item,index) => managedBookingLabel(item,index));
}

function chooseManagedBooking(message: string, items: WhatsappManagedBooking[]) {
  const normalized = normalizeCaAtendeText(message);
  const index = /^(?:opcao\s*)?([1-5])$/.exec(normalized);
  if (index) return items[Number(index[1]) - 1] ?? null;
  const date = extractCaAtendeDate(message);
  const time = extractCaAtendeTime(message);
  let matches = items.filter((item) => (!date || item.date === date) && (!time || item.time === time));
  const serviceMatches = matches.filter((item) => normalized.includes(normalizeCaAtendeText(item.serviceName)));
  if (serviceMatches.length) matches = serviceMatches;
  const barberMatches = matches.filter((item) => normalized.includes(normalizeCaAtendeText(item.barberName)));
  if (barberMatches.length) matches = barberMatches;
  return matches.length === 1 ? matches[0] : null;
}

function managementPrompt(action: "cancel" | "reschedule", item: WhatsappManagedBooking): CaAtendeDecision {
  const memory: CaAtendeContextMemory = { intent:action, manageAction:action, appointmentId:item.appointmentId, date:item.date, time:item.time, service:item.serviceName, barber:item.barberName, clientName:item.clientName };
  if (action === "cancel") {
    return { reply:`Encontrei ${item.serviceName} com ${item.barberName}, ${humanDate(item.date)} às ${item.time}. Quer cancelar esse horário?`, intent:"cancel", state:"awaiting_cancel_confirmation", memory, source:"rule", choices:["Confirmar cancelamento", "Manter horário"], dataSource:"agenda" };
  }
  return { reply:`Encontrei ${item.serviceName} com ${item.barberName}, ${humanDate(item.date)} às ${item.time}. Para qual dia você quer remarcar?`, intent:"reschedule", state:"awaiting_reschedule_date", memory, source:"rule", choices:["Hoje", "Amanhã"], dataSource:"agenda" };
}

async function beginManagementFlow(action: "cancel" | "reschedule", event: WhatsappInboundTextEvent, context: CaAtendeRuntimeContext, source: "rule" | "ai"): Promise<CaAtendeDecision> {
  const enabled = action === "cancel" ? context.settings.cancellationEnabled : context.settings.rescheduleEnabled;
  if (!enabled) return { reply:`Essa automação está desligada agora. Vou chamar alguém da ${context.organization.name} para te ajudar.`, intent:action, state:"human_takeover", memory:{ intent:action }, source, handoff:true };
  const appointments = await listWhatsappManagedBookings(context.organization.slug, event.phone);
  if (!appointments.length) return { reply:"Não encontrei nenhum horário futuro ligado a este WhatsApp. Se quiser, posso chamar a barbearia.", intent:action, state:"", memory:{}, source:"rule", choices:["Falar com a barbearia", "Ver opções"], dataSource:"agenda" };
  const changeable = appointments.filter((item) => item.canChange);
  if (!changeable.length) return { reply:`Seu horário está a menos de 2 horas e não posso alterar automaticamente. Vou chamar alguém da ${context.organization.name}.`, intent:action, state:"human_takeover", memory:{ intent:action }, source:"rule", handoff:true, dataSource:"agenda" };
  if (changeable.length === 1) return managementPrompt(action, changeable[0]);
  return { reply:`Encontrei mais de um horário. Qual deles você quer ${action === "cancel" ? "cancelar" : "remarcar"}? Pode responder pelo número, dia ou horário.`, intent:action, state:"awaiting_manage_choice", memory:{ intent:action, manageAction:action, appointmentId:0 }, source:"rule", choices:managedBookingChoices(changeable), dataSource:"agenda" };
}
'''
replace_once("db/ca-atende.ts", 'function slotSummary(slots: Array<{ time: string; barberId: number; barberName: string }>, maxPerBarber = 4) {', management_helpers + '\nfunction slotSummary(slots: Array<{ time: string; barberId: number; barberName: string }>, maxPerBarber = 4) {')

replace_once(
    "db/ca-atende.ts",
    '  if (normalized === "cancelar ou remarcar") {\n    return { reply:"Você quer cancelar ou remarcar? Vou chamar uma pessoa para cuidar do seu horário com segurança.", intent:"cancel", state:"cancel_choice", memory:{}, source:"rule", choices:["Cancelar horário", "Remarcar horário"] };\n  }',
    '  if (normalized === "cancelar ou remarcar") {\n    return { reply:"Claro. Você quer cancelar ou remarcar seu horário?", intent:"cancel", state:"cancel_choice", memory:{}, source:"rule", choices:["Cancelar horário", "Remarcar horário"] };\n  }'
)

management_stages = r'''
  if (stage === "awaiting_manage_choice") {
    const action = oldMemory.manageAction === "reschedule" ? "reschedule" : "cancel";
    const appointments = (await listWhatsappManagedBookings(context.organization.slug, event.phone)).filter((item) => item.canChange);
    const selected = chooseManagedBooking(event.text, appointments);
    if (!selected) return { reply:"Não consegui identificar qual horário. Responda pelo número, dia ou horário:", intent:action, state:"awaiting_manage_choice", memory:oldMemory, source:"rule", choices:managedBookingChoices(appointments), dataSource:"agenda" };
    return managementPrompt(action, selected);
  }
  if (stage === "awaiting_cancel_confirmation") {
    if (/\b(manter|nao cancelar|voltar|deixa assim)\b/.test(normalized)) return menuDecision(context);
    if (/\b(confirmar cancelamento|pode cancelar|cancela|cancelar|sim)\b/.test(normalized) && oldMemory.appointmentId) {
      return { reply:"", intent:"cancel", state:"management_commit", memory:oldMemory, source:"rule", dataSource:"agenda", managementRequest:{ action:"cancel", appointmentId:oldMemory.appointmentId } };
    }
    return { reply:"Quer mesmo cancelar esse horário?", intent:"cancel", state:"awaiting_cancel_confirmation", memory:oldMemory, source:"rule", choices:["Confirmar cancelamento", "Manter horário"], dataSource:"agenda" };
  }
  if (stage === "awaiting_reschedule_date") {
    const date = extractCaAtendeDate(event.text);
    if (!date) return { reply:"Para qual dia você quer remarcar?", intent:"reschedule", state:"awaiting_reschedule_date", memory:oldMemory, source:"rule", choices:["Hoje", "Amanhã"], dataSource:"agenda" };
    const appointments = await listWhatsappManagedBookings(context.organization.slug, event.phone);
    const current = appointments.find((item) => item.appointmentId === oldMemory.appointmentId);
    if (!current) return { reply:"Não encontrei mais esse horário. Posso chamar a barbearia se precisar.", intent:"reschedule", state:"", memory:{}, source:"rule", dataSource:"agenda" };
    const slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, current.serviceId, current.barberId);
    if (!slots.length) return { reply:`Não encontrei horário livre com ${current.barberName} em ${humanDate(date)}. Me diga outro dia.`, intent:"reschedule", state:"awaiting_reschedule_date", memory:oldMemory, source:"rule", dataSource:"agenda" };
    return { reply:`Tenho ${slots.slice(0,8).map((slot) => slot.time).join(", ")}. Qual horário fica melhor?`, intent:"reschedule", state:"awaiting_reschedule_time", memory:{ ...oldMemory, date, time:"" }, source:"rule", choices:slots.slice(0,8).map((slot) => slot.time), dataSource:"agenda" };
  }
  if (stage === "awaiting_reschedule_time") {
    const time = extractCaAtendeTime(event.text);
    const date = oldMemory.date || "";
    const appointments = await listWhatsappManagedBookings(context.organization.slug, event.phone);
    const current = appointments.find((item) => item.appointmentId === oldMemory.appointmentId);
    if (!current || !date) return { reply:"Perdi os detalhes desse horário. Me diga que quer remarcar e eu começo de novo.", intent:"reschedule", state:"", memory:{}, source:"rule" };
    const slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, current.serviceId, current.barberId);
    const exact = slots.find((slot) => slot.time === time);
    if (!time || !exact) return { reply:`Esse horário não está livre. Tenho ${slots.slice(0,8).map((slot) => slot.time).join(", ")}. Qual prefere?`, intent:"reschedule", state:"awaiting_reschedule_time", memory:oldMemory, source:"rule", choices:slots.slice(0,8).map((slot) => slot.time), dataSource:"agenda" };
    const memory = { ...oldMemory, date, time };
    return { reply:`Certo. Remarcar ${current.serviceName} com ${current.barberName} para ${humanDate(date)} às ${time}. Confirma?`, intent:"reschedule", state:"awaiting_reschedule_confirmation", memory, source:"rule", choices:["Confirmar remarcação", "Escolher outro horário", "Cancelar alteração"], dataSource:"agenda" };
  }
  if (stage === "awaiting_reschedule_confirmation") {
    if (/\b(cancelar alteracao|desistir|voltar)\b/.test(normalized)) return menuDecision(context);
    if (/\b(escolher outro horario|outro horario)\b/.test(normalized)) return { reply:"Qual outro horário você prefere?", intent:"reschedule", state:"awaiting_reschedule_time", memory:{ ...oldMemory, time:"" }, source:"rule", dataSource:"agenda" };
    if (/\b(confirmar remarcacao|confirmar|confirma|sim|pode remarcar|remarca)\b/.test(normalized) && oldMemory.appointmentId && oldMemory.date && oldMemory.time) {
      return { reply:"", intent:"reschedule", state:"management_commit", memory:oldMemory, source:"rule", dataSource:"agenda", managementRequest:{ action:"reschedule", appointmentId:oldMemory.appointmentId, date:oldMemory.date, time:oldMemory.time } };
    }
    return { reply:"Confirma essa remarcação?", intent:"reschedule", state:"awaiting_reschedule_confirmation", memory:oldMemory, source:"rule", choices:["Confirmar remarcação", "Escolher outro horário", "Cancelar alteração"], dataSource:"agenda" };
  }
'''
replace_once("db/ca-atende.ts", '  if (stage === "awaiting_confirmation" && normalized === "cancelar") return menuDecision(context);', management_stages + '\n  if (stage === "awaiting_confirmation" && normalized === "cancelar") return menuDecision(context);')

replace_once(
    "db/ca-atende.ts",
    '  if (intent === "cancel" || intent === "reschedule") {\n    return { reply:defaultHandoff(context), intent, state:"human_takeover", memory, source:interpreted.source, handoff:true };\n  }',
    '  if (intent === "cancel") return beginManagementFlow("cancel", event, context, interpreted.source);\n  if (intent === "reschedule") return beginManagementFlow("reschedule", event, context, interpreted.source);'
)

management_commit = r'''
  if (decision.managementRequest) {
    const request = decision.managementRequest;
    if (event.messageRowId === 0) {
      decision = { ...decision, reply:"No modo teste eu não altero horários reais.", state:"", memory:{}, managementRequest:undefined, choices:[] };
    } else {
      try {
        if (request.action === "cancel") {
          const cancelled = await cancelWhatsappManagedBooking(context.organization.slug, event.phone, request.appointmentId, { skipWhatsappNotice:true });
          decision = { ...decision, reply:`Pronto. Seu ${cancelled.serviceName} com ${cancelled.barberName}, ${humanDate(cancelled.date)} às ${cancelled.time}, foi cancelado.`, state:"", memory:{}, managementRequest:undefined, choices:[] };
        } else {
          const rescheduled = await rescheduleWhatsappManagedBooking(context.organization.slug, event.phone, request.appointmentId, String(request.date || ""), String(request.time || ""), { skipWhatsappNotice:true });
          const when = `${humanDate(rescheduled.date)} às ${rescheduled.time}`;
          const reply = rescheduled.status === "Aguardando" ? `Pronto. Sua remarcação para ${when} foi registrada e está aguardando confirmação da barbearia.` : `Pronto. Seu horário foi remarcado para ${when}.`;
          decision = { ...decision, reply, state:"", memory:{}, managementRequest:undefined, choices:[] };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não consegui alterar o horário.";
        const needsHuman = /menos de 2 horas/i.test(message);
        decision = { ...decision, reply:message, state:needsHuman ? "human_takeover" : "", memory:{}, managementRequest:undefined, choices:needsHuman ? [] : ["Ver opções"], handoff:needsHuman };
      }
    }
  }

'''
replace_once("db/ca-atende.ts", '  if (decision.bookingRequest) {', management_commit + '  if (decision.bookingRequest) {')

for path in ["tests/ca-atende-conversations.test.mjs", "tests/ca-atende-master-scenarios.test.mjs"]:
    p = Path(path)
    text = p.read_text()
    if 'listWhatsappManagedBookings' not in text:
        text = text.replace(
            'export async function getPublicBookingSlotsExpanded',
            'export async function listWhatsappManagedBookings(){ return globalThis.__caManagedBookings || []; }\nexport async function cancelWhatsappManagedBooking(){ throw Error("No real cancellation in tests"); }\nexport async function rescheduleWhatsappManagedBooking(){ throw Error("No real reschedule in tests"); }\nexport async function getPublicBookingSlotsExpanded',
            1,
        )
        p.write_text(text)
