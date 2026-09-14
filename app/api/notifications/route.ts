import { getSessionAccess } from "../../../db/auth";
import { isOrganizationAccessExpired } from "../../../db/access";
import { deleteNotification, getVapidPublicKey, listNotifications, markNotificationsRead, removePushSubscription, savePushSubscription } from "../../../db/notifications";

function validOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function notificationAccess() {
  const access = await getSessionAccess();
  if (!access) return null;
  if (isOrganizationAccessExpired(access)) throw new Error("Renove o plano para configurar os avisos.");
  return access;
}

export async function GET() {
  try {
    const access = await notificationAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    const [publicKey, notifications] = await Promise.all([getVapidPublicKey(), listNotifications(access)]);
    return Response.json({ publicKey, configured: Boolean(publicKey), notifications }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível carregar as notificações." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    if (!validOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
    const access = await notificationAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    const data = await request.json() as {
      action?: string;
      notificationId?: number;
      subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    };

    if (data.action === "mark-read") {
      await markNotificationsRead(access);
    } else if (data.action === "delete-notification") {
      await deleteNotification(access, Number(data.notificationId));
    } else if (data.action === "subscribe") {
      const endpoint = String(data.subscription?.endpoint ?? "");
      const p256dh = String(data.subscription?.keys?.p256dh ?? "");
      const auth = String(data.subscription?.keys?.auth ?? "");
      await savePushSubscription(access, { endpoint, keys: { p256dh, auth } }, request.headers.get("user-agent") ?? "");
    } else {
      return Response.json({ error: "Ação inválida." }, { status: 400 });
    }

    return Response.json({ ok: true, notifications: await listNotifications(access) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível configurar as notificações." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!validOrigin(request)) return Response.json({ error: "Origem inválida." }, { status: 403 });
    const access = await notificationAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    const data = await request.json() as { endpoint?: string };
    await removePushSubscription(access, String(data.endpoint ?? ""));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível desligar as notificações." }, { status: 400 });
  }
}
