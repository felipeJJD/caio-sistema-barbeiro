from pathlib import Path


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho, encontrado {count}: {old[:120]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "db/dashboard.ts",
    '''  if (pixPaymentVerified) {
    requireOwner(access);
    if (!(["Aguardando pagamento", "Aguardando"].includes(existing.status)) || existing.paymentChoice !== "Pix") throw new Error("Este agendamento não aguarda confirmação de Pix. Atualize a agenda.");
  } else if (existing.status !== "Aguardando") {
    throw new Error("Este agendamento não está aguardando confirmação. Atualize a agenda.");
  } else if (existing.paymentChoice === "Pix") {
    throw new Error("O recebimento do Pix precisa ser conferido pelo proprietário.");
  }''',
    '''  if (pixPaymentVerified) {
    if (!(["Aguardando pagamento", "Aguardando"].includes(existing.status)) || existing.paymentChoice !== "Pix") throw new Error("Este agendamento não aguarda confirmação de Pix. Atualize a agenda.");
  } else if (existing.status !== "Aguardando") {
    throw new Error("Este agendamento não está aguardando confirmação. Atualize a agenda.");
  } else if (existing.paymentChoice === "Pix") {
    throw new Error("O recebimento do Pix precisa ser conferido antes de confirmar.");
  }''',
)

replace_once(
    "db/dashboard.ts",
    '''export async function rescheduleAppointmentFromAgenda(access: AccessContext, input: { id: number; appointmentDate: string; appointmentTime: string; barberId: number }) {
  const db = await getDb();
  const existing = (await db.select().from(appointments).where(and(eq(appointments.id, input.id), eq(appointments.organizationId, access.organizationId))).limit(1))[0];
  if (!existing) throw new Error("Agendamento não encontrado.");
  requireOwnBarber(access, existing.barberId);
  await saveAppointment(access, {
    id: existing.id, appointmentDate: input.appointmentDate, appointmentTime: input.appointmentTime,
    clientName: existing.clientName, phone: existing.phone, serviceId: existing.serviceId, barberId: input.barberId, notes: existing.notes,
  });
}''',
    '''export async function rescheduleAppointmentFromAgenda(access: AccessContext, input: { id: number; appointmentDate: string; appointmentTime: string; barberId: number }) {
  const db = await getDb();
  const existing = (await db.select().from(appointments).where(and(eq(appointments.id, input.id), eq(appointments.organizationId, access.organizationId))).limit(1))[0];
  if (!existing) throw new Error("Agendamento não encontrado.");
  requireOwnBarber(access, existing.barberId);
  const changed = existing.appointmentDate !== input.appointmentDate
    || existing.appointmentTime !== input.appointmentTime
    || existing.barberId !== input.barberId;
  await saveAppointment(access, {
    id: existing.id, appointmentDate: input.appointmentDate, appointmentTime: input.appointmentTime,
    clientName: existing.clientName, phone: existing.phone, serviceId: existing.serviceId, barberId: input.barberId, notes: existing.notes,
  });
  if (changed && existing.status === "Agendado") {
    const queued = await queueAppointmentWhatsappSafely("rescheduled", existing.id);
    if (queued.queued) await processConnectedWhatsappQueueSafely(access.organizationId, 3);
  }
}''',
)

replace_once(
    "app/ui/dashboard-app.tsx",
    '''            {data.viewer.isOwner && item.paymentChoice === "Pix" && (item.status === "Aguardando pagamento" || item.status === "Aguardando") && <button className="confirm whatsapp-confirm" disabled={pending} title="Confirmar após conferir o recebimento do Pix" onClick={() => confirmPix(item)}>Confirmar Pix e horário</button>}''',
    '''            {(data.viewer.isOwner || item.barberId === data.viewer.teamMemberId) && item.paymentChoice === "Pix" && (item.status === "Aguardando pagamento" || item.status === "Aguardando") && <button className="confirm whatsapp-confirm" disabled={pending} title="Confirmar após conferir o recebimento do Pix" onClick={() => confirmPix(item)}>Confirmar Pix e horário</button>}''',
)

