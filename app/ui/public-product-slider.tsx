"use client";

import { useRef, useState } from "react";

const slides = [
  {
    key: "painel",
    eyebrow: "PAINEL",
    title: "A barbearia inteira em uma visão.",
    description: "Faturamento, lucro, atendimentos e mensalistas aparecem logo na entrada para você saber como o dia está andando.",
  },
  {
    key: "agenda",
    eyebrow: "AGENDA",
    title: "Horários organizados sem conflito.",
    description: "Visualize a agenda da equipe, horários livres e atendimentos confirmados sem depender de caderno ou conversa perdida.",
  },
  {
    key: "registro",
    eyebrow: "REGISTRAR",
    title: "Terminou o corte? Registra e segue.",
    description: "Serviço, profissional e forma de pagamento ficam registrados no mesmo fluxo, sem transformar o atendimento em burocracia.",
  },
  {
    key: "historico",
    eyebrow: "HISTÓRICO",
    title: "Tudo que aconteceu fica fácil de encontrar.",
    description: "Consulte atendimentos, recebimentos e formas de pagamento por período e profissional com uma visão limpa.",
  },
  {
    key: "mensalistas",
    eyebrow: "MENSALISTAS",
    title: "Plano, uso e renovação sob controle.",
    description: "Acompanhe clientes mensalistas, créditos usados e próximos vencimentos sem fazer conta na mão.",
  },
  {
    key: "financeiro",
    eyebrow: "FINANCEIRO",
    title: "Faturamento é uma coisa. Lucro é outra.",
    description: "Veja entradas, despesas, taxas e repasses em uma leitura simples para entender o dinheiro que realmente ficou.",
  },
  {
    key: "whatsapp",
    eyebrow: "AUTOMAÇÕES",
    title: "WhatsApp trabalhando junto com a agenda.",
    description: "Configure confirmações, lembretes e outros fluxos para reduzir trabalho manual e manter o cliente informado.",
  },
] as const;

type SlideKey = (typeof slides)[number]["key"];

function AppFrame({ screen }: { screen: SlideKey }) {
  return (
    <div className="product-demo-phone" aria-hidden="true">
      <div className="product-demo-topbar">
        <div><b>C</b><i /> <b>A</b><span>CORTOU ANOTOU</span></div>
        <em>●</em>
      </div>
      <div className="product-demo-screen">
        {screen === "painel" && <DashboardPreview />}
        {screen === "agenda" && <AgendaPreview />}
        {screen === "registro" && <RegisterPreview />}
        {screen === "historico" && <HistoryPreview />}
        {screen === "mensalistas" && <MembershipPreview />}
        {screen === "financeiro" && <FinancePreview />}
        {screen === "whatsapp" && <WhatsappPreview />}
      </div>
      <DemoBottomNav active={screen} />
    </div>
  );
}

function DashboardPreview() {
  return (
    <>
      <div className="demo-screen-heading"><small>BOM DIA</small><strong>Sua barbearia hoje.</strong><span>Hoje⌄</span></div>
      <div className="demo-metric-grid">
        <article><i>↗</i><small>Faturamento</small><b>R$ 1.280</b><span>+ 12% no período</span></article>
        <article><i>R$</i><small>Lucro líquido</small><b>R$ 864</b><span>após custos</span></article>
        <article><i>✂</i><small>Atendimentos</small><b>24</b><span>registrados</span></article>
        <article><i>◈</i><small>Mensalistas</small><b>31</b><span>clientes ativos</span></article>
      </div>
      <div className="demo-card demo-goal"><small>Meta do mês</small><b>R$ 14.820 de R$ 20.000</b><span><i style={{ width: "74%" }} /></span></div>
      <div className="demo-card demo-list"><small>Próximos horários</small><p><b>14:20</b><span>Corte · Lucas</span><em>Confirmado</em></p><p><b>15:00</b><span>Corte + barba · Rafael</span><em>Confirmado</em></p></div>
    </>
  );
}

