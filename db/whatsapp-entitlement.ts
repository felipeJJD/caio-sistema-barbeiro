import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { organizations, team } from "./schema";

export type WhatsappEntitlement = {
  hasAccess: boolean;
  unlimited: boolean;
  source: "platform_admin" | "subscription" | "trial" | "none";
};

/** Old message package columns are no longer used to grant WhatsApp access. */
export function whatsappEntitlementForState(input: {
  status: string;
  trialEndsAt: string | null;
  deletedAt: string | null;
  statusBeforeBlock: string | null;
  platformAdmin: boolean;
}): WhatsappEntitlement {
  const denied = { hasAccess: false, unlimited: false, source: "none" as const };
  if (input.deletedAt || input.statusBeforeBlock || ["blocked", "deleted"].includes(input.status)) return denied;
  if (input.platformAdmin) return { hasAccess: true, unlimited: true, source: "platform_admin" };
  if (input.trialEndsAt && Number.isFinite(Date.parse(input.trialEndsAt)) && Date.parse(input.trialEndsAt) <= Date.now()) return denied;
  if (input.status === "active") return { hasAccess: true, unlimited: true, source: "subscription" };
  if (input.status === "trial" && input.trialEndsAt) return { hasAccess: true, unlimited: true, source: "trial" };
  return denied;
}

export async function getWhatsappEntitlementForOrganization(organizationId: number): Promise<WhatsappEntitlement> {
  const denied = { hasAccess: false, unlimited: false, source: "none" as const };
  if (!Number.isInteger(organizationId) || organizationId <= 0) return denied;
  const db = await getDb();
  const organization = (await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1))[0];
  if (!organization) return denied;
  const platformAdmin = (await db.select({ id: team.id }).from(team).where(and(
    eq(team.organizationId, organizationId),
    eq(team.active, true),
    eq(team.platformAdmin, true),
  )).limit(1))[0];

  return whatsappEntitlementForState({
    status: organization.status,
    trialEndsAt: organization.trialEndsAt,
    deletedAt: organization.deletedAt,
    statusBeforeBlock: organization.statusBeforeBlock,
    platformAdmin: Boolean(platformAdmin),
  });
}
