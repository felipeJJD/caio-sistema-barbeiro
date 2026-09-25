"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessInsights, FinanceMonthInsight } from "../../lib/business-insights";
import styles from "./business-insights.module.css";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
const shortMoney = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(Number(cents || 0) / 100);
const humanDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const capitalize = (value: string) => value ? value[0].toLocaleUpperCase("pt-BR") + value.slice(1) : value;

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CA";
}

function whatsappHref(phone: string) {
  let digits = phone.replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  return `https://wa.me/${digits}`;
}

async function fetchInsights() {
  const response = await fetch("/api/business-insights", { cache: "no-store" });
  const payload = await response.json() as { data?: BusinessInsights; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error ?? "Não foi possível carregar esta análise.");
  return payload.data;
}

export function ClientPulse() {
  const [data, setData] = useState<BusinessInsights | null>(null);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<"30" | "90" | "180" | "365">("90");
  const [mode, setMode] = useState<"most" | "least">("most");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    const load = () => {
      void fetchInsights()
        .then((next) => {
          if (!active) return;
          setData(next);
          setError("");
        })
        .catch((reason) => {
          if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar esta análise.");
        });
    };
    load();
    const refresh = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("cortou-anotou:refresh-data", load);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.removeEventListener("cortou-anotou:refresh-data", load);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (error) return <section className={styles.clientPanel}><p className={styles.error}>{error}</p></section>;
  if (!data) return <section className={styles.clientPanel}><p className={styles.loading}>Montando o radar dos seus clientes...</p></section>;

  const normalize = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const search = normalize(query);
  const periodClients = data.clientRadar.periods[period] ?? [];
  const matching = search
    ? periodClients.filter((client) => normalize(client.name).includes(search))
    : periodClients.filter((client) => client.visitCount >= 2);
  const ordered = matching.slice().sort((left, right) => mode === "most"
    ? right.visitCount - left.visitCount || right.lastVisit.localeCompare(left.lastVisit)
    : left.visitCount - right.visitCount || right.daysAway - left.daysAway);
  const visible = ordered.slice(0, expanded ? 12 : 6);
  const maxVisits = Math.max(1, ...ordered.map((client) => client.visitCount));
  const periodLabels = { "30": "30 dias", "90": "3 meses", "180": "6 meses", "365": "12 meses" } as const;

  return <section className={styles.clientPanel}>
    <header className={styles.clientHeader}>
      <div><span className={styles.eyebrow}>RADAR DE CLIENTES</span><h2>Seus clientes</h2><p>Veja quem mais aparece e quem vem com menos frequência.</p></div>
    </header>

    <div className={styles.radarControls}>
      <label className={styles.clientSearch}>
        <span>Pesquisar cliente</span>
        <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setExpanded(false); }} placeholder="Digite o nome do cliente" />
      </label>
      <div className={styles.periodSwitch} role="group" aria-label="Período do radar">
        {(["30", "90", "180", "365"] as const).map((value) => <button type="button" className={period === value ? styles.active : ""} onClick={() => { setPeriod(value); setExpanded(false); }} key={value}>{periodLabels[value]}</button>)}
      </div>
      <div className={styles.radarTabs} role="group" aria-label="Ordem dos clientes">
        <button type="button" className={mode === "most" ? styles.active : ""} onClick={() => { setMode("most"); setExpanded(false); }}>Mais frequentes</button>
        <button type="button" className={mode === "least" ? styles.active : ""} onClick={() => { setMode("least"); setExpanded(false); }}>Menos frequentes</button>
      </div>
    </div>

    <div className={styles.radarSummary}>
      <span>{search ? ordered.length + " resultado" + (ordered.length === 1 ? "" : "s") : ordered.length + " clientes recorrentes"}</span>
      <strong>{periodLabels[period]}</strong>
    </div>

    <div className={styles.clientList}>
      {visible.map((client, index) => <article className={styles.clientRow} key={client.key}>
        <span className={styles.rank}>{index + 1}</span>
        <span className={styles.avatar}>{initials(client.name)}</span>
        <div className={styles.clientMain}>
          <div className={styles.clientNameLine}><strong>{client.name}</strong><span className={styles.visitBadge}>{client.visitCount} {client.visitCount === 1 ? "visita" : "visitas"}</span></div>
          <small>Última visita {humanDate(client.lastVisit)} · {client.lastService} · {client.lastBarber}</small>
          <div className={styles.frequencyTrack} aria-hidden="true"><i style={{ width: Math.max(8, Math.round(client.visitCount / maxVisits * 100)) + "%" }} /></div>
          <em>{client.cadenceDays ? "Retorno médio: " + client.cadenceDays + " dias" : client.visitCount > 1 ? "Ainda calculando o ritmo de retorno" : "Uma visita registrada neste período"}</em>
        </div>
      </article>)}
      {!visible.length && <p className={styles.empty}>{search ? "Nenhum cliente encontrado neste período." : "Ainda não há clientes com pelo menos duas visitas neste período."}</p>}
    </div>

    <footer className={styles.clientFooter}>
      <p>O ranking considera clientes com 2 ou mais visitas. A busca também encontra quem veio uma única vez.</p>
      {ordered.length > 6 && <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Ver menos" : "Ver mais (" + ordered.length + ")"}</button>}
    </footer>
  </section>;
}

