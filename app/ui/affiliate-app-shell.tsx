"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { lockAffiliateScroll } from "../../lib/affiliate-scroll-lock";
import { BrandLogo } from "./brand-logo";
import styles from "./affiliate-app-shell.module.css";

export type AffiliateShellSection = "home" | "indications" | "links" | "commissions" | "prospecting" | "progress" | "settings";

type Props = {
  name: string;
  section: AffiliateShellSection;
  children: React.ReactNode;
  workspace?: boolean;
};

type IconName = "home" | "users" | "money" | "link" | "search" | "progress" | "whatsapp" | "more";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5.5h5V20"/></>,
    users: <><circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0M13.5 19a4.5 4.5 0 0 1 8 0"/></>,
    money: <><path d="M12 2v20M17 6.5c-1-1-2.5-1.5-5-1.5-3 0-5 1.4-5 3.5S9 12 12 12s5 1.4 5 3.5S15 19 12 19c-2.5 0-4-.5-5-1.5"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M7.5 10.5h6M10.5 7.5v6"/></>,
    progress: <><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></>,
    whatsapp: <><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.4-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8.5c.4 2.5 2 4.1 4.5 4.6"/></>,
    more: <><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

const sectionHeading: Partial<Record<AffiliateShellSection, { eyebrow: string; title: string; subtitle: string }>> = {
  indications: { eyebrow: "RESULTADOS", title: "Suas indicações", subtitle: "Veja quais barbearias entraram pelo seu link e em que etapa cada uma está." },
  links: { eyebrow: "DIVULGAÇÃO", title: "Seus links", subtitle: "Crie e organize os links que você usa para divulgar o Cortou Anotou." },
  commissions: { eyebrow: "COMISSÕES", title: "Comissões e pagamentos", subtitle: "Acompanhe o que já foi gerado, o que está pendente e o que já foi pago." },
};

function sectionHref(section: AffiliateShellSection) {
  if (section === "home") return "/afiliado";
  if (section === "indications") return "/afiliado?view=indicacoes";
  if (section === "links") return "/afiliado?view=links";
  if (section === "commissions") return "/afiliado?view=comissoes";
  if (section === "progress") return "/afiliado/prospeccao?tab=progress";
  if (section === "settings") return "/afiliado/prospeccao?tab=settings";
  return "/afiliado/prospeccao";
}

function bottomActive(section: AffiliateShellSection) {
  if (section === "prospecting") return "prospecting";
  if (section === "progress") return "progress";
  if (section === "links") return "links";
  if (section === "home") return "home";
  return "more";
}

