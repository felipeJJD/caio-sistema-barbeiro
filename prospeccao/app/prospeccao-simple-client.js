"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_FUNNEL = "ca-prospeccao-funnel-v2";
const STORAGE_HISTORY = "ca-prospeccao-search-history-v1";
const DISPLAY_STEP = 10;

const STATES = [
  ["AC", "Acre"], ["AL", "Alagoas"], ["AP", "Amapá"], ["AM", "Amazonas"], ["BA", "Bahia"],
  ["CE", "Ceará"], ["DF", "Distrito Federal"], ["ES", "Espírito Santo"], ["GO", "Goiás"], ["MA", "Maranhão"],
  ["MT", "Mato Grosso"], ["MS", "Mato Grosso do Sul"], ["MG", "Minas Gerais"], ["PA", "Pará"], ["PB", "Paraíba"],
  ["PR", "Paraná"], ["PE", "Pernambuco"], ["PI", "Piauí"], ["RJ", "Rio de Janeiro"], ["RN", "Rio Grande do Norte"],
  ["RS", "Rio Grande do Sul"], ["RO", "Rondônia"], ["RR", "Roraima"], ["SC", "Santa Catarina"], ["SP", "São Paulo"],
  ["SE", "Sergipe"], ["TO", "Tocantins"],
];

const SIGNUP_URL = "https://cortouanotou.com.br/comece";

const TEMPLATES = {
  curta: `Oi pessoal da {barbearia}! Tudo bem? Aqui é do Cortou Anotou. Criamos um sistema simples para barbearias cuidarem de agenda, atendimentos, equipe e financeiro pelo celular. Dá uma olhada: ${SIGNUP_URL}`,
  consultiva: `Oi pessoal da {barbearia}! Tudo certo? Encontrei o contato de vocês em {cidade}. Eu faço parte do Cortou Anotou, um sistema feito para facilitar agenda, registro de atendimentos, equipe e financeiro. Se quiser conhecer: ${SIGNUP_URL}`,
};

function initials(name) {
  return String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BA";
}

function contactKey(lead) {
  return lead?.phoneE164 ? `phone:${lead.phoneE164}` : `lead:${lead.id}`;
}

function personalize(template, lead, city) {
  return template
    .replaceAll("{barbearia}", lead?.name || "barbearia")
    .replaceAll("{cidade}", String(city || "sua cidade").split(",")[0]);
}

function safeLoad(key, fallback) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseCityUf(value) {
  const match = String(value || "").trim().match(/^(.+?),\s*([A-Za-z]{2})$/);
  if (!match) return null;
  return { city: match[1].trim(), uf: match[2].toUpperCase() };
}

function mergeLeads(current, incoming) {
  const map = new Map(current.map((lead) => [contactKey(lead), lead]));
  for (const lead of incoming) {
    const key = contactKey(lead);
    const existing = map.get(key);
    if (!existing || (lead?.confidence ?? 0) > (existing?.confidence ?? 0)) map.set(key, lead);
  }
  return [...map.values()];
}

