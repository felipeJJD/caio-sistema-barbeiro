"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { PasswordInput } from "./password-input";
import { showAppToast } from "./app-toast";

type AffiliateDashboardData = {
  month: string;
  profile: { name: string; email: string; whatsapp: string; pixKey: string; payoutStatus: string };
  summary: {
    monthReferrals: number;
    totalReferrals: number;
    payingReferrals: number;
    activeLinks: number;
    monthCommissionCents: number;
    monthPaidCents: number;
    pendingCents: number;
    lifetimeCents: number;
    paidLifetimeCents: number;
  };
  links: Array<{ id: number; label: string; code: string; url: string; commissionBps: number; commissionMonths: number; active: boolean; isMain: boolean; referrals: number; payingReferrals: number; earnedCents: number; createdAt: string }>;
  shops: Array<{ id: number; name: string; attributedAt: string; commissionEndsAt: string; linkLabel: string; code: string; status: string; statusLabel: string; archived: boolean; lastPaymentAt: string | null; monthCommissionCents: number; lifetimeCommissionCents: number }>;
  payouts: Array<{ paidAt: string; amountCents: number }>;
};

type PortalTab = "Resumo" | "Indicações" | "Gerar links" | "Comissões";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents || 0) / 100);
}

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("pt-BR");
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AF";
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    window.prompt("Copie o link:", value);
    return false;
  }
}

export function AffiliateSignInScreen() {
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

  return <main className="affiliate-access-page"><section className="affiliate-access-card"><BrandLogo variant="access" /><div className="affiliate-access-badge">ÁREA DO AFILIADO</div><h1>Suas indicações, em um só lugar.</h1><p>Acompanhe barbearias indicadas, comissões e pagamentos sem misturar com o aplicativo da equipe.</p>{error && <div className="affiliate-alert error">{error}</div>}<form onSubmit={submit} className="affiliate-access-form"><label><span>E-mail</span><input name="email" type="email" inputMode="email" autoCapitalize="none" autoComplete="username" placeholder="seuemail@exemplo.com" required /></label><label><span>Senha</span><PasswordInput name="password" autoComplete="current-password" placeholder="Sua senha" required /></label><button disabled={pending}>{pending ? "Entrando..." : "Entrar como afiliado"}</button></form><small>Seu primeiro acesso é criado pelo link de convite enviado pelo Cortou Anotou.</small><Link className="affiliate-back-link" href="/">Sou cliente ou funcionário de barbearia <b>→</b></Link></section></main>;
}

export function AffiliateInviteScreen({ inviteToken, name, email }: { inviteToken: string; name: string; email: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const payload = await response.json() as { error?: string };
      if (!response.ok) return setError(payload.error ?? "Não foi possível criar seu acesso.");
      window.location.assign("/afiliado");
    } catch {
      setError("Não foi possível concluir. Verifique sua conexão.");
    } finally {
      setPending(false);
    }
  }

  return <main className="affiliate-access-page invite"><section className="affiliate-access-card"><BrandLogo variant="access" /><div className="affiliate-access-badge">CONVITE DE AFILIADO</div><h1>Bem-vindo ao programa de indicação.</h1><p>Crie seu acesso exclusivo. Depois, você poderá gerar seus próprios links e acompanhar cada resultado.</p><div className="affiliate-invite-rules"><span><b>1</b> Gere seus links</span><span><b>2</b> Indique barbearias</span><span><b>3</b> Acompanhe comissões</span></div>{error && <div className="affiliate-alert error">{error}</div>}<form onSubmit={submit} className="affiliate-access-form"><label><span>Seu nome</span><input name="name" defaultValue={name} minLength={2} maxLength={100} autoComplete="name" required /></label><label><span>Seu e-mail</span><input name="email" type="email" defaultValue={email} inputMode="email" autoCapitalize="none" autoComplete="username" required /></label><label><span>Crie sua senha</span><PasswordInput name="password" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" required /></label><label><span>Confirme a senha</span><PasswordInput name="confirmation" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" required /></label><button disabled={pending}>{pending ? "Criando acesso..." : "Criar meu acesso"}</button></form><small>Este convite funciona uma única vez e expira em 7 dias.</small></section></main>;
}

