"use client";

import { useEffect } from "react";

export function AppointmentCompletionAutoScroll() {
  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;

    const revealPanel = () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          const panel = document.querySelector<HTMLElement>(".appointment-completion-panel");
          if (!panel) return;
          panel.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
          panel.setAttribute("tabindex", "-1");
          panel.focus({ preventScroll: true });
        });
      });
    };

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const trigger = target.closest<HTMLButtonElement>("button.complete-appointment, button[aria-label='Concluir e registrar atendimento']");
      if (!trigger) return;
      revealPanel();
    };

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  return null;
}
