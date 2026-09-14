"use client";

import { useEffect, useState } from "react";
import type { PublicBookingManagement, PublicBookingSlot } from "../../db/public-booking";
import { BrandLogo } from "./brand-logo";

const dateLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

export function PublicBookingManageApp({ initialBooking, token, today }: { initialBooking: PublicBookingManagement; token: string; today: string }) {
  const [booking, setBooking] = useState(initialBooking);
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [slots, setSlots] = useState<PublicBookingSlot[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const endpoint = `/api/public-booking/${encodeURIComponent(booking.slug)}/manage/${encodeURIComponent(token)}`;

  useEffect(() => {
    if (!date) return;
    const controller = new AbortController();
    fetch(`/api/public-booking/${encodeURIComponent(booking.slug)}?date=${date}&serviceId=${booking.serviceId}&barberId=${booking.barberId}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { slots?: PublicBookingSlot[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Não foi possível consultar os horários.");
        setSlots(body.slots ?? []);
      })
      .catch((reason) => { if (reason instanceof Error && reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [booking.barberId, booking.serviceId, booking.slug, date]);

  async function change(body: Record<string, string>) {
    setPending(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { booking?: PublicBookingManagement; error?: string };
      if (!response.ok || !payload.booking) throw new Error(payload.error ?? "Não foi possível alterar o horário.");
      setBooking(payload.booking); setRescheduling(false); setDate(""); setTime("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível alterar o horário."); }
    finally { setPending(false); }
  }

  const cancelled = booking.status === "Cancelado";
  return <main className="public-booking-page booking-manage-page">
    <header className="public-booking-header"><div className="public-booking-brand"><BrandLogo /><div className="public-booking-shop-name"><span>MEU AGENDAMENTO</span><strong>{booking.organizationName}</strong></div></div></header>
    <section className="booking-manage-card">
      <small>{cancelled ? "HORÁRIO CANCELADO" : "SEU HORÁRIO"}</small>
      <h1>{cancelled ? "Cancelamento concluído" : `Olá, ${booking.clientName}`}</h1>
      <div className="booking-manage-details"><span>{booking.serviceName}</span><strong>{dateLabel(booking.date)} às {booking.time}</strong><small>Profissional: {booking.barberName}</small></div>
      {cancelled ? <p>A barbearia e o profissional já receberam o aviso.</p> : booking.canChange ? <>
        {!rescheduling ? <div className="booking-manage-actions"><button type="button" onClick={() => setRescheduling(true)}>Remarcar horário</button><button className="danger" type="button" disabled={pending} onClick={() => { if (window.confirm("Deseja realmente cancelar este horário?")) void change({ action: "cancel" }); }}>{pending ? "Cancelando..." : "Cancelar horário"}</button></div> : <div className="booking-reschedule"><label><span>Escolha outro dia</span><input type="date" min={today} value={date} onChange={(event) => { setDate(event.target.value); setSlots([]); setTime(""); setError(""); }} /></label>{date && <div className="booking-times">{slots.map((slot) => <button type="button" className={time === slot.time ? "selected" : ""} onClick={() => setTime(slot.time)} key={slot.time}><strong>{slot.time}</strong></button>)}</div>}{date && !slots.length && <p>Nenhum horário livre para este profissional nesse dia.</p>}<div className="booking-manage-actions"><button type="button" disabled={!time || pending} onClick={() => void change({ action: "reschedule", date, time })}>{pending ? "Remarcando..." : "Confirmar novo horário"}</button><button className="secondary" type="button" onClick={() => setRescheduling(false)}>Voltar</button></div></div>}
        <p className="booking-manage-rule">Cancelamentos e remarcações pelo link são permitidos até 2 horas antes.</p>
      </> : <p className="booking-manage-blocked">Faltam menos de 2 horas para o atendimento. Para alterar, entre em contato diretamente com a barbearia.</p>}
      {error && <p className="booking-error" role="alert">{error}</p>}
      <a href={`/agendar/${encodeURIComponent(booking.slug)}`}>Voltar para a agenda da barbearia</a>
    </section>
  </main>;
}
