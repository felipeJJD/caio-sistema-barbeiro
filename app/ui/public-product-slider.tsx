"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

const slides = [
  { key: "painel", label: "Painel", image: "/landing/real/painel.webp", width: 320, height: 693 },
  { key: "agenda", label: "Agenda", image: "/landing/real/agenda.webp", width: 320, height: 693 },
  { key: "registrar", label: "Registrar", image: "/landing/real/registrar-v3.webp", width: 320, height: 693 },
  { key: "historico", label: "Histórico", image: "/landing/real/historico.webp", width: 320, height: 693 },
  { key: "whatsapp", label: "WhatsApp", image: "/landing/real/whatsapp.webp", width: 320, height: 693 },
  { key: "menu", label: "Menu lateral", image: "/landing/real/menu.webp", width: 320, height: 692 },
] as const;

const ADVANCE_DELAY_MS = 2000;

export function PublicProductSlider() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [interacting, setInteracting] = useState(false);

  const goTo = useCallback((index: number, behavior: ScrollBehavior = "smooth") => {
    const track = trackRef.current;
    const target = track?.children.item(index) as HTMLElement | null;
    if (!track || !target) return;
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior });
    setActive(index);
  }, []);

  useEffect(() => {
    if (interacting) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    const timer = window.setTimeout(() => {
      const next = (active + 1) % slides.length;
      goTo(next, next === 0 ? "auto" : "smooth");
    }, ADVANCE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [active, goTo, interacting]);

  function syncActive() {
    const track = trackRef.current;
    if (!track) return;
    let closest = 0;
    let distance = Number.POSITIVE_INFINITY;
    Array.from(track.children).forEach((child, index) => {
      const element = child as HTMLElement;
      const current = Math.abs(element.offsetLeft - track.offsetLeft - track.scrollLeft);
      if (current < distance) {
        distance = current;
        closest = index;
      }
    });
    setActive(closest);
  }

  return (
    <section
      className="public-real-preview"
      id="produto"
      aria-label="Capturas reais do aplicativo Cortou Anotou"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onPointerDown={() => setInteracting(true)}
      onPointerUp={() => setInteracting(false)}
      onPointerCancel={() => setInteracting(false)}
    >
      <div className="public-real-preview-head">
        <div>
          <span>TELAS REAIS DO C|A</span>
          <strong>{slides[active].label}</strong>
        </div>
        <small>{interacting ? "Pausado • solte para continuar" : "Passa sozinho • toque para pausar"}</small>
      </div>

      <div className="public-real-preview-track" ref={trackRef} onScroll={syncActive}>
        {slides.map((slide, index) => (
          <figure className="public-real-preview-slide" key={slide.key}>
            <div className="public-real-device">
              <Image
                src={slide.image}
                alt={`Tela real do Cortou Anotou — ${slide.label}`}
                width={slide.width}
                height={slide.height}
                sizes="(max-width: 430px) 268px, (max-width: 900px) 276px, 280px"
                unoptimized
                priority={index === 0}
              />
            </div>
            <figcaption>{slide.label}</figcaption>
          </figure>
        ))}
      </div>

      <div className="public-real-preview-controls">
        <button
          type="button"
          onClick={() => goTo((active - 1 + slides.length) % slides.length)}
          aria-label="Tela anterior"
        >
          ←
        </button>
        <div className="public-real-preview-dots" aria-label="Telas do aplicativo">
          {slides.map((slide, index) => (
            <button
              type="button"
              key={slide.key}
              className={index === active ? "active" : ""}
              onClick={() => goTo(index)}
              aria-label={`Ver ${slide.label}`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => goTo((active + 1) % slides.length)}
          aria-label="Próxima tela"
        >
          →
        </button>
      </div>
    </section>
  );
}
