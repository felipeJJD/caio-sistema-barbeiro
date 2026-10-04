"use client";

import Link from "next/link";
import styles from "./affiliate-bottom-nav.module.css";

export type AffiliateNavTab = "home" | "prospecting" | "progress" | "settings";

type Props = {
  active: AffiliateNavTab;
  onSelect?: (tab: Exclude<AffiliateNavTab, "home">) => void;
};

const items: Array<{ key: AffiliateNavTab; label: string; href: string; icon: "home" | "search" | "progress" | "settings" }> = [
  { key: "home", label: "Início", href: "/afiliado", icon: "home" },
  { key: "prospecting", label: "Prospecção", href: "/afiliado/prospeccao", icon: "search" },
  { key: "progress", label: "Progresso", href: "/afiliado/prospeccao?tab=progress", icon: "progress" },
  { key: "settings", label: "Configurações", href: "/afiliado/prospeccao?tab=settings", icon: "settings" },
];

function Icon({ name }: { name: "home" | "search" | "progress" | "settings" }) {
  if (name === "home") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5.5h5V20"/></svg>;
  if (name === "search") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/><path d="M7.5 10.5h6M10.5 7.5v6"/></svg>;
  if (name === "progress") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9M12 19V5M19 19v-7"/><path d="M3 19h18"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 14.8 6l-.3-2.6h-4L10.2 6a7 7 0 0 0-1.7 1.1l-2.4-1-2 3.4L6.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1.1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1.1l2.4 1 2-3.4-2-1.5c.1-.3.1-.7.1-1Z"/></svg>;
}

export function AffiliateBottomNav({ active, onSelect }: Props) {
  return <>
    <div className={styles.spacer} aria-hidden="true" />
    <nav className={styles.nav} aria-label="Navegação da área do afiliado">
      <div className={styles.inner}>
        {items.map((item) => {
          const className = `${styles.item} ${active === item.key ? styles.active : ""}`;
          const content = <><Icon name={item.icon} /><span>{item.label}</span></>;
          if (item.key !== "home" && onSelect) {
            return <button type="button" key={item.key} className={className} onClick={() => onSelect(item.key as Exclude<AffiliateNavTab, "home">)} aria-current={active === item.key ? "page" : undefined}>{content}</button>;
          }
          return <Link key={item.key} href={item.href} className={className} aria-current={active === item.key ? "page" : undefined}>{content}</Link>;
        })}
      </div>
    </nav>
  </>;
}
