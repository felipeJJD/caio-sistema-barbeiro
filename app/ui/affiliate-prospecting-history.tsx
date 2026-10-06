"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { lockAffiliateScroll } from "../../lib/affiliate-scroll-lock";
import styles from "./affiliate-prospecting-history.module.css";

export type ProspectingQueueJob = {
  id: string; batchId: string; key: string; name: string; phoneE164: string;
  status: string; error?: string; delivery?: string; stage?: string;
  approachMode?: string; textProviderId?: string; audioProviderId?: string;
};
type HistoryView = "returns" | "queued" | "contacted" | "responded" | "interested" | "failed";
type ProspectingContact = {
  key: string; name: string; phone: string; phoneE164: string; city: string; address?: string;
  status: string; qualification?: string; contactedAt?: string | null;
  lastOutboundMessage?: string; lastOutboundAt?: string | null; respondedAt?: string | null;
  lastInboundMessage?: string; lastInboundAt?: string | null; replyCount?: number; contactName?: string; notes?: string; nextStep?: string; stage?: string; followupAt?: string | null;
};
type Props = {
  signupUrl: string;
  jobs?: ProspectingQueueJob[];
  onRefreshQueue?: () => Promise<void>;
  onJobAction?: (job: ProspectingQueueJob, action: "retry" | "confirm_sent" | "cancel_failed") => Promise<void>;
  jobActionId?: string;
  jobActionError?: string;
};

