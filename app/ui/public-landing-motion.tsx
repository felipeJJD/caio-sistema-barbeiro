"use client";

import { useEffect } from "react";

export function PublicLandingMotion() {
  useEffect(() => {
    let cleanupTimer = 0;

    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href^="#"]');
      const href = anchor?.getAttribute("href") ?? "";
      if (!anchor || !href || href === "#") return;

      const section = document.querySelector<HTMLElement>(href);
      if (!section) return;

      event.preventDefault();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (href === "#cadastro" && !reducedMotion) {
        section.classList.remove("public-signup-reveal");
        void section.offsetWidth;
        section.classList.add("public-signup-reveal");
        window.clearTimeout(cleanupTimer);
        cleanupTimer = window.setTimeout(() => section.classList.remove("public-signup-reveal"), 1100);
      }

      section.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start",
        inline: "nearest",
      });

      if (window.location.hash !== href) {
        window.history.replaceState(null, "", href);
      }
    };

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      window.clearTimeout(cleanupTimer);
    };
  }, []);

  return null;
}
