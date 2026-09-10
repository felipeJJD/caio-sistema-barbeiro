import { getTeamInvitePreview } from "../../../db/auth";
import { InviteSetupScreen, InvalidInviteScreen } from "../../ui/access-screen";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getTeamInvitePreview(token);
  if (!invite || !invite.valid) return <InvalidInviteScreen status={invite?.status} />;
  return <InviteSetupScreen inviteToken={token} organizationName={invite.organizationName} invitedName={invite.invitedName} role={invite.role} accessRole={invite.accessRole} />;
}
