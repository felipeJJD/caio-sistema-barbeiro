"use client";

import { useEffect, useState } from "react";
import { showAppToast } from "./app-toast";

type PublicationStatus = "queued" | "sending" | "sent" | "failed" | "cancelled";

type StatusPublication = {
  id: number;
  text: string;
  audiencePhone: string;
  status: PublicationStatus;
  scheduledAt: string;
  sentAt: string | null;
  failedAt: string | null;
  errorText: string;
  createdAt: string;
};

type StatusPublicationState = {
  connectionStatus: string;
  canPublish: boolean;
  reason: string;
  publications: StatusPublication[];
};

type ApiPayload = {
  statusPublications?: StatusPublicationState;
  publicationId?: number;
  error?: string;
};

const quickTexts = [
  { label: "Bom dia", text: "Bom dia! Já estamos atendendo hoje. Chame a gente e garanta seu horário." },
  { label: "Estamos abertos", text: "Estamos abertos e atendendo. Se quiser cortar hoje, chama a gente para conferir os horários disponíveis." },
  { label: "Agenda aberta", text: "Agenda aberta! Já dá para garantir seu próximo horário na barbearia." },
];

function localDateTimeValue(minutesAhead = 5) {
  const date = new Date(Date.now() + minutesAhead * 60_000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function publicationLabel(status: PublicationStatus) {
  if (status === "queued") return "Agendado";
  if (status === "sending") return "Publicando";
  if (status === "sent") return "Publicado";
  if (status === "cancelled") return "Cancelado";
  return "Falhou";
}

function phoneDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 13);
}

function formatPhone(value: string) {
  const raw = phoneDigits(value);
  const local = raw.startsWith("55") && raw.length > 11 ? raw.slice(2) : raw;
  const ddd = local.slice(0, 2);
  const first = local.slice(2, 7);
  const last = local.slice(7, 11);
  if (!ddd) return "";
  if (local.length <= 2) return `(${ddd}`;
  if (local.length <= 7) return `(${ddd}) ${first}`;
  return `(${ddd}) ${first}-${last}`;
}

