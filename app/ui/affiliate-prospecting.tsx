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
type ReservedClaim = { key: string; phoneE164: string; name?: string };
type BlockedClaim = { name?: string; reason?: string };
type QueueJob = { id:string; batchId:string; key:string; name:string; phoneE164:string; status:string; error?:string; delivery?:string };

type AutomaticWhatsappState = { state: string; connected: boolean; canConnect?: boolean };

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

function nationalPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
}
function readableError(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value.trim().replace(/\[object Object\]/g, "").trim() || fallback;
  if (Array.isArray(value)) {
    const text: string = value.map((item) => readableError(item, "")).filter(Boolean).join(" · ");
    return text || fallback;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["message", "error", "detail", "description"]) {
      const text: string = readableError(record[key], "");
      if (text) return text;
    }
  }
  return fallback;
}

export function AffiliateProspecting({ name, initialWhatsapp, signupUrl, isAdmin }: { name: string; initialWhatsapp: string; signupUrl: string; isAdmin: boolean }) {
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
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [whatsapp, setWhatsapp] = useState(nationalPhone(initialWhatsapp || ""));
  const [queue, setQueue] = useState<Lead[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [automatic, setAutomatic] = useState<AutomaticWhatsappState>({ state: "loading", connected: false });
  const [automaticLoading, setAutomaticLoading] = useState(true);
  const [automaticConnecting, setAutomaticConnecting] = useState(false);
  const [automaticSending, setAutomaticSending] = useState(false);
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [batchId, setBatchId] = useState("");
  const sendingRef = useRef(false);
  const batchJobs = jobs.filter(job => job.batchId === (batchId || jobs[0]?.batchId));
  const completed = batchJobs.filter(job => ["sent","failed","uncertain","cancelled"].includes(job.status)).length;
  const [pairingCode, setPairingCode] = useState("");
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

  useEffect(() => {
    const initial = window.setTimeout(() => { void refreshAutomatic(false); void refreshQueue(); }, 0);
    const interval = window.setInterval(() => { void refreshQueue(); }, 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (!pairingCode) return;
    const interval = window.setInterval(() => void refreshAutomatic(false), 4000);
    return () => window.clearInterval(interval);
  }, [pairingCode]);

  async function refreshQueue() {
    try {
      const response = await fetch("/api/affiliate/prospecting/queue", {cache:"no-store"});
      const payload = await response.json() as {jobs?:QueueJob[]};
      if (response.ok) setJobs(payload.jobs || []);
    } catch { /* Existing progress remains visible through a temporary connection loss. */ }
  }

  const visibleLeads = useMemo(() => leads.slice(0, visibleCount), [leads, visibleCount]);
  const selectedLeads = useMemo(() => leads.filter((lead) => selected.has(lead.id) && lead.whatsappCandidate && lead.phoneE164), [leads, selected]);
  const currentQueueLead = queue[queueIndex];

  async function refreshAutomatic(showNotice = true) {
    if (showNotice) setAutomaticLoading(true);
    try {
      const response = await fetch("/api/affiliate/prospecting/whatsapp", { cache: "no-store" });
      const payload = await response.json() as AutomaticWhatsappState & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível consultar o envio automático.");
      setAutomatic({ state: payload.state || "disconnected", connected: Boolean(payload.connected), canConnect: payload.canConnect });
      if (payload.connected) {
        setPairingCode("");
        if (showNotice) setNotice("Envio automático conectado e pronto para usar.");
      } else if (showNotice) {
        setNotice("O número ainda não terminou a conexão. Confira o código no WhatsApp e tente novamente.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível consultar o envio automático.");
    } finally {
      setAutomaticLoading(false);
    }
  }

  async function connectAutomatic() {
    if (!whatsapp.trim()) return setNotice("Informe o número que será usado no envio automático antes de conectar.");
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
      if (!response.ok) throw new Error(payload.error || "Não foi possível iniciar a conexão automática.");
      setAutomatic({ state: payload.state || "connecting", connected: Boolean(payload.connected), canConnect: true });
      setPairingCode(payload.pairingCode || "");
      if (payload.connected) setNotice("Envio automático já está conectado.");
      else setNotice("Código gerado. Abra Aparelhos conectados no seu WhatsApp.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível iniciar a conexão automática.");
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
    setQueue([]);
    setVisibleCount(DISPLAY_STEP);
    try {
      const params = new URLSearchParams({ city: query, offset: "0" });
      if (nameQuery) params.set("name", nameQuery);
      const response = await fetch(`/api/affiliate/prospecting/search?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json() as { leads?: Lead[]; displayName?: string; hasMore?: boolean; nextOffset?: number; hiddenCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível pesquisar agora.");
      const found = Array.isArray(payload.leads) ? payload.leads : [];
      setLeads(found);
      setSearchedCity(payload.displayName || query);
      setSearchedName(nameQuery);
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number(payload.nextOffset) || found.length);
      if (!found.length && payload.hasMore) setNotice(nameQuery ? `Os primeiros resultados de “${nameQuery}” já foram contatados ou estão reservados. Toque em Ver mais barbearias.` : "Os primeiros resultados já foram contatados ou estão reservados. Toque em Ver mais barbearias.");
      else if (!found.length) setNotice(nameQuery ? `Não encontrei uma barbearia disponível com “${nameQuery}” no nome em ${query}.` : "Não encontrei novas barbearias disponíveis nessa cidade.");
    } catch (cause) {
      setLeads([]);
      setSearchedName(nameQuery);
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
      if (!incoming.length && payload.hasMore) setNotice("Esse lote já estava reservado ou contatado. Você pode tocar em Ver mais novamente.");
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
    setSelected(current => new Set([...current, ...visibleLeads.filter((lead) => lead.whatsappCandidate && lead.phoneE164).map((lead) => lead.id)]));
  }

  async function prepareQueue() {
    if (!selectedLeads.length) return setNotice("Selecione pelo menos uma barbearia com celular válido.");
    if (!signupUrl) return setError("Seu link de afiliado ainda não foi configurado. Fale com o administrador.");
    setPreparing(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/affiliate/prospecting/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reserve", leads: selectedLeads, city: searchedCity }),
      });
      const payload = await response.json() as { reserved?: ReservedClaim[]; blocked?: BlockedClaim[]; reservationMinutes?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível reservar as barbearias agora.");
      const reservedPhones = new Set((Array.isArray(payload.reserved) ? payload.reserved : []).map((item) => item.phoneE164));
      const ready = selectedLeads.filter((lead) => reservedPhones.has(lead.phoneE164));
      const blockedCount = Array.isArray(payload.blocked) ? payload.blocked.length : 0;
      if (!ready.length) {
        setSelected(new Set());
        return setNotice(blockedCount ? "Essas barbearias já foram contatadas ou estão reservadas por outro afiliado." : "Nenhuma barbearia ficou disponível para envio.");
      }
      setQueue(ready);
      setQueueIndex(0);
      setSelected(new Set(ready.map((lead) => lead.id)));
      if (blockedCount) setNotice(`${blockedCount} barbearia${blockedCount === 1 ? "" : "s"} já estava${blockedCount === 1 ? "" : "m"} reservada${blockedCount === 1 ? "" : "s"} ou contatada${blockedCount === 1 ? "" : "s"} e foi${blockedCount === 1 ? "" : "ram"} retirada${blockedCount === 1 ? "" : "s"}.`);
      setTimeout(() => sendRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível reservar as barbearias agora.");
    } finally {
      setPreparing(false);
    }
  }

  function removeContactedFromScreen(current: Lead) {
    setLeads((items) => items.filter((lead) => lead.phoneE164 !== current.phoneE164));
    setSelected((items) => {
      const next = new Set(items);
      next.delete(current.id);
      return next;
    });
  }

  function openWhatsApp() {
    if (!currentQueueLead?.phoneE164 || !/^55\d{11}$/.test(currentQueueLead.phoneE164)) return;
    const text = personalize(message, currentQueueLead, signupUrl);
    window.open(`https://wa.me/${currentQueueLead.phoneE164}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setNotice("Depois de enviar no WhatsApp, volte e toque em Já enviei para registrar o contato.");
  }
  async function confirmManualSend() {
    if (!currentQueueLead || automaticSending) return;
    const current = currentQueueLead;
    try {
      const response = await fetch("/api/affiliate/prospecting/claims", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"contacted",key:`phone:${current.phoneE164}`,message:personalize(message,current,signupUrl)})});
      const payload = await response.json() as {error?:unknown};
      if (!response.ok) throw new Error(readableError(payload.error,"Não foi possível registrar o envio."));
      removeContactedFromScreen(current);
      setQueue(items=>items.filter(item=>item.phoneE164!==current.phoneE164));setQueueIndex(0);
      setNotice("Contato registrado. Essa barbearia não receberá outra abordagem.");
      window.dispatchEvent(new Event("prospecting-history-changed"));
    }catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível registrar o envio.");}
  }
  async function sendAutomatically() {
    if (!automatic.connected) return setNotice("Conecte seu WhatsApp antes de enviar.");
    if (!queue.length || sendingRef.current) return;
    sendingRef.current = true;setAutomaticSending(true);setError("");setNotice("");
    try {
      const response = await fetch("/api/affiliate/prospecting/whatsapp",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"enqueue",keys:queue.map(lead=>`phone:${lead.phoneE164}`),template:message})});
      const payload = await response.json() as {jobs?:QueueJob[];blocked?:BlockedClaim[];error?:unknown};
      if (!response.ok) throw new Error(readableError(payload.error,"Não foi possível iniciar o envio."));
      const accepted = new Set((payload.jobs || []).map(job=>job.key));
      setBatchId(payload.jobs?.[0]?.batchId || "");
      setQueue(current=>current.filter(lead=>!accepted.has(`phone:${lead.phoneE164}`)));
      for (const lead of queue) if (accepted.has(`phone:${lead.phoneE164}`)) removeContactedFromScreen(lead);
      setQueueIndex(0);
      setNotice(`${accepted.size} contato${accepted.size===1?"":"s"} na fila. O envio continua mesmo se você fechar a tela.${payload.blocked?.length?` ${payload.blocked.length} não entrou na fila: ${payload.blocked[0].reason || "contato indisponível"}`:""}`);
      await refreshQueue();window.dispatchEvent(new Event("prospecting-history-changed"));
    } catch(cause){setError(cause instanceof Error?cause.message:"Não foi possível iniciar o envio.");}
    finally{sendingRef.current=false;setAutomaticSending(false);}
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
      <div className={styles.cardTitle}><div><b>Seu WhatsApp</b><span>Envie e receba as respostas pelo seu próprio número.</span></div><strong className={automatic.connected?styles.statusOn:styles.statusOff}>{automaticLoading?"CONFERINDO":automatic.connected?"CONECTADO":"CONECTAR"}</strong></div>
      {!automatic.connected && <>
        <div className={styles.phoneFields}><label>País<select aria-label="País"><option>Brasil (+55)</option></select></label><label>DDD e número<input value={whatsapp} onChange={event=>setWhatsapp(event.target.value)} type="tel" autoComplete="tel-national" inputMode="tel" placeholder="(41) 99999-9999" maxLength={20}/></label></div>
        <div className={styles.automaticActions}><button type="button" className={styles.primary} onClick={connectAutomatic} disabled={automaticConnecting||automaticLoading}>{automaticConnecting?"Gerando código...":"Conectar meu WhatsApp"}</button><button type="button" className={styles.secondary} onClick={()=>void refreshAutomatic(true)} disabled={automaticLoading}>Conferir conexão</button></div>
      </>}
      {pairingCode && <div className={styles.pairingBox}><small>CÓDIGO DE CONEXÃO</small><strong>{pairingCode}</strong><button type="button" className={styles.secondary} onClick={()=>void navigator.clipboard.writeText(pairingCode).then(()=>setNotice("Código copiado.")).catch(()=>setNotice("Selecione o código para copiar."))}>Copiar código</button><p>No WhatsApp: Configurações ou menu → Aparelhos conectados → Conectar aparelho → Conectar com número de telefone. Digite o código acima.</p></div>}
      {automatic.connected && <p className={styles.helper}>Suas mensagens e respostas usam esta conexão. Seu link de indicação é incluído automaticamente.</p>}
    </section>

    <section className={styles.card}>
      <div className={styles.cardTitle}><div><b>1. Buscar barbearias</b><span>Escolha a cidade e, se quiser, procure uma barbearia específica pelo nome.</span></div></div>
      <form className={styles.searchForm} onSubmit={search}>
        <label><span>Estado</span><select value={uf} onChange={(event) => { setCitiesLoading(true); setUf(event.target.value); setCity(""); }}>{STATES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
        <label><span>Cidade</span><select value={city} onChange={(event) => setCity(event.target.value)} disabled={citiesLoading}><option value="">{citiesLoading ? "Carregando..." : "Selecione"}</option>{cities.map((item) => <option value={item.name} key={item.id}>{item.name}</option>)}</select></label>
        <label><span>Nome da barbearia <small>(opcional)</small></span><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Ex.: Kaio Barbearia" maxLength={80} autoComplete="off" /></label>
        <button disabled={automaticSending || loading || citiesLoading || !city}>{loading ? "Buscando..." : businessName.trim() ? "Buscar pelo nome" : "Buscar barbearias"}</button>
      </form>
      <p className={styles.helper}>Quando você digita um nome, a busca procura na fonte da cidade inteira — não apenas nos resultados já carregados na tela.</p>
    </section>

    {(leads.length > 0 || (searchedCity && hasMore)) && <section className={styles.card}>
      <div className={styles.cardTitle}><div><b>2. Selecionar</b><span>{searchedCity}{searchedName ? ` · “${searchedName}”` : ""} · {leads.length}{hasMore ? "+" : ""} disponíveis</span></div>{visibleLeads.length > 0 && <button type="button" className={styles.secondary} onClick={selectVisible}>Selecionar celulares visíveis</button>}</div>
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
      <div className={styles.cardTitle}><div><b>3. Mensagem</b><span>Use {"{barbearia}"} e {"{link}"}. O sistema troca automaticamente.</span></div></div>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} maxLength={1200} />
      <button type="button" className={styles.primary} onClick={prepareQueue} disabled={preparing || automaticSending}>{preparing ? "Reservando barbearias..." : `Preparar ${selectedLeads.length || ""} mensagem${selectedLeads.length === 1 ? "" : "s"}`}</button>
      <p className={styles.helper}>Ao preparar, essas barbearias ficam reservadas para você por 1 hora. Outro afiliado não consegue pegá-las nesse período.</p>
    </section>

    {queue.length > 0 && <section className={styles.card} ref={sendRef}>
      <div className={styles.cardTitle}><div><b>4. Enviar</b><span>{automatic.connected ? "Você pode disparar a fila automaticamente ou abrir uma conversa manualmente." : "Ao enviar manualmente, confirme o envio para registrar o contato."}</span></div><strong>{automaticSending ? `Preparando...` : `${queueIndex + 1}/${queue.length}`}</strong></div>
      {automatic.connected && <button type="button" className={styles.automaticButton} onClick={sendAutomatically} disabled={automaticSending}>{automaticSending ? `Preparando fila...` : `Enviar automaticamente ${queue.length} mensagem${queue.length === 1 ? "" : "s"}`}</button>}
      {currentQueueLead && <div className={styles.sendPanel}>
        <div><small>BARBEARIA ATUAL</small><h2>{currentQueueLead.name}</h2><p>{currentQueueLead.phone} · {currentQueueLead.address}</p></div>
        <div className={styles.preview}>{personalize(message, currentQueueLead, signupUrl)}</div>
        <button type="button" className={styles.whatsappButton} onClick={openWhatsApp} disabled={automaticSending}>Abrir no WhatsApp</button>
        <button type="button" className={styles.secondary} onClick={confirmManualSend} disabled={automaticSending}>Já enviei essa mensagem</button>
        <div className={styles.queueNav}><button type="button" onClick={() => setQueueIndex((value) => Math.max(0, value - 1))} disabled={queueIndex === 0 || automaticSending}>Anterior</button><button type="button" onClick={() => setQueueIndex((value) => Math.min(queue.length - 1, value + 1))} disabled={queueIndex >= queue.length - 1 || automaticSending}>Próxima</button></div>
      </div>}
    </section>}

    {batchJobs.length > 0 && <section className={styles.card} aria-live="polite">
      <div className={styles.cardTitle}><div><b>Progresso do envio</b><span>{completed}/{batchJobs.length} processadas · {batchJobs.filter(job=>job.status==="sent").length} enviadas</span></div><button type="button" className={styles.secondary} onClick={()=>void refreshQueue()}>Atualizar</button></div>
      <div className={styles.jobList}>{batchJobs.slice(0,50).map(job=><article key={job.id}><div><strong>{job.name}</strong><span>{job.delivery==="read"?"Lida":job.delivery==="delivered"?"Entregue":({pending:"Na fila",leased:"Preparando",sending:"Enviando",sent:"Enviada",failed:"Falhou",uncertain:"Conferir envio",cancelled:"Cancelada"} as Record<string,string>)[job.status]||job.status}</span></div>{job.error&&<p>{job.error}</p>}{job.status==="uncertain"&&<a href={`https://wa.me/${job.phoneE164}`} target="_blank" rel="noopener noreferrer">Conferir no meu WhatsApp</a>}</article>)}</div>
      {batchJobs.length>50&&<p className={styles.helper}>Mostrando os 50 primeiros contatos. O progresso inclui o lote inteiro.</p>}
    </section>}

    {(error || notice) && <div className={`${styles.notice} ${error ? styles.error : ""}`}>{error || notice}</div>}
  </main>;
}
