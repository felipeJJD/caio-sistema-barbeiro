import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import type { AccessContext } from "./access";
import { requirePlatformAdmin } from "./access";
import { getDb } from "./index";
import { affiliateAccounts, affiliateInvites, affiliateSessions, affiliates } from "./schema";

const PUBLIC_APP_URL = "https://cortouanotou.com.br";
const AFFILIATE_SESSION_COOKIE = "cortou_anotou_affiliate_session";
const SESSION_SECONDS = 60 * 60 * 24 * 180;
const INVITE_SECONDS = 60 * 60 * 24 * 7;
const PASSWORD_ITERATIONS = 100000;

export type AffiliateAccess = {
  accountId: number;
  affiliateId: number;
  name: string;
  email: string;
  active: boolean;
};

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
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
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
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  return email.slice(0, 160);
}

function validatePassword(password: string) {
  if (password.length < 6) throw new Error("Crie uma senha com pelo menos 6 caracteres.");
  if (password.length > 128) throw new Error("A senha informada é muito longa.");
}

function inviteStatus(invite: typeof affiliateInvites.$inferSelect) {
  if (invite.revokedAt) return "Cancelado";
  if (invite.usedAt) return "Utilizado";
  if (invite.expiresAt <= new Date().toISOString()) return "Expirado";
  return "Ativo";
}

async function issueAffiliateSession(accountId: number) {
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const db = await getDb();
  await db.insert(affiliateSessions).values({ tokenHash, accountId, expiresAt });
  return token;
}

export function affiliateSessionCookie(token: string) {
  return `${AFFILIATE_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_SECONDS}`;
}

