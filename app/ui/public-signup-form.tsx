"use client";

import { FormEvent, useState } from "react";
import { PasswordInput } from "./password-input";
import { ResendVerificationButton, SupportContactLinks } from "./email-security";

type SignupResult = { ok?: boolean; error?: string; verificationRequired?: boolean; email?: string };

export function PublicSignupForm({ signupSource, referralCode = "" }: { signupSource: string; referralCode?: string }) {
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
          ownerName: String(form.get("ownerName") ?? ""),
          organizationName: String(form.get("organizationName") ?? ""),
          whatsapp: String(form.get("whatsapp") ?? ""),
          ownerDocument: String(form.get("ownerDocument") ?? ""),
          email: submittedEmail,
          password: submittedPassword,
          signupSource,
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
        setVerificationEmail(result.email ?? String(form.get("email") ?? ""));
        return;
      }
      window.location.assign("/?welcome=barbershop");
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
          <p>Enviamos um link para <strong>{verificationEmail}</strong>. Abra a mensagem e toque em confirmar para liberar seus 14 dias grátis.</p>
        </div>
        <div className="signup-email-note"><b>O teste ainda não começou.</b><span>Ele só começa quando você confirmar o endereço. Confira também a caixa de spam.</span></div>
        <ResendVerificationButton email={verificationEmail} />
        <SupportContactLinks />
      </section>
    );
  }

  return (
    <form className="public-signup-form" onSubmit={submit}>
      <div className="public-form-heading">
        <span>TESTE GRÁTIS · 14 DIAS</span>
        <h2>Crie sua barbearia agora.</h2>
        <p>Leva menos de dois minutos e não precisa de cartão.</p>
        {referralCode && <small className="signup-referral-confirmed">✓ Indicação registrada neste cadastro.</small>}
      </div>

      {error && <div className="public-signup-error" role="alert"><span>{error}</span>{loginEmail && <a href={`/?email=${encodeURIComponent(loginEmail)}`}>Fazer login com este e-mail <b>→</b></a>}</div>}

      <div className="public-form-grid">
        <label><span>Seu nome</span><input name="ownerName" autoComplete="name" placeholder="Nome do proprietário" minLength={2} maxLength={80} required /></label>
        <label><span>Nome da barbearia</span><input name="organizationName" autoComplete="organization" placeholder="Ex.: Barbearia do Will" minLength={2} maxLength={100} required /></label>
      </div>
      <label><span>WhatsApp com DDD</span><input name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" required /></label>
      <label><span>CPF ou CNPJ do responsável</span><input name="ownerDocument" inputMode="numeric" autoComplete="off" placeholder="Insira um CPF ou CNPJ válido" minLength={11} maxLength={18} required /><small className="field-privacy-note">O número é validado e salvo de forma protegida; ele não aparece para clientes ou funcionários.</small></label>
      <label><span>Seu e-mail</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" placeholder="seuemail@exemplo.com" required /></label>
      <div className="public-form-grid">
        <label><span>Crie uma senha</span><PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <label><span>Confirme a senha</span><PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required /></label>
      </div>
      {confirmation && <div className={password === confirmation ? "password-match ok" : "password-match error"} role="status">{password === confirmation ? "✓ As senhas são iguais." : "As senhas ainda estão diferentes."}</div>}

      <label className="public-honeypot" aria-hidden="true">
        <span>Site da empresa</span>
        <input name="companyWebsite" tabIndex={-1} autoComplete="off" />
      </label>
      <label className="public-terms">
        <input name="termsAccepted" type="checkbox" required />
        <span>Concordo com os termos do teste e com o uso dos dados necessários para operar minha conta.</span>
      </label>

      <button className="public-submit" disabled={pending}>
        <span>{pending ? "Criando sua barbearia..." : "Começar meus 14 dias grátis"}</span>
        {!pending && <b aria-hidden="true">→</b>}
      </button>
      <div className="public-existing-account"><span>Já possui uma conta?</span><a href={loginEmail ? `/?email=${encodeURIComponent(loginEmail)}` : "/"}>Fazer login</a></div>
      <small>Depois do teste, você escolhe se quer continuar. Sem cobrança automática durante os 14 dias.</small>
      <SupportContactLinks />
    </form>
  );
}
