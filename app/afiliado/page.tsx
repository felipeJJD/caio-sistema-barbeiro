import type { Metadata } from "next";
import { getAffiliateSessionAccess } from "../../db/affiliate-auth";
import { getAffiliateDashboard } from "../../db/affiliate-portal";
import { AffiliatePausedScreen, AffiliatePortal } from "../ui/affiliate-portal";
import { AffiliateLoginScreen } from "../ui/affiliate-login";
import { AffiliateProspectingSummary } from "../ui/affiliate-prospecting-summary";
import { AffiliateAppShell, type AffiliateShellSection } from "../ui/affiliate-app-shell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Área do Afiliado | Cortou Anotou",
  description: "Acompanhe links, indicações, comissões, pagamentos e prospecção do programa de afiliados Cortou Anotou.",
};

function affiliateSection(value: string | string[] | undefined): AffiliateShellSection {
  const view = Array.isArray(value) ? value[0] : value;
  if (view === "indicacoes") return "indications";
  if (view === "links") return "links";
  if (view === "comissoes") return "commissions";
  return "home";
}

export default async function AffiliatePage({ searchParams }: { searchParams: Promise<{ view?: string | string[] }> }) {
  const access = await getAffiliateSessionAccess();
  if (!access) return <AffiliateLoginScreen />;
  if (!access.active) return <AffiliatePausedScreen />;
  const params = await searchParams;
  const section = affiliateSection(params.view);
  const data = await getAffiliateDashboard(access);
  return <AffiliateAppShell name={data.profile.name} section={section}>
    <AffiliatePortal initialData={data} />
    {section === "home" && <AffiliateProspectingSummary />}
  </AffiliateAppShell>;
}
