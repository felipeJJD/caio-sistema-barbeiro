"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { BrandLogo } from "./brand-logo";
import styles from "./affiliate-prospecting.module.css";

type Lead = {
  id: string;
  name: string;
  phone: string;
  phoneE164: string;
  phoneKind: string;
  whatsappCandidate: boolean;
  address: string;
  website?: string;
  potential?: string;
  confidence?: number | null;
};

type City = { id: number | string; name: string };

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

function personalize(template: string, lead: Lead, signupUrl: string) {
  return template.replaceAll("{barbearia}", lead.name || "barbearia").replaceAll("{link}", signupUrl);
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

export function AffiliateProspecting({ name, initialWhatsapp, signupUrl, isAdmin }: { name: string; initialWhatsapp: string; signupUrl: string; isAdmin: boolean }) {
  const [uf, setUf] = useState("PR");
  const [city, setCity] = useState("Colombo");
  const [cities, setCities] = useState<City[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchedCity, setSearchedCity] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [visibleCount, setVisibleCount] = useState(DISPLAY_STEP);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [whatsapp, setWhatsapp] = useState(initialWhatsapp || "");
  const [savingWhatsapp, setSavingWhatsapp] = useState(false);
  const [queue, setQueue] = useState<Lead[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const sendRef = useRef<HTMLElement | null>(null);

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

  const visibleLeads = useMemo(() => leads.slice(0, visibleCount), [leads, visibleCount]);
  const selectedLeads = useMemo(() => leads.filter((lead) => selected.has(lead.id) && lead.whatsappCandidate && lead.phoneE164), [leads, selected]);
  const currentQueueLead = queue[queueIndex];

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (!city) return setNotice("Escolha uma cidade.");
    const query = `${city}, ${uf}`;
    setLoading(true);
    setError("");
    setNotice("");
    setSelected(new Set());
    setQueue([]);
    setVisibleCount(DISPLAY_STEP);
    try {
      const response = await fetch(`/api/affiliate/prospecting/search?city=${encodeURIComponent(query)}&offset=0`, { cache: "no-store" });
      const payload = await response.json() as { leads?: Lead[]; displayName?: string; hasMore?: boolean; nextOffset?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível pesquisar agora.");
      const found = Array.isArray(payload.leads) ? payload.leads : [];
      setLeads(found);
      setSearchedCity(payload.displayName || query);
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number(payload.nextOffset) || found.length);
      if (!found.length) setNotice("Não encontrei barbearias nessa cidade.");
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
      const response = await fetch(`/api/affiliate/prospecting/search?city=${encodeURIComponent(searchedCity)}&offset=${nextOffset}`, { cache: "no-store" });
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
    setSelected(new Set(visibleLeads.filter((lead) => lead.whatsappCandidate && lead.phoneE164).map((lead) => lead.id)));
  }

  function prepareQueue() {
    if (!selectedLeads.length) return setNotice("Selecione pelo menos uma barbearia com celular válido.");
    if (!signupUrl) return setError("Seu link de afiliado ainda não foi configurado. Fale com o administrador.");
    setQueue(selectedLeads);
    setQueueIndex(0);
    setTimeout(() => sendRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function openWhatsApp() {
    if (!currentQueueLead?.phoneE164 || !/^55\d{11}$/.test(currentQueueLead.phoneE164)) return;
    const text = personalize(message, currentQueueLead, signupUrl);
    window.open(`https://wa.me/${currentQueueLead.phoneE164}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  async function saveWhatsapp() {
    setSavingWhatsapp(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/affiliate/prospecting/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ whatsapp }),
      });
      const payload = await response.json() as { whatsapp?: string; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o WhatsApp.");
      setWhatsapp(payload.whatsapp || "");
      setNotice("WhatsApp de prospecção salvo.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível salvar o WhatsApp.");
    } finally {
      setSavingWhatsapp(false);
    }
  }

  return <main className={styles.page}>
    <header className={styles.header}>
      <BrandLogo variant="access" />
      <div className={styles.headerActions}><Link href="/afiliado">Voltar ao painel</Link><a href="/api/affiliate/auth/logout">Sair</a></div>
    </header>

    <section className={styles.hero}>
      <div><span>PROSPECÇÃO</span><h1>Encontre barbearias e fale com elas.</h1><p>{isAdmin ? "Acesso ADM: seus links de prospecção saem sem ref de afiliado." : `Olá, ${name.split(/\s+/)[0] || name}. O link enviado já usa sua indicação automaticamente.`}</p></div>
      <div className={styles.linkBox}><small>LINK QUE VAI NA MENSAGEM</small><strong>{signupUrl || "Link ainda não configurado"}</strong></div>
    </section>

    <section className={styles.card}>
      <div className={styles.cardTitle}><div><b>Seu WhatsApp de prospecção</b><span>Salve o número que você pretende usar para falar com as barbearias.</span></div></div>
      <div className={styles.whatsappRow}><input value={whatsapp} onChange={(event) => setWhatsapp(event.target.value)} inputMode="tel" placeholder="(41) 99999-9999" /><button type="button" onClick={saveWhatsapp} disabled={savingWhatsapp}>{savingWhatsapp ? "Salvando..." : "Salvar WhatsApp"}</button></div>
      <p className={styles.helper}>Nesta versão o botão abre a conversa no WhatsApp que estiver logado no seu aparelho. A conexão automática para envio em lote será ativada numa etapa separada.</p>
    </section>

    <section className={styles.card}>
      <div className={styles.cardTitle}><div><b>1. Buscar barbearias</b><span>Escolha o estado e a cidade.</span></div></div>
      <form className={styles.searchForm} onSubmit={search}>
        <label><span>Estado</span><select value={uf} onChange={(event) => { setCitiesLoading(true); setUf(event.target.value); setCity(""); }}>{STATES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label><span>Cidade</span><select value={city} onChange={(event) => setCity(event.target.value)} disabled={citiesLoading}><option value="">{citiesLoading ? "Carregando..." : "Selecione"}</option>{cities.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select></label>
        <button disabled={loading || citiesLoading || !city}>{loading ? "Buscando..." : "Buscar barbearias"}</button>
      </form>
    </section>

    {leads.length > 0 && <section className={styles.card}>
      <div className={styles.cardTitle}><div><b>2. Selecionar</b><span>{searchedCity} · {leads.length}{hasMore ? "+" : ""} carregadas</span></div><button type="button" className={styles.secondary} onClick={selectVisible}>Selecionar celulares visíveis</button></div>
      <div className={styles.leadList}>{visibleLeads.map((lead) => {
        const checked = selected.has(lead.id);
        const enabled = Boolean(lead.whatsappCandidate && lead.phoneE164);
        return <button type="button" className={`${styles.lead} ${checked ? styles.selected : ""}`} onClick={() => toggle(lead)} key={lead.id} disabled={!enabled}>
          <span className={styles.check}>{checked ? "✓" : ""}</span><div><strong>{lead.name}</strong><small>{lead.address || "Endereço não informado"}</small><em>{enabled ? lead.phone : lead.phoneKind === "landline" ? `Fixo: ${lead.phone}` : "Sem celular válido"}</em></div>
        </button>;
      })}</div>
      {(visibleLeads.length < leads.length || hasMore) && <button type="button" className={styles.more} onClick={loadMore} disabled={moreLoading}>{moreLoading ? "Buscando mais..." : "Ver mais barbearias"}</button>}
    </section>}

    <section className={styles.card}>
      <div className={styles.cardTitle}><div><b>3. Mensagem</b><span>Use {"{barbearia}"} e {"{link}"}. O sistema troca automaticamente.</span></div></div>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} maxLength={1200} />
      <button type="button" className={styles.primary} onClick={prepareQueue}>Preparar {selectedLeads.length || ""} mensagem{selectedLeads.length === 1 ? "" : "s"}</button>
    </section>

    {queue.length > 0 && <section className={styles.card} ref={sendRef}>
      <div className={styles.cardTitle}><div><b>4. Enviar</b><span>Uma conversa por vez, sem vários quadros na tela.</span></div><strong>{queueIndex + 1}/{queue.length}</strong></div>
      {currentQueueLead && <div className={styles.sendPanel}>
        <div><small>BARBEARIA ATUAL</small><h2>{currentQueueLead.name}</h2><p>{currentQueueLead.phone} · {currentQueueLead.address}</p></div>
        <div className={styles.preview}>{personalize(message, currentQueueLead, signupUrl)}</div>
        <button type="button" className={styles.whatsappButton} onClick={openWhatsApp}>Abrir no WhatsApp</button>
        <div className={styles.queueNav}><button type="button" onClick={() => setQueueIndex((value) => Math.max(0, value - 1))} disabled={queueIndex === 0}>Anterior</button><button type="button" onClick={() => setQueueIndex((value) => Math.min(queue.length - 1, value + 1))} disabled={queueIndex >= queue.length - 1}>Próxima</button></div>
      </div>}
    </section>}

    {(error || notice) && <div className={`${styles.notice} ${error ? styles.error : ""}`}>{error || notice}</div>}
  </main>;
}
