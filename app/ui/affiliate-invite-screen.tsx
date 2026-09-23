"use client";

import { FormEvent, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { PasswordInput } from "./password-input";
import { ResendVerificationButton, SupportContactLinks } from "./email-security";

type InviteResult = { ok?: boolean; error?: string; verificationRequired?: boolean; email?: string };

export function VerifiedAffiliateInviteScreen({ inviteToken, name, email }: { inviteToken: string; name: string; email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmation") ?? "")) return setError("As duas senhas precisam ser iguais.");
    setPending(true);
    try {
      const response = await fetch("/api/affiliate/auth/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteToken, name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password }),
      });
      const payload = await response.json() as InviteResult;
      if (!response.ok) return setError(payload.error ?? "Não foi possível criar seu acesso.");
      if (payload.verificationRequired) {
        setVerificationEmail(payload.email ?? String(form.get("email") ?? ""));
        return;
      }
      window.location.assign("/afiliado");
    } catch {
      setError("Não foi possível concluir. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  if (verificationEmail) return <main className="affiliate-access-page invite"><section className="affiliate-access-card email-confirmation-card"><BrandLogo variant="access" /><div className="affiliate-access-badge">CONFIRMAÇÃO ENVIADA</div><h1>Confira seu e-mail.</h1><p>Mandamos um link para <b>{verificationEmail}</b>. Seu painel de afiliado só será criado depois que você confirmar esse endereço.</p><ResendVerificationButton email={verificationEmail} /><SupportContactLinks /></section></main>;

  return <main className="affiliate-access-page invite"><section className="affiliate-access-card"><BrandLogo variant="access" /><div className="affiliate-access-badge">CONVITE DE AFILIADO</div><h1>Bem-vindo ao programa de indicação.</h1><p>Crie seu acesso exclusivo. Antes de liberar o painel, vamos confirmar que o e-mail informado realmente pertence a você.</p><div className="affiliate-invite-rules"><span><b>1</b> Confirme seu e-mail</span><span><b>2</b> Gere seus links</span><span><b>3</b> Acompanhe comissões</span></div>{error && <div className="affiliate-alert error">{error}</div>}<form onSubmit={submit} className="affiliate-access-form"><label><span>Seu nome</span><input name="name" defaultValue={name} minLength={2} maxLength={100} autoComplete="name" required /></label><label><span>Seu e-mail</span><input name="email" type="email" defaultValue={email} inputMode="email" autoCapitalize="none" autoComplete="username" required /></label><label><span>Crie sua senha</span><PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" required /></label><label><span>Confirme a senha</span><PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" required /></label><button disabled={pending}>{pending ? "Enviando confirmação..." : "Criar meu acesso"}</button></form><small>O convite funciona uma única vez. O acesso só nasce depois da confirmação por e-mail.</small></section></main>;
}
