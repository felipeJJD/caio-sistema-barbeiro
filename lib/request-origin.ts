/** Use the configured public origin, not Next's internal reverse-proxy URL. */
export function validNotificationOrigin(
  request: Request,
  publicAppUrl = process.env.PUBLIC_APP_URL || "https://cortouanotou.com.br",
) {
  const origin = request.headers.get("origin");
  // Non-browser clients may omit Origin; authentication is still required.
  if (!origin) return true;
  try {
    const expected = new URL(publicAppUrl.trim());
    if (!["https:", "http:"].includes(expected.protocol)) return false;
    return origin === expected.origin;
  } catch {
    return false;
  }
}
