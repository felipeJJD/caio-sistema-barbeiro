/** Use the canonical app origin, not an obsolete configuration or Next's internal URL. */
export function validNotificationOrigin(
  request: Request,
  // The notification UI runs on the canonical app domain. An older
  // PUBLIC_APP_URL can still point at the retired BarberFlow deployment;
  // it must never prevent the current app from changing notification state.
  publicAppUrl = "https://cortouanotou.com.br",
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
