"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { PAINEL_SCREEN } from "./public-real-screens/painel";
import { AGENDA_SCREEN } from "./public-real-screens/agenda";
import { REGISTRAR_SCREEN } from "./public-real-screens/registrar";
import { HISTORICO_SCREEN } from "./public-real-screens/historico";
import { FINANCEIRO_SCREEN } from "./public-real-screens/financeiro";

const slides = [
  { key: "painel", label: "Painel", image: PAINEL_SCREEN },
  { key: "agenda", label: "Agenda", image: AGENDA_SCREEN },
  { key: "registrar", label: "Registrar", image: REGISTRAR_SCREEN },
  { key: "historico", label: "Histórico", image: HISTORICO_SCREEN },
  { key: "financeiro", label: "Financeiro", image: FINANCEIRO_SCREEN },
] as const;

export function PublicProductSlider() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function goTo(index: number) {
    const track = trackRef.current;
    const target = track?.children.item(index) as HTMLElement | null;
    if (!track || !target) return;
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: "smooth" });
    setActive(index);
  }

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
    <section className="public-real-preview" id="produto" aria-label="Telas reais do Cortou Anotou">
      <div className="public-real-preview-head">
        <div>
          <span>POR DENTRO DO APP</span>
          <strong>{slides[active].label}</strong>
        </div>
        <small>Arraste para o lado</small>
      </div>

      <div className="public-real-preview-track" ref={trackRef} onScroll={syncActive}>
        {slides.map((slide) => (
          <figure className="public-real-preview-slide" key={slide.key}>
            <div className="public-real-device">
              <Image
                src={slide.image}
                alt={`Tela real do Cortou Anotou — ${slide.label}`}
                width={180}
                height={389}
                unoptimized
                priority={slide.key === "painel"}
              />
            </div>
            <figcaption>{slide.label}</figcaption>
          </figure>
        ))}
      </div>

      <div className="public-real-preview-controls">
        <button type="button" onClick={() => goTo(Math.max(0, active - 1))} disabled={active === 0} aria-label="Tela anterior">←</button>
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
        <button type="button" onClick={() => goTo(Math.min(slides.length - 1, active + 1))} disabled={active === slides.length - 1} aria-label="Próxima tela">→</button>
      </div>
    </section>
  );
}
