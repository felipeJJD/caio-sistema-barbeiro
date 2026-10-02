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

const TEMPLATES = {
  curta: "Oi pessoal da {barbearia}! Tudo bem? Aqui é do Cortou Anotou. Criamos um sistema simples para barbearias cuidarem de agenda, atendimentos, equipe e financeiro pelo celular. Posso te mandar o link pra conhecer?",
  consultiva: "Oi pessoal da {barbearia}! Tudo certo? Encontrei o contato de vocês em {cidade}. Eu faço parte do Cortou Anotou, um sistema feito para facilitar agenda, registro de atendimentos, equipe e financeiro. Se fizer sentido, posso te mostrar rapidinho como funciona, sem compromisso.",
};

const STATUS_OPTIONS = [
  ["preparado", "Preparado"],
  ["contatado", "Contatado"],
  ["respondeu", "Respondeu"],
  ["interessado", "Interessado"],
  ["sem_interesse", "Sem interesse"],
];

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

export default function ProspeccaoPage() {
  const [uf, setUf] = useState("PR");
  const [city, setCity] = useState("Colombo");
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [citiesError, setCitiesError] = useState("");
  const [searchedCity, setSearchedCity] = useState("");
  const [scope, setScope] = useState("");
  const [searchTip, setSearchTip] = useState("");
  const [leads, setLeads] = useState([]);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [activeQuery, setActiveQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(DISPLAY_STEP);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState(TEMPLATES.curta);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");
  const [funnel, setFunnel] = useState([]);
  const [history, setHistory] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setFunnel(safeLoad(STORAGE_FUNNEL, []));
    setHistory(safeLoad(STORAGE_HISTORY, []));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_FUNNEL, JSON.stringify(funnel));
  }, [funnel, ready]);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history));
  }, [history, ready]);

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

    return () => {
      active = false;
    };
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
  const funnelCounts = useMemo(() => Object.fromEntries(STATUS_OPTIONS.map(([value]) => [value, funnel.filter((item) => item.status === value).length])), [funnel]);

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
      setTotalAvailable(Number(payload.totalAvailable) || nextLeads.length);
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
      setTotalAvailable(0);
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
      setTotalAvailable((current) => Number(payload.totalAvailable) || current);
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

  function prepare() {
    if (!selectedWithWhatsApp.length) {
      setNotice("Selecione pelo menos uma barbearia com celular válido para WhatsApp.");
      return;
    }
    const now = new Date().toISOString();
    setFunnel((current) => {
      const map = new Map(current.map((item) => [item.key, item]));
      for (const lead of selectedWithWhatsApp) {
        const key = contactKey(lead);
        const existing = map.get(key);
        map.set(key, {
          ...existing,
          key,
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          phoneE164: lead.phoneE164,
          whatsappCandidate: true,
          address: lead.address,
          sourceUrl: lead.sourceUrl,
          city: searchedCity || (city && uf ? `${city}, ${uf}` : ""),
          status: existing?.status || "preparado",
          message: personalize(message, lead, searchedCity || (city && uf ? `${city}, ${uf}` : "")),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
      }
      return [...map.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    });
    setNotice(`${selectedWithWhatsApp.length} contato${selectedWithWhatsApp.length === 1 ? "" : "s"} válido${selectedWithWhatsApp.length === 1 ? "" : "s"} adicionado${selectedWithWhatsApp.length === 1 ? "" : "s"} ao funil.`);
    setSelected(new Set());
    setTimeout(() => document.getElementById("funil")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function updateStatus(key, status) {
    setFunnel((current) => current.map((item) => item.key === key ? { ...item, status, updatedAt: new Date().toISOString() } : item));
  }

  function removeFromFunnel(key) {
    setFunnel((current) => current.filter((item) => item.key !== key));
  }

  async function copyText(value, label = "Mensagem") {
    try {
      await navigator.clipboard.writeText(value);
      setNotice(`${label} copiada.`);
    } catch {
      setNotice("Não consegui copiar automaticamente. Toque e segure o texto para copiar.");
    }
  }

  function openWhatsApp(item) {
    if (!/^55\d{10,11}$/.test(String(item?.phoneE164 || ""))) {
      setNotice("Esse contato não passou na validação de telefone.");
      return;
    }
    const url = `https://wa.me/${item.phoneE164}?text=${encodeURIComponent(item.message || personalize(message, item, item.city))}`;
    window.open(url, "_blank", "noopener,noreferrer");
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
          <h1>Encontre barbearias.<br /><em>Organize a abordagem.</em></h1>
          <p>Escolha um estado e uma cidade. O sistema procura barbearias reais, valida os telefones encontrados e prepara sua abordagem.</p>
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
            <span>{totalAvailable || leads.length} cadastro{(totalAvailable || leads.length) === 1 ? "" : "s"} na fonte</span>
          </section>

          <section className="stats-grid">
            <article><small>ENCONTRADAS</small><strong>{totalAvailable || leads.length}</strong><span>disponíveis na fonte</span></article>
            <article><small>CELULAR VÁLIDO</small><strong>{whatsappCount}</strong><span>entre as carregadas</span></article>
            <article className="gold"><small>SELECIONADAS</small><strong>{selected.size}</strong><span>{selectedWithWhatsApp.length} válidas</span></article>
          </section>

          <section className="leads-card">
            <div className="leads-toolbar">
              <div><strong>Barbearias encontradas</strong><small>A tela começa curta. Use “Ver mais barbearias” para continuar carregando os outros cadastros.</small></div>
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
                        {lead.whatsappCandidate ? (
                          <span className="phone ok">Celular: {lead.phone}</span>
                        ) : lead.phoneKind === "landline" ? (
                          <span className="phone missing">Fixo: {lead.phone} · ainda não liberado para WhatsApp</span>
                        ) : (
                          <span className="phone missing">Sem celular válido no cadastro</span>
                        )}
                        {lead.website && <a href={lead.website} target="_blank" rel="noreferrer">Site ↗</a>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <p className="attribution">Mostrando {displayedLeads.length} de {filteredLeads.length} barbearias carregadas{totalAvailable ? ` · ${totalAvailable} cadastros disponíveis na fonte para essa cidade` : ""}.</p>
            {canShowMore && <button className="prepare-button" style={{ marginTop: 14 }} type="button" onClick={loadMore} disabled={moreLoading}>{moreLoading ? "Buscando mais barbearias..." : "Ver mais barbearias"}</button>}
            <p className="attribution">Dados de lugares: Overture Maps Foundation e fontes contribuidoras. O formato do telefone é validado antes de entrar no funil; quando conectarmos o número de prospecção, a Evolution fará a confirmação automática de WhatsApp.</p>
          </section>
        </>
      )}

      <section className="message-card">
        <div className="section-heading">
          <div><span>2</span><div><strong>Mensagem de abordagem</strong><small>Use {"{barbearia}"} e {"{cidade}"}; o sistema personaliza cada contato.</small></div></div>
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
          <div><span>3</span><div><strong>Adicionar ao funil</strong><small>Escolha celulares válidos e prepare as mensagens individuais.</small></div></div>
        </div>
        <div className="flow-line">
          <span className="done">Encontrar</span><i>→</i><span className={selected.size ? "done" : ""}>Selecionar</span><i>→</i><span>Preparado</span><i>→</i><span>Contatado</span><i>→</i><span>Interessado</span>
        </div>
        <button className="prepare-button" type="button" onClick={prepare}>Adicionar {selectedWithWhatsApp.length || ""} contato{selectedWithWhatsApp.length === 1 ? "" : "s"} ao funil</button>
      </section>

      <section className="funnel-card" id="funil">
        <div className="section-heading">
          <div><span>4</span><div><strong>Funil de prospecção</strong><small>Fica salvo neste navegador e você atualiza o andamento de cada contato.</small></div></div>
          <b>{funnel.length} contatos</b>
        </div>
        <div className="funnel-stats">
          {STATUS_OPTIONS.map(([value, label]) => <div key={value}><strong>{funnelCounts[value] || 0}</strong><span>{label}</span></div>)}
        </div>
        {funnel.length === 0 ? (
          <div className="empty-funnel"><strong>Seu funil ainda está vazio.</strong><span>Escolha um estado e uma cidade, selecione celulares válidos e toque em “Adicionar ao funil”.</span></div>
        ) : (
          <div className="funnel-list">
            {funnel.map((item) => (
              <article className="funnel-row" key={item.key}>
                <div className="funnel-ident"><div className="avatar">{initials(item.name)}</div><div><strong>{item.name}</strong><small>{item.phone} · {String(item.city || "").split(",")[0]}</small></div></div>
                <select value={item.status} onChange={(event) => updateStatus(item.key, event.target.value)} aria-label={`Status de ${item.name}`}>
                  {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div className="funnel-actions">
                  <button type="button" onClick={() => copyText(item.message, "Mensagem")}>Copiar</button>
                  <button type="button" className="whatsapp" onClick={() => openWhatsApp(item)}>Testar no WhatsApp</button>
                  <button type="button" className="danger" onClick={() => removeFromFunnel(item.key)}>Remover</button>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="safety-note"><strong>Importante:</strong> o celular já passou pela validação de formato. Nesta etapa, “Testar no WhatsApp” confirma manualmente se aquele número possui conta; depois a Evolution fará essa checagem automaticamente.</p>
      </section>

      {(error || notice) && <div className={error ? "notice error" : "notice"}>{error || notice}</div>}

      <footer>
        <strong>C|A — Prospecção</strong>
        <span>Projeto separado do Cortou Anotou principal.</span>
      </footer>
    </main>
  );
}
