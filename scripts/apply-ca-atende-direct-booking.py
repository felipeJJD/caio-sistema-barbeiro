from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho, encontrado {count}: {old[:120]!r}")
    p.write_text(text.replace(old, new, 1))


# lib/ca-atende.ts: preservar nome e forma de pagamento na memória da conversa.
replace_once(
    "lib/ca-atende.ts",
    '  barber?: string;\n  // The customer\'s explicit selection is kept separate from the last displayed options.\n',
    '  barber?: string;\n  clientName?: string;\n  paymentChoice?: string;\n  // The customer\'s explicit selection is kept separate from the last displayed options.\n',
)
replace_once(
    "lib/ca-atende.ts",
    '    barber: next.barber || memory.barber || "",\n    afterTime: next.afterTime || memory.afterTime || "",\n',
    '    barber: next.barber || memory.barber || "",\n    clientName: next.clientName || memory.clientName || "",\n    paymentChoice: next.paymentChoice || memory.paymentChoice || "",\n    afterTime: next.afterTime || memory.afterTime || "",\n',
)

# db/whatsapp.ts: carregar o nome do perfil quando o provedor disponibilizar.
replace_once(
    "db/whatsapp.ts",
    '  phone: string;\n  text: string;\n',
    '  phone: string;\n  senderName?: string;\n  text: string;\n',
)

# db/evolution-whatsapp.ts: aproveitar pushName da Evolution.
replace_once(
    "db/evolution-whatsapp.ts",
    '  const receivedAt = evolutionTimestamp(data.messageTimestamp ?? body.date_time ?? body.dateTime);\n',
    '  const senderName = String(data.pushName ?? data.notifyName ?? "").trim().slice(0, 120);\n  const receivedAt = evolutionTimestamp(data.messageTimestamp ?? body.date_time ?? body.dateTime);\n',
)
replace_once(
    "db/evolution-whatsapp.ts",
    '  const inboundTextEvents: WhatsappInboundTextEvent[] = text ? [{ organizationId:connection.organizationId, messageRowId:inserted[0].id, providerMessageId, phone, text, receivedAt }] : [];\n',
    '  const inboundTextEvents: WhatsappInboundTextEvent[] = text ? [{ organizationId:connection.organizationId, messageRowId:inserted[0].id, providerMessageId, phone, senderName:senderName || undefined, text, receivedAt }] : [];\n',
)

# db/whatsapp.ts: agendar somente o lembrete quando a confirmação já é feita pelo bot.
anchor = '''export async function queueAppointmentWhatsappSafely(kind: Exclude<WhatsappAutomationKind, "reminder">, appointmentId: number) {\n  try {\n    return await queueAppointmentWhatsapp(kind, appointmentId);\n  } catch (error) {\n    console.error("WhatsApp automation queue failed", error);\n    return { queued: false, reason: "queue_error" as const };\n  }\n}\n\n'''
addition = anchor + '''export async function queueAppointmentReminderOnly(appointmentId: number) {\n  const appointment = await appointmentContext(appointmentId);\n  if (!appointment) return { queued:false, reason:"appointment_not_found" as const };\n  const [settings, connection] = await Promise.all([\n    settingsForOrganization(appointment.organizationId),\n    connectionForOrganization(appointment.organizationId),\n  ]);\n  const entitlement = await getWhatsappEntitlementForOrganization(appointment.organizationId, Number(settings.monthlyMessageLimit));\n  if (!settings.enabled || !settings.reminderEnabled || !connection || connection.status !== "connected" || !entitlement.hasAccess) {\n    return { queued:false, reason:"automation_inactive" as const };\n  }\n  const reminderAt = whatsappReminderAt(appointment.appointmentDate, appointment.appointmentTime, Number(settings.reminderHoursBefore));\n  if (!reminderAt) return { queued:false, reason:"invalid_schedule" as const };\n  const queued = await enqueueMessage("reminder", appointment, settings, reminderAt);\n  return { queued, reason:queued ? "queued" as const : "duplicate_or_disabled" as const };\n}\n\nexport async function queueAppointmentReminderOnlySafely(appointmentId: number) {\n  try {\n    return await queueAppointmentReminderOnly(appointmentId);\n  } catch (error) {\n    console.error("WhatsApp reminder queue failed", error);\n    return { queued:false, reason:"queue_error" as const };\n  }\n}\n\n'''
replace_once("db/whatsapp.ts", anchor, addition)

