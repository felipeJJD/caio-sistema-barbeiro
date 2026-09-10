import Link from "next/link";
import { BrandLogo } from "../ui/brand-logo";
import { SupportContactLinks } from "../ui/email-security";

export default async function EmailConfirmationPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const expired = status === "expired";
  return (
    <main className="access-page">
      <section className="access-card email-confirmation-card">
        <BrandLogo variant="access" />
        <p className="access-kicker">CONFIRMAÇÃO DE E-MAIL</p>
        <h1>{expired ? "Este link não está mais disponível." : "Não foi possível confirmar."}</h1>
        <p>{expired ? "O link expirou ou já foi utilizado. Se você já confirmou, entre normalmente com seu e-mail e sua senha." : "O endereço de confirmação está incompleto ou não pertence a um cadastro válido."}</p>
        {expired && <Link className="access-button" href="/reenviar-confirmacao">Receber um novo link</Link>}
        <Link className="security-back-link" href="/">Ir para o login</Link>
        <SupportContactLinks />
      </section>
    </main>
  );
}
