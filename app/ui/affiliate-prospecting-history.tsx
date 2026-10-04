"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./affiliate-prospecting-history.module.css";

type HistoryView = "contacted" | "responded";

type ProspectingContact = {
  key: string;
  name: string;
  phone: string;
  phoneE164: string;
  city: string;
  status: string;
  contactedAt?: string | null;
  lastOutboundMessage?: string;
  lastOutboundAt?: string | null;
  respondedAt?: string | null;
  lastInboundMessage?: string;
  lastInboundAt?: string | null;
  replyCount?: number;
};

function dateLabel(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function AffiliateProspectingHistory({signupUrl}:{signupUrl:string}) {
  const [view, setView] = useState<HistoryView>("contacted");
  const [items, setItems] = useState<ProspectingContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [visibleCount, setVisibleCount] = useState(5);

  const load = useCallback(async (nextView: HistoryView, silent = false, offset = 0) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/affiliate/prospecting/claims?view=${nextView}&offset=${offset}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { items?: ProspectingContact[]; hasMore?:boolean; nextOffset?:number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o histórico.");
      const incoming = Array.isArray(payload.items) ? payload.items : [];
      setItems(current => offset ? [...current, ...incoming] : incoming);
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number(payload.nextOffset) || 0);
    } catch (cause) {
      if (!silent) setItems([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o histórico.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(view), 0);
    const onChange=()=>void load(view,true);
    window.addEventListener("prospecting-history-changed",onChange);
    const refresh = window.setInterval(() => void load(view, true), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
      window.removeEventListener("prospecting-history-changed",onChange);
    };
  }, [view, load]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);

  function choose(nextView: HistoryView) {
    if (nextView === view) {
      void load(nextView);
      return;
    }
    setVisibleCount(5);
    setView(nextView);
  }

  async function showMore() {
    if (visibleCount < items.length) {
      setVisibleCount(value => value + 5);
      return;
    }
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await load(view, true, nextOffset);
    setVisibleCount(value => value + 5);
    setLoadingMore(false);
  }

  async function stopContact(item:ProspectingContact) {
    if(!window.confirm(`Marcar ${item.name} para não receber novas abordagens?`)) return;
    try {
      const response=await fetch('/api/affiliate/prospecting/claims',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'do_not_contact',key:item.key})});
      if(!response.ok)throw new Error('Não foi possível atualizar o contato.');
      await load(view,true);
    }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível atualizar o contato.');}
  }

  return <section className={styles.shell}>
    <div className={styles.card}>
      <div className={styles.heading}>
        <div>
          <span>HISTÓRICO DA PROSPECÇÃO</span>
          <h2>Contatos e mensagens</h2>
          <p>Somente o que aconteceu na Prospecção, separado dos cadastros por indicação.</p>
        </div>
        <button type="button" onClick={() => void load(view)} disabled={loading}>{loading ? "Atualizando..." : "Atualizar"}</button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Histórico da prospecção">
        <button type="button" className={view === "contacted" ? styles.active : ""} onClick={() => choose("contacted")}>Já contatadas</button>
        <button type="button" className={view === "responded" ? styles.active : ""} onClick={() => choose("responded")}>Mensagens recebidas</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <div className={styles.empty}>Carregando...</div>}
      {!loading && !error && items.length === 0 && <div className={styles.empty}>{view === "responded" ? "Nenhuma mensagem recebida ainda." : "Nenhuma barbearia contatada ainda."}</div>}

      {!loading && visibleItems.length > 0 && <div className={styles.list}>{visibleItems.map((item) => {
        const when = view === "responded" ? dateLabel(item.lastInboundAt || item.respondedAt) : dateLabel(item.lastOutboundAt || item.contactedAt);
        return <article className={styles.item} key={item.key}>
          <div className={styles.itemTop}>
            <div>
              <strong>{item.name || "Barbearia"}</strong>
              <small>{item.phone || item.phoneE164}{item.city ? ` · ${item.city}` : ""}</small>
            </div>
            {when && <time>{when}</time>}
          </div>

          {view === "responded" ? <>
            <div className={styles.replyLabel}>MENSAGEM RECEBIDA{Number(item.replyCount) > 1 ? ` · ${item.replyCount} mensagens` : ""}</div>
            <p className={styles.message}>{item.lastInboundMessage || "Mensagem recebida"}</p>
            <p className={styles.helper}>Esse contato continua bloqueado para novos disparos. A mensagem pode ser humana ou automática do WhatsApp.</p>
          </> : <>
            {item.respondedAt && <span className={styles.respondedBadge}>Mensagem recebida</span>}
            {item.lastOutboundMessage && <p className={styles.message}>{item.lastOutboundMessage}</p>}
          </>}
          <div className={styles.contactActions}><a href={`https://wa.me/${item.phoneE164}`} target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>{view==='responded'&&item.status!=='do_not_contact'&&signupUrl&&<a href={`https://wa.me/${item.phoneE164}?text=${encodeURIComponent(`Claro! Aqui está o link para conhecer o Cortou Anotou: ${signupUrl}`)}`} target="_blank" rel="noopener noreferrer">Enviar link do Cortou Anotou</a>}{item.status==="do_not_contact"?<span>Não contatar</span>:<button type="button" onClick={()=>void stopContact(item)}>Não tem interesse</button>}</div>
        </article>;
      })}</div>}
      {!loading && (visibleCount < items.length || hasMore) && <button type="button" className={styles.moreButton} onClick={() => void showMore()} disabled={loadingMore}>{loadingMore ? "Carregando..." : "Ver mais contatos"}</button>}
    </div>
  </section>;
}