function AgendaPreview() {
  const entries = [
    ["09:00", "Corte", "Lucas", "Confirmado"],
    ["09:40", "Barba", "Rafael", "Confirmado"],
    ["10:20", "Horário livre", "—", "Livre"],
    ["11:00", "Corte + barba", "Marcos", "Confirmado"],
    ["11:50", "Corte", "Lucas", "Aguardando"],
  ];
  return (
    <>
      <div className="demo-screen-heading"><small>AGENDA</small><strong>Agenda de horários</strong><span>Hoje⌄</span></div>
      <div className="demo-day-strip"><b>SEG<small>27</small></b><b className="active">TER<small>28</small></b><b>QUA<small>29</small></b><b>QUI<small>30</small></b></div>
      <div className="demo-card demo-agenda-list">
        {entries.map(([time, service, barber, status]) => <p key={`${time}-${service}`} className={status === "Livre" ? "free" : ""}><b>{time}</b><i /><span><strong>{service}</strong><small>{barber}</small></span><em>{status}</em></p>)}
      </div>
      <button className="demo-primary-button" type="button">+ Novo horário</button>
    </>
  );
}

function RegisterPreview() {
  return (
    <>
      <div className="demo-screen-heading"><small>ATENDIMENTO</small><strong>Registrar atendimento</strong><span>Hoje</span></div>
      <div className="demo-card demo-form-preview">
        <label><span>Cliente</span><b>Gabriel Martins</b></label>
        <div><label><span>Profissional</span><b>Lucas⌄</b></label><label><span>Serviço</span><b>Corte⌄</b></label></div>
        <div><label><span>Valor</span><b>R$ 45,00</b></label><label><span>Pagamento</span><b>Pix⌄</b></label></div>
        <label><span>Produto</span><b>Nenhum produto adicionado</b></label>
      </div>
      <button className="demo-primary-button" type="button">Salvar atendimento →</button>
      <div className="demo-safe-note">✓ Valores demonstrativos · registro integrado ao histórico</div>
    </>
  );
}

function HistoryPreview() {
  const rows = [
    ["Gabriel", "Corte", "Pix", "R$ 45"],
    ["Henrique", "Corte + barba", "Crédito", "R$ 80"],
    ["André", "Barba", "Dinheiro", "R$ 35"],
  ];
  return (
    <>
      <div className="demo-screen-heading"><small>HISTÓRICO</small><strong>Histórico completo</strong><span>Este mês⌄</span></div>
      <div className="demo-history-summary"><article><small>Recebido</small><b>R$ 7.460</b></article><article><small>Atendimentos</small><b>148</b></article></div>
      <div className="demo-card demo-history-list">
        {rows.map(([name, service, payment, value]) => <p key={name}><span><b>{name}</b><small>{service} · {payment}</small></span><strong>{value}</strong></p>)}
      </div>
      <div className="demo-payment-chips"><span>Pix 52%</span><span>Cartão 31%</span><span>Dinheiro 17%</span></div>
    </>
  );
}

function MembershipPreview() {
  return (
    <>
      <div className="demo-screen-heading"><small>MENSALISTAS</small><strong>Clientes ativos</strong><span>31 ativos</span></div>
      <div className="demo-membership-head"><article><small>Receita recorrente</small><b>R$ 3.420</b></article><article><small>Renovam em breve</small><b>5</b></article></div>
      <div className="demo-card demo-membership-list">
        <p><span className="demo-avatar">GM</span><span><b>Gabriel Martins</b><small>Plano Corte · vence dia 08</small></span><em>2/4 usos</em></p>
        <p><span className="demo-avatar">HN</span><span><b>Henrique Nunes</b><small>Plano Completo · vence dia 10</small></span><em>3/4 usos</em></p>
        <p><span className="demo-avatar">AS</span><span><b>Arthur Silva</b><small>Plano Corte · vence dia 12</small></span><em>1/4 uso</em></p>
      </div>
      <button className="demo-outline-button" type="button">+ Novo mensalista</button>
    </>
  );
}

function FinancePreview() {
  return (
    <>
      <div className="demo-screen-heading"><small>FINANCEIRO</small><strong>Visão do negócio</strong><span>Setembro⌄</span></div>
      <div className="demo-finance-cards"><article><small>Entradas</small><b>R$ 18.640</b></article><article><small>Despesas</small><b>R$ 5.230</b></article><article className="highlight"><small>Lucro líquido</small><b>R$ 9.870</b></article></div>
      <div className="demo-card demo-chart"><div><small>Movimento do mês</small><b>Receita por semana</b></div><section><i style={{ height: "40%" }} /><i style={{ height: "58%" }} /><i style={{ height: "76%" }} /><i style={{ height: "92%" }} /><i style={{ height: "67%" }} /><i style={{ height: "84%" }} /></section><footer><span>S1</span><span>S2</span><span>S3</span><span>S4</span><span>S5</span><span>S6</span></footer></div>
      <div className="demo-finance-line"><span>Repasses da equipe</span><b>R$ 3.540</b></div>
    </>
  );
}

