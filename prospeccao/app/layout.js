import "./globals.css";
import "./prospeccao.css";

export const metadata = {
  title: "C.A. Prospecção | Cortou Anotou",
  description: "Painel de prospecção de barbearias do Cortou Anotou.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
