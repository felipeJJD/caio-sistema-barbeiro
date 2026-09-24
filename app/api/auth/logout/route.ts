import { clearedSessionCookie, logoutCurrentSession } from "../../../../db/auth";

export async function GET() {
  try {
    await logoutCurrentSession();
  } catch {
    // The cookie is still cleared if the session was already absent or expired.
  }
  return new Response(null, {
    status: 303,
    headers: { location: "/", "set-cookie": clearedSessionCookie() },
  });
}
