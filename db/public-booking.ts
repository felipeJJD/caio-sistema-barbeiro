import { and, eq, isNull } from "drizzle-orm";
import { appDate, clientCanChangeAppointment } from "../lib/app-date";
import { appointments, organizations, services, team } from "./schema";
import { getDb } from "./index";
import { notifyBookingChange, notifyOwnersOfPublicBooking } from "./notifications";
import { accessPeriodHasEnded } from "./access";
import { listPublicGalleryImages, type PublicGalleryImage } from "./public-gallery";
import { getBookingPaymentSettings } from "./booking-payments";
import { validClientName } from "../lib/client-name";
import { isPublicBookingDateAllowed, parseBookingWeekdays } from "../lib/booking-weekdays";

export type PublicBookingData = {
  organization: {
    id: number;
    name: string;
    slug: string;
    enabled: boolean;
    requiresApproval: boolean;
    openingTime: string;
    closingTime: string;
    weekdays: number[];
  };
  services: Array<{ id: number; name: string; priceCents: number; durationMinutes: number }>;
  barbers: Array<{ id: number; name: string; photoUrl: string | null }>;
  gallery: PublicGalleryImage[];
  payments: { pixEnabled: boolean; pixKey: string; cashEnabled: boolean; debitEnabled: boolean; creditEnabled: boolean };
};

export type PublicBookingSlot = { time: string; barberId: number; barberName: string };

export type PublicBookingManagement = {
  appointmentId: number;
  organizationName: string;
  slug: string;
  clientName: string;
  date: string;
  time: string;
  serviceId: number;
  serviceName: string;
  barberId: number;
  barberName: string;
  status: string;
  canChange: boolean;
};

type D1Statement = {
  bind(...values: Array<string | number | null>): D1Statement;
  first<T>(): Promise<T | null>;
};

type D1DatabaseLike = { prepare(query: string): D1Statement };

const toMinutes = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
};

const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function cleanSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);
}

async function hashManagementToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function assertBookingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Escolha uma data válida.");
  const today = appDate();
  const limit = new Date(`${today}T12:00:00`);
  limit.setDate(limit.getDate() + 90);
  const maxDate = `${limit.getFullYear()}-${String(limit.getMonth() + 1).padStart(2, "0")}-${String(limit.getDate()).padStart(2, "0")}`;
  if (value < today) throw new Error("Escolha uma data a partir de hoje.");
  if (value > maxDate) throw new Error("Os horários são liberados com até 90 dias de antecedência.");
}

export async function getPublicBookingData(slugValue: string): Promise<PublicBookingData | null> {
  const slug = cleanSlug(slugValue);
  if (!slug) return null;
  const db = await getDb();
  const organization = (await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1))[0];
  if (!organization) return null;
  const [serviceList, barberList, gallery, payments] = await Promise.all([
    db.select({ id: services.id, name: services.name, priceCents: services.priceCents, durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.active, true), isNull(services.deletedAt))).orderBy(services.name),
    db.select({ id: team.id, name: team.name }).from(team).where(and(eq(team.organizationId, organization.id), eq(team.active, true))).orderBy(team.name),
    listPublicGalleryImages(organization.id),
    getBookingPaymentSettings(organization.id),
  ]);
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      enabled: organization.publicBookingEnabled && !accessPeriodHasEnded(organization.trialEndsAt) && !organization.deletedAt && !organization.statusBeforeBlock && organization.status !== "blocked" && organization.status !== "deleted",
      requiresApproval: organization.publicBookingRequiresApproval,
      openingTime: organization.openingTime,
      closingTime: organization.closingTime,
      weekdays: parseBookingWeekdays(organization.publicBookingWeekdays),
    },
    services: serviceList,
    barbers: barberList.map((barber) => ({ ...barber, photoUrl: gallery.find((image) => image.kind === "barber" && image.teamMemberId === barber.id)?.url ?? null })),
    gallery,
    payments,
  };
}