function RevenueChart({ primary, compare }: { primary: FinanceMonthInsight; compare?: FinanceMonthInsight }) {
  const allValues = [...primary.dailyRevenue, ...(compare?.dailyRevenue ?? [])].map((item) => item.valueCents);
  const maxValue = Math.max(1, ...allValues);
  const x = (day: number) => 56 + ((Math.max(1, Math.min(31, day)) - 1) / 30) * 548;
  const y = (value: number) => 190 - (Math.max(0, value) / maxValue) * 142;
  const points = (month: FinanceMonthInsight) => month.dailyRevenue.map((item) => `${x(item.day)},${y(item.valueCents)}`).join(" ");
  const xLabels = [1, 5, 10, 15, 20, 25, 30];

  return <div className={styles.chartWrap}>
    <svg className={styles.lineChart} viewBox="0 0 640 230" role="img" aria-label="Gráfico de faturamento por dia do mês">
      {[48, 119, 190].map((gridY) => <line className={styles.gridLine} key={gridY} x1="56" x2="604" y1={gridY} y2={gridY} />)}
      <text className={styles.axisLabel} x="4" y="53">{shortMoney(maxValue)}</text>
      <text className={styles.axisLabel} x="4" y="124">{shortMoney(Math.round(maxValue / 2))}</text>
      <text className={styles.axisLabel} x="28" y="195">0</text>
      {xLabels.map((day) => <text className={styles.axisLabel} key={day} x={x(day) - 6} y="218">{day}</text>)}
      {compare && <polyline className={styles.compareLine} points={points(compare)} />}
      <polyline className={styles.primaryLine} points={points(primary)} />
    </svg>
  </div>;
}

