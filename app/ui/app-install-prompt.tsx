"use client";

import { useEffect, useState } from "react";

type InstallChoice = { outcome: "accepted" | "dismissed"; platform: string };
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

const DISMISSED_AT_KEY = "cortou-anotou-install-dismissed-at";
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isAppleDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function AppInstallPrompt({ isOwner }: { isOwner: boolean }) {
  const [visible, setVisible] = useState(false);
  const [appleDevice, setAppleDevice] = useState(false);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isOwner || isInstalled() || !isMobileDevice()) return;
    const dismissedAt = Number(window.localStorage.getItem(DISMISSED_AT_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < SEVEN_DAYS) return;

    let showTimer: number | null = null;
    const apple = isAppleDevice();
    const showLater = () => {
      if (showTimer !== null) window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => setVisible(true), 3600);
    };
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
      showLater();
    };
    const handleInstalled = () => {
      setVisible(false);
      window.localStorage.removeItem(DISMISSED_AT_KEY);
    };

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    if (apple) {
      showTimer = window.setTimeout(() => {
        setAppleDevice(true);
        setVisible(true);
      }, 3600);
    }
    return () => {
      if (showTimer !== null) window.clearTimeout(showTimer);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, [isOwner]);

  function dismiss() {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  }

  async function install() {
    if (!installEvent) return;
    setInstalling(true);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") window.localStorage.removeItem(DISMISSED_AT_KEY);
      else window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
      setVisible(false);
      setInstallEvent(null);
    } finally {
      setInstalling(false);
    }
  }

  if (!visible || (!appleDevice && !installEvent)) return null;

  return <aside className="app-install-prompt" role="dialog" aria-modal="false" aria-labelledby="app-install-title">
    <button className="app-install-close" type="button" aria-label="Lembrar de instalar depois" onClick={dismiss}>×</button>
    <div className="app-install-icon" aria-hidden="true"><span>C</span><i /></div>
    <div className="app-install-copy">
      <small>ACESSO MAIS RÁPIDO</small>
      <h2 id="app-install-title">Instale o Cortou Anotou</h2>
      {appleDevice
        ? <p>No iPhone, toque em <b>Compartilhar</b> <span aria-hidden="true">↥</span> e depois em <b>Adicionar à Tela de Início</b>.</p>
        : <p>Coloque o aplicativo na tela do celular e abra sua barbearia com um toque.</p>}
      <div className="app-install-actions">
        {appleDevice
          ? <button type="button" className="app-install-primary" onClick={dismiss}>Entendi</button>
          : <button type="button" className="app-install-primary" disabled={installing} onClick={() => void install()}>{installing ? "Abrindo..." : "Instalar aplicativo"}</button>}
        <button type="button" className="app-install-later" onClick={dismiss}>Agora não</button>
      </div>
    </div>
  </aside>;
}
