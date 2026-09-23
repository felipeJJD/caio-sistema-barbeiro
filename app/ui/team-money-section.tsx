"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { TeamMoneyData, TeamMoneyEntry, TeamMoneyRow } from "../../db/team-money";
import { showAppToast } from "./app-toast";

type Post = (body: Record<string, string | number | boolean>, success: string) => Promise<boolean>;

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const today = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date());
};

function paymentDayLabel(day: number) {
  return day === 31 ? "último dia do mês (ou dia 31)" : `dia ${day}`;
}

function pdfFilename(response: Response, id: number) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf8) {
    try {
      return decodeURIComponent(utf8.replace(/["']/g, ""));
    } catch {
      // Se o nome vier malformado, usa o nome simples abaixo.
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1]?.trim();
  return plain || `fechamento-${id}.pdf`;
}

function isAppleMobileDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

async function downloadPdf(id: number) {
  try {
    const response = await fetch(`/api/team-money/closures/${id}/pdf`, { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/");
      return;
    }
    if (!response.ok) {
      let message = "Não foi possível baixar o PDF agora.";
      try {
        const payload = await response.json() as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // Mantém a mensagem padrão quando a resposta não for JSON.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const filename = pdfFilename(response, id);
    const file = new File([blob], filename, { type: "application/pdf" });
    const shareData: ShareData = { files: [file], title: "Fechamento do Cortou Anotou" };

    if (
      isAppleMobileDevice()
      && typeof navigator.share === "function"
      && typeof navigator.canShare === "function"
      && navigator.canShare(shareData)
    ) {
      try {
        showAppToast("No iPhone, escolha Salvar em Arquivos para guardar o PDF.");
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    const downloadBlob = new Blob([blob], { type: "application/octet-stream" });
    const url = URL.createObjectURL(downloadBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch (error) {
    showAppToast(error instanceof Error ? error.message : "Não foi possível baixar o PDF agora.");
  }
}

async function fetchTeamMoneyData() {
  const response = await fetch("/api/team-money", { cache: "no-store" });
  if (response.status === 401) {
    window.location.assign("/");
    return null;
  }
  const payload = await response.json() as { data?: TeamMoneyData; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error ?? "Não foi possível carregar a Minha Grana.");
  return payload.data;
}

export function TeamMoneySection({ owner, post, pending: outerPending = false }: { owner: boolean; post?: Post; pending?: boolean }) {
  const [data, setData] = useState<TeamMoneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<TeamMoneyEntry | null>(null);

  async function load() {
    try {
      const nextData = await fetchTeamMoneyData();
      if (!nextData) return;
      setData(nextData);
      setFeedback(null);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível carregar agora.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchTeamMoneyData()
      .then((nextData) => {
        if (!active || !nextData) return;
        setData(nextData);
        setFeedback(null);
      })
      .catch((error) => {
        if (active) setFeedback(error instanceof Error ? error.message : "Não foi possível carregar agora.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const rows = data?.rows ?? [];
  const openEntries = useMemo(() => rows.flatMap((row) => row.openEntries).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id), [rows]);

  async function teamMoneyAction(body: Record<string, string | number | boolean>) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/team-money", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { data?: TeamMoneyData; error?: string; closureId?: number };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Não foi possível concluir.");
      setData(payload.data);
      return payload;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível concluir.");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function savePaymentDay(event: FormEvent<HTMLFormElement>, row: TeamMoneyRow) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await teamMoneyAction({ action: "save-payment-day", teamMemberId: row.teamMemberId, paymentDay: Number(form.get("paymentDay")) });
    if (result) showAppToast(`Dia previsto de ${row.teamMemberName} atualizado.`);
  }

  async function closeCycle(row: TeamMoneyRow) {
    if (!window.confirm(`Fechar o pagamento de ${row.teamMemberName} em ${money(row.currentBalanceCents)}? Tudo que está em aberto entra neste fechamento e o saldo atual volta para R$ 0,00.`)) return;
    const result = await teamMoneyAction({ action: "close", teamMemberId: row.teamMemberId });
    if (!result?.closureId) return;
    showAppToast("Fechamento concluído. O saldo voltou a zero e o PDF está pronto.");
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post) return;
    const form = new FormData(event.currentTarget);
    const teamMemberId = Number(form.get("teamMemberId"));
    const row = rows.find((item) => item.teamMemberId === teamMemberId);
    const kind = String(form.get("kind") ?? "Vale");
    const ok = await post({
      action: "team-payment",
      id: editing?.id ?? 0,
      teamMemberId,
      occurredAt: String(form.get("occurredAt") ?? today()),
      kind,
      reason: String(form.get("reason") ?? ""),
      valueCents: Math.round(Number(form.get("value") ?? 0) * 100),
    }, editing ? "Lançamento atualizado." : `${kind} registrado para ${row?.teamMemberName ?? "o funcionário"}.`);
    if (ok) {
      setEditing(null);
      await load();
    }
  }

  async function removeEntry(entry: TeamMoneyEntry) {
    if (!post) return;
    if (!window.confirm(`Excluir ${entry.kind.toLowerCase()} de ${money(entry.valueCents)} de ${entry.teamMemberName}?`)) return;
    const ok = await post({ action: "delete-team-payment", id: entry.id }, "Lançamento excluído.");
    if (ok) {
      if (editing?.id === entry.id) setEditing(null);
      await load();
    }
  }

  if (loading) return <section className="panel team-money-loading">Carregando...</section>;

  if (!owner) {
    const row = rows[0];
    return <div className="team-money-shell">
      {feedback && <div className="notice error">{feedback}</div>}
      {row ? <>
        <section className="panel my-money-hero">
          <span>MINHA GRANA</span>
          <h2>{money(row.currentBalanceCents)}</h2>
          <p>Saldo atual a receber. Comissões e 100% das gorjetas entram automaticamente aqui.</p>
          <div className="my-money-meta">
            <div><small>Vales recebidos</small><strong>{money(row.valeCents)}</strong></div>
            <div><small>Pagamentos recebidos</small><strong>{money(row.paidCents)}</strong></div>
            <div><small>Pagamento previsto</small><strong>{paymentDayLabel(row.paymentDay)}</strong></div>
          </div>
          {row.lastClosure && <small className="last-close">Último fechamento: {date(row.lastClosure.periodEndDate)} · {money(row.lastClosure.settlementCents)}</small>}
        </section>
        <section className="panel">
          <div className="team-money-heading"><div><span>EM ABERTO</span><h3>Movimentações desde o último fechamento</h3></div><b>{row.openRecordCount} atendimento(s)</b></div>
          <div className="team-money-entry-list">
            {row.openEntries.map((entry) => <article key={entry.id}><span className={entry.kind === "Vale" ? "vale" : "payment"}>{entry.kind}</span><div><strong>{date(entry.occurredAt)}</strong><small>{entry.reason}</small></div><b>- {money(entry.valueCents)}</b></article>)}
            {!row.openEntries.length && <p className="team-money-empty">Nenhum vale ou pagamento em aberto.</p>}
          </div>
        </section>
        {data && <ClosureHistory data={data} />}
      </> : <section className="panel team-money-loading">Seu cadastro não possui saldo de equipe.</section>}
    </div>;
  }

  return <div className="team-money-shell">
    {feedback && <div className="notice error">{feedback}</div>}
    <section className="team-money-cards">
      {rows.map((row) => <article className="panel team-money-card" key={row.teamMemberId}>
        <header><div className="team-money-avatar">{row.teamMemberName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</div><div><h2>{row.teamMemberName}</h2><small>{row.role}</small></div></header>
        <div className="team-money-balance"><small>SALDO ATUAL</small><strong>{money(row.currentBalanceCents)}</strong><span>Inclui comissões e 100% das gorjetas.</span></div>
        <dl>
          <div><dt>Vales</dt><dd>{money(row.valeCents)}</dd></div>
          <div><dt>Pagamentos</dt><dd>{money(row.paidCents)}</dd></div>
        </dl>
        <div className="team-money-close-meta">
          <span>Último fechamento</span>
          <strong>{row.lastClosure ? `${date(row.lastClosure.periodEndDate)} · ${money(row.lastClosure.settlementCents)}` : "Nenhum fechamento ainda"}</strong>
        </div>
        <form className="payment-day-form" onSubmit={(event) => savePaymentDay(event, row)}>
          <label>Dia previsto de pagamento<input name="paymentDay" type="number" min="1" max="31" defaultValue={row.paymentDay} /></label>
          <button type="submit" disabled={pending || outerPending}>Salvar dia</button>
        </form>
        <button className="primary-button close-payment-button" type="button" disabled={pending || outerPending || (row.openRecordCount === 0 && row.openEntries.length === 0)} onClick={() => void closeCycle(row)}>Fechar pagamento</button>
      </article>)}
      {!rows.length && <section className="panel team-money-loading">Cadastre um funcionário para controlar vales e pagamentos.</section>}
    </section>

    <section className="team-money-layout">
      <div className="panel">
        <div className="team-money-heading"><div><span>EM ABERTO</span><h3>Vales e pagamentos</h3></div><b>{openEntries.length} lançamento(s)</b></div>
        <div className="team-money-entry-list">
          {openEntries.map((entry) => <article key={entry.id}><span className={entry.kind === "Vale" ? "vale" : "payment"}>{entry.kind}</span><div><strong>{entry.teamMemberName}</strong><small>{date(entry.occurredAt)} · {entry.reason}</small></div><b>{money(entry.valueCents)}</b><div className="team-money-actions"><button type="button" onClick={() => setEditing(entry)}>Editar</button><button type="button" className="danger" disabled={pending || outerPending} onClick={() => void removeEntry(entry)}>Excluir</button></div></article>)}
          {!openEntries.length && <p className="team-money-empty">Nenhum vale ou pagamento em aberto.</p>}
        </div>
      </div>

      <section className="panel team-money-form">
        <div className="team-money-heading"><div><span>{editing ? "EDITANDO" : "NOVO"}</span><h3>{editing ? "Editar lançamento" : "Vale ou pagamento"}</h3></div></div>
        {rows.length ? <form onSubmit={submitEntry} key={editing?.id ?? "new"}>
          <label>Funcionário<select name="teamMemberId" defaultValue={editing?.teamMemberId ?? rows[0]?.teamMemberId}>{rows.map((row) => <option value={row.teamMemberId} key={row.teamMemberId}>{row.teamMemberName}</option>)}</select></label>
          <label>Data<input name="occurredAt" type="date" defaultValue={editing?.occurredAt ?? today()} required /></label>
          <label>Tipo<select name="kind" defaultValue={editing?.kind ?? "Vale"}><option>Vale</option><option>Pagamento</option></select></label>
          <label>Valor (R$)<input name="value" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={editing ? editing.valueCents / 100 : undefined} required /></label>
          <label>Motivo<input name="reason" maxLength={160} placeholder="Ex.: adiantamento" defaultValue={editing?.reason ?? ""} required /></label>
          <button className="primary-button" disabled={pending || outerPending}>{editing ? "Salvar alterações" : "Salvar lançamento"}</button>
          {editing && <button type="button" className="cancel-button" onClick={() => setEditing(null)}>Cancelar edição</button>}
        </form> : <p className="team-money-empty">Cadastre um funcionário antes de lançar valores.</p>}
      </section>
    </section>

    {data && <ClosureHistory data={data} />}
  </div>;
}

function ClosureHistory({ data }: { data: TeamMoneyData }) {
  const visible = data.closures.filter((closure) => !closure.isBaseline);
  return <section className="panel closure-history">
    <div className="team-money-heading"><div><span>HISTÓRICO</span><h3>Fechamentos</h3></div><b>{visible.length} fechamento(s)</b></div>
    <div className="closure-list">
      {visible.map((closure) => <article key={closure.id}><div><strong>{closure.teamMemberName}</strong><small>{date(closure.periodStartDate)} a {date(closure.periodEndDate)} · {closure.recordCount} atendimento(s)</small></div><b>{money(closure.settlementCents)}</b><button type="button" onClick={() => void downloadPdf(closure.id)}>Baixar PDF</button></article>)}
      {!visible.length && <p className="team-money-empty">Os próximos fechamentos aparecerão aqui com o PDF pronto.</p>}
    </div>
  </section>;
}