import type { Metadata } from "next";
import Link from "next/link";
import { MercadoPagoSecurityForm } from "./security-form";

export const metadata: Metadata = {
  title: "Segurança Mercado Pago | Cortou Anotou",
  robots: { index: false, follow: false },
};

export default function MercadoPagoSecurityPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "#f5f3ed", color: "#1f241f", padding: "24px 16px 48px" }}>
      <section style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>
        <Link href="/?section=Plataforma" style={{ display: "inline-block", marginBottom: 18, color: "#7a6321", fontWeight: 700, textDecoration: "none" }}>
          ← Voltar para Plataforma
        </Link>
        <div style={{ background: "#fff", border: "1px solid #ded7c7", borderRadius: 24, padding: 22, boxShadow: "0 12px 35px rgba(31,36,31,.08)" }}>
          <p style={{ margin: 0, color: "#9b7620", fontSize: 12, fontWeight: 800, letterSpacing: ".14em" }}>ÁREA PRIVADA DO ADMINISTRADOR</p>
          <h1 style={{ margin: "8px 0 10px", fontSize: 30, lineHeight: 1.08 }}>Proteger integração do Mercado Pago</h1>
          <p style={{ margin: "0 0 20px", color: "#60655f", lineHeight: 1.55 }}>
            Cole as duas credenciais de produção abaixo. Elas são enviadas somente para o Cortou Anotou, criptografadas antes de serem guardadas e não voltam a aparecer na tela.
          </p>
          <MercadoPagoSecurityForm />
        </div>
      </section>
    </main>
  );
}