# db/public-booking.ts: reaproveitar a criação segura, mas sem mandar uma confirmação duplicada.
replace_once(
    "db/public-booking.ts",
    'import { processWhatsappQueueSafely, queueAppointmentWhatsappSafely } from "./whatsapp";\n',
    'import { processWhatsappQueueSafely, queueAppointmentReminderOnlySafely, queueAppointmentWhatsappSafely } from "./whatsapp";\n',
)
replace_once(
    "db/public-booking.ts",
    'export async function createPublicBooking(slug: string, input: { date: string; time: string; serviceId: number; barberId: number; clientName: string; phone: string; paymentChoice: string; isMembership?: boolean; membershipClientId?: number }) {\n',
    'export async function createPublicBooking(slug: string, input: { date: string; time: string; serviceId: number; barberId: number; clientName: string; phone: string; paymentChoice: string; isMembership?: boolean; membershipClientId?: number }, options: { source?: "public" | "ca_atende"; skipImmediateWhatsappConfirmation?: boolean } = {}) {\n',
)
replace_once(
    "db/public-booking.ts",
    '      "Solicitado pelo link público",\n',
    '      options.source === "ca_atende" ? "Solicitado pelo C.A. Atende" : "Solicitado pelo link público",\n',
)
replace_once(
    "db/public-booking.ts",
    '''  if (status === "Agendado") {\n    const queued = await queueAppointmentWhatsappSafely("confirmation", appointmentId);\n    if (queued.queued) await processWhatsappQueueSafely(data.organization.id, 3);\n  }\n''',
    '''  if (status === "Agendado") {\n    const queued = options.skipImmediateWhatsappConfirmation\n      ? await queueAppointmentReminderOnlySafely(appointmentId)\n      : await queueAppointmentWhatsappSafely("confirmation", appointmentId);\n    if (queued.queued) await processWhatsappQueueSafely(data.organization.id, 3);\n  }\n''',
)

# db/ca-atende.ts: transformar a confirmação em gravação real do agendamento.
replace_once(
    "db/ca-atende.ts",
    'import { appDate } from "../lib/app-date";\n',
    'import { appDate } from "../lib/app-date";\nimport { validClientName } from "../lib/client-name";\n',
)
replace_once(
    "db/ca-atende.ts",
    'import { getPublicBookingSlotsExpanded } from "./public-booking";\n',
    'import { createPublicBooking, getPublicBookingData, getPublicBookingSlotsExpanded } from "./public-booking";\n',
)
replace_once(
    "db/ca-atende.ts",
    '      barber: String(parsed.barber || "").slice(0,120),\n      afterTime: String(parsed.afterTime || "").slice(0,5),\n',
    '      barber: String(parsed.barber || "").slice(0,120),\n      clientName: String(parsed.clientName || "").slice(0,120),\n      paymentChoice: String(parsed.paymentChoice || "").slice(0,30),\n      afterTime: String(parsed.afterTime || "").slice(0,5),\n',
)
replace_once(
    "db/ca-atende.ts",
    '  confirmationRequested?: boolean;\n  choices?: string[];\n};\n',
    '  confirmationRequested?: boolean;\n  choices?: string[];\n  bookingRequest?: { date:string; time:string; serviceId:number; barberId:number; clientName:string; paymentChoice:string };\n};\n',
)

helpers_anchor = '''const mainChoices = ["Agendar horário", "Ver horários disponíveis", "Preços e serviços", "Cancelar ou remarcar", "Falar com a barbearia"];\nconst bookingChoices = ["Agendar pelo link", "Quero ajuda por aqui"];\n\n'''
helpers = helpers_anchor + '''function safeClientName(value: string | undefined) {\n  if (!value) return "";\n  try {\n    return validClientName(value, 120);\n  } catch {\n    return "";\n  }\n}\n\nasync function bookingPaymentChoices(context: CaAtendeRuntimeContext) {\n  const data = await getPublicBookingData(context.organization.slug);\n  if (!data) return [] as string[];\n  return [\n    data.payments.pixEnabled && "Pix",\n    data.payments.cashEnabled && "Dinheiro",\n    data.payments.debitEnabled && "Débito",\n    data.payments.creditEnabled && "Crédito",\n  ].filter(Boolean) as string[];\n}\n\nfunction paymentChoiceFromText(value: string, available: string[]) {\n  const text = normalizeCaAtendeText(value);\n  const exact = available.find(item => normalizeCaAtendeText(item) === text);\n  if (exact) return exact;\n  if (/\\bpix\\b/.test(text) && available.includes("Pix")) return "Pix";\n  if (/\\b(dinheiro|especie)\\b/.test(text) && available.includes("Dinheiro")) return "Dinheiro";\n  if (/\\bdebito\\b/.test(text) && available.includes("Débito")) return "Débito";\n  if (/\\bcredito\\b/.test(text) && available.includes("Crédito")) return "Crédito";\n  if (/\\bcartao\\b/.test(text)) {\n    const cardChoices = available.filter(item => item === "Débito" || item === "Crédito");\n    if (cardChoices.length === 1) return cardChoices[0];\n  }\n  return "";\n}\n\nfunction bookingRequestFromMemory(context: CaAtendeRuntimeContext, memory: CaAtendeContextMemory) {\n  const service = memory.service ? findNamedItem(memory.service, memory.service, context.services) : null;\n  const barber = memory.barber ? findNamedItem(memory.barber, memory.barber, context.barbers) : null;\n  const clientName = safeClientName(memory.clientName);\n  const paymentChoice = String(memory.paymentChoice || "");\n  if (!service || !barber || !memory.date || !memory.time || !clientName || !paymentChoice) return null;\n  return {\n    date:memory.date,\n    time:memory.time,\n    serviceId:service.id,\n    barberId:barber.id,\n    clientName,\n    paymentChoice,\n  };\n}\n\n'''
replace_once("db/ca-atende.ts", helpers_anchor, helpers)

