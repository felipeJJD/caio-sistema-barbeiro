"use client";

import { getCurrentSubscription, isPushSupported, serializeSubscription, subscribe, unsubscribe } from "@mmmike/web-push/client";
import { useEffect, useRef, useState } from "react";
import type { AppNotification } from "../../db/notifications";
import { AppIcon, type AppIconName } from "./app-icon";

type NotificationCenterProps = {
  notifications: AppNotification[];
  onReplace: (notifications: AppNotification[]) => void;
  onRead: () => void;
  onNavigate: (section: string) => void;
};

type NotificationPayload = {
  publicKey?: string;
  configured?: boolean;
  notifications?: AppNotification[];
  error?: string;
};

function notificationTime(value: string) {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const instant = new Date(normalized);
  if (Number.isNaN(instant.getTime())) return "Agora";
  return instant.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isAppleMobile() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function notificationIcon(kind: string): AppIconName {
  if (kind === "public-booking") return "calendar";
  if (kind === "appointment-cancelled") return "clock";
  if (kind === "subscription-payment") return "money";
  return "scissors";
}

export function NotificationCenter({ notifications, onReplace, onRead, onNavigate }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [active, setActive] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const centerRef = useRef<HTMLDivElement>(null);
  const unread = notifications.filter((item) => !item.readAt).length;

  async function api(method: "GET" | "POST" | "DELETE", body?: Record<string, unknown>) {
    const response = await fetch("/api/notifications", {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json() as NotificationPayload;
    if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar as notificações.");
    if (payload.notifications) {
      onReplace(payload.notifications);
      if (method === "GET") window.dispatchEvent(new Event("cortou-anotou:refresh-data"));
    }
    return payload;
  }

  async function saveCurrentSubscription(subscription: PushSubscription) {
    await api("POST", { action: "subscribe", subscription: serializeSubscription(subscription) });
  }

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      try {
        const payload = await api("GET");
        if (cancelled) return;
        setPublicKey(payload.publicKey ?? "");
        const canPush = isPushSupported();
        setSupported(canPush);
        if (!canPush) return;
        setPermission(Notification.permission);
        await navigator.serviceWorker.register("/sw.js");
        const current = await getCurrentSubscription();
        if (cancelled) return;
        setActive(Boolean(current));
        if (current && Notification.permission === "granted") await saveCurrentSubscription(current);
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Não foi possível preparar as notificações.");
      }
    }
    void prepare();
    return () => { cancelled = true; };
    // A preparação ocorre uma única vez por abertura do aplicativo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (event.data?.type === "CA_NOTIFICATION") void api("GET").catch(() => undefined);
    }
    navigator.serviceWorker?.addEventListener("message", receive);
    return () => navigator.serviceWorker?.removeEventListener("message", receive);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void api("GET").catch(() => undefined);
    }
    const refreshTimer = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
    // Atualiza o sino assim que o usuário retorna ao aplicativo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!centerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  async function togglePanel() {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      onRead();
      void api("POST", { action: "mark-read" }).catch(() => undefined);
    }
  }

  async function enable() {
    setBusy(true);
    setMessage("");
    try {
      if (!publicKey) throw new Error("O serviço de notificações ainda não está configurado.");
      await navigator.serviceWorker.register("/sw.js");
      const result = await subscribe(publicKey);
      if (result.status === "unsupported") throw new Error("Este aparelho ainda não oferece notificações para este app.");
      if (result.status === "denied") {
        setPermission("denied");
        throw new Error("A permissão foi bloqueada. Libere o Cortou Anotou nos ajustes de notificações do aparelho.");
      }
      await saveCurrentSubscription(result.subscription);
      setPermission("granted");
      setActive(true);
      setMessage("Notificações ativadas neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível ativar as notificações.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage("");
    try {
      const endpoint = await unsubscribe();
      if (endpoint) await api("DELETE", { endpoint });
      setActive(false);
      setMessage("Notificações desligadas neste aparelho.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível desligar as notificações.");
    } finally {
      setBusy(false);
    }
  }

  async function removeNotification(item: AppNotification) {
    if (deletingId !== null) return;
    const previous = notifications;
    setDeletingId(item.id);
    setMessage("");
    onReplace(notifications.filter((notification) => notification.id !== item.id));
    try {
      await api("POST", { action: "delete-notification", notificationId: item.id });
      setMessage("Notificação removida.");
    } catch (error) {
      onReplace(previous);
      setMessage(error instanceof Error ? error.message : "Não foi possível remover a notificação.");
    } finally {
      setDeletingId(null);
    }
  }

  function openNotification(item: AppNotification) {
    window.history.replaceState({}, "", item.target);
    const targetSection = new URL(item.target, window.location.origin).searchParams.get("section") || "Histórico";
    onNavigate(targetSection);
    setOpen(false);
  }

  const needsInstall = supported === false && isAppleMobile() && !isStandalone();

  return <div className="notification-center" ref={centerRef}>
    <button className="notification-bell" type="button" aria-label={unread ? `${unread} notificações não lidas` : "Abrir notificações"} aria-expanded={open} onClick={togglePanel}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {unread > 0 && <span>{Math.min(unread, 9)}{unread > 9 ? "+" : ""}</span>}
    </button>
    {open && <section className="notification-panel" aria-label="Central de notificações">
      <header><div><strong>Notificações</strong><small>{active ? "Ativas neste aparelho" : "Avisos do Cortou Anotou"}</small></div><i className={active ? "active" : ""} /></header>
      <div className="notification-device">
        {supported === null && <p>Preparando as notificações...</p>}
        {needsInstall && <p>No iPhone, abra pelo ícone adicionado à Tela de Início para ativar os avisos.</p>}
        {supported === false && !needsInstall && <p>Este navegador não oferece notificações para o aplicativo.</p>}
        {supported && permission === "denied" && <p>A permissão está bloqueada nos ajustes deste aparelho.</p>}
        {supported && permission !== "denied" && <><p>{active ? "Este aparelho receberá atendimentos, horários, cancelamentos e pagamentos importantes." : "Ative uma vez para receber avisos mesmo com o aplicativo fechado."}</p><button type="button" onClick={active ? disable : enable} disabled={busy}>{busy ? "Aguarde..." : active ? "Desativar notificações" : "Ativar notificações"}</button></>}
        {message && <small className="notification-message">{message}</small>}
      </div>
      <p className="notification-retention">Os avisos desaparecem automaticamente após 24 horas.</p>
      <div className="notification-list">
        {notifications.map((item) => <article key={item.id} className={`notification-item${!item.readAt ? " unread" : ""}`}>
          <button type="button" className="notification-open" onClick={() => openNotification(item)}>
            <i><AppIcon name={notificationIcon(item.kind)} /></i><span><strong>{item.title}</strong><p>{item.body}</p><small>{notificationTime(item.createdAt)}</small></span>
          </button>
          <button type="button" className="notification-delete" aria-label={`Excluir notificação: ${item.title}`} title="Excluir notificação" disabled={deletingId === item.id} onClick={() => void removeNotification(item)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></svg>
          </button>
        </article>)}
        {!notifications.length && <div className="notification-empty"><span><AppIcon name="bell" /></span><strong>Tudo tranquilo por aqui</strong><p>Os avisos importantes da sua barbearia aparecerão neste espaço.</p></div>}
      </div>
    </section>}
  </div>;
}
