import type { Metadata } from "next";
import { getAffiliateSessionAccess } from "../../db/affiliate-auth";
import { getAffiliateDashboard } from "../../db/affiliate-portal";
import { AffiliatePausedScreen, AffiliatePortal } from "../ui/affiliate-portal";
import { AffiliateLoginScreen } from "../ui/affiliate-login";
import { AffiliateProspectingSummary } from "../ui/affiliate-prospecting-summary";
import { AffiliateBottomNav } from "../ui/affiliate-bottom-nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Área do Afiliado | Cortou Anotou",
  description: "Acompanhe links, indicações, comissões, pagamentos e prospecção do programa de afiliados Cortou Anotou.",
};

export default async function AffiliatePage() {
  const access = await getAffiliateSessionAccess();
  if (!access) return <AffiliateLoginScreen />;
  if (!access.active) return <AffiliatePausedScreen />;
  const data = await getAffiliateDashboard(access);
  return <><AffiliatePortal initialData={data} /><AffiliateProspectingSummary /><AffiliateBottomNav active="home" /></>;
}
