import { and, eq, isNull } from "drizzle-orm";
import { appDate, clientCanChangeAppointment } from "../lib/app-date";
import { appointments, clients, organizations, plans, services, team } from "./schema";
import { getDb } from "./index";
import { notifyBookingChange, notifyOwnersOfPublicBooking } from "./notifications";
import { accessPeriodHasEnded } from "./access";
import { listPublicGalleryImages, type PublicGalleryImage } from "./public-gallery";
import { getBookingPaymentSettings } from "./booking-payments";
import { validClientName } from "../lib/client-name";
import { parseBookingWeekdays } from "../lib/booking-weekdays";
import { bookingHoursForDate, bookingWeekdaysFromHours, bookingWindowAllows, parseTeamWeeklyBookingHours, parseWeeklyBookingHours, type WeeklyBookingHours } from "../lib/booking-hours";
import { availableMembershipUses, membershipNameMatches, membershipNameNeedsPhone, normalizeMembershipIdentity, phoneDigits, resolveMembershipService } from "../lib/membership-service";
import { processWhatsappQueueSafely, queueAppointmentWhatsappSafely } from "./whatsapp";

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
    weeklyHours: WeeklyBookingHours;
  };
  services: Array<{ id: number; name: string; priceCents: number; durationMinutes: number }>;
  hasMemberships: boolean;
  barbers: Array<{ id: number; name: string; photoUrl: string | null; weeklyHours: WeeklyBookingHours }>;
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
  const [serviceList, planList, activeMembershipClients, barberList, gallery, payments] = await Promise.all([
    db.select({ id: services.id, name: services.name, priceCents: services.priceCents, durationMinutes: services.durationMinutes }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.active, true), isNull(services.deletedAt))).orderBy(services.name),
    db.select({ id: plans.id, name: plans.name, planKind: plans.planKind, serviceId: plans.serviceId, monthlyValueCents: plans.monthlyValueCents, maxUses: plans.maxUses }).from(plans).where(and(eq(plans.organizationId, organization.id), eq(plans.active, true))).orderBy(plans.name),
    db.select({ id: clients.id, planId: clients.planId }).from(clients).where(and(eq(clients.organizationId, organization.id), eq(clients.status, "Ativo"), isNull(clients.deletedAt))),
    db.select({ id: team.id, name: team.name, weeklyBookingHours: team.weeklyBookingHours }).from(team).where(and(eq(team.organizationId, organization.id), eq(team.active, true))).orderBy(team.name),
    listPublicGalleryImages(organization.id),
    getBookingPaymentSettings(organization.id),
  ]);
  const usablePlanIds = new Set(planList.filter((plan) => Boolean(resolveMembershipService(plan.planKind, plan.name, serviceList, plan.serviceId))).map((plan) => plan.id));
  const hasMemberships = activeMembershipClients.some((client) => usablePlanIds.has(client.planId));
  const weeklyHours = parseWeeklyBookingHours(
    organization.weeklyBookingHours,
    parseBookingWeekdays(organization.publicBookingWeekdays),
    organization.openingTime,
    organization.closingTime,
  );
  return {
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      enabled: organization.publicBookingEnabled && !accessPeriodHasEnded(organization.trialEndsAt) && !organization.deletedAt && !organization.statusBeforeBlock && organization.status !== "blocked" && organization.status !== "deleted",
      requiresApproval: organization.publicBookingRequiresApproval,
      openingTime: organization.openingTime,
      closingTime: organization.closingTime,
      weekdays: bookingWeekdaysFromHours(weeklyHours),
      weeklyHours,
    },
    services: serviceList,
    hasMemberships,
    barbers: barberList.map((barber) => ({ id: barber.id, name: barber.name, photoUrl: gallery.find((image) => image.kind === "barber" && image.teamMemberId === barber.id)?.url ?? null, weeklyHours: parseTeamWeeklyBookingHours(barber.weeklyBookingHours, weeklyHours) })),
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


export type PublicMembershipLookup = {
  clientId: number;
  clientName: string;
  planId: number;
  planName: string;
  serviceId: number;
  serviceName: string;
  durationMinutes: number;
  remainingUses: number;
};

export type PublicMembershipCandidate = {
  clientId: number;
  clientName: string;
  requiresPhone: boolean;
};

async function publicMembershipContext(slugValue: string) {
  const slug = cleanSlug(slugValue);
  if (!slug) throw new Error("Barbearia não encontrada.");
  const db = await getDb();
  const organization = (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug)).limit(1))[0];
  if (!organization) throw new Error("Barbearia não encontrada.");
  const [clientList, planList, serviceList, reservedRows] = await Promise.all([
    db.select().from(clients).where(and(eq(clients.organizationId, organization.id), eq(clients.status, "Ativo"), isNull(clients.deletedAt))),
    db.select().from(plans).where(and(eq(plans.organizationId, organization.id), eq(plans.active, true))),
    db.select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes, priceCents: services.priceCents }).from(services).where(and(eq(services.organizationId, organization.id), eq(services.active, true), isNull(services.deletedAt))),
    db.select({ clientId: appointments.membershipClientId }).from(appointments).where(and(
      eq(appointments.organizationId, organization.id),
      eq(appointments.membershipCreditState, "reserved"),
    )),
  ]);
  return { organization, clientList, planList, serviceList, reservedRows };
}