async function historyRequest(method = "GET", body) {
  const response = await fetch("/api/funnel", {
    method,
    cache: "no-store",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Não foi possível salvar o histórico da prospecção.");
  return payload;
}

export default function ProspeccaoSimpleClient() {
  const [uf, setUf] = useState("PR");
  const [city, setCity] = useState("Colombo");
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [citiesError, setCitiesError] = useState("");
  const [searchedCity, setSearchedCity] = useState("");
  const [scope, setScope] = useState("");
  const [searchTip, setSearchTip] = useState("");
  const [leads, setLeads] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [activeQuery, setActiveQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(DISPLAY_STEP);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState(TEMPLATES.curta);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [sendingId, setSendingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [history, setHistory] = useState([]);

  useEffect(() => {
    setHistory(safeLoad(STORAGE_HISTORY, []));
    const legacy = safeLoad(STORAGE_FUNNEL, []);
    if (Array.isArray(legacy) && legacy.length) {
      historyRequest("POST", { leads: legacy, city: "" })
        .then(() => localStorage.removeItem(STORAGE_FUNNEL))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    let active = true;
    setCitiesLoading(true);
    setCitiesError("");

    fetch(`/api/locations/cities?uf=${encodeURIComponent(uf)}`, { cache: "force-cache" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Não consegui carregar as cidades.");
        return Array.isArray(payload.cities) ? payload.cities : [];
      })
      .then((nextCities) => {
        if (!active) return;
        setCities(nextCities);
        setCity((current) => nextCities.some((item) => item.name === current) ? current : "");
      })
      .catch((loadError) => {
        if (!active) return;
        setCities([]);
        setCity("");
        setCitiesError(loadError instanceof Error ? loadError.message : "Não consegui carregar as cidades.");
      })
      .finally(() => {
        if (active) setCitiesLoading(false);
      });

    return () => { active = false; };
  }, [uf]);

  const whatsappCount = useMemo(() => leads.filter((lead) => lead.whatsappCandidate).length, [leads]);
  const selectedLeads = useMemo(() => leads.filter((lead) => selected.has(lead.id)), [leads, selected]);
  const selectedWithWhatsApp = useMemo(() => selectedLeads.filter((lead) => lead.whatsappCandidate && lead.phoneE164), [selectedLeads]);
  const filteredLeads = useMemo(() => {
    if (filter === "phone") return leads.filter((lead) => lead.whatsappCandidate);
    if (filter === "strong") return leads.filter((lead) => lead.potential === "alto" || lead.potential === "bom");
    return leads;
  }, [filter, leads]);
  const displayedLeads = useMemo(() => filteredLeads.slice(0, visibleCount), [filteredLeads, visibleCount]);
  const canShowMore = displayedLeads.length < filteredLeads.length || hasMore;

  function selectRegion(nextUf, nextCity = "") {
    setUf(nextUf);
    setCity(nextCity);
    setCitiesError("");
  }

  function changeFilter(nextFilter) {
    setFilter(nextFilter);
    setVisibleCount(DISPLAY_STEP);
  }

  async function search(event, forcedCity) {
    event?.preventDefault?.();
    const query = String(forcedCity || (city && uf ? `${city}, ${uf}` : "")).trim();
    if (query.length < 2) {
      setNotice("Escolha o estado e a cidade antes de pesquisar.");
      return;
    }

    if (forcedCity) {
      const parsed = parseCityUf(query);
      if (parsed) selectRegion(parsed.uf, parsed.city);
    }

    setLoading(true);
    setMoreLoading(false);
    setError("");
    setNotice("");
    setSearchTip("");
    setScope("");
    setSelected(new Set());
    setVisibleCount(DISPLAY_STEP);
    setFilter("all");

    try {
      const response = await fetch(`/api/leads/search?city=${encodeURIComponent(query)}&offset=0`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível pesquisar agora.");
      const nextLeads = Array.isArray(payload.leads) ? payload.leads : [];
      setLeads(nextLeads);
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number(payload.nextOffset) || nextLeads.length);
      setActiveQuery(query);
      setSearchedCity(payload.displayName || query);
      setScope(payload.scope || "");
      setSearchTip(payload.tip || "");
      setHistory((current) => [query, ...current.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 6));
      if (!nextLeads.length) setNotice("Não achei barbearias nessa cidade. Escolha outra cidade e tente novamente.");
    } catch (searchError) {
      setLeads([]);
      setHasMore(false);
      setNextOffset(0);
      setActiveQuery("");
      setSearchedCity("");
      setError(searchError instanceof Error ? searchError.message : "Não foi possível pesquisar agora.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (moreLoading) return;
    if (displayedLeads.length < filteredLeads.length) {
      setVisibleCount((current) => current + DISPLAY_STEP);
      return;
    }
    if (!hasMore || !activeQuery) return;

    setMoreLoading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/leads/search?city=${encodeURIComponent(activeQuery)}&offset=${encodeURIComponent(nextOffset)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar mais barbearias agora.");
      const incoming = Array.isArray(payload.leads) ? payload.leads : [];
      setLeads((current) => mergeLeads(current, incoming));
      setHasMore(Boolean(payload.hasMore));
      setNextOffset(Number(payload.nextOffset) || nextOffset + incoming.length);
      setVisibleCount((current) => current + DISPLAY_STEP);
      if (!incoming.length && !payload.hasMore) setNotice("Você chegou ao fim dos cadastros disponíveis nessa cidade.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar mais barbearias agora.");
    } finally {
      setMoreLoading(false);
    }
  }

  function toggle(lead) {
    if (!lead?.whatsappCandidate || !lead?.phoneE164) {
      setNotice("Esse cadastro não tem um celular brasileiro válido para abordagem pelo WhatsApp.");
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lead.id)) next.delete(lead.id);
      else next.add(lead.id);
      return next;
    });
  }

  function selectAllWithWhatsApp() {
    const ids = displayedLeads.filter((lead) => lead.whatsappCandidate && lead.phoneE164).map((lead) => lead.id);
    setSelected(new Set(ids));
    setNotice(ids.length ? `${ids.length} celulares visíveis selecionados.` : "Nenhum celular válido nessa parte da lista.");
  }

  async function copyText(value, label = "Mensagem") {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiada.`);
    } catch {
      setNotice("Não consegui copiar automaticamente. Toque e segure o texto para copiar.");
    }
  }

  async function sendLead(lead) {
    if (!lead?.phoneE164 || !/^55\d{11}$/.test(String(lead.phoneE164))) {
      setNotice("Esse contato não passou na validação de celular.");
      return;
    }

    const contactCity = searchedCity || (city && uf ? `${city}, ${uf}` : "");
    const prepared = {
      ...lead,
      city: contactCity,
      message: personalize(message, lead, contactCity),
    };

    const popup = window.open("", "_blank");
    setSendingId(lead.id);
    setError("");
    setNotice("");

    try {
      const payload = await historyRequest("POST", { leads: [prepared], city: contactCity });
      if (Array.isArray(payload.blocked) && payload.blocked.length) {
        popup?.close();
        setNotice(`${lead.name} está marcado como não contatar.`);
        return;
      }

      const url = `https://wa.me/${prepared.phoneE164}?text=${encodeURIComponent(prepared.message)}`;
      if (popup) popup.location.href = url;
      else window.location.assign(url);
      setNotice(`${lead.name}: mensagem preparada no WhatsApp.`);
    } catch (sendError) {
      popup?.close();
      setError(sendError instanceof Error ? sendError.message : "Não foi possível preparar esse contato agora.");
    } finally {
      setSendingId("");
    }
  }

  function potentialLabel(value) {
    if (value === "alto") return "Barbearia confirmada";
    if (value === "bom") return "Celular válido";
    return "Telefone fixo";
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="https://cortouanotou.com.br" target="_blank" rel="noreferrer">
          <span className="brand-mark">C|A</span>
          <span><strong>Prospecção</strong><small>Cortou Anotou</small></span>
        </a>
        <span className="test-badge">AMBIENTE SEPARADO</span>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">NOVOS CLIENTES</span>
          <h1>Encontre barbearias.<br /><em>Envie sua mensagem.</em></h1>
          <p>Escolha uma cidade, selecione os contatos e abra a mensagem pronta no WhatsApp.</p>
        </div>
        <div className="hero-status">
          <span className="status-dot" />
          <div><strong>Busca gratuita ativa</strong><small>Lugares comerciais + validação de telefone brasileiro</small></div>
        </div>
      </section>

      <section className="search-card">
        <div className="section-heading">
          <div><span>1</span><div><strong>Encontrar barbearias</strong><small>Escolha primeiro o estado e depois uma cidade desse estado.</small></div></div>
          <b>GRÁTIS</b>
        </div>
        <form className="search-form region-form" onSubmit={search}>
          <label>
            <span>Estado</span>
            <select value={uf} onChange={(event) => selectRegion(event.target.value, "")} aria-label="Estado">
              {STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
            </select>
          </label>
          <label>
            <span>Cidade</span>
            <select value={city} onChange={(event) => setCity(event.target.value)} disabled={citiesLoading || !cities.length} aria-label="Cidade" required>
              <option value="">{citiesLoading ? "Carregando cidades..." : "Selecione a cidade"}</option>
              {cities.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          <button disabled={loading || citiesLoading || !city}>{loading ? "Buscando barbearias..." : "Buscar barbearias"}</button>
        </form>
        {citiesError && <div className="inline-error">{citiesError}</div>}
        <div className="quick-searches">
          <span>Exemplos:</span>
          {["São Paulo, SP", "Curitiba, PR", "São José dos Pinhais, PR"].map((example) => <button type="button" key={example} onClick={() => search(null, example)}>{example}</button>)}
        </div>
        {history.length > 0 && <div className="search-history"><span>Recentes:</span>{history.map((item) => <button type="button" key={item} onClick={() => search(null, item)}>{item}</button>)}</div>}
      </section>

      {(leads.length > 0 || searchedCity) && (
        <>
          <section className="result-context">
            <div><strong>{searchedCity}</strong><small>{scope ? `Pesquisa em ${scope}.` : ""} {searchTip}</small></div>
            <span>{leads.length}{hasMore ? "+" : ""} carregadas</span>
          </section>

          <section className="stats-grid">
            <article><small>CARREGADAS</small><strong>{leads.length}{hasMore ? "+" : ""}</strong><span>{hasMore ? "há mais disponíveis" : "fim da fonte"}</span></article>
            <article><small>CELULAR VÁLIDO</small><strong>{whatsappCount}</strong><span>entre as carregadas</span></article>
            <article className="gold"><small>SELECIONADAS</small><strong>{selected.size}</strong><span>{selectedWithWhatsApp.length} válidas</span></article>
          </section>

          <section className="leads-card">
            <div className="leads-toolbar">
              <div><strong>Barbearias encontradas</strong><small>A tela começa curta. Use “Ver mais barbearias” para continuar.</small></div>
              <div className="toolbar-actions"><button type="button" onClick={selectAllWithWhatsApp}>Selecionar celulares visíveis</button>{selected.size > 0 && <button type="button" className="ghost" onClick={() => setSelected(new Set())}>Limpar</button>}</div>
            </div>
            <div className="filters">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => changeFilter("all")}>Todas <b>{leads.length}</b></button>
              <button type="button" className={filter === "phone" ? "active" : ""} onClick={() => changeFilter("phone")}>Celular válido <b>{whatsappCount}</b></button>
              <button type="button" className={filter === "strong" ? "active" : ""} onClick={() => changeFilter("strong")}>Melhor potencial <b>{leads.filter((lead) => lead.potential !== "possível").length}</b></button>
            </div>

            <div className="lead-list">
              {displayedLeads.map((lead) => {
                const checked = selected.has(lead.id);
                const canSelect = Boolean(lead.whatsappCandidate && lead.phoneE164);
                return (
                  <article className={`lead-row ${checked ? "selected" : ""}`} key={lead.id}>
                    <button className="lead-check" type="button" onClick={() => toggle(lead)} aria-label={`${checked ? "Remover" : "Selecionar"} ${lead.name}`} aria-disabled={!canSelect}><span>{checked ? "✓" : ""}</span></button>
                    <div className="avatar">{initials(lead.name)}</div>
                    <div className="lead-main">
                      <div className="lead-title"><strong>{lead.name}</strong><span className={`potential ${lead.potential === "alto" ? "high" : lead.potential === "bom" ? "medium" : ""}`}>{potentialLabel(lead.potential)}</span></div>
                      <p>{lead.address || "Endereço não informado"}</p>
                      <div className="lead-meta">
                        {lead.whatsappCandidate ? <span className="phone ok">Celular: {lead.phone}</span> : lead.phoneKind === "landline" ? <span className="phone missing">Fixo: {lead.phone} · ainda não liberado para WhatsApp</span> : <span className="phone missing">Sem celular válido no cadastro</span>}
                        {lead.website && <a href={lead.website} target="_blank" rel="noreferrer">Site ↗</a>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <p className="attribution">Mostrando {displayedLeads.length} de {filteredLeads.length} barbearias já carregadas{hasMore ? " · ainda há mais cadastros para buscar" : " · você chegou ao fim dos cadastros disponíveis na fonte"}.</p>
            {canShowMore && <button className="prepare-button" style={{ marginTop: 14 }} type="button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? "Buscando mais barbearias..." : "Ver mais barbearias"}</button>}
            <p className="attribution">Dados de lugares: Overture Maps Foundation e fontes contribuidoras. O formato do celular é validado antes de liberar o envio.</p>
          </section>
        </>
      )}

      <section className="message-card">
        <div className="section-heading">
          <div><span>2</span><div><strong>Mensagem de abordagem</strong><small>O link do Cortou Anotou já vai junto. Você pode editar antes de enviar.</small></div></div>
          <b>{message.length} caracteres</b>
        </div>
        <div className="template-row">
          <button type="button" className={message === TEMPLATES.curta ? "active" : ""} onClick={() => setMessage(TEMPLATES.curta)}>Curta</button>
          <button type="button" className={message === TEMPLATES.consultiva ? "active" : ""} onClick={() => setMessage(TEMPLATES.consultiva)}>Consultiva</button>
        </div>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} rows={7} />
        <div className="message-options">
          <div className="future-ai"><span>✦</span><div><strong>Personalização automática</strong><small>Nome da barbearia e cidade são adaptados para cada contato.</small></div></div>
          <button type="button" onClick={() => copyText(message, "Modelo")}>Copiar modelo</button>
        </div>
      </section>

      <section className="flow-card">
        <div className="section-heading">
          <div><span>3</span><div><strong>Enviar mensagem</strong><small>Selecione as barbearias acima e abra a conversa pronta no WhatsApp.</small></div></div>
          <b>{selectedWithWhatsApp.length} selecionadas</b>
        </div>

        {selectedWithWhatsApp.length === 0 ? (
          <div className="empty-funnel"><strong>Nenhuma barbearia selecionada.</strong><span>Marque os celulares que você quer abordar e eles aparecem aqui para envio.</span></div>
        ) : (
          <div className="funnel-list">
            {selectedWithWhatsApp.map((lead) => (
              <article className="funnel-row" key={lead.id}>
                <div className="funnel-ident"><div className="avatar">{initials(lead.name)}</div><div><strong>{lead.name}</strong><small>{lead.phone} · {String(searchedCity || city).split(",")[0]}</small></div></div>
                <div className="funnel-actions">
                  <button type="button" onClick={() => copyText(personalize(message, lead, searchedCity || `${city}, ${uf}`), "Mensagem")}>Copiar</button>
                  <button type="button" className="whatsapp" onClick={() => sendLead(lead)} disabled={sendingId === lead.id}>{sendingId === lead.id ? "Preparando..." : "Enviar no WhatsApp"}</button>
                  <button type="button" className="danger" onClick={() => toggle(lead)}>Remover</button>
                </div>
              </article>
            ))}
          </div>
        )}

        <p className="safety-note"><strong>Prático agora:</strong> você seleciona e envia daqui. O sistema continua guardando os contatos por trás para evitar perda e respeitar bloqueios. O disparo automático em lote entra quando conectarmos o número de prospecção.</p>
      </section>

      {(error || notice) && <div className={error ? "notice error" : "notice"}>{error || notice}</div>}

      <footer>
        <strong>C|A — Prospecção</strong>
        <span>Projeto separado do Cortou Anotou principal.</span>
      </footer>
    </main>
  );
}