export function WhatsappStatusPublications() {
  const [state, setState] = useState<StatusPublicationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [text, setText] = useState("");
  const [audiencePhone, setAudiencePhone] = useState("");
  const [scheduledLocal, setScheduledLocal] = useState(() => localDateTimeValue());
  const [feedback, setFeedback] = useState<string | null>(null);

  async function load(background = false) {
    if (!background) setLoading(true);
    try {
      const response = await fetch("/api/whatsapp/status-publications", { cache: "no-store" });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.statusPublications) throw new Error(payload.error ?? "Não foi possível carregar as publicações.");
      setState(payload.statusPublications);
      setFeedback(null);
    } catch (error) {
      if (!background) setFeedback(error instanceof Error ? error.message : "Não foi possível carregar as publicações.");
    } finally {
      if (!background) setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(action: "publish-now" | "schedule") {
    const cleanText = text.trim();
    const cleanAudiencePhone = phoneDigits(audiencePhone);
    if (!cleanText || saving) return;
    if (cleanAudiencePhone.length < 10) {
      setFeedback("Informe um número de WhatsApp válido para visualizar o Status de teste.");
      return;
    }
    let scheduledAt = "";
    if (action === "schedule") {
      const date = new Date(scheduledLocal);
      if (!Number.isFinite(date.getTime())) {
        setFeedback("Escolha uma data e um horário válidos.");
        return;
      }
      scheduledAt = date.toISOString();
    }
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/status-publications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, text: cleanText, audiencePhone: cleanAudiencePhone, scheduledAt }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.statusPublications) throw new Error(payload.error ?? "Não foi possível salvar a publicação.");
      setState(payload.statusPublications);
      const publication = payload.statusPublications.publications.find((item) => item.id === payload.publicationId);
      if (action === "publish-now" && publication?.status === "failed") {
        setFeedback(publication.errorText || "A Evolution não confirmou a publicação. Confira o WhatsApp antes de tentar de novo.");
      } else {
        setText("");
        setScheduledLocal(localDateTimeValue());
        showAppToast(action === "publish-now" ? "Publicação processada. Confira o Status no WhatsApp." : "Status programado.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível salvar a publicação.");
    } finally {
      setSaving(false);
    }
  }

  async function cancel(id: number) {
    if (saving || !window.confirm("Cancelar esta publicação agendada?")) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/whatsapp/status-publications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel", id }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.statusPublications) throw new Error(payload.error ?? "Não foi possível cancelar a publicação.");
      setState(payload.statusPublications);
      showAppToast("Publicação cancelada.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível cancelar a publicação.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !state || state.connectionStatus !== "connected") return null;
  const audienceReady = phoneDigits(audiencePhone).length >= 10;

  return <section className="whatsapp-page ws-page">
    <style>{`
      .ws-page{max-width:760px;margin:0 auto 8px}
      .ws-card{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 2px 7px #25270c06;overflow:hidden}
      .ws-head{width:100%;border:0;background:#fff;display:grid;grid-template-columns:34px minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:12px 14px;text-align:left;color:#202720}
      .ws-icon{width:34px;height:34px;border-radius:10px;background:#e8f4eb;color:#34764d;display:grid;place-items:center;font-size:15px;font-weight:900}
      .ws-title{min-width:0}.ws-title strong,.ws-title small{display:block}.ws-title strong{font-size:13px}.ws-title small{margin-top:3px;color:#858a82;font-size:10px}
      .ws-lab{padding:4px 7px;border-radius:999px;background:#f6edd9;color:#93691f;font-size:8px;font-weight:900;letter-spacing:.06em}
      .ws-arrow{font-size:18px;transform:rotate(90deg);transition:.18s}.ws-arrow.closed{transform:rotate(0)}
      .ws-body{padding:0 14px 14px;border-top:1px solid #efeee8}
      .ws-note{margin:12px 0 10px;padding:9px 10px;border-radius:9px;background:#f8f7f2;color:#6f746d;font-size:10px;line-height:1.4}
      .ws-quick{display:flex;gap:6px;overflow:auto;padding-bottom:2px}.ws-quick button{white-space:nowrap;border:1px solid #deddd5;background:#fff;border-radius:999px;padding:7px 9px;font-size:10px;font-weight:800;color:#30362f}
      .ws-label{display:block;margin:10px 0 5px;font-size:9px;font-weight:900;color:#766d5d;letter-spacing:.06em}
      .ws-textarea{width:100%;min-height:94px;resize:vertical;border:1px solid #deddd5;border-radius:10px;background:#fff;padding:10px 11px;font-size:16px;line-height:1.35;color:#202720}
      .ws-counter{text-align:right;margin-top:3px;color:#93978f;font-size:9px}
      .ws-input,.ws-datetime{width:100%;min-height:42px;border:1px solid #deddd5;border-radius:10px;background:#fff;padding:0 10px;font-size:16px;color:#202720}
      .ws-audience-help{margin:5px 0 0;color:#737970;font-size:9px;line-height:1.4}.ws-audience-help strong{color:#3d674a}
      .ws-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.ws-actions button{min-height:42px;border-radius:10px;font-size:11px;font-weight:900}.ws-now{border:0;background:#202720;color:#fff}.ws-schedule{border:1px solid #202720;background:#fff;color:#202720}.ws-actions button:disabled{opacity:.45}
      .ws-feedback{margin:10px 0 0;padding:8px 9px;border-radius:8px;background:#fff1ef;color:#9b3c32;font-size:10px;line-height:1.4}
      .ws-history-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:14px;padding-top:12px;border-top:1px solid #efeee8}.ws-history-head strong{font-size:11px}.ws-history-head button{border:0;background:transparent;color:#5c675d;font-size:10px;font-weight:800;padding:5px}
      .ws-empty{margin:10px 0 0;color:#8a8f87;font-size:10px}
      .ws-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:10px 0;border-top:1px solid #efeee8}.ws-item:first-of-type{margin-top:4px}.ws-item-main{min-width:0}.ws-item-text{font-size:11px;line-height:1.35;color:#2a302b;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.ws-item-meta{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:4px;color:#858a82;font-size:9px}.ws-badge{padding:3px 6px;border-radius:999px;background:#f1f2ef;font-weight:900}.ws-badge.sent{background:#e8f4eb;color:#34764d}.ws-badge.failed{background:#fff1ef;color:#9b3c32}.ws-badge.cancelled{background:#f3f3f1;color:#7d817a}.ws-error{margin-top:4px;color:#9b3c32;font-size:9px;line-height:1.35}.ws-audience-meta{margin-top:4px;color:#737970;font-size:9px}.ws-cancel{align-self:center;border:1px solid #deddd5;background:#fff;border-radius:8px;padding:7px 8px;font-size:9px;font-weight:900;color:#5b615a}
      @media(max-width:680px){.ws-page{margin:0 -1px 8px}.ws-card{border-radius:12px}.ws-head{padding:11px 12px}.ws-body{padding:0 12px 12px}.ws-actions{grid-template-columns:1fr}.ws-lab{font-size:7px}}
    `}</style>
    <div className="ws-card">
      <button type="button" className="ws-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="ws-icon">S</span>
        <span className="ws-title"><strong>Publicações de Status</strong><small>Teste de publicação e agendamento · somente texto</small></span>
        <span className="ws-lab">LAB</span>
        <span className={`ws-arrow ${open ? "" : "closed"}`} aria-hidden="true">›</span>
      </button>
      {open && <div className="ws-body">
        <div className="ws-note">O C|A vai usar o canal de <strong>Status do WhatsApp</strong>. O número de teste abaixo serve somente para definir quem poderá visualizar esse Status. <strong>Não será enviada mensagem privada para ele.</strong></div>
        <div className="ws-quick">{quickTexts.map((item) => <button type="button" key={item.label} onClick={() => setText(item.text)}>{item.label}</button>)}</div>
        <label className="ws-label" htmlFor="ws-status-text">TEXTO DO STATUS</label>
        <textarea id="ws-status-text" className="ws-textarea" maxLength={500} value={text} onChange={(event) => setText(event.target.value)} placeholder="Escreva o que você quer publicar no Status..." />
        <div className="ws-counter">{text.length}/500</div>
        <label className="ws-label" htmlFor="ws-status-audience">NÚMERO PARA VISUALIZAR O TESTE</label>
        <input id="ws-status-audience" className="ws-input" type="tel" inputMode="tel" autoComplete="tel" value={audiencePhone} onChange={(event) => setAudiencePhone(formatPhone(event.target.value))} placeholder="(41) 99999-9999" />
        <p className="ws-audience-help"><strong>Não envia mensagem.</strong> Esse número apenas entra na audiência do Status para confirmarmos que a publicação apareceu.</p>
        <label className="ws-label" htmlFor="ws-status-time">DATA E HORÁRIO</label>
        <input id="ws-status-time" className="ws-datetime" type="datetime-local" value={scheduledLocal} onChange={(event) => setScheduledLocal(event.target.value)} />
        <div className="ws-actions">
          <button type="button" className="ws-now" disabled={!state.canPublish || saving || !text.trim() || !audienceReady} onClick={() => void save("publish-now")}>{saving ? "Processando..." : "Publicar agora"}</button>
          <button type="button" className="ws-schedule" disabled={!state.canPublish || saving || !text.trim() || !audienceReady} onClick={() => void save("schedule")}>Programar publicação</button>
        </div>
        {!state.canPublish && <div className="ws-feedback">{state.reason}</div>}
        {feedback && <div className="ws-feedback" role="alert">{feedback}</div>}
        <div className="ws-history-head"><strong>Últimas publicações</strong><button type="button" onClick={() => void load(true)} disabled={saving}>Atualizar</button></div>
        {state.publications.length === 0 ? <p className="ws-empty">Nenhuma publicação de teste ainda.</p> : state.publications.map((item) => <div className="ws-item" key={item.id}>
          <div className="ws-item-main">
            <div className="ws-item-text">{item.text}</div>
            <div className="ws-item-meta"><span className={`ws-badge ${item.status}`}>{publicationLabel(item.status)}</span><span>{item.status === "sent" && item.sentAt ? formatDate(item.sentAt) : formatDate(item.scheduledAt)}</span></div>
            {item.audiencePhone && <div className="ws-audience-meta">Audiência de teste: {formatPhone(item.audiencePhone)}</div>}
            {item.status === "failed" && item.errorText && <div className="ws-error">{item.errorText}</div>}
          </div>
          {item.status === "queued" && <button type="button" className="ws-cancel" onClick={() => void cancel(item.id)} disabled={saving}>Cancelar</button>}
        </div>)}
      </div>}
    </div>
  </section>;
}