export async function searchPublicMembershipNames(slugValue: string, queryValue: string): Promise<PublicMembershipCandidate[]> {
  const query = queryValue.trim().slice(0, 100);
  if (normalizeMembershipIdentity(query).length < 3) return [];
  const context = await publicMembershipContext(slugValue);
  const usableClients = context.clientList.filter((client) => {
    const plan = context.planList.find((item) => item.id === client.planId);
    return Boolean(plan && resolveMembershipService(plan.planKind, plan.name, context.serviceList, plan.serviceId));
  });
  const names = usableClients.map((client) => client.name);
  return usableClients
    .filter((client) => membershipNameMatches(query, client.name))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
    .slice(0, 8)
    .map((client) => ({
      clientId: client.id,
      clientName: client.name,
      requiresPhone: membershipNameNeedsPhone(client.name, names),
    }));
}

export async function findPublicMembership(slugValue: string, nameValue: string, phoneValue = "", clientIdValue = 0): Promise<PublicMembershipLookup> {
  const name = validClientName(nameValue, 120);
  const suppliedPhone = phoneDigits(phoneValue);
  const context = await publicMembershipContext(slugValue);
  const normalizedName = normalizeMembershipIdentity(name);
  const exactNameMatches = context.clientList.filter((client) => normalizeMembershipIdentity(client.name) === normalizedName);
  const requestedId = Math.max(0, Number(clientIdValue) || 0);
  let client = requestedId
    ? exactNameMatches.find((item) => item.id === requestedId) ?? null
    : null;

  if (!client && suppliedPhone.length >= 8) {
    const phoneMatches = exactNameMatches.filter((item) => {
      const stored = phoneDigits(item.phone);
      if (!stored) return false;
      const compareLength = Math.min(8, stored.length, suppliedPhone.length);
      return stored.slice(-compareLength) === suppliedPhone.slice(-compareLength);
    });
    client = phoneMatches.length === 1 ? phoneMatches[0] : null;
  }

  if (!client) throw new Error("Não encontramos um mensalista ativo com esse nome.");
  if (exactNameMatches.length > 1) {
    if (suppliedPhone.length < 8) throw new Error("Encontramos mais de um mensalista com esse nome. Informe o telefone cadastrado.");
    const stored = phoneDigits(client.phone);
    const compareLength = Math.min(8, stored.length, suppliedPhone.length);
    if (!stored || compareLength < 8 || stored.slice(-compareLength) !== suppliedPhone.slice(-compareLength)) {
      throw new Error("O telefone não confere com o cadastro selecionado.");
    }
  }

  const plan = context.planList.find((item) => item.id === client.planId);
  if (!plan) throw new Error("Seu cadastro mensalista está sem um plano ativo. Fale com a barbearia.");
  const service = resolveMembershipService(plan.planKind, plan.name, context.serviceList, plan.serviceId);
  if (!service) throw new Error("O serviço do seu plano precisa ser revisado pela barbearia antes de agendar.");
  const reservedUses = context.reservedRows.filter((row) => row.clientId === client.id).length;
  const remainingUses = availableMembershipUses(client.balance, reservedUses);
  if (remainingUses <= 0) throw new Error("Seu plano não possui créditos disponíveis no momento.");

  return {
    clientId: client.id,
    clientName: client.name,
    planId: plan.id,
    planName: plan.name,
    serviceId: service.id,
    serviceName: service.name,
    durationMinutes: service.durationMinutes,
    remainingUses,
  };
}

