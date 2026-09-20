import type { Metadata } from "next";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_URL } from "../../lib/support";
import { LegalPage } from "../ui/legal-page";

export const metadata: Metadata = { title: "Privacidade | Cortou Anotou", description: "Como o Cortou Anotou trata os dados usados na gestão de barbearias." };

export default function PrivacyPage() {
  return <LegalPage title="Política de Privacidade" subtitle="Entenda quais informações são usadas para operar a conta, a agenda e os recursos opcionais do Cortou Anotou.">
    <section><h2>1. Quem usa os dados</h2><p>O Cortou Anotou oferece gestão para barbearias e profissionais. Cada barbearia administra seus próprios cadastros de equipe, clientes e atendimentos. Se você é cliente de uma barbearia, ela também é responsável pelas informações que cadastra e usa para prestar o atendimento.</p></section>
    <section><h2>2. Informações tratadas</h2><p>Dependendo do recurso utilizado, podem ser tratados nome, telefone, e-mail, dados de acesso, identificação do responsável pela conta, dados de agendamentos, serviços, mensalidades, atendimentos, pagamentos registrados, equipe e mensagens ligadas ao atendimento. Também são usados dados técnicos necessários para segurança, funcionamento e prevenção de abuso.</p></section>
    <section><h2>3. Para que servem</h2><p>Essas informações permitem criar e proteger contas, organizar agendamentos, manter os registros da barbearia, apresentar relatórios, prestar suporte e enviar comunicações ligadas aos serviços contratados. O uso de recursos opcionais, como a integração oficial de WhatsApp, depende de configuração e conexão pela própria barbearia.</p></section>
    <section><h2>4. Compartilhamento e integrações</h2><p>Os dados necessários podem passar por fornecedores de hospedagem, entrega de e-mail, pagamentos e, quando a barbearia conectar o recurso, pela plataforma oficial do WhatsApp/Meta. Cada integração tem finalidade ligada à operação do serviço. O Cortou Anotou não oferece a uma barbearia acesso aos dados de outra.</p></section>
    <section><h2>5. Segurança e conservação</h2><p>O acesso é controlado por conta e função na equipe. Adotamos medidas técnicas para proteger informações e credenciais de integração. Os dados permanecem pelo período necessário à operação da conta e às obrigações aplicáveis; pedidos de exclusão são avaliados considerando também registros que precisem ser preservados por motivos legais.</p></section>
    <section><h2>6. Seus pedidos</h2><p>Para pedir acesso, correção ou exclusão de dados ligados à sua conta no Cortou Anotou, escreva para <a href={SUPPORT_EMAIL_URL}>{SUPPORT_EMAIL}</a>. Se você é cliente de uma barbearia, fale primeiro com ela para corrigir ou excluir as informações que ela cadastrou; também pode nos procurar para receber orientação sobre os dados processados na plataforma.</p><p>Veja o procedimento na página de <a href="/exclusao-de-dados">exclusão de dados</a>.</p></section>
    <section><h2>7. Mudanças nesta política</h2><p>Podemos atualizar este texto quando o produto ou as integrações mudarem. A versão vigente e sua data ficam disponíveis nesta página.</p></section>
  </LegalPage>;
}
