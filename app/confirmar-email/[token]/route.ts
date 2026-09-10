import { confirmOwnerEmail, sessionCookie } from "../../../db/auth";

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const sessionToken = await confirmOwnerEmail(token);
    const destination = new URL("/?welcome=email-confirmed", request.url);
    return new Response(null, { status: 303, headers: { location: destination.toString(), "set-cookie": sessionCookie(sessionToken) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reason = message.includes("expirou") || message.includes("utilizado") ? "expired" : "invalid";
    return new Response(null, { status: 303, headers: { location: new URL(`/confirmacao-email?status=${reason}`, request.url).toString() } });
  }
}
