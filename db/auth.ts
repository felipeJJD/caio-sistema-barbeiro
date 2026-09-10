import { and, desc, eq, gt, isNull, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import type { AccessContext } from "./access";
import { getAccessContextByTeamMemberId, requireOwner, requirePlatformAdmin } from "./access";
import { getDb } from "./index";
import { authAccounts, authSessions, barbershopInvites, emailVerifications, goals, organizations, passwordResets, paymentMethods, services, signupAttempts, team, teamInvites } from "./schema";
import { appMonth } from "../lib/app-date";
import { ownerEmailVerificationIsConfigured, sendOwnerVerificationEmail, sendPasswordResetEmail } from "../lib/owner-email";
import { attachOrganizationReferral } from "./affiliates";

const SESSION_COOKIE = "barberflow_session";
const SESSION_SECONDS = 60 * 60 * 24 * 180;
const INVITE_SECONDS = 60 * 60 * 24 * 7;
const BARBERSHOP_INVITE_SECONDS = 60 * 60 * 24 * 7;
const EMAIL_VERIFICATION_SECONDS = 60 * 60 * 24;
const PASSWORD_RESET_SECONDS = 60 * 60;
// Cloudflare Workers accepts at most 100,000 PBKDF2 iterations.
const PASSWORD_ITERATIONS = 100000;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array();
  return new Uint8Array(value.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

function randomHex(size: number) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(size)));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function passwordHash(password: string, saltHex: string, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function validatePassword(password: string) {
  if (password.length < 6) throw new Error("Crie uma senha com pelo menos 6 caracteres.");
  if (password.length > 128) throw new Error("A senha informada é muito longa.");
}

async function issueSession(accountId: number) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const db = await getDb();
  await db.insert(authSessions).values({ tokenHash, accountId, expiresAt });
  return token;
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearedSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function hasPasswordForTeamMember(teamMemberId: number) {
  const db = await getDb();
  const account = (await db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.teamMemberId, teamMemberId)).limit(1))[0];
  return Boolean(account);
}

export async function getSessionAccess(): Promise<AccessContext | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const tokenHash = await sha256(token);
  const session = (await db.select().from(authSessions).where(and(
    eq(authSessions.tokenHash, tokenHash),
    gt(authSessions.expiresAt, new Date().toISOString()),
  )).limit(1))[0];
  if (!session) return null;

  const account = (await db.select().from(authAccounts).where(eq(authAccounts.id, session.accountId)).limit(1))[0];
  if (!account) return null;
  return getAccessContextByTeamMemberId(account.teamMemberId);
}

export async function loginWithPassword(emailValue: string, password: string) {
  const email = normalizeEmail(emailValue);
  if (!email || !password) throw new Error("Informe seu e-mail e sua senha.");

  const db = await getDb();
  const account = (await db.select().from(authAccounts).where(eq(authAccounts.email, email)).limit(1))[0];
  if (!account) throw new Error("E-mail ou senha incorretos.");

  const candidate = await passwordHash(password, account.passwordSalt, account.passwordIterations);
  if (!secureEqual(candidate, account.passwordHash)) throw new Error("E-mail ou senha incorretos.");
  if (!account.emailVerifiedAt) throw new Error("Confirme seu e-mail antes de entrar. Abra o link enviado para você.");

  const access = await getAccessContextByTeamMemberId(account.teamMemberId);
  if (!access) throw new Error("Este acesso está desativado. Fale com o administrador.");
  return { access, token: await issueSession(account.id) };
}

export async function setupOwnerPassword(access: AccessContext, password: string) {
  requireOwner(access);
  validatePassword(password);
  if (await hasPasswordForTeamMember(access.teamMemberId)) {
    throw new Error("Sua conta já foi ativada. Entre usando seu e-mail e sua senha.");
  }

  const email = normalizeEmail(access.email);
  const salt = randomHex(16);
  const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.insert(authAccounts).values({
    organizationId: access.organizationId,
    teamMemberId: access.teamMemberId,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    emailVerifiedAt: now,
    updatedAt: now,
  }).returning({ id: authAccounts.id });
  return issueSession(result[0].id);
}

