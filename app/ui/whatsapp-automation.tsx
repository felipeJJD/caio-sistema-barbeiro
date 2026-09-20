"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type WhatsappSignupConfig = {
  ready: boolean;
  appId: string;
  configId: string;
  graphVersion: string;
  missing: string[];
  supportsCoexistence: boolean;
};

type WhatsappConnectPayload = WhatsappApiPayload & {
  config?: WhatsappSignupConfig;
};

type EmbeddedSignupMode = "cloud" | "coexistence";

type MetaLoginResponse = {
  status?: string;
  authResponse?: { code?: string };
};

type MetaSignupEvent = {
  type?: string;
  event?: string;
  data?: {
    waba_id?: string;
    phone_number_id?: string;
    error_message?: string;
  };
};

declare global {
  interface Window {
    FB?: {
      init: (options: { appId: string; cookie?: boolean; xfbml?: boolean; version: string }) => void;
      login: (callback: (response: MetaLoginResponse) => void, options: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

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
  const [connecting, setConnecting] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [signupConfig, setSignupConfig] = useState<WhatsappSignupConfig | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const signupCodeRef = useRef<string | null>(null);
  const signupSessionRef = useRef<{ wabaId: string; phoneNumberId: string } | null>(null);
  const signupModeRef = useRef<EmbeddedSignupMode>("coexistence");
  const completingSignupRef = useRef(false);

  async function load(signal?: AbortSignal) {
    setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/connect", { cache: "no-store", signal });
      const payload = await response.json() as WhatsappConnectPayload;
      if (!response.ok || !payload.whatsapp || !payload.config) throw new Error(payload.error ?? "Não foi possível carregar o WhatsApp.");
      setData(payload.whatsapp);
      setSignupConfig(payload.config);
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

  const completeEmbeddedSignup = useCallback(async () => {
    const code = signupCodeRef.current;
    const session = signupSessionRef.current;
    if (!code || !session || completingSignupRef.current) return;
    completingSignupRef.current = true;
    setConnecting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          wabaId: session.wabaId,
          phoneNumberId: session.phoneNumberId,
          mode: signupModeRef.current,
        }),
      });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível concluir a conexão com a Meta.");
      setData(payload.whatsapp);
      showAppToast("WhatsApp conectado ao Cortou Anotou.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível concluir a conexão com a Meta.");
    } finally {
      signupCodeRef.current = null;
      signupSessionRef.current = null;
      completingSignupRef.current = false;
      setConnecting(false);
    }
  }, []);

  useEffect(() => {
    function receiveMetaSignupEvent(event: MessageEvent) {
      try {
        const origin = new URL(event.origin);
        if (origin.protocol !== "https:" || !(origin.hostname === "facebook.com" || origin.hostname.endsWith(".facebook.com"))) return;
      } catch {
        return;
      }

      let message: MetaSignupEvent | null = null;
      try {
        message = typeof event.data === "string" ? JSON.parse(event.data) as MetaSignupEvent : event.data as MetaSignupEvent;
      } catch {
        return;
      }
      if (!message || message.type !== "WA_EMBEDDED_SIGNUP") return;

      if (String(message.event ?? "").startsWith("FINISH")) {
        const wabaId = String(message.data?.waba_id ?? "");
        const phoneNumberId = String(message.data?.phone_number_id ?? "");
        if (wabaId && phoneNumberId) {
          signupSessionRef.current = { wabaId, phoneNumberId };
          void completeEmbeddedSignup();
        }
        return;
      }

      if (message.event === "CANCEL") {
        signupCodeRef.current = null;
        signupSessionRef.current = null;
        setConnecting(false);
        setFeedback("A conexão com a Meta foi cancelada antes de terminar.");
      }
      if (message.event === "ERROR") {
        signupCodeRef.current = null;
        signupSessionRef.current = null;
        setConnecting(false);
        setFeedback(message.data?.error_message || "A Meta não conseguiu concluir a conexão. Tente novamente.");
      }
    }
    window.addEventListener("message", receiveMetaSignupEvent);
    return () => window.removeEventListener("message", receiveMetaSignupEvent);
  }, [completeEmbeddedSignup]);

  useEffect(() => {
    if (!signupConfig?.ready || data?.connection.status === "connected") return;

    function initializeSdk() {
      if (!window.FB || !signupConfig) return;
      window.FB.init({
        appId: signupConfig.appId,
        cookie: true,
        xfbml: false,
        version: signupConfig.graphVersion,
      });
      setSdkReady(true);
    }

    if (window.FB) {
      initializeSdk();
      return;
    }

    window.fbAsyncInit = initializeSdk;
    if (document.getElementById("facebook-jssdk")) return;
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.onerror = () => {
      setSdkReady(false);
      setFeedback("Não foi possível carregar a conexão da Meta. Verifique a internet e tente novamente.");
    };
    document.head.appendChild(script);
  }, [signupConfig, data?.connection.status]);

  function launchEmbeddedSignup(mode: EmbeddedSignupMode) {
    if (!signupConfig?.ready) {
      setFeedback("A conta Meta do Cortou Anotou ainda precisa ser finalizada antes da primeira conexão.");
      return;
    }
    if (!sdkReady || !window.FB) {
      setFeedback("A conexão da Meta ainda está carregando. Aguarde alguns segundos e tente novamente.");
      return;
    }

    signupModeRef.current = mode;
    signupCodeRef.current = null;
    signupSessionRef.current = null;
    setFeedback(null);
    setConnecting(true);

    const extras: Record<string, unknown> = { setup: {}, sessionInfoVersion: "3" };
    if (mode === "coexistence") extras.featureType = "whatsapp_business_app_onboarding";

    window.FB.login((response) => {
      const code = String(response.authResponse?.code ?? "");
      if (!code) {
        setConnecting(false);
        setFeedback(response.status === "unknown"
          ? "A conexão foi fechada ou cancelada antes de terminar."
          : "A Meta não devolveu a autorização necessária. Tente novamente.");
        return;
      }
      signupCodeRef.current = code;
      void completeEmbeddedSignup();
    }, {
      config_id: signupConfig.configId,
      response_type: "code",
      override_default_response_type: true,
      extras,
    });
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
        {connected && data.connection.verifiedName && <small className="whatsapp-verified-name">{data.connection.verifiedName}</small>}
        {connected && data.connection.connectedAt && <em>{data.connection.onboardingMode === "coexistence" ? "WhatsApp Business + Cortou Anotou" : "Cloud API"} · conectado em {formatDate(data.connection.connectedAt)}</em>}
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
        <span>CONEXÃO OFICIAL META</span>
        <h3>Conectar o WhatsApp Business da barbearia</h3>
        <p>Você entra pela própria Meta e escolhe o número. O Cortou Anotou recebe somente a autorização necessária para cuidar das mensagens da sua barbearia.</p>
        {!signupConfig?.ready && <div className="whatsapp-meta-pending"><strong>Preparação da Meta pendente</strong><small>A integração já está pronta no Cortou Anotou. Falta ativar as credenciais oficiais da plataforma para liberar este botão.</small></div>}
      </div>
      <div className="whatsapp-connect-actions">
        <button type="button" className="whatsapp-connect-primary" disabled={!signupConfig?.ready || !sdkReady || connecting} onClick={() => launchEmbeddedSignup("coexistence")}>
          {connecting ? "Conectando..." : !signupConfig?.ready ? "Aguardando ativação da Meta" : !sdkReady ? "Carregando Meta..." : "Conectar meu WhatsApp atual"}
        </button>
        <button type="button" className="whatsapp-connect-secondary" disabled={!signupConfig?.ready || !sdkReady || connecting} onClick={() => launchEmbeddedSignup("cloud")}>Conectar outro número</button>
        <small><strong>Já usa WhatsApp Business no celular?</strong> Use a primeira opção. A Meta verifica a elegibilidade para manter o aplicativo funcionando junto com o Cortou Anotou.</small>
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
