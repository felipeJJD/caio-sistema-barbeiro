import { and, desc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { sendPushBatch, topicFromString, type PushSubscriptionData } from "@mmmike/web-push/send";
import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { getDb } from "./index";
import { appNotifications, pushSubscriptions, team } from "./schema";

export type AppNotification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  target: string;
  relatedRecordId: number | null;
  readAt: string | null;
  createdAt: string;
};

type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type AttendanceNotification = {
  recordId: number;
  clientName: string;
  serviceName: string;
  recordType: string;
  valueCents: number;
};

type PublicBookingNotification = {
  organizationId: number;
  appointmentId: number;
  clientName: string;
  serviceName: string;
  barberName: string;
  date: string;
  time: string;
  status: string;
};

type AppointmentCancellationNotification = {
  appointmentId: number;
  clientName: string;
  date: string;
  time: string;
};

type SubscriptionPaymentNotification = {
  organizationId: number;
  paymentId: number;
  amountCents: number;
  periodDays: number;
};

async function vapidConfig() {
  const { env } = await import("@/runtime/env");
  const runtime = env as unknown as Record<string, unknown>;
  const publicKey = String(runtime.VAPID_PUBLIC_KEY ?? "");
  const privateKey = String(runtime.VAPID_PRIVATE_KEY ?? "");
  const subject = String(runtime.VAPID_SUBJECT ?? "");
  return { publicKey, privateKey, subject };
}

export async function getVapidPublicKey() {
  return (await vapidConfig()).publicKey;
}

function validPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return host === "fcm.googleapis.com"
      || host === "push.apple.com"
      || host.endsWith(".push.apple.com")
      || host === "push.services.mozilla.com"
      || host.endsWith(".push.services.mozilla.com")
      || host.endsWith(".notify.windows.com")
      || host.endsWith(".push.microsoft.com");
  } catch {
    return false;
  }
}

function notificationCutoff() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
}

async function removeExpiredNotifications(organizationId: number) {
  const db = await getDb();
  await db.delete(appNotifications).where(and(
    eq(appNotifications.organizationId, organizationId),
    lt(appNotifications.createdAt, notificationCutoff()),
  ));
}

export async function listNotifications(access: AccessContext): Promise<AppNotification[]> {
  if (!access.isOwner) return [];
  const db = await getDb();
  const cutoff = notificationCutoff();
  await removeExpiredNotifications(access.organizationId);
  return db.select({
    id: appNotifications.id,
    kind: appNotifications.kind,
    title: appNotifications.title,
    body: appNotifications.body,
    target: appNotifications.target,
    relatedRecordId: appNotifications.relatedRecordId,
    readAt: appNotifications.readAt,
    createdAt: appNotifications.createdAt,
  }).from(appNotifications).where(and(
    eq(appNotifications.organizationId, access.organizationId),
    eq(appNotifications.recipientTeamMemberId, access.teamMemberId),
    gte(appNotifications.createdAt, cutoff),
  )).orderBy(desc(appNotifications.createdAt), desc(appNotifications.id)).limit(40);
}

export async function savePushSubscription(access: AccessContext, subscription: SubscriptionInput, userAgent: string) {
  requireOwner(access);
  if (!validPushEndpoint(subscription.endpoint)) throw new Error("Este aparelho não forneceu uma inscrição de notificação válida.");
  if (!subscription.keys?.p256dh || !subscription.keys?.auth) throw new Error("Não foi possível identificar as chaves deste aparelho.");
  if (subscription.endpoint.length > 4096 || subscription.keys.p256dh.length > 512 || subscription.keys.auth.length > 256) throw new Error("A inscrição de notificação é inválida.");

  const now = new Date().toISOString();
  const db = await getDb();
  await db.insert(pushSubscriptions).values({
    organizationId: access.organizationId,
    teamMemberId: access.teamMemberId,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent.slice(0, 500),
    updatedAt: now,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: {
      organizationId: access.organizationId,
      teamMemberId: access.teamMemberId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent.slice(0, 500),
      updatedAt: now,
    },
  });
}

export async function removePushSubscription(access: AccessContext, endpoint: string) {
  requireOwner(access);
  if (!endpoint) return;
  const db = await getDb();
  await db.delete(pushSubscriptions).where(and(
    eq(pushSubscriptions.organizationId, access.organizationId),
    eq(pushSubscriptions.teamMemberId, access.teamMemberId),
    eq(pushSubscriptions.endpoint, endpoint),
  ));
}