export async function setPasswordForTeamMember(access: AccessContext, teamMemberId: number, password: string) {
  requireOwner(access);
  validatePassword(password);

  const db = await getDb();
  const member = (await db.select().from(team).where(and(
    eq(team.id, teamMemberId),
    eq(team.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!member?.loginEmail) throw new Error("Cadastre o e-mail do profissional antes de criar a senha.");
  if (!member.active) throw new Error("Ative o profissional antes de criar a senha.");

  const email = normalizeEmail(member.loginEmail);
  const sameEmail = (await db.select().from(authAccounts).where(eq(authAccounts.email, email)).limit(1))[0];
  if (sameEmail && sameEmail.teamMemberId !== member.id) throw new Error("Este e-mail já possui outro acesso.");

  const salt = randomHex(16);
  const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
  const existing = (await db.select().from(authAccounts).where(eq(authAccounts.teamMemberId, member.id)).limit(1))[0];
  const values = {
    organizationId: access.organizationId,
    email,
    passwordHash: hash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    emailVerifiedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (existing) {
    await db.delete(authSessions).where(eq(authSessions.accountId, existing.id));
    await db.update(authAccounts).set(values).where(eq(authAccounts.id, existing.id));
  } else {
    await db.insert(authAccounts).values({ ...values, teamMemberId: member.id });
  }
}

export async function changeOwnPassword(access: AccessContext, password: string) {
  validatePassword(password);

  const db = await getDb();
  const account = (await db.select().from(authAccounts).where(and(
    eq(authAccounts.teamMemberId, access.teamMemberId),
    eq(authAccounts.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!account) throw new Error("Seu acesso ainda não possui uma senha ativa.");

  const salt = randomHex(16);
  const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
  await db.delete(authSessions).where(eq(authSessions.accountId, account.id));
  await db.update(authAccounts).set({
    passwordHash: hash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    updatedAt: new Date().toISOString(),
  }).where(eq(authAccounts.id, account.id));
}

function inviteStatus(invite: typeof teamInvites.$inferSelect) {
  if (invite.revokedAt) return "Cancelado";
  if (invite.usedAt) return "Utilizado";
  if (invite.expiresAt <= new Date().toISOString()) return "Expirado";
  return "Ativo";
}

function validInviteToken(value: string) {
  return /^[0-9a-f]{32}$/i.test(value);
}

function validateEmail(value: string) {
  const email = normalizeEmail(value);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  return email;
}

export async function listTeamInvites(access: AccessContext) {
  requireOwner(access);
  const db = await getDb();
  const rows = await db.select().from(teamInvites).where(eq(teamInvites.organizationId, access.organizationId)).orderBy(desc(teamInvites.id));
  return rows.map((invite) => ({
    id: invite.id,
    teamMemberId: invite.teamMemberId,
    invitedName: invite.invitedName,
    role: invite.role,
    accessRole: invite.accessRole,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    status: inviteStatus(invite),
  }));
}

export async function listTeamUsers(access: AccessContext) {
  requireOwner(access);
  const db = await getDb();
  const members = await db.select().from(team).where(eq(team.organizationId, access.organizationId)).orderBy(team.name);
  const accounts = await db.select({ teamMemberId: authAccounts.teamMemberId }).from(authAccounts).where(eq(authAccounts.organizationId, access.organizationId));
  const activeAccounts = new Set(accounts.map((account) => account.teamMemberId));
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    email: member.loginEmail,
    accessRole: member.accessRole,
    active: member.active,
    hasPassword: activeAccounts.has(member.id),
    isCurrentUser: member.id === access.teamMemberId,
  }));
}

export async function createTeamInvite(access: AccessContext, input: { teamMemberId?: number; invitedName?: string; role?: string; accessRole?: string; commissionRateBps?: number }) {
  requireOwner(access);
  const db = await getDb();
  const requestedTeamMemberId = Number(input.teamMemberId ?? 0);
  const existingMember = requestedTeamMemberId > 0 ? (await db.select().from(team).where(and(
    eq(team.id, requestedTeamMemberId),
    eq(team.organizationId, access.organizationId),
  )).limit(1))[0] : null;
  if (requestedTeamMemberId > 0 && !existingMember) throw new Error("Profissional não encontrado.");
  if (existingMember?.id === access.teamMemberId) throw new Error("Seu acesso de administrador já está ativo.");
  if (existingMember && await hasPasswordForTeamMember(existingMember.id)) throw new Error("Este profissional já possui login. Use suspender ou reativar acesso.");

  const invitedName = existingMember?.name ?? input.invitedName?.trim().slice(0, 80) ?? "";
  const role = existingMember?.role ?? (input.role?.trim().slice(0, 60) || "Barbeiro");
  const accessRole = existingMember?.accessRole === "owner" || (!existingMember && input.accessRole === "owner") ? "owner" : "barber";
  const commissionRateBps = Number(existingMember?.commissionRateBps ?? input.commissionRateBps ?? 5000);
  if (!Number.isFinite(commissionRateBps) || commissionRateBps < 0 || commissionRateBps > 10000) {
    throw new Error("Informe uma comissão entre 0% e 100%.");
  }

  const inviteToken = randomHex(16);
  const tokenHash = await sha256(inviteToken);
  const expiresAt = new Date(Date.now() + INVITE_SECONDS * 1000).toISOString();
  const created = await db.insert(teamInvites).values({
    organizationId: access.organizationId,
    teamMemberId: existingMember?.id ?? null,
    tokenHash,
    invitedName,
    role,
    accessRole,
    commissionRateBps: Math.round(commissionRateBps),
    createdByTeamMemberId: access.teamMemberId,
    expiresAt,
  }).returning({ id: teamInvites.id });
  return { id: created[0].id, inviteToken, expiresAt };
}

export async function revokeTeamInvite(access: AccessContext, inviteId: number) {
  requireOwner(access);
  const db = await getDb();
  const invite = (await db.select().from(teamInvites).where(and(
    eq(teamInvites.id, inviteId),
    eq(teamInvites.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!invite) throw new Error("Convite não encontrado.");
  if (invite.usedAt) throw new Error("Este convite já foi utilizado.");
  await db.update(teamInvites).set({ revokedAt: new Date().toISOString() }).where(eq(teamInvites.id, invite.id));
}

export async function setTeamUserActive(access: AccessContext, teamMemberId: number, active: boolean) {
  requireOwner(access);
  if (teamMemberId === access.teamMemberId && !active) throw new Error("Você não pode suspender o próprio acesso.");
  const db = await getDb();
  const member = (await db.select().from(team).where(and(
    eq(team.id, teamMemberId),
    eq(team.organizationId, access.organizationId),
  )).limit(1))[0];
  if (!member) throw new Error("Usuário não encontrado.");
  await db.update(team).set({ active }).where(eq(team.id, member.id));
  await syncTeamAccount(member.id, member.loginEmail, active);
}

export async function getTeamInvitePreview(inviteToken: string) {
  if (!validInviteToken(inviteToken)) return null;
  const db = await getDb();
  const invite = (await db.select().from(teamInvites).where(eq(teamInvites.tokenHash, await sha256(inviteToken))).limit(1))[0];
  if (!invite) return null;
  const organization = (await db.select().from(organizations).where(eq(organizations.id, invite.organizationId)).limit(1))[0];
  if (!organization) return null;
  const status = inviteStatus(invite);
  return {
    organizationName: organization.name,
    invitedName: invite.invitedName,
    role: invite.role,
    accessRole: invite.accessRole,
    expiresAt: invite.expiresAt,
    status,
    valid: status === "Ativo",
  };
}

export async function acceptTeamInvite(inviteToken: string, input: { name: string; email: string; password: string }) {
  const preview = await getTeamInvitePreview(inviteToken);
  if (!preview) throw new Error("Este convite não existe.");
  if (!preview.valid) throw new Error(`Este convite está ${preview.status.toLowerCase()}. Peça um novo link ao administrador.`);
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) throw new Error("Informe seu nome.");
  const email = validateEmail(input.email);
  validatePassword(input.password);

  const db = await getDb();
  const tokenHash = await sha256(inviteToken);
  const invite = (await db.select().from(teamInvites).where(eq(teamInvites.tokenHash, tokenHash)).limit(1))[0];
  if (!invite || inviteStatus(invite) !== "Ativo") throw new Error("Este convite não está mais disponível.");
  const existingAccount = (await db.select().from(authAccounts).where(eq(authAccounts.email, email)).limit(1))[0];
  if (existingAccount) throw new Error("Este e-mail já possui acesso ao Cortou Anotou.");
  const memberWithEmail = (await db.select().from(team).where(eq(team.loginEmail, email)).limit(1))[0];
  if (memberWithEmail && memberWithEmail.id !== invite.teamMemberId) throw new Error("Este e-mail já está cadastrado na equipe.");
  const invitedMember = invite.teamMemberId ? (await db.select().from(team).where(and(
    eq(team.id, invite.teamMemberId),
    eq(team.organizationId, invite.organizationId),
  )).limit(1))[0] : null;
  if (invite.teamMemberId && !invitedMember) throw new Error("O profissional deste convite não foi encontrado.");
  if (invitedMember && await hasPasswordForTeamMember(invitedMember.id)) throw new Error("Este profissional já possui login no Cortou Anotou.");

  const salt = randomHex(16);
  const hash = await passwordHash(input.password, salt, PASSWORD_ITERATIONS);
  let teamMemberId: number;
  if (invitedMember) {
    teamMemberId = invitedMember.id;
    await db.update(team).set({ name, loginEmail: email, active: true }).where(eq(team.id, invitedMember.id));
  } else {
    const createdMember = await db.insert(team).values({
      organizationId: invite.organizationId,
      name,
      role: invite.role,
      loginEmail: email,
      accessRole: invite.accessRole === "owner" ? "owner" : "barber",
      commissionCents: 0,
      commissionRateBps: invite.commissionRateBps,
      active: true,
    }).returning({ id: team.id });
    teamMemberId = createdMember[0].id;
  }

  try {
    const createdAccount = await db.insert(authAccounts).values({
      organizationId: invite.organizationId,
      teamMemberId,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      passwordIterations: PASSWORD_ITERATIONS,
      emailVerifiedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).returning({ id: authAccounts.id });
    await db.update(teamInvites).set({ usedAt: new Date().toISOString() }).where(and(
      eq(teamInvites.id, invite.id),
      eq(teamInvites.tokenHash, tokenHash),
    ));
    return await issueSession(createdAccount[0].id);
  } catch (error) {
    await db.delete(authAccounts).where(eq(authAccounts.teamMemberId, teamMemberId));
    if (invitedMember) {
      await db.update(team).set({ name: invitedMember.name, loginEmail: invitedMember.loginEmail, active: invitedMember.active }).where(eq(team.id, invitedMember.id));
    } else {
      await db.delete(team).where(and(eq(team.id, teamMemberId), eq(team.organizationId, invite.organizationId)));
    }
    throw error;
  }
}

function barbershopInviteStatus(invite: typeof barbershopInvites.$inferSelect) {
  if (invite.revokedAt) return "Cancelado";
  if (invite.usedAt) return "Utilizado";
  if (invite.expiresAt <= new Date().toISOString()) return "Expirado";
  return "Ativo";
}

function slugBase(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "barbearia";
}

export async function listBarbershopInvites(access: AccessContext) {
  requirePlatformAdmin(access);
  const db = await getDb();
  const rows = await db.select().from(barbershopInvites).orderBy(desc(barbershopInvites.id));
  return rows.map((invite) => ({
    id: invite.id,
    invitedLabel: invite.invitedLabel,
    trialDays: invite.trialDays,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
    organizationId: invite.organizationId,
    status: barbershopInviteStatus(invite),
  }));
}

export async function listBarbershops(access: AccessContext) {
  requirePlatformAdmin(access);
  const db = await getDb();
  const [shops, owners] = await Promise.all([
    db.select().from(organizations).where(isNull(organizations.deletedAt)).orderBy(desc(organizations.id)),
    db.select().from(team).where(eq(team.accessRole, "owner")).orderBy(team.id),
  ]);
  const ownerByOrganization = new Map<number, typeof owners[number]>();
  for (const owner of owners) if (!ownerByOrganization.has(owner.organizationId)) ownerByOrganization.set(owner.organizationId, owner);
  return shops.map((shop) => {
    const owner = ownerByOrganization.get(shop.id);
    return {
      id: shop.id,
      name: shop.name,
      status: shop.status,
      isBlocked: shop.status === "blocked" || Boolean(shop.statusBeforeBlock),
      trialEndsAt: shop.trialEndsAt,
      createdAt: shop.createdAt,
      ownerName: owner?.name ?? "Proprietário pendente",
      ownerEmail: owner?.loginEmail ?? "",
      ownerWhatsapp: shop.ownerWhatsapp,
      signupSource: shop.signupSource,
      isCurrent: shop.id === access.organizationId,
    };
  });
}

export async function setBarbershopBlocked(access: AccessContext, organizationId: number, blocked: boolean) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(organizationId) || organizationId <= 0) throw new Error("Barbearia inválida.");
  if (organizationId === access.organizationId) throw new Error("A barbearia principal não pode ser bloqueada.");

  const db = await getDb();
  const shop = (await db.select().from(organizations).where(and(
    eq(organizations.id, organizationId),
    isNull(organizations.deletedAt),
  )).limit(1))[0];
  if (!shop) throw new Error("Barbearia não encontrada.");

  const currentlyBlocked = shop.status === "blocked" || Boolean(shop.statusBeforeBlock);
  if (blocked) {
    if (currentlyBlocked) return;
    await db.update(organizations).set({
      status: "blocked",
      statusBeforeBlock: shop.status,
    }).where(eq(organizations.id, shop.id));
    return;
  }

  if (!currentlyBlocked) return;
  const restoredStatus = shop.status !== "blocked" && shop.status !== "deleted"
    ? shop.status
    : shop.statusBeforeBlock && shop.statusBeforeBlock !== "blocked" && shop.statusBeforeBlock !== "deleted"
      ? shop.statusBeforeBlock
      : shop.trialEndsAt ? "trial" : "active";
  await db.update(organizations).set({
    status: restoredStatus,
    statusBeforeBlock: null,
  }).where(eq(organizations.id, shop.id));
}

async function getTrialBarbershopForPlatformAdmin(access: AccessContext, organizationId: number) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(organizationId) || organizationId <= 0) throw new Error("Barbearia inválida.");
  if (organizationId === access.organizationId) throw new Error("O teste da barbearia principal não pode ser alterado.");

  const db = await getDb();
  const shop = (await db.select().from(organizations).where(and(
    eq(organizations.id, organizationId),
    isNull(organizations.deletedAt),
  )).limit(1))[0];
  if (!shop) throw new Error("Barbearia não encontrada.");
  if (shop.status === "blocked" || shop.statusBeforeBlock) throw new Error("Desbloqueie a barbearia antes de alterar o teste.");
  if (shop.status !== "trial") throw new Error("Este controle é exclusivo para barbearias em teste gratuito.");
  return { db, shop };
}

export async function endBarbershopTrialNow(access: AccessContext, organizationId: number) {
  const { db, shop } = await getTrialBarbershopForPlatformAdmin(access, organizationId);
  await db.update(organizations).set({
    trialEndsAt: new Date(Date.now() - 60000).toISOString(),
  }).where(eq(organizations.id, shop.id));
}

export async function restartBarbershopTrial(access: AccessContext, organizationId: number, trialDays = 14) {
  const { db, shop } = await getTrialBarbershopForPlatformAdmin(access, organizationId);
  const currentEnd = shop.trialEndsAt ? Date.parse(shop.trialEndsAt) : Number.NaN;
  if (Number.isFinite(currentEnd) && currentEnd > Date.now()) throw new Error("Este teste ainda está ativo. Encerre-o antes de reabrir.");
  const safeDays = Math.round(trialDays);
  if (!Number.isFinite(safeDays) || safeDays < 1 || safeDays > 90) throw new Error("Escolha um teste entre 1 e 90 dias.");
  await db.update(organizations).set({
    status: "trial",
    trialEndsAt: new Date(Date.now() + safeDays * 86400000).toISOString(),
  }).where(eq(organizations.id, shop.id));
}

export async function deleteBarbershop(access: AccessContext, organizationId: number) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(organizationId) || organizationId <= 0) throw new Error("Barbearia inválida.");
  if (organizationId === access.organizationId) throw new Error("A barbearia principal não pode ser excluída.");

  const db = await getDb();
  const shop = (await db.select().from(organizations).where(and(
    eq(organizations.id, organizationId),
    isNull(organizations.deletedAt),
  )).limit(1))[0];
  if (!shop) throw new Error("Barbearia não encontrada.");

  const previousStatus = shop.status === "blocked" ? (shop.statusBeforeBlock || "active") : shop.status;
  await db.update(organizations).set({
    status: "deleted",
    statusBeforeBlock: previousStatus,
    publicBookingEnabled: false,
    deletedAt: new Date().toISOString(),
  }).where(eq(organizations.id, shop.id));
}

export async function createBarbershopInvite(access: AccessContext, input: { invitedLabel?: string; trialDays?: number }) {
  requirePlatformAdmin(access);
  const invitedLabel = input.invitedLabel?.trim().slice(0, 80) || "Nova barbearia";
  const trialDays = Math.round(Number(input.trialDays ?? 14));
  if (!Number.isFinite(trialDays) || trialDays < 1 || trialDays > 90) throw new Error("Escolha um teste entre 1 e 90 dias.");

  const inviteToken = randomHex(16);
  const tokenHash = await sha256(inviteToken);
  const expiresAt = new Date(Date.now() + BARBERSHOP_INVITE_SECONDS * 1000).toISOString();
  const db = await getDb();
  const created = await db.insert(barbershopInvites).values({
    tokenHash,
    invitedLabel,
    trialDays,
    createdByTeamMemberId: access.teamMemberId,
    expiresAt,
  }).returning({ id: barbershopInvites.id });
  return { id: created[0].id, inviteToken, expiresAt };
}

export async function revokeBarbershopInvite(access: AccessContext, inviteId: number) {
  requirePlatformAdmin(access);
  const db = await getDb();
  const invite = (await db.select().from(barbershopInvites).where(eq(barbershopInvites.id, inviteId)).limit(1))[0];
  if (!invite) throw new Error("Convite não encontrado.");
  if (invite.usedAt) throw new Error("Este convite já foi utilizado.");
  await db.update(barbershopInvites).set({ revokedAt: new Date().toISOString() }).where(eq(barbershopInvites.id, invite.id));
}

export async function getBarbershopInvitePreview(inviteToken: string) {
  if (!validInviteToken(inviteToken)) return null;
  const db = await getDb();
  const invite = (await db.select().from(barbershopInvites).where(eq(barbershopInvites.tokenHash, await sha256(inviteToken))).limit(1))[0];
  if (!invite) return null;
  const status = barbershopInviteStatus(invite);
  return {
    invitedLabel: invite.invitedLabel,
    trialDays: invite.trialDays,
    expiresAt: invite.expiresAt,
    status,
    valid: status === "Ativo",
  };
}

type BarbershopRegistrationInput = {
  ownerName: string;
  organizationName: string;
  ownerDocument: string;
  email: string;
  password: string;
};

type BarbershopProvisioningOptions = {
  trialDays: number;
  createdByInviteId?: number | null;
  ownerWhatsapp?: string;
  signupSource?: string;
  termsAcceptedAt?: string | null;
  requireEmailVerification?: boolean;
};

function checkCpf(digits: string) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calculate = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculate(9) === Number(digits[9]) && calculate(10) === Number(digits[10]);
}

