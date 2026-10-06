import { redirect } from "next/navigation";
import { getAffiliateSessionAccess } from "../../../db/affiliate-auth";
import { getAffiliateDashboard } from "../../../db/affiliate-portal";
import { AffiliateAppShell, type AffiliateShellSection } from "../../ui/affiliate-app-shell";
import { AffiliateProspectingWorkspace } from "../../ui/affiliate-prospecting-workspace";

export const dynamic = "force-dynamic";

function prospectingSection(value: string | string[] | undefined): AffiliateShellSection {
  const tab = Array.isArray(value) ? value[0] : value;
  if (tab === "progress") return "progress";
  if (tab === "settings") return "settings";
  return "prospecting";
}

export default async function AffiliateProspectingPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const access = await getAffiliateSessionAccess();
  if (!access) redirect("/afiliado");
  if (!access.active) redirect("/afiliado");

  const params = await searchParams;
  const section = prospectingSection(params.tab);
  const data = await getAffiliateDashboard(access);
  const mainLink = data.links.find((link) => link.isMain && link.active) ?? data.links.find((link) => link.active);
  const signupUrl = access.isAdmin ? "https://cortouanotou.com.br/comece" : (mainLink?.url ?? "");

  return <AffiliateAppShell name={data.profile.name} section={section} workspace>
    <AffiliateProspectingWorkspace name={data.profile.name} initialWhatsapp={data.profile.whatsapp} signupUrl={signupUrl} isAdmin={Boolean(access.isAdmin)} links={data.links.filter(link => link.active).map(link => ({id:link.id,label:link.label,url:link.url}))} />
  </AffiliateAppShell>;
}
