import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./notification-center.css";
import "./products.css";
import "./owner-payout.css";
import "./team-payments.css";
import "./affiliate-portal.css";
import "./shell-chrome.css";
import "./help-chat.css";
import "./legal.css";
import "./help-launcher-drag.css";
import { AppGestureGuard } from "./ui/app-gesture-guard";
import { AppToastHost } from "./ui/app-toast";
import { HelpLauncherDragGuard } from "./ui/help-launcher-drag-guard";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#F7F6F0",
};

export const metadata: Metadata = {
  title: "Cortou Anotou | Agenda e gestão para barbearias",
  description: "Agenda, atendimentos, equipe e financeiro da sua barbearia em um só aplicativo.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/cortou-anotou-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/cortou-anotou-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/cortou-anotou-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: "/icons/cortou-anotou-64.png",
  },
  appleWebApp: {
    capable: true,
    title: "Cortou Anotou",
    statusBarStyle: "default",
  },
  other: { "codex-preview": "development" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="apple-touch-startup-image"
          href="/splash-cortou-anotou.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)"
        />
        <link rel="apple-touch-startup-image" href="/splash-cortou-anotou.png" />
      </head>
      <body><AppGestureGuard /><AppToastHost /><HelpLauncherDragGuard />{children}</body>
    </html>
  );
}
