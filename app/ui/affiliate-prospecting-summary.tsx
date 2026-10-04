"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./affiliate-prospecting-summary.module.css";

type Summary = {
  contacted: number;
  received: number;
  recent: Array<{ name: string; received?: boolean }>;
};

export function AffiliateProspectingSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/affiliate/prospecting/summary", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as Summary & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a prospecção.");
      setSummary({
        contacted: Number(payload.contacted || 0),
        received: Number(payload.received || 0),
        recent: Array.isArray(payload.recent) ? payload.recent.slice(0, 5) : [],
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar a prospecção.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const onChange = () => void load(true);
    window.addEventListener("prospecting-history-changed", onChange);
    return () => window.removeEventListener("prospecting-history-changed", onChange);
  }, [load]);

  return <section className={styles.shell} aria-label="Resumo da prospecção">
    <div className={styles.heading}>
      <div><span>PROSPECÇÃO</span><h2>Contatos feitos pelo C|A</h2><p>Separado das indicações que já viraram cadastro.</p></div>
      <Link href="/afiliado/prospeccao">Abrir prospecção →</Link>
    </div>

    {loading && <div className={styles.loading}>Carregando resumo...</div>}
    {!loading && error && <div className={styles.error}>{error}<button type="button" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Tentando..." : "Tentar novamente"}</button></div>}
    {!loading && !error && summary && <>
      <div className={styles.metrics}>
        <article><small>CONTATOS FEITOS</small><strong>{summary.contacted}</strong><span>Barbearias abordadas</span></article>
        <article><small>MENSAGENS RECEBIDAS</small><strong>{summary.received}</strong><span>Retornos registrados pelo WhatsApp</span></article>
      </div>
      <div className={styles.recent}>
        <div className={styles.recentTitle}><strong>Contatos recentes</strong><button type="button" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Atualizando..." : "Atualizar"}</button></div>
        {summary.recent.length ? <div className={styles.names}>{summary.recent.map((item, index) => <span key={`${item.name}-${index}`}>{item.name}{item.received ? <b>mensagem recebida</b> : null}</span>)}</div> : <p>Nenhum contato de prospecção ainda.</p>}
      </div>
    </>}
  </section>;
}
