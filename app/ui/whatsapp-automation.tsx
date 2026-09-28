"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { showAppToast } from "./app-toast";

type WhatsappStatusPayload = {
  connection: {
    status: string;
    provider: string;
    wabaId: string;
    phoneNumberId: string;
    displayPhoneNumber: string;
    verifiedName: string;
    onboardingMode: string;
    tokenExpiresAt: string | null;
    webhookSubscribedAt: string | null;
    registeredAt: string | null;
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
    economyMode: boolean;
    bookingLinkFirst: boolean;
    spamFilterEnabled: boolean;
    aiFallbackEnabled: boolean;
    greetingText: string;
    handoffText: string;
    humanTakeoverMinutes: number;
    planCode: string;
    monthlyMessageLimit: number;
    templateLanguage: string;
  };
  usage: {
    sentThisMonth: number;
    remainingThisMonth: number;
  };
  humanHandoffs: Array<{
    phone: string;
    lastInboundPreview: string;
    humanRequestedAt: string | null;
    lastInboundAt: string | null;
  }>;
};

type EvolutionPayload = {
  evolution?: { ready: boolean; missing: string[] };
  state?: string;
  pairingCode?: string;
  whatsapp?: WhatsappStatusPayload;
  error?: string;
};

type WhatsappApiPayload = {
  whatsapp?: WhatsappStatusPayload;
  error?: string;
};

const reminderOptions = [1, 2, 3, 6, 12, 24];

