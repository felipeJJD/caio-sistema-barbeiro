import type { Metadata } from "next";
import { getAffiliateInvitePreview } from "../../../../db/affiliate-auth";
import { InvalidAffiliateInviteScreen } from "../../../ui/affiliate-portal";
import { VerifiedAffiliateInviteScreen } from "../../../ui/affiliate-invite-screen";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Convite de Afiliado | Cortou Anotou",
};

export default async function AffiliateInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getAffiliateInvitePreview(token);
  if (!invite?.valid) return <InvalidAffiliateInviteScreen status={invite?.status} />;
  return <VerifiedAffiliateInviteScreen inviteToken={token} name={invite.name} email={invite.email} />;
}
