import { and, eq, gt, isNull } from "drizzle-orm";
import { sendAccessVerificationEmail, ownerEmailVerificationIsConfigured } from "../lib/owner-email";
import { env } from "../runtime/env";
import { getDb } from "./index";
import {
  affiliateAccounts,
  affiliateInvites,
  affiliateSessions,
  affiliates,
  authAccounts,
  authSessions,
  organizations,
  team,
  teamInvites,
} from "./schema";

const PASSWORD_ITERATIONS = 100000;
const VERIFICATION_SECONDS = 60 * 60 * 24;
const SESSION_SECONDS = 60 * 60 * 24 * 180;

type PendingKind = "team" | "affiliate";

type PendingRegistration = {
  id: number;
  kind: PendingKind;
  source_invite_id: number;
  organization_id: number | null;
  team_member_id: number | null;
  affiliate_id: number | null;
  name: string;
  email: string;
  role: string;
  access_role: string;
  commission_rate_bps: number;
  password_hash: string;
  password_salt: string;
  password_iterations: number;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
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

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Informe um e-mail válido.");
  if (email.length > 160) throw new Error("Informe um e-mail válido.");
  return email;
}

function cleanName(value: string) {
  const name = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ").slice(0, 100);
  if (name.length < 2) throw new Error("Informe seu nome.");
  return name;
}

function validatePassword(password: string) {
  if (password.length < 6) throw new Error("Crie uma senha com pelo menos 6 caracteres.");
  if (password.length > 128) throw new Error("A senha informada é muito longa.");
}

function inviteAvailable(invite: { usedAt: string | null; revokedAt: string | null; expiresAt: string }) {
  return !invite.usedAt && !invite.revokedAt && invite.expiresAt > new Date().toISOString();
}

async function pendingByToken(token: string) {
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;
  return await env.DB.prepare("SELECT * FROM pending_registrations WHERE token_hash = ? LIMIT 1")
    .bind(await sha256(token))
    .first() as PendingRegistration | null;
}

