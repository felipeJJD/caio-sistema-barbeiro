"use client";

import type { PublicBookingData } from "../../db/public-booking";
import { AppIcon } from "./app-icon";

export function PublicBookingTeam({ barbers, selectedId, chosen, onChoose }: {
  barbers: PublicBookingData["barbers"];
  selectedId: number;
  chosen: boolean;
  onChoose: (id: number) => void;
}) {
  return <section className="booking-team-section" id="booking-professional" data-booking-reveal>
    <div className="booking-section-title"><h2>Escolha seu profissional</h2></div>
    <div className="booking-team-rail" aria-label="Profissionais da barbearia">
      {barbers.map((barber) => <button type="button" className={`booking-team-portrait${chosen && selectedId === barber.id ? " selected" : ""}`} aria-pressed={chosen && selectedId === barber.id} aria-label={`Escolher ${barber.name}`} key={barber.id} onClick={() => onChoose(barber.id)}>
        <div className="booking-team-photo">{barber.photoUrl ? <img src={barber.photoUrl} alt={`Foto de ${barber.name}`} loading="lazy" /> : <span className="booking-team-initial">{barber.name.slice(0, 1).toUpperCase()}</span>}<span className="booking-team-check" aria-hidden="true"><AppIcon name="check" /></span></div>
        <div className="booking-team-caption"><strong>{barber.name}</strong></div>
      </button>)}
    </div>
    <button type="button" className={`booking-any-professional${chosen && selectedId === 0 ? " selected" : ""}`} aria-pressed={chosen && selectedId === 0} onClick={() => onChoose(0)}><AppIcon name="members" /><span><strong>Prefiro qualquer profissional</strong><small>Ver horários de toda a equipe</small></span><b aria-hidden="true">→</b></button>
  </section>;
}
