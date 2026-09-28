"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { PasswordInput } from "./password-input";
import { ResendVerificationButton, SupportContactLinks } from "./email-security";

type AccountType = "barbershop" | "individual";
type SignupResult = { ok?: boolean; error?: string; verificationRequired?: boolean; email?: string };

export function PublicSignupForm({
  signupSource,
  referralCode = "",
  initialAccountType = "barbershop",
}: {
  signupSource: string;
  referralCode?: string;
  initialAccountType?: AccountType;
}) {
  const accountType = initialAccountType;
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");

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
          commissionRateBps: Math.round(Number(form.get("commissionPercent") ?? 100) * 100),
          // O cadastro inicial agora é propositalmente curto. Estes valores representam
          // somente um perfil neutro e podem ser refinados dentro do aplicativo depois.
          estimatedMonthlyClients: accountType === "barbershop" ? 1 : 0,
          estimatedMonthlyWhatsappContacts: 0,
          estimatedProfessionals: accountType === "barbershop" ? 1 : 0,
          serviceMode: accountType === "barbershop" ? "both" : "",
          automationGoal: accountType === "barbershop" ? "management" : "",
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
        <div className="public-form-heading">
          <span>ÚLTIMA ETAPA</span>
          <h2>Confirme seu e-mail.</h2>
          <p>Enviamos um link para <strong>{verificationEmail}</strong>. Abra a mensagem para liberar seus 14 dias grátis.</p>
        </div>
        <div className="signup-email-note">
          <b>O teste ainda não começou.</b>
          <span>Ele só começa quando você confirmar. Confira também a caixa de spam.</span>
        </div>
        <ResendVerificationButton email={verificationEmail} />
        <SupportContactLinks />
      </section>
    );
  }

  return (
    <form className="public-signup-form public-signup-simple" onSubmit={submit}>
      {accountType === "individual" && (
        <Link className="guided-back" href="/comece#cadastro">← Teste para barbearia</Link>
      )}

      <div className="public-form-heading">
        <span>TESTE GRÁTIS · 14 DIAS</span>
        <h2>{accountType === "individual" ? "Crie seu controle de barbeiro." : "Crie sua barbearia agora."}</h2>
        <p>{accountType === "individual"
          ? "Um espaço simples para seus atendimentos, ganhos e agenda."
          : "Cadastre o essencial agora. O restante você configura com calma dentro do aplicativo."}</p>
        {referralCode && <small className="signup-referral-confirmed">✓ Indicação registrada neste cadastro.</small>}
      </div>

      {error && (
        <div className="public-signup-error" role="alert">
          <span>{error}</span>
          {loginEmail && <a href={`/?email=${encodeURIComponent(loginEmail)}`}>Fazer login com este e-mail <b>→</b></a>}
        </div>
      )}

      <div className="public-form-grid">
        <label>
          <span>Seu nome</span>
          <input name="ownerName" autoComplete="name" placeholder="Seu nome" minLength={2} maxLength={80} required />
        </label>
        {accountType === "barbershop" ? (
          <label>
            <span>Nome da barbearia</span>
            <input name="organizationName" autoComplete="organization" placeholder="Ex.: Barbearia do Will" minLength={2} maxLength={100} required />
          </label>
        ) : (
          <label>
            <span>Onde trabalha? (opcional)</span>
            <input name="workplaceName" autoComplete="organization" placeholder="Ex.: Barbearia Central" maxLength={100} />
          </label>
        )}
      </div>

      {accountType === "individual" && (
        <label>
          <span>Minha comissão (%)</span>
          <input name="commissionPercent" type="number" inputMode="decimal" min="0" max="100" step="0.01" defaultValue="50" required />
          <small>Você poderá editar esse percentual depois.</small>
        </label>
      )}

      <label>
        <span>WhatsApp com DDD</span>
        <input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" required />
      </label>

      <label>
        <span>CPF ou CNPJ do responsável</span>
        <input name="ownerDocument" inputMode="numeric" autoComplete="off" placeholder="Insira um CPF ou CNPJ válido" minLength={11} maxLength={18} required />
        <small className="field-privacy-note">O número fica protegido e não aparece para clientes ou funcionários.</small>
      </label>

      <label>
        <span>Seu e-mail</span>
        <input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" placeholder="seuemail@exemplo.com" required />
      </label>

      <div className="public-form-grid">
        <label>
          <span>Crie uma senha</span>
          <PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <label>
          <span>Confirme a senha</span>
          <PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
        </label>
      </div>

      {confirmation && (
        <div className={password === confirmation ? "password-match ok" : "password-match error"} role="status">
          {password === confirmation ? "✓ As senhas são iguais." : "As senhas ainda estão diferentes."}
        </div>
      )}

      <label className="public-honeypot" aria-hidden="true">
        <span>Site da empresa</span>
        <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </label>

      <label className="public-terms">
        <input name="termsAccepted" type="checkbox" required />
        <span>Concordo com os <Link href="/termos-de-uso" target="_blank" rel="noopener noreferrer">Termos de Uso</Link> e a <Link href="/privacidade" target="_blank" rel="noopener noreferrer">Política de Privacidade</Link> para operar minha conta.</span>
      </label>

      <button className="public-submit" disabled={pending}>
        <span>{pending ? "Criando seu acesso..." : "Começar meus 14 dias grátis"}</span>
        {!pending && <b aria-hidden="true">→</b>}
      </button>

      <div className="public-existing-account public-existing-account-strong">
        <span>Já possui uma conta?</span>
        <a href={loginEmail ? `/?email=${encodeURIComponent(loginEmail)}` : "/"}>Fazer login</a>
      </div>

      <small>Depois do teste, você escolhe se quer continuar. Sem cobrança automática durante os 14 dias.</small>
      <SupportContactLinks />
    </form>
  );
}