function checkCnpj(digits: string) {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calculate = (length: 12 | 13) => {
    const weights = length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(digits[12]) && calculate(13) === Number(digits[13]);
}

function validateOwnerDocument(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!checkCpf(digits) && !checkCnpj(digits)) throw new Error("Informe um CPF ou CNPJ válido.");
  return digits;
}

function validateBarbershopRegistration(input: BarbershopRegistrationInput) {
  const ownerName = input.ownerName.trim().slice(0, 80);
  const organizationName = input.organizationName.trim().slice(0, 100);
  if (ownerName.length < 2) throw new Error("Informe seu nome.");
  if (organizationName.length < 2) throw new Error("Informe o nome da barbearia.");
  const ownerDocument = validateOwnerDocument(input.ownerDocument);
  const email = validateEmail(input.email);
  validatePassword(input.password);
  return { ownerName, organizationName, ownerDocument, email, password: input.password };
}

function validateWhatsapp(value: string) {
  const digits = value.replace(/\D/g, "");
  const localNumber = digits.startsWith("55") ? digits.slice(2) : digits;
  if (!/^\d{10,11}$/.test(localNumber)) throw new Error("Informe um WhatsApp válido com DDD.");
  return `+55${localNumber}`;
}

function cleanSignupSource(value?: string) {
  return (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 220);
}

