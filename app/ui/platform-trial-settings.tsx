"use client";

import { FormEvent, useEffect, useState } from "react";
import { showAppToast } from "./app-toast";

type TrialPayload = { trialDays?: number; error?: string };

export function PlatformTrialSettings() {
  const [trialDays, setTrialDays] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/trial-days", { cache: "no-store" })
      .then(async (response) => ({ response, payload: await response.json() as TrialPayload }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok || !payload.trialDays) setFeedback(payload.error ?? "Não foi possível consultar o teste grátis.");
        else setTrialDays(payload.trialDays);
      })
      .catch(() => { if (active) setFeedback("Não foi possível consultar o teste grátis."); });
    return () => { active = false; };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nextDays = Math.round(Number(data.get("trialDays")));
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/platform/trial-days", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trialDays: nextDays }),
      });
      const payload = await response.json() as TrialPayload;
      if (!response.ok || !payload.trialDays) {
        setFeedback(payload.error ?? "Não foi possível salvar os dias de teste.");
        return;
      }
      setTrialDays(payload.trialDays);
      showAppToast(`Teste grátis atualizado para ${payload.trialDays} ${payload.trialDays === 1 ? "dia" : "dias"}. Novos cadastros já usarão este período.`);
    } catch {
      setFeedback("Não foi possível salvar agora. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <section className="panel platform-central-pricing platform-trial-settings">
    <div>
      <span>TESTE GRATUITO</span>
      <h2>Você decide quantos dias liberar</h2>
      <p>Este número vira a duração oficial dos novos testes e aparece automaticamente na página pública de cadastro.</p>
      <div className="platform-plan-preview">
        <article><span>PERÍODO ATUAL</span><strong>{trialDays ?? "—"}</strong><small>{trialDays === 1 ? "dia grátis" : "dias grátis"}</small></article>
      </div>
    </div>
    <form onSubmit={save}>
      <label><span>DIAS DE TESTE GRÁTIS</span><div><input name="trialDays" type="number" inputMode="numeric" min="1" max="3650" step="1" defaultValue={trialDays ?? 14} key={`trial-${trialDays ?? 14}`} required /><b>dias</b></div></label>
      <button type="submit" disabled={pending || trialDays === null}>{pending ? "Salvando..." : "Salvar dias de teste"}</button>
      <small>Vale para novos cadastros. Testes que já começaram mantêm a data final que receberam.</small>
      {feedback && <p className="error" role="status">{feedback}</p>}
    </form>
  </section>;
}