export function InvalidAffiliateInviteScreen({ status }: { status?: string }) {
  const message = status === "Utilizado" ? "Este convite já foi utilizado." : status === "Expirado" ? "Este convite expirou." : status === "Cancelado" ? "Este convite foi cancelado." : "Este convite não é válido.";
  return <main className="affiliate-access-page"><section className="affiliate-access-card"><BrandLogo variant="access" /><div className="affiliate-access-badge">CONVITE DE AFILIADO</div><h1>Link indisponível.</h1><p>{message} Peça ao Cortou Anotou um novo convite de acesso.</p><Link className="affiliate-access-button" href="/afiliado">Ir para o login</Link></section></main>;
}

export function AffiliatePausedScreen() {
  return <main className="affiliate-access-page"><section className="affiliate-access-card"><BrandLogo variant="access" /><div className="affiliate-access-badge paused">ACESSO PAUSADO</div><h1>Seu painel está temporariamente pausado.</h1><p>Se precisar reativar o acesso ou conferir uma comissão, fale com o administrador do Cortou Anotou.</p><a className="affiliate-access-button" href="/api/affiliate/auth/logout">Sair</a></section></main>;
}

export function AffiliatePortal({ initialData }: { initialData: AffiliateDashboardData }) {
  const [data, setData] = useState(initialData);
  const [tab, setTab] = useState<PortalTab>("Resumo");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [monthPending, setMonthPending] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const firstName = data.profile.name.split(/\s+/)[0] || data.profile.name;
  const activeMainLink = data.links.find((link) => link.isMain) ?? data.links.find((link) => link.active) ?? data.links[0];
  const activeShops = useMemo(() => data.shops.filter((shop) => !shop.archived), [data.shops]);
  const archivedShops = useMemo(() => data.shops.filter((shop) => shop.archived), [data.shops]);
  const visibleShops = showArchived ? archivedShops : activeShops;
  const trialCount = useMemo(() => activeShops.filter((shop) => shop.status === "trial").length, [activeShops]);

  async function loadMonth(month: string) {
    setMonthPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/affiliate/dashboard?month=${encodeURIComponent(month)}`, { cache: "no-store" });
      const payload = await response.json() as AffiliateDashboardData & { error?: string };
      if (!response.ok) return setFeedback(payload.error ?? "Não foi possível trocar o mês.");
      setData(payload);
    } catch {
      setFeedback("Não foi possível trocar o mês.");
    } finally {
      setMonthPending(false);
    }
  }

  async function action(body: Record<string, string | number | boolean>, success: string) {
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/affiliate/dashboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, month: data.month }),
      });
      const payload = await response.json() as AffiliateDashboardData & { error?: string };
      if (!response.ok) { setFeedback(payload.error ?? "Não foi possível salvar."); return false; }
      setData(payload);
      setFeedback(null);
      showAppToast(success);
      return true;
    } catch {
      setFeedback("Não foi possível salvar. Verifique sua conexão.");
      return false;
    } finally {
      setPending(false);
    }
  }

  async function createLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    if (await action({ action: "create-link", label: String(values.get("label") ?? ""), code: String(values.get("code") ?? "") }, "Novo link criado com sucesso.")) form.reset();
  }

  async function savePix(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await action({ action: "update-pix", pixKey: String(values.get("pixKey") ?? "") }, "Chave Pix salva com sucesso.");
  }

  async function copyLink(url: string, label: string) {
    if (!await copyText(url)) return;
    showAppToast(`Link “${label}” copiado.`);
  }

  async function deleteLink(link: AffiliateDashboardData["links"][number]) {
    if (!window.confirm(`Excluir “${link.label}”?\n\nEsse link deixará de funcionar e será removido da sua lista.`)) return;
    await action({ action: "delete-link", linkId: link.id }, "Link excluído.");
  }

  return <main className="affiliate-portal-shell">
    <header className="affiliate-portal-header"><BrandLogo variant="access" /><div className="affiliate-profile-chip"><span>{initials(data.profile.name)}</span><div><strong>{data.profile.name}</strong><small>Afiliado Cortou Anotou</small></div><a href="/api/affiliate/auth/logout" aria-label="Sair da área de afiliado">Sair</a></div></header>
    <section className="affiliate-welcome"><div><span>PAINEL DO AFILIADO</span><h1>Olá, {firstName}. <em>Seus resultados estão aqui.</em></h1><p>Crie links, acompanhe as barbearias indicadas e veja exatamente o que já virou comissão.</p></div>{activeMainLink && <button type="button" onClick={() => copyLink(activeMainLink.url, activeMainLink.label)}>Copiar link principal <b>↗</b></button>}</section>
    <nav className="affiliate-tabs" aria-label="Áreas do painel">{(["Resumo", "Indicações", "Gerar links", "Comissões"] as PortalTab[]).map((item) => <button type="button" className={tab === item ? "active" : ""} onClick={() => { setTab(item); setFeedback(null); }} key={item}>{item}{item === "Comissões" && data.summary.pendingCents > 0 ? <i /> : null}</button>)}</nav>
    <section className="affiliate-period"><div><span>PERÍODO DA ANÁLISE</span><strong>{monthLabel(data.month)}</strong></div><label><input type="month" value={data.month} onChange={(event) => void loadMonth(event.target.value)} disabled={monthPending} aria-label="Mês da análise" /></label></section>
    {feedback && <div className={feedback.includes("Não") || feedback.includes("não") || feedback.includes("pausado") ? "affiliate-alert error portal" : "affiliate-alert success portal"}>{feedback}</div>}

    {tab === "Resumo" && <div className="affiliate-portal-content"><section className="affiliate-stat-grid"><article className="gold"><small>COMISSÃO DO MÊS</small><strong>{money(data.summary.monthCommissionCents)}</strong><span>Confirmada após pagamento</span></article><article><small>A RECEBER</small><strong>{money(data.summary.pendingCents)}</strong><span>Comissão Pix pendente</span></article><article><small>INDICAÇÕES DO MÊS</small><strong>{data.summary.monthReferrals}</strong><span>{data.summary.totalReferrals} no total</span></article><article><small>BARBEARIAS PAGANTES</small><strong>{data.summary.payingReferrals}</strong><span>{trialCount} ainda em teste</span></article></section><section className="affiliate-overview-grid"><article className="affiliate-overview-card"><div><span>SEU LINK MAIS USADO</span><h2>{activeMainLink?.label ?? "Crie seu primeiro link"}</h2><p>{activeMainLink ? `${activeMainLink.referrals} indicação${activeMainLink.referrals === 1 ? "" : "ões"} · ${activeMainLink.payingReferrals} pagante${activeMainLink.payingReferrals === 1 ? "" : "s"}` : "Você poderá separar cada campanha em um link diferente."}</p></div>{activeMainLink ? <><code>{activeMainLink.url}</code><button type="button" onClick={() => copyLink(activeMainLink.url, activeMainLink.label)}>Copiar para divulgar</button></> : <button type="button" onClick={() => setTab("Gerar links")}>Criar link agora</button>}</article><article className="affiliate-progress-card"><span>RESULTADO ACUMULADO</span><strong>{money(data.summary.lifetimeCents)}</strong><p>Comissões confirmadas desde o início.</p><div><i style={{ width: `${data.summary.lifetimeCents ? Math.min(100, Math.round(data.summary.paidLifetimeCents / data.summary.lifetimeCents * 100)) : 0}%` }} /></div><small>{money(data.summary.paidLifetimeCents)} já pagos</small></article></section><section className="affiliate-recent"><div className="affiliate-section-heading"><div><span>ÚLTIMAS INDICAÇÕES</span><h2>Movimento recente</h2></div><button type="button" onClick={() => setTab("Indicações")}>Ver todas</button></div>{activeShops.slice(0, 4).map((shop) => <article key={shop.id}><span className="affiliate-shop-avatar">{initials(shop.name)}</span><div><strong>{shop.name}</strong><small>Indicada em {shortDate(shop.attributedAt)} · {shop.linkLabel}</small></div><b className={`affiliate-shop-status ${shop.status}`}>{shop.statusLabel}</b><em>{money(shop.monthCommissionCents)}</em></article>)}{!activeShops.length && <div className="affiliate-empty"><span>◇</span><strong>Ainda não há indicações.</strong><p>Vá em “Gerar links” para criar e compartilhar sua primeira indicação.</p></div>}</section></div>}

    {tab === "Indicações" && <div className="affiliate-portal-content"><section className="affiliate-section-card"><div className="affiliate-section-heading"><div><span>BARBEARIAS INDICADAS</span><h2>{showArchived ? "Indicações arquivadas" : `Resultados de ${monthLabel(data.month)}`}</h2><p>{showArchived ? "Estas indicações continuam preservadas para histórico e comissão." : "Você vê somente os dados necessários para acompanhar sua comissão."}</p></div><div className="affiliate-link-actions"><button type="button" className={!showArchived ? "quiet" : ""} onClick={() => setShowArchived(false)}>Ativas ({activeShops.length})</button>{archivedShops.length > 0 && <button type="button" className={showArchived ? "quiet" : ""} onClick={() => setShowArchived(true)}>Arquivadas ({archivedShops.length})</button>}</div></div><div className="affiliate-shop-list">{visibleShops.map((shop) => <article key={shop.id}><div className="affiliate-shop-main"><span className="affiliate-shop-avatar">{initials(shop.name)}</span><div><strong>{shop.name}</strong><small>{shop.linkLabel} · código {shop.code}</small></div><b className={`affiliate-shop-status ${shop.status}`}>{shop.statusLabel}</b></div><div className="affiliate-shop-details"><span><small>Indicada em</small><strong>{shortDate(shop.attributedAt)}</strong></span><span><small>Último pagamento</small><strong>{shortDate(shop.lastPaymentAt)}</strong></span><span><small>Comissão no mês</small><strong>{money(shop.monthCommissionCents)}</strong></span><span><small>Total gerado</small><strong>{money(shop.lifetimeCommissionCents)}</strong></span></div><div className="affiliate-link-actions"><button type="button" className="quiet" disabled={pending} onClick={() => action({ action: "set-referral-archived", referralId: shop.id, archived: !shop.archived }, shop.archived ? "Indicação restaurada." : "Indicação arquivada.")}>{shop.archived ? "Restaurar" : "Arquivar"}</button></div></article>)}{!visibleShops.length && <div className="affiliate-empty"><span>◇</span><strong>{showArchived ? "Nenhuma indicação arquivada." : "Nenhuma barbearia indicada ainda."}</strong><p>{showArchived ? "Quando você arquivar uma indicação, ela aparecerá aqui." : "Vá em “Gerar links”, copie um endereço e envie ao proprietário."}</p></div>}</div></section></div>}

    {tab === "Gerar links" && <div className="affiliate-portal-content affiliate-links-layout"><section className="affiliate-section-card"><div className="affiliate-section-heading"><div><span>LINKS DE INDICAÇÃO</span><h2>Links para enviar às barbearias</h2><p>Estes links abrem o cadastro público do Cortou Anotou e registram a indicação automaticamente em seu nome.</p></div><strong>{data.links.length} código{data.links.length === 1 ? "" : "s"}</strong></div><div className="affiliate-link-list">{data.links.map((link) => <article className={!link.active ? "inactive" : ""} key={link.id}><div className="affiliate-link-title"><div><strong>{link.label}</strong><small>{link.commissionBps / 100}% por {link.commissionMonths} meses</small></div><b>{link.active ? "ATIVO" : "PAUSADO"}</b></div><code>{link.url}</code><div className="affiliate-link-metrics"><span><small>Indicações</small><strong>{link.referrals}</strong></span><span><small>Pagantes</small><strong>{link.payingReferrals}</strong></span><span><small>Gerado</small><strong>{money(link.earnedCents)}</strong></span></div><div className="affiliate-link-actions"><button type="button" onClick={() => copyLink(link.url, link.label)}>Copiar para barbearia</button><a href={`https://wa.me/?text=${encodeURIComponent(`Conheça o Cortou Anotou e teste grátis: ${link.url}`)}`} target="_blank" rel="noreferrer">Enviar no WhatsApp</a><button type="button" className="quiet" disabled={pending} onClick={() => action({ action: "set-link-active", linkId: link.id, active: !link.active }, link.active ? "Link pausado." : "Link reativado.")}>{link.active ? "Pausar" : "Reativar"}</button>{!link.isMain && link.referrals === 0 && link.earnedCents === 0 && <button type="button" className="quiet danger" disabled={pending} aria-label={`Excluir ${link.label}`} onClick={() => void deleteLink(link)}>🗑 Excluir</button>}</div></article>)}</div></section><section className="affiliate-create-link-card"><span>NOVO LINK DE INDICAÇÃO</span><h2>Gerar link para barbearias</h2><p>Crie o link aqui e envie para o dono da barbearia. O convite que você recebeu serviu somente para liberar esta área.</p><form onSubmit={createLink}><label><span>NOME DA CAMPANHA</span><input name="label" maxLength={60} placeholder="Ex.: Barbearias de Curitiba" required /></label><label><span>CÓDIGO PERSONALIZADO</span><input name="code" minLength={3} maxLength={48} placeholder="Ex.: curitiba-luizao" /><small>Opcional. Se deixar vazio, criamos um código seguro.</small></label><button disabled={pending}>{pending ? "Criando..." : "Gerar link de indicação"}</button></form></section></div>}

    {tab === "Comissões" && <div className="affiliate-portal-content affiliate-payout-layout"><section className="affiliate-payout-hero"><span>A RECEBER</span><strong>{money(data.summary.pendingCents)}</strong><p>Este valor já foi confirmado por pagamentos aprovados e aguarda pagamento via Pix.</p><div><small>CHAVE PIX CADASTRADA</small><b>{data.profile.pixKey || "Ainda não informada"}</b></div></section><section className="affiliate-section-card"><div className="affiliate-section-heading"><div><span>HISTÓRICO DE COMISSÕES</span><h2>Pagamentos recebidos</h2></div><strong>{money(data.summary.paidLifetimeCents)} no total</strong></div><div className="affiliate-payout-list">{data.payouts.map((payout) => <article key={payout.paidAt}><span>✓</span><div><strong>Comissão via Pix</strong><small>Pago em {shortDate(payout.paidAt)}</small></div><b>{money(payout.amountCents)}</b></article>)}{!data.payouts.length && <div className="affiliate-empty"><span>◇</span><strong>Nenhuma comissão confirmada ainda.</strong><p>Quando o primeiro Pix for marcado como pago, ele aparecerá aqui.</p></div>}</div></section><section className="affiliate-pix-card"><span>DADOS PARA RECEBER</span><h2>Sua chave Pix</h2><p>Você pode atualizar a chave quando precisar. O pagamento continua sendo feito manualmente e fica registrado no histórico.</p><form onSubmit={savePix}><label><span>CHAVE PIX</span><input name="pixKey" defaultValue={data.profile.pixKey} key={data.profile.pixKey} maxLength={160} placeholder="CPF, telefone, e-mail ou chave aleatória" /></label><button disabled={pending}>{pending ? "Salvando..." : "Salvar chave Pix"}</button></form></section></div>}
  </main>;
}