async function assertBarbershopEmailAvailable(email: string) {
  const db = await getDb();
  if ((await db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.email, email)).limit(1))[0]) {
    throw new Error("Este e-mail já possui acesso ao Cortou Anotou.");
  }
  if ((await db.select({ id: team.id }).from(team).where(eq(team.loginEmail, email)).limit(1))[0]) {
    throw new Error("Este e-mail já está cadastrado em uma barbearia.");
  }
}

async function ownerDocumentHash(ownerDocument: string) {
  const { env } = await import("@/runtime/env");
  const values = env as unknown as Record<string, string | undefined>;
  const secret = String(values.PLATFORM_SECRETS_ENCRYPTION_KEY ?? "").trim();
  if (!secret) return sha256(`cortou-anotou:owner-document:v1:${ownerDocument}`);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(ownerDocument));
  return bytesToHex(new Uint8Array(signature));
}

async function assertBarbershopDocumentAvailable(documentHash: string) {
  const db = await getDb();
  if ((await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.ownerDocumentHash, documentHash)).limit(1))[0]) {
    throw new Error("Este CPF ou CNPJ já foi usado para criar uma barbearia.");
  }
}

async function deleteProvisionedBarbershop(organizationId: number) {
  if (!organizationId) return;
  const db = await getDb();
  const accounts = await db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.organizationId, organizationId));
  for (const account of accounts) await db.delete(authSessions).where(eq(authSessions.accountId, account.id));
  await db.delete(emailVerifications).where(eq(emailVerifications.organizationId, organizationId));
  await db.delete(authAccounts).where(eq(authAccounts.organizationId, organizationId));
  await db.delete(goals).where(eq(goals.organizationId, organizationId));
  await db.delete(paymentMethods).where(eq(paymentMethods.organizationId, organizationId));
  await db.delete(services).where(eq(services.organizationId, organizationId));
  await db.delete(team).where(eq(team.organizationId, organizationId));
  await db.delete(organizations).where(eq(organizations.id, organizationId));
}

