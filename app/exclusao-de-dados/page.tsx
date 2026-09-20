import type { Metadata } from "next";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_URL } from "../../lib/support";
import { LegalPage } from "../ui/legal-page";

export const metadata: Metadata = { title: "Exclusão de dados | Cortou Anotou", description: "Como solicitar exclusão dos seus dados no Cortou Anotou." };

export default function DataDeletionPage() {
  return <LegalPage title="Exclusão de dados" subtitle="Saiba como pedir a remoção de uma conta ou dos seus dados tratados no Cortou Anotou.">
    <section><h2>Como solicitar</h2><p>Envie uma mensagem para <a href={SUPPORT_EMAIL_URL}>{SUPPORT_EMAIL}</a> com o assunto “Exclusão de dados”. Informe o e-mail cadastrado ou o telefone usado no agendamento, o nome da barbearia envolvida e se deseja excluir sua conta ou corrigir/remover dados de um atendimento. Não envie senha, código de verificação ou documento pessoal no primeiro contato.</p></section>
    <section><h2>Se você é cliente de uma barbearia</h2><p>Para dados de um agendamento ou atendimento, você também pode procurar diretamente a barbearia onde foi atendido. Ela pode identificar o cadastro e solicitar ou realizar a correção de informações que administra. Se o pedido envolver dados processados pela plataforma, podemos orientar e encaminhar a solicitação conforme o caso.</p></section>
    <section><h2>O que acontece depois</h2><p>Para proteger sua conta, poderemos pedir uma confirmação de identidade por um canal adequado antes de executar o pedido. Vamos identificar quais dados podem ser removidos e informar o resultado. Alguns registros podem precisar ser conservados por obrigação legal, segurança ou prestação de contas, mesmo depois do encerramento do acesso.</p></section>
    <section><h2>Integração com a Meta</h2><p>Se uma barbearia desconectar seu WhatsApp, o Cortou Anotou deixa de usar essa conexão para novos envios. Para solicitar a exclusão de dados mantidos no Cortou Anotou relacionados à integração, use o mesmo e-mail acima. A Meta também pode conservar dados sob suas próprias políticas.</p></section>
  </LegalPage>;
}
