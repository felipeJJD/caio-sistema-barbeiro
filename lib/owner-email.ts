type VerificationEmailInput = {
  email: string;
  ownerName: string;
  organizationName: string;
  verificationToken: string;
  trialDays: number;
};

type PasswordResetEmailInput = {
  email: string;
  name: string;
  resetToken: string;
};

async function runtimeEmailConfig() {
  const { env } = await import("@/runtime/env");
  const values = env as unknown as Record<string, string | undefined>;
  return {
    apiKey: String(values.RESEND_API_KEY ?? "").trim(),
    from: String(values.OWNER_EMAIL_FROM ?? "Cortou Anotou <acesso@cortouanotou.com.br>").trim(),
    appUrl: String(values.PUBLIC_APP_URL ?? "https://cortouanotou.com.br").trim().replace(/\/$/, ""),
    supportEmail: String(values.SUPPORT_EMAIL ?? "cortouanotou@gmail.com").trim(),
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

export async function ownerEmailVerificationIsConfigured() {
  return Boolean((await runtimeEmailConfig()).apiKey);
}

async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const config = await runtimeEmailConfig();
  if (!config.apiKey) throw new Error("O envio de confirmação por e-mail ainda não está configurado.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: config.from,
      to: [input.to],
      reply_to: config.supportEmail,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) throw new Error("Não foi possível enviar o e-mail agora.");
}

export async function sendOwnerVerificationEmail(input: VerificationEmailInput) {
  const config = await runtimeEmailConfig();
  const confirmationUrl = `${config.appUrl}/confirmar-email/${encodeURIComponent(input.verificationToken)}`;
  const firstName = escapeHtml(input.ownerName.trim().split(/\s+/)[0] || "proprietário");
  const organizationName = escapeHtml(input.organizationName);
  await sendTransactionalEmail({
    to: input.email,
    subject: "Confirme seu e-mail no Cortou Anotou",
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f2e9;font-family:Arial,sans-serif;color:#20241f"><div style="max-width:560px;margin:0 auto;padding:34px 18px"><div style="background:#1d211d;border-radius:18px 18px 0 0;padding:22px 26px;color:#fff"><strong style="font-size:20px;letter-spacing:.08em">CORTOU <span style="color:#deb04c">ANOTOU</span></strong><div style="margin-top:7px;color:#d2aa54;font-size:11px">Agenda e gestão para barbearias</div></div><div style="background:#fff;border:1px solid #e2dccd;border-top:0;border-radius:0 0 18px 18px;padding:30px 26px"><p style="margin:0 0 8px;color:#987027;font-size:12px;font-weight:700">CONFIRMAÇÃO DE CADASTRO</p><h1 style="margin:0 0 14px;font:700 29px/1.2 Georgia,serif">Olá, ${firstName}.</h1><p style="margin:0 0 22px;color:#666d65;font-size:15px;line-height:1.6">Confirme que este e-mail pertence a você para liberar a <strong>${organizationName}</strong> e iniciar seus ${input.trialDays} dias grátis.</p><a href="${confirmationUrl}" style="display:block;padding:16px 20px;border-radius:11px;background:#30362f;color:#fff;text-decoration:none;text-align:center;font-size:15px;font-weight:800">Confirmar meu e-mail</a><p style="margin:20px 0 0;color:#8a8f88;font-size:12px;line-height:1.55">O teste só começa depois da confirmação. Este link expira em 24 horas.</p><p style="margin:14px 0 0;color:#a0a49e;font-size:11px;line-height:1.5">Se você não criou este cadastro, ignore esta mensagem.</p></div></div></body></html>`,
    text: `Olá, ${input.ownerName}. Confirme seu e-mail para liberar a ${input.organizationName} e iniciar seus ${input.trialDays} dias grátis: ${confirmationUrl}\n\nO link expira em 24 horas.`,
  });
}

export async function sendPasswordResetEmail(input: PasswordResetEmailInput) {
  const config = await runtimeEmailConfig();
  const resetUrl = `${config.appUrl}/redefinir-senha/${encodeURIComponent(input.resetToken)}`;
  const firstName = escapeHtml(input.name.trim().split(/\s+/)[0] || "cliente");
  const safeResetUrl = escapeHtml(resetUrl);
  await sendTransactionalEmail({
    to: input.email,
    subject: "Redefina sua senha do Cortou Anotou",
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f2e9;font-family:Arial,sans-serif;color:#20241f"><div style="max-width:560px;margin:0 auto;padding:34px 18px"><div style="background:#1d211d;border-radius:18px 18px 0 0;padding:22px 26px;color:#fff"><strong style="font-size:20px;letter-spacing:.08em">CORTOU <span style="color:#deb04c">ANOTOU</span></strong><div style="margin-top:7px;color:#d2aa54;font-size:11px">Agenda e gestão para barbearias</div></div><div style="background:#fff;border:1px solid #e2dccd;border-top:0;border-radius:0 0 18px 18px;padding:30px 26px"><p style="margin:0 0 8px;color:#987027;font-size:12px;font-weight:700">RECUPERAÇÃO DE ACESSO</p><h1 style="margin:0 0 14px;font:700 29px/1.2 Georgia,serif">Olá, ${firstName}.</h1><p style="margin:0 0 22px;color:#666d65;font-size:15px;line-height:1.6">Recebemos um pedido para criar uma nova senha para sua conta.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#30362f" style="border-radius:11px"><a href="${safeResetUrl}" target="_blank" rel="noopener noreferrer" style="display:block;padding:16px 20px;border-radius:11px;background:#30362f;color:#ffffff;text-decoration:none;text-align:center;font-size:15px;font-weight:800">Redefinir minha senha</a></td></tr></table><p style="margin:20px 0 7px;color:#777d75;font-size:12px;line-height:1.55">Se o botão não abrir, toque no endereço abaixo ou mantenha pressionado para copiá-lo:</p><p style="margin:0;padding:11px;border:1px solid #e1d6bd;border-radius:9px;background:#faf6eb;font-size:12px;line-height:1.55;word-break:break-all"><a href="${safeResetUrl}" target="_blank" rel="noopener noreferrer" style="color:#74541d;text-decoration:underline">${safeResetUrl}</a></p><p style="margin:20px 0 0;color:#8a8f88;font-size:12px;line-height:1.55">Este link funciona uma única vez e expira em 1 hora.</p><p style="margin:14px 0 0;color:#a0a49e;font-size:11px;line-height:1.5">Se você não pediu uma nova senha, ignore esta mensagem. Sua senha atual continuará funcionando.</p></div></div></body></html>`,
    text: `Olá, ${input.name}. Use este link para criar uma nova senha do Cortou Anotou: ${resetUrl}\n\nO link expira em 1 hora. Se você não fez este pedido, ignore esta mensagem.`,
  });
}
