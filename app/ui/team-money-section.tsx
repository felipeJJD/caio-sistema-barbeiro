"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { TeamMoneyData, TeamMoneyEntry, TeamMoneyRow } from "../../db/team-money";
import { showAppToast } from "./app-toast";
import { AppIcon } from "./app-icon";

type Post = (body: Record<string, string | number | boolean>, success: string) => Promise<boolean>;

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const today = () => {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
  return formatter.format(new Date());
};

function paymentDayLabel(day: number) {
  return day === 31 ? "último dia do mês" : `dia ${day}`;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CA";
}

function MemberAvatar({ row, large = false }: { row: TeamMoneyRow; large?: boolean }) {
  if (row.photoUrl) return <img className={`team-money-v2-avatar${large ? " large" : ""}`} src={row.photoUrl} alt={`Foto de ${row.teamMemberName}`} loading="lazy" />;
  return <span className={`team-money-v2-avatar fallback${large ? " large" : ""}`}>{initials(row.teamMemberName)}</span>;
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
  if (!response.ok || !payload.data) throw new Error(payload.error ?? "Não foi possível carregar os valores da equipe.");
  return payload.data;
}

export function TeamMoneySection({ owner, post, pending: outerPending = false }: { owner: boolean; post?: Post; pending?: boolean }) {
  const [data, setData] = useState<TeamMoneyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [editing, setEditing] = useState<TeamMoneyEntry | null>(null);
  const [valeFormOpen, setValeFormOpen] = useState(false);

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

  const selectedRow = owner
    ? rows.find((row) => row.teamMemberId === selectedMemberId) ?? rows[0]
    : rows[0];

  const selectedClosures = useMemo(
    () => data?.closures.filter((closure) => !closure.isBaseline && (!selectedRow || closure.teamMemberId === selectedRow.teamMemberId)) ?? [],
    [data?.closures, selectedRow],
  );

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
    if (!window.confirm(`Fechar o período de ${row.teamMemberName} em ${money(row.currentBalanceCents)}? O valor atual será registrado como recebido e o próximo período começará zerado.`)) return;
    const result = await teamMoneyAction({ action: "close", teamMemberId: row.teamMemberId });
    if (!result?.closureId) return;
    showAppToast("Período fechado. O saldo atual voltou para R$ 0,00 e o PDF está pronto.");
  }

  async function submitVale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!post || !selectedRow) return;
    const form = new FormData(event.currentTarget);
    const ok = await post({
      action: "team-payment",
      id: editing?.id ?? 0,
      teamMemberId: selectedRow.teamMemberId,
      occurredAt: String(form.get("occurredAt") ?? today()),
      kind: "Vale",
      reason: String(form.get("reason") ?? ""),
      valueCents: Math.round(Number(form.get("value") ?? 0) * 100),
    }, editing ? "Vale atualizado." : `Vale registrado para ${selectedRow.teamMemberName}.`);
    if (ok) {
      setEditing(null);
      await load();
      setValeFormOpen(false);
    }
  }

  async function removeEntry(entry: TeamMoneyEntry) {
    if (!post || entry.kind !== "Vale") return;
    if (!window.confirm(`Excluir vale de ${money(entry.valueCents)} de ${entry.teamMemberName}?`)) return;
    const ok = await post({ action: "delete-team-payment", id: entry.id }, "Vale excluído.");
    if (ok) {
      if (editing?.id === entry.id) setEditing(null);
      await load();
    }
  }

  function openNewVale() {
    setEditing(null);
    setValeFormOpen(true);
  }

  function editVale(entry: TeamMoneyEntry) {
    if (entry.kind !== "Vale") return;
    setEditing(entry);
    setValeFormOpen(true);
  }

  if (loading) return <section className="panel team-money-loading">Carregando valores da equipe...</section>;

  if (!owner) {
    const row = rows[0];
    return <div className="team-money-shell team-money-v2">
      {feedback && <div className="notice error">{feedback}</div>}
      {row ? <>
        <section className="team-money-v2-intro">
          <div><span>MINHA GRANA</span><h2>Meu saldo</h2><p>Acompanhe o que você já ganhou, os vales retirados e o próximo fechamento.</p></div>
          <MemberAvatar row={row} large />
        </section>
        <section className="panel team-money-v2-focus">
          <header className="team-money-v2-person">
            <MemberAvatar row={row} large />
            <div><h2>{row.teamMemberName}</h2><small>{row.role}</small></div>
          </header>
          <div className="team-money-v2-summary">
            <article className="receive"><span><AppIcon name="money" /></span><div><small>A RECEBER</small><strong>{money(row.currentBalanceCents)}</strong><em>saldo atual</em></div></article>
            <article><span><AppIcon name="scissors" /></span><div><small>COMISSÃO GERADA</small><strong>{money(row.earnedCents)}</strong><em>desde o último fechamento</em></div></article>
            <article><span><AppIcon name="money" /></span><div><small>VALES</small><strong>{money(row.valeCents)}</strong><em>já descontados</em></div></article>
            <article><span><AppIcon name="calendar" /></span><div><small>FECHAMENTO PREVISTO</small><strong>{paymentDayLabel(row.paymentDay)}</strong><em>{row.lastClosure ? `Último: ${date(row.lastClosure.periodEndDate)}` : "Sem fechamento anterior"}</em></div></article>
          </div>
        </section>
        <section className="panel team-money-v2-movements">
          <div className="team-money-v2-heading"><div><span>EM ABERTO</span><h3>Vales deste período</h3></div><b>{row.openEntries.filter((entry) => entry.kind === "Vale").length}</b></div>
          <div className="team-money-v2-list">
            {row.openEntries.filter((entry) => entry.kind === "Vale").map((entry) => <article key={entry.id}><i className="vale"><AppIcon name="money" /></i><div><strong>Vale</strong><small>{date(entry.occurredAt)} · {entry.reason}</small></div><b>- {money(entry.valueCents)}</b></article>)}
            {!row.openEntries.some((entry) => entry.kind === "Vale") && <p className="team-money-empty">Nenhum vale em aberto neste período.</p>}
          </div>
        </section>
        {data && <ClosureHistory data={data} memberId={row.teamMemberId} />}
      </> : <section className="panel team-money-loading">Seu cadastro ainda não possui saldo disponível.</section>}
    </div>;
  }

  if (!selectedRow) return <section className="panel team-money-loading">Cadastre a equipe para controlar vales e fechamentos.</section>;

  const visibleEntries = selectedRow.openEntries.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id);
  const openValeCount = visibleEntries.filter((entry) => entry.kind === "Vale").length;

  return <div className="team-money-shell team-money-v2">
    {feedback && <div className="notice error">{feedback}</div>}

    <section className="team-money-v2-intro">
      <div><span>CONTROLE DA EQUIPE</span><h2>Vales e fechamentos</h2><p>Veja quanto cada profissional tem para receber, registre vales e feche o período sem fazer conta por fora.</p></div>
    </section>

    <nav className="team-money-v2-tabs" aria-label="Escolher profissional">
      {rows.map((row) => <button type="button" key={row.teamMemberId} className={selectedRow.teamMemberId === row.teamMemberId ? "active" : ""} onClick={() => { setSelectedMemberId(row.teamMemberId); setValeFormOpen(false); setEditing(null); }}>
        <MemberAvatar row={row} />
        <span><strong>{row.teamMemberName}</strong><small>{money(row.currentBalanceCents)} a receber</small></span>
      </button>)}
    </nav>

    <section className="panel team-money-v2-focus">
      <header className="team-money-v2-person">
        <MemberAvatar row={selectedRow} large />
        <div><h2>{selectedRow.teamMemberName}</h2><small>{selectedRow.role}</small></div>
        <span className="team-money-v2-status">Em aberto</span>
      </header>

      <div className="team-money-v2-summary">
        <article className="receive"><span><AppIcon name="money" /></span><div><small>A RECEBER</small><strong>{money(selectedRow.currentBalanceCents)}</strong><em>já descontados os vales</em></div></article>
        <article><span><AppIcon name="money" /></span><div><small>VALES</small><strong>{money(selectedRow.valeCents)}</strong><em>{openValeCount} {openValeCount === 1 ? "vale" : "vales"} no período</em></div></article>
        <article><span><AppIcon name="scissors" /></span><div><small>COMISSÃO GERADA</small><strong>{money(selectedRow.earnedCents)}</strong><em>serviços, produtos e gorjetas</em></div></article>
        <article><span><AppIcon name="calendar" /></span><div><small>ÚLTIMO FECHAMENTO</small><strong>{selectedRow.lastClosure ? money(selectedRow.lastClosure.settlementCents) : "—"}</strong><em>{selectedRow.lastClosure ? date(selectedRow.lastClosure.periodEndDate) : "Ainda não realizado"}</em></div></article>
      </div>

      <div className="team-money-v2-actions">
        <button className="vale-action" type="button" disabled={pending || outerPending} onClick={openNewVale}><AppIcon name="money" /> Novo vale</button>
        <button className="close-action" type="button" disabled={pending || outerPending || !selectedRow.hasOpenActivity} onClick={() => void closeCycle(selectedRow)}><AppIcon name="check" /> Fechar período</button>
      </div>

      <form className="team-money-v2-day" onSubmit={(event) => savePaymentDay(event, selectedRow)} key={`day-${selectedRow.teamMemberId}`}>
        <label>Dia previsto de fechamento <input name="paymentDay" type="number" min="1" max="31" defaultValue={selectedRow.paymentDay} /></label>
        <button type="submit" disabled={pending || outerPending}>Salvar</button>
      </form>
    </section>

    {valeFormOpen && <section className="panel team-money-v2-vale-form">
      <div className="team-money-v2-heading"><div><span>{editing ? "EDITANDO VALE" : "NOVO VALE"}</span><h3>{selectedRow.teamMemberName}</h3></div><button type="button" className="quiet-close" onClick={() => { setValeFormOpen(false); setEditing(null); }}>Fechar</button></div>
      <form onSubmit={submitVale} key={editing?.id ?? `new-${selectedRow.teamMemberId}`}>
        <label>Data<input name="occurredAt" type="date" defaultValue={editing?.occurredAt ?? today()} required /></label>
        <label>Valor (R$)<input name="value" type="number" min="0.01" step="0.01" inputMode="decimal" defaultValue={editing ? editing.valueCents / 100 : undefined} placeholder="0,00" required /></label>
        <label className="reason-field">Motivo<input name="reason" maxLength={160} placeholder="Ex.: adiantamento, almoço, transporte" defaultValue={editing?.reason ?? ""} required /></label>
        <button className="primary-button" disabled={pending || outerPending}>{editing ? "Salvar vale" : "Registrar vale"}</button>
      </form>
    </section>}

    <section className="panel team-money-v2-movements">
      <div className="team-money-v2-heading"><div><span>MOVIMENTAÇÕES</span><h3>Desde o último fechamento</h3></div><b>{visibleEntries.length} lançamento{visibleEntries.length === 1 ? "" : "s"}</b></div>
      <div className="team-money-v2-list">
        {visibleEntries.map((entry) => {
          const isVale = entry.kind === "Vale";
          return <article key={entry.id}>
            <i className={isVale ? "vale" : "legacy"}>{isVale ? <AppIcon name="money" /> : <AppIcon name="check" />}</i>
            <div><strong>{isVale ? "Vale" : "Ajuste antigo"}</strong><small>{date(entry.occurredAt)} · {entry.reason}</small></div>
            <b>- {money(entry.valueCents)}</b>
            {isVale && <div className="team-money-v2-entry-actions"><button type="button" onClick={() => editVale(entry)}>Editar</button><button type="button" className="danger" disabled={pending || outerPending} onClick={() => void removeEntry(entry)}>Excluir</button></div>}
          </article>;
        })}
        {!visibleEntries.length && <p className="team-money-empty">Nenhum vale em aberto. As novas movimentações vão aparecer aqui.</p>}
      </div>
    </section>

    <ClosureHistory data={data!} memberId={selectedRow.teamMemberId} closures={selectedClosures} />
  </div>;
}

function ClosureHistory({ data, memberId, closures }: { data: TeamMoneyData; memberId?: number; closures?: TeamMoneyData["closures"] }) {
  const visible = closures ?? data.closures.filter((closure) => !closure.isBaseline && (!memberId || closure.teamMemberId === memberId));
  return <section className="panel team-money-v2-history">
    <div className="team-money-v2-heading"><div><span>HISTÓRICO</span><h3>Fechamentos concluídos</h3></div><b>{visible.length}</b></div>
    <div className="team-money-v2-history-list">
      {visible.map((closure) => <article key={closure.id}><div><strong>{closure.teamMemberName}</strong><small>{date(closure.periodStartDate)} a {date(closure.periodEndDate)} · {closure.recordCount} atendimento(s)</small></div><b>{money(closure.settlementCents)}</b><button type="button" onClick={() => void downloadPdf(closure.id)}>Baixar PDF</button></article>)}
      {!visible.length && <p className="team-money-empty">O primeiro fechamento deste profissional vai aparecer aqui.</p>}
    </div>
  </section>;
}