replace_once(
    "db/evolution-whatsapp.ts",
    '''    const systemSendInFlight = (await db.select({ id:whatsappMessages.id }).from(whatsappMessages).where(and(
      eq(whatsappMessages.organizationId, connection.organizationId),
      eq(whatsappMessages.phone, phone),
      eq(whatsappMessages.direction, "outbound"),
      eq(whatsappMessages.status, "sending"),
    )).limit(1))[0];
    if (systemSendInFlight?.id) return { received:0, statuses:0, inboundTextEvents:[] };
''',
    '''    const systemSendsInFlight = await db.select({
      id:whatsappMessages.id,
      kind:whatsappMessages.kind,
      payloadJson:whatsappMessages.payloadJson,
    }).from(whatsappMessages).where(and(
      eq(whatsappMessages.organizationId, connection.organizationId),
      eq(whatsappMessages.phone, phone),
      eq(whatsappMessages.direction, "outbound"),
      eq(whatsappMessages.status, "sending"),
    )).limit(5);
    const normalizedOutgoingText = text.replace(/\\s+/g, " ").trim();
    const matchingSystemEcho = systemSendsInFlight.some((message) => {
      if (!normalizedOutgoingText) return false;
      try {
        const queuedPayload = JSON.parse(message.payloadJson || "{}") as Record<string, string>;
        const queuedText = evolutionText(message.kind, queuedPayload).replace(/\\s+/g, " ").trim();
        return queuedText === normalizedOutgoingText;
      } catch {
        return false;
      }
    });
    if (matchingSystemEcho) return { received:0, statuses:0, inboundTextEvents:[] };
''',
)

replace_once(
    "tests/evolution-human-takeover-contract.test.mjs",
    '''test("eco de mensagem do próprio sistema não é confundido com atendimento humano",()=>{
  assert.match(source,/knownSystemMessage/);
  assert.match(source,/systemSendInFlight/);
  assert.match(source,/providerMessageId/);
  assert.match(source,/direction, "outbound"/);
});''',
    '''test("eco de mensagem do próprio sistema não é confundido com atendimento humano",()=>{
  assert.match(source,/knownSystemMessage/);
  assert.match(source,/systemSendsInFlight/);
  assert.match(source,/matchingSystemEcho/);
  assert.match(source,/normalizedOutgoingText/);
  assert.match(source,/evolutionText\\(message\\.kind, queuedPayload\\)/);
  assert.match(source,/providerMessageId/);
  assert.match(source,/direction, "outbound"/);
});''',
)

Path("tests/agenda-employee-whatsapp-contract.test.mjs").write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport fs from "node:fs";\n\nconst dashboard=fs.readFileSync(new URL("../db/dashboard.ts",import.meta.url),"utf8");\nconst ui=fs.readFileSync(new URL("../app/ui/dashboard-app.tsx",import.meta.url),"utf8");\n\ntest("funcionário pode confirmar Pix somente no próprio agendamento",()=>{\n  const start=dashboard.indexOf("export async function confirmAppointment");\n  const end=dashboard.indexOf("export async function completeAppointment",start);\n  const body=dashboard.slice(start,end);\n  assert.match(body,/requireOwnBarber\\(access, existing\\.barberId\\)/);\n  assert.doesNotMatch(body,/requireOwner\\(access\\)/);\n  assert.match(ui,/\\(data\\.viewer\\.isOwner \\|\\| item\\.barberId === data\\.viewer\\.teamMemberId\\).*item\\.paymentChoice === "Pix"/);\n});\n\ntest("confirmar horário continua enviando confirmação automática",()=>{\n  const start=dashboard.indexOf("export async function confirmAppointment");\n  const end=dashboard.indexOf("export async function completeAppointment",start);\n  const body=dashboard.slice(start,end);\n  assert.match(body,/queueAppointmentWhatsappSafely\\("confirmation", id\\)/);\n  assert.match(body,/processConnectedWhatsappQueueSafely\\(access\\.organizationId, 3\\)/);\n});\n\ntest("remarcação confirmada dispara WhatsApp e preserva isolamento",()=>{\n  const start=dashboard.indexOf("export async function rescheduleAppointmentFromAgenda");\n  const end=dashboard.indexOf("export async function cancelAppointment",start);\n  const body=dashboard.slice(start,end);\n  assert.match(body,/eq\\(appointments\\.organizationId, access\\.organizationId\\)/);\n  assert.match(body,/requireOwnBarber\\(access, existing\\.barberId\\)/);\n  assert.match(body,/existing\\.status === "Agendado"/);\n  assert.match(body,/queueAppointmentWhatsappSafely\\("rescheduled", existing\\.id\\)/);\n  assert.match(body,/processConnectedWhatsappQueueSafely\\(access\\.organizationId, 3\\)/);\n});\n''', encoding="utf-8")

print("Correções de equipe/WhatsApp aplicadas.")
