"use client";

import { useMemo, useState } from "react";

const DEFAULT_MESSAGE = "Oi! Tudo bem? Aqui é do Cortou Anotou. A gente criou um sistema simples para barbearias cuidarem de agenda, atendimentos, equipe e financeiro pelo celular. Se fizer sentido pra vocês, posso te mandar o link pra conhecer sem compromisso.";

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BA";
}

export default function ProspeccaoPage() {
  const [city, setCity] = useState("Colombo, PR");
  const [searchedCity, setSearchedCity] = useState("");
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("all");

  const phoneCount = useMemo(() => leads.filter((lead) => lead.phone).length, [leads]);
  const selectedLeads = useMemo(() => leads.filter((lead) => selected.has(lead.id)), [leads, selected]);
  const selectedWithPhone = useMemo(() => selectedLeads.filter((lead) => lead.phone), [selectedLeads]);
  const visibleLeads = useMemo(() => filter === "phone" ? leads.filter((lead) => lead.phone) : leads, [filter, leads]);

  async function search(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    setSelected(new Set());
    try {
      const response = await fetch(`/api/leads/search?city=${encodeURIComponent(city)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível pesquisar agora.");
      setLeads(Array.isArray(payload.leads) ? payload.leads : []);
      setSearchedCity(payload.displayName || city);
      if (!payload.leads?.length) setNotice("Não achei barbearias nessa fonte gratuita para essa região. A gente pode complementar com outras fontes depois.");
    } catch (searchError) {
      setLeads([]);
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
    setSelected(new Set(leads.filter((lead) => lead.phone).map((lead) => lead.id)));
  }

  function prepare() {
    if (!selectedWithPhone.length) {
      setNotice("Selecione pelo menos uma barbearia que tenha telefone público.");
      return;
    }
    setNotice(`${selectedWithPhone.length} contato${selectedWithPhone.length === 1 ? "" : "s"} preparado${selectedWithPhone.length === 1 ? "" : "s"}. Nesta versão de teste nenhuma mensagem é enviada ainda.`);
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="https://cortouanotou.com.br" target="_blank" rel="noreferrer">
          <span className="brand-mark">C|A</span>
          <span><strong>Prospecção</strong><small>Cortou Anotou</small></span>
        </a>
        <span className="test-badge">VERSÃO DE TESTE</span>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">NOVOS CLIENTES</span>
          <h1>Encontre barbearias.<br /><em>Escolha quem abordar.</em></h1>
          <p>Pesquise uma cidade, selecione os contatos que fazem sentido e prepare a primeira mensagem do Cortou Anotou.</p>
        </div>
        <div className="hero-status">
          <span className="status-dot" />
          <div><strong>Busca gratuita ativa</strong><small>Primeira fonte: OpenStreetMap</small></div>
        </div>
      </section>

      <section className="search-card">
        <div className="section-heading">
          <div><span>1</span><div><strong>Encontrar barbearias</strong><small>Digite cidade e estado</small></div></div>
          <b>GRÁTIS</b>
        </div>
        <form className="search-form" onSubmit={search}>
          <label>
            <span>Cidade ou região</span>
            <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Ex.: Colombo, PR" minLength={2} maxLength={90} required />
          </label>
          <button disabled={loading}>{loading ? "Buscando..." : "Buscar barbearias"}</button>
        </form>
      </section>

      {(leads.length > 0 || searchedCity) && (
        <>
          <section className="stats-grid">
            <article><small>ENCONTRADAS</small><strong>{leads.length}</strong><span>{searchedCity ? "nessa busca" : ""}</span></article>
            <article><small>COM TELEFONE</small><strong>{phoneCount}</strong><span>prontas para selecionar</span></article>
            <article className="gold"><small>SELECIONADAS</small><strong>{selected.size}</strong><span>{selectedWithPhone.length} com telefone</span></article>
          </section>

          <section className="leads-card">
            <div className="leads-toolbar">
              <div><strong>Barbearias encontradas</strong><small>Você decide quem entra na prospecção.</small></div>
              <button type="button" onClick={selectAllWithPhone}>Selecionar com telefone</button>
            </div>
            <div className="filters">
              <button type="button" className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Todas <b>{leads.length}</b></button>
              <button type="button" className={filter === "phone" ? "active" : ""} onClick={() => setFilter("phone")}>Com telefone <b>{phoneCount}</b></button>
            </div>

            <div className="lead-list">
              {visibleLeads.map((lead) => {
                const checked = selected.has(lead.id);
                return (
                  <article className={`lead-row ${checked ? "selected" : ""}`} key={lead.id}>
                    <button className="lead-check" type="button" onClick={() => toggle(lead.id)} aria-label={`${checked ? "Remover" : "Selecionar"} ${lead.name}`}><span>{checked ? "✓" : ""}</span></button>
                    <div className="avatar">{initials(lead.name)}</div>
                    <div className="lead-main">
                      <div className="lead-title"><strong>{lead.name}</strong><span className={lead.potential === "alto" ? "potential high" : "potential"}>{lead.potential === "alto" ? "Bom potencial" : "Possível lead"}</span></div>
                      <p>{lead.address || "Endereço não informado"}</p>
                      <div className="lead-meta">
                        <span className={lead.phone ? "phone ok" : "phone missing"}>{lead.phone ? `WhatsApp/telefone: ${lead.phone}` : "Telefone não encontrado nessa fonte"}</span>
                        {lead.sourceUrl && <a href={lead.sourceUrl} target="_blank" rel="noreferrer">Ver fonte ↗</a>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <p className="attribution">Dados de localização: © OpenStreetMap contributors. A busca usa apenas dados públicos disponíveis nessa fonte.</p>
          </section>
        </>
      )}

      <section className="message-card">
        <div className="section-heading">
          <div><span>2</span><div><strong>Mensagem de abordagem</strong><small>Você poderá editar antes do envio.</small></div></div>
          <b>{message.length} caracteres</b>
        </div>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} rows={7} />
        <div className="message-options">
          <div className="future-ai"><span>✦</span><div><strong>Mensagem com IA</strong><small>Na próxima etapa, a IA poderá adaptar a abordagem para cada barbearia.</small></div></div>
          <button type="button" onClick={() => setMessage(DEFAULT_MESSAGE)}>Usar mensagem padrão</button>
        </div>
      </section>

      <section className="flow-card">
        <div className="section-heading">
          <div><span>3</span><div><strong>Preparar a prospecção</strong><small>O disparo automático ainda está desligado neste teste.</small></div></div>
        </div>
        <div className="flow-line">
          <span className="done">Encontrar</span><i>→</i><span className={selected.size ? "done" : ""}>Selecionar</span><i>→</i><span>Enviar</span><i>→</i><span>Resposta</span><i>→</i><span>Interessado</span>
        </div>
        <button className="prepare-button" type="button" onClick={prepare}>Preparar {selectedWithPhone.length || ""} contato{selectedWithPhone.length === 1 ? "" : "s"}</button>
      </section>

      {(error || notice) && <div className={error ? "notice error" : "notice"}>{error || notice}</div>}

      <footer>
        <strong>C|A — Prospecção</strong>
        <span>Ambiente separado do Cortou Anotou principal. Nenhuma mensagem é enviada nesta versão.</span>
      </footer>
    </main>
  );
}
