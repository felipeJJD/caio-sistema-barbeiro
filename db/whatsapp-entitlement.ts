import { and, eq } from "drizzle-orm";
import { getDb } from "./index";
import { team } from "./schema";

export type WhatsappEntitlement = {
  hasAccess: boolean;
  unlimited: boolean;
  source: "platform_admin" | "package" | "none";
  monthlyMessageLimit: number;
};

function normalizedMessageLimit(value: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

/**
 * Central source of truth for WhatsApp message access.
 *
 * Platform administrators receive full access for the organization they belong
 * to without creating a fake package or persisting an artificial message limit.
 * Regular organizations keep the existing package rule: a positive monthly
 * message limit is required.
 */
export async function getWhatsappEntitlementForOrganization(
  organizationId: number,
  monthlyMessageLimit: number,
): Promise<WhatsappEntitlement> {
  const limit = normalizedMessageLimit(monthlyMessageLimit);
  if (!Number.isInteger(organizationId) || organizationId <= 0) {
    return { hasAccess: false, unlimited: false, source: "none", monthlyMessageLimit: limit };
  }

  const db = await getDb();
  const platformAdmin = (await db.select({ id: team.id }).from(team).where(and(
    eq(team.organizationId, organizationId),
    eq(team.active, true),
    eq(team.platformAdmin, true),
  )).limit(1))[0];

  if (platformAdmin) {
    return { hasAccess: true, unlimited: true, source: "platform_admin", monthlyMessageLimit: limit };
  }
  if (limit > 0) {
    return { hasAccess: true, unlimited: false, source: "package", monthlyMessageLimit: limit };
  }
  return { hasAccess: false, unlimited: false, source: "none", monthlyMessageLimit: limit };
}
