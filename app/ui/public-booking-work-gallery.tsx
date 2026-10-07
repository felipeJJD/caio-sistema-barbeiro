"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicBookingData } from "../../db/public-booking";

export function PublicBookingWorkGallery({ images, onOpen }: { images: PublicBookingData["gallery"]; onOpen: (id: number) => void }) {
  const rail = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (paused || hovered || focused || images.length < 2) return;
    const timer = window.setInterval(() => {
      const node = rail.current;
      if (!node || document.visibilityState !== "visible" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const bounds = node.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) return;
      const maximum = node.scrollWidth - node.clientWidth;
      if (maximum <= 1) return;
      const distance = (node.firstElementChild?.getBoundingClientRect().width ?? 180) + 14;
      node.scrollTo({ left: node.scrollLeft >= maximum - 2 ? 0 : Math.min(maximum, node.scrollLeft + distance), behavior: "smooth" });
    }, 4800);
    return () => window.clearInterval(timer);
  }, [paused, hovered, focused, images.length]);

  return <div className="booking-work-gallery" data-booking-reveal>
    <div className="public-gallery-strip-heading"><span>NOSSOS TRABALHOS</span><strong>Cortes feitos pela equipe</strong></div>
    <div className="booking-work-rail" ref={rail} aria-label="Fotos dos trabalhos da equipe" onPointerDown={() => setPaused(true)} onKeyDown={() => setPaused(true)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      {images.map((image) => <button className="public-gallery-photo" type="button" key={image.id} onClick={() => { setPaused(true); onOpen(image.id); }} aria-label={`Ampliar foto: ${image.altText || `trabalho de ${image.barberName ?? "nossa equipe"}`}`} data-booking-reveal><figure><img src={image.url} alt={image.altText || `Trabalho de ${image.barberName ?? "nossa equipe"}`} loading="lazy" /><figcaption>{image.barberName ?? "Nossa equipe"}<small>Toque para ampliar</small></figcaption></figure></button>)}
    </div>
    {images.length > 1 && <div className="booking-work-controls"><span>Conheça os detalhes. Arraste para ver mais.</span><button type="button" aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? "Mover fotos" : "Pausar fotos"}</button></div>}
  </div>;
}
