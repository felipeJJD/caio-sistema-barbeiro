import { redirect } from "next/navigation";
import { getAffiliateSessionAccess } from "../../../db/affiliate-auth";
import { getAffiliateDashboard } from "../../../db/affiliate-portal";
import { AffiliateProspecting } from "../../ui/affiliate-prospecting";

export const dynamic = "force-dynamic";

export default async function AffiliateProspectingPage() {
  const access = await getAffiliateSessionAccess();
  if (!access) redirect("/afiliado");
  if (!access.active) redirect("/afiliado");

  const data = await getAffiliateDashboard(access);
  const mainLink = data.links.find((link) => link.isMain && link.active) ?? data.links.find((link) => link.active) ?? data.links[0];
  const signupUrl = access.isAdmin ? "https://cortouanotou.com.br/comece" : (mainLink?.url ?? "");

  return <AffiliateProspecting name={data.profile.name} initialWhatsapp={data.profile.whatsapp} signupUrl={signupUrl} isAdmin={Boolean(access.isAdmin)} />;
}
