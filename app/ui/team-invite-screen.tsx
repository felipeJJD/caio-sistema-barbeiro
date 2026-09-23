"use client";

import { FormEvent, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { PasswordInput } from "./password-input";
import { ResendVerificationButton, SupportContactLinks } from "./email-security";

type InviteResult = { ok?: boolean; error?: string; verificationRequired?: boolean; email?: string };

export function TeamInviteSetupScreen({ inviteToken, organizationName, invitedName, role, accessRole }: { inviteToken: string; organizationName: string; invitedName: string; role: string; accessRole: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) return setError("As duas senhas precisam ser iguais.");
    setPending(true);
    try {
      const response = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inviteToken, name: String(form.get("name") ?? ""), email: String(form.get("email") ?? ""), password }),
      });
      const result = await response.json() as InviteResult;
      if (!response.ok) return setError(result.error ?? "Não foi possível concluir o cadastro.");
      if (result.verificationRequired) {
        setVerificationEmail(result.email ?? String(form.get("email") ?? ""));
        return;
      }
      window.location.assign("/");
    } catch {
      setError("Não foi possível concluir. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  if (verificationEmail) return <main className="access-page"><section className="access-card invite-access-card email-confirmation-card"><BrandLogo variant="access" /><span className="signup-email-icon" aria-hidden="true">✓</span><p className="access-kicker">CONFIRMAÇÃO ENVIADA</p><h1>Confira seu e-mail.</h1><p>Mandamos um link para <b>{verificationEmail}</b>. O acesso à <b>{organizationName}</b> só será criado depois que você confirmar esse endereço.</p><div className="signup-email-note"><b>Ainda não liberamos o login.</b><span>Se a mensagem não aparecer, confira a caixa de spam.</span></div><ResendVerificationButton email={verificationEmail} /><SupportContactLinks /></section></main>;

  return <main className="access-page"><section className="access-card invite-access-card"><BrandLogo variant="access" /><p className="access-kicker">CONVITE DA EQUIPE</p><h1>Crie seu acesso.</h1><p>Você foi convidado para usar o Cortou Anotou da <b>{organizationName}</b>.</p><div className="invite-permission"><span>{role}</span><strong>{accessRole === "owner" ? "Administrador · acesso completo" : "Funcionário · somente os próprios dados"}</strong></div>{error && <div className="access-error">{error}</div>}<form className="access-form" onSubmit={submit}><label><span>Seu nome</span><input name="name" defaultValue={invitedName} autoComplete="name" placeholder="Nome e sobrenome" required /></label><label><span>Seu e-mail</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" placeholder="seuemail@exemplo.com" required /></label><label><span>Crie sua senha</span><PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" required /></label><label><span>Confirmar senha</span><PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" required /></label><button disabled={pending}>{pending ? "Enviando confirmação..." : "Criar meu acesso"}</button></form><small>Antes de liberar o acesso, vamos confirmar que o e-mail informado realmente pertence a você.</small></section></main>;
}
