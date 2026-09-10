"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { PasswordInput } from "./password-input";
import { ResendVerificationButton, SupportContactLinks } from "./email-security";

type AuthResult = { ok?: boolean; error?: string; verificationRequired?: boolean; email?: string };

function Brand() {
  return <BrandLogo variant="access" />;
}

export function SignInScreen({ initialEmail = "" }: { initialEmail?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [attemptedEmail, setAttemptedEmail] = useState(initialEmail);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    setAttemptedEmail(email);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: String(form.get("password") ?? "") }),
      });
      const result = await response.json() as AuthResult;
      if (!response.ok) return setError(result.error ?? "Não foi possível entrar.");
      window.location.assign("/");
    } catch {
      setError("Não foi possível entrar. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <main className="access-page"><section className="access-card"><Brand /><p className="access-kicker">ACESSO DA EQUIPE</p><h1>Bem-vindo ao Cortou Anotou.</h1><p>Entre com o e-mail e a senha cadastrados pelo administrador da sua barbearia.</p>{error && <><div className="access-error">{error}</div>{error.includes("Confirme seu e-mail") && attemptedEmail && <ResendVerificationButton email={attemptedEmail} />}</>}<form className="access-form" onSubmit={submit}><label><span>E-mail</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" placeholder="seuemail@exemplo.com" defaultValue={initialEmail} required /></label><label><span>Senha</span><PasswordInput name="password" autoComplete="current-password" placeholder="Sua senha" required autoFocus={Boolean(initialEmail)} /></label><Link className="forgot-password-link" href={`/esqueci-senha${attemptedEmail ? `?email=${encodeURIComponent(attemptedEmail)}` : ""}`}>Esqueci minha senha</Link><button disabled={pending}>{pending ? "Entrando..." : "Entrar no Cortou Anotou"}</button></form><small>O acesso fica salvo neste celular por até 6 meses.</small><div className="access-customer-cta"><span>Ainda não usa o aplicativo?</span><Link href="/comece">Criar minha barbearia grátis <b>→</b></Link></div><div className="access-customer-cta affiliate-login-cta"><span>Participa do programa de indicação?</span><Link href="/afiliado">Entrar como afiliado <b>→</b></Link></div><SupportContactLinks /></section></main>;
}

export function OwnerSetupScreen({ email, name }: { email: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if (password !== confirmation) return setError("As duas senhas precisam ser iguais.");
    setPending(true);
    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as AuthResult;
      if (!response.ok) return setError(result.error ?? "Não foi possível ativar seu acesso.");
      window.location.assign("/");
    } catch {
      setError("Não foi possível ativar. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <main className="access-page"><section className="access-card"><Brand /><p className="access-kicker">ATIVAÇÃO DO PROPRIETÁRIO</p><h1>Crie sua senha, {name.split(" ")[0]}.</h1><p>Depois desta etapa, você entrará diretamente pelo Cortou Anotou.</p><div className="recognized-email"><span>E-mail reconhecido</span><strong>{email}</strong></div>{error && <div className="access-error">{error}</div>}<form className="access-form" onSubmit={submit}><label><span>Nova senha</span><PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" required /></label><label><span>Confirmar senha</span><PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Repita sua senha" required /></label><button disabled={pending}>{pending ? "Ativando..." : "Criar minha senha"}</button></form><small>Você continuará sendo o administrador da Kaio Barbearia.</small></section></main>;
}

export function InviteSetupScreen({ inviteToken, organizationName, invitedName, role, accessRole }: { inviteToken: string; organizationName: string; invitedName: string; role: string; accessRole: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      const result = await response.json() as AuthResult;
      if (!response.ok) return setError(result.error ?? "Não foi possível concluir o cadastro.");
      window.location.assign("/");
    } catch {
      setError("Não foi possível concluir. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <main className="access-page"><section className="access-card invite-access-card"><Brand /><p className="access-kicker">CONVITE DA EQUIPE</p><h1>Crie seu acesso.</h1><p>Você foi convidado para usar o Cortou Anotou da <b>{organizationName}</b>.</p><div className="invite-permission"><span>{role}</span><strong>{accessRole === "owner" ? "Administrador · acesso completo" : "Funcionário · somente os próprios dados"}</strong></div>{error && <div className="access-error">{error}</div>}<form className="access-form" onSubmit={submit}><label><span>Seu nome</span><input name="name" defaultValue={invitedName} autoComplete="name" placeholder="Nome e sobrenome" required /></label><label><span>Seu e-mail</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" placeholder="seuemail@exemplo.com" required /></label><label><span>Crie sua senha</span><PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" required /></label><label><span>Confirmar senha</span><PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" required /></label><button disabled={pending}>{pending ? "Criando acesso..." : "Entrar para a equipe"}</button></form><small>O convite funciona uma única vez. Depois, entre normalmente com seu e-mail e senha.</small></section></main>;
}

export function NewBarbershopSetupScreen({ inviteToken, invitedLabel, trialDays }: { inviteToken: string; invitedLabel: string; trialDays: number }) {
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
      const response = await fetch("/api/auth/barbershop-invite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inviteToken,
          ownerName: String(form.get("ownerName") ?? ""),
          organizationName: String(form.get("organizationName") ?? ""),
          ownerDocument: String(form.get("ownerDocument") ?? ""),
          email: String(form.get("email") ?? ""),
          password,
        }),
      });
      const result = await response.json() as AuthResult;
      if (!response.ok) return setError(result.error ?? "Não foi possível criar sua barbearia.");
      if (result.verificationRequired) {
        setVerificationEmail(result.email ?? String(form.get("email") ?? ""));
        return;
      }
      window.location.assign("/?welcome=barbershop");
    } catch {
      setError("Não foi possível concluir. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  if (verificationEmail) return <main className="access-page new-shop-access"><section className="access-card new-shop-card email-confirmation-card"><Brand /><span className="signup-email-icon" aria-hidden="true">✓</span><p className="access-kicker">CONFIRMAÇÃO ENVIADA</p><h1>Confira seu e-mail.</h1><p>Mandamos um link para <b>{verificationEmail}</b>. Ao confirmar, seus {trialDays} dias serão liberados e você entrará na nova barbearia.</p><div className="signup-email-note"><b>Seu período gratuito ainda não começou.</b><span>Se a mensagem não aparecer, confira a caixa de spam.</span></div><ResendVerificationButton email={verificationEmail} /><SupportContactLinks /></section></main>;

  return <main className="access-page new-shop-access"><section className="access-card new-shop-card"><Brand /><div className="new-shop-badge">CONVITE DE TESTE · {trialDays} DIAS</div><p className="access-kicker">NOVA BARBEARIA</p><h1>Comece seu espaço do zero.</h1><p>Este convite foi preparado para <b>{invitedLabel}</b>. Seus clientes, agenda, funcionários e financeiro ficarão separados de todas as outras barbearias.</p><div className="new-shop-steps"><span><b>1</b> Crie a barbearia</span><span><b>2</b> Ajuste serviços</span><span><b>3</b> Convide a equipe</span></div>{error && <div className="access-error">{error}</div>}<form className="access-form" onSubmit={submit}><label><span>Seu nome</span><input name="ownerName" autoComplete="name" placeholder="Nome do proprietário" required /></label><label><span>Nome da barbearia</span><input name="organizationName" autoComplete="organization" placeholder="Ex.: Barbearia do Will" required /></label><label><span>CPF ou CNPJ do responsável</span><input name="ownerDocument" inputMode="numeric" autoComplete="off" placeholder="Insira um CPF ou CNPJ válido" minLength={11} maxLength={18} required /></label><label><span>Seu e-mail</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" placeholder="seuemail@exemplo.com" required /></label><label><span>Crie sua senha</span><PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" required /></label><label><span>Confirmar senha</span><PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" required /></label><button disabled={pending}>{pending ? "Criando sua barbearia..." : "Criar minha barbearia"}</button></form><small>O link funciona uma única vez. Após confirmar o e-mail, você entrará como proprietário.</small></section></main>;
}

export function InvalidInviteScreen({ status }: { status?: string }) {
  const message = status === "Utilizado" ? "Este convite já foi utilizado." : status === "Expirado" ? "Este convite expirou." : status === "Cancelado" ? "Este convite foi cancelado." : "Este convite não é válido.";
  return <main className="access-page"><section className="access-card"><Brand /><p className="access-kicker">CONVITE DA EQUIPE</p><h1>Link indisponível.</h1><p>{message} Peça ao administrador da barbearia para gerar um novo link.</p><Link className="access-button" href="/">Ir para o login</Link></section></main>;
}

export function InvalidBarbershopInviteScreen({ status }: { status?: string }) {
  const message = status === "Utilizado" ? "Este convite já criou uma barbearia." : status === "Expirado" ? "Este convite expirou." : status === "Cancelado" ? "Este convite foi cancelado." : "Este convite não é válido.";
  return <main className="access-page"><section className="access-card"><Brand /><p className="access-kicker">NOVA BARBEARIA</p><h1>Link indisponível.</h1><p>{message} Peça ao administrador do Cortou Anotou um novo link de teste.</p><Link className="access-button" href="/">Ir para o login</Link></section></main>;
}
