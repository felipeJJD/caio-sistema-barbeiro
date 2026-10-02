"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { PasswordInput } from "./password-input";

export function AffiliateLoginScreen() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/affiliate/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) return setError(payload.error ?? "Não foi possível entrar.");
      window.location.assign("/afiliado");
    } catch {
      setError("Não foi possível entrar. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <main className="affiliate-access-page"><section className="affiliate-access-card"><BrandLogo variant="access" /><div className="affiliate-access-badge">ÁREA DO AFILIADO</div><h1>Suas indicações, em um só lugar.</h1><p>Acompanhe links, indicações, comissões e use a área de prospecção sem misturar com o aplicativo da barbearia.</p>{error && <div className="affiliate-alert error">{error}</div>}<form onSubmit={submit} className="affiliate-access-form"><label><span>E-mail ou ADM</span><input name="email" type="text" inputMode="email" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="seuemail@exemplo.com ou ADM" required /></label><label><span>Senha</span><PasswordInput name="password" autoComplete="current-password" placeholder="Sua senha" required /></label><button disabled={pending}>{pending ? "Entrando..." : "Entrar como afiliado"}</button></form><small>Afiliados entram com e-mail. O acesso administrativo usa ADM.</small><Link className="affiliate-back-link" href="/">Sou cliente ou funcionário de barbearia <b>→</b></Link></section></main>;
}
