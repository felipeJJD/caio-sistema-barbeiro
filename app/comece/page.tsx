import type { Metadata } from "next";
import Link from "next/link";
import { getPlatformBillingOffer } from "../../db/platform-billing";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from "../../lib/support";
import { BrandLogo } from "../ui/brand-logo";
import { PublicSignupForm } from "../ui/public-signup-form";
import { AppIcon } from "../ui/app-icon";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cortou Anotou | Gestão para barbearias",
  description: "Agenda, atendimentos, equipe e financeiro da sua barbearia em um só aplicativo. Teste grátis por 14 dias.",
};

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function price(cents: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export default async function ComecePage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const [params, billingOffer] = await Promise.all([searchParams, getPlatformBillingOffer()]);
  const pixPrice = price(billingOffer.pixPriceCents);
  const referralCode = (first(params.ref) ?? "").slice(0, 70);
  const sourceParts = [
    ["origem", first(params.utm_source)],
    ["meio", first(params.utm_medium)],
    ["campanha", first(params.utm_campaign)],
  ].filter((item): item is [string, string] => Boolean(item[1])).map(([key, value]) => `${key}:${value.slice(0, 70)}`);
  const signupSource = sourceParts.join(" | ") || "site-publico";

  return (
    <main className="public-landing">
      <header className="public-nav">
        <Link className="public-nav-brand" href="/comece" aria-label="Cortou Anotou — início"><BrandLogo /></Link>
        <nav aria-label="Navegação principal">
          <a href="#recursos">Recursos</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#duvidas">Dúvidas</a>
        </nav>
        <div className="public-nav-actions">
          <Link className="public-login-link" href="/">Já sou cliente</Link>
          <a className="public-nav-cta" href="#cadastro">Testar grátis</a>
        </div>
      </header>

      <section className="public-hero">
        <div className="public-hero-copy">
          <span className="public-pill"><i /> FEITO PARA A ROTINA DA BARBEARIA</span>
          <h1>O corte termina.<br /><em>A gestão continua.</em></h1>
          <p>Agenda, atendimentos, produtos, mensalistas, equipe e financeiro em um aplicativo simples de usar — até nos dias mais corridos.</p>
          <div className="public-hero-actions">
            <a className="public-primary-cta" href="#cadastro">Começar 14 dias grátis <b>→</b></a>
            <a className="public-secondary-cta" href="#recursos">Conhecer o aplicativo</a>
          </div>
          <div className="public-trust-row">
            <span><b>✓</b> Sem cartão no teste</span>
            <span><b>✓</b> Login próprio</span>
            <span><b>✓</b> Dados separados por barbearia</span>
          </div>
        </div>

        <div className="public-product-stage" aria-label="Prévia do painel Cortou Anotou">
          <div className="public-stage-glow" />
          <div className="public-phone">
            <div className="public-phone-top"><span>9:41</span><i /><b>100%</b></div>
            <div className="public-phone-brand"><span>C</span><i /><b>A</b><strong>CORTOU <em>ANOTOU</em></strong></div>
            <div className="public-phone-body">
              <small>BOM DIA, WILLIAM</small>
              <h2>Sua barbearia hoje.</h2>
              <div className="public-mini-period"><span>Período da análise</span><b>Hoje⌄</b></div>
              <div className="public-mini-stats">
                <article><i>↗</i><span>Faturamento</span><strong>R$ 480,00</strong><small>meta em andamento</small></article>
                <article><i>$</i><span>Lucro líquido</span><strong>R$ 342,00</strong><small>depois dos custos</small></article>
                <article><i><AppIcon name="scissors" /></i><span>Atendimentos</span><strong>12</strong><small>registrados hoje</small></article>
                <article><i>◈</i><span>Mensalistas</span><strong>18</strong><small>clientes ativos</small></article>
              </div>
            </div>
            <div className="public-assistant-chip"><i><AppIcon name="help" /></i><span>Central de ajuda</span></div>
          </div>
          <div className="public-floating-card appointment"><span>17:40</span><div><b>Horário confirmado</b><small>com Eduardo</small></div><i>✓</i></div>
          <div className="public-floating-card voice"><i><AppIcon name="help" /></i><div><b>“Registrar atendimento”</b><small>Preparado pela Central de ajuda</small></div></div>
        </div>
      </section>

      <section className="public-proof-strip" aria-label="Principais benefícios">
        <span>AGENDA SEM CONFLITO</span><i />
        <span>FINANCEIRO CLARO</span><i />
        <span>EQUIPE ORGANIZADA</span><i />
        <span>AJUDA NA ROTINA</span>
      </section>

      <section className="public-section public-features" id="recursos">
        <div className="public-section-heading">
          <span>DO PRIMEIRO HORÁRIO AO FECHAMENTO</span>
          <h2>Tudo que importa, sem complicar sua rotina.</h2>
          <p>O Cortou Anotou transforma as anotações do dia em uma visão completa da barbearia.</p>
        </div>
        <div className="public-feature-grid">
          <article className="featured"><span>01</span><div className="feature-visual schedule"><i>09:00</i><b>Corte · Eduardo</b><em>Confirmado</em><i>10:20</i><b>Barba · Davi</b><em>Confirmado</em><i>11:40</i><b>Horário livre</b><em>Livre</em></div><h3>Agenda que evita horário duplicado</h3><p>Agende, remarque, cancele ou apague. O sistema bloqueia dois clientes no mesmo horário para o mesmo barbeiro.</p></article>
          <article><span>02</span><div className="feature-icon"><AppIcon name="help" /></div><h3>Ajuda para os dias corridos</h3><p>Registre atendimento, despesa ou agendamento por texto e voz, sem percorrer várias telas.</p></article>
          <article><span>03</span><div className="feature-icon">R$</div><h3>Financeiro que você entende</h3><p>Acompanhe faturamento, despesas, taxas, comissões, produtos e lucro líquido por período.</p></article>
          <article><span>04</span><div className="feature-icon"><AppIcon name="scissors" /></div><h3>Cada profissional no seu espaço</h3><p>O proprietário vê a operação completa; cada barbeiro acessa apenas a própria agenda e os próprios ganhos.</p></article>
          <article><span>05</span><div className="feature-icon">◈</div><h3>Mensalistas e produtos</h3><p>Controle planos, usos e renovações. Venda pomada, óleo ou balm mesmo quando não houver serviço.</p></article>
        </div>
      </section>

      <section className="public-how" id="como-funciona">
        <div className="public-section-heading light">
          <span>COMECE SEM DEPENDER DE NINGUÉM</span>
          <h2>Sua barbearia pronta em três passos.</h2>
        </div>
        <div className="public-step-grid">
          <article><b>1</b><span>Crie sua conta</span><p>Informe seus dados e o nome da barbearia. Seu espaço é criado automaticamente.</p></article>
          <article><b>2</b><span>Deixe com a sua cara</span><p>Ajuste serviços, preços, formas de pagamento, comissões e metas quando quiser.</p></article>
          <article><b>3</b><span>Convide a equipe</span><p>Gere os acessos dos barbeiros e comece a registrar a operação no mesmo dia.</p></article>
        </div>
      </section>

      <section className="public-signup-section" id="cadastro">
        <div className="public-signup-copy">
          <span>PREÇO DE LANÇAMENTO</span>
          <h2>Organize primeiro.<br />Decida depois.</h2>
          <p>Use todas as funções durante 14 dias. Depois, escolha o período que combina com sua barbearia e pague pelo Pix. O plano mensal começa em <strong>R$ {pixPrice}</strong>.</p>
          <ul>
            <li><b>✓</b><span>Barbearia criada automaticamente</span></li>
            <li><b>✓</b><span>Acesso completo durante o teste</span></li>
            <li><b>✓</b><span>Planos Pix de 1, 3, 6 ou 12 meses</span></li>
            <li><b>✓</b><span>Desconto progressivo nos períodos maiores</span></li>
            <li><b>✓</b><span>Você pode continuar usando o mesmo login</span></li>
          </ul>
          <div className="public-price"><small>PLANOS SOMENTE POR PIX</small><strong><sup>R$</sup> {pixPrice}</strong><span>/ mês</span></div>
          <div className="public-plan-grid">{billingOffer.pixPlans.map((plan) => <article className={plan.code === "quarterly" ? "popular" : ""} key={plan.code}>
            {plan.code === "quarterly" && <em>MAIS ESCOLHIDO</em>}
            <span>{plan.label}</span><strong>R$ {price(plan.priceCents)}</strong>
            <small>{plan.discountBps ? `${plan.discountBps / 100}% de desconto · R$ ${price(Math.round(plan.priceCents / plan.months))}/mês` : `${plan.periodDays} dias de acesso`}</small>
          </article>)}</div>
        </div>
        <PublicSignupForm signupSource={signupSource} referralCode={referralCode} />
      </section>

      <section className="public-faq public-section" id="duvidas">
        <div className="public-section-heading"><span>PERGUNTAS FREQUENTES</span><h2>Antes de começar.</h2></div>
        <div className="public-faq-list">
          <details><summary>Meus dados se misturam com os de outra barbearia?<i>+</i></summary><p>Não. Cada barbearia recebe um espaço separado para clientes, agenda, equipe, registros e financeiro.</p></details>
          <details><summary>Vou pagar alguma coisa durante os 14 dias?<i>+</i></summary><p>Não. O teste não pede cartão. Perto do fim, o proprietário escolhe se quer pagar e continuar.</p></details>
          <details><summary>Consigo usar no celular?<i>+</i></summary><p>Sim. O aplicativo foi pensado para funcionar bem no celular e pode ser adicionado à tela inicial.</p></details>
          <details id="termos"><summary>Quais são os termos do teste?<i>+</i></summary><p>O teste libera o uso do sistema por 14 dias, sem cobrança automática. O usuário é responsável pelos dados inseridos e deve utilizar o aplicativo de forma legítima. A continuidade após o teste depende da escolha de um plano disponível.</p></details>
          <details id="privacidade"><summary>Como os dados do cadastro são usados?<i>+</i></summary><p>Nome, e-mail e WhatsApp são usados para criar, operar e dar suporte à conta da barbearia. As informações de origem da campanha podem ser guardadas para entender como o cliente conheceu o aplicativo.</p></details>
        </div>
      </section>

      <footer className="public-footer">
        <BrandLogo />
        <p>Gestão feita para quem vive a rotina da barbearia.</p>
        <div><Link href="/">Entrar</Link><Link href="/termos-de-uso">Termos</Link><Link href="/privacidade">Privacidade</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link><a href="#cadastro">Começar grátis</a><a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">Suporte {SUPPORT_PHONE_DISPLAY}</a></div>
        <small>© 2026 Cortou Anotou.</small>
      </footer>
    </main>
  );
}
