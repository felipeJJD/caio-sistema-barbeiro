"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { AffiliateBottomNav, type AffiliateNavTab } from "./affiliate-bottom-nav";
import { AffiliateProspectingAudio, type ApproachMode } from "./affiliate-prospecting-audio";
import { AffiliateProspectingHistory } from "./affiliate-prospecting-history";
import styles from "./affiliate-prospecting-workspace.module.css";

type Lead = {
  id: string;
  name: string;
  phone: string;
  phoneE164: string;
  phoneKind: string;
  whatsappCandidate: boolean;
  address: string;
  confidence?: number | null;
};

type City = { id: number | string; name: string };
type ReservedClaim = { key: string; phoneE164: string; name?: string };
type BlockedClaim = { name?: string; reason?: string };
type QueueJob = {
  id: string;
  batchId: string;
  key: string;
  name: string;
  phoneE164: string;
  status: string;
  error?: string;
  delivery?: string;
  stage?: string;
  approachMode?: string;
  textProviderId?: string;
  audioProviderId?: string;
};
type AutomaticWhatsappState = { state: string; connected: boolean; canConnect?: boolean };
type WorkspaceTab = Exclude<AffiliateNavTab, "home">;

const STATES = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"],
  ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"],
  ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"],
  ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
] as const;

const DISPLAY_STEP = 10;
const DEFAULT_MESSAGE = "Oi pessoal da {barbearia}! Tudo bem? Aqui é do Cortou Anotou, um sistema para barbearias organizarem agenda, atendimentos, equipe e financeiro pelo celular. Dá uma olhada: {link}";
const MODE_STORAGE = "ca-affiliate-prospecting-mode";
const MESSAGE_STORAGE = "ca-affiliate-prospecting-message";

function nationalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
}

function readableError(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim().replace(/\[object Object\]/g, "").trim() || fallback;
  if (Array.isArray(value)) return value.map((item) => readableError(item, "")).filter(Boolean).join(" · ") || fallback;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "description"]) {
      const text = readableError(record[key], "");
      if (text) return text;
    }
  }
  return fallback;
}

function mergeLeads(current: Lead[], incoming: Lead[]) {
  const map = new Map<string, Lead>();
  for (const lead of [...current, ...incoming]) {
    const key = lead.phoneE164 ? `phone:${lead.phoneE164}` : `lead:${lead.id}`;
    const previous = map.get(key);
    if (!previous || (lead.confidence ?? 0) > (previous.confidence ?? 0)) map.set(key, lead);
  }
  return [...map.values()];
}

function modeLabel(mode: ApproachMode) {
  if (mode === "text_audio") return "Mensagem + áudio";
  if (mode === "audio_only" || mode === "audio_wait") return "Somente áudio";
  return "Mensagem";
}

function deliveryLabel(job: QueueJob) {
  if (job.delivery === "read") return "Lida";
  if (job.delivery === "delivered") return "Entregue";
  return ({ pending: "Na fila", leased: "Preparando", sending: "Enviando", sent: "Enviada", failed: "Falhou", uncertain: "Conferir envio", cancelled: "Cancelada" } as Record<string, string>)[job.status] || job.status;
}