function dateLabel(value?: string | null) {
  if (!value || Number.isNaN(Date.parse(value))) return "";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function deliveryLabel(job: ProspectingQueueJob) {
  if (job.delivery === "read") return "Lida";
  if (job.delivery === "delivered") return "Entregue";
  return ({ pending: "Na fila", leased: "Preparando", sending: "Enviando", sent: "Enviada", failed: "Falhou", uncertain: "Conferir envio", cancelled: "Cancelada" } as Record<string, string>)[job.status] || job.status;
}
function interestLabel(item?: ProspectingContact | null) {
  if (item?.status === "do_not_contact") return "Não tem interesse · não contatar";
  if (item?.qualification === "interested") return "Tem interesse";
  if (item?.stage === "not_now") return "Agora não · pode retornar depois";
  return "Interesse ainda não informado";
}

export function AffiliateProspectingHistory({ signupUrl, jobs = [], onRefreshQueue, onJobAction, jobActionId = "", jobActionError = "" }: Props) {
  const [view, setView] = useState<HistoryView>("returns");
  const [items, setItems] = useState<ProspectingContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionKey, setActionKey] = useState("");
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [visibleCount, setVisibleCount] = useState(10);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<{ key: string; jobId?: string; contact?: ProspectingContact } | null>(null);
  const [detailContact, setDetailContact] = useState<ProspectingContact | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timeline, setTimeline] = useState<Array<{id: string; kind: string; message: string; at: string}>>([]);
  const [draft, setDraft] = useState({contactName: "", notes: "", nextStep: "", stage: "", followupAt: ""});
  const [now, setNow] = useState(() => Date.now());
  const [saved, setSaved] = useState("");
  const detailsOpen = selected !== null;
  const [summary, setSummary] = useState<{ contacted: number; received: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const requestVersion = useRef(0);
  const actionRef = useRef(false);
  const contactsRef = useRef(items);
  useEffect(() => { contactsRef.current = items; }, [items]);
  const invalidateRequests = useCallback(() => { ++requestVersion.current; }, []);
  useEffect(() => {
    const showQueue = () => { setView("queued"); setQuery(""); setVisibleCount(10); };
    window.addEventListener("prospecting-show-queue", showQueue);
    return () => window.removeEventListener("prospecting-show-queue", showQueue);
  }, []);

  const load = useCallback(async (nextView: HistoryView, silent = false, offset = 0) => {
    const version = ++requestVersion.current;
    if (!silent) setLoading(true);
    setError("");
    try {
      const remoteView = nextView === "queued" || nextView === "failed" ? "contacted" : nextView;
      const response = await fetch(`/api/affiliate/prospecting/claims?crm=1&view=${remoteView}&offset=${offset}&query=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const payload = await response.json() as { items?: ProspectingContact[]; hasMore?: boolean; nextOffset?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os contatos.");
      if (version !== requestVersion.current) return;
      setNow(Date.now());
      const incoming = Array.isArray(payload.items) ? payload.items : [];
      setItems(current => {
        if (!offset && !silent) return incoming;
        const merged = new Map((offset ? [...current, ...incoming] : [...incoming, ...current]).map(item => [item.key, item]));
        // Fresh first-page values take precedence without losing loaded older pages.
        if (!offset) incoming.forEach(item => merged.set(item.key, item));
        return [...merged.values()];
      });
      if (!silent || offset || contactsRef.current.length <= incoming.length) {
        setHasMore(Boolean(payload.hasMore));
        setNextOffset(Number(payload.nextOffset) || 0);
      }
    } catch (cause) {
      if (version === requestVersion.current) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os contatos.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [query]);

  const refreshSummary = useCallback(async () => {
    try {
      const response = await fetch("/api/affiliate/prospecting/summary", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setSummary({ contacted: Number(payload.contacted) || 0, received: Number(payload.received) || 0 });
    } catch { /* Mantém os totais conhecidos quando a consulta oscila. */ }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => { void load(view); void refreshSummary(); }, query ? 300 : 0);
    const refresh = () => { if (document.visibilityState !== "hidden") { void load(view, true); void refreshSummary(); } };
    const changed = () => { void load(view); void refreshSummary(); };
    window.addEventListener("prospecting-history-changed", changed);
    const interval = window.setInterval(refresh, 30_000);
    return () => { invalidateRequests(); window.clearTimeout(initial); window.clearInterval(interval); window.removeEventListener("prospecting-history-changed", changed); };
  }, [view, query, load, refreshSummary, invalidateRequests]);

  useEffect(() => {
    if (!detailsOpen) return;
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
    return lockAffiliateScroll();
  }, [detailsOpen]);

  const queuedJobs = jobs.filter(job => ["pending", "leased", "sending"].includes(job.status));
  const failedJobs = jobs.filter(job => ["failed", "uncertain"].includes(job.status));
  const isQueue = view === "queued" || view === "failed";
  const filteredItems = items;
  const filteredJobs = (view === "failed" ? failedJobs : queuedJobs).filter(job => `${job.name} ${job.phoneE164}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR").trim()));
  const currentJob = jobs.find(job => job.id === selected?.jobId) || jobs.find(job => job.key === selected?.key);
  const currentContact = detailContact?.key === selected?.key ? detailContact : items.find(item => item.key === selected?.key) || selected?.contact;
  useEffect(() => {
    const key = selected?.key;
    if (!key) return;
    let active = true;
    void fetch(`/api/affiliate/prospecting/claims?detail=${encodeURIComponent(key)}`, {cache: "no-store"})
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Não foi possível abrir a ficha."); return payload; })
      .then(payload => { if (!active) return; setDetailContact(payload.item); setTimeline(payload.timeline || []); const item = payload.item;
        const date = item.followupAt ? new Date(item.followupAt) : null;
        const local = date ? new Date(date.getTime() - date.getTimezoneOffset()*60000).toISOString().slice(0,16) : "";
        setDraft({contactName:item.contactName || "",notes:item.notes || "",nextStep:item.nextStep || "",stage:item.stage || (item.qualification === "interested" ? "interested" : ""),followupAt:local});
      }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected?.key]);
  async function saveDetails(overrides: Partial<typeof draft> = {}, completeReturn = false) {
    if (!currentContact || !detailContact || actionRef.current) return;
    actionRef.current = true; setActionKey(currentContact.key); setSaved(""); setError("");
    const values = {...draft,...overrides};
    try {
      const response = await fetch("/api/affiliate/prospecting/claims", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"save_contact",key:currentContact.key,...values,followupAt: values.followupAt ? new Date(values.followupAt).toISOString() : null, completeReturn})});
      const payload = await response.json(); if(!response.ok) throw new Error(payload.error || "Não foi possível salvar a ficha.");
      setDetailContact(payload.item); setTimeline(payload.timeline || []); setDraft(values); setSaved(completeReturn ? "Retorno concluído. Você pode agendar o próximo." : "Ficha salva.");
      window.dispatchEvent(new Event("prospecting-history-changed"));
    } catch(cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { actionRef.current=false; setActionKey(""); }
  }
  const detailName = currentContact?.name || currentJob?.name || "Barbearia";
  const detailPhone = (currentContact?.phoneE164 || currentJob?.phoneE164 || "").replace(/\D/g, "");
  const hasReply = Boolean(currentContact?.respondedAt || currentContact?.lastInboundAt);

  function choose(next: HistoryView) {
    setQuery(""); setVisibleCount(10); setError("");
    if (next === view) void load(next); else setView(next);
  }
  function openDetails(value: NonNullable<typeof selected>) { setDetailContact(null); setTimeline([]); setDetailLoading(true); setSaved(""); setError(""); setSelected(value); }
  function closeDetails() { dialogRef.current?.close(); setSelected(null); setDetailContact(null); setTimeline([]); }
  async function showMore() {
    if (isQueue || visibleCount < filteredItems.length) { setVisibleCount(value => value + 10); return; }
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await load(view, true, nextOffset);
    setVisibleCount(value => value + 10); setLoadingMore(false);
  }
  async function classify(item: ProspectingContact, interested: boolean) {
    if (actionRef.current) return;
    if (!interested && !window.confirm(`Bloquear novas abordagens a ${item.name}? Use esta opção somente quando não quiser mais contatar a barbearia.`)) return;
    actionRef.current = true; setActionKey(item.key); setError("");
    try {
      const response = await fetch("/api/affiliate/prospecting/claims", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: interested ? "interested" : "do_not_contact", key: item.key }) });
      const payload = await response.json() as { item?: ProspectingContact; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível atualizar o interesse.");
      const updated = { ...item, ...payload.item, ...(interested ? { qualification: "interested" } : { status: "do_not_contact" }) };
      setDetailContact(updated);
      if (interested) setDraft(current => ({...current,stage:"interested"}));
      setItems(current => current.map(contact => contact.key === item.key ? updated : contact));
      setSelected(current => current?.key === item.key ? { ...current, contact: updated } : current);
      window.dispatchEvent(new Event("prospecting-history-changed"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o interesse."); }
    finally { actionRef.current = false; setActionKey(""); }
  }

  const emptyText = query ? "Nenhuma barbearia encontrada nesta lista." : ({ returns: "Nenhum retorno agendado. Abra uma ficha e escolha a próxima data.", queued: "Nenhuma barbearia aguardando envio.", failed: "Nenhum envio com falha para conferir.", responded: "Nenhuma mensagem recebida ainda.", interested: "Nenhuma barbearia marcada com interesse ainda.", contacted: "Nenhuma barbearia contatada ainda." })[view];

  return <section className={styles.shell} aria-label="Progresso e contatos da prospecção">
    <div className={styles.metrics}>
      <button type="button" className={view === "queued" ? styles.metricActive : ""} onClick={() => choose("queued")}><small>Na fila</small><strong>{queuedJobs.length}</strong><span>Ver barbearias</span></button>
      <button type="button" className={view === "contacted" ? styles.metricActive : ""} onClick={() => choose("contacted")}><small>Enviadas</small><strong>{summary?.contacted ?? items.filter(item => item.contactedAt).length}</strong><span>Ver contatos</span></button>
      <button type="button" className={view === "responded" ? styles.metricActive : ""} onClick={() => choose("responded")}><small>Recebidas</small><strong>{summary?.received ?? items.reduce((total, item) => total + (item.replyCount || 0), 0)}</strong><span>Ver mensagens</span></button>
    </div>
    <div className={styles.card}>
      <div className={styles.heading}><div><span>SUAS BARBEARIAS</span><h2>Contatos e mensagens</h2><p>Toque em uma barbearia para ver o envio, a resposta e o interesse.</p></div><button type="button" onClick={() => { void load(view); void refreshSummary(); void onRefreshQueue?.(); }} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button></div>
      <div className={styles.tabs} aria-label="Filtrar contatos">
        {([["returns", "Retornos"], ["contacted", "Já contatadas"], ["responded", "Mensagens recebidas"], ["interested", "Tem interesse"], ["queued", "Na fila"], ["failed", `Falhas${failedJobs.length ? ` (${failedJobs.length})` : ""}`]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} className={view === key ? styles.active : ""} onClick={() => choose(key)}>{label}</button>)}
      </div>
      <label className={styles.search}><span>Buscar no histórico</span><input type="search" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(10); }} placeholder="Nome ou telefone da barbearia" /></label>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading && !isQueue && <div className={styles.empty}>Carregando contatos...</div>}
      {(isQueue || !loading) && <div className={styles.list}>
        {isQueue ? filteredJobs.slice(0, visibleCount).map(job => <button type="button" className={styles.contactRow} key={job.id} onClick={() => openDetails({ key: job.key, jobId: job.id })}><span className={styles.avatar}>{job.name.slice(0, 1).toUpperCase()}</span><span className={styles.rowText}><strong>{job.name}</strong><small>{job.phoneE164}</small><em>{deliveryLabel(job)}</em></span><b aria-hidden="true">›</b></button>) : filteredItems.slice(0, visibleCount).map(item => <button type="button" className={styles.contactRow} key={item.key} onClick={() => openDetails({ key: item.key, contact: item })}><span className={styles.avatar}>{item.name.slice(0, 1).toUpperCase()}</span><span className={styles.rowText}><strong>{item.name || "Barbearia"}</strong><small>{item.city || item.phone || item.phoneE164}</small><em>{item.lastInboundAt || item.respondedAt ? "Mensagem recebida" : "Abordagem enviada"} · {interestLabel(item)}{item.followupAt ? ` · ${Date.parse(item.followupAt) < now ? "Retorno pendente" : "Retornar"} ${dateLabel(item.followupAt)}` : ""}</em></span><b aria-hidden="true">›</b></button>)}
        {(isQueue ? filteredJobs.length === 0 : !error && filteredItems.length === 0) && <div className={styles.empty}>{emptyText}</div>}
      </div>}
      {(isQueue ? visibleCount < filteredJobs.length : !loading && (visibleCount < filteredItems.length || hasMore)) && <button type="button" className={styles.moreButton} onClick={() => void showMore()} disabled={loadingMore}>{loadingMore ? "Carregando..." : "Ver mais barbearias"}</button>}
      {view === "returns" && <p className={styles.helper}>Retornos pendentes primeiro, depois os próximos agendamentos. As mensagens são enviadas por você.</p>}
    </div>
    <dialog ref={dialogRef} className={styles.detail} onCancel={closeDetails} onClick={event => { if (event.target === event.currentTarget) closeDetails(); }} aria-label={`Detalhes de ${detailName}`}>
      <div className={styles.detailHeader}><div><span>BARBEARIA</span><h2>{detailName}</h2></div><button type="button" onClick={closeDetails} aria-label="Fechar detalhes">×</button></div>
      <div className={styles.detailBody}>
        <p className={styles.helper}>{currentContact?.phone || detailPhone}{currentContact?.city ? ` · ${currentContact.city}` : ""}</p>
        {currentContact?.address && <p className={styles.helper}>{currentContact.address}</p>}
        <span className={styles.respondedBadge}>{currentJob ? deliveryLabel(currentJob) : "Abordagem enviada"}</span>
        <p className={styles.interestStatus}>{interestLabel(currentContact)}</p>
        {currentJob && <p className={styles.helper}>{["audio_only", "audio_wait"].includes(currentJob.approachMode || "") ? "Somente áudio" : currentJob.approachMode === "text_audio" ? "Mensagem + áudio" : "Mensagem"}{currentJob.audioProviderId ? " · áudio enviado" : ""}</p>}
        {currentJob?.error && <p className={styles.error}>{currentJob.error}</p>}
        {detailLoading && <p className={styles.helper}>Carregando ficha...</p>}
        {detailContact && <form className={styles.contactForm} onSubmit={event => {event.preventDefault(); void saveDetails();}}>
          <label>Responsável<input value={draft.contactName} maxLength={120} onChange={event=>setDraft({...draft,contactName:event.target.value})} placeholder="Nome de quem atende" /></label>
          <label>Etapa de acompanhamento<select value={draft.stage} onChange={event=>setDraft({...draft,stage:event.target.value})}>
            <option value="">Acompanhar</option><option value="conversation">Em conversa</option><option value="interested">Tem interesse</option><option value="link_sent">Link compartilhado</option><option value="trial">Em teste</option><option value="paying">Virou cliente</option><option value="not_now">Agora não</option>
          </select></label>
          <p className={styles.helper}>Esta etapa é registrada por você. Pagamentos e comissões continuam em Indicações.</p>
          <label>Anotações<textarea rows={3} value={draft.notes} maxLength={5000} onChange={event=>setDraft({...draft,notes:event.target.value})} placeholder="O que conversaram, dúvidas e observações" /></label>
          <label>Próxima ação<input value={draft.nextStep} maxLength={500} onChange={event=>setDraft({...draft,nextStep:event.target.value})} placeholder="Ex.: explicar a agenda e enviar o link" /></label>
          <label>Retornar em<input id="affiliate-followup-field" type="datetime-local" value={draft.followupAt} disabled={currentContact?.status === "do_not_contact"} onChange={event=>setDraft({...draft,followupAt:event.target.value})} /></label>
          <div className={styles.contactActions}><button className={styles.interestButton} disabled={Boolean(actionKey)}>{actionKey ? "Salvando..." : "Salvar ficha"}</button>
          {currentContact?.followupAt && <button type="button" disabled={Boolean(actionKey)} onClick={()=>void saveDetails({followupAt:""},true)}>Concluir retorno</button>}</div>
          {saved && <p role="status" className={styles.helper}>{saved}</p>}
        </form>}
        {timeline.length > 0 && <><div className={styles.replyLabel}>HISTÓRICO DO CONTATO</div><p className={styles.helper}>Últimos 100 registros. Mensagens anteriores à atualização aparecem quando ainda estão disponíveis.</p>{timeline.map(event=><article key={event.id}><div className={styles.replyLabel}>{event.kind === "inbound" ? "RECEBIDA" : event.kind === "outbound" ? "ENVIADA" : "ACOMPANHAMENTO"} · {dateLabel(event.at)}</div><p className={styles.message}>{event.message || "Mensagem registrada"}</p></article>)}</>}
        {timeline.length === 0 && currentContact?.lastOutboundMessage && <><div className={styles.replyLabel}>ÚLTIMA ABORDAGEM · {dateLabel(currentContact.lastOutboundAt || currentContact.contactedAt)}</div><p className={styles.message}>{currentContact.lastOutboundMessage}</p></>}
        {timeline.length === 0 && hasReply ? <><div className={styles.replyLabel}>MENSAGEM RECEBIDA · {dateLabel(currentContact?.lastInboundAt || currentContact?.respondedAt)}</div><p className={styles.message}>{currentContact?.lastInboundMessage || "Mensagem recebida"}</p></> : !hasReply && <p className={styles.helper}>{currentJob && ["pending", "leased", "sending"].includes(currentJob.status) ? "Esta barbearia está na fila. O status será atualizado conforme o envio avançar." : "Ainda não há resposta registrada."}</p>}
        {error && <p className={styles.error} role="alert">{error}</p>}
        {jobActionError && <p className={styles.error} role="alert">{jobActionError}</p>}
        <div className={styles.contactActions}>
          {detailPhone && <a href={`https://wa.me/${detailPhone}`} target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>}
          {hasReply && signupUrl && currentContact?.status !== "do_not_contact" && <a href={`https://wa.me/${detailPhone}?text=${encodeURIComponent(`Claro! Aqui está o link para conhecer o Cortou Anotou: ${signupUrl}`)}`} target="_blank" rel="noopener noreferrer">Enviar link do Cortou Anotou</a>}
          {currentContact && currentContact.status !== "do_not_contact" && <>
            {hasReply && currentContact.qualification !== "interested" && <button type="button" className={styles.interestButton} onClick={() => void saveDetails({stage:"interested"})} disabled={Boolean(actionKey) || !detailContact}>{actionKey ? "Salvando..." : "Sim, tem interesse"}</button>}
            <button type="button" disabled={Boolean(actionKey) || !detailContact} onClick={() => void saveDetails({stage:"not_now"})}>Agora não</button>
            <button type="button" disabled={Boolean(actionKey) || !detailContact} onClick={() => {document.getElementById("affiliate-followup-field")?.focus();}}>Retornar depois</button>
            <button type="button" onClick={() => void classify(currentContact, false)} disabled={Boolean(actionKey)}>{actionKey ? "Salvando..." : "Não contatar mais"}</button>
          </>}
          {currentJob?.status === "uncertain" && <button type="button" onClick={() => void onJobAction?.(currentJob, "confirm_sent")} disabled={Boolean(jobActionId)}>{jobActionId ? "Registrando..." : "Conferi no WhatsApp: foi enviado"}</button>}
          {currentJob?.status === "failed" && <><button type="button" onClick={() => void onJobAction?.(currentJob, "retry")} disabled={Boolean(jobActionId)}>{jobActionId ? "Preparando..." : currentJob.stage === "audio" ? "Tentar somente o áudio" : "Tentar novamente"}</button><button type="button" onClick={() => void onJobAction?.(currentJob, "cancel_failed")} disabled={Boolean(jobActionId)}>Descartar falha</button></>}
        </div>
      </div>
    </dialog>
  </section>;
}
