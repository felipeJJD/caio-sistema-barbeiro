"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_FUNNEL = "ca-prospeccao-funnel-v1";
const STORAGE_HISTORY = "ca-prospeccao-search-history-v1";

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

function phoneDigits(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) digits = `55${digits}`;
  return digits;
}

function contactKey(lead) {
  const digits = phoneDigits(lead.phone);
  return digits ? `phone:${digits}` : `lead:${lead.id}`;
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

export default function ProspeccaoPage() {
  const [city, setCity] = useState("Colombo, PR");
  const [searchedCity, setSearchedCity] = useState("");
  const [scope, setScope] = useState("");
  const [searchTip, setSearchTip] = useState("");
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState(TEMPLATES.curta);
  const [loading, setLoading] = useState(false);
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

  const phoneCount = useMemo(() => leads.filter((lead) => lead.phone).length, [leads]);
  const selectedLeads = useMemo(() => leads.filter((lead) => selected.has(lead.id)), [leads, selected]);
  const selectedWithPhone = useMemo(() => selectedLeads.filter((lead) => lead.phone), [selectedLeads]);
  const visibleLeads = useMemo(() => {
    if (filter === "phone") return leads.filter((lead) => lead.phone);
    if (filter === "strong") return leads.filter((lead) => lead.potential === "alto" || lead.potential === "bom");
    return leads;
  }, [filter, leads]);
  const funnelCounts = useMemo(() => Object.fromEntries(STATUS_OPTIONS.map(([value]) => [value, funnel.filter((item) => item.status === value).length])), [funnel]);

  async function search(event, forcedCity) {
    event?.preventDefault?.();
    const query = String(forcedCity || city).trim();
    if (query.length < 2) return;
    if (forcedCity) setCity(query);
    setLoading(true);
    setError("");
    setNotice("");
    setSearchTip("");
    setScope("");
    setSelected(new Set());

    try {
      const response = await fetch(`/api/leads/search?city=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível pesquisar agora.");
      const nextLeads = Array.isArray(payload.leads) ? payload.leads : [];
      setLeads(nextLeads);
      setSearchedCity(payload.displayName || query);
      setScope(payload.scope || "");
      setSearchTip(payload.tip || "");
      setHistory((current) => [query, ...current.filter((item) => item.toLowerCase() !== query.toLowerCase())].slice(0, 6));
      if (!nextLeads.length) setNotice("Não achei empresas desse ramo nessa cidade. Tente conferir o nome da cidade ou informar também a UF.");
    } catch (searchError) {
      setLeads([]);
      setSearchedCity("");
      setError(searchError instanceof Error ? searchError.message : "Não foi possível pesquisar agora.");
    } finally {
      setLoading(false);
    }
  }

  function toggle(id) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllWithPhone() {
    const ids = visibleLeads.filter((lead) => lead.phone).map((lead) => lead.id);
    setSelected(new Set(ids));
    setNotice(ids.length ? `${ids.length} contatos com telefone selecionados.` : "Nenhum contato com telefone nessa lista.");
  }

  function prepare() {
    if (!selectedWithPhone.length) {
      setNotice("Selecione pelo menos uma barbearia que tenha telefone.");
      return;
    }
    const now = new Date().toISOString();
    setFunnel((current) => {
      const map = new Map(current.map((item) => [item.key, item]));
      for (const lead of selectedWithPhone) {
        const key = contactKey(lead);
        const existing = map.get(key);
        map.set(key, {
          ...existing,
          key,
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          address: lead.address,
          sourceUrl: lead.sourceUrl,
          city: searchedCity || city,
          status: existing?.status || "preparado",
          message: personalize(message, lead, searchedCity || city),
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        });
      }
      return [...map.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    });
    setNotice(`${selectedWithPhone.length} contato${selectedWithPhone.length === 1 ? "" : "s"} adicionado${selectedWithPhone.length === 1 ? "" : "s"} ao funil.`);
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
    const digits = phoneDigits(item.phone);
    if (!digits) return setNotice("Esse contato não tem um número válido para abrir no WhatsApp.");
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(item.message || personalize(message, item, item.city))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function potentialLabel(value) {
    if (value === "alto") return "Nome indica barbearia";
    if (value === "bom") return "Cadastro com telefone";
    return "Cadastro do ramo";
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
          <p>Digite uma cidade. O sistema procura empresas do ramo, mostra os telefones disponíveis e prepara sua abordagem.</p>
        </div>
        <div className="hero-status">
          <span className="status-dot" />
          <div><strong>Busca gratuita ativa</strong><small>Cadastros públicos de empresas + localização por cidade</small></div>
        </div>
      </section>

      <section className="search-card">
        <div className="section-heading">
          <div><span>1</span><div><strong>Encontrar barbearias</strong><small>Pode escrever “São Paulo” ou, para maior precisão, “São Paulo, SP”.</small></div></div>
          <b>GRÁTIS</b>
        </div>
        <form className="search-form" onSubmit={search}>
          <label>
            <span>Cidade</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex.: São Paulo" minLength={2} maxLength={90} autoComplete="off" required />
          </label>
          <button disabled={loading}>{loading ? "Buscando empresas..." : "Buscar barbearias"}</button>
        </form>
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
            <span>{leads.length} cadastro{leads.length === 1 ? "" : "s"}</span>
          </section>

          <section className="stats-grid">
            <article><small>ENCONTRADAS</small><strong>{leads.length}</strong><span>nessa busca</span></article>
            <article><small>COM TELEFONE</small><strong>{phoneCount}</strong><span>prontas para selecionar</span></article>
            <article className="gold"><small>SELECIONADAS</small><strong>{selected.size}</strong><span>{selectedWithPhone.length} com telefone</span></article>
          </section>

          <section className="leads-card">
            <div className="leads-toolbar">
              <div><strong>Contatos encontrados</strong><small>O CNAE inclui barbearias e negócios próximos do mesmo ramo. Você escolhe quem faz sentido abordar.</small></div>
              <div className="toolbar-actions"><button type="button" onClick={selectAllWithPhone}>Selecionar com telefone</button>{selected.size > 0 && <button type="button" className="ghost" onClick={() => setSelected(new Set())}>Limpar</button>}</div>
            </div>
            <div className="filters">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas <b>{leads.length}</b></button>
              <button type="button" className={filter === "phone" ? "active" : ""} onClick={() => setFilter("phone")}>Com telefone <b>{phoneCount}</b></button>
              <button type="button" className={filter === "strong" ? "active" : ""} onClick={() => setFilter("strong")}>Melhor potencial <b>{leads.filter((lead) => lead.potential !== "possível").length}</b></button>
            </div>

            <div className="lead-list">
              {visibleLeads.map((lead) => {
                const checked = selected.has(lead.id);
                return (
                  <article className={`lead-row ${checked ? "selected" : ""}`} key={lead.id}>
                    <button className="lead-check" type="button" onClick={() => toggle(lead.id)} aria-label={`${checked ? "Remover" : "Selecionar"} ${lead.name}`}><span>{checked ? "✓" : ""}</span></button>
                    <div className="avatar">{initials(lead.name)}</div>
                    <div className="lead-main">
                      <div className="lead-title"><strong>{lead.name}</strong><span className={`potential ${lead.potential === "alto" ? "high" : lead.potential === "bom" ? "medium" : ""}`}>{potentialLabel(lead.potential)}</span></div>
                      <p>{lead.address || "Endereço não informado"}</p>
                      <div className="lead-meta">
                        <span className={lead.phone ? "phone ok" : "phone missing"}>{lead.phone ? `Contato: ${lead.phone}` : "Telefone não publicado no cadastro"}</span>
                        {lead.sourceUrl && <a href={lead.sourceUrl} target="_blank" rel="noreferrer">Ver cadastro ↗</a>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="attribution">Dados cadastrais públicos da Receita Federal consultados por fonte aberta. Telefone aparece somente quando existe no cadastro público da empresa.</p>
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
          <div><span>3</span><div><strong>Adicionar ao funil</strong><small>Escolha os contatos e prepare as mensagens individuais.</small></div></div>
        </div>
        <div className="flow-line">
          <span className="done">Encontrar</span><i>→</i><span className={selected.size ? "done" : ""}>Selecionar</span><i>→</i><span>Preparado</span><i>→</i><span>Contatado</span><i>→</i><span>Interessado</span>
        </div>
        <button className="prepare-button" type="button" onClick={prepare}>Adicionar {selectedWithPhone.length || ""} contato{selectedWithPhone.length === 1 ? "" : "s"} ao funil</button>
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
          <div className="empty-funnel"><strong>Seu funil ainda está vazio.</strong><span>Pesquise uma cidade, selecione contatos com telefone e toque em “Adicionar ao funil”.</span></div>
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
                  <button type="button" className="whatsapp" onClick={() => openWhatsApp(item)}>Abrir WhatsApp</button>
                  <button type="button" className="danger" onClick={() => removeFromFunnel(item.key)}>Remover</button>
                </div>
              </article>
            ))}
          </div>
        )}
        <p className="safety-note"><strong>Importante:</strong> abrir o WhatsApp prepara a conversa. O envio continua manual nesta etapa.</p>
      </section>

      {(error || notice) && <div className={error ? "notice error" : "notice"}>{error || notice}</div>}

      <footer>
        <strong>C|A — Prospecção</strong>
        <span>Projeto separado do Cortou Anotou principal.</span>
      </footer>
    </main>
  );
}