export async function markNotificationsRead(access: AccessContext) {
  requireOwner(access);
  const db = await getDb();
  await db.update(appNotifications).set({ readAt: new Date().toISOString() }).where(and(
    eq(appNotifications.organizationId, access.organizationId),
    eq(appNotifications.recipientTeamMemberId, access.teamMemberId),
    isNull(appNotifications.readAt),
  ));
}

export async function deleteNotification(access: AccessContext, notificationId: number) {
  requireOwner(access);
  if (!Number.isInteger(notificationId) || notificationId <= 0) throw new Error("Notificação inválida.");
  const db = await getDb();
  await db.delete(appNotifications).where(and(
    eq(appNotifications.id, notificationId),
    eq(appNotifications.organizationId, access.organizationId),
    eq(appNotifications.recipientTeamMemberId, access.teamMemberId),
  ));
}

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

async function deliverOwnerNotification(input: {
  organizationId: number;
  actorTeamMemberId?: number;
  kind: string;
  title: string;
  body: string;
  target: string;
  relatedRecordId: number;
  tag: string;
  topic: string;
}) {
  const db = await getDb();
  await removeExpiredNotifications(input.organizationId);
  const owners = await db.select({ id: team.id }).from(team).where(and(
    eq(team.organizationId, input.organizationId),
    eq(team.accessRole, "owner"),
    eq(team.active, true),
  ));
  if (!owners.length) return;

  const ownerIds = owners.map((owner) => owner.id);
  const existing = await db.select({ recipientTeamMemberId: appNotifications.recipientTeamMemberId }).from(appNotifications).where(and(
    eq(appNotifications.organizationId, input.organizationId),
    eq(appNotifications.kind, input.kind),
    eq(appNotifications.relatedRecordId, input.relatedRecordId),
    inArray(appNotifications.recipientTeamMemberId, ownerIds),
  ));
  const existingRecipients = new Set(existing.map((item) => item.recipientTeamMemberId));
  const recipientIds = ownerIds.filter((id) => !existingRecipients.has(id));
  if (!recipientIds.length) return;

  await db.insert(appNotifications).values(recipientIds.map((recipientTeamMemberId) => ({
    organizationId: input.organizationId,
    recipientTeamMemberId,
    actorTeamMemberId: input.actorTeamMemberId ?? ownerIds[0],
    kind: input.kind,
    title: input.title,
    body: input.body,
    target: input.target,
    relatedRecordId: input.relatedRecordId,
  }))).onConflictDoNothing();

  const vapid = await vapidConfig();
  if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) return;
  const stored = await db.select().from(pushSubscriptions).where(and(
    eq(pushSubscriptions.organizationId, input.organizationId),
    inArray(pushSubscriptions.teamMemberId, recipientIds),
  ));
  if (!stored.length) return;
  const subscriptions: PushSubscriptionData[] = stored.map((item) => ({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }));
  const result = await sendPushBatch(subscriptions, {
    title: input.title,
    body: input.body,
    url: input.target,
    tag: input.tag,
  }, vapid, {
    ttl: 60 * 60 * 12,
    urgency: "normal",
    topic: await topicFromString(input.topic),
    concurrency: 10,
    timeoutMs: 8000,
  });
  if (result.gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, result.gone));
}

export async function notifyOwnersOfAppointmentCancellation(access: AccessContext, appointment: AppointmentCancellationNotification) {
  if (access.isOwner) return;
  try {
    const date = appointment.date.split("-").reverse().join("/");
    await deliverOwnerNotification({
      organizationId: access.organizationId,
      actorTeamMemberId: access.teamMemberId,
      kind: "appointment-cancelled",
      title: "Horário cancelado pela equipe",
      body: `${access.name} cancelou o horário de ${appointment.clientName} em ${date} às ${appointment.time}`,
      target: `/?section=Agenda&appointment=${appointment.appointmentId}`,
      relatedRecordId: appointment.appointmentId,
      tag: `appointment-cancelled-${appointment.appointmentId}`,
      topic: `appointment-cancelled:${appointment.appointmentId}`,
    });
  } catch {
    // O cancelamento nunca pode falhar por causa de uma notificação.
  }
}

export async function notifyOwnersOfSubscriptionPayment(payment: SubscriptionPaymentNotification) {
  try {
    await deliverOwnerNotification({
      organizationId: payment.organizationId,
      kind: "subscription-payment",
      title: "Pagamento Pix confirmado",
      body: `${money(payment.amountCents)} recebido · acesso liberado por ${payment.periodDays} dias`,
      target: "/?section=Meu%20plano",
      relatedRecordId: payment.paymentId,
      tag: `subscription-payment-${payment.paymentId}`,
      topic: `subscription-payment:${payment.paymentId}`,
    });
  } catch {
    // A liberação do plano nunca pode falhar por causa de uma notificação.
  }
}