function statusLabel(status: string) {
  if (status === "connected" || status === "open") return "Conectado";
  if (status === "connecting") return "Conectando";
  return "Desconectado";
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

function phoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

function formatPhone(value: string) {
  const raw = phoneDigits(value);
  const local = raw.startsWith("55") ? raw.slice(2) : raw;
  const ddd = local.slice(0, 2);
  const first = local.slice(2, 7);
  const last = local.slice(7, 11);
  if (!ddd) return "";
  if (local.length <= 2) return `(${ddd}`;
  if (local.length <= 7) return `(${ddd}) ${first}`;
  return `(${ddd}) ${first}-${last}`;
}

export function WhatsappAutomation() {
  const [data, setData] = useState<WhatsappStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [evolutionReady, setEvolutionReady] = useState(false);
  const [phone, setPhone] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [connectionState, setConnectionState] = useState("disconnected");
  const [feedback, setFeedback] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load(options: { background?: boolean } = {}) {
    const background = Boolean(options.background);
    if (!background) setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/evolution", { cache: "no-store" });
      const payload = await response.json() as EvolutionPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível carregar o WhatsApp.");
      setData(payload.whatsapp);
      setEvolutionReady(Boolean(payload.evolution?.ready));
      const state = String(payload.state ?? payload.whatsapp.connection.status ?? "disconnected");
      setConnectionState(state);
      const providerIsEvolution = payload.whatsapp.connection.provider === "evolution";
      const connected = providerIsEvolution && (state === "open" || state === "connected" || payload.whatsapp.connection.status === "connected");
      if (connected) {
        setPairingCode("");
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (!phone && providerIsEvolution && payload.whatsapp.connection.displayPhoneNumber) {
        setPhone(formatPhone(payload.whatsapp.connection.displayPhoneNumber));
      }
      setFeedback(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível carregar o WhatsApp.");
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => {
      window.clearTimeout(initial);
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // A carga inicial deve acontecer apenas uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectEvolution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (connecting) return;
    setConnecting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/evolution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const payload = await response.json() as EvolutionPayload;
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível gerar o código de conexão.");
      const code = String(payload.pairingCode ?? "").trim();
      setPairingCode(code);
      setConnectionState(String(payload.state ?? "connecting"));
      if (payload.whatsapp) setData(payload.whatsapp);
      if (code) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => void load({ background: true }), 3000);
        showAppToast("Código gerado. Termine a conexão no WhatsApp.");
      } else {
        await load();
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível conectar o WhatsApp.");
    } finally {
      setConnecting(false);
    }
  }

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
    if (!data || data.connection.provider !== "evolution" || data.connection.status !== "connected" || saving) return;
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
      setPairingCode("");
      setConnectionState("disconnected");
      setPhone("");
      showAppToast("WhatsApp desconectado e automações pausadas.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível desconectar o WhatsApp.");
    } finally {
      setSaving(false);
    }
  }

  async function resumeHandoff(phoneValue: string) {
    if (!data || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resume-conversation", phone: phoneValue }),
      });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível encerrar o atendimento humano.");
      setData(payload.whatsapp);
      showAppToast("Atendimento humano encerrado. O C.A. Atende pode responder novamente.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível encerrar o atendimento humano.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await saveSettings({ reminderHoursBefore: Number(form.get("reminderHoursBefore") ?? 3) }, "Horário do lembrete atualizado.");
  }

  const connected = Boolean(data && data.connection.provider === "evolution" && data.connection.status === "connected");
  const hasPackage = Boolean(data && data.settings.monthlyMessageLimit > 0 && data.settings.planCode !== "off");
  const canEnable = Boolean(connected && hasPackage);
  const usagePercent = useMemo(() => {
    if (!data?.settings.monthlyMessageLimit) return 0;
    return Math.min(100, Math.round(data.usage.sentThisMonth / data.settings.monthlyMessageLimit * 100));
  }, [data]);
  const codeGroups = pairingCode.replace(/\s/g, "").match(/.{1,4}/g)?.join(" ") ?? pairingCode;

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
        <span>{connected ? "WHATSAPP CONECTADO" : "WHATSAPP AINDA NÃO CONECTADO"}</span>
      </div>
    </div>

    {feedback && <div className="notice error whatsapp-feedback" role="alert">{feedback}</div>}

    <div className="whatsapp-status-grid">
      <article className="panel whatsapp-status-card">
        <div className="whatsapp-card-icon">☏</div>
        <span>CONEXÃO</span>
        <strong>{connected ? "Conectado" : statusLabel(connectionState)}</strong>
        <small>{connected ? data.connection.displayPhoneNumber || "WhatsApp conectado" : "Conecte o número da barbearia abaixo"}</small>
        {connected && data.connection.connectedAt && <em>Evolution · conectado em {formatDate(data.connection.connectedAt)}</em>}
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

    {!connected && <section className="panel whatsapp-connect-card whatsapp-connect-live">
      <div className="whatsapp-connect-icon">◎</div>
      <div className="whatsapp-connect-copy">
        <span>CONEXÃO EVOLUTION</span>
        <h3>Conectar o WhatsApp da barbearia</h3>
        <p>Informe o número usado no WhatsApp ou WhatsApp Business. O Cortou Anotou gera um código para vincular o aparelho sem sair desta área.</p>
      </div>
      <div className="whatsapp-connect-actions">
        <form onSubmit={connectEvolution} className="app-form">
          <label className="field"><span>NÚMERO DO WHATSAPP</span><input inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="(41) 99999-9999" /></label>
          <button type="submit" className="whatsapp-connect-primary" disabled={!evolutionReady || connecting || phoneDigits(phone).length < 10}>{connecting ? "Gerando código..." : "Conectar meu WhatsApp"}</button>
          {!evolutionReady && <small>A conexão está sendo preparada no servidor. Tente novamente em alguns instantes.</small>}
        </form>
        {pairingCode && <div className="whatsapp-meta-pending">
          <strong>Código para vincular: {codeGroups}</strong>
          <small>No WhatsApp, abra Configurações → Aparelhos conectados → Conectar um aparelho → Conectar usando número de telefone e digite este código.</small>
        </div>}
      </div>
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

    <section className="panel whatsapp-assistant-preview whatsapp-assistant-ready">
      <div className="whatsapp-assistant-badge">C.A.</div>
      <div className="whatsapp-assistant-copy">
        <span>C.A. ATENDE</span>
        <h3>Atendimento inteligente por IA</h3>
        <p>O link da agenda continua primeiro. Se o cliente preferir conversar, a IA entende o pedido e usa serviços, profissionais e horários reais do Cortou Anotou. Se não conseguir resolver com segurança, chama uma pessoa da barbearia.</p>
        <div className="whatsapp-assistant-tags"><small>LINK PRIMEIRO</small><small>FILTRO DE OFERTAS</small><small>IA PRINCIPAL</small><small>TRANSFERÊNCIA HUMANA</small></div>
      </div>
      <label className={canEnable && data.settings.enabled ? "whatsapp-bot-switch" : "whatsapp-bot-switch disabled"}>
        <span><strong>{data.settings.botEnabled ? "C.A. Atende ligado" : "C.A. Atende desligado"}</strong><small>{!connected ? "Conecte o WhatsApp primeiro" : !hasPackage ? "Ative um pacote primeiro" : !data.settings.enabled ? "Ligue as automações primeiro" : "IA conversa; o sistema valida e executa"}</small></span>
        <input type="checkbox" checked={data.settings.botEnabled} disabled={!canEnable || !data.settings.enabled || saving} onChange={(event) => void saveSettings({ botEnabled: event.target.checked }, event.target.checked ? "C.A. Atende com IA ligado." : "C.A. Atende desligado.")} />
        <i />
      </label>
    </section>

    {data.humanHandoffs.length > 0 && <section className="panel whatsapp-human-queue">
      <div className="whatsapp-human-queue-heading"><span>ATENDIMENTO HUMANO</span><h3>Clientes esperando uma pessoa</h3><p>O bot fica em silêncio nesses contatos até você encerrar o atendimento aqui.</p></div>
      <div className="whatsapp-human-list">
        {data.humanHandoffs.map((item) => {
          const ending = item.phone.replace(/\D/g, "").slice(-4);
          return <div className="whatsapp-human-item" key={item.phone}>
            <div><strong>WhatsApp final {ending || "----"}</strong><small>{item.lastInboundPreview || "Cliente pediu atendimento humano."}</small>{item.humanRequestedAt && <em>{formatDate(item.humanRequestedAt)}</em>}</div>
            <button type="button" onClick={() => void resumeHandoff(item.phone)} disabled={saving}>Encerrar atendimento</button>
          </div>;
        })}
      </div>
    </section>}

    {connected && <section className="panel whatsapp-danger-zone">
      <div><strong>Desconectar WhatsApp</strong><small>As automações param imediatamente. Seus agendamentos e histórico continuam intactos.</small></div>
      <button type="button" onClick={() => void disconnect()} disabled={saving}>Desconectar</button>
    </section>}
  </section>;
}
