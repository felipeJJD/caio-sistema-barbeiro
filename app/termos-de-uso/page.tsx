import type { Metadata } from "next";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_URL } from "../../lib/support";
import { LegalPage } from "../ui/legal-page";

export const metadata: Metadata = { title: "Termos de uso | Cortou Anotou", description: "Condições de uso do aplicativo Cortou Anotou." };

export default function TermsPage() {
  return <LegalPage title="Termos de Uso" subtitle="As condições básicas para usar o Cortou Anotou e os recursos de gestão da sua barbearia.">
    <section><h2>1. Serviço</h2><p>O Cortou Anotou reúne agenda, registros de atendimentos, equipe e ferramentas de gestão. Recursos adicionais, como pagamentos e WhatsApp, só funcionam quando estiverem disponíveis e configurados para a conta. A contratação de um plano não conecta automaticamente um número de WhatsApp.</p></section>
    <section><h2>2. Conta e acesso</h2><p>O responsável pela conta deve fornecer informações corretas, proteger suas credenciais e controlar o acesso das pessoas da equipe. O profissional ou funcionário utiliza apenas as funções autorizadas para seu perfil. Não é permitido usar a conta de outra barbearia nem contornar as permissões do aplicativo.</p></section>
    <section><h2>3. Conteúdo e registros</h2><p>A barbearia é responsável pelas informações que insere sobre seus serviços, profissionais, clientes, agendamentos e valores, inclusive pela conferência dos registros financeiros e pelas informações prestadas aos clientes. O aplicativo oferece ferramentas de organização; lançamentos inseridos incorretamente devem ser conferidos e corrigidos por quem tem permissão na conta.</p></section>
    <section><h2>4. Comunicações e WhatsApp</h2><p>A integração com WhatsApp é opcional e depende de uma conta/número elegível, conexão pela Meta, configuração do plano e ativação pela barbearia. A barbearia deve respeitar as regras da plataforma de mensagens e enviar somente comunicações permitidas aos seus clientes. A disponibilidade e a aprovação de recursos externos dependem também dos respectivos fornecedores.</p></section>
    <section><h2>5. Teste, planos e cobrança</h2><p>Quando houver teste gratuito, a duração e as condições são informadas na contratação. Ao final, a continuidade dos recursos pagos depende da escolha de um plano disponível. Preços, limites e meios de pagamento são mostrados antes da contratação; o teste não autoriza cobrança automática durante o período anunciado.</p></section>
    <section><h2>6. Uso adequado e suporte</h2><p>Não use a plataforma para fraudes, envios abusivos, acesso indevido ou atividades contrárias às regras aplicáveis. Se encontrar um erro ou precisar encerrar sua conta, escreva para <a href={SUPPORT_EMAIL_URL}>{SUPPORT_EMAIL}</a>. O tratamento de dados está descrito na <a href="/privacidade">Política de Privacidade</a>; pedidos de exclusão seguem as <a href="/exclusao-de-dados">instruções de exclusão</a>.</p></section>
  </LegalPage>;
}
