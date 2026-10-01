import type { Metadata } from "next";
import Link from "next/link";
import { getPlatformBillingOffer } from "../../db/platform-billing";
import { getPlatformTrialDays } from "../../db/platform-trial";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from "../../lib/support";
import { AppIcon } from "../ui/app-icon";
import { BrandLogo } from "../ui/brand-logo";
import { PublicLandingMotion } from "../ui/public-landing-motion";
import { PublicProductSlider } from "../ui/public-product-slider";
import { PublicSignupForm } from "../ui/public-signup-form";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const trialDays = await getPlatformTrialDays();
  const trialLabel = `${trialDays} ${trialDays === 1 ? "dia" : "dias"}`;
  return {
    title: "Cortou Anotou | Gestão para barbearias",
    description: `Agenda, atendimentos, equipe e financeiro da sua barbearia em um só aplicativo. Teste grátis por ${trialLabel}.`,
  };
}

type SearchValue = string | string[] | undefined;

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

function price(cents: number) {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

export default async function ComecePage({ searchParams }: { searchParams: Promise<Record<string, SearchValue>> }) {
  const [params, billingOffer, trialDays] = await Promise.all([searchParams, getPlatformBillingOffer(), getPlatformTrialDays()]);
  const pixPrice = price(billingOffer.pixPriceCents);
  const trialLabel = `${trialDays} ${trialDays === 1 ? "dia" : "dias"}`;
  const referralCode = (first(params.ref) ?? "").slice(0, 70);
  const initialAccountType = first(params.perfil) === "barbeiro" ? "individual" as const : "barbershop" as const;
  const sourceParts = [
    ["origem", first(params.utm_source)],
    ["meio", first(params.utm_medium)],
    ["campanha", first(params.utm_campaign)],
  ].filter((item): item is [string, string] => Boolean(item[1])).map(([key, value]) => `${key}:${value.slice(0, 70)}`);
  const signupSource = sourceParts.join(" | ") || "site-publico";

  return (
    <main className="public-landing">
      <PublicLandingMotion />

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
            <a className="public-primary-cta" href="#cadastro">Começar {trialLabel} grátis <b>→</b></a>
            <Link className="public-login-cta" href="/">Entrar</Link>
            <a className="public-learn-link" href="#produto">Conhecer o aplicativo ↓</a>
          </div>
          <div className="public-trust-row">
            <span><b>✓</b> Sem cartão no teste</span>
            <span><b>✓</b> Login próprio</span>
          </div>
        </div>

        <PublicProductSlider />
      </section>

      <section className="public-proof-strip" aria-label="Principais benefícios">
        <span>AGENDA SEM CONFLITO</span><i />
        <span>FINANCEIRO CLARO</span><i />
        <span>EQUIPE ORGANIZADA</span><i />
        <span>AJUDA NA ROTINA</span>
      </section>

      <section className="public-signup-section public-signup-priority" id="cadastro">
        <div className="public-signup-copy">
          <span>{trialLabel.toUpperCase()} GRÁTIS</span>
          <h2>Entre, teste na rotina<br />e decida depois.</h2>
          <p>Crie sua conta em poucos passos e use o Cortou Anotou durante {trialLabel} sem cartão e sem cobrança automática.</p>
          <ul>
            <li><b>✓</b><span>Barbearia criada automaticamente</span></li>
            <li><b>✓</b><span>Acesso completo durante o teste</span></li>
            <li><b>✓</b><span>Você continua com o mesmo login se decidir assinar</span></li>
          </ul>
          <div className="public-price"><small>DEPOIS DO TESTE</small><strong><sup>R$</sup> {pixPrice}</strong><span>/ mês</span></div>
        </div>
        <PublicSignupForm signupSource={signupSource} referralCode={referralCode} initialAccountType={initialAccountType} trialDays={trialDays} />
      </section>

      <section className="public-secondary-access" aria-label="Outras formas de acesso">
        <div className="public-secondary-access-heading">
          <span>OUTRAS FORMAS DE USAR</span>
          <h2>Não é dono de barbearia?</h2>
          <p>Esses caminhos continuam disponíveis sem atrapalhar quem só quer começar o teste da barbearia.</p>
        </div>
        <div className="public-secondary-access-grid">
          <Link href="/comece?perfil=barbeiro#cadastro">
            <div><strong>Sou barbeiro</strong><span>Quero controlar meus próprios atendimentos e ganhos.</span></div><b>→</b>
          </Link>
          <Link href="/afiliado">
            <div><strong>Quero ser afiliado</strong><span>Quero indicar o Cortou Anotou e acompanhar minhas indicações.</span></div><b>→</b>
          </Link>
        </div>
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

      <section className="public-faq public-section" id="duvidas">
        <div className="public-section-heading"><span>PERGUNTAS FREQUENTES</span><h2>Antes de começar.</h2></div>
        <div className="public-faq-list">
          <details><summary>Meus dados se misturam com os de outra barbearia?<i>+</i></summary><p>Não. Cada barbearia recebe um espaço separado para clientes, agenda, equipe, registros e financeiro.</p></details>
          <details><summary>Vou pagar alguma coisa durante os {trialLabel}?<i>+</i></summary><p>Não. O teste não pede cartão. Perto do fim, o proprietário escolhe se quer pagar e continuar.</p></details>
          <details><summary>Consigo usar no celular?<i>+</i></summary><p>Sim. O aplicativo foi pensado para funcionar bem no celular e pode ser adicionado à tela inicial.</p></details>
          <details id="termos"><summary>Quais são os termos do teste?<i>+</i></summary><p>O teste libera o uso do sistema por {trialLabel}, sem cobrança automática. O usuário é responsável pelos dados inseridos e deve utilizar o aplicativo de forma legítima. A continuidade após o teste depende da escolha de um plano disponível.</p></details>
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
