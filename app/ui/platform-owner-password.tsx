"use client";

import { useState, type FormEvent } from "react";
import { PasswordInput } from "./password-input";

export function PlatformOwnerPassword({ shop, pending, onSave, onSendEmail }: {
  shop: { name: string; ownerEmail: string; ownerEmailVerified: boolean; ownerHasPassword: boolean; isBlocked: boolean };
  pending: boolean;
  onSave: (password: string) => Promise<boolean>;
  onSendEmail: () => Promise<boolean>;
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
      setFeedback(shop.ownerEmailVerified ? "Nova senha salva. O cliente pode entrar e alterá-la em Configurações → Minha senha." : "Nova senha salva. O cliente ainda precisa confirmar o e-mail para entrar. Reenvie a confirmação pelo botão abaixo.");
    }
  }

  async function sendEmail() {
    setFeedback("");
    if (await onSendEmail()) setFeedback(`Pedido de envio concluído para ${shop.ownerEmail}. Confira a caixa de entrada e o spam.`);
  }

  return <section aria-label={`Recuperar acesso de ${shop.name}`}>
    <p><strong>E-mail do proprietário:</strong> {shop.ownerEmail || "Não informado"} · {shop.ownerEmailVerified ? "Confirmado" : "Aguardando confirmação"}</p>
    {!shop.ownerHasPassword && <p>Este proprietário ainda não possui um acesso com senha ativo.</p>}
    {shop.ownerHasPassword && !shop.ownerEmailVerified && <p>Você pode definir a senha agora. O cliente ainda precisa confirmar o e-mail para entrar. Reenvie a confirmação pelo botão abaixo.</p>}
    <div className="platform-shop-actions"><button type="button" disabled={pending || shop.isBlocked || !shop.ownerHasPassword} onClick={() => { setOpen(!open); setPassword(""); setConfirmation(""); setFeedback(""); }}>Redefinir senha do cliente</button><button type="button" disabled={pending || shop.isBlocked || !shop.ownerHasPassword} onClick={sendEmail}>{shop.ownerEmailVerified ? "Enviar link de recuperação" : "Reenviar confirmação"}</button></div>
    {open && <form className="access-form" onSubmit={submit}>
      <p>Defina uma senha e passe diretamente ao proprietário. As sessões anteriores serão encerradas. O prazo de teste permanece igual.</p>
      <label><span>Nova senha</span><PasswordInput value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required disabled={pending} /></label>
      <label><span>Confirmar nova senha</span><PasswordInput value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={6} maxLength={128} autoComplete="new-password" required disabled={pending} /></label>
      <button disabled={pending}>{pending ? "Salvando..." : "Salvar nova senha"}</button>
    </form>}
    {feedback && <p role="status">{feedback}</p>}
  </section>;
}