async function createBarbershopWorkspace(input: BarbershopRegistrationInput, options: BarbershopProvisioningOptions) {
  const registration = validateBarbershopRegistration(input);
  await assertBarbershopEmailAvailable(registration.email);
  const documentHash = await ownerDocumentHash(registration.ownerDocument);
  await assertBarbershopDocumentAvailable(documentHash);
  const db = await getDb();
  const now = new Date().toISOString();
  let organizationId = 0;

  try {
    const requiresVerification = options.requireEmailVerification === true;
    const trialEndsAt = requiresVerification ? null : new Date(Date.now() + options.trialDays * 24 * 60 * 60 * 1000).toISOString();
    const slug = `${slugBase(registration.organizationName)}-${randomHex(3)}`;
    const createdOrganization = await db.insert(organizations).values({
      name: registration.organizationName,
      slug,
      status: requiresVerification ? "pending_email" : "trial",
      trialEndsAt,
      createdByInviteId: options.createdByInviteId ?? null,
      ownerWhatsapp: options.ownerWhatsapp ?? "",
      signupSource: cleanSignupSource(options.signupSource),
      termsAcceptedAt: options.termsAcceptedAt ?? null,
      ownerDocumentHash: documentHash,
    }).returning({ id: organizations.id });
    organizationId = createdOrganization[0].id;

    const createdOwner = await db.insert(team).values({
      organizationId,
      name: registration.ownerName,
      role: "Proprietário",
      loginEmail: registration.email,
      accessRole: "owner",
      platformAdmin: false,
      commissionCents: 0,
      commissionRateBps: 0,
      active: true,
    }).returning({ id: team.id });

    const salt = randomHex(16);
    const hash = await passwordHash(registration.password, salt, PASSWORD_ITERATIONS);
    const createdAccount = await db.insert(authAccounts).values({
      organizationId,
      teamMemberId: createdOwner[0].id,
      email: registration.email,
      passwordHash: hash,
      passwordSalt: salt,
      passwordIterations: PASSWORD_ITERATIONS,
      emailVerifiedAt: requiresVerification ? null : now,
      updatedAt: now,
    }).returning({ id: authAccounts.id });

    await db.insert(services).values([
      { organizationId, name: "Corte", priceCents: 3000 },
      { organizationId, name: "Barba", priceCents: 3000 },
      { organizationId, name: "Corte + barba", priceCents: 5500 },
    ]);
    await db.insert(paymentMethods).values([
      { organizationId, name: "Dinheiro", feeBps: 0 },
      { organizationId, name: "Pix", feeBps: 0 },
      { organizationId, name: "Débito", feeBps: 0 },
      { organizationId, name: "Crédito", feeBps: 0 },
    ]);
    await db.insert(goals).values({ organizationId, month: appMonth(), revenueCents: 0, grossProfitCents: 0, expenseCents: 0, netProfitCents: 0, attendanceTarget: 0 });
    if (requiresVerification) {
      const verificationToken = randomHex(32);
      await db.insert(emailVerifications).values({
        accountId: createdAccount[0].id,
        organizationId,
        tokenHash: await sha256(verificationToken),
        trialDays: options.trialDays,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_SECONDS * 1000).toISOString(),
      });
      await sendOwnerVerificationEmail({
        email: registration.email,
        ownerName: registration.ownerName,
        organizationName: registration.organizationName,
        verificationToken,
        trialDays: options.trialDays,
      });
      return { organizationId, token: null, verificationRequired: true, email: registration.email };
    }
    return { organizationId, token: await issueSession(createdAccount[0].id), verificationRequired: false, email: registration.email };
  } catch (error) {
    await deleteProvisionedBarbershop(organizationId);
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("organizations_owner_document_unique") || detail.includes("organizations.owner_document_hash")) {
      throw new Error("Este CPF ou CNPJ já foi usado para criar uma barbearia.");
    }
    throw error;
  }
}