export async function getPublicBookingPaymentOptions(slugValue: string) {
  const slug = cleanSlug(slugValue);
  if (!slug) return null;
  const db = await getDb();
  const organization = (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1))[0];
  if (!organization) return null;
  return getBookingPaymentSettings(organization.id);
}

async function availabilityContext(slug: string, date: string, serviceId: number, requestedBarberId: number) {
  assertBookingDate(date);
  const data = await getPublicBookingData(slug);
  if (!data || !data.organization.enabled) throw new Error("O agendamento online desta barbearia não está disponível agora.");
  if (!isPublicBookingDateAllowed(date, data.organization.weekdays)) throw new Error("A barbearia não atende neste dia da semana.");
  const service = data.services.find((item) => item.id === serviceId);
  if (!service) throw new Error("Escolha um serviço disponível.");
  const candidateBarbers = requestedBarberId
    ? data.barbers.filter((item) => item.id === requestedBarberId)
    : data.barbers;
  if (!candidateBarbers.length) throw new Error("Escolha um profissional disponível.");
  const db = await getDb();
  const appointmentRows = await db.select({
    id: appointments.id,
    appointmentTime: appointments.appointmentTime,
    barberId: appointments.barberId,
    status: appointments.status,
    durationMinutes: services.durationMinutes,
  }).from(appointments).innerJoin(services, eq(appointments.serviceId, services.id)).where(and(
    eq(appointments.organizationId, data.organization.id),
    eq(appointments.appointmentDate, date),
  ));
  return { data, service, candidateBarbers, appointmentRows };
}

function barberIsFree(barberId: number, start: number, duration: number, rows: Array<{ barberId: number; appointmentTime: string; durationMinutes: number; status: string }>) {
  const end = start + duration;
  return !rows.some((item) => {
    if (item.barberId !== barberId || item.status === "Cancelado") return false;
    const existingStart = toMinutes(item.appointmentTime);
    return start < existingStart + item.durationMinutes && end > existingStart;
  });
}

