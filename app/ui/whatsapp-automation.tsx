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
  usage: { sentThisMonth: number; remainingThisMonth: number };
  humanHandoffs: Array<{
    phone: string;
    lastInboundPreview: string;
    humanRequestedAt: string | null;
    lastInboundAt: string | null;
  }>;
};

type EvolutionConfig = {
  ready: boolean;
  missing: string[];
  provider: string;
  qrCode: boolean;
};

type WhatsappApiPayload = {
  whatsapp?: WhatsappStatusPayload;
  config?: EvolutionConfig;
  qr?: { base64?: string; code?: string; pairingCode?: string } | null;
  error?: string;
};

type CaAtendeTestState = {
  botState: string;
  memory: { intent?: string; date?: string; time?: string; service?: string; barber?: string; afterTime?: string };
  paused: boolean;
  unresolvedTurns: number;
};

type CaAtendeTestResult = {
  reply: string;
  intent: string;
  source: "rule" | "ai";
  dataSource: "agenda" | "services" | null;
  handoff: boolean;
  silent: boolean;
  silentReason: "commercial_offer" | "human_takeover" | null;
  choices: string[];
  guided: boolean;
  state: CaAtendeTestState;
};

type CaAtendeTestMessage = {
  id: number;
  role: "user" | "bot" | "system";
  text: string;
  badges?: string[];
  choices?: string[];
};

const reminderOptions = [1, 2, 3, 6, 12, 24];

function statusLabel(status: string) {
  if (status === "connected") return "Conectado";
  if (status === "connecting") return "Aguardando leitura do QR Code";
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
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
}