export async function confirmOwnerEmail(verificationToken: string) {
  if (!/^[0-9a-f]{64}$/i.test(verificationToken)) throw new Error("Este link de confirmação não é válido.");
  const db = await getDb();
  const tokenHash = await sha256(verificationToken);
  const now = new Date().toISOString();
  const verification = (await db.select().from(emailVerifications).where(eq(emailVerifications.tokenHash, tokenHash)).limit(1))[0];
  if (!verification || verification.usedAt || verification.expiresAt <= now) {
    throw new Error("Este link de confirmação expirou ou já foi utilizado.");
  }
  const account = (await db.select().from(authAccounts).where(eq(authAccounts.id, verification.accountId)).limit(1))[0];
  if (!account || account.organizationId !== verification.organizationId) throw new Error("Este cadastro não está mais disponível.");
  if (account.emailVerifiedAt) throw new Error("Este link de confirmação expirou ou já foi utilizado.");

  const reserved = await db.update(emailVerifications).set({ usedAt: now }).where(and(
    eq(emailVerifications.id, verification.id),
    isNull(emailVerifications.usedAt),
    gt(emailVerifications.expiresAt, now),
  )).returning({ id: emailVerifications.id });
  if (!reserved.length) throw new Error("Este link de confirmação expirou ou já foi utilizado.");

  await db.update(emailVerifications).set({ usedAt: now }).where(and(
    eq(emailVerifications.accountId, account.id),
    isNull(emailVerifications.usedAt),
  ));

  const trialEndsAt = new Date(Date.now() + verification.trialDays * 24 * 60 * 60 * 1000).toISOString();
  const confirmedAccount = await db.update(authAccounts).set({ emailVerifiedAt: now, updatedAt: now }).where(and(
    eq(authAccounts.id, account.id),
    isNull(authAccounts.emailVerifiedAt),
  )).returning({ id: authAccounts.id });
  if (!confirmedAccount.length) throw new Error("Este link de confirmação expirou ou já foi utilizado.");
  await db.update(organizations).set({ status: "trial", trialEndsAt }).where(eq(organizations.id, verification.organizationId));
  return issueSession(account.id);
}

