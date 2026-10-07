"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { showAppToast } from "./app-toast";

type WhatsappStatusPayload = {
  bookingUrl: string;
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
  entitlement: {
    hasAccess: boolean;
    unlimited: boolean;
    source: "platform_admin" | "subscription" | "trial" | "none";
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
    templateLanguage: string;
  };
  usage: {
    sentThisMonth: number;
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
const defaultGreetingTemplate = "Olá! Seja bem-vindo à {barbearia}.\nSe quiser agendar seu horário, acesse {link}.\nSe preferir, pode falar comigo por aqui que eu te ajudo.";

function statusLabel(status: string) {
  if (status === "connected" || status === "open") return "Conectado";
  if (status === "connecting") return "Conectando";
  return "Desconectado";
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
  const [greetingDraft, setGreetingDraft] = useState(defaultGreetingTemplate);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load(options: { background?: boolean } = {}) {
    const background = Boolean(options.background);
    if (!background) setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/evolution", { cache: "no-store" });
      const payload = await response.json() as EvolutionPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível carregar o WhatsApp.");
      setData(payload.whatsapp);
      setGreetingDraft(payload.whatsapp.settings.greetingText.trim() || defaultGreetingTemplate);
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
      if (next.greetingText !== undefined) setGreetingDraft(payload.whatsapp.settings.greetingText.trim() || defaultGreetingTemplate);
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

  const connected = Boolean(data && data.connection.provider === "evolution" && data.connection.status === "connected");
  const hasMessageAccess = Boolean(data?.entitlement.hasAccess);
  const canEnable = Boolean(connected && hasMessageAccess);
  const codeGroups = pairingCode.replace(/\s/g, "").match(/.{1,4}/g)?.join(" ") ?? pairingCode;

  if (loading) return <section className="whatsapp-page"><div className="panel whatsapp-loading"><span className="whatsapp-brand-mark">WA</span><div><strong>Carregando WhatsApp...</strong><small>Consultando conexão e automações da sua barbearia.</small></div></div></section>;

  if (!data) return <section className="whatsapp-page"><div className="panel whatsapp-empty-state"><span>!</span><h2>Não foi possível abrir o WhatsApp</h2><p>{feedback ?? "Tente novamente em alguns instantes."}</p><button type="button" className="primary-button" onClick={() => void load()}>Tentar novamente</button></div></section>;

  return <section className="whatsapp-page wa2-page">
    <style>{`
      .wa2-page{display:grid;gap:10px;max-width:760px;margin:0 auto;padding-bottom:14px}
      .wa2-card{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 2px 7px #25270c06;overflow:hidden}
      .wa2-status{padding:14px 15px 12px}
      .wa2-status-top{display:flex;align-items:center;gap:10px}
      .wa2-dot{width:10px;height:10px;border-radius:50%;background:#439661;box-shadow:0 0 0 4px #e7f4eb;flex:0 0 auto}
      .wa2-status-copy{min-width:0;flex:1}
      .wa2-status-copy strong,.wa2-status-copy small{display:block}
      .wa2-status-copy strong{font-size:14px;line-height:1.15}
      .wa2-status-copy small{margin-top:3px;color:#747a72;font-size:12px}
      .wa2-usage{flex:0 0 auto;padding:6px 8px;border-radius:999px;background:#f4f2ea;color:#6d6759;font-size:10px;font-weight:800;white-space:nowrap}
      .wa2-link{display:flex;align-items:center;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid #efeee8}
      .wa2-link-copy{min-width:0;flex:1}
      .wa2-link-copy strong,.wa2-link-copy small{display:block}
      .wa2-link-copy strong{font-size:12px}
      .wa2-link-copy small{margin-top:3px;color:#858a82;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .wa2-link-actions{display:flex;gap:6px;flex:0 0 auto}
      .wa2-link-actions a,.wa2-link-actions button{min-height:34px;border:1px solid #deddd5;border-radius:9px;background:#fff;color:#2f352f;padding:0 10px;font-size:11px;font-weight:800;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
      .wa2-link-actions button{background:#202720;color:#fff;border-color:#202720}
      .wa2-settings-head{display:grid;grid-template-columns:minmax(0,1fr) 42px;align-items:center;gap:12px;padding:13px 15px;border-bottom:1px solid #efeee8}
      .wa2-settings-title{min-width:0}
      .wa2-settings-title strong,.wa2-settings-title small{display:block}
      .wa2-settings-title strong{font-size:13px}
      .wa2-settings-title small{margin-top:3px;color:#858a82;font-size:10px}
      .wa2-list{padding:0 15px}
      .wa2-row{display:grid;grid-template-columns:minmax(0,1fr) 42px;align-items:center;column-gap:12px;min-height:58px;border-top:1px solid #efeee8}
      .wa2-row:first-child{border-top:0}
      .wa2-row-main{min-width:0;display:flex;align-items:center;gap:10px;padding:10px 0}
      .wa2-icon{width:30px;height:30px;flex:0 0 30px;border-radius:9px;background:#f6edd9;color:#9a7026;display:grid;place-items:center;font-size:12px;font-weight:900}
      .wa2-row-copy{min-width:0}
      .wa2-row-copy strong,.wa2-row-copy small{display:block}
      .wa2-row-copy strong{font-size:12px;line-height:1.2}
      .wa2-row-copy small{margin-top:3px;color:#8a8f87;font-size:10px;line-height:1.25}
      .wa2-toggle{position:relative!important;width:42px!important;height:25px!important;display:inline-flex!important;align-items:center!important;justify-content:flex-start!important;flex:0 0 42px!important;margin:0!important;padding:0!important;border:0!important;border-radius:999px!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}
      .wa2-toggle input{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;margin:0!important}
      .wa2-toggle>span{display:block!important;position:relative!important;width:42px!important;height:25px!important;min-width:42px!important;min-height:25px!important;margin:0!important;padding:0!important;border:0!important;border-radius:999px!important;background:#e5e7e2!important;box-shadow:inset 0 0 0 1px #d9dcd5!important;transition:.18s!important}
      .wa2-toggle>span:after{content:""!important;position:absolute!important;width:19px!important;height:19px!important;left:3px!important;top:3px!important;border-radius:50%!important;background:#fff!important;box-shadow:0 1px 3px #0002!important;transition:.18s!important}
      .wa2-toggle input:checked+span{background:#439661!important;box-shadow:inset 0 0 0 1px #439661!important}
      .wa2-toggle input:checked+span:after{transform:translateX(17px)!important}
      .wa2-toggle input:disabled+span{opacity:.45!important}
      .wa2-reminder{padding-bottom:0}
      .wa2-reminder-setting{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-2px 0 10px 40px;padding:8px 10px;border-radius:9px;background:#f8f7f2}
      .wa2-reminder-setting>span{color:#747a72;font-size:10px;font-weight:800}
      .wa2-reminder select{min-height:36px;max-width:136px;border:1px solid #deddd5;border-radius:9px;background:#fff;padding:0 28px 0 9px;color:#2a302b;font-size:16px;font-weight:700}
      .wa2-ai{background:#fff}
      .wa2-ai .wa2-icon{background:#f6edd9;color:#9a7026;font-size:9px;letter-spacing:.04em}
      .wa2-greeting{box-shadow:none}
      .wa2-greeting>summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px}
      .wa2-greeting>summary::-webkit-details-marker{display:none}
      .wa2-greeting-title{min-width:0;display:flex;align-items:center;gap:10px}
      .wa2-greeting-title>span{width:30px;height:30px;flex:0 0 30px;border-radius:9px;background:#f6edd9;color:#9a7026;display:grid;place-items:center;font-size:12px;font-weight:900}
      .wa2-greeting-title strong,.wa2-greeting-title small{display:block}.wa2-greeting-title strong{font-size:12px}.wa2-greeting-title small{margin-top:3px;color:#858a82;font-size:10px}
      .wa2-greeting-body{display:grid;gap:9px;padding:12px 15px 15px;border-top:1px solid #efeee8}
      .wa2-greeting-body label{font-size:10px;font-weight:900;color:#6d6759}
      .wa2-greeting-body textarea{width:100%;min-height:132px;resize:vertical;border:1px solid #deddd5;border-radius:10px;background:#fff;padding:11px 12px;font:inherit;font-size:16px;line-height:1.4;color:#252b26}
      .wa2-greeting-help{margin:0;color:#858a82;font-size:10px;line-height:1.4}.wa2-greeting-help code{font-size:10px;font-weight:900;color:#695630;background:#f6f3e9;border-radius:5px;padding:2px 4px}
      .wa2-greeting-actions{display:flex;justify-content:flex-end;gap:8px}.wa2-greeting-actions button{min-height:38px;border-radius:9px;padding:0 12px;font-size:11px;font-weight:900}.wa2-greeting-reset{border:1px solid #deddd5;background:#fff;color:#303530}.wa2-greeting-save{border:0;background:#202720;color:#fff}
      .wa2-human{padding:14px 15px}
      .wa2-human h3{margin:0;font-size:13px}
      .wa2-human>p{margin:4px 0 10px;color:#858a82;font-size:10px;line-height:1.35}
      .wa2-human-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #efeee8;text-align:left}
      .wa2-human-item>div{min-width:0;width:100%}
      .wa2-human-item strong,.wa2-human-item small,.wa2-human-item em{display:block}
      .wa2-human-item strong{font-size:11px}.wa2-human-item small,.wa2-human-item em{margin-top:3px;color:#858a82;font-size:9px;font-style:normal;white-space:normal;overflow-wrap:anywhere;line-height:1.5}
      .wa2-human-item .wa2-human-reason{color:#6d6759;font-weight:700}
      .wa2-human-item button{min-height:44px;border:0;border-radius:8px;background:#202720;color:#fff;padding:8px 9px;font-size:10px;font-weight:800}
      @media(max-width:820px){.wa2-human-item{grid-template-columns:minmax(0,1fr)}.wa2-human-item button{width:100%}}
      .wa2-advanced{border-radius:12px!important;box-shadow:none!important}
      .wa2-advanced summary{cursor:pointer;list-style:none;padding:13px 15px;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:space-between;gap:12px}
      .wa2-advanced summary::-webkit-details-marker{display:none}
      .wa2-connect{padding:16px}
      .wa2-connect-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}
      .wa2-connect-head>span{width:34px;height:34px;border-radius:10px;background:#f6edd9;color:#9a7026;display:grid;place-items:center;font-weight:900}
      .wa2-connect-head strong,.wa2-connect-head small{display:block}.wa2-connect-head strong{font-size:13px}.wa2-connect-head small{margin-top:3px;color:#858a82;font-size:10px}
      .wa2-connect .app-form{padding:0;display:grid;gap:9px}.wa2-connect .field{gap:5px}.wa2-connect .field>span{font-size:8px;font-weight:900;color:#83704b;letter-spacing:.08em}
      .wa2-connect input{width:100%;min-height:44px;border:1px solid #deddd5;border-radius:10px;padding:0 12px;font-size:16px;background:#fff}
      .wa2-connect button{min-height:42px;border:0;border-radius:10px;background:#202720;color:#fff;font-size:12px;font-weight:900}
      .wa2-pairing{margin-top:12px;padding:12px;border-radius:10px;background:#f6f3e9;text-align:center}.wa2-pairing strong,.wa2-pairing code,.wa2-pairing p{display:block}.wa2-pairing strong{font-size:11px}.wa2-pairing code{margin:9px 0;font-size:22px;font-weight:900;letter-spacing:.08em}.wa2-pairing p{margin:0;color:#777c74;font-size:10px;line-height:1.4}
      @media(max-width:680px){
        .wa2-page{gap:8px;margin:0 -1px;padding-bottom:8px}
        .wa2-card{border-radius:12px}
        .wa2-status{padding:12px}
        .wa2-settings-head{padding:11px 12px}
        .wa2-list{padding:0 12px}
        .wa2-row{min-height:54px;column-gap:10px}
        .wa2-row-main{gap:10px;padding:9px 0}
        .wa2-icon{width:28px;height:28px;flex-basis:28px}
        .wa2-link{gap:7px}.wa2-link-actions a{display:none}.wa2-link-actions button{min-height:32px;padding:0 9px}
        .wa2-usage{font-size:9px;padding:5px 7px}
        .wa2-reminder-setting{margin-left:38px;padding:7px 9px}
        .wa2-reminder select{max-width:126px}
        .wa2-greeting>summary{padding:11px 12px}.wa2-greeting-body{padding:11px 12px 12px}.wa2-greeting-actions{display:grid;grid-template-columns:1fr 1fr}.wa2-greeting-actions button{width:100%}
        .wa2-advanced summary{padding:12px;font-size:11px}
      }
    `}</style>

    {feedback && <div className="notice error whatsapp-feedback" role="alert">{feedback}</div>}

    {connected ? <>
      <section className="wa2-card wa2-status">
        <div className="wa2-status-top">
          <span className="wa2-dot" aria-hidden="true" />
          <div className="wa2-status-copy">
            <strong>WhatsApp conectado</strong>
            <small>{formatPhone(data.connection.displayPhoneNumber)}</small>
          </div>
          <span className="wa2-usage">{data.usage.sentThisMonth.toLocaleString("pt-BR")} envios este mês</span>
        </div>

        {data.bookingUrl && <div className="wa2-link">
          <div className="wa2-link-copy">
            <strong>Link para agendamento</strong>
            <small>{data.bookingUrl}</small>
          </div>
          <div className="wa2-link-actions">
            <a href={data.bookingUrl} target="_blank" rel="noreferrer">Abrir</a>
            <button type="button" onClick={() => void navigator.clipboard.writeText(data.bookingUrl).then(() => showAppToast("Link copiado.")).catch(() => setFeedback("Não foi possível copiar o link."))}>Copiar link</button>
          </div>
        </div>}
      </section>

      <section className="wa2-card">
        <div className="wa2-settings-head">
          <div className="wa2-settings-title">
            <strong>Automações</strong>
            <small>{canEnable ? (data.settings.enabled ? "Ligadas" : "Pausadas") : "Indisponíveis no momento"}</small>
          </div>
          <label className="wa2-toggle" aria-label="Ligar ou pausar todas as automações">
            <input type="checkbox" checked={data.settings.enabled} disabled={!canEnable || saving} onChange={(event) => void saveSettings({ enabled: event.target.checked }, event.target.checked ? "Automações do WhatsApp ligadas." : "Automações do WhatsApp pausadas.")} />
            <span aria-hidden="true" />
          </label>
        </div>

        <div className="wa2-list">
          <div className="wa2-row">
            <div className="wa2-row-main">
              <span className="wa2-icon">✓</span>
              <div className="wa2-row-copy"><strong>Confirmação do agendamento</strong><small>Ao confirmar o horário</small></div>
            </div>
            <label className="wa2-toggle" aria-label="Confirmação do agendamento">
              <input type="checkbox" checked={data.settings.confirmationEnabled} disabled={saving} onChange={(event) => void saveSettings({ confirmationEnabled: event.target.checked })} />
              <span aria-hidden="true" />
            </label>
          </div>

          <div className="wa2-row wa2-reminder">
            <div className="wa2-row-main">
              <span className="wa2-icon">◷</span>
              <div className="wa2-row-copy"><strong>Lembrete do horário</strong><small>{data.settings.reminderEnabled ? `${data.settings.reminderHoursBefore}h antes` : "Desligado"}</small></div>
            </div>
            <label className="wa2-toggle" aria-label="Lembrete do horário">
              <input type="checkbox" checked={data.settings.reminderEnabled} disabled={saving} onChange={(event) => void saveSettings({ reminderEnabled: event.target.checked })} />
              <span aria-hidden="true" />
            </label>
            {data.settings.reminderEnabled && <div className="wa2-reminder-setting">
              <span>Enviar lembrete</span>
              <select aria-label="Quando enviar o lembrete" value={data.settings.reminderHoursBefore} disabled={saving} onChange={(event) => void saveSettings({ reminderHoursBefore: Number(event.target.value) }, "Lembrete atualizado.")}>{reminderOptions.map((hours) => <option value={hours} key={hours}>{hours === 1 ? "1 hora antes" : `${hours} horas antes`}</option>)}</select>
            </div>}
          </div>

          <div className="wa2-row">
            <div className="wa2-row-main">
              <span className="wa2-icon">×</span>
              <div className="wa2-row-copy"><strong>Aviso de cancelamento</strong><small>Quando um horário for cancelado</small></div>
            </div>
            <label className="wa2-toggle" aria-label="Aviso de cancelamento">
              <input type="checkbox" checked={data.settings.cancellationEnabled} disabled={saving} onChange={(event) => void saveSettings({ cancellationEnabled: event.target.checked })} />
              <span aria-hidden="true" />
            </label>
          </div>

          <div className="wa2-row">
            <div className="wa2-row-main">
              <span className="wa2-icon">↻</span>
              <div className="wa2-row-copy"><strong>Aviso de remarcação</strong><small>Quando o horário mudar</small></div>
            </div>
            <label className="wa2-toggle" aria-label="Aviso de remarcação">
              <input type="checkbox" checked={data.settings.rescheduleEnabled} disabled={saving} onChange={(event) => void saveSettings({ rescheduleEnabled: event.target.checked })} />
              <span aria-hidden="true" />
            </label>
          </div>

          <div className="wa2-row wa2-ai">
            <div className="wa2-row-main">
              <span className="wa2-icon">C.A.</span>
              <div className="wa2-row-copy"><strong>Atendimento por IA</strong><small>{!connected ? "Conecte o WhatsApp primeiro" : !hasMessageAccess ? "Renove a assinatura" : !data.settings.enabled ? "Ligue as automações primeiro" : data.settings.botEnabled ? "C.A. Atende ligado" : "Responde clientes automaticamente"}</small></div>
            </div>
            <label className="wa2-toggle" aria-label="C.A. Atende">
              <input type="checkbox" checked={data.settings.botEnabled} disabled={!canEnable || !data.settings.enabled || saving} onChange={(event) => void saveSettings({ botEnabled: event.target.checked }, event.target.checked ? "C.A. Atende com IA ligado." : "C.A. Atende desligado.")} />
              <span aria-hidden="true" />
            </label>
          </div>
        </div>
      </section>

      <details className="wa2-card wa2-greeting">
        <summary>
          <div className="wa2-greeting-title"><span>✎</span><div><strong>Editar saudação</strong><small>Primeira mensagem do C.A. Atende</small></div></div>
          <span aria-hidden="true">›</span>
        </summary>
        <div className="wa2-greeting-body">
          <label htmlFor="ca-greeting-text">MENSAGEM DE BOAS-VINDAS</label>
          <textarea id="ca-greeting-text" maxLength={700} value={greetingDraft} disabled={saving} onChange={(event) => setGreetingDraft(event.target.value)} />
          <p className="wa2-greeting-help">Use <code>{"{barbearia}"}</code> para o nome da barbearia e <code>{"{link}"}</code> para o link de agendamento. Se você não colocar o link, ele não será acrescentado sozinho.</p>
          <div className="wa2-greeting-actions">
            <button type="button" className="wa2-greeting-reset" disabled={saving} onClick={() => setGreetingDraft(defaultGreetingTemplate)}>Restaurar padrão</button>
            <button type="button" className="wa2-greeting-save" disabled={saving || !greetingDraft.trim()} onClick={() => void saveSettings({ greetingText: greetingDraft }, "Saudação do C.A. Atende atualizada.")}>{saving ? "Salvando..." : "Salvar saudação"}</button>
          </div>
        </div>
      </details>

      <details className="panel whatsapp-advanced-settings wa2-advanced">
        <summary><span>Configurações avançadas</span><span aria-hidden="true">›</span></summary>
      {data.humanHandoffs.length > 0 && <section className="wa2-human">
        <h3>Conversas com automação pausada</h3>
        <p>Inclui conversas assumidas por você no WhatsApp e atendimentos transferidos pelo C.A. Atende. O bot fica em silêncio nesses contatos. Encerrar atendimento libera as respostas às próximas mensagens.</p>
        {data.humanHandoffs.map((item) => {
          const ending = item.phone.replace(/\D/g, "").slice(-4);
          return <div className="wa2-human-item" key={item.phone}>
            <div><strong>WhatsApp final {ending || "----"}</strong><small className="wa2-human-reason">{item.humanRequestedAt ? "Atendimento transferido pelo C.A. Atende" : "Conversa assumida manualmente no WhatsApp"}</small><small>{item.lastInboundPreview || "Sem mensagem recebida registrada."}</small>{(item.humanRequestedAt || item.lastInboundAt) && <em>{formatDate(item.humanRequestedAt || item.lastInboundAt)}</em>}</div>
            <button type="button" onClick={() => void resumeHandoff(item.phone)} disabled={saving}>Encerrar atendimento</button>
          </div>;
        })}
      </section>}

        <div className="whatsapp-danger-zone" style={{ margin: 0, border: 0, borderTop: "1px solid var(--line)", borderRadius: 0, boxShadow: "none" }}>
          <div><strong>{formatPhone(data.connection.displayPhoneNumber)}</strong><small>Desconectar pausa as automações. Agendamentos e histórico continuam intactos.</small></div>
          <button type="button" onClick={() => void disconnect()} disabled={saving}>Desconectar WhatsApp</button>
        </div>
      </details>
    </> : <section className="wa2-card wa2-connect whatsapp-connect-card whatsapp-connect-live">
      <div className="wa2-connect-head">
        <span>WA</span>
        <div><strong>CONECTAR WHATSAPP</strong><small>{statusLabel(connectionState)} · use o seu próprio número</small></div>
      </div>
      <form onSubmit={connectEvolution} className="app-form">
        <label className="field"><span>NÚMERO DO WHATSAPP</span><input inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(formatPhone(event.target.value))} placeholder="(41) 99999-9999" /></label>
        <button type="submit" disabled={!evolutionReady || connecting || phoneDigits(phone).length < 10}>{connecting ? "Gerando código..." : "Gerar código"}</button>
        {!evolutionReady && <small>A conexão está sendo preparada no servidor. Tente novamente em alguns instantes.</small>}
      </form>
      {pairingCode && <div className="wa2-pairing whatsapp-pairing-code" role="status" aria-live="polite">
        <strong>Seu código de conexão</strong>
        <code>{codeGroups}</code>
        <p>No WhatsApp: Configurações → Aparelhos conectados → Conectar aparelho → Conectar usando número de telefone.</p>
      </div>}
    </section>}
  </section>;
}
