"use client";

import { useState, type FormEvent } from "react";
import { PasswordInput } from "./password-input";

export function PlatformOwnerPassword({ shop, pending, onSave }: {
  shop: { name: string; ownerEmail: string; ownerEmailVerified: boolean; isBlocked: boolean };
  pending: boolean;
  onSave: (password: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [feedback, setFeedback] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) return setFeedback("As duas senhas precisam ser iguais.");
    setFeedback("");
    if (await onSave(password)) {
      setPassword("");
      setConfirmation("");
      setOpen(false);
      setFeedback("Nova senha salva. O cliente pode entrar e alterá-la em Configurações → Minha senha.");
    }
  }

  return <section aria-label={`Recuperar acesso de ${shop.name}`}>
    <p><strong>E-mail do proprietário:</strong> {shop.ownerEmail || "Não informado"} · {shop.ownerEmailVerified ? "Confirmado" : "Aguardando confirmação"}</p>
    {!shop.ownerEmailVerified && <p>O cliente precisa confirmar o e-mail antes de receber uma nova senha. A opção Esqueci minha senha reenvia a confirmação para cadastros pendentes.</p>}
    <div className="platform-shop-actions"><button type="button" disabled={pending || shop.isBlocked || !shop.ownerEmailVerified} onClick={() => { setOpen(!open); setPassword(""); setConfirmation(""); setFeedback(""); }}>Criar nova senha para o cliente</button></div>
    {open && <form className="access-form" onSubmit={submit}>
      <p>Defina uma senha e passe diretamente ao proprietário. As sessões anteriores serão encerradas. O prazo de teste permanece igual.</p>
      <label><span>Nova senha</span><PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required disabled={pending} /></label>
      <label><span>Confirmar nova senha</span><PasswordInput value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required disabled={pending} /></label>
      <button disabled={pending}>{pending ? "Salvando..." : "Salvar nova senha"}</button>
    </form>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
