"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { showAppToast } from "./app-toast";

type WhatsappStatusPayload = {
  connection: {
    status: string;
    provider: string;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    connectedAt: string | null;
    updatedAt: string | null;
  };
  settings: {
    enabled: boolean;
    confirmationEnabled: boolean;
    reminderEnabled: boolean;
    reminderHoursBefore: number;
    cancellationEnabled: boolean;
    rescheduleEnabled: boolean;
    botEnabled: boolean;
    humanTakeoverMinutes: number;
    planCode: string;
    monthlyMessageLimit: number;
    templateLanguage: string;
  };
  usage: {
    sentThisMonth: number;
    remainingThisMonth: number;
  };
};

type WhatsappApiPayload = {
  whatsapp?: WhatsappStatusPayload;
  error?: string;
};

const reminderOptions = [1, 2, 3, 6, 12, 24];

function statusLabel(status: string) {
  return status === "connected" ? "Conectado" : "Desconectado";
}

function planLabel(code: string, limit: number) {
  if (!limit || code === "off") return "Sem pacote ativo";
  const normalized = code.replaceAll("_", " ").trim();
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : `${limit.toLocaleString("pt-BR")} mensagens`;
}

function formatDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function WhatsappAutomation() {
  const [data, setData] = useState<WhatsappStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/settings", { cache: "no-store", signal });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível carregar o WhatsApp.");
      setData(payload.whatsapp);
      setFeedback(null);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setFeedback(error instanceof Error ? error.message : "Não foi possível carregar o WhatsApp.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  async function saveSettings(next: Partial<WhatsappStatusPayload["settings"]>, toast = "Automação do WhatsApp atualizada.") {
    if (!data || saving) return false;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settings", ...next }),
      });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível salvar o WhatsApp.");
      setData(payload.whatsapp);
      showAppToast(toast);
      return true;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar o WhatsApp.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!data || data.connection.status !== "connected" || saving) return;
    if (!window.confirm("Desconectar este WhatsApp do Cortou Anotou? As automações serão desligadas, mas o histórico continuará salvo.")) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível desconectar o WhatsApp.");
      setData(payload.whatsapp);
      showAppToast("WhatsApp desconectado e automações pausadas.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível desconectar o WhatsApp.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveSettings({ reminderHoursBefore: Number(form.get("reminderHoursBefore") ?? 3) }, "Horário do lembrete atualizado.");
  }

  const connected = data?.connection.status === "connected";
  const hasPackage = Boolean(data && data.settings.monthlyMessageLimit > 0 && data.settings.planCode !== "off");
  const canEnable = Boolean(connected && hasPackage);
  const usagePercent = useMemo(() => {
    if (!data?.settings.monthlyMessageLimit) return 0;
    return Math.min(100, Math.round(data.usage.sentThisMonth / data.settings.monthlyMessageLimit * 100));
  }, [data]);

  if (loading) return <section className="whatsapp-page"><div className="panel whatsapp-loading"><span className="whatsapp-brand-mark">WA</span><div><strong>Carregando WhatsApp...</strong><small>Consultando conexão e automações da sua barbearia.</small></div></div></section>;

  if (!data) return <section className="whatsapp-page"><div className="panel whatsapp-empty-state"><span>!</span><h2>Não foi possível abrir o WhatsApp</h2><p>{feedback ?? "Tente novamente em alguns instantes."}</p><button type="button" className="primary-button" onClick={() => void load()}>Tentar novamente</button></div></section>;

  return <section className="whatsapp-page">
    <div className="whatsapp-hero panel">
      <div className="whatsapp-hero-copy">
        <span className="whatsapp-kicker">C.A. ATENDE · WHATSAPP</span>
        <h2>Seu atendimento automático começa aqui.</h2>
        <p>Confirmações, lembretes, cancelamentos e remarcações ligados à agenda real do Cortou Anotou.</p>
      </div>
      <div className={connected ? "whatsapp-connection-badge connected" : "whatsapp-connection-badge"}>
        <i />
        <span>{connected ? "META CONECTADA" : "META AINDA NÃO CONECTADA"}</span>
      </div>
    </div>

    {feedback && <div className="notice error whatsapp-feedback" role="alert">{feedback}</div>}

    <div className="whatsapp-status-grid">
      <article className="panel whatsapp-status-card">
        <div className="whatsapp-card-icon">☏</div>
        <span>CONEXÃO</span>
        <strong>{statusLabel(data.connection.status)}</strong>
        <small>{connected ? data.connection.displayPhoneNumber || "Número conectado à Meta" : "Nenhuma conta WhatsApp Business vinculada"}</small>
        {connected && data.connection.connectedAt && <em>Conectado em {formatDate(data.connection.connectedAt)}</em>}
      </article>

      <article className="panel whatsapp-status-card">
        <div className="whatsapp-card-icon">✦</div>
        <span>PACOTE DE MENSAGENS</span>
        <strong>{planLabel(data.settings.planCode, data.settings.monthlyMessageLimit)}</strong>
        <small>{hasPackage ? `${data.settings.monthlyMessageLimit.toLocaleString("pt-BR")} mensagens disponíveis por mês` : "Ative um pacote para liberar os envios automáticos"}</small>
      </article>

      <article className="panel whatsapp-status-card usage">
        <div className="whatsapp-card-icon">↗</div>
        <span>USO NESTE MÊS</span>
        <strong>{data.usage.sentThisMonth.toLocaleString("pt-BR")} <small>enviadas</small></strong>
        <div className="whatsapp-usage-bar" aria-label={`${usagePercent}% do pacote utilizado`}><i style={{ width: `${usagePercent}%` }} /></div>
        <small>{hasPackage ? `${data.usage.remainingThisMonth.toLocaleString("pt-BR")} restantes` : "Nenhuma mensagem será enviada sem pacote"}</small>
      </article>
    </div>

    {!connected && <section className="panel whatsapp-connect-card">
      <div className="whatsapp-connect-icon">◎</div>
      <div>
        <span>PRÓXIMO PASSO</span>
        <h3>Conectar o WhatsApp Business da barbearia</h3>
        <p>A estrutura já está pronta. A conexão oficial pela Meta será feita por aqui, sem o proprietário precisar lidar com token, WABA ID ou configurações técnicas.</p>
      </div>
      <button type="button" disabled>Conexão oficial em preparação</button>
    </section>}

    <section className="panel whatsapp-automation-panel">
      <div className="whatsapp-panel-heading">
        <div><span>AUTOMAÇÕES</span><h3>O que o Cortou Anotou pode enviar sozinho</h3><p>Você escolhe cada automação. Nada é enviado sem conexão e pacote ativos.</p></div>
        <label className={canEnable ? "whatsapp-master-switch" : "whatsapp-master-switch disabled"}>
          <span><strong>{data.settings.enabled ? "Automações ligadas" : "Automações desligadas"}</strong><small>{canEnable ? "Controle geral dos envios" : !connected ? "Conecte o WhatsApp primeiro" : "Ative um pacote de mensagens primeiro"}</small></span>
          <input type="checkbox" checked={data.settings.enabled} disabled={!canEnable || saving} onChange={(event) => void saveSettings({ enabled: event.target.checked }, event.target.checked ? "Automações do WhatsApp ligadas." : "Automações do WhatsApp pausadas.")} />
          <i />
        </label>
      </div>

      <div className="whatsapp-rule-list">
        <label className="whatsapp-rule">
          <span className="whatsapp-rule-symbol">✓</span>
          <span><strong>Confirmação do agendamento</strong><small>Envia quando um horário entra como confirmado na agenda.</small></span>
          <input type="checkbox" checked={data.settings.confirmationEnabled} disabled={saving} onChange={(event) => void saveSettings({ confirmationEnabled: event.target.checked })} />
          <i />
        </label>

        <div className="whatsapp-rule reminder">
          <span className="whatsapp-rule-symbol">◷</span>
          <span><strong>Lembrete antes do horário</strong><small>Ajuda a reduzir esquecimentos e faltas.</small></span>
          <label className="whatsapp-inline-switch"><input type="checkbox" checked={data.settings.reminderEnabled} disabled={saving} onChange={(event) => void saveSettings({ reminderEnabled: event.target.checked })} /><i /></label>
          <form onSubmit={submitReminder}>
            <label><span>Enviar</span><select name="reminderHoursBefore" defaultValue={data.settings.reminderHoursBefore} disabled={saving || !data.settings.reminderEnabled}>{reminderOptions.map((hours) => <option value={hours} key={hours}>{hours === 1 ? "1 hora antes" : `${hours} horas antes`}</option>)}</select></label>
            <button disabled={saving || !data.settings.reminderEnabled}>Salvar</button>
          </form>
        </div>

        <label className="whatsapp-rule">
          <span className="whatsapp-rule-symbol">×</span>
          <span><strong>Aviso de cancelamento</strong><small>O cliente recebe a atualização quando o horário é cancelado.</small></span>
          <input type="checkbox" checked={data.settings.cancellationEnabled} disabled={saving} onChange={(event) => void saveSettings({ cancellationEnabled: event.target.checked })} />
          <i />
        </label>

        <label className="whatsapp-rule">
          <span className="whatsapp-rule-symbol">↻</span>
          <span><strong>Aviso de remarcação</strong><small>Atualiza o cliente e reposiciona o lembrete para o novo horário.</small></span>
          <input type="checkbox" checked={data.settings.rescheduleEnabled} disabled={saving} onChange={(event) => void saveSettings({ rescheduleEnabled: event.target.checked })} />
          <i />
        </label>
      </div>
    </section>

    <section className="panel whatsapp-assistant-preview">
      <div className="whatsapp-assistant-badge">C.A.</div>
      <div>
        <span>PRÓXIMA ETAPA</span>
        <h3>C.A. Atende</h3>
        <p>Depois da conexão com a Meta, vamos liberar o assistente para responder dúvidas, consultar horários, mandar o link da agenda e ajudar o cliente a cancelar ou remarcar.</p>
      </div>
      <div className="whatsapp-coming-soon">EM PREPARAÇÃO</div>
    </section>

    {connected && <section className="panel whatsapp-danger-zone">
      <div><strong>Desconectar WhatsApp</strong><small>As automações param imediatamente. Seus agendamentos e histórico continuam intactos.</small></div>
      <button type="button" onClick={() => void disconnect()} disabled={saving}>Desconectar</button>
    </section>}
  </section>;
}