export async function notifyOwnersOfAttendance(access: AccessContext, attendance: AttendanceNotification) {
  if (access.isOwner) return;

  try {
    const db = await getDb();
    const owners = await db.select({ id: team.id }).from(team).where(and(
      eq(team.organizationId, access.organizationId),
      eq(team.accessRole, "owner"),
      eq(team.active, true),
    ));
    if (!owners.length) return;

    const ownerIds = owners.map((owner) => owner.id);
    const title = "Novo atendimento registrado";
    const detail = attendance.recordType === "Mensalista" ? "Mensalista" : money(attendance.valueCents);
    const body = `${access.name} registrou ${attendance.clientName}: ${attendance.serviceName} · ${detail}`;
    const target = `/?section=Historico&record=${attendance.recordId}`;

    await db.insert(appNotifications).values(ownerIds.map((recipientTeamMemberId) => ({
      organizationId: access.organizationId,
      recipientTeamMemberId,
      actorTeamMemberId: access.teamMemberId,
      kind: "attendance",
      title,
      body,
      target,
      relatedRecordId: attendance.recordId,
    }))).onConflictDoNothing();

    const vapid = await vapidConfig();
    if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) return;

    const stored = await db.select().from(pushSubscriptions).where(and(
      eq(pushSubscriptions.organizationId, access.organizationId),
      inArray(pushSubscriptions.teamMemberId, ownerIds),
    ));
    if (!stored.length) return;

    const subscriptions: PushSubscriptionData[] = stored.map((item) => ({
      endpoint: item.endpoint,
      keys: { p256dh: item.p256dh, auth: item.auth },
    }));
    const result = await sendPushBatch(subscriptions, {
      title,
      body,
      url: target,
      tag: `attendance-${attendance.recordId}`,
    }, vapid, {
      ttl: 60 * 60 * 12,
      urgency: "normal",
      topic: await topicFromString(`attendance:${attendance.recordId}`),
      concurrency: 10,
      timeoutMs: 8000,
    });

    if (result.gone.length) {
      await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, result.gone));
    }
  } catch {
    // O atendimento nunca pode deixar de ser salvo por uma falha de notificação.
  }
}

export async function notifyOwnersOfPublicBooking(booking: PublicBookingNotification) {
  try {
    const db = await getDb();
    const owners = await db.select({ id: team.id }).from(team).where(and(
      eq(team.organizationId, booking.organizationId),
      eq(team.accessRole, "owner"),
      eq(team.active, true),
    ));
    if (!owners.length) return;

    const ownerIds = owners.map((owner) => owner.id);
    const title = booking.status === "Aguardando" ? "Novo horário aguardando confirmação" : "Novo horário agendado pelo site";
    const body = `${booking.clientName} solicitou ${booking.serviceName} com ${booking.barberName} em ${booking.date.split("-").reverse().join("/")} às ${booking.time}`;
    const target = `/?section=Agenda&appointment=${booking.appointmentId}`;

    await db.insert(appNotifications).values(ownerIds.map((recipientTeamMemberId) => ({
      organizationId: booking.organizationId,
      recipientTeamMemberId,
      actorTeamMemberId: ownerIds[0],
      kind: "public-booking",
      title,
      body,
      target,
      relatedRecordId: booking.appointmentId,
    }))).onConflictDoNothing();

    const vapid = await vapidConfig();
    if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) return;
    const stored = await db.select().from(pushSubscriptions).where(and(
      eq(pushSubscriptions.organizationId, booking.organizationId),
      inArray(pushSubscriptions.teamMemberId, ownerIds),
    ));
    if (!stored.length) return;
    const subscriptions: PushSubscriptionData[] = stored.map((item) => ({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }));
    const result = await sendPushBatch(subscriptions, {
      title,
      body,
      url: target,
      tag: `public-booking-${booking.appointmentId}`,
    }, vapid, {
      ttl: 60 * 60 * 12,
      urgency: "normal",
      topic: await topicFromString(`public-booking:${booking.appointmentId}`),
      concurrency: 10,
      timeoutMs: 8000,
    });
    if (result.gone.length) await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.endpoint, result.gone));
  } catch {
    // O agendamento nunca deve falhar por causa de uma notificação.
  }
}
