"use client";

import { useEffect, useRef, useState } from "react";

const TOAST_EVENT = "cortou-anotou:toast";

type ToastDetail = {
  message: string;
};

type ToastState = ToastDetail & {
  id: number;
};

function isHaircutSaveConfirmation(message: string) {
  return message.startsWith("Atendimento salvo")
    || message.startsWith("Atendimento e produtos salvos")
    || message.startsWith("Uso salvo");
}

export function showAppToast(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message } }));
}

export function AppToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<ToastDetail>).detail;
      if (!detail?.message) return;
      if (timer.current) clearTimeout(timer.current);
      setToast({ message: detail.message, id: Date.now() });

      // After a haircut/service is really saved, move the screen upward so the
      // barber gets a clear visual confirmation in addition to the toast/chime.
      if (isHaircutSaveConfirmation(detail.message)) {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        });
      }

      timer.current = setTimeout(() => setToast(null), 3000);
    };
    window.addEventListener(TOAST_EVENT, show);
    return () => {
      window.removeEventListener(TOAST_EVENT, show);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;
  return <div key={toast.id} className="app-action-toast" role="status" aria-live="polite"><span aria-hidden="true">✓</span>{toast.message}</div>;
}