async function availabilityContext(slug: string, date: string, serviceId: number, requestedBarberId: number) {
  assertBookingDate(date);
  const data = await getPublicBookingData(slug);
  if (!data || !data.organization.enabled) throw new Error("O agendamento online desta barbearia não está disponível agora.");
  const dayHours = bookingHoursForDate(data.organization.weeklyHours, date);
  if (!dayHours?.enabled) throw new Error("A barbearia não atende neste dia da semana.");
  const service = data.services.find((item) => item.id === serviceId);
  if (!service) throw new Error("Escolha um serviço disponível.");
  const selectedBarbers = requestedBarberId
    ? data.barbers.filter((item) => item.id === requestedBarberId)
    : data.barbers;
  if (requestedBarberId && !selectedBarbers.length) throw new Error("Escolha um profissional disponível.");
  const candidateBarbers = selectedBarbers.filter((barber) => bookingHoursForDate(barber.weeklyHours, date)?.enabled);
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
  const dayHours = bookingHoursForDate(context.data.organization.weeklyHours, date);
  if (!dayHours?.enabled) return [];
  const opening = toMinutes(dayHours.openingTime);
  const closing = toMinutes(dayHours.closingTime);
  if (!Number.isFinite(opening) || !Number.isFinite(closing) || opening >= closing) return [];
  const nowParts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const minimumTodayStart = Number(nowParts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(nowParts.find((part) => part.type === "minute")?.value ?? 0);
  const slots: PublicBookingSlot[] = [];
  for (let start = opening; start + context.service.durationMinutes <= closing; start += 30) {
    if (date === appDate() && start <= minimumTodayStart) continue;
    const available = context.candidateBarbers.find((barber) => bookingWindowAllows(bookingHoursForDate(barber.weeklyHours, date), start, context.service.durationMinutes) && barberIsFree(barber.id, start, context.service.durationMinutes, context.appointmentRows));
    if (available) slots.push({ time: toTime(start), barberId: available.id, barberName: available.name });
  }
  return slots;
}

export async function createPublicBooking(slug: string, input: { date: string; time: string; serviceId: number; barberId: number; clientName: string; phone: string; paymentChoice: string; isMembership?: boolean; membershipClientId?: number }) {
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
  const membership = input.isMembership ? await findPublicMembership(slug, clientName, phone, input.membershipClientId ?? 0) : null;
  if (membership && membership.clientId !== Number(input.membershipClientId || 0)) throw new Error("Confirme novamente seu cadastro de mensalista.");
  if (membership && membership.serviceId !== service.id) throw new Error("O serviço do seu plano mudou. Identifique seu cadastro novamente.");
  const bookingClientName = membership?.clientName ?? clientName;
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
  const inserted = membership
    ? await database.prepare(`
    INSERT INTO appointments (
      organization_id, appointment_date, appointment_time, client_name, phone,
      service_id, barber_id, notes, status, payment_choice, payment_confirmation_token, management_token_hash,
      membership_client_id, membership_plan_id, membership_credit_state
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reserved'
    FROM clients AS membership_client
    WHERE membership_client.id = ?
      AND membership_client.organization_id = ?
      AND membership_client.status = 'Ativo'
      AND membership_client.deleted_at IS NULL
      AND membership_client.plan_id = ?
      AND membership_client.balance > (
        SELECT COUNT(*)
        FROM appointments AS reserved_credit
        WHERE reserved_credit.organization_id = ?
          AND reserved_credit.membership_client_id = membership_client.id
          AND reserved_credit.membership_credit_state = 'reserved'
      )
      AND NOT EXISTS (
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
      bookingClientName,
      phone,
      service.id,
      selected.barberId,
      `Mensalista · ${membership.planName} · ${membership.serviceName}`,
      status,
      paymentChoice,
      paymentToken,
      managementTokenHash,
      membership.clientId,
      membership.planId,
      membership.clientId,
      data.organization.id,
      membership.planId,
      data.organization.id,
      data.organization.id,
      input.date,
      selected.barberId,
      requestedEnd,
      requestedStart,
    ).first<{ id: number }>()
    : await database.prepare(`
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
      bookingClientName,
      phone,
      service.id,
      selected.barberId,
      "Solicitado pelo link público",
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
  if (!appointmentId) throw new Error(membership ? "Esse horário ou o último crédito disponível acabou de ser reservado. Atualize e tente novamente." : "Esse horário acabou de ser ocupado. Escolha outro disponível.");
  await notifyOwnersOfPublicBooking({
    organizationId: data.organization.id,
    appointmentId,
    clientName: bookingClientName,
    serviceName: membership ? `Mensalista · ${membership.serviceName}` : service.name,
    barberName: selected.barberName,
    barberId: selected.barberId,
    date: input.date,
    time: input.time,
    status,
  });
  if (status === "Agendado") {
    const queued = await queueAppointmentWhatsappSafely("confirmation", appointmentId);
    if (queued.queued) await processWhatsappQueueSafely(data.organization.id, 3);
  }
  return {
    id: appointmentId,
    status,
    barberName: selected.barberName,
    serviceName: membership ? `Mensalista · ${membership.serviceName}` : service.name,
    membershipPlanName: membership?.planName ?? "",
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
    membershipCreditState: appointments.membershipCreditState,
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
  await db.update(appointments).set({
    status: "Cancelado",
    membershipCreditState: row.membershipCreditState === "reserved" ? "released" : row.membershipCreditState,
  }).where(and(
    eq(appointments.id, row.appointmentId),
    eq(appointments.organizationId, row.organizationId),
  ));
  await notifyBookingChange({ organizationId: row.organizationId, appointmentId: row.appointmentId, clientName: row.clientName, serviceName: row.serviceName, barberId: row.barberId, barberName: row.barberName, date: row.date, time: row.time, status: "Cancelado" }, "cancelled");
  const queued = await queueAppointmentWhatsappSafely("cancellation", row.appointmentId);
  if (queued.queued) await processWhatsappQueueSafely(row.organizationId, 3);
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
  if (newStatus === "Agendado") {
    const queued = await queueAppointmentWhatsappSafely("rescheduled", row.appointmentId);
    if (queued.queued) await processWhatsappQueueSafely(row.organizationId, 3);
  }
  return getPublicBookingManagement(slug, token);
}