async function insertPending(input: Omit<PendingRegistration, "id" | "used_at" | "created_at">) {
  const result = await env.DB.prepare(`INSERT INTO pending_registrations (
    kind, source_invite_id, organization_id, team_member_id, affiliate_id, name, email, role, access_role,
    commission_rate_bps, password_hash, password_salt, password_iterations, token_hash, expires_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    input.kind,
    input.source_invite_id,
    input.organization_id,
    input.team_member_id,
    input.affiliate_id,
    input.name,
    input.email,
    input.role,
    input.access_role,
    input.commission_rate_bps,
    input.password_hash,
    input.password_salt,
    input.password_iterations,
    input.token_hash,
    input.expires_at,
  ).run();
  return Number(result.meta.last_row_id);
}

async function deletePending(id: number) {
  await env.DB.prepare("DELETE FROM pending_registrations WHERE id = ?").bind(id).run();
}

async function reservePending(row: PendingRegistration, now: string) {
  const result = await env.DB.prepare("UPDATE pending_registrations SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?")
    .bind(now, row.id, now)
    .run();
  return Number(result.meta.changes) === 1;
}

async function releasePending(id: number, now: string) {
  await env.DB.prepare("UPDATE pending_registrations SET used_at = NULL WHERE id = ? AND used_at = ?").bind(id, now).run();
}

export async function hasPendingRegistrationEmail(emailValue: string, kind: PendingKind) {
  const email = emailValue.trim().toLowerCase();
  if (!email) return false;
  const now = new Date().toISOString();
  const row = await env.DB.prepare("SELECT id FROM pending_registrations WHERE email = ? AND kind = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC LIMIT 1")
    .bind(email, kind, now)
    .first();
  return Boolean(row);
}

export async function startTeamInviteVerification(inviteToken: string, input: { name: string; email: string; password: string }) {
  if (!await ownerEmailVerificationIsConfigured()) throw new Error("O envio de confirmação por e-mail ainda não está configurado.");
  if (!/^[0-9a-f]{32}$/i.test(inviteToken)) throw new Error("Este convite não existe.");
  const name = cleanName(input.name);
  const email = normalizeEmail(input.email);
  validatePassword(input.password);

  const db = await getDb();
  const tokenHash = await sha256(inviteToken);
  const invite = (await db.select().from(teamInvites).where(eq(teamInvites.tokenHash, tokenHash)).limit(1))[0];
  if (!invite) throw new Error("Este convite não existe.");
  if (!inviteAvailable(invite)) throw new Error("Este convite não está mais disponível. Peça um novo link ao administrador.");
  const organization = (await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, invite.organizationId)).limit(1))[0];
  if (!organization) throw new Error("A barbearia deste convite não foi encontrada.");
  if ((await db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.email, email)).limit(1))[0]) {
    throw new Error("Este e-mail já possui acesso ao Cortou Anotou.");
  }
  const memberWithEmail = (await db.select({ id: team.id }).from(team).where(eq(team.loginEmail, email)).limit(1))[0];
  if (memberWithEmail && memberWithEmail.id !== invite.teamMemberId) throw new Error("Este e-mail já está cadastrado na equipe.");
  if (invite.teamMemberId) {
    const invitedMember = (await db.select({ id: team.id }).from(team).where(and(eq(team.id, invite.teamMemberId), eq(team.organizationId, invite.organizationId))).limit(1))[0];
    if (!invitedMember) throw new Error("O profissional deste convite não foi encontrado.");
    if ((await db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.teamMemberId, invitedMember.id)).limit(1))[0]) {
      throw new Error("Este profissional já possui login no Cortou Anotou.");
    }
  }

  const salt = randomHex(16);
  const hash = await passwordHash(input.password, salt, PASSWORD_ITERATIONS);
  const verificationToken = randomHex(32);
  const now = new Date().toISOString();
  const reserved = await db.update(teamInvites).set({ usedAt: now }).where(and(
    eq(teamInvites.id, invite.id),
    isNull(teamInvites.usedAt),
    isNull(teamInvites.revokedAt),
    gt(teamInvites.expiresAt, now),
  )).returning({ id: teamInvites.id });
  if (!reserved.length) throw new Error("Este convite não está mais disponível. Peça um novo link ao administrador.");

  let pendingId = 0;
  try {
    pendingId = await insertPending({
      kind: "team",
      source_invite_id: invite.id,
      organization_id: invite.organizationId,
      team_member_id: invite.teamMemberId,
      affiliate_id: null,
      name,
      email,
      role: invite.role,
      access_role: invite.accessRole === "owner" ? "owner" : "barber",
      commission_rate_bps: invite.commissionRateBps,
      password_hash: hash,
      password_salt: salt,
      password_iterations: PASSWORD_ITERATIONS,
      token_hash: await sha256(verificationToken),
      expires_at: new Date(Date.now() + VERIFICATION_SECONDS * 1000).toISOString(),
    });
    await sendAccessVerificationEmail({
      email,
      name,
      verificationToken,
      accessLabel: `${invite.accessRole === "owner" ? "administrador" : "funcionário"} da ${organization.name}`,
    });
    return { verificationRequired: true as const, email };
  } catch (error) {
    if (pendingId) await deletePending(pendingId).catch(() => undefined);
    await db.update(teamInvites).set({ usedAt: null }).where(and(eq(teamInvites.id, invite.id), eq(teamInvites.usedAt, now))).catch(() => undefined);
    throw error;
  }
}

export async function startAffiliateInviteVerification(inviteToken: string, input: { name: string; email: string; password: string }) {
  if (!await ownerEmailVerificationIsConfigured()) throw new Error("O envio de confirmação por e-mail ainda não está configurado.");
  if (!/^[0-9a-f]{32}$/i.test(inviteToken)) throw new Error("Este convite não existe.");
  const name = cleanName(input.name);
  const email = normalizeEmail(input.email);
  validatePassword(input.password);

  const db = await getDb();
  const tokenHash = await sha256(inviteToken);
  const invite = (await db.select().from(affiliateInvites).where(eq(affiliateInvites.tokenHash, tokenHash)).limit(1))[0];
  if (!invite) throw new Error("Este convite não existe.");
  if (!inviteAvailable(invite)) throw new Error("Este convite não está mais disponível. Peça um novo link ao Cortou Anotou.");
  const affiliate = (await db.select({ id: affiliates.id, active: affiliates.active }).from(affiliates).where(eq(affiliates.id, invite.affiliateId)).limit(1))[0];
  if (!affiliate?.active) throw new Error("Este convite não está mais disponível. Peça um novo link ao Cortou Anotou.");
  if ((await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.affiliateId, invite.affiliateId)).limit(1))[0]) {
    throw new Error("Este afiliado já possui acesso.");
  }
  if ((await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.email, email)).limit(1))[0]) {
    throw new Error("Este e-mail já possui acesso de afiliado.");
  }

  const salt = randomHex(16);
  const hash = await passwordHash(input.password, salt, PASSWORD_ITERATIONS);
  const verificationToken = randomHex(32);
  const now = new Date().toISOString();
  const reserved = await db.update(affiliateInvites).set({ usedAt: now }).where(and(
    eq(affiliateInvites.id, invite.id),
    isNull(affiliateInvites.usedAt),
    isNull(affiliateInvites.revokedAt),
    gt(affiliateInvites.expiresAt, now),
  )).returning({ id: affiliateInvites.id });
  if (!reserved.length) throw new Error("Este convite não está mais disponível. Peça um novo link ao Cortou Anotou.");

  let pendingId = 0;
  try {
    pendingId = await insertPending({
      kind: "affiliate",
      source_invite_id: invite.id,
      organization_id: null,
      team_member_id: null,
      affiliate_id: invite.affiliateId,
      name,
      email,
      role: "Afiliado",
      access_role: "affiliate",
      commission_rate_bps: 0,
      password_hash: hash,
      password_salt: salt,
      password_iterations: PASSWORD_ITERATIONS,
      token_hash: await sha256(verificationToken),
      expires_at: new Date(Date.now() + VERIFICATION_SECONDS * 1000).toISOString(),
    });
    await sendAccessVerificationEmail({ email, name, verificationToken, accessLabel: "afiliado do Cortou Anotou" });
    return { verificationRequired: true as const, email };
  } catch (error) {
    if (pendingId) await deletePending(pendingId).catch(() => undefined);
    await db.update(affiliateInvites).set({ usedAt: null }).where(and(eq(affiliateInvites.id, invite.id), eq(affiliateInvites.usedAt, now))).catch(() => undefined);
    throw error;
  }
}

async function issueTeamSession(accountId: number) {
  const token = randomHex(32);
  const db = await getDb();
  await db.insert(authSessions).values({
    tokenHash: await sha256(token),
    accountId,
    expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
  });
  return token;
}

async function issueAffiliateSession(accountId: number) {
  const token = randomHex(32);
  const db = await getDb();
  await db.insert(affiliateSessions).values({
    tokenHash: await sha256(token),
    accountId,
    expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
  });
  return token;
}

export async function confirmPendingRegistration(verificationToken: string): Promise<{ kind: PendingKind; token: string } | null> {
  const row = await pendingByToken(verificationToken);
  if (!row) return null;
  const now = new Date().toISOString();
  if (row.used_at || row.expires_at <= now) throw new Error("Este link de confirmação expirou ou já foi utilizado.");
  if (!await reservePending(row, now)) throw new Error("Este link de confirmação expirou ou já foi utilizado.");

  const db = await getDb();
  if (row.kind === "team") {
    if (!row.organization_id) {
      await releasePending(row.id, now);
      throw new Error("Este cadastro não está mais disponível.");
    }
    let createdMemberId: number | null = null;
    let previousMember: { name: string; loginEmail: string | null; active: boolean } | null = null;
    let accountId: number | null = null;
    try {
      if ((await db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.email, row.email)).limit(1))[0]) throw new Error("Este e-mail já possui acesso ao Cortou Anotou.");
      let teamMemberId = row.team_member_id;
      if (teamMemberId) {
        const member = (await db.select({ id: team.id, name: team.name, loginEmail: team.loginEmail, active: team.active }).from(team).where(and(eq(team.id, teamMemberId), eq(team.organizationId, row.organization_id))).limit(1))[0];
        if (!member) throw new Error("O profissional deste cadastro não foi encontrado.");
        if ((await db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.teamMemberId, teamMemberId)).limit(1))[0]) throw new Error("Este profissional já possui login no Cortou Anotou.");
        previousMember = member;
        await db.update(team).set({ name: row.name, loginEmail: row.email, active: true }).where(eq(team.id, teamMemberId));
      } else {
        const created = await db.insert(team).values({
          organizationId: row.organization_id,
          name: row.name,
          role: row.role || "Barbeiro",
          loginEmail: row.email,
          accessRole: row.access_role === "owner" ? "owner" : "barber",
          commissionCents: 0,
          commissionRateBps: row.commission_rate_bps,
          active: true,
        }).returning({ id: team.id });
        teamMemberId = created[0].id;
        createdMemberId = teamMemberId;
      }
      const account = await db.insert(authAccounts).values({
        organizationId: row.organization_id,
        teamMemberId,
        email: row.email,
        passwordHash: row.password_hash,
        passwordSalt: row.password_salt,
        passwordIterations: row.password_iterations,
        emailVerifiedAt: now,
        updatedAt: now,
      }).returning({ id: authAccounts.id });
      accountId = account[0].id;
      return { kind: "team", token: await issueTeamSession(accountId) };
    } catch (error) {
      if (accountId) {
        await db.delete(authSessions).where(eq(authSessions.accountId, accountId)).catch(() => undefined);
        await db.delete(authAccounts).where(eq(authAccounts.id, accountId)).catch(() => undefined);
      }
      if (createdMemberId) await db.delete(team).where(eq(team.id, createdMemberId)).catch(() => undefined);
      else if (row.team_member_id && previousMember) await db.update(team).set(previousMember).where(eq(team.id, row.team_member_id)).catch(() => undefined);
      await releasePending(row.id, now).catch(() => undefined);
      throw error;
    }
  }

  if (!row.affiliate_id) {
    await releasePending(row.id, now);
    throw new Error("Este cadastro não está mais disponível.");
  }
  let accountId: number | null = null;
  let previousAffiliate: { name: string; email: string } | null = null;
  try {
    if ((await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.email, row.email)).limit(1))[0]) throw new Error("Este e-mail já possui acesso de afiliado.");
    if ((await db.select({ id: affiliateAccounts.id }).from(affiliateAccounts).where(eq(affiliateAccounts.affiliateId, row.affiliate_id)).limit(1))[0]) throw new Error("Este afiliado já possui acesso.");
    const affiliate = (await db.select({ name: affiliates.name, email: affiliates.email, active: affiliates.active }).from(affiliates).where(eq(affiliates.id, row.affiliate_id)).limit(1))[0];
    if (!affiliate?.active) throw new Error("Este acesso está pausado. Fale com o Cortou Anotou.");
    previousAffiliate = { name: affiliate.name, email: affiliate.email };
    const account = await db.insert(affiliateAccounts).values({
      affiliateId: row.affiliate_id,
      email: row.email,
      passwordHash: row.password_hash,
      passwordSalt: row.password_salt,
      passwordIterations: row.password_iterations,
      lastLoginAt: now,
      updatedAt: now,
    }).returning({ id: affiliateAccounts.id });
    accountId = account[0].id;
    await db.update(affiliates).set({ name: row.name, email: row.email, updatedAt: now }).where(eq(affiliates.id, row.affiliate_id));
    return { kind: "affiliate", token: await issueAffiliateSession(accountId) };
  } catch (error) {
    if (accountId) {
      await db.delete(affiliateSessions).where(eq(affiliateSessions.accountId, accountId)).catch(() => undefined);
      await db.delete(affiliateAccounts).where(eq(affiliateAccounts.id, accountId)).catch(() => undefined);
    }
    if (row.affiliate_id && previousAffiliate) await db.update(affiliates).set({ ...previousAffiliate, updatedAt: now }).where(eq(affiliates.id, row.affiliate_id)).catch(() => undefined);
    await releasePending(row.id, now).catch(() => undefined);
    throw error;
  }
}

export async function resendPendingVerification(emailValue: string) {
  if (!await ownerEmailVerificationIsConfigured()) throw new Error("O envio de confirmação por e-mail ainda não está configurado.");
  const email = normalizeEmail(emailValue);
  const now = new Date().toISOString();
  const row = await env.DB.prepare("SELECT * FROM pending_registrations WHERE email = ? AND used_at IS NULL ORDER BY id DESC LIMIT 1")
    .bind(email)
    .first() as PendingRegistration | null;
  if (!row) return false;
  const verificationToken = randomHex(32);
  const newHash = await sha256(verificationToken);
  const newExpiry = new Date(Date.now() + VERIFICATION_SECONDS * 1000).toISOString();
  const previousHash = row.token_hash;
  const previousExpiry = row.expires_at;
  await env.DB.prepare("UPDATE pending_registrations SET token_hash = ?, expires_at = ? WHERE id = ? AND used_at IS NULL")
    .bind(newHash, newExpiry, row.id)
    .run();
  try {
    await sendAccessVerificationEmail({
      email: row.email,
      name: row.name,
      verificationToken,
      accessLabel: row.kind === "affiliate" ? "afiliado do Cortou Anotou" : row.access_role === "owner" ? "administrador da barbearia" : "funcionário da barbearia",
    });
    return true;
  } catch (error) {
    await env.DB.prepare("UPDATE pending_registrations SET token_hash = ?, expires_at = ? WHERE id = ? AND used_at IS NULL")
      .bind(previousHash, previousExpiry, row.id)
      .run()
      .catch(() => undefined);
    throw error;
  }
}
