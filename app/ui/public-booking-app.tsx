"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PublicBookingData, PublicBookingSlot } from "../../db/public-booking";
import { validClientName } from "../../lib/client-name";
import { isPublicBookingDateAllowed } from "../../lib/booking-weekdays";
import { bookingHoursForDate } from "../../lib/booking-hours";
import { BrandLogo } from "./brand-logo";
import { AppIcon } from "./app-icon";

const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const isoDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dayLabel = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
const paymentChoices = (payments: PublicBookingData["payments"]) => [payments.pixEnabled && "Pix", payments.cashEnabled && "Dinheiro", payments.debitEnabled && "Débito", payments.creditEnabled && "Crédito"].filter(Boolean) as string[];

function servicePriority(name: string) {
  const value = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (value === "corte") return 0;
  if (value === "barba") return 1;
  if (value.includes("corte") && value.includes("barba")) return 2;
  if (value.includes("corte") && value.includes("bigode")) return 3;
  if (value.includes("corte") && value.includes("sobrancelha")) return 4;
  return 20;
}
function orderedBookingServices(services: PublicBookingData["services"]) {
  return [...services].sort((left, right) => servicePriority(left.name) - servicePriority(right.name) || left.name.localeCompare(right.name, "pt-BR"));
}

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
  const orderedServices = useMemo(() => orderedBookingServices(data.services), [data.services]);
  const [serviceId, setServiceId] = useState(() => orderedBookingServices(data.services)[0]?.id ?? 0);
  const [showAllServices, setShowAllServices] = useState(false);
  type MembershipInfo = { clientId:number; clientName:string; planId:number; planName:string; serviceId:number; serviceName:string; durationMinutes:number; remainingUses:number };
  type MembershipCandidate = { clientId:number; clientName:string; requiresPhone:boolean };
  const [membershipClientId, setMembershipClientId] = useState(0);
  const [membershipInfo, setMembershipInfo] = useState<MembershipInfo | null>(null);
  const [membershipPreview, setMembershipPreview] = useState<MembershipInfo | null>(null);
  const [membershipPickerOpen, setMembershipPickerOpen] = useState(false);
  const [membershipLookupName, setMembershipLookupName] = useState("");
  const [membershipLookupPhone, setMembershipLookupPhone] = useState("");
  const [membershipCandidates, setMembershipCandidates] = useState<MembershipCandidate[]>([]);
  const [selectedMembershipCandidate, setSelectedMembershipCandidate] = useState<MembershipCandidate | null>(null);
  const [membershipSearchPending, setMembershipSearchPending] = useState(false);
  const [membershipLookupPending, setMembershipLookupPending] = useState(false);
  const [membershipLookupError, setMembershipLookupError] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [phone, setPhone] = useState("");
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
  const visibleServices = showAllServices ? orderedServices : orderedServices.slice(0, 5);
  const selectedSlot = slots.find((slot) => slot.time === selectedTime);
  const selectedBarberName = barberId ? data.barbers.find((item) => item.id === barberId)?.name : selectedSlot?.barberName;
  const selectedServiceLabel = isMembership && membershipInfo ? `Mensalista · ${membershipInfo.serviceName}` : service?.name ?? "";
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
    if (!membershipPickerOpen || membershipPreview) return;
    const query = membershipLookupName.trim();
    if (query.length < 3) {
      setMembershipCandidates([]);
      setMembershipSearchPending(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setMembershipSearchPending(true);
      fetch(`/api/public-booking/${encodeURIComponent(data.organization.slug)}/membership?q=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const body = await response.json() as { candidates?: MembershipCandidate[]; error?: string };
          if (!response.ok) throw new Error(body.error ?? "Não foi possível procurar seu cadastro.");
          setMembershipCandidates(body.candidates ?? []);
        })
        .catch((reason) => {
          if (reason instanceof Error && reason.name !== "AbortError") setMembershipLookupError(reason.message);
        })
        .finally(() => setMembershipSearchPending(false));
    }, 280);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [data.organization.slug, membershipLookupName, membershipPickerOpen, membershipPreview]);

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

  function resetDate() { setSelectedDate(""); setSelectedTime(""); setSlots([]); setResult(null); setReviewOpen(false); }
  function clearMembership() {
    setIsMembership(false);
    setMembershipClientId(0);
    setMembershipInfo(null);
    setMembershipPreview(null);
  }
  function changeService(id: number) { clearMembership(); setServiceId(id); resetDate(); }
  function chooseMembership() {
    if (!data.hasMemberships) return;
    setMembershipLookupName("");
    setMembershipLookupPhone("");
    setMembershipCandidates([]);
    setSelectedMembershipCandidate(null);
    setMembershipPreview(null);
    setMembershipLookupError("");
    setMembershipPickerOpen(true);
    setError(null);
  }
  async function identifyMembership(candidate: MembershipCandidate, phoneValue = "") {
    setMembershipLookupPending(true);
    setMembershipLookupError("");
    try {
      const response = await fetch(`/api/public-booking/${encodeURIComponent(data.organization.slug)}/membership`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ clientId: candidate.clientId, name: candidate.clientName, phone: phoneValue }),
      });
      const body = await response.json() as { membership?: MembershipInfo; error?:string };
      if (!response.ok || !body.membership) throw new Error(body.error ?? "Não encontramos seu cadastro de mensalista.");
      setMembershipPreview(body.membership);
      setMembershipLookupName(body.membership.clientName);
    } catch (reason) {
      setMembershipLookupError(reason instanceof Error ? reason.message : "Não encontramos seu cadastro de mensalista.");
    } finally {
      setMembershipLookupPending(false);
    }
  }
  function selectMembershipCandidate(candidate: MembershipCandidate) {
    setSelectedMembershipCandidate(candidate);
    setMembershipLookupName(candidate.clientName);
    setMembershipCandidates([]);
    setMembershipPreview(null);
    setMembershipLookupError("");
    setMembershipLookupPhone("");
    if (!candidate.requiresPhone) void identifyMembership(candidate);
  }
  function confirmMembershipUse() {
    if (!membershipPreview) return;
    setMembershipInfo(membershipPreview);
    setMembershipClientId(membershipPreview.clientId);
    setClientName(membershipPreview.clientName);
    if (membershipLookupPhone) setPhone(membershipLookupPhone);
    setIsMembership(true);
    setServiceId(membershipPreview.serviceId);
    setMembershipPickerOpen(false);
    resetDate();
  }
  function changeBarber(id: number) { setBarberId(id); resetDate(); }
  function editReview(sectionId: string) {
    setReviewOpen(false);
    window.setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedDate || !selectedTime) { setError("Escolha o dia e o horário."); return; }
    if (isMembership && !membershipInfo) { setError("Identifique seu cadastro de mensalista antes de continuar."); return; }
    try {
      validClientName(clientName);
      if (phone.replace(/\D/g, "").length < 8) throw new Error("Informe um telefone ou WhatsApp válido.");
      if (!isMembership && !paymentChoice) throw new Error("Escolha como deseja pagar.");
      setError(null);
      setReviewOpen(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Confira seus dados antes de continuar.");
    }
  }

  async function confirmBooking() {
    if (!selectedDate || !selectedTime || !serviceId) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/public-booking/${encodeURIComponent(data.organization.slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: selectedDate,
          time: selectedTime,
          serviceId,
          barberId,
          clientName: validClientName(clientName),
          phone,
          paymentChoice,
          isMembership,
          membershipClientId,
          website: "",
        }),
      });
      const body = await response.json() as { booking?: { id: number; status: string; barberName: string; serviceName: string; membershipPlanName?: string; requiresApproval: boolean; paymentChoice: string; priceCents: number; pixKey: string; paymentToken: string | null; managementToken: string }; error?: string };
      if (!response.ok || !body.booking) throw new Error(body.error ?? "Não foi possível concluir o agendamento.");
      setReviewOpen(false);
      setResult(body.booking);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível concluir o agendamento.");
      setReviewOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  const bookingHeader = <header className="public-booking-header"><div className="public-booking-brand"><BrandLogo /><div className="public-booking-shop-name"><span>AGENDAMENTO ONLINE</span><strong>{data.organization.name}</strong></div></div></header>;

  if (!data.organization.enabled) return <main className="public-booking-page">{bookingHeader}<section className="public-booking-unavailable"><h1>Agendamento indisponível</h1><p>Entre em contato diretamente com {data.organization.name} para marcar seu horário.</p></section></main>;

  if (result) {
    const isPix = result.paymentChoice === "Pix";
    return <main className="public-booking-page public-booking-result">{bookingHeader}<section className={`public-booking-success${isPix ? " pix-payment-result" : ""}`}><span className={`booking-success-icon${isPix ? " pix-pending" : ""}`}>{isPix ? "PIX" : "✓"}</span><small>{data.organization.name}</small><h1>{isPix ? "Falta só o pagamento" : result.requiresApproval ? "Solicitação enviada!" : "Horário confirmado!"}</h1><p>{isPix ? "Seu horário foi separado e aguarda o Pix para seguir à confirmação." : result.paymentChoice === "Mensalista" ? "1 crédito do seu plano ficou reservado para este horário e só será usado quando o atendimento for concluído." : result.requiresApproval ? "A barbearia recebeu seu pedido e fará a confirmação." : "Seu horário já entrou na agenda da barbearia."}</p><div className="booking-result-appointment"><span>{result.serviceName}</span><strong>{dayLabel(selectedDate)} às {selectedTime}</strong><small>Profissional: {result.barberName}</small></div>{isPix && <PixBookingPayment slug={data.organization.slug} result={result} />}<a className="booking-manage-link" href={`/agendar/${encodeURIComponent(data.organization.slug)}/gerenciar/${encodeURIComponent(result.managementToken)}`}>Cancelar ou remarcar meu horário</a><button className="booking-new-appointment" onClick={() => { setResult(null); resetDate(); }}>Marcar outro horário</button></section></main>;
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

      <section className="booking-card booking-services-card" id="booking-service"><div className="booking-card-heading"><span>1</span><div><strong>Escolha o atendimento</strong><small>Selecione primeiro o serviço que você quer fazer</small></div></div><div className="booking-option-grid services">{visibleServices.map((item) => <button type="button" className={!isMembership && serviceId === item.id ? "selected" : ""} onClick={() => changeService(item.id)} key={item.id}><span><AppIcon name="scissors" /></span><div><strong>{item.name}</strong><small>{item.durationMinutes} min · {money(item.priceCents)}</small></div><b><AppIcon name="check" /></b></button>)}</div>{orderedServices.length > 5 && <button type="button" className="booking-show-more" onClick={() => setShowAllServices((value) => !value)}>{showAllServices ? "Ver menos serviços" : `Ver mais ${orderedServices.length - 5} serviço${orderedServices.length - 5 === 1 ? "" : "s"}`}<b>{showAllServices ? "↑" : "↓"}</b></button>}{data.hasMemberships && <button type="button" className={`booking-membership-entry${isMembership ? " selected" : ""}`} onClick={chooseMembership}><span><AppIcon name="members" /></span><div><strong>{isMembership && membershipInfo ? `Mensalista · ${membershipInfo.serviceName}` : "Sou mensalista"}</strong><small>{isMembership && membershipInfo ? `${membershipInfo.clientName} · ${membershipInfo.planName} · ${membershipInfo.remainingUses} uso${membershipInfo.remainingUses === 1 ? "" : "s"} restante${membershipInfo.remainingUses === 1 ? "" : "s"}` : "Identificar meu cadastro"}</small></div><b>{isMembership ? "Trocar" : "Identificar"} →</b></button>}</section>

      <section className="booking-card" id="booking-professional"><div className="booking-card-heading"><span>2</span><div><strong>Escolha o profissional</strong><small>{isMembership ? "Seu crédito será reservado somente quando você confirmar o agendamento" : "Ou deixe a barbearia encontrar um horário"}</small></div></div><div className="booking-option-grid barbers"><button type="button" className={barberId === 0 ? "selected" : ""} onClick={() => changeBarber(0)}><span><AppIcon name="members" /></span><div><strong>Qualquer profissional</strong><small>Primeiro horário disponível</small></div><b><AppIcon name="check" /></b></button>{data.barbers.map((item) => { const dayHours = selectedDate ? bookingHoursForDate(item.weeklyHours, selectedDate) : null; const unavailable = Boolean(selectedDate && !dayHours?.enabled); return <button type="button" disabled={unavailable} className={`${barberId === item.id ? "selected" : ""}${unavailable ? " unavailable" : ""}`.trim()} onClick={() => changeBarber(item.id)} key={item.id}>{item.photoUrl ? <img className="booking-barber-photo" src={item.photoUrl} alt={`Foto de ${item.name}`} loading="lazy" /> : <span>{item.name.slice(0, 1).toUpperCase()}</span>}<div><strong>{item.name}</strong><small>{unavailable ? "Folga neste dia" : "Selecionar profissional"}</small></div><b><AppIcon name="check" /></b></button>; })}</div></section>

      <section className="booking-card" id="booking-date"><div className="booking-card-heading"><span>3</span><div><strong>Escolha o dia</strong><small>Disponibilidade para os próximos 90 dias</small></div></div><div className={`booking-calendar${selectedDate ? " compact" : ""}`}>{selectedDate ? <div className="booking-selected-date"><div><small>DATA ESCOLHIDA</small><strong>{dayLabel(selectedDate)}</strong></div><button type="button" onClick={resetDate}>Trocar data</button></div> : <><div className="booking-calendar-nav"><button type="button" aria-label="Mês anterior" disabled={month <= new Date(`${today.slice(0, 7)}-01T12:00:00`)} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button><strong>{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</strong><button type="button" aria-label="Próximo mês" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button></div><div className="booking-weekdays">{["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((item) => <span key={item}>{item}</span>)}</div><div className="booking-days">{calendarDays.map((day, index) => { if (!day) return <i key={`blank-${index}`} />; const value = isoDate(new Date(month.getFullYear(), month.getMonth(), day)); const closed = !isPublicBookingDateAllowed(value, data.organization.weekdays); const disabled = value < today || value > maxDate || closed; return <button type="button" disabled={disabled} title={closed ? "Fechado" : undefined} className={value === selectedDate ? "selected" : ""} onClick={() => setSelectedDate(value)} key={value}>{day}</button>; })}</div></>}</div></section>

      {selectedDate && <section className="booking-card booking-times-card" id="booking-time"><div className="booking-card-heading"><span>4</span><div><strong>Horários disponíveis</strong><small>{isMembership && membershipInfo ? membershipInfo.serviceName : service?.name} · {service?.durationMinutes ?? 30} minutos</small></div></div>{loadingSlots ? <div className="booking-loading"><i /><span>Consultando a agenda...</span></div> : slots.length ? <div className="booking-times">{slots.map((slot) => <button type="button" className={selectedTime === slot.time ? "selected" : ""} onClick={() => setSelectedTime(slot.time)} key={`${slot.time}-${slot.barberId}`}><strong>{slot.time}</strong>{barberId === 0 && <small>{slot.barberName}</small>}</button>)}</div> : <div className="booking-no-slots"><span>◷</span><strong>Nenhum horário livre neste dia</strong><button type="button" onClick={resetDate}>Escolher outra data</button></div>}</section>}

      {selectedTime && <section className="booking-card booking-contact-card" id="booking-contact"><div className="booking-card-heading"><span>5</span><div><strong>{isMembership ? "Cadastro mensalista identificado" : "Seus dados e pagamento"}</strong><small>{isMembership ? "Ao confirmar, 1 crédito fica reservado; ele só é consumido quando o atendimento for concluído" : "Escolha como deseja pagar"}</small></div></div><form onSubmit={submit}><label><span>Seu nome</span><input name="clientName" value={clientName} onChange={(event) => { setClientName(event.target.value); if (isMembership) clearMembership(); }} readOnly={isMembership} autoComplete="name" placeholder="Como podemos chamar você?" minLength={2} maxLength={100} pattern="[A-Za-zÀ-ÖØ-öø-ÿ .’'-]+" title="Use somente letras no nome" required /></label><label><span>Telefone ou WhatsApp</span><input name="phone" value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" maxLength={30} required /></label>{!isMembership && (paymentOptions.length ? <fieldset className="booking-payment-options"><legend>Como você quer pagar?</legend>{paymentOptions.map((option) => <label key={option}><input type="radio" name="paymentChoice" value={option} checked={paymentChoice === option} onChange={() => setPaymentChoice(option)} /><span><strong>{option}</strong><small>{option === "Pix" ? "Pagamento integral antecipado" : "Pagamento na barbearia"}</small></span></label>)}</fieldset> : <p className="booking-error" role="alert">A barbearia ainda não liberou uma forma de pagamento.</p>)}<label className="booking-honeypot" aria-hidden="true"><span>Site</span><input name="website" tabIndex={-1} autoComplete="off" /></label>{error && <p className="booking-error" role="alert">{error}</p>}<div className="booking-summary"><span>{selectedServiceLabel}</span><strong>{dayLabel(selectedDate)} · {selectedTime}</strong><small>{selectedBarberName}{!isMembership ? ` · ${paymentChoice}` : membershipInfo ? ` · ${membershipInfo.planName}` : ""}</small></div><button className="booking-submit" disabled={submitting || (!isMembership && !paymentChoice)}>{isMembership ? "Revisar agendamento" : paymentChoice === "Pix" ? "Revisar antes do Pix" : "Revisar agendamento"}<b>→</b></button></form></section>}
      {membershipPickerOpen && <div className="booking-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMembershipPickerOpen(false); }}><section className="booking-modal membership-picker membership-identify" role="dialog" aria-modal="true" aria-labelledby="membership-picker-title"><button type="button" className="booking-modal-close" aria-label="Fechar" onClick={() => setMembershipPickerOpen(false)}>×</button><span className="booking-modal-kicker">CLIENTE MENSALISTA</span>{membershipPreview ? <><h2 id="membership-picker-title">Mensalista encontrado</h2><div className="membership-credit-confirm"><small>CADASTRO CONFIRMADO</small><strong>{membershipPreview.clientName}</strong><div><span>Plano</span><b>{membershipPreview.planName}</b></div><div><span>Serviço</span><b>{membershipPreview.serviceName} · {membershipPreview.durationMinutes} min</b></div><div><span>Créditos disponíveis</span><b>{membershipPreview.remainingUses}</b></div><p>Quando você confirmar o horário, <strong>1 crédito</strong> do seu plano será reservado. Ele só será consumido quando o barbeiro concluir o atendimento.</p><button type="button" className="booking-membership-find" onClick={confirmMembershipUse}>Entendi · continuar para a agenda <b>→</b></button><button type="button" className="booking-membership-back" onClick={() => { setMembershipPreview(null); setSelectedMembershipCandidate(null); setMembershipLookupName(""); setMembershipLookupPhone(""); }}>Voltar e procurar outro nome</button></div></> : <><h2 id="membership-picker-title">Encontre seu nome</h2><p>Digite pelo menos 3 letras. Mostramos somente nome e sobrenome de mensalistas ativos desta barbearia.</p><label><span>Digite seu nome</span><input value={membershipLookupName} onChange={(event) => { setMembershipLookupName(event.target.value); setSelectedMembershipCandidate(null); setMembershipPreview(null); setMembershipLookupError(""); }} autoComplete="off" placeholder="Ex.: João" minLength={3} maxLength={100} /></label>{membershipSearchPending && <p className="membership-search-status">Procurando...</p>}{!membershipSearchPending && membershipLookupName.trim().length >= 3 && membershipCandidates.length === 0 && !selectedMembershipCandidate && <p className="membership-search-status">Nenhum mensalista ativo encontrado com esse nome.</p>}{membershipCandidates.length > 0 && <div className="membership-name-results" role="listbox" aria-label="Mensalistas encontrados">{membershipCandidates.map((candidate) => <button type="button" key={candidate.clientId} onClick={() => selectMembershipCandidate(candidate)}><strong>{candidate.clientName}</strong><span>Selecionar</span></button>)}</div>}{selectedMembershipCandidate?.requiresPhone && <form onSubmit={(event) => { event.preventDefault(); void identifyMembership(selectedMembershipCandidate, membershipLookupPhone); }}><p className="membership-duplicate-note">Encontramos mais de um cadastro com esse mesmo nome. Informe o telefone cadastrado para confirmar qual é o seu.</p><label><span>Telefone ou WhatsApp</span><input value={membershipLookupPhone} onChange={(event) => setMembershipLookupPhone(event.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="(41) 99999-9999" maxLength={30} required /></label><button className="booking-membership-find" disabled={membershipLookupPending}>{membershipLookupPending ? "Confirmando..." : "Confirmar meu cadastro"}<b>→</b></button></form>}{membershipLookupError && <p className="booking-error" role="alert">{membershipLookupError}</p>}</>}</section></div>}
      {reviewOpen && <div className="booking-modal-backdrop review" role="presentation"><section className="booking-modal booking-review-modal" role="dialog" aria-modal="true" aria-labelledby="booking-review-title"><button type="button" className="booking-modal-close" aria-label="Voltar ao agendamento" onClick={() => setReviewOpen(false)}>×</button><span className="booking-modal-kicker">CONFIRA ANTES DE ENVIAR</span><small className="booking-review-shop">{data.organization.name}</small><h2 id="booking-review-title">Está tudo certo?</h2><p>Veja os detalhes do seu atendimento antes de mandar o pedido para a barbearia.</p><div className="booking-review-list"><button type="button" onClick={() => editReview("booking-service")}><span>Serviço</span><strong>{selectedServiceLabel}</strong><small>{isMembership && membershipInfo ? `${membershipInfo.planName} · ${membershipInfo.remainingUses} ${membershipInfo.remainingUses === 1 ? "crédito disponível" : "créditos disponíveis"} · 1 será reservado` : service ? `${service.durationMinutes} min · ${money(service.priceCents)}` : ""}</small><em>Alterar</em></button><button type="button" onClick={() => editReview("booking-professional")}><span>Profissional</span><strong>{selectedBarberName || "Qualquer profissional"}</strong><em>Alterar</em></button><button type="button" onClick={() => editReview("booking-date")}><span>Data</span><strong>{dayLabel(selectedDate)}</strong><em>Alterar</em></button><button type="button" onClick={() => editReview("booking-time")}><span>Horário</span><strong>{selectedTime}</strong><em>Alterar</em></button>{!isMembership && <button type="button" onClick={() => editReview("booking-contact")}><span>Pagamento</span><strong>{paymentChoice}</strong><em>Alterar</em></button>}</div>{error && <p className="booking-error" role="alert">{error}</p>}<div className="booking-review-actions"><button type="button" className="booking-review-back" disabled={submitting} onClick={() => setReviewOpen(false)}>Voltar e alterar</button><button type="button" className="booking-review-confirm" disabled={submitting} onClick={() => void confirmBooking()}>{submitting ? "Confirmando..." : isMembership ? "Confirmar e reservar 1 crédito" : "Confirmar agendamento"}<b>→</b></button></div><small className="booking-review-note">O horário só é enviado agora. Se algo mudou na agenda, o sistema confere novamente antes de salvar.</small></section></div>}
      {error && !selectedTime && <p className="booking-error global" role="alert">{error}</p>}
      <footer className="public-booking-footer"><span>Horários atualizados em tempo real</span><small>Agendamento protegido por Cortou Anotou</small></footer>
    </section>
  </main>;
}
