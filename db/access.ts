import { and, eq, sql } from "drizzle-orm";
import { getDb } from "./index";
import { organizations, team } from "./schema";

export type AccessContext = {
  organizationId: number;
  organizationName: string;
  organizationStatus: string;
  trialEndsAt: string | null;
  teamMemberId: number;
  name: string;
  email: string;
  role: "owner" | "barber";
  isOwner: boolean;
  isPlatformAdmin: boolean;
};

export function accessPeriodHasEnded(trialEndsAt: string | null) {
  if (!trialEndsAt) return false;
  const endTime = Date.parse(trialEndsAt);
  return Number.isFinite(endTime) && endTime <= Date.now();
}

export function isOrganizationAccessExpired(access: Pick<AccessContext, "trialEndsAt">) {
  return accessPeriodHasEnded(access.trialEndsAt);
}

export async function getAccessContext(email: string): Promise<AccessContext | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const db = await getDb();
  const member = (await db.select().from(team).where(and(
    eq(team.active, true),
    sql`lower(${team.loginEmail}) = ${normalizedEmail}`,
  )).limit(1))[0];

  if (!member) return null;

  const organization = (await db.select().from(organizations).where(eq(organizations.id, member.organizationId)).limit(1))[0];
  if (!organization || organization.deletedAt || organization.statusBeforeBlock || organization.status === "blocked" || organization.status === "deleted") return null;

  const role = member.accessRole === "owner" ? "owner" : "barber";
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationStatus: organization.status,
    trialEndsAt: organization.trialEndsAt,
    teamMemberId: member.id,
    name: member.name,
    email: normalizedEmail,
    role,
    isOwner: role === "owner",
    isPlatformAdmin: Boolean(member.platformAdmin),
  };
}

export async function getAccessContextByTeamMemberId(teamMemberId: number): Promise<AccessContext | null> {
  if (!Number.isInteger(teamMemberId) || teamMemberId <= 0) return null;

  const db = await getDb();
  const member = (await db.select().from(team).where(and(
    eq(team.id, teamMemberId),
    eq(team.active, true),
  )).limit(1))[0];
  if (!member || !member.loginEmail) return null;

  const organization = (await db.select().from(organizations).where(eq(organizations.id, member.organizationId)).limit(1))[0];
  if (!organization || organization.deletedAt || organization.statusBeforeBlock || organization.status === "blocked" || organization.status === "deleted") return null;

  const role = member.accessRole === "owner" ? "owner" : "barber";
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationStatus: organization.status,
    trialEndsAt: organization.trialEndsAt,
    teamMemberId: member.id,
    name: member.name,
    email: member.loginEmail.trim().toLowerCase(),
    role,
    isOwner: role === "owner",
    isPlatformAdmin: Boolean(member.platformAdmin),
  };
}

export function requireOwner(access: AccessContext) {
  if (!access.isOwner) throw new Error("Somente o administrador pode fazer esta alteração.");
}

export function requirePlatformAdmin(access: AccessContext) {
  if (!access.isPlatformAdmin) throw new Error("Somente o administrador da plataforma pode fazer esta alteração.");
}

export function requireOwnBarber(access: AccessContext, barberId: number) {
  if (!access.isOwner && barberId !== access.teamMemberId) {
    throw new Error("Você só pode registrar ou alterar os seus próprios atendimentos.");
  }
}
