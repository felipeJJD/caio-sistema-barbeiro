"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { SUPPORT_EMAIL, SUPPORT_EMAIL_URL, SUPPORT_PHONE_DISPLAY, SUPPORT_WHATSAPP_URL } from "../../lib/support";
import { BrandLogo } from "./brand-logo";
import { PasswordInput } from "./password-input";

type ActionResult = { ok?: boolean; error?: string };

export function SupportContactLinks() {
  return <div className="security-support"><span>Precisa de ajuda?</span><a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">WhatsApp {SUPPORT_PHONE_DISPLAY}</a><a href={SUPPORT_EMAIL_URL}>{SUPPORT_EMAIL}</a></div>;
}

export function ResendVerificationButton({ email }: { email: string }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function resend() {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json() as ActionResult;
      setFeedback(response.ok ? "Se o cadastro estiver aguardando confirmação, um novo link chegará no e-mail." : result.error ?? "Não foi possível reenviar agora.");
    } catch {
      setFeedback("Não foi possível reenviar. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <div className="email-inline-action"><button type="button" onClick={resend} disabled={pending}>{pending ? "Enviando..." : "Reenviar e-mail"}</button>{feedback && <p role="status">{feedback}</p>}</div>;
}

export function VerificationRequestScreen({ initialEmail = "" }: { initialEmail?: string }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFeedback(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "") }),
      });
      const result = await response.json() as ActionResult;
      if (!response.ok) return setError(result.error ?? "Não foi possível reenviar agora.");
      setFeedback("Pronto. Se esse cadastro estiver aguardando confirmação, enviamos um novo link. Confira também o spam.");
    } catch {
      setError("Não foi possível reenviar. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <main className="access-page"><section className="access-card security-card"><BrandLogo variant="access" /><p className="access-kicker">CONFIRMAÇÃO DE E-MAIL</p><h1>Receba um novo link.</h1><p>Informe o mesmo e-mail usado para criar a barbearia.</p>{error && <div className="access-error" role="alert">{error}</div>}{feedback ? <div className="security-success" role="status">{feedback}</div> : <form className="access-form" onSubmit={submit}><label><span>E-mail do cadastro</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" defaultValue={initialEmail} required /></label><button disabled={pending}>{pending ? "Enviando..." : "Enviar novo link"}</button></form>}<Link className="security-back-link" href="/">Voltar ao login</Link><SupportContactLinks /></section></main>;
}

export function PasswordResetRequestScreen({ initialEmail = "" }: { initialEmail?: string }) {
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "") }),
      });
      const result = await response.json() as ActionResult;
      if (!response.ok) return setError(result.error ?? "Não foi possível continuar.");
      setFeedback("Se esse e-mail tiver um acesso confirmado, enviamos um link para criar uma nova senha. Confira também o spam.");
    } catch {
      setError("Não foi possível continuar. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <main className="access-page"><section className="access-card security-card"><BrandLogo variant="access" /><p className="access-kicker">RECUPERAÇÃO DE ACESSO</p><h1>Esqueceu sua senha?</h1><p>Informe seu e-mail. O link de recuperação funciona uma vez e expira em 1 hora.</p>{error && <div className="access-error" role="alert">{error}</div>}{feedback ? <div className="security-success" role="status">{feedback}</div> : <form className="access-form" onSubmit={submit}><label><span>E-mail do acesso</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="email" defaultValue={initialEmail} required /></label><button disabled={pending}>{pending ? "Enviando..." : "Enviar link de recuperação"}</button></form>}<Link className="security-back-link" href="/">Voltar ao login</Link><SupportContactLinks /></section></main>;
}

export function PasswordResetScreen({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) return setError("As duas senhas precisam ser iguais.");
    setPending(true);
    try {
      const response = await fetch("/api/auth/password-reset/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json() as ActionResult;
      if (!response.ok) return setError(result.error ?? "Não foi possível alterar sua senha.");
      setSuccess(true);
    } catch {
      setError("Não foi possível alterar sua senha. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <main className="access-page"><section className="access-card security-card"><BrandLogo variant="access" /><p className="access-kicker">NOVA SENHA</p><h1>{success ? "Senha alterada." : "Crie uma nova senha."}</h1>{success ? <><div className="security-success">Sua nova senha já está valendo. As sessões antigas foram encerradas por segurança.</div><Link className="access-button" href="/">Entrar no Cortou Anotou</Link></> : <><p>Use uma senha diferente das que você utiliza em outros aplicativos.</p>{error && <div className="access-error" role="alert">{error}</div>}<form className="access-form" onSubmit={submit}><label><span>Nova senha</span><PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" required /></label><label><span>Confirme a senha</span><PasswordInput value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" required /></label><button disabled={pending}>{pending ? "Alterando..." : "Salvar nova senha"}</button></form></>}<SupportContactLinks /></section></main>;
}
