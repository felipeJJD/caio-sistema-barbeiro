"use client";

import { FormEvent, useEffect, useState } from "react";

type MercadoPagoStatus = {
  configured: boolean;
  webhookConfigured: boolean;
  updatedAt: string | null;
};

type MercadoPagoPayload = {
  ok?: boolean;
  error?: string;
  status?: MercadoPagoStatus;
};

const fieldStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #d9d2c2",
  borderRadius: 14,
  padding: "14px 15px",
  fontSize: 16,
  background: "#fff",
  color: "#1f241f",
};

export function MercadoPagoSecurityForm() {
  const [status, setStatus] = useState<MercadoPagoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    fetch("/api/platform/mercado-pago", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as MercadoPagoPayload;
        if (!response.ok) throw new Error(payload.error ?? "Não foi possível consultar a integração.");
        if (active) setStatus(payload.status ?? null);
      })
      .catch((error: unknown) => {
        if (active) setFeedback(error instanceof Error ? error.message : "Não foi possível consultar a integração.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setSuccess(false);
    setFeedback(null);

    try {
      const response = await fetch("/api/platform/mercado-pago", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken: String(data.get("accessToken") ?? ""),
          webhookSecret: String(data.get("webhookSecret") ?? ""),
        }),
      });
      const payload = await response.json() as MercadoPagoPayload;
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar as credenciais.");
      setStatus(payload.status ?? null);
      setSuccess(true);
      setFeedback("Credenciais salvas e protegidas. O Cortou Anotou já pode validar as notificações do Mercado Pago.");
      form.reset();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar as credenciais.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginBottom: 18 }}>
        <div style={{ borderRadius: 14, padding: 14, background: status?.configured ? "#edf8f0" : "#f6f3ec", border: "1px solid #ded7c7" }}>
          <small style={{ display: "block", color: "#6a7069", marginBottom: 4 }}>ACCESS TOKEN</small>
          <strong>{loading ? "Consultando..." : status?.configured ? "Configurado" : "Pendente"}</strong>
        </div>
        <div style={{ borderRadius: 14, padding: 14, background: status?.webhookConfigured ? "#edf8f0" : "#f6f3ec", border: "1px solid #ded7c7" }}>
          <small style={{ display: "block", color: "#6a7069", marginBottom: 4 }}>WEBHOOK</small>
          <strong>{loading ? "Consultando..." : status?.webhookConfigured ? "Configurado" : "Pendente"}</strong>
        </div>
      </div>

      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 7 }}>
          <span style={{ fontWeight: 800 }}>Access Token de produção</span>
          <input
            name="accessToken"
            type="password"
            minLength={40}
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            placeholder="APP_USR-••••••••••••••"
            required
            style={fieldStyle}
          />
          <small style={{ color: "#6a7069", lineHeight: 1.4 }}>Cole o Access Token da aplicação Cortou Anotou que começa por APP_USR-.</small>
        </label>

        <label style={{ display: "grid", gap: 7 }}>
          <span style={{ fontWeight: 800 }}>Assinatura secreta do Webhook</span>
          <input
            name="webhookSecret"
            type="password"
            minLength={20}
            maxLength={500}
            autoComplete="off"
            spellCheck={false}
            placeholder="Cole a assinatura secreta gerada no Mercado Pago"
            required
            style={fieldStyle}
          />
          <small style={{ color: "#6a7069", lineHeight: 1.4 }}>Use a assinatura secreta do Webhook de produção que você acabou de gerar. Não use Client Secret.</small>
        </label>

        <div style={{ background: "#f7f5ef", border: "1px solid #e2dccf", borderRadius: 14, padding: 14, color: "#5d625c", lineHeight: 1.5 }}>
          Depois de salvar, os campos ficam vazios de propósito. O Cortou Anotou guarda somente a versão criptografada das credenciais.
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{ border: 0, borderRadius: 14, padding: "15px 18px", fontSize: 16, fontWeight: 800, background: "#263026", color: "#e7bb49", cursor: saving ? "wait" : "pointer", opacity: saving ? .7 : 1 }}
        >
          {saving ? "Validando e protegendo..." : "Salvar credenciais com segurança"}
        </button>

        {feedback && (
          <p role="status" style={{ margin: 0, borderRadius: 12, padding: 12, background: success ? "#edf8f0" : "#fff1ef", color: success ? "#25683a" : "#9b2f25", lineHeight: 1.45 }}>
            {feedback}
          </p>
        )}
      </form>
    </>
  );
}
