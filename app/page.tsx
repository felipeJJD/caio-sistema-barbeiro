import { DashboardApp } from "./ui/dashboard-app";
import { OwnerSetupScreen, SignInScreen } from "./ui/access-screen";
import { TeamCleanupPanel } from "./ui/team-cleanup-panel";
import { ensureDemoData, getDashboardData } from "../db/dashboard";
import { getAccessContext } from "../db/access";
import { getChatGPTUser } from "./chatgpt-auth";
import { getSessionAccess, hasPasswordForTeamMember } from "../db/auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ email?: string | string[] }> }) {
  const params = await searchParams;
  const initialEmail = typeof params.email === "string" ? params.email.trim().toLowerCase() : "";
  const sessionAccess = await getSessionAccess();
  if (sessionAccess) {
    const data = await getDashboardData(sessionAccess);
    return <><DashboardApp initialData={data} />{sessionAccess.isOwner && <TeamCleanupPanel />}</>;
  }

  const chatGPTUser = await getChatGPTUser();
  if (chatGPTUser) {
    await ensureDemoData();
    const bootstrapAccess = await getAccessContext(chatGPTUser.email);
    if (bootstrapAccess?.isOwner && !await hasPasswordForTeamMember(bootstrapAccess.teamMemberId)) {
      return <OwnerSetupScreen email={bootstrapAccess.email} name={bootstrapAccess.name} />;
    }
  }

  return <SignInScreen initialEmail={initialEmail} />;
}
