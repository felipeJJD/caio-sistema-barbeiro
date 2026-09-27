"use client";

import { useEffect } from "react";

export function AppointmentCompletionAutoScroll() {
  useEffect(() => {
    let lastPanel: HTMLElement | null = null;
    let firstFrame = 0;
    let secondFrame = 0;

    const revealPanel = () => {
      const panel = document.querySelector<HTMLElement>(".appointment-completion-panel");
      if (!panel) {
        lastPanel = null;
        return;
      }
      if (panel === lastPanel) return;
      lastPanel = panel;

      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          panel.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
          panel.setAttribute("tabindex", "-1");
          panel.focus({ preventScroll: true });
        });
      });
    };

    revealPanel();
    const observer = new MutationObserver(revealPanel);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  return null;
}
