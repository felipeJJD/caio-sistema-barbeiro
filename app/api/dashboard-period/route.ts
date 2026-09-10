import { getSessionAccess } from "../../../db/auth";
import { getDashboardData } from "../../../db/dashboard";

export async function GET(request: Request) {
  const access = await getSessionAccess();
  if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });

  const url = new URL(request.url);
  const data = await getDashboardData(access, {
    start: url.searchParams.get("start") ?? undefined,
    end: url.searchParams.get("end") ?? undefined,
  });
  return Response.json({ data }, { headers: { "cache-control": "private, no-store" } });
}