export function FinanceInsights() {
  const [data, setData] = useState<BusinessInsights | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"revenue" | "weekdays">("revenue");
  const [primaryMonth, setPrimaryMonth] = useState("");
  const [compareMonth, setCompareMonth] = useState("");

  useEffect(() => {
    let active = true;
    void fetchInsights()
      .then((next) => {
        if (!active) return;
        setData(next);
        setPrimaryMonth((current) => current || next.financeMonths[0]?.month || "");
        setError("");
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar os gráficos.");
      });
    return () => { active = false; };
  }, []);

  const primary = useMemo(() => data?.financeMonths.find((item) => item.month === primaryMonth) ?? data?.financeMonths[0], [data, primaryMonth]);
  const compare = useMemo(() => data?.financeMonths.find((item) => item.month === compareMonth), [data, compareMonth]);

  if (error) return <section className={styles.financePanel}><p className={styles.error}>{error}</p></section>;
  if (!data || !primary) return <section className={styles.financePanel}><p className={styles.loading}>Montando a visão financeira...</p></section>;

  const activeWeekdays = primary.weekdays.filter((item) => item.count > 0);
  const busiest = activeWeekdays.slice().sort((a, b) => b.count - a.count)[0];
  const quietest = activeWeekdays.slice().sort((a, b) => a.count - b.count)[0];
  const weekdayMax = Math.max(1, ...primary.weekdays.map((item) => item.count));
  const comparison = compare && compare.totalRevenueCents > 0
    ? Math.round(((primary.totalRevenueCents - compare.totalRevenueCents) / compare.totalRevenueCents) * 100)
    : null;

  return <section className={styles.financePanel}>
    <header className={styles.financeHeader}>
      <div><span className={styles.eyebrow}>VISÃO DO NEGÓCIO</span><h2>Acompanhe a evolução</h2><p>Compare meses ou descubra quais dias concentram mais atendimentos.</p></div>
      <div className={styles.modeSwitch} role="group" aria-label="Tipo de gráfico">
        <button type="button" className={mode === "revenue" ? styles.active : ""} onClick={() => setMode("revenue")}>Faturamento</button>
        <button type="button" className={mode === "weekdays" ? styles.active : ""} onClick={() => setMode("weekdays")}>Dias movimentados</button>
      </div>
    </header>

    <div className={styles.financeControls}>
      <label>Mês<select value={primary.month} onChange={(event) => { setPrimaryMonth(event.target.value); if (event.target.value === compareMonth) setCompareMonth(""); }}>{data.financeMonths.map((item) => <option value={item.month} key={item.month}>{capitalize(item.label)}</option>)}</select></label>
      {mode === "revenue" && <label>Comparar com<select value={compare?.month ?? ""} onChange={(event) => setCompareMonth(event.target.value)}><option value="">Não comparar</option>{data.financeMonths.filter((item) => item.month !== primary.month).map((item) => <option value={item.month} key={item.month}>{capitalize(item.label)}</option>)}</select></label>}
    </div>

    {mode === "revenue" ? <>
      <div className={styles.revenueSummary}>
        <article><small>{primary.label}</small><strong>{money(primary.totalRevenueCents)}</strong></article>
        {compare ? <article className={styles.secondary}><small>{compare.label}</small><strong>{money(compare.totalRevenueCents)}</strong></article> : <article className={styles.secondary}><small>atendimentos</small><strong>{primary.attendanceCount}</strong></article>}
      </div>
      {comparison !== null && <p className={styles.comparisonText}>{primary.label} está <strong>{Math.abs(comparison)}%</strong> {comparison >= 0 ? "acima" : "abaixo"} de {compare?.label} no faturamento registrado.</p>}
      <RevenueChart primary={primary} compare={compare} />
      <div className={styles.chartLegend}><span>{capitalize(primary.label)}</span>{compare && <span className={styles.compare}>{capitalize(compare.label)}</span>}</div>
      <p className={styles.financeNote}>Faturamento considera serviços, gorjetas, mensalidades e produtos registrados no Cortou Anotou.</p>
    </> : <>
      <div className={styles.weekdayBars}>
        {primary.weekdays.map((item) => <div className={styles.weekdayRow} key={item.weekday}><span>{item.label}</span><div className={styles.barTrack}><i style={{ width: `${Math.max(item.count ? 8 : 0, Math.round(item.count / weekdayMax * 100))}%` }} /></div><strong>{item.count} atend.</strong></div>)}
      </div>
      <div className={styles.weekdayCallouts}>
        <article><small>MAIOR MOVIMENTO</small><strong>{busiest ? `${busiest.label} · ${busiest.count} atendimentos` : "Sem dados"}</strong><p>Ajuda a enxergar quando a agenda naturalmente fica mais cheia.</p></article>
        <article><small>MENOR MOVIMENTO</small><strong>{quietest ? `${quietest.label} · ${quietest.count} atendimentos` : "Sem dados"}</strong><p>{quietest ? "Pode ser um bom dia para testar uma promoção ou ação de retorno." : "Registre atendimentos para começar a comparar."}</p></article>
      </div>
      <p className={styles.financeNote}>A análise de movimento usa atendimentos realizados. Dias sem nenhum registro não são apontados automaticamente como “fracos”, porque podem ser dias em que a barbearia não abre.</p>
    </>}
  </section>;
}