# Adicionar os novos estados de coleta mínima antes de seguir para IA.
stage_anchor = '''  if (stage === "awaiting_confirmation" && normalized === "escolher outro horario") {\n    return { reply:"Qual outro horário você prefere?", intent:oldMemory.intent || "booking", state:"awaiting_booking_choice", memory:{ ...oldMemory, time:"" }, source:"rule" };\n  }\n'''
stage_addition = stage_anchor + '''  if (stage === "awaiting_client_name") {\n    const clientName = safeClientName(event.text);\n    if (!clientName) {\n      return { reply:"Me diga somente seu nome para eu concluir o agendamento.", intent:"booking", state:"awaiting_client_name", memory:oldMemory, source:"rule" };\n    }\n    const payments = await bookingPaymentChoices(context);\n    if (!payments.length) {\n      return { reply:"Não encontrei uma forma de pagamento liberada para concluir agora. Vou chamar alguém da barbearia.", intent:"human", state:"human_takeover", memory:{ ...oldMemory, clientName }, source:"rule", handoff:true };\n    }\n    const baseMemory = mergeCaAtendeMemory(oldMemory, { clientName });\n    if (payments.length > 1) {\n      return { reply:"Perfeito. Como prefere pagar?", intent:"booking", state:"awaiting_payment", memory:baseMemory, source:"rule", choices:payments };\n    }\n    const readyMemory = mergeCaAtendeMemory(baseMemory, { paymentChoice:payments[0] });\n    const request = bookingRequestFromMemory(context, readyMemory);\n    if (!request) return { reply:"Perdi algum detalhe do horário. Me diga novamente o serviço, dia e horário que você quer.", intent:"booking", state:"awaiting_booking_details", memory:readyMemory, source:"rule" };\n    return { reply:"", intent:"booking", state:"booking_commit", memory:readyMemory, source:"rule", bookingRequest:request };\n  }\n  if (stage === "awaiting_payment") {\n    const payments = await bookingPaymentChoices(context);\n    const paymentChoice = paymentChoiceFromText(event.text, payments);\n    if (!paymentChoice) {\n      return { reply:"Qual forma de pagamento você prefere?", intent:"booking", state:"awaiting_payment", memory:oldMemory, source:"rule", choices:payments };\n    }\n    const readyMemory = mergeCaAtendeMemory(oldMemory, { paymentChoice });\n    const request = bookingRequestFromMemory(context, readyMemory);\n    if (!request) return { reply:"Perdi algum detalhe do horário. Me diga novamente o serviço, dia e horário que você quer.", intent:"booking", state:"awaiting_booking_details", memory:readyMemory, source:"rule" };\n    return { reply:"", intent:"booking", state:"booking_commit", memory:readyMemory, source:"rule", bookingRequest:request };\n  }\n'''
replace_once("db/ca-atende.ts", stage_anchor, stage_addition)

replace_once(
    "db/ca-atende.ts",
    '  const bookingState = stage === "awaiting_booking_details" || stage === "awaiting_booking_choice" || stage === "awaiting_availability_details" || stage === "awaiting_service" || stage === "awaiting_professional" || stage === "awaiting_confirmation" || stage.startsWith("services_page:") || stage === "test_confirmation";\n',
    '  const bookingState = stage === "awaiting_booking_details" || stage === "awaiting_booking_choice" || stage === "awaiting_availability_details" || stage === "awaiting_service" || stage === "awaiting_professional" || stage === "awaiting_confirmation" || stage === "awaiting_client_name" || stage === "awaiting_payment" || stage === "booking_commit" || stage.startsWith("services_page:") || stage === "test_confirmation";\n',
)

