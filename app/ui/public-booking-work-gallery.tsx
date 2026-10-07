"use client";

import type { CSSProperties } from "react";
import type { PublicBookingData } from "../../db/public-booking";

export function PublicBookingWorkGallery({ images, onOpen }: { images: PublicBookingData["gallery"]; onOpen: (id: number) => void }) {
  const continuous = images.length > 1;
  // Each loop fills the widest layout, including galleries with only two photos.
  const repeats = continuous ? Math.ceil(4 / images.length) : 1;
  const slides = Array.from({ length: repeats }, (_, repeat) => images.map((image) => ({ image, repeat }))).flat();
  return <div className="booking-work-gallery" data-booking-reveal>
    <div className="public-gallery-strip-heading"><strong>Cortes feitos pela equipe</strong></div>
    <div className={`booking-work-rail${continuous ? " continuous" : ""}`} aria-label="Fotos dos trabalhos da equipe" style={{ "--work-duration": `${Math.max(18, slides.length * 8)}s` } as CSSProperties}>
      <div className="booking-work-track">
        {[false, ...(continuous ? [true] : [])].map((copy) => <div className="booking-work-group" key={String(copy)} aria-hidden={copy || undefined}>
          {slides.map(({ image, repeat }) => {
            const duplicate = copy || repeat > 0;
            return <button className="public-gallery-photo" type="button" key={`${image.id}-${repeat}`} aria-hidden={duplicate || undefined} tabIndex={duplicate ? -1 : undefined} onClick={() => onOpen(image.id)} aria-label={duplicate ? undefined : `Ampliar foto: ${image.altText || `trabalho de ${image.barberName ?? "nossa equipe"}`}`}><figure><img src={image.url} alt={duplicate ? "" : image.altText || `Trabalho de ${image.barberName ?? "nossa equipe"}`} loading="lazy" /><figcaption>{image.barberName ?? "Nossa equipe"}</figcaption></figure></button>;
          })}
        </div>)}
      </div>
    </div>
  </div>;
}
