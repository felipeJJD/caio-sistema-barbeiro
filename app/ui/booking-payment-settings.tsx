"use client";

import { FormEvent, useEffect, useState } from "react";
import { showAppToast } from "./app-toast";

type Settings = { pixEnabled: boolean; pixKey: string; cashEnabled: boolean; debitEnabled: boolean; creditEnabled: boolean };
const defaults: Settings = { pixEnabled: false, pixKey: "", cashEnabled: true, debitEnabled: true, creditEnabled: true };

export function BookingPaymentSettings() {
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  useEffect(() => { fetch("/api/booking-payment-settings", { cache: "no-store" }).then((response) => response.json()).then((body: { settings?: Settings }) => { if (body.settings) setSettings(body.settings); }).finally(() => setLoading(false)); }, []);

  async function persist(next: Settings, previous: Settings | null, successMessage: string) {
    setPending(true);
    setFeedback("");
    try {
      const response = await fetch("/api/booking-payment-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      const body = await response.json() as { error?: string; settings?: Settings };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar.");
      setSettings(body.settings ?? next);
      setFeedback("");
      showAppToast(successMessage);
    } catch (reason) {
      if (previous) setSettings(previous);
      setFeedback(reason instanceof Error ? reason.message : "Não foi possível salvar.");
    } finally {
      setPending(false);
    }
  }

  function toggle(key: "pixEnabled" | "cashEnabled" | "debitEnabled" | "creditEnabled", checked: boolean) {
    const previous = settings;
    const next = { ...settings, [key]: checked };
    setSettings(next);
    if (key === "pixEnabled" && checked && !next.pixKey.trim()) {
      setFeedback("Informe a chave Pix e toque em Salvar pagamentos para ativar.");
      return;
    }
    void persist(next, previous, checked ? "Forma de pagamento ativada no link público." : "Forma de pagamento removida do link público.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persist(settings, null, "Formas de pagamento salvas no link público.");
  }
  if (loading) return <section className="panel form-card booking-payment-config"><div className="panel-header"><div><h2>Pagamentos do agendamento</h2><p>Carregando configurações...</p></div></div></section>;
  return <section className="panel form-card booking-payment-config"><div className="panel-header"><div><h2>Pagamentos do agendamento</h2><p>Cada barbearia decide o que aparece no próprio link público.</p></div></div><form className="app-form" onSubmit={submit}><p className="payment-config-auto-save">Ao ligar ou desligar uma opção, o link público é atualizado automaticamente.</p><label className="agenda-toggle"><input type="checkbox" checked={settings.pixEnabled} disabled={pending} onChange={(event) => toggle("pixEnabled", event.target.checked)} /><span /><div><strong>Pix antecipado</strong><small>O cliente paga 100% antes da confirmação</small></div></label>{settings.pixEnabled && <label className="field"><span>Chave Pix da barbearia</span><input value={settings.pixKey} disabled={pending} onChange={(event) => setSettings({ ...settings, pixKey: event.target.value })} placeholder="CPF, telefone, e-mail ou chave aleatória" required /></label>}<p className="payment-config-subtitle">PAGAMENTO NA BARBEARIA</p>{([['cashEnabled','Dinheiro'],['debitEnabled','Débito'],['creditEnabled','Crédito']] as const).map(([key,label]) => <label className="agenda-toggle" key={key}><input type="checkbox" checked={settings[key]} disabled={pending} onChange={(event) => toggle(key, event.target.checked)} /><span /><div><strong>{label}</strong><small>Cliente escolhe no link e paga presencialmente</small></div></label>)}{feedback && <p className="public-share-feedback" aria-live="polite">{feedback}</p>}<button className="primary-button" disabled={pending}>{pending ? "Salvando..." : "Salvar chave e pagamentos"}</button></form></section>;
}
