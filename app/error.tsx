"use client";

import { useEffect } from "react";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_URL, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from "../lib/support";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Cortou Anotou: falha recuperável", error);
  }, [error]);

  return <main className="app-recovery-shell">
    <section>
      <span>CA</span>
      <small>RECUPERAÇÃO DO APLICATIVO</small>
      <h1>Essa tela encontrou um problema.</h1>
      <p>Seus atendimentos já salvos continuam protegidos. Tente abrir a tela novamente ou recarregue o aplicativo.</p>
      <button type="button" onClick={reset}>Tentar novamente</button>
      <button type="button" className="secondary" onClick={() => window.location.reload()}>Reabrir o aplicativo</button>
      <div className="security-support"><span>Se continuar, fale com o suporte:</span><a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">WhatsApp {SUPPORT_PHONE_DISPLAY}</a><a href={SUPPORT_EMAIL_URL}>{SUPPORT_EMAIL}</a></div>
    </section>
  </main>;
}