export function AffiliateProspectingWorkspace({ name, initialWhatsapp, signupUrl }: { name: string; initialWhatsapp: string; signupUrl: string; isAdmin: boolean }) {
  const [tab, setTab] = useState<WorkspaceTab>("prospecting");
  const [uf, setUf] = useState("PR");
  const [city, setCity] = useState("Colombo");
  const [businessName, setBusinessName] = useState("");
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchedCity, setSearchedCity] = useState("");
  const [searchedName, setSearchedName] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [visibleCount, setVisibleCount] = useState(DISPLAY_STEP);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [approachMode, setApproachMode] = useState<ApproachMode>("text");
  const [audioId, setAudioId] = useState("");
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [whatsapp, setWhatsapp] = useState(nationalPhone(initialWhatsapp || ""));
  const [automatic, setAutomatic] = useState<AutomaticWhatsappState>({ state: "loading", connected: false });
  const [automaticLoading, setAutomaticLoading] = useState(true);
  const [automaticConnecting, setAutomaticConnecting] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [jobActionId, setJobActionId] = useState("");
  const [visibleJobs, setVisibleJobs] = useState(30);
  const jobActionRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const queryTab = new URLSearchParams(window.location.search).get("tab");
      if (queryTab === "progress" || queryTab === "settings") setTab(queryTab);
      const savedMode = window.localStorage.getItem(MODE_STORAGE);
      if (savedMode && ["text", "text_audio", "audio_only"].includes(savedMode)) setApproachMode(savedMode as ApproachMode);
      const savedMessage = window.localStorage.getItem(MESSAGE_STORAGE);
      if (savedMessage?.trim()) setMessage(savedMessage);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    fetch(`/api/affiliate/prospecting/cities?uf=${encodeURIComponent(uf)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { cities?: City[]; error?: string };
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as cidades.");
        return Array.isArray(payload.cities) ? payload.cities : [];
      })
      .then((items) => {
        if (!active) return;
        setCities(items);
        setCity((current) => items.some((item) => item.name === current) ? current : "");
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Não foi possível carregar as cidades."))
      .finally(() => active && setCitiesLoading(false));
    return () => { active = false; };
  }, [uf]);

  useEffect(() => {
    const initial = window.setTimeout(() => { void refreshAutomatic(false); void refreshQueue(); }, 0);
    const interval = window.setInterval(() => void refreshQueue(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!pairingCode) return;
    const interval = window.setInterval(() => void refreshAutomatic(false), 4000);
    return () => window.clearInterval(interval);
  }, [pairingCode]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const visibleLeads = useMemo(() => leads.slice(0, visibleCount), [leads, visibleCount]);
  const selectedLeads = useMemo(() => leads.filter((lead) => selected.has(lead.id) && lead.whatsappCandidate && lead.phoneE164), [leads, selected]);
  const queuedCount = jobs.filter((job) => ["pending", "leased", "sending"].includes(job.status)).length;
  const sentCount = jobs.filter((job) => job.status === "sent").length;
  const failedCount = jobs.filter((job) => ["failed", "uncertain"].includes(job.status)).length;

  function chooseTab(next: WorkspaceTab) {
    setTab(next);
    setError("");
    window.history.replaceState(null, "", next === "prospecting" ? "/afiliado/prospeccao" : `/afiliado/prospeccao?tab=${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseApproach(mode: ApproachMode) {
    setApproachMode(mode);
    if (["text", "text_audio", "audio_only"].includes(mode)) window.localStorage.setItem(MODE_STORAGE, mode);
  }

  function updateMessage(value: string) {
    setMessage(value);
    window.localStorage.setItem(MESSAGE_STORAGE, value);
  }

  async function refreshQueue() {
    try {
      const response = await fetch("/api/affiliate/prospecting/queue", { cache: "no-store" });
      const payload = await response.json() as { jobs?: QueueJob[] };
      if (response.ok) setJobs(payload.jobs || []);
    } catch { /* Mantém o último progresso visível durante falhas temporárias. */ }
  }

  async function refreshAutomatic(showNotice = true) {
    if (showNotice) setAutomaticLoading(true);
    try {
      const response = await fetch("/api/affiliate/prospecting/whatsapp", { cache: "no-store" });
      const payload = await response.json() as AutomaticWhatsappState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar seu WhatsApp.");
      setAutomatic({ state: payload.state || "disconnected", connected: Boolean(payload.connected), canConnect: payload.canConnect });
      if (payload.connected) {
        setPairingCode("");
        if (showNotice) setNotice("WhatsApp conectado e pronto para a prospecção.");
      } else if (showNotice) {
        setNotice("O número ainda não terminou a conexão.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar seu WhatsApp.");
    } finally {
      setAutomaticLoading(false);
    }
  }

  async function connectAutomatic() {
    if (!whatsapp.trim()) return setNotice("Informe o DDD e o número antes de conectar.");
    setAutomaticConnecting(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/affiliate/prospecting/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "connect", phone: whatsapp }),
      });
      const payload = await response.json() as AutomaticWhatsappState & { pairingCode?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível iniciar a conexão.");
      setAutomatic({ state: payload.state || "connecting", connected: Boolean(payload.connected), canConnect: true });
      setPairingCode(payload.pairingCode || "");
      setNotice(payload.connected ? "WhatsApp já está conectado." : "Código gerado. Abra Aparelhos conectados no seu WhatsApp.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a conexão.");
    } finally {
      setAutomaticConnecting(false);
    }
  }

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (!city) return setNotice("Escolha uma cidade.");
    const nameQuery = businessName.trim();
    if (nameQuery.length === 1) return setNotice("Digite pelo menos 2 letras do nome da barbearia.");
    const query = `${city}, ${uf}`;
    setLoading(true);
    setError("");
    setNotice("");
    setSelected(new Set());
    setVisibleCount(DISPLAY_STEP);
    try {
      const params = new URLSearchParams({ city: query, offset: "0" });
      if (nameQuery) params.set("name", nameQuery);
      const response = await fetch(`/api/affiliate/prospecting/search?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { leads?: Lead[]; displayName?: string; hasMore?: boolean; nextOffset?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível pesquisar agora.");
      const found = Array.isArray(payload.leads) ? payload.leads : [];
      setLeads(found);
      setSearchedCity(payload.displayName || query);
      setSearchedName(nameQuery);
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number(payload.nextOffset) || found.length);
      if (!found.length) setNotice(payload.hasMore ? "Os primeiros resultados já foram contatados ou reservados. Toque em Ver mais barbearias." : "Não encontrei novas barbearias disponíveis nessa busca.");
    } catch (cause) {
      setLeads([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível pesquisar agora.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (visibleLeads.length < leads.length) {
      setVisibleCount((value) => value + DISPLAY_STEP);
      return;
    }
    if (!hasMore || !searchedCity || moreLoading) return;
    setMoreLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ city: searchedCity, offset: String(nextOffset) });
      if (searchedName) params.set("name", searchedName);
      const response = await fetch(`/api/affiliate/prospecting/search?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { leads?: Lead[]; hasMore?: boolean; nextOffset?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar mais barbearias.");
      const incoming = Array.isArray(payload.leads) ? payload.leads : [];
      setLeads((current) => mergeLeads(current, incoming));
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number(payload.nextOffset) || nextOffset + incoming.length);
      setVisibleCount((value) => value + DISPLAY_STEP);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar mais barbearias.");
    } finally {
      setMoreLoading(false);
    }
  }

  function toggle(lead: Lead) {
    if (!lead.whatsappCandidate || !lead.phoneE164) return setNotice("Essa barbearia não tem um celular válido para WhatsApp.");
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lead.id)) next.delete(lead.id); else next.add(lead.id);
      return next;
    });
  }

  function selectVisible() {
    setSelected((current) => new Set([...current, ...visibleLeads.filter((lead) => lead.whatsappCandidate && lead.phoneE164).map((lead) => lead.id)]));
  }

  async function enqueueSelected() {
    if (!selectedLeads.length) return setNotice("Selecione pelo menos uma barbearia com celular válido.");
    if (!automatic.connected) {
      chooseTab("settings");
      return setError("Conecte seu WhatsApp em Configurações antes de colocar contatos na fila.");
    }
    if (approachMode !== "text" && !audioId) {
      chooseTab("settings");
      return setError("Grave e salve seu áudio em Configurações antes de usar esta abordagem.");
    }
    if (!signupUrl) return setError("Seu link de indicação ainda não foi configurado.");

    setQueueing(true);
    setError("");
    setNotice("");
    try {
      const reserveResponse = await fetch("/api/affiliate/prospecting/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reserve", leads: selectedLeads, city: searchedCity }),
      });
      const reservePayload = await reserveResponse.json() as { reserved?: ReservedClaim[]; blocked?: BlockedClaim[]; error?: unknown };
      if (!reserveResponse.ok) throw new Error(readableError(reservePayload.error, "Não foi possível reservar as barbearias."));
      const reservedPhones = new Set((reservePayload.reserved || []).map((item) => item.phoneE164));
      const ready = selectedLeads.filter((lead) => reservedPhones.has(lead.phoneE164));
      if (!ready.length) {
        setSelected(new Set());
        return setNotice(reservePayload.blocked?.length ? "Essas barbearias já foram contatadas ou estão reservadas por outro afiliado." : "Nenhuma barbearia ficou disponível para envio.");
      }

      const queueResponse = await fetch("/api/affiliate/prospecting/whatsapp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "enqueue",
          keys: ready.map((lead) => `phone:${lead.phoneE164}`),
          template: approachMode === "audio_only" || approachMode === "audio_wait" ? "" : message,
          approachMode,
          audioId,
        }),
      });
      const queuePayload = await queueResponse.json() as { jobs?: QueueJob[]; blocked?: BlockedClaim[]; error?: unknown };
      if (!queueResponse.ok) throw new Error(readableError(queuePayload.error, "Não foi possível colocar os contatos na fila."));
      const accepted = new Set((queuePayload.jobs || []).map((job) => job.key));
      setLeads((current) => current.filter((lead) => !accepted.has(`phone:${lead.phoneE164}`)));
      setSelected(new Set());
      setVisibleJobs(30);
      await refreshQueue();
      window.dispatchEvent(new Event("prospecting-history-changed"));
      chooseTab("progress");
      setNotice(`${accepted.size} contato${accepted.size === 1 ? "" : "s"} colocado${accepted.size === 1 ? "" : "s"} na fila.${queuePayload.blocked?.length ? ` ${queuePayload.blocked.length} ficou de fora por já estar indisponível.` : ""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar os envios.");
    } finally {
      setQueueing(false);
    }
  }

  async function updateJob(job: QueueJob, action: "retry" | "confirm_sent" | "cancel_failed") {
    if (jobActionRef.current) return;
    const question = action === "confirm_sent"
      ? `Você conferiu no WhatsApp e ${job.stage === "audio" ? "esse áudio" : "essa mensagem"} foi realmente enviado?`
      : action === "cancel_failed" ? "Descartar esta falha? Esta abordagem não será tentada novamente." : `Tentar enviar ${job.stage === "audio" ? "somente o áudio" : "a mensagem"} novamente?`;
    if (!window.confirm(question)) return;
    jobActionRef.current = true;
    setJobActionId(job.id);
    setError("");
    try {
      const response = await fetch("/api/affiliate/prospecting/queue", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, id: job.id }) });
      const payload = await response.json() as { error?: unknown };
      if (!response.ok) throw new Error(readableError(payload.error, "Não foi possível atualizar esse envio."));
      setNotice(action === "retry" ? "Envio devolvido para a fila." : action === "cancel_failed" ? "Falha descartada." : "Envio confirmado.");
      await refreshQueue();
      window.dispatchEvent(new Event("prospecting-history-changed"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar esse envio.");
    } finally {
      jobActionRef.current = false;
      setJobActionId("");
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <BrandLogo variant="access" />
      <div className={styles.headerText}><strong>Prospecção C|A</strong><span>Olá, {name.split(/\s+/)[0] || name}</span></div>
      <a className={styles.logout} href="/api/affiliate/auth/logout">Sair</a>
    </header>

    <section className={styles.topline}>
      <div><span>{tab === "prospecting" ? "PROSPECÇÃO" : tab === "progress" ? "PROGRESSO" : "CONFIGURAÇÕES"}</span><h1>{tab === "prospecting" ? "Encontre novos clientes" : tab === "progress" ? "Acompanhe seus envios" : "Prepare sua prospecção"}</h1></div>
      <div className={styles.quickStatus}><span className={automatic.connected ? styles.online : styles.offline}>{automaticLoading ? "Conferindo WhatsApp" : automatic.connected ? "WhatsApp conectado" : "WhatsApp desconectado"}</span><small>{modeLabel(approachMode)}</small></div>
    </section>

    <div className={styles.panel} hidden={tab !== "prospecting"}>
      <section className={styles.card}>
        <div className={styles.cardTitle}><div><b>Buscar barbearias</b><span>Escolha a região e encontre contatos disponíveis para você.</span></div></div>
        <form className={styles.searchForm} onSubmit={search}>
          <label><span>Estado</span><select value={uf} onChange={(event) => { setCitiesLoading(true); setUf(event.target.value); setCity(""); }}>{STATES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
          <label><span>Cidade</span><select value={city} onChange={(event) => setCity(event.target.value)} disabled={citiesLoading}><option value="">{citiesLoading ? "Carregando..." : "Selecione"}</option>{cities.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>Nome <small>(opcional)</small></span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Ex.: Kaio Barbearia" maxLength={80} autoComplete="off" /></label>
          <button disabled={loading || citiesLoading || !city}>{loading ? "Buscando..." : businessName.trim() ? "Buscar pelo nome" : "Buscar barbearias"}</button>
        </form>
      </section>

      {(leads.length > 0 || (searchedCity && hasMore)) && <section className={styles.card}>
        <div className={styles.cardTitle}><div><b>Selecionar contatos</b><span>{searchedCity}{searchedName ? ` · “${searchedName}”` : ""} · {leads.length}{hasMore ? "+" : ""} disponíveis</span></div>{visibleLeads.length > 0 && <button type="button" className={styles.secondary} onClick={selectVisible}>Selecionar visíveis</button>}</div>
        {visibleLeads.length > 0 && <div className={styles.leadList}>{visibleLeads.map((lead) => {
          const checked = selected.has(lead.id);
          const enabled = Boolean(lead.whatsappCandidate && lead.phoneE164);
          return <button type="button" className={`${styles.lead} ${checked ? styles.selected : ""}`} onClick={() => toggle(lead)} key={lead.id} disabled={!enabled}>
            <span className={styles.check}>{checked ? "✓" : ""}</span><div><strong>{lead.name}</strong><small>{lead.address || "Endereço não informado"}</small><em>{enabled ? lead.phone : lead.phoneKind === "landline" ? `Fixo: ${lead.phone}` : "Sem celular válido"}</em></div>
          </button>;
        })}</div>}
        {(visibleLeads.length < leads.length || hasMore) && <button type="button" className={styles.more} onClick={loadMore} disabled={moreLoading}>{moreLoading ? "Buscando mais..." : "Ver mais barbearias"}</button>}
      </section>}

      <section className={styles.card}>
        <div className={styles.cardTitle}><div><b>Abordagem deste envio</b><span>Escolha como esses contatos vão receber sua apresentação.</span></div><button type="button" className={styles.textButton} onClick={() => chooseTab("settings")}>Editar conteúdo</button></div>
        <div className={styles.modeGrid}>
          {([['text', 'Mensagem'], ['text_audio', 'Mensagem + áudio'], ['audio_only', 'Somente áudio']] as const).map(([value, label]) => <button type="button" key={value} className={approachMode === value ? styles.modeActive : ""} onClick={() => chooseApproach(value)}><strong>{label}</strong><small>{value === 'text' ? 'Envia só o texto configurado' : value === 'text_audio' ? 'Texto primeiro e áudio depois' : 'Envia apenas o áudio salvo'}</small></button>)}
        </div>
        <div className={styles.queueBar}><div><strong>{selectedLeads.length} selecionada{selectedLeads.length === 1 ? "" : "s"}</strong><span>{automatic.connected ? "WhatsApp pronto" : "Conecte o WhatsApp em Configurações"}{approachMode !== 'text' ? audioId ? " · áudio pronto" : " · falta gravar o áudio" : ""}</span></div><button type="button" onClick={() => void enqueueSelected()} disabled={queueing || selectedLeads.length === 0}>{queueing ? "Colocando na fila..." : "Colocar na fila"}</button></div>
      </section>
    </div>

    <div className={styles.panel} hidden={tab !== "progress"}>
      <section className={styles.metrics} aria-label="Resumo dos envios">
        <article><small>Na fila</small><strong>{queuedCount}</strong></article>
        <article><small>Enviados</small><strong>{sentCount}</strong></article>
        <article><small>Falhas</small><strong>{failedCount}</strong></article>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><div><b>Progresso dos envios</b><span>A fila continua trabalhando mesmo se você sair desta tela.</span></div><button type="button" className={styles.secondary} onClick={() => void refreshQueue()}>Atualizar</button></div>
        {jobs.length === 0 ? <div className={styles.empty}>Nenhum envio na fila ainda.</div> : <div className={styles.jobList}>{jobs.slice(0, visibleJobs).map((job) => <article key={job.id}>
          <div className={styles.jobTop}><div><strong>{job.name}</strong><small>{modeLabel((job.approachMode || "text") as ApproachMode)}</small></div><span>{deliveryLabel(job)}</span></div>
          {job.approachMode === "audio_only" || job.approachMode === "audio_wait" ? <p>{job.audioProviderId ? "Áudio enviado" : job.status === "failed" ? "O áudio falhou" : job.status === "uncertain" ? "Confira o áudio no WhatsApp" : "Áudio aguardando envio"}</p> : job.approachMode === "text_audio" ? <p>{job.textProviderId ? "Mensagem enviada" : "Mensagem aguardando"} · {job.audioProviderId ? "Áudio enviado" : "Áudio aguardando"}</p> : null}
          {job.error && <p className={styles.jobError}>{job.error}</p>}
          {job.status === "uncertain" && <div className={styles.jobActions}><Link href={`https://wa.me/${job.phoneE164}`} target="_blank">Conferir no WhatsApp</Link><button type="button" onClick={() => void updateJob(job, "confirm_sent")} disabled={Boolean(jobActionId)}>{jobActionId === job.id ? "Registrando..." : "Conferi: foi enviado"}</button></div>}
          {job.status === "failed" && <div className={styles.jobActions}><button type="button" onClick={() => void updateJob(job, "retry")} disabled={Boolean(jobActionId)}>{jobActionId === job.id ? "Preparando..." : "Tentar novamente"}</button><button type="button" onClick={() => void updateJob(job, "cancel_failed")} disabled={Boolean(jobActionId)}>Descartar falha</button></div>}
        </article>)}</div>}
        {jobs.length > visibleJobs && <button type="button" className={styles.more} onClick={() => setVisibleJobs((value) => value + 30)}>Ver mais envios</button>}
      </section>

      <AffiliateProspectingHistory signupUrl={signupUrl} />
    </div>

    <div className={styles.panel} hidden={tab !== "settings"}>
      <section className={styles.card}>
        <div className={styles.cardTitle}><div><b>WhatsApp da prospecção</b><span>Este é o número usado para enviar e receber as respostas.</span></div><strong className={automatic.connected ? styles.statusOn : styles.statusOff}>{automaticLoading ? "CONFERINDO" : automatic.connected ? "CONECTADO" : "DESCONECTADO"}</strong></div>
        {!automatic.connected && <>
          <div className={styles.phoneFields}><label>País<select aria-label="País"><option>Brasil (+55)</option></select></label><label>DDD e número<input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} type="tel" autoComplete="tel-national" inputMode="tel" placeholder="(41) 99999-9999" maxLength={20} /></label></div>
          <button type="button" className={styles.primary} onClick={() => void connectAutomatic()} disabled={automaticConnecting || automaticLoading}>{automaticConnecting ? "Gerando código..." : "Conectar meu WhatsApp"}</button>
        </>}
        {pairingCode && <div className={styles.pairingBox}><small>CÓDIGO DE CONEXÃO</small><strong>{pairingCode}</strong><button type="button" className={styles.secondary} onClick={() => void navigator.clipboard.writeText(pairingCode).then(() => setNotice("Código copiado.")).catch(() => setNotice("Selecione o código para copiar."))}>Copiar código</button><p>No WhatsApp: Aparelhos conectados → Conectar aparelho → Conectar com número de telefone.</p></div>}
        <button type="button" className={styles.secondaryWide} onClick={() => void refreshAutomatic(true)} disabled={automaticLoading}>{automaticLoading ? "Conferindo..." : "Conferir conexão"}</button>
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><div><b>Abordagem padrão</b><span>Prepare a mensagem e o áudio que você vai usar nas buscas.</span></div></div>
        <AffiliateProspectingAudio embedded mode={approachMode} onChange={(value) => {
          if (value.mode) chooseApproach(value.mode);
          if (value.audioId !== undefined) setAudioId(value.audioId);
        }} />
        {(approachMode === "text" || approachMode === "text_audio") && <label className={styles.messageField}><span>Mensagem padrão</span><small>Use {"{barbearia}"} e {"{link}"}; o sistema troca automaticamente para cada contato.</small><textarea value={message} onChange={(event) => updateMessage(event.target.value)} rows={5} maxLength={1200} /></label>}
      </section>

      <section className={styles.card}>
        <div className={styles.cardTitle}><div><b>Link do Cortou Anotou</b><span>Quando a abordagem usa link, este é o endereço aplicado automaticamente.</span></div></div>
        <div className={styles.linkValue}>{signupUrl || "Link ainda não configurado"}</div>
      </section>
    </div>

    {(error || notice) && <div className={`${styles.notice} ${error ? styles.error : ""}`} role="status">{error || notice}</div>}
    <AffiliateBottomNav active={tab} onSelect={chooseTab} />
  </main>;
}