export async function getPublicBookingSlots(slug: string, date: string, serviceId: number, barberId = 0): Promise<PublicBookingSlot[]> {
  const context = await availabilityContext(slug, date, serviceId, barberId);
  const opening = toMinutes(context.data.organization.openingTime);
  const closing = toMinutes(context.data.organization.closingTime);
  if (!Number.isFinite(opening) || !Number.isFinite(closing) || opening >= closing) return [];
  const nowParts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const minimumTodayStart = Number(nowParts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(nowParts.find((part) => part.type === "minute")?.value ?? 0);
  const slots: PublicBookingSlot[] = [];
  for (let start = opening; start + context.service.durationMinutes <= closing; start += 30) {
    if (date === appDate() && start <= minimumTodayStart) continue;
    const available = context.candidateBarbers.find((barber) => barberIsFree(barber.id, start, context.service.durationMinutes, context.appointmentRows));
    if (available) slots.push({ time: toTime(start), barberId: available.id, barberName: available.name });
  }
  return slots;
}

export async function createPublicBooking(slug: string, input: { date: string; time: string; serviceId: number; barberId: number; clientName: string; phone: string; paymentChoice: string; isMembership?: boolean }) {
  const clientName = validClientName(input.clientName);
  const phone = input.phone.replace(/[^0-9+()\-\s]/g, "").trim().slice(0, 30);
  if (phone.replace(/\D/g, "").length < 8) throw new Error("Informe um telefone ou WhatsApp válido.");
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("Escolha um horário disponível.");
  const slots = await getPublicBookingSlots(slug, input.date, input.serviceId, input.barberId);
  const selected = slots.find((slot) => slot.time === input.time);
  if (!selected) throw new Error("Esse horário acabou de ser ocupado. Escolha outro disponível.");
  const data = await getPublicBookingData(slug);
  const service = data?.services.find((item) => item.id === input.serviceId);
  if (!data || !service) throw new Error("Não foi possível identificar a barbearia ou o serviço.");
  const paymentChoice = input.isMembership ? "Mensalista" : input.paymentChoice;
  const allowedPayments = [data.payments.pixEnabled && "Pix", data.payments.cashEnabled && "Dinheiro", data.payments.debitEnabled && "Débito", data.payments.creditEnabled && "Crédito"].filter(Boolean) as string[];
  if (!input.isMembership && !allowedPayments.includes(paymentChoice)) throw new Error("Escolha uma forma de pagamento disponível.");
  const isPix = paymentChoice === "Pix";
  const status = isPix ? "Aguardando pagamento" : data.organization.requiresApproval ? "Aguardando" : "Agendado";
  const paymentToken = isPix ? crypto.randomUUID() : null;
  const managementToken = crypto.randomUUID();
  const managementTokenHash = await hashManagementToken(managementToken);
  const { env } = await import("@/runtime/env");
  const database = (env as unknown as { DB?: D1DatabaseLike }).DB;
  if (!database) throw new Error("Não foi possível concluir o agendamento.");
  const requestedStart = toMinutes(input.time);
  const requestedEnd = requestedStart + service.durationMinutes;
  const inserted = await database.prepare(`
    INSERT INTO appointments (
      organization_id, appointment_date, appointment_time, client_name, phone,
      service_id, barber_id, notes, status, payment_choice, payment_confirmation_token, management_token_hash
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1
      FROM appointments AS existing
      INNER JOIN services AS existing_service ON existing_service.id = existing.service_id
      WHERE existing.organization_id = ?
        AND existing.appointment_date = ?
        AND existing.barber_id = ?
        AND existing.status <> 'Cancelado'
        AND (
          CAST(SUBSTR(existing.appointment_time, 1, 2) AS INTEGER) * 60
          + CAST(SUBSTR(existing.appointment_time, 4, 2) AS INTEGER)
        ) < ?
        AND ? < (
          CAST(SUBSTR(existing.appointment_time, 1, 2) AS INTEGER) * 60
          + CAST(SUBSTR(existing.appointment_time, 4, 2) AS INTEGER)
          + existing_service.duration_minutes
        )
    )
    RETURNING id
  `).bind(
    data.organization.id,
    input.date,
    input.time,
    clientName,
    phone,
    service.id,
    selected.barberId,
    input.isMembership ? "Cliente informou ser mensalista pelo link público" : "Solicitado pelo link público",
    status,
    paymentChoice,
    paymentToken,
    managementTokenHash,
    data.organization.id,
    input.date,
    selected.barberId,
    requestedEnd,
    requestedStart,
  ).first<{ id: number }>();
  const appointmentId = inserted?.id;
  if (!appointmentId) throw new Error("Esse horário acabou de ser ocupado. Escolha outro disponível.");
  await notifyOwnersOfPublicBooking({
    organizationId: data.organization.id,
    appointmentId,
    clientName,
    serviceName: input.isMembership ? "Mensalista" : service.name,
    barberName: selected.barberName,
    barberId: selected.barberId,
    date: input.date,
    time: input.time,
    status,
  });
  return {
    id: appointmentId,
    status,
    barberName: selected.barberName,
    serviceName: input.isMembership ? "Mensalista" : service.name,
    requiresApproval: data.organization.requiresApproval,
    paymentChoice,
    isMembership: Boolean(input.isMembership),
    priceCents: service.priceCents,
    pixKey: isPix ? data.payments.pixKey : "",
    paymentToken,
    managementToken,
  };
}

export async function reportPublicBookingPix(slugValue: string, appointmentId: number, token: string) {
  const data = await getPublicBookingData(slugValue);
  if (!data) throw new Error("Barbearia não encontrada.");
  const db = await getDb();
  const row = (await db.select({ id: appointments.id, clientName: appointments.clientName, appointmentDate: appointments.appointmentDate, appointmentTime: appointments.appointmentTime, status: appointments.status, token: appointments.paymentConfirmationToken, serviceName: services.name, barberId: appointments.barberId, barberName: team.name }).from(appointments).innerJoin(services, eq(appointments.serviceId, services.id)).innerJoin(team, eq(appointments.barberId, team.id)).where(and(eq(appointments.id, appointmentId), eq(appointments.organizationId, data.organization.id))).limit(1))[0];
  if (!row || row.token !== token || row.status !== "Aguardando pagamento") throw new Error("Não foi possível confirmar esta solicitação.");
  await db.update(appointments).set({ status: "Aguardando", paymentConfirmationToken: null }).where(and(eq(appointments.id, row.id), eq(appointments.organizationId, data.organization.id)));
  await notifyOwnersOfPublicBooking({ organizationId: data.organization.id, appointmentId: row.id, clientName: row.clientName, serviceName: row.serviceName, barberId: row.barberId, barberName: row.barberName, date: row.appointmentDate, time: row.appointmentTime, status: "Aguardando" });
  return { ok: true };
}

async function findManagedBooking(slugValue: string, token: string) {
  const slug = cleanSlug(slugValue);
  if (!slug || token.length < 20 || token.length > 100) return null;
  const tokenHash = await hashManagementToken(token);
  const db = await getDb();
  return (await db.select({
    appointmentId: appointments.id,
    organizationId: appointments.organizationId,
    organizationName: organizations.name,
    slug: organizations.slug,
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
    .innerJoin(organizations, eq(appointments.organizationId, organizations.id))
    .innerJoin(services, eq(appointments.serviceId, services.id))
    .innerJoin(team, eq(appointments.barberId, team.id))
    .where(and(
      eq(organizations.slug, slug),
      eq(appointments.managementTokenHash, tokenHash),
    )).limit(1))[0] ?? null;
}

export async function getPublicBookingManagement(slug: string, token: string): Promise<PublicBookingManagement | null> {
  const row = await findManagedBooking(slug, token);
  if (!row) return null;
  return {
    appointmentId: row.appointmentId,
    organizationName: row.organizationName,
    slug: row.slug,
    clientName: row.clientName,
    date: row.date,
    time: row.time,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    barberId: row.barberId,
    barberName: row.barberName,
    status: row.status,
    canChange: row.status !== "Cancelado" && clientCanChangeAppointment(row.date, row.time),
  };
}

export async function cancelPublicBooking(slug: string, token: string) {
  const row = await findManagedBooking(slug, token);
  if (!row) throw new Error("Este link não é válido ou já expirou.");
  if (row.status === "Cancelado") throw new Error("Este horário já foi cancelado.");
  if (!clientCanChangeAppointment(row.date, row.time)) throw new Error("Faltam menos de 2 horas para o atendimento. Entre em contato diretamente com a barbearia.");
  const db = await getDb();
  await db.update(appointments).set({ status: "Cancelado" }).where(and(
    eq(appointments.id, row.appointmentId),
    eq(appointments.organizationId, row.organizationId),
  ));
  await notifyBookingChange({ organizationId: row.organizationId, appointmentId: row.appointmentId, clientName: row.clientName, serviceName: row.serviceName, barberId: row.barberId, barberName: row.barberName, date: row.date, time: row.time, status: "Cancelado" }, "cancelled");
  return getPublicBookingManagement(slug, token);
}

export async function reschedulePublicBooking(slug: string, token: string, date: string, time: string) {
  const row = await findManagedBooking(slug, token);
  if (!row) throw new Error("Este link não é válido ou já expirou.");
  if (row.status === "Cancelado") throw new Error("Um horário cancelado não pode ser remarcado por este link.");
  if (!clientCanChangeAppointment(row.date, row.time)) throw new Error("Faltam menos de 2 horas para o atendimento. Entre em contato diretamente com a barbearia.");
  const slots = await getPublicBookingSlots(slug, date, row.serviceId, row.barberId);
  if (!slots.some((slot) => slot.time === time && slot.barberId === row.barberId)) throw new Error("Esse horário não está mais disponível. Escolha outro.");
  const data = await getPublicBookingData(slug);
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
  return getPublicBookingManagement(slug, token);
}