old_confirm = '''    if (confirmingBooking && selectedService && date && desiredTime && (stage === "awaiting_confirmation" || stage === "test_confirmation")) {\n      const confirmedBarber = selectedBarber || previousBarber;\n      return {\n        reply:`Perfeito. Entendi sua confirmação: ${selectedService.name}${confirmedBarber ? ` com ${confirmedBarber.name}` : ""}, ${humanDate(date)} às ${desiredTime}. Para concluir o agendamento real com segurança, finalize aqui: ${bookingLink(context.organization.slug)}`,\n        intent:preservedIntent,\n        state:"test_confirmation",\n        memory:mergeCaAtendeMemory(nextMemory, { barber:confirmedBarber?.name || "" }),\n        source:"rule",\n        dataSource:"agenda",\n        confirmationRequested:true,\n      };\n    }\n'''
new_confirm = '''    if (confirmingBooking && selectedService && date && desiredTime && (stage === "awaiting_confirmation" || stage === "test_confirmation")) {\n      const confirmedBarber = selectedBarber || previousBarber;\n      const confirmedMemory = mergeCaAtendeMemory(nextMemory, { barber:confirmedBarber?.name || "" });\n      if (event.providerMessageId === "test" && event.messageRowId === 0) {\n        return {\n          reply:`Perfeito. Entendi sua confirmação: ${selectedService.name}${confirmedBarber ? ` com ${confirmedBarber.name}` : ""}, ${humanDate(date)} às ${desiredTime}.`,\n          intent:preservedIntent, state:"test_confirmation", memory:confirmedMemory, source:"rule", dataSource:"agenda", confirmationRequested:true,\n        };\n      }\n      if (!confirmedBarber) {\n        return { reply:"Qual profissional você prefere para eu concluir?", intent:preservedIntent, state:"awaiting_professional", memory:confirmedMemory, source:"rule", choices:professionalChoices(context) };\n      }\n      const clientName = safeClientName(confirmedMemory.clientName) || safeClientName(event.senderName);\n      if (!clientName) {\n        return {\n          reply:"Perfeito. Antes de concluir, qual seu nome? Não precisa repetir serviço, profissional, dia nem horário.",\n          intent:preservedIntent, state:"awaiting_client_name", memory:mergeCaAtendeMemory(confirmedMemory, { clientName:"" }), source:"rule", dataSource:"agenda",\n        };\n      }\n      const payments = await bookingPaymentChoices(context);\n      if (!payments.length) {\n        return { reply:"Seu horário está montado, mas não encontrei uma forma de pagamento liberada. Vou chamar alguém da barbearia para concluir.", intent:"human", state:"human_takeover", memory:mergeCaAtendeMemory(confirmedMemory, { clientName }), source:"rule", handoff:true };\n      }\n      let paymentChoice = paymentChoiceFromText(confirmedMemory.paymentChoice || "", payments);\n      if (!paymentChoice && payments.length === 1) paymentChoice = payments[0];\n      if (!paymentChoice) {\n        return {\n          reply:"Só falta a forma de pagamento. Como prefere pagar?", intent:preservedIntent, state:"awaiting_payment",\n          memory:mergeCaAtendeMemory(confirmedMemory, { clientName }), source:"rule", dataSource:"agenda", choices:payments,\n        };\n      }\n      const readyMemory = mergeCaAtendeMemory(confirmedMemory, { clientName, paymentChoice });\n      const request = bookingRequestFromMemory(context, readyMemory);\n      if (!request) return { reply:"Perdi algum detalhe do horário. Me diga novamente o serviço, dia e horário que você quer.", intent:preservedIntent, state:"awaiting_booking_details", memory:readyMemory, source:"rule" };\n      return { reply:"", intent:preservedIntent, state:"booking_commit", memory:readyMemory, source:"rule", dataSource:"agenda", bookingRequest:request };\n    }\n'''
replace_once("db/ca-atende.ts", old_confirm, new_confirm)

replace_once(
    "db/ca-atende.ts",
    '        reply:`Não consegui consultar a agenda agora. Tenta me mandar o dia e o serviço novamente ou use ${bookingLink(context.organization.slug)}.`,\n',
    '        reply:"Não consegui consultar a agenda agora. Tenta me mandar o dia e o serviço novamente que eu consulto de novo.",\n',
)