export function WhatsappAutomation() {
  const [data, setData] = useState<WhatsappStatusPayload | null>(null);
  const [config, setConfig] = useState<EvolutionConfig | null>(null);
  const [qr, setQr] = useState<{ base64?: string; code?: string; pairingCode?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testState, setTestState] = useState<CaAtendeTestState>({ botState: "", memory: {}, paused: false, unresolvedTurns: 0 });
  const [testMessages, setTestMessages] = useState<CaAtendeTestMessage[]>([
    { id: 1, role: "system", text: "Modo teste interno. Nenhuma mensagem é enviada para clientes reais." },
  ]);
  const testChatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (testOpen) testChatRef.current?.scrollTo({ top: testChatRef.current.scrollHeight, behavior: "smooth" });
  }, [testMessages, testOpen]);

  async function load(signal?: AbortSignal, quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/connect", { cache: "no-store", signal });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp || !payload.config) throw new Error(payload.error ?? "Não foi possível carregar o WhatsApp.");
      setData(payload.whatsapp);
      setConfig(payload.config);
      if (payload.whatsapp.connection.status === "connected") {
        setQr(null);
        setFeedback(null);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setFeedback(error instanceof Error ? error.message : "Não foi possível carregar o WhatsApp.");
    } finally {
      if (!signal?.aborted && !quiet) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!data || data.connection.status !== "connecting") return;
    const timer = window.setInterval(() => void load(undefined, true), 3000);
    return () => window.clearInterval(timer);
  }, [data?.connection.status]);

  async function connectEvolution() {
    setConnecting(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/connect", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível gerar o QR Code.");
      setData(payload.whatsapp);
      setQr(payload.qr ?? null);
      if (payload.whatsapp.connection.status === "connected") showAppToast("WhatsApp já está conectado ao Cortou Anotou.");
      else if (payload.qr) showAppToast("QR Code gerado. Leia com o WhatsApp da barbearia.");
      else setFeedback("A Evolution iniciou a conexão, mas ainda não devolveu o QR Code. Toque em gerar novamente.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível iniciar a conexão.");
    } finally {
      setConnecting(false);
    }
  }

  async function saveSettings(patch: Record<string, unknown>, success?: string) {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "settings", ...patch }),
      });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível salvar.");
      setData(payload.whatsapp);
      if (success) showAppToast(success);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm("Desconectar este WhatsApp do Cortou Anotou? As automações serão pausadas.")) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "disconnect" }),
      });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível desconectar.");
      setData(payload.whatsapp);
      setQr(null);
      showAppToast("WhatsApp desconectado.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível desconectar.");
    } finally {
      setSaving(false);
    }
  }

  async function resumeHandoff(phone: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/whatsapp/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resume-conversation", phone }),
      });
      const payload = await response.json() as WhatsappApiPayload;
      if (!response.ok || !payload.whatsapp) throw new Error(payload.error ?? "Não foi possível encerrar o atendimento humano.");
      setData(payload.whatsapp);
      showAppToast("Automação liberada para esse cliente.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível atualizar a conversa.");
    } finally {
      setSaving(false);
    }
  }

  function resetCaAtendeTest() {
    setTestState({ botState: "", memory: {}, paused: false, unresolvedTurns: 0 });
    setTestInput("");
    setTestMessages([{ id: Date.now(), role: "system", text: "Nova conversa de teste iniciada." }]);
  }

  async function sendCaAtendeTest(textValue: string) {
    const message = textValue.trim();
    if (!message || testSending) return;
    const userId = Date.now();
    setTestMessages((current) => [...current, { id: userId, role: "user", text: message }]);
    setTestInput("");
    setTestSending(true);
    try {
      const response = await fetch("/api/whatsapp/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, state: testState }),
      });
      const payload = await response.json() as { result?: CaAtendeTestResult; error?: string };
      if (!response.ok || !payload.result) throw new Error(payload.error ?? "Não foi possível testar agora.");
      const result = payload.result;
      setTestState(result.state);
      const badges = [
        result.source === "ai" ? "IA" : "REGRA",
        result.dataSource === "agenda" ? "AGENDA REAL" : result.dataSource === "services" ? "SERVIÇOS REAIS" : "",
        result.handoff ? "HUMANO" : "",
        result.silent ? "SILÊNCIO" : "",
        result.guided ? "FLUXO GUIADO" : "",
      ].filter(Boolean);
      const text = result.silent
        ? result.silentReason === "commercial_offer"
          ? "O C.A. Atende identificaria uma possível oferta comercial e não responderia."
          : "O C.A. Atende permaneceria em silêncio porque essa conversa já foi transferida para atendimento humano."
        : result.reply;
      setTestMessages((current) => [...current, { id: userId + 1, role: result.silent ? "system" : "bot", text, badges, choices: result.choices }]);
    } catch (error) {
      setTestMessages((current) => [...current, { id: Date.now() + 2, role: "system", text: error instanceof Error ? error.message : "Não foi possível testar agora." }]);
    } finally {
      setTestSending(false);
    }
  }

  function submitCaAtendeTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendCaAtendeTest(testInput);
  }

  function submitReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void saveSettings({ reminderHoursBefore: Number(form.get("reminderHoursBefore") ?? 3) }, "Horário do lembrete atualizado.");
  }

  const connected = data?.connection.status === "connected";
  const connectingState = data?.connection.status === "connecting";
  const hasPackage = Boolean(data && data.settings.monthlyMessageLimit > 0 && data.settings.planCode !== "off");
  const canEnable = Boolean(connected && hasPackage);
  const usagePercent = useMemo(() => {
    if (!data?.settings.monthlyMessageLimit) return 0;
    return Math.min(100, Math.round(data.usage.sentThisMonth / data.settings.monthlyMessageLimit * 100));
  }, [data]);

  if (loading) return <section className="whatsapp-page"><div className="panel whatsapp-loading"><span className="whatsapp-brand-mark">WA</span><div><strong>Carregando WhatsApp...</strong><small>Consultando a conexão da sua barbearia.</small></div></div></section>;

  if (!data) return <section className="whatsapp-page"><div className="panel whatsapp-empty-state"><span>!</span><h2>Não foi possível abrir o WhatsApp</h2><p>{feedback ?? "Tente novamente em alguns instantes."}</p><button type="button" className="primary-button" onClick={() => void load()}>Tentar novamente</button></div></section>;

  return <section className="whatsapp-page">
    <div className="whatsapp-hero panel">
      <div className="whatsapp-hero-copy">
        <span className="whatsapp-kicker">C.A. ATENDE · WHATSAPP</span>
        <h2>Conecte o WhatsApp da barbearia por QR Code.</h2>
        <p>O Cortou Anotou usa a Evolution API para confirmações, lembretes, cancelamentos e atendimento automático ligado à agenda real.</p>
      </div>
      <div className={connected ? "whatsapp-connection-badge connected" : "whatsapp-connection-badge"}>
        <i />
        <span>{connected ? "WHATSAPP CONECTADO" : connectingState ? "AGUARDANDO QR CODE" : "WHATSAPP DESCONECTADO"}</span>
      </div>
    </div>

    {feedback && <div className="notice error whatsapp-feedback" role="alert">{feedback}</div>}

    <div className="whatsapp-status-grid">
      <article className="panel whatsapp-status-card">
        <div className="whatsapp-card-icon">☏</div>
        <span>CONEXÃO</span>
        <strong>{statusLabel(data.connection.status)}</strong>
        <small>{connected ? data.connection.displayPhoneNumber || "WhatsApp conectado por Evolution" : "Nenhum WhatsApp conectado"}</small>
        {connected && data.connection.verifiedName && <small className="whatsapp-verified-name">{data.connection.verifiedName}</small>}
        {connected && data.connection.connectedAt && <em>Evolution API · conectado em {formatDate(data.connection.connectedAt)}</em>}
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
        <span>CONEXÃO POR EVOLUTION API</span>
        <h3>Conectar o WhatsApp que você já usa</h3>
        <p>Toque em gerar QR Code. Depois, no WhatsApp da barbearia, abra <strong>Configurações → Aparelhos conectados → Conectar um aparelho</strong> e leia o código.</p>
        {!config?.ready && <div className="whatsapp-meta-pending"><strong>Servidor Evolution ainda não configurado</strong><small>Faltam: {config?.missing.join(", ") || "variáveis da Evolution"}.</small></div>}
      </div>
      <div className="whatsapp-connect-actions">
        <button type="button" className="whatsapp-connect-primary" disabled={!config?.ready || connecting} onClick={() => void connectEvolution()}>
          {connecting ? "Gerando QR Code..." : qr ? "Gerar outro QR Code" : "Conectar meu WhatsApp"}
        </button>
        <small>Não precisa cadastrar o número na Cloud API da Meta. A sessão é vinculada como um aparelho conectado do WhatsApp.</small>
      </div>
    </section>}

    {!connected && qr && <section className="panel whatsapp-connect-card whatsapp-connect-live">
      <div className="whatsapp-connect-copy">
        <span>LEIA PELO CELULAR DA BARBEARIA</span>
        <h3>QR Code do WhatsApp</h3>
        <p>Deixe esta tela aberta até aparecer “WhatsApp conectado”. A verificação acontece automaticamente.</p>
      </div>
      <div className="whatsapp-connect-actions" style={{ alignItems: "center" }}>
        {qr.base64 ? <img src={qr.base64} alt="QR Code para conectar o WhatsApp" width={230} height={230} style={{ width: 230, height: 230, maxWidth: "100%", borderRadius: 16, background: "white", padding: 10 }} /> : null}
        {!qr.base64 && qr.pairingCode ? <strong style={{ fontSize: 28, letterSpacing: 4 }}>{qr.pairingCode}</strong> : null}
        {!qr.base64 && !qr.pairingCode && qr.code ? <small>QR gerado. Se a imagem não aparecer, toque em “Gerar outro QR Code”.</small> : null}
      </div>
    </section>}

    {connected && <section className="panel whatsapp-connect-card whatsapp-connect-live">
      <div className="whatsapp-connect-icon">✓</div>
      <div className="whatsapp-connect-copy">
        <span>EVOLUTION ATIVA</span>
        <h3>Seu WhatsApp está ligado ao Cortou Anotou</h3>
        <p>O número continua utilizável no celular e o Cortou Anotou pode enviar e receber as automações configuradas abaixo.</p>
      </div>
      <div className="whatsapp-connect-actions"><button type="button" className="whatsapp-connect-secondary" disabled={saving} onClick={() => void disconnect()}>Desconectar WhatsApp</button></div>
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
        <label className="whatsapp-rule"><span className="whatsapp-rule-symbol">✓</span><span><strong>Confirmação do agendamento</strong><small>Envia quando um horário entra como confirmado na agenda.</small></span><input type="checkbox" checked={data.settings.confirmationEnabled} disabled={saving} onChange={(event) => void saveSettings({ confirmationEnabled: event.target.checked })} /><i /></label>

        <div className="whatsapp-rule reminder">
          <span className="whatsapp-rule-symbol">◷</span><span><strong>Lembrete antes do horário</strong><small>Ajuda a reduzir esquecimentos e faltas.</small></span>
          <label className="whatsapp-inline-switch"><input type="checkbox" checked={data.settings.reminderEnabled} disabled={saving} onChange={(event) => void saveSettings({ reminderEnabled: event.target.checked })} /><i /></label>
          <form onSubmit={submitReminder}><label><span>Enviar</span><select name="reminderHoursBefore" defaultValue={data.settings.reminderHoursBefore} disabled={saving || !data.settings.reminderEnabled}>{reminderOptions.map((hours) => <option value={hours} key={hours}>{hours === 1 ? "1 hora antes" : `${hours} horas antes`}</option>)}</select></label><button disabled={saving || !data.settings.reminderEnabled}>Salvar</button></form>
        </div>

        <label className="whatsapp-rule"><span className="whatsapp-rule-symbol">×</span><span><strong>Aviso de cancelamento</strong><small>O cliente recebe a atualização quando o horário é cancelado.</small></span><input type="checkbox" checked={data.settings.cancellationEnabled} disabled={saving} onChange={(event) => void saveSettings({ cancellationEnabled: event.target.checked })} /><i /></label>
        <label className="whatsapp-rule"><span className="whatsapp-rule-symbol">↻</span><span><strong>Aviso de remarcação</strong><small>Atualiza o cliente e reposiciona o lembrete para o novo horário.</small></span><input type="checkbox" checked={data.settings.rescheduleEnabled} disabled={saving} onChange={(event) => void saveSettings({ rescheduleEnabled: event.target.checked })} /><i /></label>
      </div>
    </section>

    <section className="panel whatsapp-assistant-preview whatsapp-assistant-ready">
      <div className="whatsapp-assistant-badge">C.A.</div>
      <div className="whatsapp-assistant-copy"><span>C.A. ATENDE</span><h3>Atendimento inteligente por IA</h3><p>Se o cliente preferir conversar, a IA usa serviços, profissionais e horários reais do Cortou Anotou. Se não conseguir resolver com segurança, chama uma pessoa da barbearia.</p><div className="whatsapp-assistant-tags"><small>AGENDA REAL</small><small>FILTRO DE OFERTAS</small><small>IA</small><small>TRANSFERÊNCIA HUMANA</small></div><button type="button" className="whatsapp-test-launch" onClick={() => setTestOpen((open) => !open)}>{testOpen ? "Fechar teste" : "Testar atendente"}</button></div>
      <label className={canEnable && data.settings.enabled ? "whatsapp-bot-switch" : "whatsapp-bot-switch disabled"}><span><strong>{data.settings.botEnabled ? "C.A. Atende ligado" : "C.A. Atende desligado"}</strong><small>{!connected ? "Conecte o WhatsApp primeiro" : !hasPackage ? "Ative um pacote primeiro" : !data.settings.enabled ? "Ligue as automações primeiro" : "IA conversa; o sistema valida e executa"}</small></span><input type="checkbox" checked={data.settings.botEnabled} disabled={!canEnable || !data.settings.enabled || saving} onChange={(event) => void saveSettings({ botEnabled: event.target.checked }, event.target.checked ? "C.A. Atende com IA ligado." : "C.A. Atende desligado.")} /><i /></label>
    </section>

    {testOpen && <section className="panel whatsapp-test-panel">
      <div className="whatsapp-test-heading"><div><span>LABORATÓRIO DO C.A. ATENDE</span><h3>Converse como se fosse um cliente</h3><p>Usa o mesmo motor do atendimento, sem enviar mensagem real pelo WhatsApp.</p></div><button type="button" onClick={resetCaAtendeTest} disabled={testSending}>Reiniciar conversa</button></div>
      <div className="whatsapp-test-chat" aria-live="polite" ref={testChatRef}>
        {testMessages.map((message, index) => <div className={`whatsapp-test-message ${message.role}`} key={message.id}><div className="whatsapp-test-bubble">{message.text}</div>{index === testMessages.length - 1 && !testSending && !testState.paused && Boolean(message.choices?.length) && <div className="whatsapp-test-choices">{message.choices?.map((choice) => <button type="button" key={choice} onClick={() => void sendCaAtendeTest(choice)}>{choice}</button>)}</div>}{message.badges && message.badges.length > 0 && <div className="whatsapp-test-badges">{message.badges.map((badge) => <small key={badge}>{badge}</small>)}</div>}</div>)}
        {testSending && <div className="whatsapp-test-message bot"><div className="whatsapp-test-bubble thinking">C.A. Atende está analisando...</div></div>}
      </div>
      <form className="whatsapp-test-form" onSubmit={submitCaAtendeTest}><input value={testInput} onChange={(event) => setTestInput(event.target.value)} maxLength={1200} placeholder={testState.paused ? "O bot está em atendimento humano. Reinicie para testar outro cliente." : "Ex.: oi boa tarde, tem horário hoje para corte?"} disabled={testSending} enterKeyHint="send" /><button type="submit" disabled={testSending || !testInput.trim()}>Enviar</button></form>
    </section>}

    {data.humanHandoffs.length > 0 && <section className="panel whatsapp-human-queue"><div className="whatsapp-human-queue-heading"><span>ATENDIMENTO HUMANO</span><h3>Clientes esperando uma pessoa</h3><p>O bot fica em silêncio nesses contatos até você encerrar o atendimento aqui.</p></div><div className="whatsapp-human-list">{data.humanHandoffs.map((item) => { const ending = item.phone.replace(/\D/g, "").slice(-4); return <div className="whatsapp-human-item" key={item.phone}><div><strong>WhatsApp final {ending || "----"}</strong><small>{item.lastInboundPreview || "Cliente pediu atendimento humano."}</small>{item.humanRequestedAt && <em>{formatDate(item.humanRequestedAt)}</em>}</div><button type="button" onClick={() => void resumeHandoff(item.phone)} disabled={saving}>Liberar automação</button></div>; })}</div></section>}
  </section>;
}