function WhatsappPreview() {
  return (
    <>
      <div className="demo-screen-heading"><small>WHATSAPP</small><strong>Automações</strong><span>Configurar</span></div>
      <div className="demo-automation-status"><i>●</i><span><b>Automação da barbearia</b><small>Fluxos configuráveis por conta</small></span><em>Ativo</em></div>
      <div className="demo-card demo-automation-list">
        <p><i>✓</i><span><b>Confirmação de agendamento</b><small>Após a confirmação do horário</small></span><em>Ligado</em></p>
        <p><i>✓</i><span><b>Lembrete do cliente</b><small>Antes do atendimento</small></span><em>Ligado</em></p>
        <p><i>↻</i><span><b>Cancelamento e remarcação</b><small>Fluxo integrado à agenda</small></span><em>Pronto</em></p>
      </div>
      <div className="demo-chat-preview"><p className="out">Seu horário foi confirmado para hoje às 16:20.</p><p className="in">Perfeito, obrigado!</p></div>
      <small className="demo-disclaimer">Prévia de funcionamento com dados demonstrativos.</small>
    </>
  );
}

function DemoBottomNav({ active }: { active: SlideKey }) {
  const mapped = active === "historico" ? "historico" : active === "agenda" ? "agenda" : active === "financeiro" || active === "mensalistas" || active === "whatsapp" ? "mais" : active === "registro" ? "registrar" : "painel";
  return (
    <div className="product-demo-nav">
      <span className={mapped === "painel" ? "active" : ""}><i>▦</i>Painel</span>
      <span className={mapped === "agenda" ? "active" : ""}><i>□</i>Agenda</span>
      <span className={mapped === "registrar" ? "active center" : "center"}><i>＋</i>Registrar</span>
      <span className={mapped === "historico" ? "active" : ""}><i>↺</i>Histórico</span>
      <span className={mapped === "mais" ? "active" : ""}><i>•••</i>Mais</span>
    </div>
  );
}

export function PublicProductSlider() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function goTo(index: number) {
    const track = trackRef.current;
    const target = track?.children.item(index) as HTMLElement | null;
    if (!track || !target) return;
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: "smooth" });
    setActive(index);
  }

  function syncActive() {
    const track = trackRef.current;
    if (!track) return;
    let closest = 0;
    let distance = Number.POSITIVE_INFINITY;
    Array.from(track.children).forEach((child, index) => {
      const element = child as HTMLElement;
      const current = Math.abs(element.offsetLeft - track.offsetLeft - track.scrollLeft);
      if (current < distance) {
        distance = current;
        closest = index;
      }
    });
    setActive(closest);
  }

  return (
    <section className="public-product-tour" id="produto">
      <div className="public-product-tour-heading">
        <div>
          <span>VEJA O CORTOU ANOTOU POR DENTRO</span>
          <h2>Não precisa imaginar.<br />Dá para ver como a rotina fica.</h2>
          <p>Arraste para o lado e conheça as principais áreas do aplicativo. As prévias usam dados demonstrativos para mostrar a experiência sem expor nenhuma barbearia real.</p>
        </div>
        <div className="public-product-tour-arrows" aria-label="Navegação do carrossel">
          <button type="button" onClick={() => goTo(Math.max(0, active - 1))} disabled={active === 0} aria-label="Tela anterior">←</button>
          <button type="button" onClick={() => goTo(Math.min(slides.length - 1, active + 1))} disabled={active === slides.length - 1} aria-label="Próxima tela">→</button>
        </div>
      </div>

      <div className="public-product-track" ref={trackRef} onScroll={syncActive}>
        {slides.map((slide, index) => (
          <article className={`public-product-slide${index === active ? " active" : ""}`} key={slide.key}>
            <div className="public-product-slide-copy">
              <span>{slide.eyebrow}</span>
              <h3>{slide.title}</h3>
              <p>{slide.description}</p>
              <small>{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</small>
            </div>
            <AppFrame screen={slide.key} />
          </article>
        ))}
      </div>

      <div className="public-product-dots" aria-label={`Tela ${active + 1} de ${slides.length}`}>
        {slides.map((slide, index) => <button key={slide.key} type="button" className={index === active ? "active" : ""} onClick={() => goTo(index)} aria-label={`Ir para ${slide.eyebrow}`} />)}
      </div>
    </section>
  );
}