export function clearedAffiliateSessionCookie() {
  return `${AFFILIATE_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function createAffiliateInvite(access: AccessContext, affiliateId: number) {
  requirePlatformAdmin(access);
  if (!Number.isInteger(affiliateId) || affiliateId <= 0) throw new Error("Afiliado inválido.");
  const db = await getDb();
  const affiliate = (await db.select({ id: affiliates.id, active: affiliates.active }).from(affiliates).where(eq(affiliates.id, affiliateId)).limit(1))[0];
  if (!affiliate) throw new Error("Afiliado não encontrado.");
  if (!affiliate.active) throw new Error("Ative o afiliado antes de gerar o convite.");
  const existingAccount = (await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.affiliateId, affiliateId)).limit(1))[0];
  if (existingAccount) throw new Error("Este afiliado já criou o acesso. Ele pode entrar pela área de afiliados.");

  const now = new Date().toISOString();
  await db.update(affiliateInvites).set({ revokedAt: now }).where(and(
    eq(affiliateInvites.affiliateId, affiliateId),
    isNull(affiliateInvites.usedAt),
    isNull(affiliateInvites.revokedAt),
  ));
  const inviteToken = randomHex(16);
  const expiresAt = new Date(Date.now() + INVITE_SECONDS * 1000).toISOString();
  await db.insert(affiliateInvites).values({
    affiliateId,
    tokenHash: await sha256(inviteToken),
    expiresAt,
    createdByTeamMemberId: access.teamMemberId,
  });
  return { inviteToken, inviteUrl: `${PUBLIC_APP_URL}/afiliado/convite/${inviteToken}`, expiresAt };
}

export async function getAffiliateInvitePreview(inviteToken: string) {
  if (!/^[0-9a-f]{32}$/i.test(inviteToken)) return null;
  const db = await getDb();
  const invite = (await db.select().from(affiliateInvites).where(eq(affiliateInvites.tokenHash, await sha256(inviteToken))).limit(1))[0];
  if (!invite) return null;
  const affiliate = (await db.select({ name: affiliates.name, email: affiliates.email, active: affiliates.active }).from(affiliates).where(eq(affiliates.id, invite.affiliateId)).limit(1))[0];
  if (!affiliate) return null;
  const account = (await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.affiliateId, invite.affiliateId)).limit(1))[0];
  const status = account ? "Utilizado" : !affiliate.active && inviteStatus(invite) === "Ativo" ? "Cancelado" : inviteStatus(invite);
  return { ...affiliate, status, valid: status === "Ativo", expiresAt: invite.expiresAt };
}

export async function acceptAffiliateInvite(inviteToken: string, input: { name: string; email: string; password: string }) {
  const preview = await getAffiliateInvitePreview(inviteToken);
  if (!preview) throw new Error("Este convite não existe.");
  if (!preview.valid) throw new Error(`Este convite está ${preview.status.toLowerCase()}. Peça um novo link ao Cortou Anotou.`);
  const name = input.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 100);
  if (name.length < 2) throw new Error("Informe seu nome.");
  const email = normalizeEmail(input.email);
  validatePassword(input.password);

  const db = await getDb();
  const tokenHash = await sha256(inviteToken);
  const now = new Date().toISOString();
  const invite = (await db.select().from(affiliateInvites).where(eq(affiliateInvites.tokenHash, tokenHash)).limit(1))[0];
  if (!invite) throw new Error("Este convite não existe.");
  if ((await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.email, email)).limit(1))[0]) {
    throw new Error("Este e-mail já possui acesso de afiliado.");
  }
  const reserved = await db.update(affiliateInvites).set({ usedAt: now }).where(and(
    eq(affiliateInvites.id, invite.id),
    isNull(affiliateInvites.usedAt),
    isNull(affiliateInvites.revokedAt),
    gt(affiliateInvites.expiresAt, now),
  )).returning({ id: affiliateInvites.id });
  if (!reserved.length) throw new Error("Este convite não está mais disponível.");

  const salt = randomHex(16);
  const hash = await passwordHash(input.password, salt, PASSWORD_ITERATIONS);
  try {
    const account = (await db.insert(affiliateAccounts).values({
      affiliateId: invite.affiliateId,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      passwordIterations: PASSWORD_ITERATIONS,
      lastLoginAt: now,
      updatedAt: now,
    }).returning({ id: affiliateAccounts.id }))[0];
    await db.update(affiliates).set({ name, email, updatedAt: now }).where(eq(affiliates.id, invite.affiliateId));
    return issueAffiliateSession(account.id);
  } catch (error) {
    await db.update(affiliateInvites).set({ usedAt: null }).where(eq(affiliateInvites.id, invite.id));
    const detail = error instanceof Error ? error.message : String(error);
    if (detail.includes("affiliate_accounts_affiliate_unique")) throw new Error("Este afiliado já possui acesso.");
    if (detail.includes("affiliate_accounts_email_unique")) throw new Error("Este e-mail já possui acesso de afiliado.");
    throw new Error("Não foi possível criar seu acesso agora. Tente novamente.");
  }
}

export async function loginAffiliate(emailValue: string, password: string) {
  const email = normalizeEmail(emailValue);
  if (!password) throw new Error("Informe seu e-mail e sua senha.");
  const db = await getDb();
  const account = (await db.select().from(affiliateAccounts).where(eq(affiliateAccounts.email, email)).limit(1))[0];
  if (!account) throw new Error("E-mail ou senha incorretos.");
  const candidate = await passwordHash(password, account.passwordSalt, account.passwordIterations);
  if (!secureEqual(candidate, account.passwordHash)) throw new Error("E-mail ou senha incorretos.");
  const affiliate = (await db.select({ active: affiliates.active }).from(affiliates).where(eq(affiliates.id, account.affiliateId)).limit(1))[0];
  if (!affiliate?.active) throw new Error("Este acesso está pausado. Fale com o Cortou Anotou.");
  await db.update(affiliateAccounts).set({ lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).where(eq(affiliateAccounts.id, account.id));
  return issueAffiliateSession(account.id);
}

export async function getAffiliateSessionAccess(): Promise<AffiliateAccess | null> {
  const token = (await cookies()).get(AFFILIATE_SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const row = (await db.select({
    accountId: affiliateAccounts.id,
    affiliateId: affiliates.id,
    name: affiliates.name,
    email: affiliateAccounts.email,
    active: affiliates.active,
  }).from(affiliateSessions)
    .innerJoin(affiliateAccounts, eq(affiliateAccounts.id, affiliateSessions.accountId))
    .innerJoin(affiliates, eq(affiliates.id, affiliateAccounts.affiliateId))
    .where(and(eq(affiliateSessions.tokenHash, await sha256(token)), gt(affiliateSessions.expiresAt, new Date().toISOString())))
    .limit(1))[0];
  return row ?? null;
}

export async function logoutCurrentAffiliateSession() {
  const token = (await cookies()).get(AFFILIATE_SESSION_COOKIE)?.value;
  if (!token) return;
  const db = await getDb();
  await db.delete(affiliateSessions).where(eq(affiliateSessions.tokenHash, await sha256(token)));
}