export async function resendOwnerVerificationEmail(emailValue: string) {
  if (!await ownerEmailVerificationIsConfigured()) {
    throw new Error("O envio de confirmação por e-mail ainda não está configurado.");
  }

  const email = normalizeEmail(emailValue);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const db = await getDb();
  const account = (await db.select().from(authAccounts).where(eq(authAccounts.email, email)).limit(1))[0];
  if (!account || account.emailVerifiedAt) return;

  const member = (await db.select().from(team).where(eq(team.id, account.teamMemberId)).limit(1))[0];
  const organization = (await db.select().from(organizations).where(eq(organizations.id, account.organizationId)).limit(1))[0];
  if (!member?.active || member.accessRole !== "owner" || !organization || organization.status !== "pending_email") return;

  const latestVerification = (await db.select().from(emailVerifications)
    .where(eq(emailVerifications.accountId, account.id))
    .orderBy(desc(emailVerifications.id))
    .limit(1))[0];
  const trialDays = latestVerification?.trialDays ?? 14;
  const now = new Date().toISOString();
  await db.update(emailVerifications).set({ usedAt: now }).where(and(
    eq(emailVerifications.accountId, account.id),
    isNull(emailVerifications.usedAt),
  ));

  const verificationToken = randomHex(32);
  const created = await db.insert(emailVerifications).values({
    accountId: account.id,
    organizationId: account.organizationId,
    tokenHash: await sha256(verificationToken),
    trialDays,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_SECONDS * 1000).toISOString(),
  }).returning({ id: emailVerifications.id });

  try {
    await sendOwnerVerificationEmail({
      email: account.email,
      ownerName: member.name,
      organizationName: organization.name,
      verificationToken,
      trialDays,
    });
  } catch (error) {
    await db.delete(emailVerifications).where(eq(emailVerifications.id, created[0].id));
    throw error;
  }
}

export async function requestPasswordReset(emailValue: string) {
  if (!await ownerEmailVerificationIsConfigured()) {
    throw new Error("A recuperação por e-mail ainda não está configurada.");
  }

  const email = normalizeEmail(emailValue);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  const db = await getDb();
  const account = (await db.select().from(authAccounts).where(eq(authAccounts.email, email)).limit(1))[0];
  if (!account?.emailVerifiedAt) return;
  const member = (await db.select().from(team).where(eq(team.id, account.teamMemberId)).limit(1))[0];
  if (!member?.active || !await getAccessContextByTeamMemberId(account.teamMemberId)) return;

  const now = new Date().toISOString();
  await db.update(passwordResets).set({ usedAt: now }).where(and(
    eq(passwordResets.accountId, account.id),
    isNull(passwordResets.usedAt),
  ));
  const resetToken = randomHex(32);
  const created = await db.insert(passwordResets).values({
    accountId: account.id,
    tokenHash: await sha256(resetToken),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_SECONDS * 1000).toISOString(),
  }).returning({ id: passwordResets.id });

  try {
    await sendPasswordResetEmail({ email: account.email, name: member.name, resetToken });
  } catch (error) {
    await db.delete(passwordResets).where(eq(passwordResets.id, created[0].id));
    throw error;
  }
}

export async function resetPasswordWithToken(resetToken: string, password: string) {
  if (!/^[0-9a-f]{64}$/i.test(resetToken)) throw new Error("Este link de recuperação não é válido.");
  validatePassword(password);
  const db = await getDb();
  const tokenHash = await sha256(resetToken);
  const now = new Date().toISOString();
  const reset = (await db.select().from(passwordResets).where(eq(passwordResets.tokenHash, tokenHash)).limit(1))[0];
  if (!reset || reset.usedAt || reset.expiresAt <= now) {
    throw new Error("Este link de recuperação expirou ou já foi utilizado.");
  }
  const account = (await db.select().from(authAccounts).where(eq(authAccounts.id, reset.accountId)).limit(1))[0];
  if (!account?.emailVerifiedAt) throw new Error("Este acesso não está disponível para recuperação.");

  const reserved = await db.update(passwordResets).set({ usedAt: now }).where(and(
    eq(passwordResets.id, reset.id),
    isNull(passwordResets.usedAt),
    gt(passwordResets.expiresAt, now),
  )).returning({ id: passwordResets.id });
  if (!reserved.length) throw new Error("Este link de recuperação expirou ou já foi utilizado.");

  const salt = randomHex(16);
  const hash = await passwordHash(password, salt, PASSWORD_ITERATIONS);
  await db.delete(authSessions).where(eq(authSessions.accountId, account.id));
  await db.update(authAccounts).set({
    passwordHash: hash,
    passwordSalt: salt,
    passwordIterations: PASSWORD_ITERATIONS,
    updatedAt: now,
  }).where(eq(authAccounts.id, account.id));
  await db.update(passwordResets).set({ usedAt: now }).where(and(
    eq(passwordResets.accountId, account.id),
    isNull(passwordResets.usedAt),
  ));
}

