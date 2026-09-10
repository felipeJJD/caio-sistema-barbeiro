import type { Metadata } from "next";
import { getAffiliateSessionAccess } from "../../db/affiliate-auth";
import { getAffiliateDashboard } from "../../db/affiliate-portal";
import { AffiliatePausedScreen, AffiliatePortal, AffiliateSignInScreen } from "../ui/affiliate-portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Área do Afiliado | Cortou Anotou",
  description: "Acompanhe links, indicações, comissões e pagamentos do programa de afiliados Cortou Anotou.",
};

export default async function AffiliatePage() {
  const access = await getAffiliateSessionAccess();
  if (!access) return <AffiliateSignInScreen />;
  if (!access.active) return <AffiliatePausedScreen />;
  const data = await getAffiliateDashboard(access);
  return <AffiliatePortal initialData={data} />;
}
