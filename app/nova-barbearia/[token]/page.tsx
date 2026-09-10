import { getBarbershopInvitePreview } from "../../../db/auth";
import { InvalidBarbershopInviteScreen, NewBarbershopSetupScreen } from "../../ui/access-screen";

export const dynamic = "force-dynamic";

export default async function NewBarbershopPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getBarbershopInvitePreview(token);
  if (!invite || !invite.valid) return <InvalidBarbershopInviteScreen status={invite?.status} />;
  return <NewBarbershopSetupScreen inviteToken={token} invitedLabel={invite.invitedLabel} trialDays={invite.trialDays} />;
}
