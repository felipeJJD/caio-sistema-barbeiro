import { getSessionAccess } from "../../../../db/auth";
import { isOrganizationAccessExpired } from "../../../../db/access";
import {
  disconnectWhatsapp,
  getWhatsappAutomationStatus,
  pauseWhatsappConversation,
  resumeWhatsappConversation,
  saveWhatsappAutomationSettings,
  saveWhatsappConnection,
  saveWhatsappPlanForOrganization,
} from "../../../../db/whatsapp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode configurar o WhatsApp." }, { status: 403 });
    return Response.json({ whatsapp: await getWhatsappAutomationStatus(access) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar o WhatsApp." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    if (!access.isOwner) return Response.json({ error: "Somente o proprietário pode configurar o WhatsApp." }, { status: 403 });
    if (isOrganizationAccessExpired(access)) return Response.json({ error: "O período da barbearia terminou. Renove o plano para alterar o WhatsApp." }, { status: 402 });

    const data = await request.json() as Record<string, unknown>;
    const action = String(data.action ?? "settings");

    if (action === "settings") {
      await saveWhatsappAutomationSettings(access, {
        enabled: typeof data.enabled === "boolean" ? data.enabled : undefined,
        confirmationEnabled: typeof data.confirmationEnabled === "boolean" ? data.confirmationEnabled : undefined,
        reminderEnabled: typeof data.reminderEnabled === "boolean" ? data.reminderEnabled : undefined,
        reminderHoursBefore: data.reminderHoursBefore === undefined ? undefined : Number(data.reminderHoursBefore),
        cancellationEnabled: typeof data.cancellationEnabled === "boolean" ? data.cancellationEnabled : undefined,
        rescheduleEnabled: typeof data.rescheduleEnabled === "boolean" ? data.rescheduleEnabled : undefined,
        botEnabled: typeof data.botEnabled === "boolean" ? data.botEnabled : undefined,
        humanTakeoverMinutes: data.humanTakeoverMinutes === undefined ? undefined : Number(data.humanTakeoverMinutes),
      });
    } else if (action === "plan") {
      await saveWhatsappPlanForOrganization(access, {
        planCode: String(data.planCode ?? "off"),
        monthlyMessageLimit: Number(data.monthlyMessageLimit ?? 0),
      });
    } else if (action === "connect-manual") {
      await saveWhatsappConnection(access, {
        wabaId: String(data.wabaId ?? ""),
        phoneNumberId: String(data.phoneNumberId ?? ""),
        displayPhoneNumber: String(data.displayPhoneNumber ?? ""),
        accessToken: String(data.accessToken ?? ""),
      });
    } else if (action === "disconnect") {
      await disconnectWhatsapp(access);
    } else if (action === "pause-conversation") {
      const pausedUntil = await pauseWhatsappConversation(access, String(data.phone ?? ""), data.minutes === undefined ? undefined : Number(data.minutes));
      return Response.json({ ok: true, pausedUntil, whatsapp: await getWhatsappAutomationStatus(access) });
    } else if (action === "resume-conversation") {
      await resumeWhatsappConversation(access, String(data.phone ?? ""));
    } else {
      return Response.json({ error: "Ação do WhatsApp inválida." }, { status: 400 });
    }

    return Response.json({ ok: true, whatsapp: await getWhatsappAutomationStatus(access) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível salvar o WhatsApp." }, { status: 400 });
  }
}
