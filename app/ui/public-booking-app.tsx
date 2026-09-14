"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PublicBookingData, PublicBookingSlot } from "../../db/public-booking";
import { validClientName } from "../../lib/client-name";
import { isPublicBookingDateAllowed } from "../../lib/booking-weekdays";
import { BrandLogo } from "./brand-logo";
import { AppIcon } from "./app-icon";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dayLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const paymentChoices = (payments: PublicBookingData["payments"]) => [payments.pixEnabled && "Pix", payments.cashEnabled && "Dinheiro", payments.debitEnabled && "Débito", payments.creditEnabled && "Crédito"].filter(Boolean) as string[];

function monthDays(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const total = new Date(year, monthIndex + 1, 0).getDate();
  return [...Array(firstWeekday).fill(null), ...Array.from({ length: total }, (_, index) => index + 1)];
}

function PixBookingPayment({ slug, result }: { slug: string; result: { id: number; priceCents: number; pixKey: string; paymentToken: string | null } }) {
  const [reported, setReported] = useState(false);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copyPixKey() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(result.pixKey);
      else {
        const field = document.createElement("textarea");
        field.value = result.pixKey;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Não foi possível copiar automaticamente. Toque e segure a chave Pix para copiar.");
    }
  }

  async function reportPayment() {
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/public-booking/${encodeURIComponent(slug)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId: result.id, paymentToken: result.paymentToken }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível avisar a barbearia.");
      setReported(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível avisar a barbearia."); }
    finally { setPending(false); }
  }
  return <section className="booking-pix-payment">
    <div className="booking-pix-amount"><span>PAGAMENTO INTEGRAL</span><strong>{money(result.priceCents)}</strong><small>Valor do serviço agendado</small></div>
    <div className="booking-pix-key"><span>CHAVE PIX</span><code title={result.pixKey}>{result.pixKey}</code><button type="button" onClick={copyPixKey}>{copied ? "✓ Chave copiada" : "Copiar chave"}</button></div>
    <div className="booking-pix-instructions"><strong>Como finalizar</strong><ol><li>Copie a chave e abra o aplicativo do seu banco.</li><li>Faça o Pix no valor exato mostrado acima.</li><li>Volte aqui e avise a barbearia pelo botão abaixo.</li></ol></div>
    {reported ? <p className="booking-pix-reported">✓ Pagamento informado. Agora aguarde a barbearia conferir e confirmar o horário.</p> : <button className="booking-pix-confirm" type="button" disabled={pending} onClick={reportPayment}>{pending ? "Avisando a barbearia..." : "Já paguei · avisar a barbearia"}</button>}
    {!reported && <small className="booking-pix-note">O horário será confirmado depois que a barbearia conferir o recebimento.</small>}
    {error && <p className="booking-error">{error}</p>}
  </section>;
}