export function AffiliateAppShell({ name, section, children, workspace = false }: Props) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuClosing, setMenuClosing] = useState(false);
  const closingRef = useRef(false);
  const closingTimer = useRef<number | null>(null);
  const pendingHref = useRef<string | undefined>(undefined);
  const releaseMenuScroll = useRef<(() => void) | null>(null);
  const activeBottom = bottomActive(section);
  const firstName = name.split(/\s+/).filter(Boolean)[0] || name || "Afiliado";
  const initial = firstName.slice(0, 1).toUpperCase() || "A";
  const heading = sectionHeading[section];

  const cancelClosingTimer = useCallback(() => {
    if (closingTimer.current !== null) window.clearTimeout(closingTimer.current);
    closingTimer.current = null;
  }, []);
  const finishMenuClose = useCallback(() => {
    if (!closingRef.current) return;
    cancelClosingTimer();
    closingRef.current = false;
    setMenuOpen(false);
    setMenuClosing(false);
    releaseMenuScroll.current?.();
    const href = pendingHref.current;
    pendingHref.current = undefined;
    if (href) router.push(href);
  }, [router, cancelClosingTimer]);
  const closeMenu = useCallback((href?: string) => {
    if (closingRef.current) return;
    closingRef.current = true;
    pendingHref.current = href;
    setMenuClosing(true);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    closingTimer.current = window.setTimeout(finishMenuClose, reducedMotion ? 0 : 420);
  }, [finishMenuClose]);

  function drawerLinkProps(next: AffiliateShellSection) {
    const href = sectionHref(next);
    return { href, onClick: (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); closeMenu(href); } };
  }

  useEffect(() => cancelClosingTimer, [cancelClosingTimer]);

  useEffect(() => {
    if (!menuOpen) return;
    const release = lockAffiliateScroll();
    releaseMenuScroll.current = release;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    window.addEventListener("keydown", close);
    return () => { release(); window.removeEventListener("keydown", close); };
  }, [menuOpen, closeMenu]);

  return <div className={styles.shell}>
    <header className={styles.topbar}>
      <button type="button" className={styles.menuButton} onClick={() => setMenuOpen(true)} aria-label="Abrir menu do afiliado" aria-expanded={menuOpen}><span/><span/><span/></button>
      <Link href="/afiliado" className={styles.brand} aria-label="Ir para o início do afiliado"><BrandLogo /></Link>
      <button type="button" className={styles.profileButton} onClick={() => setMenuOpen(true)} aria-label="Abrir perfil e mais opções"><span>{initial}</span></button>
    </header>

    {menuOpen && <>
      <button type="button" className={`${styles.backdrop} ${menuClosing ? styles.backdropClosing : ""}`} aria-label="Fechar menu" onClick={() => closeMenu()} />
      <aside className={`${styles.drawer} ${menuClosing ? styles.drawerClosing : ""}`} aria-label="Menu da área do afiliado" aria-busy={menuClosing}>
        <div className={styles.drawerHead}><BrandLogo /><button type="button" onClick={() => closeMenu()} aria-label="Fechar menu">×</button></div>
        <div className={styles.profileCard}><span>{initial}</span><div><strong>{name}</strong><small>Afiliado Cortou Anotou</small></div></div>

        <nav className={styles.drawerNav}>
          <p>RESULTADOS</p>
          <Link className={section === "home" ? styles.selected : ""} {...drawerLinkProps("home")}><Icon name="home"/><strong>Resumo</strong><i>›</i></Link>
          <Link className={section === "indications" ? styles.selected : ""} {...drawerLinkProps("indications")}><Icon name="users"/><strong>Indicações</strong><i>›</i></Link>
          <Link className={section === "commissions" ? styles.selected : ""} {...drawerLinkProps("commissions")}><Icon name="money"/><strong>Comissões</strong><i>›</i></Link>

          <p>DIVULGAÇÃO</p>
          <Link className={section === "links" ? styles.selected : ""} {...drawerLinkProps("links")}><Icon name="link"/><strong>Gerar links</strong><i>›</i></Link>

          <p>PROSPECÇÃO</p>
          <Link className={section === "prospecting" ? styles.selected : ""} {...drawerLinkProps("prospecting")}><Icon name="search"/><strong>Buscar clientes</strong><i>›</i></Link>
          <Link className={section === "progress" ? styles.selected : ""} {...drawerLinkProps("progress")}><Icon name="progress"/><strong>Progresso</strong><i>›</i></Link>
          <Link className={section === "settings" ? styles.selected : ""} {...drawerLinkProps("settings")}><Icon name="whatsapp"/><strong>WhatsApp e abordagem</strong><i>›</i></Link>
        </nav>

        <div className={styles.drawerFooter}><div><span>{initial}</span><small>{firstName}</small></div><a href="/api/affiliate/auth/logout">Sair</a></div>
      </aside>
    </>}

    {heading && <section className={styles.sectionHeading}><span>{heading.eyebrow}</span><h1>{heading.title}</h1><p>{heading.subtitle}</p></section>}

    <div className={`${styles.content} ${workspace ? styles.workspaceContent : ""} ${heading ? styles.portalSubsection : ""}`}>
      {children}
    </div>

    <div className={styles.bottomSpacer} aria-hidden="true" />
    <nav className={styles.bottomNav} aria-label="Navegação principal do afiliado">
      <Link className={`${styles.bottomItem} ${activeBottom === "home" ? styles.active : ""}`} href="/afiliado"><span className={styles.bottomIcon}><Icon name="home"/></span><strong>Início</strong></Link>
      <Link className={`${styles.bottomItem} ${activeBottom === "prospecting" ? styles.active : ""}`} href="/afiliado/prospeccao"><span className={styles.bottomIcon}><Icon name="search"/></span><strong>Prospecção</strong></Link>
      <Link className={`${styles.bottomItem} ${styles.primaryItem} ${activeBottom === "links" ? styles.active : ""}`} href="/afiliado?view=links"><span className={styles.primaryBubble}>+</span><strong>Gerar link</strong></Link>
      <Link className={`${styles.bottomItem} ${activeBottom === "progress" ? styles.active : ""}`} href="/afiliado/prospeccao?tab=progress"><span className={styles.bottomIcon}><Icon name="progress"/></span><strong>Progresso</strong></Link>
      <button type="button" className={`${styles.bottomItem} ${activeBottom === "more" ? styles.active : ""}`} onClick={() => setMenuOpen(true)}><span className={styles.bottomIcon}><Icon name="more"/></span><strong>Mais</strong></button>
    </nav>
  </div>;
}
