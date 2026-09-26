import { affiliateSessionCookie } from "../../../db/affiliate-auth";
import { confirmOwnerEmail, sessionCookie } from "../../../db/auth";
import { confirmPendingRegistration } from "../../../db/verified-registration";

const CANONICAL_APP_URL = "https://cortouanotou.com.br";

function publicRedirect(path: string) {
  return new URL(path, CANONICAL_APP_URL).toString();
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const pending = await confirmPendingRegistration(token);
    if (pending?.kind === "team") {
      return new Response(null, { status: 303, headers: { location: publicRedirect("/?welcome=email-confirmed"), "set-cookie": sessionCookie(pending.token) } });
    }
    if (pending?.kind === "affiliate") {
      return new Response(null, { status: 303, headers: { location: publicRedirect("/afiliado?welcome=email-confirmed"), "set-cookie": affiliateSessionCookie(pending.token) } });
    }

    const sessionToken = await confirmOwnerEmail(token);
    return new Response(null, { status: 303, headers: { location: publicRedirect("/?welcome=email-confirmed"), "set-cookie": sessionCookie(sessionToken) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const reason = message.includes("expirou") || message.includes("utilizado") ? "expired" : "invalid";
    return new Response(null, { status: 303, headers: { location: publicRedirect(`/confirmacao-email?status=${reason}`) } });
  }
}
