"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { PasswordInput } from "./password-input";
import { ResendVerificationButton, SupportContactLinks } from "./email-security";

type AccountType = "barbershop" | "individual";
type Screen = "choose" | "shop-profile" | "barber-kind" | "shop-system" | "invite" | "form";
type SignupResult = { ok?: boolean; error?: string; verificationRequired?: boolean; email?: string };

export function PublicSignupForm({ signupSource, referralCode = "" }: { signupSource: string; referralCode?: string }) {
  const [screen, setScreen] = useState<Screen>("choose");
  const [accountType, setAccountType] = useState<AccountType>("barbershop");
  const [commissioned, setCommissioned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [shopProfile, setShopProfile] = useState({
    estimatedMonthlyClients: "",
    estimatedMonthlyWhatsappContacts: "",
    estimatedProfessionals: "",
    serviceMode: "both",
    automationGoal: "full",
  });

  function chooseOwner() {
    setAccountType("barbershop");
    setScreen("shop-profile");
  }
  function chooseBarber() {
    setAccountType("individual");
    setScreen("barber-kind");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoginEmail("");
    const form = new FormData(event.currentTarget);
    const submittedPassword = String(form.get("password") ?? "");
    const submittedConfirmation = String(form.get("confirmation") ?? "");
    const submittedEmail = String(form.get("email") ?? "").trim().toLowerCase();
    if (submittedPassword !== submittedConfirmation) return setError("As duas senhas precisam ser iguais.");

    setPending(true);
    try {
      const response = await fetch("/api/auth/public-signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountType,
          ownerName: String(form.get("ownerName") ?? ""),
          organizationName: String(form.get("organizationName") ?? ""),
          workplaceName: String(form.get("workplaceName") ?? ""),
          commissionRateBps: Math.round(Number(form.get("commissionPercent") ?? 0) * 100),
          estimatedMonthlyClients: accountType === "barbershop" ? Number(shopProfile.estimatedMonthlyClients) : 0,
          estimatedMonthlyWhatsappContacts: accountType === "barbershop" ? Number(shopProfile.estimatedMonthlyWhatsappContacts) : 0,
          estimatedProfessionals: accountType === "barbershop" ? Number(shopProfile.estimatedProfessionals) : 0,
          serviceMode: accountType === "barbershop" ? shopProfile.serviceMode : "",
          automationGoal: accountType === "barbershop" ? shopProfile.automationGoal : "",
          whatsapp: String(form.get("whatsapp") ?? ""),
          ownerDocument: String(form.get("ownerDocument") ?? ""),
          email: submittedEmail,
          password: submittedPassword,
          signupSource: `${signupSource}:${accountType}`,
          referralCode,
          termsAccepted: form.get("termsAccepted") === "on",
          companyWebsite: String(form.get("companyWebsite") ?? ""),
        }),
      });
      const result = await response.json() as SignupResult;
      if (!response.ok) {
        const message = result.error ?? "Não foi possível concluir seu cadastro.";
        if (message.includes("já possui acesso")) setLoginEmail(submittedEmail);
        return setError(message);
      }
      if (result.verificationRequired) {
        setVerificationEmail(result.email ?? submittedEmail);
        return;
      }
      window.location.assign(accountType === "individual" ? "/?welcome=individual" : "/?welcome=barbershop");
    } catch {
      setError("Não foi possível concluir. Verifique sua conexão e tente novamente.");
    } finally {
      setPending(false);
    }
  }

  if (verificationEmail) {
    return (
      <section className="public-signup-form signup-email-sent" aria-live="polite">
        <span className="signup-email-icon" aria-hidden="true">✓</span>
        <div className="public-form-heading"><span>ÚLTIMA ETAPA</span><h2>Confirme seu e-mail.</h2><p>Enviamos um link para <strong>{verificationEmail}</strong>. Abra a mensagem para liberar seus 14 dias grátis.</p></div>
        <div className="signup-email-note"><b>O teste ainda não começou.</b><span>Ele só começa quando você confirmar. Confira também a caixa de spam.</span></div>
        <ResendVerificationButton email={verificationEmail} />
        <SupportContactLinks />
      </section>
    );
  }

  if (screen === "choose") return (
    <section className="public-signup-form guided-signup">
      <div className="public-form-heading"><span>VAMOS TE LEVAR AO LUGAR CERTO</span><h2>Como você quer usar o Cortou Anotou?</h2><p>Toque na opção que combina com você.</p></div>
      <div className="guided-options">
        <button type="button" className="guided-option" onClick={chooseOwner}><b>Sou dono de barbearia</b><span>Quero administrar equipe, agenda, comissões e faturamento.</span></button>
        <button type="button" className="guided-option" onClick={chooseBarber}><b>Sou barbeiro</b><span>Quero anotar meus próprios atendimentos e conferir meu ganho.</span></button>
        <Link className="guided-option" href="/afiliado"><b>Quero ser afiliado</b><span>Quero indicar o sistema e acompanhar minhas indicações.</span></Link>
        <button type="button" className="guided-option" onClick={() => setScreen("invite")}><b>Recebi convite da barbearia</b><span>Quero entrar na equipe de uma barbearia que já usa o sistema.</span></button>
      </div>
    </section>
  );

  if (screen === "shop-profile") return (
    <form className="public-signup-form guided-signup" onSubmit={(event) => {
      event.preventDefault();
      setError(null);
      const clients = Math.round(Number(shopProfile.estimatedMonthlyClients));
      const contacts = Math.round(Number(shopProfile.estimatedMonthlyWhatsappContacts));
      const professionals = Math.round(Number(shopProfile.estimatedProfessionals));
      if (!Number.isInteger(clients) || clients < 1) return setError("Informe aproximadamente quantos clientes a barbearia atende por mês.");
      if (!Number.isInteger(contacts) || contacts < 0) return setError("Informe aproximadamente quantos clientes chamam no WhatsApp por mês.");
      if (!Number.isInteger(professionals) || professionals < 1) return setError("Informe quantos profissionais trabalham na barbearia.");
      setScreen("form");
    }}>
      <button type="button" className="guided-back" onClick={() => setScreen("choose")}>← Voltar</button>
      <div className="public-form-heading"><span>PERFIL DA BARBEARIA</span><h2>Vamos indicar o plano certo para o seu movimento.</h2><p>Responda com a sua média real. Nada fica preso em um número padrão e você poderá atualizar depois.</p></div>
      {error && <div className="public-signup-error" role="alert"><span>{error}</span></div>}
      <div className="public-form-grid">
        <label><span>Quantos clientes vocês atendem por mês?</span><input type="number" inputMode="numeric" min="1" max="100000" value={shopProfile.estimatedMonthlyClients} onChange={(event) => setShopProfile((current) => ({ ...current, estimatedMonthlyClients:event.target.value }))} placeholder="Digite uma média mensal" required /></label>
        <label><span>Quantos profissionais trabalham aí?</span><input type="number" inputMode="numeric" min="1" max="1000" value={shopProfile.estimatedProfessionals} onChange={(event) => setShopProfile((current) => ({ ...current, estimatedProfessionals:event.target.value }))} placeholder="Digite a quantidade" required /></label>
      </div>
      <label><span>Em média, quantos clientes chamam no WhatsApp por mês?</span><input type="number" inputMode="numeric" min="0" max="100000" value={shopProfile.estimatedMonthlyWhatsappContacts} onChange={(event) => setShopProfile((current) => ({ ...current, estimatedMonthlyWhatsappContacts:event.target.value }))} placeholder="Digite uma estimativa" required /><small>É uma estimativa. Nem todo cliente precisa mandar mensagem.</small></label>
      <label><span>Como vocês atendem hoje?</span><select value={shopProfile.serviceMode} onChange={(event) => setShopProfile((current) => ({ ...current, serviceMode:event.target.value }))}><option value="walk_in">Principalmente por ordem de chegada</option><option value="appointments">Principalmente com horário marcado</option><option value="both">Os dois: ordem de chegada e agendamento</option></select></label>
      <label><span>O que você mais quer do Cortou Anotou?</span><select value={shopProfile.automationGoal} onChange={(event) => setShopProfile((current) => ({ ...current, automationGoal:event.target.value }))}><option value="management">Quero principalmente organizar e controlar a gestão</option><option value="whatsapp">Quero também que o WhatsApp responda meus clientes</option><option value="full">Quero gestão + atendimento inteligente e mais autonomia</option></select></label>
      <button className="public-submit" type="submit"><span>Continuar meu cadastro</span><b aria-hidden="true">→</b></button>
      <small>Essas respostas servem para recomendar o plano adequado. Elas não alteram seu teste gratuito.</small>
    </form>
  );

  if (screen === "barber-kind") return (
    <section className="public-signup-form guided-signup">
      <button type="button" className="guided-back" onClick={() => setScreen("choose")}>← Voltar</button>
      <div className="public-form-heading"><span>SEU JEITO DE TRABALHAR</span><h2>Como você recebe?</h2></div>
      <div className="guided-options">
        <button type="button" className="guided-option" onClick={() => { setCommissioned(true); setScreen("shop-system"); }}><b>Sou comissionado</b><span>Recebo uma porcentagem do valor dos serviços.</span></button>
        <button type="button" className="guided-option" onClick={() => { setCommissioned(false); setScreen("form"); }}><b>Trabalho por conta própria</b><span>O valor dos atendimentos é meu.</span></button>
      </div>
    </section>
  );

  if (screen === "shop-system") return (
    <section className="public-signup-form guided-signup">
      <button type="button" className="guided-back" onClick={() => setScreen("barber-kind")}>← Voltar</button>
      <div className="public-form-heading"><span>ÚLTIMA PERGUNTA</span><h2>A barbearia já usa o Cortou Anotou?</h2></div>
      <div className="guided-options">
        <button type="button" className="guided-option" onClick={() => setScreen("invite")}><b>Sim, já usa</b><span>Entre pelo convite do proprietário para os dados ficarem juntos.</span></button>
        <button type="button" className="guided-option" onClick={() => setScreen("form")}><b>Não usa</b><span>Crie seu controle individual, separado da barbearia.</span></button>
      </div>
    </section>
  );

  if (screen === "invite") return (
    <section className="public-signup-form guided-signup">
      <button type="button" className="guided-back" onClick={() => setScreen("choose")}>← Voltar</button>
      <div className="public-form-heading"><span>ACESSO PELA EQUIPE</span><h2>Peça o seu link ao proprietário.</h2><p>Ele entra em Equipe, adiciona seu e-mail e envia o convite. Assim seus atendimentos aparecem para vocês dois, sem duplicar cadastro.</p></div>
      <div className="guided-info"><b>Já recebeu o link?</b><span>Abra o próprio link do convite no WhatsApp. Ele leva direto ao cadastro correto.</span></div>
      <Link className="public-submit" href="/">Já tenho conta: fazer login</Link>
    </section>
  );

  return (
    <form className="public-signup-form" onSubmit={submit}>
      <button type="button" className="guided-back" onClick={() => setScreen(accountType === "individual" ? "barber-kind" : "shop-profile")}>← Voltar</button>
      <div className="public-form-heading">
        <span>TESTE GRÁTIS · 14 DIAS</span>
        <h2>{accountType === "individual" ? "Crie seu controle de barbeiro." : "Crie sua barbearia agora."}</h2>
        <p>{accountType === "individual" ? "Você terá seus atendimentos, ganhos, agenda e configurações em um espaço próprio." : "Administre a barbearia e toda a equipe em um só lugar."}</p>
        {referralCode && <small className="signup-referral-confirmed">✓ Indicação registrada neste cadastro.</small>}
      </div>
      {error && <div className="public-signup-error" role="alert"><span>{error}</span>{loginEmail && <a href={`/?email=${encodeURIComponent(loginEmail)}`}>Fazer login com este e-mail <b>→</b></a>}</div>}
      <div className="public-form-grid">
        <label><span>Seu nome</span><input name="ownerName" autoComplete="name" placeholder="Seu nome" minLength={2} maxLength={80} required /></label>
        {accountType === "barbershop"
          ? <label><span>Nome da barbearia</span><input name="organizationName" autoComplete="organization" placeholder="Ex.: Barbearia do Will" minLength={2} maxLength={100} required /></label>
          : <label><span>Onde trabalha? (opcional)</span><input name="workplaceName" autoComplete="organization" placeholder="Ex.: Barbearia Central" maxLength={100} /></label>}
      </div>
      {accountType === "individual" && <label><span>{commissioned ? "Minha comissão (%)" : "Percentual que quero acompanhar (%)"}</span><input name="commissionPercent" type="number" inputMode="decimal" min="0" max="100" step="0.01" defaultValue={commissioned ? "50" : "100"} required /><small>Você poderá editar esse percentual depois.</small></label>}
      <label><span>WhatsApp com DDD</span><input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" required /></label>
      <label><span>CPF ou CNPJ do responsável</span><input name="ownerDocument" inputMode="numeric" autoComplete="off" placeholder="Insira um CPF ou CNPJ válido" minLength={11} maxLength={18} required /><small className="field-privacy-note">O número fica protegido e não aparece para clientes ou funcionários.</small></label>
      <label><span>Seu e-mail</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" placeholder="seuemail@exemplo.com" required /></label>
      <div className="public-form-grid">
        <label><span>Crie uma senha</span><PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label><span>Confirme a senha</span><PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
      </div>
      {confirmation && <div className={password === confirmation ? "password-match ok" : "password-match error"} role="status">{password === confirmation ? "✓ As senhas são iguais." : "As senhas ainda estão diferentes."}</div>}
      <label className="public-honeypot" aria-hidden="true"><span>Site da empresa</span><input name="companyWebsite" tabIndex={-1} autoComplete="off" /></label>
      <label className="public-terms"><input name="termsAccepted" type="checkbox" required /><span>Concordo com os <Link href="/termos-de-uso" target="_blank" rel="noopener noreferrer">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link> para operar minha conta.</span></label>
      <button className="public-submit" disabled={pending}><span>{pending ? "Criando seu acesso..." : "Começar meus 14 dias grátis"}</span>{!pending && <b aria-hidden="true">→</b>}</button>
      <div className="public-existing-account"><span>Já possui uma conta?</span><a href={loginEmail ? `/?email=${encodeURIComponent(loginEmail)}` : "/"}>Fazer login</a></div>
      <small>Depois do teste, você escolhe se quer continuar. Sem cobrança automática durante os 14 dias.</small>
      <SupportContactLinks />
    </form>
  );
}