async function enforcePublicSignupRateLimit(ipValue: string | undefined, email: string) {
  const ip = ipValue?.trim().slice(0, 180);
  if (!ip) return;
  const db = await getDb();
  // Separate people using the same Wi-Fi/5G address. A typo or an e-mail that
  // already exists is validated before reaching this counter.
  const ipHash = await sha256(`${ip}:${email}`);
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const recent = await db.select({ id: signupAttempts.id }).from(signupAttempts).where(and(
    eq(signupAttempts.ipHash, ipHash),
    gt(signupAttempts.createdAt, fifteenMinutesAgo),
  )).limit(5);
  if (recent.length >= 5) throw new Error("Muitas tentativas com este e-mail. Aguarde 15 minutos e tente novamente.");
  await db.delete(signupAttempts).where(and(eq(signupAttempts.ipHash, ipHash), lt(signupAttempts.createdAt, sevenDaysAgo)));
  await db.insert(signupAttempts).values({ ipHash, createdAt: new Date().toISOString() });
}

export async function createPublicBarbershop(input: BarbershopRegistrationInput & {
  whatsapp: string;
  signupSource?: string;
  referralCode?: string;
  termsAccepted?: boolean;
  requestIp?: string;
}) {
  if (!input.termsAccepted) throw new Error("Confirme que você leu e concorda com os termos do teste.");
  const registration = validateBarbershopRegistration(input);
  const ownerWhatsapp = validateWhatsapp(input.whatsapp);
  await assertBarbershopEmailAvailable(registration.email);
  const documentHash = await ownerDocumentHash(registration.ownerDocument);
  await assertBarbershopDocumentAvailable(documentHash);
  await enforcePublicSignupRateLimit(input.requestIp, registration.email);
  const requireEmailVerification = await ownerEmailVerificationIsConfigured();
  const result = await createBarbershopWorkspace(registration, {
    trialDays: 14,
    ownerWhatsapp,
    signupSource: cleanSignupSource(input.signupSource) || "cadastro-publico",
    termsAcceptedAt: new Date().toISOString(),
    requireEmailVerification,
  });
  await attachOrganizationReferral(result.organizationId, input.referralCode);
  return result;
}

export async function acceptBarbershopInvite(inviteToken: string, input: BarbershopRegistrationInput) {
  if (!validInviteToken(inviteToken)) throw new Error("Este convite não existe.");
  const registration = validateBarbershopRegistration(input);
  const db = await getDb();
  const tokenHash = await sha256(inviteToken);
  const invite = (await db.select().from(barbershopInvites).where(eq(barbershopInvites.tokenHash, tokenHash)).limit(1))[0];
  if (!invite || barbershopInviteStatus(invite) !== "Ativo") throw new Error("Este convite não está mais disponível.");
  await assertBarbershopEmailAvailable(registration.email);

  const now = new Date().toISOString();
  const reserved = await db.update(barbershopInvites).set({ usedAt: now }).where(and(
    eq(barbershopInvites.id, invite.id),
    eq(barbershopInvites.tokenHash, tokenHash),
    isNull(barbershopInvites.usedAt),
    isNull(barbershopInvites.revokedAt),
    gt(barbershopInvites.expiresAt, now),
  )).returning({ id: barbershopInvites.id });
  if (!reserved.length) throw new Error("Este convite não está mais disponível.");

  let organizationId = 0;
  try {
    const created = await createBarbershopWorkspace(registration, {
      trialDays: invite.trialDays,
      createdByInviteId: invite.id,
      signupSource: `convite-plataforma:${invite.id}`,
      requireEmailVerification: await ownerEmailVerificationIsConfigured(),
    });
    organizationId = created.organizationId;
    await db.update(barbershopInvites).set({ organizationId }).where(eq(barbershopInvites.id, invite.id));
    return created;
  } catch (error) {
    await deleteProvisionedBarbershop(organizationId);
    await db.update(barbershopInvites).set({ usedAt: null, organizationId: null }).where(and(
      eq(barbershopInvites.id, invite.id),
      eq(barbershopInvites.tokenHash, tokenHash),
    ));
    throw error;
  }
}

export async function syncTeamAccount(teamMemberId: number, loginEmail: string | null, active: boolean) {
  const db = await getDb();
  const account = (await db.select().from(authAccounts).where(eq(authAccounts.teamMemberId, teamMemberId)).limit(1))[0];
  if (!account) return;

  if (!loginEmail) {
    await db.delete(authSessions).where(eq(authSessions.accountId, account.id));
    await db.delete(authAccounts).where(eq(authAccounts.id, account.id));
    return;
  }

  const email = normalizeEmail(loginEmail);
  if (email !== account.email || !active) {
    await db.delete(authSessions).where(eq(authSessions.accountId, account.id));
  }
  if (email !== account.email) await db.update(authAccounts).set({ email, updatedAt: new Date().toISOString() }).where(eq(authAccounts.id, account.id));
}

export async function logoutCurrentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return;
  const db = await getDb();
  await db.delete(authSessions).where(eq(authSessions.tokenHash, await sha256(token)));
}