export function PublicBookingApp({ data, today }: { data: PublicBookingData; today: string }) {
  const [serviceId, setServiceId] = useState(data.services[0]?.id ?? 0);
  const [showAllServices, setShowAllServices] = useState(false);
  const [barberId, setBarberId] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [month, setMonth] = useState(() => new Date(`${today.slice(0, 7)}-01T12:00:00`));
  const [slots, setSlots] = useState<PublicBookingSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payments, setPayments] = useState(data.payments);
  const paymentOptions = useMemo(() => paymentChoices(payments), [payments]);
  const [paymentChoice, setPaymentChoice] = useState(paymentOptions[0] ?? "Dinheiro");
  const [isMembership, setIsMembership] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: number; status: string; barberName: string; serviceName: string; requiresApproval: boolean; paymentChoice: string; priceCents: number; pixKey: string; paymentToken: string | null; managementToken: string } | null>(null);
  const service = data.services.find((item) => item.id === serviceId);
  const membershipSchedulingService = data.services.find((item) => {
    const name = item.name.toLocaleLowerCase("pt-BR");
    return name.includes("corte") && !name.includes("barba");
  }) ?? data.services[0];
  const visibleServices = showAllServices ? data.services : data.services.slice(0, 4);
  const calendarDays = useMemo(() => monthDays(month), [month]);
  const maxDate = useMemo(() => { const value = new Date(`${today}T12:00:00`); value.setDate(value.getDate() + 90); return isoDate(value); }, [today]);
  const cover = data.gallery.find((image) => image.kind === "cover");
  const shopImages = data.gallery.filter((image) => image.kind === "shop");
  const workImages = data.gallery.filter((image) => image.kind === "work");
  const galleryImages = [...workImages, ...shopImages];
  const [lightboxImageId, setLightboxImageId] = useState<number | null>(null);
  const lightboxIndex = galleryImages.findIndex((image) => image.id === lightboxImageId);
  const lightboxImage = lightboxIndex >= 0 ? galleryImages[lightboxIndex] : null;

  useEffect(() => {
    if (!lightboxImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setLightboxImageId(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [lightboxImage]);

  function moveLightbox(direction: -1 | 1) {
    if (lightboxIndex < 0 || galleryImages.length < 2) return;
    const nextIndex = (lightboxIndex + direction + galleryImages.length) % galleryImages.length;
    setLightboxImageId(galleryImages[nextIndex].id);
  }

  useEffect(() => {
    let active = true;
    const refreshPayments = () => {
      fetch(`/api/public-booking/${encodeURIComponent(data.organization.slug)}?payments=1`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json() as { payments?: PublicBookingData["payments"] };
          if (active && response.ok && body.payments) {
            const refreshedOptions = paymentChoices(body.payments);
            setPayments(body.payments);
            setPaymentChoice((current) => refreshedOptions.includes(current) ? current : (refreshedOptions[0] ?? ""));
          }
        })
        .catch(() => undefined);
    };
    refreshPayments();
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refreshPayments(); };
    window.addEventListener("focus", refreshPayments);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const refreshTimer = selectedTime ? window.setInterval(refreshPayments, 10_000) : undefined;
    return () => {
      active = false;
      window.removeEventListener("focus", refreshPayments);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, [data.organization.slug, selectedTime]);

  useEffect(() => {
    if (!selectedDate || !serviceId) return;
    const controller = new AbortController();
    let active = true;
    const frame = window.requestAnimationFrame(() => {
      setLoadingSlots(true);
      setSelectedTime("");
      setError(null);
      fetch(`/api/public-booking/${encodeURIComponent(data.organization.slug)}?date=${selectedDate}&serviceId=${serviceId}&barberId=${barberId}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          const body = await response.json() as { slots?: PublicBookingSlot[]; error?: string };
          if (!response.ok) throw new Error(body.error ?? "Não foi possível consultar os horários.");
          if (active) setSlots(body.slots ?? []);
        })
        .catch((reason) => { if (active && reason instanceof Error && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoadingSlots(false); });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [barberId, data.organization.slug, selectedDate, serviceId]);

  function resetDate() { setSelectedDate(""); setSelectedTime(""); setSlots([]); setResult(null); }
  function changeService(id: number) { setIsMembership(false); setServiceId(id); resetDate(); }
  function chooseMembership() {
    if (!membershipSchedulingService) { setError("A barbearia precisa cadastrar um serviço antes de liberar horários para mensalistas."); return; }
    setIsMembership(true);
    setServiceId(membershipSchedulingService.id);
    resetDate();
  }
  function changeBarber(id: number) { setBarberId(id); resetDate(); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDate || !selectedTime) { setError("Escolha o dia e o horário."); return; }
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const clientName = validClientName(String(form.get("clientName") ?? ""));
      const response = await fetch(`/api/public-booking/${encodeURIComponent(data.organization.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          time: selectedTime,
          serviceId,
          barberId,
          clientName,
          phone: String(form.get("phone") ?? ""),
          paymentChoice,
          isMembership,
          website: String(form.get("website") ?? ""),
        }),
      });
      const body = await response.json() as { booking?: { id: number; status: string; barberName: string; serviceName: string; requiresApproval: boolean; paymentChoice: string; priceCents: number; pixKey: string; paymentToken: string | null; managementToken: string }; error?: string };
      if (!response.ok || !body.booking) throw new Error(body.error ?? "Não foi possível concluir o agendamento.");
      setResult(body.booking);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir o agendamento.");
    } finally {
      setSubmitting(false);
    }
  }

  const bookingHeader = <header className="public-booking-header"><div className="public-booking-brand"><BrandLogo /><div className="public-booking-shop-name"><span>AGENDAMENTO ONLINE</span><strong>{data.organization.name}</strong></div></div></header>;

  if (!data.organization.enabled) return <main className="public-booking-page">{bookingHeader}<section className="public-booking-unavailable"><h1>Agendamento indisponível</h1><p>Entre em contato diretamente com {data.organization.name} para marcar seu horário.</p></section></main>;

  if (result) {
    const isPix = result.paymentChoice === "Pix";
    return <main className="public-booking-page public-booking-result">{bookingHeader}<section className={`public-booking-success${isPix ? " pix-payment-result" : ""}`}><span className={`booking-success-icon${isPix ? " pix-pending" : ""}`}>{isPix ? "PIX" : "✓"}</span><small>{data.organization.name}</small><h1>{isPix ? "Falta só o pagamento" : result.requiresApproval ? "Solicitação enviada!" : "Horário confirmado!"}</h1><p>{isPix ? "Seu horário foi separado e aguarda o Pix para seguir à confirmação." : result.paymentChoice === "Mensalista" ? "A barbearia recebeu o aviso de que você é mensalista e fará a conferência do seu plano." : result.requiresApproval ? "A barbearia recebeu seu pedido e fará a confirmação." : "Seu horário já entrou na agenda da barbearia."}</p><div className="booking-result-appointment"><span>{result.serviceName}</span><strong>{dayLabel(selectedDate)} às {selectedTime}</strong><small>Profissional: {result.barberName}</small></div>{isPix && <PixBookingPayment slug={data.organization.slug} result={result} />}<a className="booking-manage-link" href={`/agendar/${encodeURIComponent(data.organization.slug)}/gerenciar/${encodeURIComponent(result.managementToken)}`}>Cancelar ou remarcar meu horário</a><button className="booking-new-appointment" onClick={() => { setResult(null); resetDate(); }}>Marcar outro horário</button></section></main>;
  }

  return <main className="public-booking-page">
    {bookingHeader}
    <section className="public-booking-shell">
      {cover && <section className="public-booking-cover" style={{ backgroundImage: `linear-gradient(90deg,#151914e6 0%,#151914aa 52%,#15191430 100%),url(${cover.url})` }}><div><span>SEU PRÓXIMO VISUAL COMEÇA AQUI</span><h1>{data.organization.name}</h1><p>Conheça nosso trabalho e escolha seu horário em poucos passos.</p><a href="#agendamento">Agendar agora <b>↓</b></a></div></section>}
      {(workImages.length > 0 || shopImages.length > 0) && <section className="public-gallery-showcase" aria-label="Galeria da barbearia">
        {workImages.length > 0 && <div className="public-gallery-strip"><div className="public-gallery-strip-heading"><span>NOSSOS TRABALHOS</span><strong>Cortes feitos pela equipe</strong></div><div>{workImages.map((image) => <button className="public-gallery-photo" type="button" key={image.id} onClick={() => setLightboxImageId(image.id)} aria-label={`Ampliar foto: ${image.altText || `trabalho de ${image.barberName ?? "nossa equipe"}`}`}><figure><img src={image.url} alt={image.altText || `Trabalho de ${image.barberName ?? "nossa equipe"}`} loading="lazy" /><figcaption>{image.barberName ?? "Nossa equipe"}<small>Toque para ampliar</small></figcaption></figure></button>)}</div></div>}
        {shopImages.length > 0 && <div className="public-gallery-strip shop"><div className="public-gallery-strip-heading"><span>CONHEÇA O ESPAÇO</span><strong>Um pouco da nossa barbearia</strong></div><div>{shopImages.map((image) => <button className="public-gallery-photo" type="button" key={image.id} onClick={() => setLightboxImageId(image.id)} aria-label={`Ampliar foto: ${image.altText || "espaço da barbearia"}`}><figure><img src={image.url} alt={image.altText || "Espaço da barbearia"} loading="lazy" /><span>Ampliar</span></figure></button>)}</div></div>}
      </section>}
      {lightboxImage && <div className="public-gallery-lightbox" role="dialog" aria-modal="true" aria-label="Foto ampliada" onMouseDown={(event) => { if (event.target === event.currentTarget) setLightboxImageId(null); }}><button className="public-gallery-lightbox-close" type="button" aria-label="Fechar foto" onClick={() => setLightboxImageId(null)}>×</button>{galleryImages.length > 1 && <button className="public-gallery-lightbox-previous" type="button" aria-label="Foto anterior" onClick={() => moveLightbox(-1)}>‹</button>}<figure><img src={lightboxImage.url} alt={lightboxImage.altText || (lightboxImage.kind === "work" ? `Trabalho de ${lightboxImage.barberName ?? "nossa equipe"}` : "Espaço da barbearia")} />{(lightboxImage.altText || lightboxImage.barberName) && <figcaption>{lightboxImage.altText || lightboxImage.barberName}</figcaption>}</figure>{galleryImages.length > 1 && <button className="public-gallery-lightbox-next" type="button" aria-label="Próxima foto" onClick={() => moveLightbox(1)}>›</button>}<small>{lightboxIndex + 1} de {galleryImages.length}</small></div>}
      <div className={`public-booking-intro${cover || workImages.length || shopImages.length ? " public-booking-intro-after-gallery" : ""}`} id="agendamento"><span>RÁPIDO E SEM LIGAÇÃO</span><h1>Agende seu horário</h1><p>Escolha o serviço, o profissional e veja somente os horários realmente disponíveis.</p></div>
      <div className="booking-steps" aria-label="Etapas"><span className={serviceId ? "done" : "active"}>1 <b>Serviço</b></span><i /><span className={selectedDate ? "done" : "active"}>2 <b>Data</b></span><i /><span className={selectedTime ? "done" : "active"}>3 <b>Horário</b></span></div>

      <section className="booking-card booking-services-card"><div className="booking-card-heading"><span>1</span><div><strong>Escolha o atendimento</strong><small>Mensalistas usam o plano sem escolher pagamento</small></div></div><div className="booking-option-grid services"><button type="button" className={`membership-service${isMembership ? " selected" : ""}`} onClick={chooseMembership}><span><AppIcon name="members" /></span><div><strong>Mensalista</strong><small>Agendar um uso do meu plano</small></div><b><AppIcon name="check" /></b></button>{visibleServices.map((item) => <button type="button" className={!isMembership && serviceId === item.id ? "selected" : ""} onClick={() => changeService(item.id)} key={item.id}><span><AppIcon name="scissors" /></span><div><strong>{item.name}</strong><small>{item.durationMinutes} min · {money(item.priceCents)}</small></div><b><AppIcon name="check" /></b></button>)}</div>{data.services.length > 4 && <button type="button" className="booking-show-more" onClick={() => setShowAllServices((value) => !value)}>{showAllServices ? "Ver menos serviços" : `Ver mais ${data.services.length - 4} serviço${data.services.length - 4 === 1 ? "" : "s"}`}<b>{showAllServices ? "↑" : "↓"}</b></button>}</section>

      <section className="booking-card"><div className="booking-card-heading"><span>2</span><div><strong>Escolha o profissional</strong><small>Ou deixe a barbearia encontrar um horário</small></div></div><div className="booking-option-grid barbers"><button type="button" className={barberId === 0 ? "selected" : ""} onClick={() => changeBarber(0)}><span><AppIcon name="members" /></span><div><strong>Qualquer profissional</strong><small>Primeiro horário disponível</small></div><b><AppIcon name="check" /></b></button>{data.barbers.map((item) => <button type="button" className={barberId === item.id ? "selected" : ""} onClick={() => changeBarber(item.id)} key={item.id}>{item.photoUrl ? <img className="booking-barber-photo" src={item.photoUrl} alt={`Foto de ${item.name}`} loading="lazy" /> : <span>{item.name.slice(0, 1).toUpperCase()}</span>}<div><strong>{item.name}</strong><small>Selecionar profissional</small></div><b><AppIcon name="check" /></b></button>)}</div></section>

      <section className="booking-card"><div className="booking-card-heading"><span>3</span><div><strong>Escolha o dia</strong><small>Disponibilidade para os próximos 90 dias</small></div></div><div className={`booking-calendar${selectedDate ? " compact" : ""}`}>{selectedDate ? <div className="booking-selected-date"><div><small>DATA ESCOLHIDA</small><strong>{dayLabel(selectedDate)}</strong></div><button type="button" onClick={resetDate}>Trocar data</button></div> : <><div className="booking-calendar-nav"><button type="button" aria-label="Mês anterior" disabled={month <= new Date(`${today.slice(0, 7)}-01T12:00:00`)} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div><div className="booking-weekdays">{["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((item) => <span key={item}>{item}</span>)}</div><div className="booking-days">{calendarDays.map((day, index) => { if (!day) return <i key={`blank-${index}`} />; const value = isoDate(new Date(month.getFullYear(), month.getMonth(), day)); const closed = !isPublicBookingDateAllowed(value, data.organization.weekdays); const disabled = value < today || value > maxDate || closed; return <button type="button" disabled={disabled} title={closed ? "Fechado" : undefined} className={value === selectedDate ? "selected" : ""} onClick={() => setSelectedDate(value)} key={value}>{day}</button>; })}</div></>}</div></section>

      {selectedDate && <section className="booking-card booking-times-card"><div className="booking-card-heading"><span>4</span><div><strong>Horários disponíveis</strong><small>{isMembership ? "Mensalista" : service?.name} · {service?.durationMinutes ?? 30} minutos</small></div></div>{loadingSlots ? <div className="booking-loading"><i /><span>Consultando a agenda...</span></div> : slots.length ? <div className="booking-times">{slots.map((slot) => <button type="button" className={selectedTime === slot.time ? "selected" : ""} onClick={() => setSelectedTime(slot.time)} key={`${slot.time}-${slot.barberId}`}><strong>{slot.time}</strong>{barberId === 0 && <small>{slot.barberName}</small>}</button>)}</div> : <div className="booking-no-slots"><span>◷</span><strong>Nenhum horário livre neste dia</strong><button type="button" onClick={resetDate}>Escolher outra data</button></div>}</section>}

      {selectedTime && <section className="booking-card booking-contact-card"><div className="booking-card-heading"><span>5</span><div><strong>{isMembership ? "Identifique seu plano" : "Seus dados e pagamento"}</strong><small>{isMembership ? "A barbearia localizará seu cadastro pelo nome e telefone" : "Escolha como deseja pagar"}</small></div></div><form onSubmit={submit}><label><span>Seu nome</span><input name="clientName" autoComplete="name" placeholder="Como podemos chamar você?" minLength={2} maxLength={100} pattern="[A-Za-zÀ-ÖØ-öø-ÿ .’'-]+" title="Use somente letras no nome" required /></label><label><span>Telefone ou WhatsApp</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" maxLength={30} required /></label>{!isMembership && (paymentOptions.length ? <fieldset className="booking-payment-options"><legend>Como você quer pagar?</legend>{paymentOptions.map((option) => <label key={option}><input type="radio" name="paymentChoice" value={option} checked={paymentChoice === option} onChange={() => setPaymentChoice(option)} /><span><strong>{option}</strong><small>{option === "Pix" ? "Pagamento integral antecipado" : "Pagamento na barbearia"}</small></span></label>)}</fieldset> : <p className="booking-error" role="alert">A barbearia ainda não liberou uma forma de pagamento.</p>)}<label className="booking-honeypot" aria-hidden="true"><span>Site</span><input name="website" tabIndex={-1} autoComplete="off" /></label>{error && <p className="booking-error" role="alert">{error}</p>}<div className="booking-summary"><span>{isMembership ? "Mensalista" : service?.name}</span><strong>{dayLabel(selectedDate)} · {selectedTime}</strong><small>{barberId ? data.barbers.find((item) => item.id === barberId)?.name : slots.find((slot) => slot.time === selectedTime)?.barberName}{!isMembership ? ` · ${paymentChoice}` : ""}</small></div><button className="booking-submit" disabled={submitting || (!isMembership && !paymentChoice)}>{submitting ? "Enviando..." : !isMembership && paymentChoice === "Pix" ? "Continuar para o Pix" : data.organization.requiresApproval ? "Solicitar agendamento" : "Confirmar agendamento"}<b>→</b></button></form></section>}
      {error && !selectedTime && <p className="booking-error global" role="alert">{error}</p>}
      <footer className="public-booking-footer"><span>Horários atualizados em tempo real</span><small>Agendamento protegido por Cortou Anotou</small></footer>
    </section>
  </main>;
}
