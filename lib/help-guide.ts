import type { HelpActionProposal } from "./help-actions";

export type HelpDestination = { section: string; tab?: string; label: string };
export type HelpReply = { answer: string; destination?: HelpDestination; suggestions?: string[]; action?: HelpActionProposal; details?: string; insight?: string; contextMessage?: string };
export type HelpMessage = { role: "user" | "assistant"; content: string };
export const HELP_MESSAGE_LIMIT = 2400;
export function normalizeHelp(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// These destinations are an allowlist shared by the server and the navigation UI.
export const helpTopics = [
  { id: "overview", terms: ["o que faz", "que ele faz", "que o app faz", "que o aplicativo faz", "o que e o", "me explica o app", "sobre o corto", "sobre o cortou", "conhecer", "pra que serve", "para que serve", "primeiros passos"], answer: "O Cortou Anotou ajuda a organizar sua barbearia: agenda, atendimentos, dinheiro, comissões, mensalistas e produtos. Você registra o trabalho e acompanha os resultados. Quer aprender a registrar seu primeiro corte?", section: "Registrar", label: "Ir para Registrar" },
  { id: "register", terms: ["registrar", "anotar corte", "lancar corte", "salvar atendimento", "novo atendimento"], answer: "Em Registrar, escolha Avulso ou Mensalista. Informe o cliente, profissional, serviço e pagamento; depois toque em Salvar. Se vendeu um produto junto, adicione no mesmo registro.", section: "Registrar", label: "Ir para Registrar" },
  { id: "history", terms: ["historico", "editar atendimento", "apagar atendimento", "excluir atendimento", "registro errado", "corrigir corte", "editar corte"], answer: "No Histórico, escolha o período e encontre o atendimento. Use o lápis para corrigir ou a lixeira para excluir. Confira antes de confirmar: os valores e as comissões serão atualizados.", section: "Histórico", label: "Abrir Histórico" },
  { id: "agenda", terms: ["agenda", "agendar", "marcar", "remarcar", "horario", "cancelar agendamento"], answer: "Na Agenda, escolha o dia e o profissional. Você pode criar um horário ou abrir um agendamento para editar, remarcar ou cancelar.", section: "Agenda", label: "Abrir Agenda" },
  { id: "booking", terms: ["link publico", "link de agendamento", "agendar sozinho", "agendamento publico", "fotos", "galeria", "link da barbearia"], answer: "Em Configurações > Agendamento público, ajuste a página da barbearia e copie o link. O cliente escolhe serviço, profissional, dia e horário. Confira também se você quer aprovar os pedidos antes de confirmar.", section: "Configurações", tab: "Agendamento público", label: "Abrir Agendamento público", owner: true },
  { id: "finance", terms: ["financeiro", "despesa", "gastos", "gasto", "contas", "meta"], answer: "No Financeiro, registre as despesas e escolha o período para acompanhar as saídas. Ali você também pode editar despesas e as metas da barbearia.", section: "Financeiro", label: "Abrir Financeiro", owner: true },
  { id: "products", terms: ["produto", "produtos", "estoque", "pomada", "venda"], answer: "Em Produtos você acompanha os itens e registra vendas. Para vender junto com um corte ou somente um produto, use Registrar. Ao salvar a venda, o estoque é atualizado.", section: "Produtos", label: "Abrir Produtos" },
  { id: "members", terms: ["mensalista", "mensalistas", "renovar cliente", "saldo de usos", "plano de cortes"], answer: "Em Mensalistas, escolha o mês e procure o cliente. Você vê o pagamento, os usos e pode renovar. Para descontar um atendimento, use Registrar > Mensalista.", section: "Mensalistas", label: "Abrir Mensalistas", owner: true },
  { id: "member-plans", terms: ["criar plano mensal", "preco da mensalidade", "plano mensalista", "planos de mensalistas"], answer: "Em Configurações > Planos, defina o nome, valor, serviço incluído e quantidade de usos. A comissão por uso vale para o funcionário; o atendimento do proprietário permanece na barbearia.", section: "Configurações", tab: "Planos", label: "Configurar planos de mensalistas", owner: true },
  { id: "team", terms: ["equipe", "funcionario", "profissional", "convidar", "convite", "acesso do barbeiro"], answer: "Em Equipe você acompanha os profissionais e encontra Usuários e convites. Gere um convite ligado ao profissional correto. Cada funcionário acessa somente os próprios dados permitidos.", section: "Equipe", label: "Abrir Equipe", owner: true },
  { id: "commissions", terms: ["comissao", "comissoes", "repasse", "repasses"], answer: "No Painel, consulte as comissões calculadas no período. Para mudar o percentual de um profissional, use Configurações > Equipe. Em Equipe > Vales e pagamentos, registre o que já foi pago ou adiantado. Gorjetas pertencem a quem atendeu. Comissão gerada e pagamento realizado são valores diferentes; também posso consultar seus números aqui.", section: "Painel", label: "Ver comissões", owner: true },
  { id: "team-payments", terms: ["vales e pagamentos", "vale do barbeiro", "pagamento do funcionario", "adiantamento", "fechamento dos barbeiros"], answer: "Em Equipe > Vales e pagamentos, o proprietário lança vales, pagamentos e fechamentos por profissional. O barbeiro vê os próprios valores em Minha Grana. Um lançamento de pagamento registra a conciliação; não transfere dinheiro por conta própria.", section: "Equipe", label: "Abrir Vales e pagamentos", owner: true },
  { id: "staff-money", terms: ["minha grana", "meus vales", "meus pagamentos", "meu fechamento"], answer: "Em Minha Grana, o barbeiro confere comissões geradas, vales e pagamentos próprios. Para detalhar um período, pergunte quanto você fez ou quanto ficou de comissão.", section: "Minha Grana", label: "Abrir Minha Grana" },
  { id: "availability", terms: ["horarios livres", "vagas para agendar", "nao consegue agendar", "sem vagas"], answer: "Posso conferir as vagas reais se você disser o dia e o serviço. Elas dependem do expediente da barbearia, do horário do profissional, da duração do serviço e dos agendamentos existentes.", section: "Agenda", label: "Abrir Agenda" },
  { id: "notifications", terms: ["notificacao", "notificacoes", "aviso de horario", "aviso de agendamento", "sino"], answer: "No sino do aplicativo aparecem os avisos do seu acesso. O dono recebe eventos da barbearia e o barbeiro recebe os próprios horários. Avisos na tela bloqueada também dependem da permissão de notificações do aparelho; no iPhone, o site precisa estar adicionado à tela inicial.", section: "Agenda", label: "Abrir Agenda" },
  { id: "export", terms: ["exportar planilha", "baixar excel", "salvar planilha", "exportar historico"], answer: "Em Histórico, escolha período e profissional e toque em Exportar Excel. O arquivo organiza resumo e profissionais em guias. Exporte somente os dados aos quais o seu acesso tem direito.", section: "Histórico", label: "Abrir Histórico" },
  { id: "prices", terms: ["servicos", "servico", "alterar preco", "mudar preco", "preco do corte"], answer: "Em Configurações > Serviços, escolha o serviço para ajustar nome, preço e duração. As mudanças valem para os próximos registros.", section: "Configurações", tab: "Serviços", label: "Configurar serviços", owner: true },
  { id: "payments", terms: ["forma de pagamento", "taxa do cartao", "taxas", "debito", "credito"], answer: "Em Configurações > Pagamentos, ajuste as formas de pagamento e as taxas. Ao registrar um atendimento, escolha como o cliente pagou.", section: "Configurações", tab: "Pagamentos", label: "Configurar pagamentos", owner: true },
  { id: "clients", terms: ["cadastrar cliente", "cadastro de cliente", "cadastros de clientes"], answer: "Em Configurações > Clientes você cadastra o mensalista com plano e pagamento. Para um atendimento avulso, basta informar o nome do cliente em Registrar.", section: "Configurações", tab: "Clientes", label: "Abrir cadastro de clientes", owner: true },
  { id: "password", terms: ["senha", "login", "entrar", "sessao"], answer: "Use o e-mail e a senha cadastrados. Na tela de entrada, Esqueci minha senha permite recuperar o acesso. Nunca envie sua senha por aqui.", section: "Configurações", tab: "Minha senha", label: "Alterar minha senha", owner: true },
  { id: "subscription", terms: ["assinar", "assinar o plano", "meu plano", "pagar o app", "pagar o aplicativo", "renovar o app", "teste gratis", "assinatura do app", "preco do app", "quanto custa"], answer: "Em Meu plano você confere os planos disponíveis e as opções para renovar seu acesso. Escolha uma opção e confira o valor antes de pagar.", section: "Meu plano", label: "Ver Meu plano", owner: true },
  { id: "dashboard", terms: ["painel", "resultado", "faturamento", "lucro", "dinheiro", "numeros"], answer: "O Painel mostra os resultados do período escolhido. Faturamento é o valor registrado; a sobra desconta comissões, taxas, custo dos produtos e despesas lançadas. Também posso consultar os números por aqui: pergunte quanto a barbearia fez hoje.", section: "Painel", label: "Abrir Painel" },
  { id: "settings", terms: ["configuracao", "configuracoes", "ajustes"], answer: "Nas Configurações você ajusta serviços, pagamentos, equipe, mensalistas e agendamento público. O que você quer mudar?", section: "Configurações", label: "Abrir Configurações", owner: true },
  { id: "voice", terms: ["voz", "microfone", "falar", "gravacao"], answer: "Toque no microfone e grave seu áudio. Durante a gravação você pode pausar, apagar ou enviar. Depois do envio, a transcrição fica escondida e só aparece se você tocar em Ver transcrição. A autorização do microfone é controlada pelo navegador.", section: "", label: "" },
  { id: "support", terms: ["suporte", "ajuda humana", "erro", "nao funciona", "travou"], answer: "Me conte o que você tentou fazer e o que apareceu. Se precisar de atendimento humano, toque em Falar com o suporte aqui embaixo.", section: "", label: "" },
  { id: "affiliates", terms: ["afiliado", "afiliados", "indicacao"], answer: "O afiliado recebe um convite para entrar na central dele. Lá pode gerar links de indicação e acompanhar as barbearias indicadas e as comissões. Para participar, fale com o suporte.", section: "", label: "" },
] as const;

export function destinationAllowed(destination: HelpDestination, owner: boolean) {
  return helpTopics.some(topic => topic.section === destination.section && ("tab" in topic ? topic.tab : undefined) === destination.tab && (!("owner" in topic && topic.owner) || owner));
}
export function guideReply(id: string, owner: boolean): HelpReply | null {
  const topic = helpTopics.find(item => item.id === id);
  if (!topic) return null;
  if (id === "staff-money" && owner) return {answer:"No Painel, consulte os valores da equipe e sua comissão. Em Equipe > Vales e pagamentos, acompanhe os repasses aos funcionários.",destination:{section:"Painel",label:"Abrir Painel"}};
  if ("owner" in topic && topic.owner && !owner) {
    if (id === "commissions" || id === "team") return { answer: "Você pode consultar seus próprios atendimentos e comissões no Histórico. Pergunte também: quanto eu fiz hoje?", destination: { section: "Histórico", label: "Ver meu Histórico" } };
    return { answer: id === "password" ? topic.answer : "Essa área é administrada pelo proprietário. No seu acesso, posso ajudar com seus atendimentos, agenda, produtos e comissões." };
  }
  return { answer: topic.answer, ...(topic.section ? { destination: { section: topic.section, label: topic.label, ...("tab" in topic ? { tab: topic.tab } : {}) } } : {}) };
}
export function findGuide(question: string) {
  const text = normalizeHelp(question);
  if (/(o que|oque).*(app|aplicativo|sistema|corto|cortou).*(faz|serve)|como funciona.*(app|aplicativo|corto|cortou)/.test(text)) return "overview";
  const scored = helpTopics.map(topic => ({ id: topic.id, score: Math.max(0, ...topic.terms.map(term => (` ${text} `).includes(` ${term} `) ? term.split(" ").length * 3 : 0)) })).sort((a,b) => b.score - a.score);
  return scored[0]?.score ? scored[0].id : null;
}

export function requestedHelpAction(question: string): "record" | "appointment" | "expense" | null {
  const text = normalizeHelp(question);
  // Explanations and numeric questions must never initiate a write workflow.
  if (/\b(como|onde|quanto|quantos|qual|explica|explicar|ensina|ensinar|porque)\b/.test(text)) return null;
  if (/\b(registre|registrar|anote|anotar|lance|lancar|crie|criar)\b.*\b(despesa|gasto)\b/.test(text)) return "expense";
  if (/\b(agende|agendar|marque|marcar)\b/.test(text)) return "appointment";
  if (/\b(registre|registrar|anote|anotar|lance|lancar)\b.*\b(corte|atendimento)\b/.test(text)) return "record";
  return null;
}