# Executar a gravação real antes de enfileirar a resposta textual.
replace_once(
    "db/ca-atende.ts",
    '  const decision = guarded.decision;\n  const now = new Date().toISOString();\n\n  if (decision.spam) {\n',
    '''  let decision = guarded.decision;\n  const now = new Date().toISOString();\n\n  if (decision.bookingRequest) {\n    const request = decision.bookingRequest;\n    try {\n      const booking = await createPublicBooking(context.organization.slug, {\n        ...request,\n        phone:event.phone,\n      }, { source:"ca_atende", skipImmediateWhatsappConfirmation:true });\n      const when = `${humanDate(request.date)} às ${request.time}`;\n      let reply = `Pronto! ${booking.serviceName} com ${booking.barberName} ficou agendado para ${when}.`;\n      if (booking.status === "Aguardando") {\n        reply = `Pronto! Seu pedido de ${booking.serviceName} com ${booking.barberName} para ${when} foi registrado e está aguardando confirmação da barbearia.`;\n      } else if (booking.status === "Aguardando pagamento") {\n        reply = `Separei ${booking.serviceName} com ${booking.barberName} para ${when}. O agendamento está aguardando o pagamento por Pix.${booking.pixKey ? ` Chave Pix: ${booking.pixKey}.` : ""}`;\n      }\n      decision = { ...decision, reply, state:"", memory:{}, bookingRequest:undefined, confirmationRequested:false, choices:[] };\n    } catch (error) {\n      const message = error instanceof Error ? error.message : "Não foi possível concluir o agendamento.";\n      if (/acabou de ser ocupado/i.test(message)) {\n        const slots = await getPublicBookingSlotsExpanded(context.organization.slug, request.date, request.serviceId, request.barberId).catch(() => []);\n        const alternatives = slots.filter(slot => slot.time !== request.time).slice(0, 6);\n        decision = {\n          ...decision,\n          reply:alternatives.length\n            ? `Esse horário acabou de ser ocupado. Tenho ${slotSummary(alternatives)}. Qual desses fica melhor?`\n            : "Esse horário acabou de ser ocupado e não encontrei outro próximo agora. Me diga outro horário ou outro dia.",\n          state:"awaiting_booking_choice",\n          memory:{ ...decision.memory, time:"" },\n          bookingRequest:undefined,\n          confirmationRequested:false,\n          choices:alternatives.map(slot => `${slot.barberName} · ${slot.time}`),\n        };\n      } else {\n        decision = {\n          ...decision,\n          reply:`Não consegui concluir o agendamento agora: ${message} Me diga se quer tentar outro horário.`,\n          state:"awaiting_confirmation",\n          bookingRequest:undefined,\n          confirmationRequested:false,\n          choices:["Confirmar", "Escolher outro horário", "Cancelar"],\n        };\n      }\n    }\n  }\n\n  if (decision.spam) {\n''',
)

# Contrato de regressão novo.
Path("tests/ca-atende-direct-booking-contract.test.mjs").write_text('''import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\n\nconst [bot, publicBooking, whatsapp, evolution, memory] = await Promise.all([\n  readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),\n  readFile(new URL("../db/public-booking.ts", import.meta.url), "utf8"),\n  readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8"),\n  readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url), "utf8"),\n  readFile(new URL("../lib/ca-atende.ts", import.meta.url), "utf8"),\n]);\n\ntest("C.A. Atende conclui agendamento real sem devolver o cliente ao link", () => {\n  assert.match(bot, /createPublicBooking\\(context\\.organization\\.slug/);\n  assert.match(bot, /source:\"ca_atende\"/);\n  assert.match(bot, /skipImmediateWhatsappConfirmation:true/);\n  assert.doesNotMatch(bot, /Para concluir o agendamento real com segurança, finalize aqui/);\n});\n\ntest("coleta somente dados ausentes e preserva contexto", () => {\n  assert.match(bot, /awaiting_client_name/);\n  assert.match(bot, /awaiting_payment/);\n  assert.match(memory, /clientName\\?: string/);\n  assert.match(memory, /paymentChoice\\?: string/);\n});\n\ntest("Evolution repassa pushName como nome opcional do cliente", () => {\n  assert.match(whatsapp, /senderName\\?: string/);\n  assert.match(evolution, /data\\.pushName/);\n  assert.match(evolution, /senderName:senderName \\|\\| undefined/);\n});\n\ntest("agendamento pelo bot mantém lembrete sem duplicar confirmação", () => {\n  assert.match(publicBooking, /queueAppointmentReminderOnlySafely/);\n  assert.match(whatsapp, /export async function queueAppointmentReminderOnly/);\n  assert.match(publicBooking, /Solicitado pelo C\\.A\\. Atende/);\n});\n''')
