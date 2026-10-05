export type TourStep = {
  selector: string;
  title: string;
  copy: string;
  configTab?: string;
  clickSelector?: string;
  clickButton?: { selector: string; label: string };
  openMenu?: boolean;
  interactive?: boolean;
};
export type TourAccess = { owner: boolean; teamSettings: boolean; productCount?: number };
const target = (name: string) => `[data-tour='${name}']`;

export function configTour(tab: string, access: TourAccess): TourStep[] {
  if (tab === "Serviços") return [
    { selector: target("service-example"), configTab: tab, title: "Seu serviço", copy: "Vamos olhar um serviço da sua lista." },
    { selector: target("service-name"), configTab: tab, clickSelector: `${target("service-example")} .edit-row-actions button:first-child`, title: "Nome do serviço", copy: "É assim que o serviço aparece para você e seus clientes." },
    { selector: target("service-price"), title: "Preço do serviço", copy: "Esse é o valor cobrado." },
    { selector: target("service-duration"), title: "Duração", copy: "Esse tempo ajuda a Agenda a montar os horários sem sobreposição." },
  ];
  if (tab === "Agenda") return [
    { selector: target("hours-enabled"), configTab: tab, title: "Dia aberto ou fechado", copy: "Ative apenas os dias em que a barbearia atende." },
    { selector: target("hours-opening"), title: "Horário de abertura", copy: "Os horários começam a partir daqui." },
    { selector: target("hours-closing"), title: "Horário de fechamento", copy: "O último serviço precisa terminar até esse horário." },
  ];
  if (tab === "Agendamento público") return [
    { selector: target("booking-link"), configTab: tab, title: "Seu link público", copy: "Envie esse endereço para o cliente escolher um horário." },
    { selector: target("booking-copy"), title: "Copiar link", copy: "Copie para compartilhar no WhatsApp ou no Instagram." },
    { selector: target("booking-enabled"), title: "Link público ativo", copy: "Essa opção libera o calendário para os clientes." },
    { selector: target("booking-approval"), title: "Confirmar antes de aceitar", copy: "Ative se quiser aprovar cada pedido de horário." },
  ];
  if (tab === "Pagamentos") return [
    { selector: target("card-payment-example"), configTab: tab, title: "Débito ou crédito", copy: "Cada forma de pagamento pode ter sua própria taxa." },
    { selector: target("card-payment-fee"), configTab: tab, clickSelector: `${target("card-payment-example")} .edit-row-actions button:first-child`, title: "Taxa da maquininha", copy: "Informe aqui a taxa cobrada no débito ou crédito." },
  ];
  if (tab === "Equipe" && access.teamSettings) return [
    { selector: ".settings-layout .edit-list .edit-row:first-child", configTab: tab, title: "Um profissional", copy: "Confira aqui o acesso e a comissão dessa pessoa." },
  ];
  return [];
}

