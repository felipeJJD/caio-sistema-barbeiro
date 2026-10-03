"use client";

import { useCallback, useEffect, useState } from "react";
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

export function AffiliateProspectingHistory() {
  const [view, setView] = useState<HistoryView>("contacted");
  const [items, setItems] = useState<ProspectingContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (nextView: HistoryView, silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/affiliate/prospecting/claims?view=${nextView}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { items?: ProspectingContact[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar o histórico.");
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (cause) {
      if (!silent) setItems([]);
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar o histórico.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(view), 0);
    if (view !== "responded") return () => window.clearTimeout(initial);
    const refresh = window.setInterval(() => void load("responded", true), 30_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(refresh);
    };
  }, [view, load]);

  function choose(nextView: HistoryView) {
    if (nextView === view) {
      void load(nextView);
      return;
    }
    setView(nextView);
  }

  return <section className={styles.shell}>
    <div className={styles.card}>
      <div className={styles.heading}>
        <div>
          <span>HISTÓRICO DA PROSPECÇÃO</span>
          <h2>Acompanhe o que já foi enviado</h2>
          <p>Sem funil: aqui ficam apenas os contatos feitos e quem respondeu.</p>
        </div>
        <button type="button" onClick={() => void load(view)} disabled={loading}>Atualizar</button>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Histórico da prospecção">
        <button type="button" className={view === "contacted" ? styles.active : ""} onClick={() => choose("contacted")}>Já contatadas</button>
        <button type="button" className={view === "responded" ? styles.active : ""} onClick={() => choose("responded")}>Responderam</button>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <div className={styles.empty}>Carregando...</div>}
      {!loading && !error && items.length === 0 && <div className={styles.empty}>{view === "responded" ? "Nenhuma barbearia respondeu ainda." : "Nenhuma barbearia contatada ainda."}</div>}

      {!loading && items.length > 0 && <div className={styles.list}>{items.map((item) => {
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
            <div className={styles.replyLabel}>RESPOSTA RECEBIDA{Number(item.replyCount) > 1 ? ` · ${item.replyCount} mensagens` : ""}</div>
            <p className={styles.message}>{item.lastInboundMessage || "Mensagem recebida"}</p>
            <p className={styles.helper}>Esse contato já está fora de novos disparos automáticos.</p>
          </> : <>
            {item.respondedAt && <span className={styles.respondedBadge}>Já respondeu</span>}
            {item.lastOutboundMessage && <p className={styles.message}>{item.lastOutboundMessage}</p>}
          </>}
        </article>;
      })}</div>}
    </div>
  </section>;
}
