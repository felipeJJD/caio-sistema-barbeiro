import { clearedSessionCookie, logoutCurrentSession } from "../../../../db/auth";

export async function GET(request: Request) {
  try {
    await logoutCurrentSession();
  } catch {
    // The cookie is still cleared if the session was already absent or expired.
  }
  return new Response(null, {
    status: 303,
    headers: { location: new URL("/", request.url).toString(), "set-cookie": clearedSessionCookie() },
  });
}
