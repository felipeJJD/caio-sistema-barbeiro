import Link from "next/link";
import type { ReactNode } from "react";
import { SUPPORT_EMAIL_URL } from "../../lib/support";
import { BrandLogo } from "./brand-logo";

export function LegalPage({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <main className="legal-page">
    <header className="legal-header"><Link href="/comece" aria-label="Cortou Anotou, página inicial"><BrandLogo /></Link><Link href="/comece">Voltar ao início →</Link></header>
    <article className="legal-document"><p className="legal-kicker">CORTOU ANOTOU · INFORMAÇÕES PÚBLICAS</p><h1>{title}</h1><p className="legal-intro">{subtitle}</p><p className="legal-updated">Atualizado em 20 de setembro de 2026</p>{children}</article>
    <footer className="legal-footer"><nav aria-label="Informações legais"><Link href="/privacidade">Privacidade</Link><Link href="/termos-de-uso">Termos de uso</Link><Link href="/exclusao-de-dados">Exclusão de dados</Link></nav><a href={SUPPORT_EMAIL_URL}>Falar por e-mail</a></footer>
  </main>;
}