export function sectionTour(section: string, access: TourAccess): TourStep[] {
  if (section === "Painel") return [
    { selector: ".topbar h1", title: "Seu ponto de partida", copy: "Acompanhe aqui o dia a dia da barbearia." },
    { selector: ".section-stage .stat-grid > .stat-card:nth-child(2)", title: "Resumo rápido", copy: "Este cartão mostra o faturamento do período escolhido." },
    { selector: access.teamSettings ? ".team-payout-summary-head button" : ".quick-actions > button:first-child", title: access.teamSettings ? "Acompanhe a equipe" : "Atalho para registrar", copy: access.teamSettings ? "Abra aqui os detalhes dos valores da equipe." : "Toque aqui para registrar seu atendimento." },
    ...(access.owner ? [{ selector: `${target("menu-settings")}`, openMenu: true, title: "Configure seu C|A", copy: "Abra Configurações para revisar seus primeiros passos." }] : []),
  ];
  if (section === "Agenda") return [
    { selector: ".section-stage .agenda-mode-note", title: "Como sua agenda está funcionando", copy: "Aqui você vê se a duração inteligente está ligada e como o C|A protege os horários contra sobreposição." },
    { selector: ".section-stage .appointment-list", title: "Seus horários", copy: "Pedidos, confirmações, Pix, lembretes, remarcações e cancelamentos ficam organizados nesta lista." },
    { selector: ".section-stage .form-card, .section-stage form", title: "Criar ou ajustar um horário", copy: "Use o formulário para agendar internamente. Serviço, profissional, data e horário ficam ligados ao mesmo agendamento." },
  ];

  if (section === "Registrar") return [
    { selector: ".section-stage .type-switch", title: "Escolha o tipo de registro", copy: "Você pode lançar atendimento avulso, mensalista ou somente uma venda de produto." },
    { selector: ".section-stage .app-form", title: "Preencha só o necessário", copy: "Cliente, profissional, serviço e pagamento alimentam Histórico, Financeiro e comissões automaticamente." },
    { selector: ".section-stage .calculation", title: "Confira antes de salvar", copy: "O C|A mostra o valor calculado e explica o que será aplicado antes do registro." },
    { selector: ".section-stage .primary-button", title: "Salvar atendimento", copy: "Ao salvar, os dados entram no histórico sem você precisar atualizar a página." },
  ];

  if (section === "Histórico") return [
    { selector: ".section-stage .history-payment-summary, .section-stage .stat-grid", title: "Resumo do período", copy: "Veja quanto entrou por forma de pagamento e acompanhe comissões e valores do período escolhido." },
    { selector: ".section-stage .history-export-bar", title: "Exportar quando precisar", copy: "Você pode gerar uma planilha organizada para conferência e fechamento." },
    { selector: ".section-stage .table-wrap", title: "Tudo que já aconteceu", copy: "Atendimentos, produtos e horários concluídos ficam aqui. As ações disponíveis respeitam o seu nível de acesso." },
  ];


  if (section === "Produtos" && access.productCount === 0) return access.owner ? [
    { selector: target("product-create"), title: "Seu primeiro produto", copy: "Comece aqui para cadastrar um produto que você vende." },
    { selector: target("product-name"), title: "Nome do produto", copy: "Informe o nome, como pomada, gel ou shampoo." },
    { selector: target("product-price"), title: "Preço de venda", copy: "Informe o valor que você cobra por unidade." },
    { selector: target("product-stock"), title: "Estoque inicial", copy: "Informe quantas unidades você tem disponíveis." },
    { selector: target("product-save"), title: "Cadastrar produto", copy: "Depois de preencher e conferir os dados, toque aqui para cadastrar." },
  ] : [
    { selector: target("product-empty"), title: "Ainda sem produtos", copy: "O proprietário precisa cadastrar o primeiro produto para liberar as vendas." },
  ];
  if (section === "Produtos") return [
    { selector: ".section-stage .product-stat-grid > article:first-child", title: "Vendas de produtos", copy: "Este cartão mostra quanto você vendeu no período." },
    { selector: ".section-stage .product-inventory .product-list > article:first-child", title: "Seu estoque", copy: "Este produto mostra preço, estoque e comissão." },
    { selector: ".section-stage .product-sale-card select[name='productId']", title: "Escolha o produto", copy: "Selecione o item que está sendo vendido." },
    { selector: ".section-stage .product-sale-card input[name='quantity']", title: "Quantidade", copy: "Informe quantas unidades o cliente levou." },
    { selector: ".section-stage .product-sale-card select[name='paymentMethodId']", title: "Pagamento", copy: "Escolha como essa venda foi paga." },
    { selector: ".section-stage .product-sale-card .primary-button", title: "Confirmar venda", copy: "Ao confirmar, a venda é registrada e o estoque baixa." },
  ];
  if (section === "Financeiro") return [
    { selector: target("finance-month"), title: "Escolha o mês", copy: "O gráfico acompanha o mês selecionado." },
    { selector: target("finance-chart"), title: "Faturamento por dia", copy: "Cada ponto mostra quanto entrou naquele dia.", clickButton: { selector: "[data-tour='finance-revenue']", label: "Faturamento" } },
    { selector: target("finance-compare"), title: "Compare períodos", copy: "Escolha outro mês para comparar os dois no gráfico." },
    { selector: target("finance-weekdays"), title: "Dias movimentados", copy: "Aqui você troca faturamento por quantidade de atendimentos." },
    { selector: target("finance-weekday-example"), title: "Movimento por dia", copy: "Esta linha mostra quantos atendimentos o dia da semana recebeu.", clickButton: { selector: "[data-tour='finance-weekdays']", label: "Dias movimentados" } },
    { selector: target("finance-busiest"), title: "Maior movimento", copy: "Este é o dia com mais atendimentos registrados no mês." },
    { selector: target("finance-quietest"), title: "Menor movimento", copy: "Compare o dia com menos atendimentos entre os dias que tiveram registros." },
    { selector: ".finance-stats > article:first-child", title: "Resumo financeiro", copy: "Aqui está a receita de serviços avulsos do período." },
    { selector: ".finance-stats > article:nth-child(4)", title: "Taxas e comissões", copy: "Este valor reúne os custos calculados automaticamente." },
    { selector: ".finance-stats > article:nth-child(5)", title: "Despesas", copy: "Aqui está o total das despesas lançadas no período." },
    { selector: ".finance-stats > .finance-profit", title: "Lucro líquido", copy: "É o que sobrou depois dos custos e despesas." },
    { selector: ".finance-goals-toggle", title: "Metas", copy: "Abra aqui para acompanhar e ajustar suas metas." },
  ];
  if (section === "Configurações") return [
    { selector: target("setup-heading"), configTab: "Primeiros passos", title: "Configure seu C|A", copy: "Escolha um item para aprender e revisar, no seu ritmo." },
    { selector: target("setup-services"), interactive: true, title: "Serviços e preços", copy: "Toque aqui para revisar um serviço, seu preço e sua duração." },
    { selector: target("setup-payments"), interactive: true, title: "Taxas da maquininha", copy: "Aqui você aprende a ajustar as taxas de débito e crédito." },
  ];
  if (section === "WhatsApp") return [{ selector: ".section-stage .panel", title: "WhatsApp do C|A", copy: "Esta área reúne conexão e automações de atendimento. Faça mudanças aqui somente quando souber qual número deve ficar conectado." }];
  if (section === "Equipe") return [{ selector: target("team-users-tab"), title: "Equipe e acessos", copy: "Toque aqui para gerenciar usuários e convites da equipe." }];
  if (section === "Mensalistas") return [{ selector: target("membership-revenue"), title: "Receita dos mensalistas", copy: "Este cartão mostra as mensalidades recebidas no mês escolhido." }];
  if (section === "Minha Grana") return [{ selector: ".section-stage .stat-grid > article:first-child", title: "Minha Grana", copy: "Este cartão mostra seus valores no período." }];
  return [];
}

export function moreTour(): TourStep[] {
  return [
    { selector: ".mobile-drawer [data-tour='menu-help']", title: "Central de ajuda", copy: "Ficou com alguma dúvida? Toque aqui para pedir ajuda." },
    { selector: ".mobile-drawer [data-tour='menu-Agenda']", title: "Sua agenda", copy: "Entre aqui para ver seus horários." },
    { selector: ".mobile-drawer [data-tour='menu-settings']", title: "Configurações", copy: "Seus primeiros passos ficam aqui." },
  ];
}
