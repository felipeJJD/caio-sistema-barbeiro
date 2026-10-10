import { and, eq } from "drizzle-orm";
import { appointmentStartTimestamp } from "../lib/app-date";
import { normalizeWhatsappPhone } from "../lib/whatsapp";
import { getDb } from "./index";
import { appointments, whatsappMessages } from "./schema";

type QueuedMessage = Pick<typeof whatsappMessages.$inferSelect, "id" | "organizationId" | "appointmentId" | "kind" | "phone" | "payloadJson">;

export async function cancelInvalidAppointmentMessage(message: QueuedMessage, nowMs = Date.now()) {
  if (message.kind === "bot_text") return false;
  const db = await getDb();
  let reason = "";
  const appointment = message.appointmentId
    ? (await db.select().from(appointments).where(and(
      eq(appointments.id, message.appointmentId),
      eq(appointments.organizationId, message.organizationId),
    )).limit(1))[0]
    : null;
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(message.payloadJson); } catch { reason = "Conteúdo do agendamento inválido."; }
  if (!reason && (!payload || typeof payload !== "object" || Array.isArray(payload))) reason = "Conteúdo do agendamento inválido.";
  if (!reason && !["confirmation", "reminder", "cancellation", "rescheduled"].includes(message.kind)) reason = "Tipo de mensagem de agendamento inválido.";
  if (!reason && !appointment) reason = "Agendamento não encontrado nesta barbearia.";
  if (!reason && appointment) {
    const phone = normalizeWhatsappPhone(appointment.phone);
    if (!phone || phone !== message.phone) reason = "O telefone do agendamento mudou; a mensagem antiga não será enviada.";
    else if (payload.date !== appointment.appointmentDate || payload.time !== appointment.appointmentTime) reason = "O horário foi alterado; a mensagem antiga não será enviada.";
    else if (payload.clientName !== appointment.clientName) reason = "O cliente do agendamento mudou; a mensagem antiga não será enviada.";
    else if (message.kind === "cancellation") {
      if (appointment.status !== "Cancelado") reason = "O agendamento não está mais cancelado.";
    } else if (appointment.status !== "Agendado") reason = "O agendamento não está confirmado ou já foi encerrado.";
    else {
      const start = appointmentStartTimestamp(appointment.appointmentDate, appointment.appointmentTime);
      if (!Number.isFinite(start) || start <= nowMs) reason = "O horário já passou; a mensagem não será enviada.";
    }
  }
  if (!reason) return false;
  const cancelled = await db.update(whatsappMessages).set({
    status: "cancelled", errorText: reason, updatedAt: new Date(nowMs).toISOString(),
  }).where(and(eq(whatsappMessages.id, message.id), eq(whatsappMessages.status, "sending"))).returning({ id: whatsappMessages.id });
  if (cancelled.length) console.info("[whatsapp:appointment-message-cancelled]", {
    organizationId: message.organizationId, messageId: message.id, appointmentId: message.appointmentId, reason,
  });
  return true;
}
