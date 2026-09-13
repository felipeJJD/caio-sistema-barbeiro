"use client";

import { FormEvent, TouchEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { DashboardData } from "../../db/dashboard";
import type { HistoryWorkbookRow } from "../../lib/history-xlsx";
import { appDate, appDaysUntil, appMonth, appMonthLabel, appMonthPeriod, appMonthStart, appTimeMinutes, nextMonthDueDate, shiftAppMonth } from "../../lib/app-date";
import { barberPayoutCents } from "../../lib/earnings";
import { activeMembershipTotals, membershipMonthTotals } from "../../lib/membership-summary";
import { deliverGeneratedFile } from "../../lib/generated-file-delivery";
import { BOOKING_WEEKDAY_OPTIONS } from "../../lib/booking-weekdays";
import { BrandLogo } from "./brand-logo";
import { HelpAssistant } from "./help-assistant";
import { destinationAllowed, type HelpDestination } from "../../lib/help-guide";
import { AppLoadingScreen } from "./app-loading-screen";
import { AppInstallPrompt } from "./app-install-prompt";
import { NotificationCenter } from "./notification-center";
import { ProductsSection } from "./products-section";
import { PasswordInput } from "./password-input";
import { PublicGallerySettings } from "./public-gallery-settings";
import { BookingPaymentSettings } from "./booking-payment-settings";
import { showAppToast } from "./app-toast";
import { AppIcon } from "./app-icon";
import { teamPaymentSummary } from "../../lib/team-payments";

type NavIconName = "dashboard" | "plus" | "history" | "calendar" | "products" | "finance" | "members" | "goals" | "team" | "users" | "settings" | "plan" | "platform" | "more";
type NavigationItem = { label: string; section: string; icon: NavIconName; group: "operation" | "management" };
type SwipeDirection = "next" | "previous";
type SwipePreview = { section: string; direction: SwipeDirection };
type SwipeGesture = {
  x: number;
  y: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  width: number;
  offset: number;
  axis: "pending" | "horizontal" | "vertical";
  direction: SwipeDirection | null;
  targetSection: string | null;
};
type PixPayment = {
  id: number;
  status: string;
  amountCents: number;
  periodDays: number;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
  accessUntil: string | null;
};

const ownerNavigation: NavigationItem[] = [
  { label: "Painel", section: "Painel", icon: "dashboard", group: "operation" },
  { label: "Registrar", section: "Registrar", icon: "plus", group: "operation" },
  { label: "Histórico", section: "Histórico", icon: "history", group: "operation" },
  { label: "Agenda", section: "Agenda", icon: "calendar", group: "operation" },
  { label: "Produtos", section: "Produtos", icon: "products", group: "operation" },
  { label: "Financeiro", section: "Financeiro", icon: "finance", group: "management" },
  { label: "Mensalistas", section: "Mensalistas", icon: "members", group: "management" },
  { label: "Equipe", section: "Equipe", icon: "team", group: "management" },
  { label: "Configurações", section: "Configurações", icon: "settings", group: "management" },
];
const barberNavigation: NavigationItem[] = ownerNavigation.filter((item) => item.group === "operation");
const planNavigation: NavigationItem = { label: "Meu plano", section: "Meu plano", icon: "plan", group: "management" };
const platformNavigation: NavigationItem = { label: "Plataforma", section: "Plataforma", icon: "platform", group: "management" };
const ownerBottomOrder = ["Painel", "Agenda", "Registrar", "Histórico"];
const barberBottomOrder = ["Painel", "Agenda", "Registrar", "Histórico"];

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    plus: <><path d="M12 4v16M4 12h16" /></>,
    history: <><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="m8.7 8.4 10.8 6.1M8.7 15.6 19.5 9.5" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    products: <><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="m4 8 8 4 8-4v9l-8 4-8-4V8Z" /><path d="M12 12v9" /></>,
    finance: <><path d="M12 2v20M17 6.5c-1-1-2.5-1.5-5-1.5-3 0-5 1.4-5 3.5S9 12 12 12s5 1.4 5 3.5S15 19 12 19c-2.5 0-4-.5-5-1.5" /></>,
    members: <><path d="M12 3 21 12 12 21 3 12 12 3Z" /><path d="M9 12h6" /></>,
    goals: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    team: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    users: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.14.36.35.7.6 1 .3.28.7.42 1.1.4H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></>,
    plan: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    platform: <><path d="M4 20V9l8-5 8 5v11" /><path d="M2 20h20M8 20v-7h8v7M8 9h.01M12 9h.01M16 9h.01" /></>,
    more: <><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>,
  };
  return <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
const numeric = (value: number) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(numeric(cents) / 100);
const shortMoney = (cents: number) => Math.abs(numeric(cents)) >= 10000000
  ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(numeric(cents) / 100)
  : money(cents);
const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
const initials = (name: string) => name.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase();
const pct = (value: number, target: number) => target ? Math.min(100, Math.round(value / target * 100)) : 0;
const greetingForHour = (hour: number) => hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
const today = appDate();
const monthStart = appMonthStart(today);
const canonicalSiteOrigin = "https://cortouanotou.com.br";
const inRange = (value: string, start: string, end: string) => (!start || value >= start) && (!end || value <= end);
const isOpenAppointment = (status: string) => status !== "Cancelado" && status !== "Concluído" && status !== "Atendido";
const fileNamePart = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "historico";
const accessPeriodEnded = (value: string | null) => {
  if (!value) return false;
  const endTime = Date.parse(value);
  return Number.isFinite(endTime) && endTime <= Date.now();
};
const browserSectionNames = new Set([
  "Painel", "Registrar", "Histórico", "Agenda", "Produtos", "Financeiro", "Mensalistas",
  "Equipe", "Usuários", "Configurações", "Meu plano", "Plataforma",
]);
const sectionToBrowserValue = (section: string) => section === "Histórico" ? "Historico" : section;
const sectionFromBrowserLocation = () => {
  const value = new URLSearchParams(window.location.search).get("section");
  if (!value) return "Painel";
  const section = value === "Historico" ? "Histórico" : value;
  if (section === "Usuários") return "Equipe";
  if (section === "Metas") return "Financeiro";
  return browserSectionNames.has(section) ? section : "Painel";
};
const browserUrlForSection = (section: string) => {
  const url = new URL(window.location.href);
  if (section === "Painel") url.searchParams.delete("section");
  else url.searchParams.set("section", sectionToBrowserValue(section));
  return `${url.pathname}${url.search}${url.hash}`;
};

function useEditorAutoScroll<T extends HTMLElement>(editingKey: number | string | null) {
  const editorRef = useRef<T>(null);

  useEffect(() => {
    if (editingKey === null) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
        editor.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [editingKey]);

  return editorRef;
}

function emptyPeriodData(baseData: DashboardData, start: string, end: string): DashboardData {
  return {
    ...baseData,
    dataPeriod: { start, end },
    records: [],
    productSales: [],
    teamPayments: [],
    membershipPayments: [],
    expenses: [],
    appointments: baseData.appointments.filter((item) => isOpenAppointment(item.status)),
  };
}

function usePeriodDashboardData(baseData: DashboardData, start: string, end: string) {
  const baseMatches = baseData.dataPeriod.start === start && baseData.dataPeriod.end === end;
  const [periodData, setPeriodData] = useState<DashboardData | null>(baseMatches ? baseData : null);

  useEffect(() => {
    if (baseData.dataPeriod.start === start && baseData.dataPeriod.end === end) {
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({ start, end });
    fetch(`/api/dashboard-period?${query.toString()}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/");
          return null;
        }
        const payload = await response.json() as { data?: DashboardData };
        if (!response.ok || !payload.data) throw new Error("Não foi possível carregar o período.");
        return payload.data;
      })
      .then((nextData) => { if (nextData && !controller.signal.aborted) setPeriodData(nextData); })
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setPeriodData(emptyPeriodData(baseData, start, end)); });
    return () => controller.abort();
  }, [baseData, end, start]);

  if (baseMatches) return baseData;
  return periodData?.dataPeriod.start === start && periodData.dataPeriod.end === end
    ? periodData
    : emptyPeriodData(baseData, start, end);
}
const barbershopCuriosities = [
  "A profissão de barbeiro está entre as mais antigas do mundo: cuidar da aparência sempre foi uma forma de cuidar da autoestima.",
  "Um bom corte não muda só o visual: ele ajuda o cliente a se sentir mais confiante para a semana.",
  "A conversa da cadeira também faz parte do atendimento. Muitas amizades começam em uma barbearia.",
  "O acabamento é o detalhe que faz o cliente olhar no espelho uma segunda vez antes de sair.",
  "Barbearia de verdade mistura técnica, atenção aos detalhes e respeito pelo estilo de cada cliente.",
  "Fidelizar um cliente começa no cuidado com o primeiro atendimento, não apenas no desconto.",
  "Cada rosto tem proporções diferentes. Por isso, o melhor corte é o que combina com a pessoa, não só o da moda.",
  "O visagismo ajuda o barbeiro a escolher linhas e volumes que valorizam o rosto do cliente.",
  "O degradê ganhou força porque permite transições suaves e deixa o corte mais versátil.",
  "Uma barba bem desenhada pode equilibrar o rosto e valorizar a linha do maxilar.",
  "A navalha pede firmeza, higiene e precisão — por isso ela continua sendo símbolo de acabamento clássico.",
  "Ferramentas limpas e bem cuidadas protegem o cliente e mostram profissionalismo.",
  "A pontualidade também é um serviço: respeitar o horário do cliente faz parte de um bom atendimento.",
  "Registrar os atendimentos ajuda a barbearia a entender quais serviços os clientes mais procuram.",
  "Cliente recorrente conhece o próprio corte, mas sempre vale perguntar como ele quer hoje.",
  "Uma boa consulta antes de começar evita surpresa no final e aumenta a confiança do cliente.",
  "A iluminação da barbearia influencia muito na hora de conferir o acabamento do corte.",
  "O espelho não serve só para mostrar o resultado: ele cria confiança durante todo o atendimento.",
  "Uma toalha quente transforma um serviço simples em uma experiência mais marcante.",
  "O pós-atendimento é poderoso: lembrar o cliente de agendar de novo ajuda a criar rotina.",
  "A maioria dos estilos de corte volta à moda com uma releitura moderna.",
  "O corte social nunca sai de cena porque combina praticidade com aparência bem cuidada.",
  "Um bom barbeiro observa o crescimento do cabelo para deixar o corte bonito também depois de alguns dias.",
  "A frequência ideal de manutenção depende do estilo, mas muitos clientes gostam de retocar entre duas e quatro semanas.",
  "A experiência começa na recepção e termina só quando o cliente sai satisfeito pela porta.",
  "Barbearia é um dos poucos lugares onde atendimento e conversa ainda caminham lado a lado.",
  "Quem agenda bem reduz espera, trabalha com mais calma e atende melhor.",
  "Saber o nome e a preferência do cliente faz ele se sentir lembrado — e isso vale muito.",
  "A tesoura cria textura; a máquina cria estrutura. As duas se completam em um bom corte.",
  "Produtos de finalização ajudam a mostrar o resultado, mas o corte precisa continuar bonito sem eles.",
  "A linha da nuca bem feita deixa a sensação de corte novo por mais tempo.",
  "O bom atendimento une padrão de qualidade e personalidade: cada barbeiro tem sua assinatura.",
  "Indicação é uma das melhores formas de crescimento para uma barbearia, porque ela nasce da confiança.",
  "Organização financeira dá liberdade para o barbeiro investir em curso, ferramenta e estrutura.",
  "O clube mensal funciona melhor quando o cliente entende claramente os benefícios e acompanha seus usos.",
  "Pequenos detalhes, como oferecer água e manter o ambiente agradável, fazem o cliente querer voltar.",
  "A cadeira é o centro da barbearia: é ali que a técnica encontra a confiança do cliente.",
  "O estilo certo respeita a rotina do cliente. Nem todo corte bonito é prático para o dia a dia dele.",
  "Ouvir antes de cortar é uma das técnicas mais importantes que um barbeiro pode ter.",
  "Um histórico de atendimentos ajuda a lembrar a preferência de cada cliente sem depender da memória.",
  "Corte e barba bem feitos deixam a aparência alinhada, mas também reforçam a identidade de quem usa.",
  "Uma barbearia organizada consegue atender melhor hoje e crescer com mais segurança amanhã.",
  "O melhor elogio para um barbeiro é quando o cliente volta e traz alguém junto.",
  "Todo atendimento bem registrado vira informação para tomar decisões melhores na barbearia.",
  "A confiança de um cliente é construída corte após corte, conversa após conversa."
];
type Post = (body: Record<string, string | number | boolean>, success: string) => Promise<boolean>;
type Appointment = DashboardData["appointments"][number];

function whatsappPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  return "";
}

function whatsappConfirmationUrl(appointment: Appointment, organizationName: string) {
  const phone = whatsappPhone(appointment.phone);
  if (!phone) return "";
  const message = [
    `Olá, ${appointment.clientName}!`,
    `Seu horário na ${organizationName} foi confirmado.`,
    "",
    `Serviço: ${appointment.paymentChoice === "Mensalista" ? "Mensalista" : appointment.serviceName}`,
    `Profissional: ${appointment.barberName}`,
    `Data: ${date(appointment.appointmentDate)}`,
    `Horário: ${appointment.appointmentTime}`,
    "",
    "Até lá! — Cortou Anotou",
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function whatsappReminderUrl(appointment: Appointment, organizationName: string) {
  const phone = whatsappPhone(appointment.phone);
  if (!phone) return "";
  const message = [
    `Olá, ${appointment.clientName}!`,
    `Passando para lembrar do seu horário na ${organizationName}.`,
    "",
    `Serviço: ${appointment.paymentChoice === "Mensalista" ? "Mensalista" : appointment.serviceName}`,
    `Profissional: ${appointment.barberName}`,
    `Data: ${date(appointment.appointmentDate)}`,
    `Horário: ${appointment.appointmentTime}`,
    "",
    "Se precisar remarcar, fale com a gente.",
    "Até logo! — Cortou Anotou",
  ].join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function openWhatsApp(url: string) {
  const match = url.match(/^https:\/\/wa\.me\/(\d+)\?text=(.*)$/);
  const isAppleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isInstalledApp = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (match && isAppleMobile && isInstalledApp) {
    window.location.href = `whatsapp://send?phone=${match[1]}&text=${match[2]}`;
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function reminderSentLabel(value: string) {
  const sent = new Date(value);
  return `Lembrete enviado em ${sent.toLocaleDateString("pt-BR")} às ${sent.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}
type RecordProductItem = {
  key: number;
  saleId?: number;
  productId: number;
  quantity: number;
  originalProductId?: number;
  originalQuantity?: number;
};

export function DashboardApp({ initialData }: { initialData: DashboardData }) {
  const [liveData, setLiveData] = useState(initialData);
  const [section, setSection] = useState("Painel");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeType, setNoticeType] = useState<"error" | null>(null);
  const [recordType, setRecordType] = useState("Avulso");
  const [origin, setOrigin] = useState("Retorno");
  const [selectedService, setSelectedService] = useState(initialData.services[0]?.id ?? 0);
  const [selectedMember, setSelectedMember] = useState(initialData.clients[0]?.id ?? 0);
  const [isPending, setIsPending] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuClosing, setMobileMenuClosing] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(false);
  const [greeting, setGreeting] = useState("Olá");
  const [recordDate, setRecordDate] = useState(appDate());
  const [recordProducts, setRecordProducts] = useState<RecordProductItem[]>([]);
  const [swipePreview, setSwipePreview] = useState<SwipePreview | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const swipeStart = useRef<SwipeGesture | null>(null);
  const swipeViewport = useRef<HTMLDivElement | null>(null);
  const swipeSettleTimer = useRef<number | null>(null);
  const drawerSwipeStart = useRef<number | null>(null);
  const menuCloseTimer = useRef<number | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuDrawerRef = useRef<HTMLElement>(null);
  const actionInFlight = useRef(false);
  const sectionHistoryReady = useRef(false);
  const skipSectionHistorySync = useRef(false);
  const availableServices = liveData.services.filter((item) => item.active);
  const activeMembers = liveData.clients.filter((item) => item.status === "Ativo");
  const effectiveSelectedService = availableServices.some((item) => item.id === selectedService) ? selectedService : availableServices[0]?.id ?? 0;
  const effectiveSelectedMember = activeMembers.some((item) => item.id === selectedMember) ? selectedMember : activeMembers[0]?.id ?? 0;
  const service = liveData.services.find((item) => item.id === effectiveSelectedService);
  const member = liveData.clients.find((item) => item.id === effectiveSelectedMember);
  const memberPlan = liveData.plans.find((item) => item.id === member?.planId);
  const recordProductTotalCents = recordProducts.reduce((sum, item) => {
    const product = liveData.products.find((candidate) => candidate.id === item.productId);
    return sum + (product?.priceCents ?? 0) * item.quantity;
  }, 0);
  const viewer = liveData.viewer;
  const accessExpired = accessPeriodEnded(viewer.trialEndsAt);
  const ownerSections = viewer.trialEndsAt ? [...ownerNavigation, planNavigation] : ownerNavigation;
  const navigation = viewer.isOwner ? (viewer.isPlatformAdmin ? [...ownerSections, platformNavigation] : ownerSections) : barberNavigation;
  const operationNavigation = navigation.filter((item) => item.group === "operation");
  const managementNavigation = navigation.filter((item) => item.group === "management");
  const preferredBottomOrder = viewer.isOwner ? ownerBottomOrder : barberBottomOrder;
  const preferredBottomItems = preferredBottomOrder
    .map((preferredSection) => navigation.find((item) => item.section === preferredSection))
    .filter((item): item is NavigationItem => Boolean(item));
  const preferredBottomSections = new Set(preferredBottomItems.map((item) => item.section));
  const secondaryNavigation = navigation.filter((item) => !preferredBottomSections.has(item.section));
  const swipeNavigation = [...preferredBottomItems, ...secondaryNavigation];
  const unreadNotifications = liveData.notifications.filter((item) => !item.readAt).length;
  const firstName = viewer.name.split(" ")[0];

  const closeMobileMenu = useCallback(() => {
    if (!mobileMenuOpen || mobileMenuClosing) return;
    setMobileMenuClosing(true);
    if (menuCloseTimer.current) window.clearTimeout(menuCloseTimer.current);
    menuCloseTimer.current = window.setTimeout(() => {
      setMobileMenuOpen(false);
      setMobileMenuClosing(false);
      menuCloseTimer.current = null;
      if (document.activeElement === document.body || menuDrawerRef.current?.contains(document.activeElement)) menuButtonRef.current?.focus({ preventScroll: true });
    }, 330);
  }, [mobileMenuClosing, mobileMenuOpen]);

  function openMobileMenu() {
    if (menuCloseTimer.current) window.clearTimeout(menuCloseTimer.current);
    window.dispatchEvent(new Event("cortou-anotou:open-navigation"));
    setMobileMenuClosing(false);
    setMobileMenuOpen(true);
  }

  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px)");
    const updateViewport = () => {
      setMobileViewport(media.matches);
      if (!media.matches) {
        if (menuCloseTimer.current) window.clearTimeout(menuCloseTimer.current);
        menuCloseTimer.current = null;
        setMobileMenuOpen(false);
        setMobileMenuClosing(false);
      }
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    let clearQuery = false;
    const requestedSection = sectionFromBrowserLocation();
    let welcomeNotice: string | null = null;
    if (query.get("welcome") === "barbershop") {
      welcomeNotice = "Sua barbearia foi criada. Agora ajuste os serviços e convide sua equipe.";
      clearQuery = true;
    }
    if (query.get("welcome") === "email-confirmed") {
      welcomeNotice = "E-mail confirmado. Seus dias grátis começaram agora — seja bem-vindo ao Cortou Anotou!";
      clearQuery = true;
    }
    if (query.get("payment") === "approved") {
      welcomeNotice = "Pagamento aprovado. Mais 30 dias foram liberados para a barbearia.";
      clearQuery = true;
    }
    if (clearQuery) window.history.replaceState(window.history.state ?? {}, "", "/");
    const frame = window.requestAnimationFrame(() => {
      setGreeting(greetingForHour(new Date().getHours()));
      if (requestedSection !== "Painel") setSection(requestedSection);
      if (welcomeNotice) {
        showAppToast(welcomeNotice);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const initialSection = sectionFromBrowserLocation();
    const initialUrl = browserUrlForSection(initialSection);
    const currentState = window.history.state ?? {};
    window.history.replaceState({ ...currentState, cortouAnotouSection: initialSection }, "", initialUrl);

    // O Android fecha a PWA quando não existe nenhuma página anterior.
    // Esta entrada extra faz a primeira seta voltar ao Painel.
    if (/Android/i.test(window.navigator.userAgent)) {
      window.history.pushState({ ...currentState, cortouAnotouSection: initialSection, cortouAnotouBackGuard: true }, "", initialUrl);
    }

    sectionHistoryReady.current = true;
    const onPopState = () => {
      skipSectionHistorySync.current = true;
      setSection(sectionFromBrowserLocation());
      setMobileMenuOpen(false);
      setMobileMenuClosing(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!sectionHistoryReady.current) return;
    if (skipSectionHistorySync.current) {
      skipSectionHistorySync.current = false;
      return;
    }
    const nextUrl = browserUrlForSection(section);
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (currentUrl !== nextUrl) {
      window.history.pushState({ ...(window.history.state ?? {}), cortouAnotouSection: section }, "", nextUrl);
    }
  }, [section]);

  useEffect(() => {
    if (!viewer.trialEndsAt) return;
    const endTime = Date.parse(viewer.trialEndsAt);
    const remaining = endTime - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) return;
    const timer = window.setTimeout(() => window.location.reload(), Math.min(remaining + 1000, 2147483647));
    return () => window.clearTimeout(timer);
  }, [viewer.trialEndsAt]);

  useEffect(() => {
    if (!showIntro) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => setShowIntro(false), 2100);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [showIntro]);

  useEffect(() => {
    const openedOn = appDate();
    const refreshAfterDayChange = () => {
      if (document.visibilityState !== "hidden" && appDate() !== openedOn) window.location.reload();
    };
    const timer = window.setInterval(refreshAfterDayChange, 60000);
    window.addEventListener("focus", refreshAfterDayChange);
    document.addEventListener("visibilitychange", refreshAfterDayChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshAfterDayChange);
      document.removeEventListener("visibilitychange", refreshAfterDayChange);
    };
  }, []);

  useEffect(() => {
    if (section !== "Agenda" || isPending) return;
    let active = true;
    let controller: AbortController | null = null;

    const refreshAgenda = async () => {
      controller?.abort();
      controller = new AbortController();
      const query = new URLSearchParams({ start: appMonthStart(), end: appDate() });
      try {
        const response = await fetch(`/api/dashboard-period?${query.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (response.status === 401) {
          window.location.assign("/");
          return;
        }
        const payload = await response.json() as { data?: DashboardData };
        if (active && response.ok && payload.data) setLiveData(payload.data);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        // Mantém a agenda atual e tenta novamente ao abrir ou voltar ao aplicativo.
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshAgenda();
    };
    void refreshAgenda();
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isPending, section]);

  useEffect(() => {
    if (section !== "Registrar") return;
    const frame = window.requestAnimationFrame(() => setRecordDate(appDate()));
    return () => window.cancelAnimationFrame(frame);
  }, [section]);

  useEffect(() => {
    const scheduled = liveData.appointments.filter((item) => item.status === "Agendado");
    if (!scheduled.length) return;
    const currentDate = appDate();
    const currentMinutes = appTimeMinutes();
    const dateValue = (value: string) => Date.parse(`${value}T12:00:00Z`);
    const toMinutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
    const waits = scheduled.map((item) => {
      const dayDifference = Math.round((dateValue(item.appointmentDate) - dateValue(currentDate)) / 86400000);
      return (dayDifference * 1440 + toMinutes(item.appointmentTime) + item.durationMinutes - currentMinutes) * 60000;
    });
    const nextWait = Math.min(...waits);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync-finished-appointments" }) });
        const payload = await response.json() as { data?: DashboardData };
        if (response.ok && payload.data) setLiveData(payload.data);
      } catch {
        // A próxima abertura ou ação no app tenta novamente sem interromper o trabalho.
      }
    }, Math.min(Math.max(nextWait + 65000, 1500), 6 * 60 * 60 * 1000));
    return () => window.clearTimeout(timer);
  }, [liveData.appointments]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileMenu();
      if (event.key === "Tab") {
        const controls = [menuButtonRef.current, ...Array.from(menuDrawerRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? [])].filter((control): control is HTMLElement => Boolean(control));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeMobileMenu, mobileMenuOpen]);

  useEffect(() => () => {
    if (menuCloseTimer.current) window.clearTimeout(menuCloseTimer.current);
    if (swipeSettleTimer.current) window.clearTimeout(swipeSettleTimer.current);
  }, []);

  async function post(body: Record<string, string | number | boolean>, success: string) {
    if (actionInFlight.current) return false;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setNoticeType("error");
      setNotice("Sem internet no momento. Nada foi perdido: conecte o celular e toque em salvar novamente.");
      return false;
    }
    actionInFlight.current = true;
    setNotice(null); setNoticeType(null); setIsPending(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const payload = await response.json().catch(() => ({})) as { error?: string; data?: DashboardData };
      if (response.status === 401) { window.location.assign("/"); return false; }
      if (response.status === 402) { window.location.assign("/"); return false; }
      if (!response.ok) { setNoticeType("error"); setNotice(payload.error ?? "Não foi possível concluir. Tente novamente."); return false; }
      if (payload.data) setLiveData(payload.data);
      setNotice(null); setNoticeType(null); showAppToast(success); return true;
    } catch (error) {
      setNoticeType("error");
      setNotice(error instanceof DOMException && error.name === "AbortError"
        ? "A conexão demorou demais. Nada foi apagado: toque em salvar novamente."
        : "Não foi possível atualizar. Verifique sua conexão e tente novamente.");
      return false;
    }
    finally {
      window.clearTimeout(timeout);
      actionInFlight.current = false;
      setIsPending(false);
    }
  }
  async function submitRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const productItems = JSON.stringify(recordProducts.map(({ productId, quantity }) => ({ productId, quantity })));
    const ok = recordType === "Produto"
      ? await post({ action: "product-sale-bundle", occurredAt: String(data.get("occurredAt")), clientName: String(data.get("clientName") ?? ""), sellerTeamMemberId: Number(data.get("barberId")), paymentMethodId: Number(data.get("paymentMethodId")), productItems }, "Venda registrada no Histórico. Estoque, comissão e financeiro atualizados.")
      : await post({ action: "daily-record", occurredAt: String(data.get("occurredAt")), recordType, clientName: String(data.get("clientName") ?? ""), membershipClientId: Number(data.get("membershipClientId") ?? 0), barberId: Number(data.get("barberId")), serviceId: Number(data.get("serviceId") ?? 0), paymentMethodId: Number(data.get("paymentMethodId")), origin: recordType === "Mensalista" ? "Assinatura" : origin, tipCents: Math.round(Number(data.get("tip") ?? 0) * 100), productItems }, recordProducts.length ? "Atendimento e produtos salvos. Estoque e comissões atualizados." : recordType === "Mensalista" ? "Uso salvo. Saldo e painel atualizados na hora." : "Atendimento salvo. Histórico e painel atualizados na hora.");
    if (ok) {
      form.reset();
      setRecordDate(appDate());
      setRecordProducts([]);
      const focused = document.activeElement;
      if (focused instanceof HTMLElement) focused.blur();
    }
  }
  function registerMember(clientId: number) { setSelectedMember(clientId); setRecordType("Mensalista"); setOrigin("Assinatura"); setSection("Registrar"); }
  function openMembershipClientForm() {
    setSection("Configurações");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const editor = document.querySelector<HTMLElement>(".settings-layout .editor-scroll-target");
        editor?.scrollIntoView({ behavior: "smooth", block: "start" });
        editor?.focus({ preventScroll: true });
      });
    });
  }
  const [helpTarget, setHelpTarget] = useState<{tab?:string;revision:number}>({revision:0});
  function chooseSection(nextSection: string) { setSection(nextSection === "Usuários" ? "Equipe" : nextSection); closeMobileMenu(); }
  function navigateFromHelp(destination:HelpDestination) {
    if (!destinationAllowed(destination,viewer.isOwner)) return;
    setHelpTarget(previous=>({tab:destination.tab,revision:previous.revision+1}));
    chooseSection(destination.section);
    window.requestAnimationFrame(()=>{
      const heading = document.querySelector<HTMLElement>(".topbar h1");
      heading?.setAttribute("tabindex","-1");
      heading?.focus({preventScroll:true});
      heading?.scrollIntoView({block:"start",behavior:"smooth"});
    });
  }
  function openAssistant() {
    closeMobileMenu();
    window.setTimeout(() => window.dispatchEvent(new Event("cortou-anotou:open-assistant")), 360);
  }
  function startDrawerSwipe(event: TouchEvent<HTMLElement>) {
    drawerSwipeStart.current = event.touches.length === 1 ? event.touches[0].clientX : null;
  }
  function finishDrawerSwipe(event: TouchEvent<HTMLElement>) {
    const start = drawerSwipeStart.current;
    drawerSwipeStart.current = null;
    if (start !== null && event.changedTouches.length === 1 && event.changedTouches[0].clientX - start < -55) closeMobileMenu();
  }
  function startSwipe(event: TouchEvent<HTMLElement>) {
    if (window.innerWidth > 680 || event.touches.length !== 1 || swipeSettleTimer.current !== null || mobileMenuOpen) { swipeStart.current = null; return; }
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, .table-wrap, .mobile-tabs")) { swipeStart.current = null; return; }
    const viewport = swipeViewport.current;
    if (!viewport) return;
    viewport.classList.remove("is-settling");
    viewport.style.setProperty("--swipe-x", "0px");
    viewport.style.removeProperty("--swipe-duration");
    const touch = event.touches[0];
    swipeStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      lastX: touch.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      width: viewport.getBoundingClientRect().width || window.innerWidth,
      offset: 0,
      axis: "pending",
      direction: null,
      targetSection: null,
    };
  }
  function moveSwipe(event: TouchEvent<HTMLElement>) {
    const gesture = swipeStart.current;
    const viewport = swipeViewport.current;
    if (!gesture || !viewport || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const rawX = touch.clientX - gesture.x;
    const rawY = touch.clientY - gesture.y;
    if (gesture.axis === "pending") {
      if (Math.abs(rawX) < 9 && Math.abs(rawY) < 9) return;
      if (Math.abs(rawY) > Math.abs(rawX) * .9) { gesture.axis = "vertical"; return; }
      gesture.axis = "horizontal";
      gesture.direction = rawX < 0 ? "next" : "previous";
      const currentIndex = swipeNavigation.findIndex((item) => item.section === section);
      const targetIndex = currentIndex + (gesture.direction === "next" ? 1 : -1);
      gesture.targetSection = swipeNavigation[targetIndex]?.section ?? null;
      if (gesture.targetSection) setSwipePreview({ section: gesture.targetSection, direction: gesture.direction });
    }
    if (gesture.axis !== "horizontal") return;
    event.preventDefault();
    const now = event.timeStamp;
    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocity = (touch.clientX - gesture.lastX) / elapsed;
    gesture.lastX = touch.clientX;
    gesture.lastTime = now;
    if (!gesture.targetSection) {
      gesture.offset = Math.sign(rawX) * Math.min(42, Math.abs(rawX) * .18);
    } else {
      gesture.offset = gesture.direction === "next" ? Math.min(0, rawX) : Math.max(0, rawX);
    }
    viewport.style.setProperty("--swipe-x", `${gesture.offset}px`);
  }
  function finishSwipe() {
    const gesture = swipeStart.current;
    const viewport = swipeViewport.current;
    swipeStart.current = null;
    if (!gesture || !viewport || gesture.axis !== "horizontal") return;
    const distance = Math.abs(gesture.offset);
    const shouldCommit = Boolean(gesture.targetSection) && (distance > gesture.width * .22 || (Math.abs(gesture.velocity) > .42 && distance > 30));
    if (shouldCommit && gesture.targetSection) {
      // Reset the translated page before replacing it. Safari on iOS can paint the
      // new page with the old full-width transform for one frame, which leaves the
      // app blank or horizontally clipped after a completed swipe.
      viewport.classList.remove("is-settling");
      viewport.style.setProperty("--swipe-x", "0px");
      viewport.style.removeProperty("--swipe-duration");
      flushSync(() => {
        setSection(gesture.targetSection as string);
        setSwipePreview(null);
      });
      return;
    }
    const remainingRatio = Math.min(1, distance / gesture.width);
    const duration = Math.round(180 + remainingRatio * 100);
    viewport.style.setProperty("--swipe-duration", `${duration}ms`);
    viewport.classList.add("is-settling");
    void viewport.offsetWidth;
    viewport.style.setProperty("--swipe-x", "0px");
    swipeSettleTimer.current = window.setTimeout(() => {
      flushSync(() => setSwipePreview(null));
      viewport.classList.remove("is-settling");
      viewport.style.setProperty("--swipe-x", "0px");
      viewport.style.removeProperty("--swipe-duration");
      swipeSettleTimer.current = null;
    }, duration + 34);
  }
  function cancelSwipe() {
    if (!swipeStart.current) return;
    swipeStart.current.velocity = 0;
    finishSwipe();
  }
  async function renew(clientId: number) {
    const client = liveData.clients.find((item) => item.id === clientId);
    if (!client) return;
    if (!window.confirm(`Renovar ${client.name}? Confirme somente depois de receber a mensalidade. O pagamento será lançado no mês do vencimento, os usos do plano serão liberados e o próximo vencimento será atualizado.`)) return;
    await post({ action: "renew", clientId }, `Plano de ${client.name} renovado e usos liberados.`);
  }
  function replaceNotifications(notifications: DashboardData["notifications"]) { setLiveData((current) => ({ ...current, notifications })); }
  function markNotificationsRead() { setLiveData((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) })); }
  const subtitle: Record<string, string> = { Painel: "Escolha o período e acompanhe os resultados.", Registrar: "Atendimento, mensalista ou venda somente de produto.", Histórico: "Filtre, edite ou exclua qualquer atendimento.", Agenda: "Horários da equipe organizados por data.", Financeiro: "Resultados, despesas e metas no mesmo lugar.", Produtos: "Venda rápida, estoque e lucro dos produtos.", Mensalistas: "Consulte pagamentos, usos e clientes por mês.", Configurações: "Altere clientes, preços e regras sem depender de ninguém.", Equipe: "Resultados, usuários, convites e acessos da equipe.", "Meu plano": "Consulte o teste gratuito e escolha como continuar.", Plataforma: "Acompanhe e gerencie as barbearias que usam o aplicativo." };

  function renderSectionBody(activeSection: string, current: boolean) {
    return <>
      {activeSection === "Painel" && (viewer.isOwner ? <Overview data={liveData} go={setSection} planAutoOpen={current} post={post} pending={isPending} /> : <StaffOverview data={liveData} go={setSection} />)}
      {activeSection === "Registrar" && <section className="form-layout">
        <div className="panel form-card">
          <SectionTitle title={recordType === "Produto" ? "Venda somente de produto" : "Novo atendimento"} copy={recordType === "Produto" ? "Registre a venda sem adicionar corte ou barba." : "Escolha o tipo. O restante é calculado pelo Cortou Anotou."} />
          <div className="type-switch three">
            <button type="button" onClick={() => { setRecordType("Avulso"); setOrigin("Retorno"); }} className={recordType === "Avulso" ? "active" : ""}>Avulso</button>
            <button type="button" onClick={() => { setRecordType("Mensalista"); setOrigin("Assinatura"); }} className={recordType === "Mensalista" ? "active" : ""}>Mensalista</button>
            <button type="button" onClick={() => setRecordType("Produto")} className={recordType === "Produto" ? "active" : ""}>Só produto</button>
          </div>
          <form className="app-form" onSubmit={submitRecord}>
            <div className="field-grid">
              <Field label="Data"><input name="occurredAt" type="date" value={recordDate} onChange={(event) => setRecordDate(event.target.value)} required /></Field>
              {recordType === "Mensalista"
                ? <Field label="Mensalista"><select name="membershipClientId" value={effectiveSelectedMember} onChange={(event) => setSelectedMember(Number(event.target.value))}>{activeMembers.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.remaining} restantes</option>)}</select></Field>
                : <Field label="Cliente"><input name="clientName" placeholder={recordType === "Produto" ? "Nome de quem comprou" : "Nome do cliente"} required /></Field>}
              <Field label={recordType === "Produto" ? "Quem realizou a venda" : "Barbeiro"}><select name="barberId" defaultValue={viewer.teamMemberId}>{liveData.team.filter((item) => item.active && (viewer.isOwner || item.id === viewer.teamMemberId)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
              {recordType === "Avulso" && <Field label="Serviço"><select name="serviceId" value={effectiveSelectedService} onChange={(event) => setSelectedService(Number(event.target.value))}>{availableServices.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>}
              {(recordType !== "Mensalista" || recordProducts.length > 0) && <Field label={recordType === "Mensalista" ? "Pagamento dos produtos" : "Pagamento"}><select name="paymentMethodId" required>{liveData.paymentMethods.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>}
              {recordType === "Avulso" && <Field label="Origem"><select name="origin" value={origin} onChange={(event) => { const value = event.target.value; setOrigin(value); if (value === "Assinatura") setRecordType("Mensalista"); }}><option>Retorno</option><option>Novo</option><option>Indicação</option><option>Assinatura</option></select></Field>}
              {recordType !== "Produto" && <Field label="Gorjeta (R$)"><input name="tip" type="number" min="0" max="10000" step="0.01" inputMode="decimal" defaultValue="0" /></Field>}
            </div>
            <div className={`calculation ${recordType === "Produto" ? "product-only-calculation" : ""}`}>
              <span>{recordType === "Produto" ? "Total dos produtos" : recordType === "Avulso" ? "Valor do serviço" : `${member?.plan ?? "Plano"} · ${member?.remaining ?? 0} usos restantes`}</span>
              <strong>{recordType === "Produto" ? money(recordProductTotalCents) : recordType === "Avulso" ? money(service?.priceCents ?? 0) : viewer.isOwner ? "Atendimento do proprietário" : `Comissão ${money(memberPlan?.barberPayoutCents ?? 0)}`}</strong>
              <small>{recordType === "Produto" ? "Nenhum serviço será cobrado. O estoque e a comissão serão atualizados automaticamente." : recordType === "Mensalista" ? viewer.isOwner ? "Desconta um uso do plano. Como o atendimento é do proprietário, o valor permanece na barbearia." : "Desconta um uso e aplica a comissão configurada para o funcionário." : "Comissão e taxa seguem as configurações atuais."}</small>
            </div>
            <RecordProductPicker products={liveData.products} items={recordProducts} setItems={setRecordProducts} standalone={recordType === "Produto"} />
            <button className="primary-button" disabled={isPending || (recordType === "Produto" && !recordProducts.length)}>{isPending ? "Salvando e atualizando..." : recordType === "Produto" ? "Salvar venda de produto" : recordProducts.length ? "Salvar atendimento e produtos" : "Salvar atendimento"}</button>
          </form>
        </div>
        <QuickGuide />
      </section>}
      {activeSection === "Histórico" && <History data={liveData} post={post} pending={isPending} />}
      {activeSection === "Agenda" && <Agenda data={liveData} post={post} pending={isPending} />}
      {viewer.isOwner && activeSection === "Financeiro" && <Finance data={liveData} post={post} pending={isPending} />}
      {activeSection === "Produtos" && <ProductsSection data={liveData} post={post} pending={isPending} />}
      {viewer.isOwner && activeSection === "Mensalistas" && <Club data={liveData} register={registerMember} renew={renew} addClient={openMembershipClientForm} post={post} pending={isPending} />}
      {viewer.isOwner && activeSection === "Configurações" && <Configurations key={helpTarget.revision} initialTab={helpTarget.tab} data={liveData} post={post} pending={isPending} />}
      {viewer.isOwner && activeSection === "Equipe" && <TeamHub data={liveData} post={post} pending={isPending} />}
      {viewer.isOwner && activeSection === "Meu plano" && <PlanPage viewer={viewer} offer={liveData.billingOffer} />}
      {viewer.isPlatformAdmin && activeSection === "Plataforma" && <PlatformAdmin onOfferChange={(offer) => setLiveData((current) => ({ ...current, billingOffer: offer }))} />}
    </>;
  }

  function renderSectionPage(activeSection: string, current: boolean) {
    const title = activeSection;
    return <>
      <header className="topbar"><div><p className="eyebrow">CORTOU ANOTOU · {appMonthLabel(today).toUpperCase()}</p><h1>{activeSection === "Painel" ? `${greeting}, ${firstName}.` : title}</h1><p className="subhead">{subtitle[activeSection]}</p></div>{current && <div className="top-actions">{viewer.isOwner && !mobileViewport && <NotificationCenter notifications={liveData.notifications} onReplace={replaceNotifications} onRead={markNotificationsRead} onNavigate={chooseSection} />}<span className="sync-pill"><i /> dados salvos</span><a className="profile-button" href="/api/auth/logout" title="Sair do Cortou Anotou"><span>{initials(viewer.name)}</span><b>Sair</b></a></div>}</header>
      {current && <div className="mobile-account"><span>{greeting}, {firstName}</span><a href="/api/auth/logout">Sair</a></div>}
      {current && notice && noticeType === "error" && <div className="notice error" role="alert" aria-live="assertive">{notice}</div>}
      <div className="section-stage">{renderSectionBody(activeSection, current)}</div>
    </>;
  }

  if (accessExpired) return <ExpiredAccessScreen data={liveData} />;

  return <main className="app-shell" data-menu-open={mobileMenuOpen || undefined}><aside className="sidebar"><div className="sidebar-brand-row"><button ref={menuButtonRef} className="mobile-menu-button" type="button" aria-label={mobileMenuOpen && !mobileMenuClosing ? "Fechar menu" : "Abrir menu"} aria-expanded={mobileMenuOpen && !mobileMenuClosing} aria-controls="mobile-navigation" onClick={mobileMenuOpen && !mobileMenuClosing ? closeMobileMenu : openMobileMenu}><span aria-hidden="true" /><span aria-hidden="true" /><span aria-hidden="true" /></button><button className="brand-home-button" type="button" aria-label="Voltar ao Painel" title="Voltar ao Painel" onClick={() => chooseSection("Painel")}><BrandLogo /></button>{viewer.isOwner && mobileViewport && <div className="mobile-header-notifications"><NotificationCenter notifications={liveData.notifications} onReplace={replaceNotifications} onRead={markNotificationsRead} onNavigate={chooseSection} /></div>}</div><div className="shop-card"><span className="shop-dot" /><div><strong>{viewer.organizationName}</strong><small>{viewer.isOwner ? `${appMonthLabel(today)} · visão completa` : "Meu espaço de trabalho"}</small></div><span className="chevron">⌄</span></div><nav className="desktop-navigation">{navigation.map((item) => <button key={item.section} onClick={() => setSection(item.section)} className={section === item.section ? "nav-item selected" : "nav-item"}><span><NavIcon name={item.icon} /></span>{item.label}</button>)}</nav><div className="sidebar-bottom"><button className="sidebar-help-button" type="button" onClick={openAssistant}><span><AppIcon name="help" /></span><div><strong>Central de ajuda</strong><small>Dúvidas e suporte</small></div></button><div className="owner"><span className="owner-avatar">{initials(viewer.name)}</span><div><strong>{viewer.name}</strong><small>{viewer.isOwner ? "Administrador" : "Barbeiro"}</small></div></div></div></aside>
    {mobileMenuOpen && <>
      <button className={`mobile-drawer-backdrop${mobileMenuClosing ? " closing" : ""}`} type="button" aria-label="Fechar menu" onClick={closeMobileMenu} />
      <aside ref={menuDrawerRef} className={`mobile-drawer${mobileMenuClosing ? " closing" : ""}`} id="mobile-navigation" aria-label="Menu principal" role="dialog" onTouchStart={startDrawerSwipe} onTouchEnd={finishDrawerSwipe}>
        <div className="mobile-drawer-scroll">
          <div className="mobile-drawer-shop"><span className="drawer-profile-avatar">{initials(viewer.name)}</span><div><strong>{viewer.organizationName}</strong><small>{viewer.name} · {viewer.isOwner ? "Proprietário" : "Barbeiro"}</small></div><i className="drawer-online" aria-label="Conectado" /></div>
          <button className="mobile-drawer-assistant" type="button" onClick={openAssistant}><span><AppIcon name="help" /></span><div><strong>Central de ajuda</strong><small>Tire dúvidas ou fale com o suporte</small></div><i>›</i></button>
          <section className="mobile-menu-group"><p className="mobile-menu-label">OPERAÇÃO</p><nav className="mobile-drawer-nav">{operationNavigation.map((item) => <button key={item.section} onClick={() => chooseSection(item.section)} className={section === item.section ? "selected" : ""}><span><NavIcon name={item.icon} /></span><strong>{item.label}</strong>{viewer.isOwner && item.section === "Histórico" && unreadNotifications > 0 && <b className="drawer-notification-badge">{Math.min(unreadNotifications, 9)}{unreadNotifications > 9 ? "+" : ""}</b>}<i>›</i></button>)}</nav></section>
          {managementNavigation.length > 0 && <section className="mobile-menu-group management"><p className="mobile-menu-label">GESTÃO</p><nav className="mobile-drawer-nav">{managementNavigation.map((item) => <button key={item.section} onClick={() => chooseSection(item.section)} className={section === item.section ? "selected" : ""}><span><NavIcon name={item.icon} /></span><strong>{item.label}</strong><i>›</i></button>)}</nav></section>}
        </div>
        <div className="mobile-drawer-footer"><div className="owner"><span className="owner-avatar">{initials(viewer.name)}</span><div><strong>{viewer.name}</strong><small>{viewer.isOwner ? "Administrador" : "Barbeiro"}</small></div></div><a href="/api/auth/logout">Sair</a></div>
      </aside>
    </>}
    <section className="content"><div ref={swipeViewport} className="swipe-page-viewport" onTouchStart={startSwipe} onTouchMove={moveSwipe} onTouchEnd={finishSwipe} onTouchCancel={cancelSwipe}>
      <div key={`current-${section}`} className="swipe-page swipe-page-current">{renderSectionPage(section, true)}</div>
      {swipePreview && <div key={`preview-${swipePreview.section}`} className={`swipe-page swipe-page-adjacent ${swipePreview.direction}`} aria-hidden="true">{renderSectionPage(swipePreview.section, false)}</div>}
    </div>
    </section><nav className={`mobile-bottom-navigation${secondaryNavigation.length ? " has-more" : ""}`} aria-label="Áreas principais do aplicativo">{preferredBottomItems.map((item) => {
      const active = section === item.section;
      return <button key={item.section} type="button" className={`mobile-bottom-item${active ? " active" : ""}${item.section === "Registrar" ? " primary" : ""}`} aria-current={active ? "page" : undefined} aria-label={`Abrir ${item.label}`} onClick={() => chooseSection(item.section)}><span className="mobile-bottom-icon"><NavIcon name={item.icon} />{item.section === "Histórico" && unreadNotifications > 0 && <b className="mobile-bottom-badge">{Math.min(unreadNotifications, 9)}{unreadNotifications > 9 ? "+" : ""}</b>}</span><strong>{item.label}</strong></button>;
    })}{secondaryNavigation.length > 0 && <button type="button" className={`mobile-bottom-item more${preferredBottomSections.has(section) ? "" : " active"}`} aria-current={preferredBottomSections.has(section) ? undefined : "page"} aria-label="Abrir outras áreas" onClick={openMobileMenu}><span className="mobile-bottom-icon"><NavIcon name="more" /></span><strong>Mais</strong></button>}</nav><HelpAssistant viewer={viewer} data={liveData} post={post} onNavigate={navigateFromHelp} /><AppInstallPrompt isOwner={viewer.isOwner} />{showIntro && <AppLoadingScreen intro />}</main>;
}

function ExpiredAccessScreen({ data }: { data: DashboardData }) {
  const { viewer } = data;
  const expiredAt = viewer.trialEndsAt ? new Date(viewer.trialEndsAt) : null;
  const validExpiredAt = expiredAt && Number.isFinite(expiredAt.getTime()) ? expiredAt : null;

  return <main className="expired-access-shell">
    <header className="expired-access-header"><div className="expired-access-brand"><BrandLogo /></div><a href="/api/auth/logout">Sair</a></header>
    {viewer.isOwner ? <section className="expired-owner-layout">
      <div className="expired-access-intro"><span>ACESSO PAUSADO</span><h1>{viewer.organizationStatus === "trial" ? "Seu teste gratuito terminou." : "O plano da barbearia venceu."}</h1><p>Escolha um período e pague por Pix. Assim que o pagamento for aprovado, o Cortou Anotou abre novamente sozinho.</p><div className="expired-data-note"><b>✓</b><div><strong>Seus dados continuam guardados</strong><small>Clientes, agenda, atendimentos, produtos e financeiro não foram apagados.</small></div></div>{validExpiredAt && <small className="expired-date">Período encerrado em {validExpiredAt.toLocaleDateString("pt-BR")}.</small>}</div>
      <div className="expired-plan-area"><span>ESCOLHA COMO CONTINUAR</span><h2>Renove sem cobrança automática.</h2><p>O plano mensal por Pix continua disponível, junto com as opções de 3, 6 e 12 meses.</p><PlanPaymentOptions offer={data.billingOffer} /><small className="expired-payment-note">Pagamento único por Pix. Nenhum plano renova ou cobra sozinho.</small></div>
    </section> : <section className="expired-staff-card"><span className="expired-staff-icon">◷</span><small>ACESSO TEMPORARIAMENTE PAUSADO</small><h1>O período da barbearia terminou.</h1><p>Peça ao proprietário de <strong>{viewer.organizationName}</strong> para renovar o plano. Seus registros continuam guardados e o acesso volta assim que o Pix for aprovado.</p><a href="/api/auth/logout">Sair e tentar novamente depois</a></section>}
  </main>;
}

function RecordProductPicker({ products, items, setItems, standalone = false }: { products: DashboardData["products"]; items: RecordProductItem[]; setItems: (items: RecordProductItem[]) => void; standalone?: boolean }) {
  const selectedIds = new Set(items.map((item) => item.productId));
  const sellable = products.filter((product) => (product.active && product.stockQuantity > 0) || selectedIds.has(product.id));
  const availableToAdd = products.filter((product) => product.active && product.stockQuantity > 0 && !selectedIds.has(product.id));
  const totalCents = items.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return sum + (product?.priceCents ?? 0) * item.quantity;
  }, 0);
  const commissionCents = items.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.productId);
    return sum + Math.round((product?.priceCents ?? 0) * item.quantity * (product?.commissionRateBps ?? 0) / 10000);
  }, 0);
  function addProduct() {
    const product = availableToAdd[0];
    if (!product) return;
    const nextKey = items.reduce((highest, item) => Math.max(highest, item.key), 0) + 1;
    setItems([...items, { key: nextKey, productId: product.id, quantity: 1 }]);
  }
  function updateItem(key: number, values: Partial<RecordProductItem>) {
    setItems(items.map((item) => item.key === key ? { ...item, ...values } : item));
  }
  return <section className="record-products">
    <div className="record-products-head"><div><strong>{standalone ? "Produtos desta venda" : "Produtos vendidos neste atendimento"}</strong><small>{standalone ? "Escolha um ou mais itens; nenhum serviço será incluído" : "Adicione, altere a quantidade ou remova somente o produto"}</small></div><button type="button" onClick={addProduct} disabled={!availableToAdd.length}>+ Adicionar</button></div>
    {!items.length && <p className="record-products-empty">{availableToAdd.length ? standalone ? "Toque em Adicionar para escolher o produto vendido." : "Nenhum produto nesta venda. Toque em Adicionar para incluir." : "Nenhum produto disponível no estoque."}</p>}
    {items.map((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      const returnedStock = item.originalProductId === item.productId ? item.originalQuantity ?? 0 : 0;
      const availableQuantity = Math.max(1, (product?.stockQuantity ?? 0) + returnedStock);
      return <div className="record-product-row" key={item.key}><select value={item.productId} onChange={(event) => updateItem(item.key, { productId: Number(event.target.value), quantity: 1 })}>{sellable.map((candidate) => <option value={candidate.id} key={candidate.id} disabled={candidate.id !== item.productId && items.some((selected) => selected.productId === candidate.id)}>{candidate.name} · {candidate.stockQuantity + (candidate.id === item.originalProductId ? item.originalQuantity ?? 0 : 0)} disponíveis</option>)}</select><input aria-label={`Quantidade de ${product?.name ?? "produto"}`} type="number" min="1" max={availableQuantity} value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: Math.max(1, Number(event.target.value) || 1) })} /><button type="button" aria-label={`Remover somente ${product?.name ?? "produto"}`} title="Remover somente este produto" onClick={() => setItems(items.filter((candidate) => candidate.key !== item.key))}>×</button></div>;
    })}
    {!!items.length && <div className="record-products-total"><span>Produtos <b>{money(totalCents)}</b></span><span>Comissão da venda <b>{money(commissionCents)}</b></span></div>}
  </section>;
}

function Overview({ data: baseData, go, planAutoOpen, post, pending }: { data: DashboardData; go: (section: string) => void; planAutoOpen: boolean; post: Post; pending: boolean }) {
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [showAllPayouts, setShowAllPayouts] = useState(false);
  const data = usePeriodDashboardData(baseData, start, end);
  const records = data.records.filter((item) => inRange(item.occurredAt, start, end));
  const expenseList = data.expenses.filter((item) => inRange(item.occurredAt, start, end));
  const membershipRecords = records.filter((item) => item.recordType === "Mensalista");
  const membershipPaymentList = data.membershipPayments.filter((payment) => inRange(payment.occurredAt, start, end));
  const activeMembership = activeMembershipTotals(data.clients, membershipPaymentList, membershipRecords);
  const membershipRevenueCents = membershipPaymentList.reduce((sum, payment) => sum + payment.amountCents, 0);
  const serviceRevenueCents = records.reduce((sum, item) => sum + item.valueCents + item.tipCents, 0);
  const productSales = data.productSales.filter((item) => inRange(item.occurredAt, start, end));
  const productRevenueCents = productSales.reduce((sum, item) => sum + item.revenueCents, 0);
  const productCostCents = productSales.reduce((sum, item) => sum + item.unitCostCents * item.quantity, 0);
  const productCommissionCents = productSales.reduce((sum, item) => sum + item.commissionCents, 0);
  const feeCents = records.reduce((sum, item) => sum + item.feeCents, 0) + productSales.reduce((sum, item) => sum + item.feeCents, 0) + membershipPaymentList.reduce((sum, payment) => sum + payment.feeCents, 0);
  const commissionCents = records.reduce((sum, item) => sum + barberPayoutCents(item), 0) + productCommissionCents;
  const expenseCents = expenseList.reduce((sum, item) => sum + item.valueCents, 0);
  const revenueCents = membershipRevenueCents + serviceRevenueCents + productRevenueCents;
  const netProfitCents = revenueCents - feeCents - commissionCents - expenseCents - productCostCents;
  const progress = pct(revenueCents, data.goal.revenueCents);
  const teamRanking = data.team.map((member) => {
    const items = records.filter((record) => record.barberId === member.id);
    const sales = productSales.filter((sale) => sale.sellerTeamMemberId === member.id);
    return { name: member.name, count: items.reduce((sum, item) => sum + item.quantity, 0), sales: sales.length, commissionCents: items.reduce((sum, item) => sum + barberPayoutCents(item), 0) + sales.reduce((sum, sale) => sum + sale.commissionCents, 0) };
  }).filter((item) => item.count > 0 || item.sales > 0).sort((a, b) => b.commissionCents - a.commissionCents);
  const payoutFor = (memberId: number) => records.filter((item) => item.barberId === memberId).reduce((sum, item) => sum + barberPayoutCents(item), 0) + productSales.filter((item) => item.sellerTeamMemberId === memberId).reduce((sum, item) => sum + item.commissionCents, 0);
  const owner = data.team.find((member) => member.id === data.viewer.teamMemberId);
  const ownerName = owner?.name?.trim() || data.viewer.name.trim() || "Proprietário";
  const ownerRecords = records.filter((item) => item.barberId === data.viewer.teamMemberId);
  const ownerAttendanceCount = ownerRecords.reduce((sum, item) => sum + item.quantity, 0);
  const ownerWorkedDays = new Set(ownerRecords.map((item) => item.occurredAt)).size;
  const teamPayoutCards = data.team
    .filter((member) => member.id !== data.viewer.teamMemberId && member.active)
    .map((member) => ({ label: `PAGAR ${member.name.toUpperCase()}`, value: money(payoutFor(member.id)) }));
  const visibleTeamPayoutCards = showAllPayouts ? teamPayoutCards : teamPayoutCards.slice(0, 2);
  const hiddenPayoutCards = Math.max(0, teamPayoutCards.length - visibleTeamPayoutCards.length);
  const summaryCards = [
    ...visibleTeamPayoutCards,
    { label: `COMISSÃO ${ownerName.toUpperCase()}`, value: money(payoutFor(data.viewer.teamMemberId)) },
    { label: "SOBRA MENSALISTAS", value: money(activeMembership.revenueCents - activeMembership.payoutCents) },
  ];
  return <>
    {data.viewer.isOwner && data.viewer.trialEndsAt && <TrialStatus viewer={data.viewer} offer={data.billingOffer} autoOpen={planAutoOpen} />}
    {data.viewer.organizationStatus === "trial" && !data.records.length && <NewShopWelcome data={data} go={go} />}
    <DateFilter start={start} end={end} setStart={setStart} setEnd={setEnd} />
    <section className="stat-grid six"><Stat label={`Atendimentos ${ownerName}`} value={String(ownerAttendanceCount)} note={`${ownerWorkedDays} ${ownerWorkedDays === 1 ? "dia trabalhado" : "dias trabalhados"}`} tone="blue" icon={<AppIcon name="scissors" />} /><Stat label="Faturamento total" value={shortMoney(revenueCents)} note={`${progress}% da meta`} tone="gold" icon={<AppIcon name="trend" />} /><Stat label="Lucro líquido" value={shortMoney(netProfitCents)} note="Depois de todos os custos" tone="green" icon={<AppIcon name="money" />} /><Stat label="Mensalistas ativos" value={money(activeMembership.revenueCents)} note={`${data.stats.active} ${data.stats.active === 1 ? "mensalista ativo" : "mensalistas ativos"}`} tone="purple" icon={<AppIcon name="members" />} /><Stat label="Despesas" value={money(expenseCents)} note={`${money(feeCents)} em taxas`} tone="rose" icon={<AppIcon name="trend" className="icon-down" />} /><Stat label="Agendados hoje" value={String(data.appointments.filter((item) => item.appointmentDate === today && isOpenAppointment(item.status)).length)} note="Horários confirmados" tone="cyan" icon={<AppIcon name="calendar" />} /></section>
    <section className="club-summary dynamic-summary">{summaryCards.map((item) => <article key={item.label}><small>{item.label}</small><strong>{item.value}</strong></article>)}</section>
    {teamPayoutCards.length > 2 && <div className="summary-expand"><button type="button" aria-expanded={showAllPayouts} onClick={() => setShowAllPayouts((current) => !current)}>{showAllPayouts ? "Ver menos comissões" : `Ver mais comissões (+${hiddenPayoutCards})`}</button></div>}
    <OwnerPayoutEditor data={data} post={post} pending={pending} />
      <section className="dashboard-grid"><div className="panel quick-panel" data-tour="quick-actions"><SectionTitle title="Ações rápidas" copy="O que você quer fazer agora?" /><div className="quick-actions"><button onClick={() => go("Registrar")}><b>+</b><span><strong>Novo atendimento</strong><small>Avulso ou mensalista</small></span></button><button onClick={() => go("Agenda")}><b><AppIcon name="calendar" /></b><span><strong>Agendar horário</strong><small>Organizar a agenda</small></span></button><button onClick={() => go("Produtos")}><b><AppIcon name="box" /></b><span><strong>Vender produto</strong><small>Baixar do estoque</small></span></button><button onClick={() => go("Financeiro")}><b><AppIcon name="money" /></b><span><strong>Nova despesa</strong><small>Lançar uma saída</small></span></button><button onClick={() => go("Configurações")}><b><AppIcon name="settings" /></b><span><strong>Editar cadastros</strong><small>Clientes, preços e regras</small></span></button></div></div><div className="panel goal-card"><SectionTitle title="Meta do mês" copy={`${money(revenueCents)} de ${money(data.goal.revenueCents)}`} /><Progress value={progress} /><div className="goal-footer"><span><small>Falta</small><strong>{money(Math.max(0, data.goal.revenueCents - revenueCents))}</strong></span><span><small>Progresso</small><strong>{progress}%</strong></span></div><button className="text-button" onClick={() => go("Financeiro")}>Abrir no Financeiro →</button></div><div className="panel today-panel"><SectionTitle title="Agenda de hoje" copy="Próximos horários" /><div className="schedule-list">{data.appointments.filter((item) => item.appointmentDate === today && isOpenAppointment(item.status)).slice(0, 4).map((item) => <div className="schedule" key={item.id}><time>{item.appointmentTime}</time><i /><div><strong>{item.clientName}</strong><small>{item.serviceName} · {item.barberName}</small></div></div>)}{!data.appointments.some((item) => item.appointmentDate === today && isOpenAppointment(item.status)) && <Empty text="Nenhum horário para hoje." />}</div></div><div className="panel ranking-panel"><SectionTitle title="Equipe no período" copy="Atendimentos, vendas e comissões" /><div className="ranking-list">{teamRanking.map((item, index) => <div className="ranking" key={item.name}><span>{index + 1}</span><div className="avatar">{initials(item.name)}</div><div><strong>{item.name}</strong><small>{item.count} atendimentos · {item.sales} vendas</small></div><b>{money(item.commissionCents)}</b></div>)}{!teamRanking.length && <Empty text="Nenhum atendimento ou venda no período." />}</div></div></section>
  </>;
}

function trialPlanDetails(viewer: DashboardData["viewer"]) {
  const isTrial = viewer.organizationStatus === "trial";
  const trialEnd = viewer.trialEndsAt ? new Date(viewer.trialEndsAt) : null;
  const validEnd = trialEnd && Number.isFinite(trialEnd.getTime()) ? trialEnd : null;
  const trialDaysLeft = validEnd ? Math.max(0, Math.ceil((validEnd.getTime() - Date.now()) / 86400000)) : null;
  const ending = trialDaysLeft === 0;
  const urgent = trialDaysLeft !== null && trialDaysLeft > 0 && trialDaysLeft <= 3;
  const remainingLabel = trialDaysLeft === null
    ? isTrial ? "Período gratuito ativo" : "Plano ativo"
    : ending
      ? isTrial ? "Teste encerrado" : "Plano vencido"
      : `${trialDaysLeft} ${trialDaysLeft === 1 ? "dia restante" : "dias restantes"}`;
  return { validEnd, trialDaysLeft, ending, urgent, remainingLabel, isTrial };
}

function PlanPaymentOptions({ offer }: { offer: DashboardData["billingOffer"] }) {
  const [payment, setPayment] = useState<PixPayment | null>(null);
  const [pixPendingPlan, setPixPendingPlan] = useState<string | null>(null);
  const [pixError, setPixError] = useState<string | null>(null);

  async function createPix(planCode: string) {
    if (pixPendingPlan) return;
    setPixError(null);
    setPixPendingPlan(planCode);
    try {
      const response = await fetch("/api/payments/pix", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planCode }),
      });
      const payload = await response.json() as { payment?: PixPayment; error?: string; configurationRequired?: boolean; fallbackUrl?: string };
      if (!response.ok || !payload.payment) {
        if (payload.configurationRequired && payload.fallbackUrl) {
          window.location.assign(payload.fallbackUrl);
          return;
        }
        throw new Error(payload.error ?? "Não foi possível gerar o Pix.");
      }
      setPayment(payload.payment);
    } catch (error) {
      setPixError(error instanceof Error ? error.message : "Não foi possível gerar o Pix.");
    } finally {
      setPixPendingPlan(null);
    }
  }

  return <>
    <div className="plan-payment-options">
      {offer.pixPlans.map((plan) => {
        const discount = plan.discountBps / 100;
        const effectiveMonthly = Math.round(plan.priceCents / plan.months);
        const pending = pixPendingPlan === plan.code;
        return <button className={`plan-payment-card pix plan-${plan.code}`} type="button" onClick={() => createPix(plan.code)} disabled={Boolean(pixPendingPlan)} key={plan.code}>
          {plan.code === "quarterly" && <span className="plan-recommended">MAIS ESCOLHIDO</span>}
          {plan.code === "annual" && <span className="plan-recommended best-saving">MAIOR ECONOMIA</span>}
          <div className="plan-payment-icon">◇</div><strong>{plan.label}</strong>
          <b>{money(plan.priceCents)}<small>/{plan.periodDays} dias</small></b>
          <p>{discount ? `${discount}% de desconto · equivale a ${money(effectiveMonthly)} por mês.` : "Um mês de acesso, sem renovação automática."}</p>
          <em>{pending ? "Gerando Pix seguro..." : "Pagar este plano por Pix"} <i aria-hidden="true">→</i></em>
        </button>;
      })}
    </div>
    {pixError && <p className="pix-payment-error" role="alert">{pixError}</p>}
    {payment && <PixPaymentDialog initialPayment={payment} close={() => setPayment(null)} />}
  </>;
}

function PixPaymentDialog({ initialPayment, close }: { initialPayment: PixPayment; close: () => void }) {
  const [payment, setPayment] = useState(initialPayment);
  const [copied, setCopied] = useState(false);
  const approved = payment.status === "approved";
  const failed = ["rejected", "cancelled", "refunded", "charged_back", "expired", "error"].includes(payment.status);

  useEffect(() => {
    if (approved) {
      const redirect = window.setTimeout(() => window.location.assign("/?payment=approved"), 1800);
      return () => window.clearTimeout(redirect);
    }
    if (failed) return;
    let stopped = false;
    let timer: number | null = null;
    const check = async () => {
      try {
        const response = await fetch(`/api/payments/pix?orderId=${payment.id}`, { cache: "no-store" });
        const payload = await response.json() as { payment?: PixPayment };
        if (!stopped && response.ok && payload.payment) setPayment(payload.payment);
      } finally {
        if (!stopped) timer = window.setTimeout(check, 3500);
      }
    };
    timer = window.setTimeout(check, 2500);
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [approved, failed, payment.id]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [close]);

  async function copyCode() {
    if (!payment.qrCode) return;
    try {
      await navigator.clipboard.writeText(payment.qrCode);
    } catch {
      const field = document.createElement("textarea");
      field.value = payment.qrCode;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return createPortal(<div className="pix-payment-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !approved) close(); }}>
    <section className={`pix-payment-dialog${approved ? " approved" : ""}`} role="dialog" aria-modal="true" aria-labelledby="pix-payment-title">
      {!approved && <button type="button" className="pix-payment-close" aria-label="Fechar cobrança Pix" onClick={close}>×</button>}
      {approved ? <div className="pix-payment-success">
        <span aria-hidden="true">✓</span><strong id="pix-payment-title">Pagamento aprovado!</strong><p>Mais {payment.periodDays} dias foram liberados. Atualizando o aplicativo...</p>
      </div> : <>
        <span className="pix-payment-kicker">PIX SEGURO · QUALQUER BANCO</span>
        <h2 id="pix-payment-title">Pague {money(payment.amountCents)} pelo Pix</h2>
        <p>Leia o QR Code com outro celular ou copie o código para pagar pelo aplicativo do seu banco.</p>
        {!failed && <div className="pix-payment-wait"><i aria-hidden="true" /><span><strong>Aguardando pagamento</strong><small>A confirmação aparece automaticamente nesta tela.</small></span></div>}
        {payment.qrCodeBase64 && !failed && <div className="pix-payment-qr"><img src={`data:image/png;base64,${payment.qrCodeBase64}`} alt={`QR Code Pix de ${money(payment.amountCents)}`} /></div>}
        {payment.qrCode && !failed && <div className="pix-copy-box"><span>PIX COPIA E COLA</span><code>{payment.qrCode}</code><button type="button" onClick={copyCode}>{copied ? "Código copiado ✓" : "Copiar código Pix"}</button></div>}
        {payment.expiresAt && !failed && <small className="pix-payment-expiration">Este código vence às {new Date(payment.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.</small>}
        {failed && <div className="pix-payment-failed"><strong>Este Pix não está mais disponível.</strong><p>Feche esta tela e gere um novo código para tentar novamente.</p><button type="button" onClick={close}>Gerar outro Pix</button></div>}
      </>}
    </section>
  </div>, document.body);
}

function TrialStatus({ viewer, offer, autoOpen }: { viewer: DashboardData["viewer"]; offer: DashboardData["billingOffer"]; autoOpen: boolean }) {
  const { validEnd, ending, urgent, remainingLabel, isTrial } = trialPlanDetails(viewer);
  const [planOpen, setPlanOpen] = useState(false);

  useEffect(() => {
    if (!autoOpen || !ending) return;
    const storageKey = `cortou-anotou:plano-vencido:${viewer.email}`;
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
    const frame = window.requestAnimationFrame(() => setPlanOpen(true));
    return () => window.cancelAnimationFrame(frame);
  }, [autoOpen, ending, viewer.email]);

  useEffect(() => {
    if (!planOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setPlanOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [planOpen]);

  return <>
    <button type="button" className={`trial-plan-trigger${urgent ? " urgent" : ""}${ending ? " ending" : ""}`} aria-expanded={planOpen} aria-controls="trial-plan-dialog" onClick={() => setPlanOpen(true)}>
      <span className="trial-trigger-icon" aria-hidden="true">{ending ? "!" : isTrial ? "◷" : "✓"}</span><span className="trial-trigger-copy"><strong>{ending ? (isTrial ? "Teste encerrado" : "Plano vencido") : isTrial ? `Teste grátis · ${remainingLabel}` : `Plano ativo · ${remainingLabel}`}</strong><small>{ending ? "Toque para regularizar o acesso" : validEnd ? `Acesso liberado até ${validEnd.toLocaleDateString("pt-BR")}` : "Consulte os detalhes do seu plano"}</small></span><span className="trial-trigger-link">{ending ? "Regularizar" : isTrial ? "Ver plano" : "Renovar"} <i aria-hidden="true">›</i></span>
    </button>
    {planOpen && createPortal(<div className="trial-plan-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPlanOpen(false); }}>
      <section className="trial-plan-dialog" id="trial-plan-dialog" role="dialog" aria-modal="true" aria-labelledby="trial-plan-title">
        <button type="button" className="trial-plan-close" aria-label="Fechar opções do plano" onClick={() => setPlanOpen(false)}>×</button>
        <span className="trial-plan-kicker">MEU PLANO</span><h2 id="trial-plan-title">{ending ? "Continue usando o Cortou Anotou" : isTrial ? "Gostou? Você já pode continuar." : "Renove quando quiser."}</h2><p>{ending ? "Escolha por quanto tempo deseja continuar e pague pelo Pix." : isTrial ? `Seu teste segue liberado${validEnd ? ` até ${validEnd.toLocaleDateString("pt-BR")}` : ""}. Se preferir, você já pode escolher um plano.` : `Seu acesso está liberado${validEnd ? ` até ${validEnd.toLocaleDateString("pt-BR")}` : ""}. O novo período é somado ao acesso atual.`}</p>
        <div className={`trial-plan-summary${ending ? " ending" : ""}`}><span>{ending ? "PERÍODO ENCERRADO" : isTrial ? "TESTE GRATUITO" : "PLANO ATIVO"}</span><strong>{remainingLabel}</strong>{validEnd && <small>Data final: {validEnd.toLocaleDateString("pt-BR")}</small>}</div>
        <PlanPaymentOptions offer={offer} />
        {!ending && <button type="button" className="continue-trial-button" onClick={() => setPlanOpen(false)}>{isTrial ? "Continuar usando o teste gratuito" : "Voltar ao aplicativo"}</button>}
      </section>
    </div>, document.body)}
  </>;
}

function PlanPage({ viewer, offer }: { viewer: DashboardData["viewer"]; offer: DashboardData["billingOffer"] }) {
  const { validEnd, ending, remainingLabel, isTrial } = trialPlanDetails(viewer);
  return <section className="plan-page-layout"><div className="panel plan-page-card"><span className="trial-plan-kicker">PLANO DA BARBEARIA</span><h2>{ending ? (isTrial ? "Seu teste terminou" : "Seu plano venceu") : isTrial ? "Teste gratuito em andamento" : "Plano ativo"}</h2><p>{ending ? "Escolha por quanto tempo deseja continuar usando o Cortou Anotou." : isTrial ? `Você pode testar tudo até ${validEnd ? validEnd.toLocaleDateString("pt-BR") : "o fim do período gratuito"} e contratar quando quiser.` : `Seu acesso está liberado${validEnd ? ` até ${validEnd.toLocaleDateString("pt-BR")}` : ""}.`}</p><div className={`trial-plan-summary${ending ? " ending" : ""}`}><span>{ending ? "PERÍODO ENCERRADO" : "SITUAÇÃO ATUAL"}</span><strong>{remainingLabel}</strong>{validEnd && <small>Data final: {validEnd.toLocaleDateString("pt-BR")}</small>}</div><PlanPaymentOptions offer={offer} /></div><aside className="panel plan-explanation"><span>SIMPLES E SEM SURPRESA</span><h2>Você escolhe o período.</h2><div><b>◇</b><p><strong>Somente Pix</strong><small>Pague por qualquer banco, sem precisar ter conta no Mercado Pago.</small></p></div><div><b>%</b><p><strong>Mais tempo, mais desconto</strong><small>Planos de 3, 6 e 12 meses custam menos por mês.</small></p></div><small className="plan-owner-note">Não há renovação automática. Somente o proprietário vê esta área.</small></aside></section>;
}

function NewShopWelcome({ data, go }: { data: DashboardData; go: (section: string) => void }) {
  return <section className="new-shop-welcome">
    <div><span>PRIMEIROS PASSOS</span><h2>{data.viewer.organizationName} já tem um espaço exclusivo.</h2><p>Os dados começam vazios e ficam separados das outras barbearias. Ajuste os valores sugeridos e faça o primeiro teste.</p></div>
    <div className="new-shop-welcome-actions"><button onClick={() => go("Configurações")}><b>1</b><span><strong>Ajustar serviços</strong><small>Preços e pagamentos</small></span></button><button onClick={() => go("Equipe")}><b>2</b><span><strong>Convidar a equipe</strong><small>Cada um com seu acesso</small></span></button><button onClick={() => go("Registrar")}><b>3</b><span><strong>Registrar um teste</strong><small>Simule o primeiro cliente</small></span></button></div>
  </section>;
}

function StaffOverview({ data: baseData, go }: { data: DashboardData; go: (section: string) => void }) {
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const data = usePeriodDashboardData(baseData, start, end);
  const records = data.records.filter((item) => inRange(item.occurredAt, start, end));
  const appointmentsToday = data.appointments.filter((item) => item.appointmentDate === today && isOpenAppointment(item.status));
  const attendanceCount = records.reduce((sum, item) => sum + item.quantity, 0);
  const revenueCents = records.reduce((sum, item) => sum + item.valueCents + item.tipCents, 0);
  const productSales = data.productSales.filter((item) => inRange(item.occurredAt, start, end));
  const earningsCents = records.reduce((sum, item) => sum + barberPayoutCents(item), 0) + productSales.reduce((sum, item) => sum + item.commissionCents, 0);
  return <>
    <DateFilter start={start} end={end} setStart={setStart} setEnd={setEnd} />
    <section className="stat-grid staff-stats"><Stat label="Meus atendimentos" value={String(attendanceCount)} note={`${new Set(records.map((item) => item.occurredAt)).size} dias trabalhados`} tone="blue" icon={<AppIcon name="scissors" />} /><Stat label="Meu faturamento" value={money(revenueCents)} note="Serviços feitos por mim" tone="gold" icon={<AppIcon name="trend" />} /><Stat label="Minhas comissões" value={money(earningsCents)} note="Atendimentos + produtos" tone="green" icon={<AppIcon name="money" />} /><Stat label="Minha agenda hoje" value={String(appointmentsToday.length)} note="Horários confirmados" tone="cyan" icon={<AppIcon name="calendar" />} /></section>
    <section className="dashboard-grid"><div className="panel quick-panel" data-tour="quick-actions"><SectionTitle title="Ações rápidas" copy="Seu trabalho, sem informações dos outros profissionais." /><div className="quick-actions staff-actions"><button onClick={() => go("Registrar")}><b>+</b><span><strong>Novo atendimento</strong><small>Registrar na hora</small></span></button><button onClick={() => go("Agenda")}><b><AppIcon name="calendar" /></b><span><strong>Minha agenda</strong><small>Agendar ou remarcar</small></span></button><button onClick={() => go("Produtos")}><b><AppIcon name="box" /></b><span><strong>Vender produto</strong><small>Registrar e baixar estoque</small></span></button><button onClick={() => go("Histórico")}><b><AppIcon name="scissors" /></b><span><strong>Meu histórico</strong><small>Ver datas e comissões</small></span></button></div></div><div className="panel today-panel"><SectionTitle title="Meus horários de hoje" copy="Somente a sua agenda" /><div className="schedule-list">{appointmentsToday.slice(0, 5).map((item) => <div className="schedule" key={item.id}><time>{item.appointmentTime}</time><i /><div><strong>{item.clientName}</strong><small>{item.serviceName}</small></div></div>)}{!appointmentsToday.length && <Empty text="Nenhum horário para hoje." />}</div></div><div className="panel ranking-panel"><SectionTitle title="Atendimentos recentes" copy="Somente os seus registros" /><div className="ranking-list">{records.slice(0, 5).map((item) => <div className="ranking" key={item.id}><span>{date(item.occurredAt)}</span><div className="avatar">{initials(item.clientName)}</div><div><strong>{item.clientName}</strong><small>{item.serviceName}{item.tipCents > 0 ? ` · gorjeta ${money(item.tipCents)}` : ""}</small></div><b>{money(barberPayoutCents(item))}</b></div>)}{!records.length && <Empty text="Nenhum atendimento no período." />}</div></div></section>
  </>;
}

function History({ data: baseData, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const data = usePeriodDashboardData(baseData, start, end);
  const [barberFilter, setBarberFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(10);
  const [exporting, setExporting] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingProducts, setEditingProducts] = useState<RecordProductItem[]>([]);
  const [completingAppointmentId, setCompletingAppointmentId] = useState<number | null>(null);
  const editorRef = useEditorAutoScroll<HTMLElement>(editingId);
  const item = data.records.find((record) => record.id === editingId);
  const completingAppointment = data.appointments.find((appointment) => appointment.id === completingAppointmentId);
  const editingProductCatalog = [...data.products, ...editingProducts.filter((productItem) => !data.products.some((product) => product.id === productItem.productId)).map((productItem) => {
    const sale = data.productSales.find((candidate) => candidate.id === productItem.saleId || candidate.productId === productItem.productId);
    return { id: productItem.productId, name: sale?.productName ?? "Produto excluído", category: "Excluído", costCents: sale?.unitCostCents ?? 0, priceCents: sale?.unitPriceCents ?? 0, commissionRateBps: sale?.commissionRateBps ?? 0, stockQuantity: 0, lowStockThreshold: 0, active: false };
  })];
  const recordEntries = data.records
    .filter((record) => inRange(record.occurredAt, start, end) && (!data.viewer.isOwner || barberFilter === "all" || record.barberId === Number(barberFilter)))
    .map((record) => ({ kind: "record" as const, occurredAt: record.occurredAt, sortId: record.id, record, sales: data.productSales.filter((sale) => sale.dailyRecordId === record.id) }));
  const productSaleEntries = data.productSales
    .filter((sale) => inRange(sale.occurredAt, start, end) && (!data.viewer.isOwner || barberFilter === "all" || sale.sellerTeamMemberId === Number(barberFilter)))
    .map((sale) => ({ kind: "sale" as const, occurredAt: sale.occurredAt, sortId: sale.id, sale }));
  const completedAppointmentEntries = data.appointments
    .filter((appointment) => appointment.status === "Concluído" && inRange(appointment.appointmentDate, start, end) && (!data.viewer.isOwner || barberFilter === "all" || appointment.barberId === Number(barberFilter)))
    .map((appointment) => ({ kind: "appointment" as const, occurredAt: appointment.appointmentDate, sortId: appointment.id, appointment }));
  const entries = [...recordEntries, ...productSaleEntries, ...completedAppointmentEntries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.sortId - a.sortId);
  const visibleEntries = entries.slice(0, visibleCount);
  const paymentTotals = entries.reduce((totals, entry) => {
    if (entry.kind === "appointment") return totals;
    const paymentName = entry.kind === "sale" ? entry.sale.paymentName : entry.record.paymentName;
    const normalizedPayment = paymentName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const amount = entry.kind === "sale"
      ? entry.sale.revenueCents
      : entry.record.valueCents + entry.record.tipCents;
    const category = normalizedPayment.includes("pix") ? "pix"
      : normalizedPayment.includes("debito") ? "debit"
        : normalizedPayment.includes("credito") ? "credit"
          : normalizedPayment.includes("dinheiro") ? "cash"
            : "other";
    totals[category] += amount;
    totals.total += amount;
    return totals;
  }, { cash: 0, pix: 0, debit: 0, credit: 0, other: 0, total: 0 });
  const payoutTotalCents = entries.reduce((total, entry) => {
    if (entry.kind === "appointment") return total;
    if (entry.kind === "sale") return total + entry.sale.commissionCents;
    return total + barberPayoutCents(entry.record);
  }, 0);
  const paymentSummary = [
    { key: "cash", label: "Dinheiro", value: paymentTotals.cash, icon: "$" },
    { key: "pix", label: "Pix", value: paymentTotals.pix, icon: "◆" },
    { key: "debit", label: "Débito", value: paymentTotals.debit, icon: "D" },
    { key: "credit", label: "Crédito", value: paymentTotals.credit, icon: "C" },
    { key: "total", label: "Total geral", value: paymentTotals.total, icon: "=", payoutCents: payoutTotalCents },
  ];
  const exportProfessional = data.viewer.isOwner
    ? barberFilter === "all"
      ? "Todos os profissionais"
      : data.team.find((member) => member.id === Number(barberFilter))?.name ?? "Profissional selecionado"
    : data.viewer.name;
  async function exportHistory() {
    if (!entries.length || exporting) return;
    setExporting(true);
    setExportFeedback(null);
    try {
      const workbookRows: HistoryWorkbookRow[] = entries.map((entry) => {
        if (entry.kind === "appointment") return {
          occurredAt: entry.appointment.appointmentDate, time: entry.appointment.appointmentTime, kind: "appointment", type: "Agendamento",
          clientName: entry.appointment.clientName, professionalName: entry.appointment.barberName, description: entry.appointment.serviceName,
          quantity: 1, paymentLabel: "Horário concluído", paymentGroupName: "", serviceCents: 0, tipCents: 0, productCents: 0,
          totalCents: 0, payoutCents: 0, detail: `${entry.appointment.durationMinutes} min · concluído`,
        };
        if (entry.kind === "sale") return {
          occurredAt: entry.sale.occurredAt, time: "", kind: "product", type: "Produto", clientName: entry.sale.clientName,
          professionalName: entry.sale.sellerName, description: entry.sale.productName, quantity: entry.sale.quantity,
          paymentLabel: entry.sale.paymentName, paymentGroupName: entry.sale.paymentName, serviceCents: 0, tipCents: 0,
          productCents: entry.sale.revenueCents, totalCents: entry.sale.revenueCents, payoutCents: entry.sale.commissionCents,
          detail: entry.sale.dailyRecordId ? "Venda com atendimento" : "Venda avulsa",
        };
        return {
          occurredAt: entry.record.occurredAt, time: "", kind: "attendance", type: entry.record.recordType,
          clientName: entry.record.clientName, professionalName: entry.record.barberName, description: entry.record.serviceName,
          quantity: entry.record.quantity, paymentLabel: entry.record.recordType === "Mensalista" ? "Incluído no plano" : entry.record.paymentName,
          paymentGroupName: entry.record.paymentName, serviceCents: entry.record.valueCents, tipCents: entry.record.tipCents,
          productCents: 0, totalCents: entry.record.valueCents + entry.record.tipCents,
          payoutCents: barberPayoutCents(entry.record), detail: entry.record.origin,
        };
      });
      const { buildHistoryWorkbook } = await import("../../lib/history-xlsx");
      const workbook = buildHistoryWorkbook({
        organizationName: data.viewer.organizationName,
        periodStart: start,
        periodEnd: end,
        professionalLabel: exportProfessional,
        professionalOrder: data.team.map((member) => member.name),
        rows: workbookRows,
      });
      const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      const fileName = `cortou-anotou-${start}-a-${end}-${fileNamePart(exportProfessional)}.xlsx`;
      const blob = new Blob([workbook], { type: mime });
      const download = () => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      };
      const delivery = await deliverGeneratedFile({
        userAgent: navigator.userAgent,
        createFile: () => new File([blob], fileName, { type: mime }),
        canShare: (file) => typeof navigator.share === "function" && Boolean(navigator.canShare?.({ files: [file] })),
        share: (file) => navigator.share({ files: [file], title: "Histórico · Cortou Anotou", text: `${data.viewer.organizationName} · ${date(start)} a ${date(end)}` }),
        download,
      });
      if (delivery === "cancelled") return;
      const guideCount = new Set(workbookRows.map((row) => row.professionalName)).size + 1;
      setExportFeedback(delivery === "downloaded"
        ? `Planilha baixada com sucesso em ${guideCount} ${guideCount === 1 ? "guia" : "guias"}. Abra pela pasta Downloads.`
        : `Arquivo Excel organizado em ${guideCount} ${guideCount === 1 ? "guia" : "guias"}.`);
    } catch {
      setExportFeedback("Não foi possível gerar a planilha. Tente novamente.");
    } finally {
      setExporting(false);
    }
  }
  function startEditing(recordId: number) {
    const linkedSales = data.productSales.filter((sale) => sale.dailyRecordId === recordId);
    setEditingProducts(linkedSales.map((sale) => ({
      key: sale.id,
      saleId: sale.id,
      productId: sale.productId,
      quantity: sale.quantity,
      originalProductId: sale.productId,
      originalQuantity: sale.quantity,
    })));
    setEditingId(recordId);
  }
  function closeEditing() {
    setEditingId(null);
    setEditingProducts([]);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!item) return; const form = new FormData(event.currentTarget);
    const productItems = editingProducts.map(({ saleId, productId, quantity }) => ({ saleId, productId, quantity }));
    const ok = await post({ action: "update-daily-record", id: item.id, occurredAt: String(form.get("occurredAt")), clientName: String(form.get("clientName") ?? item.clientName), membershipClientId: Number(form.get("membershipClientId") ?? item.membershipClientId ?? 0), barberId: Number(form.get("barberId")), serviceId: Number(form.get("serviceId") ?? item.serviceId), paymentMethodId: Number(form.get("paymentMethodId")), origin: String(form.get("origin") ?? item.origin), tipCents: Math.round(Number(form.get("tip") ?? 0) * 100), productItems: JSON.stringify(productItems) }, "Atendimento e produtos atualizados. Estoque e comissões recalculados.");
    if (ok) closeEditing();
  }
  async function removeRecord(id: number, hasProducts: boolean) {
    const message = hasProducts ? "Excluir este atendimento e as vendas de produtos vinculadas? Os produtos voltarão ao estoque." : "Excluir este atendimento? Os cálculos serão atualizados.";
    if (window.confirm(message)) await post({ action: "delete-daily-record", id }, hasProducts ? "Atendimento e produtos excluídos. Estoque restaurado." : "Atendimento excluído e cálculos atualizados.");
  }
  async function removeProductSale(id: number) {
    if (window.confirm("Excluir esta venda de produto? A unidade voltará ao estoque.")) await post({ action: "delete-product-sale", id }, "Venda excluída e estoque restaurado.");
  }
  async function removeCompletedAppointment(id: number) {
    if (window.confirm("Excluir definitivamente este horário concluído do histórico?")) await post({ action: "delete-appointment", id }, "Horário concluído excluído do histórico.");
  }
  return <>
    <DateFilter start={start} end={end} setStart={(value) => { setStart(value); setExportFeedback(null); }} setEnd={(value) => { setEnd(value); setExportFeedback(null); }} />
    {completingAppointment && <AppointmentCompletionPanel data={data} appointment={completingAppointment} post={post} pending={pending} onClose={() => setCompletingAppointmentId(null)} />}
    {item && <section className="panel edit-panel editor-scroll-target is-editing" ref={editorRef} tabIndex={-1}>
      <SectionTitle title="Editar atendimento e produtos" copy="Altere o serviço ou gerencie os produtos vendidos sem apagar o atendimento inteiro." />
      <form className="app-form" onSubmit={submit} key={item.id}>
        <div className="field-grid">
          <Field label="Data"><input name="occurredAt" type="date" defaultValue={item.occurredAt} required /></Field>
          {item.recordType === "Mensalista"
            ? <Field label="Mensalista"><select name="membershipClientId" defaultValue={item.membershipClientId ?? undefined}>{item.membershipClientId && !data.clients.some((client) => client.id === item.membershipClientId) && <option value={item.membershipClientId}>{item.clientName} · excluído</option>}{data.clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></Field>
            : <Field label="Cliente"><input name="clientName" defaultValue={item.clientName} required /></Field>}
          <Field label="Barbeiro"><select name="barberId" defaultValue={item.barberId}>{data.team.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></Field>
          {item.recordType === "Avulso" && <Field label="Serviço"><select name="serviceId" defaultValue={item.serviceId}>{!data.services.some((service) => service.id === item.serviceId) && <option value={item.serviceId}>{item.serviceName} · excluído</option>}{data.services.map((service) => <option value={service.id} key={service.id}>{service.name}</option>)}</select></Field>}
          {(item.recordType !== "Mensalista" || editingProducts.length > 0) && <Field label={item.recordType === "Mensalista" ? "Pagamento dos produtos" : "Pagamento"}><select name="paymentMethodId" defaultValue={item.paymentMethodId} required>{data.paymentMethods.map((payment) => <option value={payment.id} key={payment.id}>{payment.name}</option>)}</select></Field>}
          {item.recordType === "Avulso" && <Field label="Origem"><select name="origin" defaultValue={item.origin}><option>Retorno</option><option>Novo</option><option>Indicação</option></select></Field>}
          <Field label="Gorjeta (R$)"><input name="tip" type="number" min="0" max="10000" step="0.01" defaultValue={item.tipCents / 100} /></Field>
        </div>
        <RecordProductPicker products={editingProductCatalog} items={editingProducts} setItems={setEditingProducts} />
        <div className="form-actions"><button className="primary-button" disabled={pending}>{pending ? "Salvando e recalculando..." : "Salvar atendimento e produtos"}</button><button type="button" className="cancel-button" onClick={closeEditing}>Cancelar</button></div>
      </form>
    </section>}
    <section className="panel"><SectionTitle title="Histórico completo" copy={`${entries.length} lançamentos no período · atendimentos, produtos e horários concluídos`} />{data.viewer.isOwner && <div className="history-barber-filter"><label><span>FILTRAR POR BARBEIRO</span><select value={barberFilter} onChange={(event) => { setBarberFilter(event.target.value); setVisibleCount(10); setExportFeedback(null); }}><option value="all">Todos os profissionais</option>{data.team.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></label><small>Inclui os cortes, produtos e horários concluídos de cada profissional</small></div>}<div className="history-export-bar"><div><strong>Planilha organizada em guias</strong><small>{exportProfessional} · {date(start)} a {date(end)}. Gera Resumo + uma guia para cada barbeiro.</small>{exportFeedback && <span role="status">{exportFeedback}</span>}</div><button type="button" onClick={exportHistory} disabled={!entries.length || exporting}><b>⇩</b>{exporting ? "Gerando Excel..." : "Exportar Excel"}</button></div><div className="history-payment-summary" aria-label="Resumo por forma de pagamento">{paymentSummary.map((payment) => <article className={payment.key === "total" ? "history-payment-card total" : "history-payment-card"} key={payment.key}><span>{payment.icon}</span><div><small>{payment.label}</small><strong>{money(payment.value)}</strong>{payment.payoutCents !== undefined && <small className="history-total-payout">Comissão: <b>{money(payment.payoutCents)}</b></small>}</div></article>)}</div>{paymentTotals.other > 0 && <p className="history-other-payments">O total geral inclui {money(paymentTotals.other)} em outras formas de pagamento cadastradas.</p>}<div className="table-wrap"><table><thead><tr><th>TIPO</th><th>DATA</th><th>CLIENTE</th><th>BARBEIRO</th><th>SERVIÇO / PRODUTO</th><th>PAGAMENTO</th><th>VALOR TOTAL</th><th>COMISSÃO TOTAL</th><th>AÇÕES</th></tr></thead><tbody>{visibleEntries.map((entry) => {
      if (entry.kind === "appointment") return <tr key={`appointment-${entry.appointment.id}`}><td><span className="tag appointment-history-tag">Agendamento</span></td><td><strong>{date(entry.appointment.appointmentDate)}</strong><small className="history-appointment-time">{entry.appointment.appointmentTime}</small></td><td><strong>{entry.appointment.clientName}</strong></td><td>{entry.appointment.barberName}</td><td><div className="history-service"><strong>{entry.appointment.paymentChoice === "Mensalista" ? "Mensalista" : entry.appointment.serviceName}</strong><small>{entry.appointment.paymentChoice === "Mensalista" ? "Uso do plano ainda não lançado" : "Atendimento ainda não foi lançado"}</small></div></td><td><span className="status pendente">Pendente</span></td><td><span className="history-not-charged">—</span></td><td><span className="history-not-charged">—</span></td><td><div className="icon-actions"><button title="Concluir e registrar atendimento" aria-label="Concluir e registrar atendimento" onClick={() => setCompletingAppointmentId(entry.appointment.id)}><AppIcon name="check" /></button><button className="danger" title="Excluir agendamento" aria-label="Excluir agendamento" onClick={() => removeCompletedAppointment(entry.appointment.id)}><AppIcon name="trash" /></button></div></td></tr>;
      if (entry.kind === "sale") return <tr key={`sale-${entry.sale.id}`}><td><span className="tag product-tag">Produto</span></td><td>{date(entry.sale.occurredAt)}</td><td><strong>{entry.sale.clientName}</strong></td><td>{entry.sale.sellerName}</td><td><div className="history-service"><strong>{entry.sale.productName}</strong><small>{entry.sale.quantity} {entry.sale.quantity === 1 ? "unidade" : "unidades"} · {entry.sale.dailyRecordId ? "venda com atendimento" : "venda avulsa"}</small></div></td><td>{entry.sale.paymentName}</td><td><strong>{money(entry.sale.revenueCents)}</strong></td><td><strong className="history-payout">{money(entry.sale.commissionCents)}</strong></td><td>{data.viewer.isOwner ? <div className="icon-actions"><button className="danger" title="Excluir venda de produto" aria-label="Excluir venda de produto" onClick={() => removeProductSale(entry.sale.id)}><AppIcon name="trash" /></button></div> : <span className="history-locked">—</span>}</td></tr>;
      const paymentLabel = entry.record.recordType === "Mensalista" ? "Incluído no plano" : entry.record.paymentName;
      return <tr key={`record-${entry.record.id}`}><td><span className={entry.record.recordType === "Mensalista" ? "tag member" : "tag"}>{entry.record.recordType}</span></td><td>{date(entry.record.occurredAt)}</td><td><strong>{entry.record.clientName}</strong></td><td>{entry.record.barberName}</td><td><div className="history-service"><strong>{entry.record.serviceName}</strong>{entry.record.tipCents > 0 && <small className="history-product">+ gorjeta integral {money(entry.record.tipCents)}</small>}{entry.sales.length > 0 && <small className="history-product">{entry.sales.length} {entry.sales.length === 1 ? "venda de produto listada" : "vendas de produtos listadas"} separadamente</small>}</div></td><td>{paymentLabel}</td><td><strong>{money(entry.record.valueCents + entry.record.tipCents)}</strong></td><td><strong className={entry.record.tipCents > 0 ? "history-payout" : ""}>{money(barberPayoutCents(entry.record))}</strong></td><td><div className="icon-actions"><button title="Editar atendimento e produtos" aria-label="Editar atendimento e produtos" onClick={() => startEditing(entry.record.id)}><AppIcon name="edit" /></button><button className="danger" title="Excluir atendimento" aria-label="Excluir atendimento" onClick={() => removeRecord(entry.record.id, entry.sales.length > 0)}><AppIcon name="trash" /></button></div></td></tr>;
    })}</tbody></table></div>{!entries.length && <Empty text="Nenhum atendimento ou venda para este barbeiro no período." />}{entries.length > visibleCount && <div className="history-more"><small>Mostrando {visibleEntries.length} de {entries.length}</small><button type="button" onClick={() => setVisibleCount((count) => count + 10)}>Ver mais</button></div>}</section>
  </>;
}

function Agenda({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const editorRef = useEditorAutoScroll<HTMLDivElement>(editingId);
  const editing = data.appointments.find((item) => item.id === editingId);
  const completingAppointment = data.appointments.find((item) => item.id === completingId);
  const activeAppointments = data.appointments.filter((item) => item.status !== "Concluído" && item.status !== "Atendido");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); const ok = await post({ action: "appointment", id: editingId ?? 0, appointmentDate: String(fields.get("appointmentDate")), appointmentTime: String(fields.get("appointmentTime")), clientName: String(fields.get("clientName")), phone: String(fields.get("phone")), serviceId: Number(fields.get("serviceId")), barberId: Number(fields.get("barberId")), notes: String(fields.get("notes")) }, editing ? "Agendamento remarcado e atualizado na hora." : "Horário incluído na agenda."); if (ok) { setEditingId(null); form.reset(); } }
  async function cancel(id: number) { if (window.confirm("Cancelar este agendamento? Ele continuará no histórico como cancelado.")) { const ok = await post({ action: "cancel-appointment", id }, "Agendamento cancelado e mantido no histórico."); if (ok && editingId === id) setEditingId(null); } }
  async function confirm(appointment: Appointment) {
    await post(
      { action: "confirm-appointment", id: appointment.id },
      whatsappPhone(appointment.phone)
        ? "Agendamento confirmado. Agora você pode avisar o cliente pelo WhatsApp."
        : "Agendamento confirmado. Cadastre o telefone do cliente para avisá-lo pelo WhatsApp.",
    );
  }
  async function sendReminder(appointment: Appointment) {
    const whatsappUrl = whatsappReminderUrl(appointment, data.viewer.organizationName);
    if (!whatsappUrl) {
      window.alert("Cadastre um telefone válido para enviar o lembrete.");
      return;
    }
    if (appointment.reminderSentAt && !window.confirm(`${reminderSentLabel(appointment.reminderSentAt)}. Deseja abrir o WhatsApp novamente?`)) return;
    const saved = await post(
      { action: "mark-appointment-reminder", id: appointment.id },
      appointment.reminderSentAt ? "WhatsApp aberto para reenviar o lembrete." : "WhatsApp aberto com o lembrete pronto.",
    );
    if (saved) openWhatsApp(whatsappUrl);
  }
  async function remove(id: number) { if (window.confirm("Apagar este agendamento definitivamente? Esta ação não poderá ser desfeita.")) { const ok = await post({ action: "delete-appointment", id }, "Agendamento apagado definitivamente."); if (ok && editingId === id) setEditingId(null); } }
  return <>{completingAppointment && <AppointmentCompletionPanel data={data} appointment={completingAppointment} post={post} pending={pending} onClose={() => setCompletingId(null)} />}<section className="form-layout">
    <div className="panel">
      <SectionTitle title="Agenda de horários" copy={data.agendaSettings.useServiceDuration ? "Agenda inteligente ativa: duração e sobreposição são verificadas automaticamente." : "Agenda simples ativa: apenas horários exatamente iguais são bloqueados."} />
      <div className={data.agendaSettings.useServiceDuration ? "agenda-mode-note active" : "agenda-mode-note"}>
        <span>{data.agendaSettings.useServiceDuration ? "✓" : "○"}</span>
        <div>
          <strong>{data.agendaSettings.useServiceDuration ? "Duração inteligente ligada" : "Duração inteligente desligada"}</strong>
          <small>{data.agendaSettings.useServiceDuration ? `Expediente de ${data.agendaSettings.openingTime} até ${data.agendaSettings.closingTime}` : "Os registros avulsos continuam funcionando normalmente"}</small>
        </div>
      </div>
      <div className="appointment-list">
        {activeAppointments.map((item) => <article className={item.status === "Cancelado" ? "appointment canceled" : item.status === "Aguardando" ? "appointment awaiting" : "appointment"} key={item.id}>
          <time>{item.appointmentTime}<small>{date(item.appointmentDate)}</small></time>
          <div className="avatar">{initials(item.clientName)}</div>
          <div className="appointment-info"><strong>{item.clientName}</strong><p>{item.paymentChoice === "Mensalista" ? "Mensalista" : item.serviceName} com {item.barberName}</p><small>{item.phone}{item.notes ? ` · ${item.notes}` : ""}</small><small>{item.paymentChoice === "Mensalista" ? "Uso do plano mensal · conferir cadastro" : `Pagamento escolhido: ${item.paymentChoice}`}</small>{item.reminderSentAt && <small className="appointment-reminder-status">✓ {reminderSentLabel(item.reminderSentAt)}</small>}</div>
          <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>
          <div className="appointment-actions">
            {data.viewer.isOwner && item.status === "Aguardando" && <button className="confirm whatsapp-confirm" disabled={pending} title="Confirmar este horário" onClick={() => confirm(item)}>Confirmar horário</button>}
            {item.status === "Agendado" && whatsappPhone(item.phone) && <a className="whatsapp-message" href={whatsappConfirmationUrl(item, data.viewer.organizationName)} target="_blank" rel="noreferrer"><AppIcon name="whatsapp" /> Avisar no WhatsApp</a>}
            {item.status === "Agendado" && whatsappPhone(item.phone) && <button className={item.reminderSentAt ? "reminder sent" : "reminder"} disabled={pending} title={item.reminderSentAt ? reminderSentLabel(item.reminderSentAt) : "Abrir lembrete no WhatsApp"} onClick={() => sendReminder(item)}>{item.reminderSentAt ? "Reenviar lembrete" : "Enviar lembrete"}</button>}
            {item.status === "Agendado" && <button className="complete-appointment" disabled={pending} onClick={() => setCompletingId(item.id)}>Concluir atendimento</button>}
            <button onClick={() => setEditingId(item.id)}>{item.status === "Cancelado" ? "Remarcar" : "Editar"}</button>
            {item.status !== "Cancelado" && <button className="danger" onClick={() => cancel(item.id)}>Cancelar</button>}
            <button className="trash" title="Apagar agendamento" aria-label={`Apagar agendamento de ${item.clientName}`} onClick={() => remove(item.id)}><AppIcon name="trash" /></button>
          </div>
        </article>)}
        {!activeAppointments.length && <Empty text="Nenhum horário agendado. Os horários encerrados ficam no Histórico." />}
      </div>
    </div>
    <div className={`panel form-card compact editor-scroll-target${editing ? " is-editing" : ""}`} ref={editorRef} tabIndex={-1}>
      <SectionTitle title={editing ? "Editar ou remarcar" : "Novo horário"} copy={editing ? "Altere os dados e salve. Um cancelado volta como agendado." : "Adicione um cliente à agenda."} />
      <form className="app-form" onSubmit={submit} key={editing?.id ?? "new-appointment"}>
        <Field label="Data"><input name="appointmentDate" type="date" defaultValue={editing?.appointmentDate ?? today} required /></Field>
        <Field label="Horário"><input name="appointmentTime" type="time" step="60" defaultValue={editing?.appointmentTime ?? ""} required /></Field>
        <Field label="Cliente"><input name="clientName" placeholder="Nome" defaultValue={editing?.clientName ?? ""} required /></Field>
        <Field label="Telefone"><input name="phone" placeholder="(41) 99999-9999" defaultValue={editing?.phone ?? ""} /></Field>
        <Field label="Serviço"><select name="serviceId" defaultValue={editing?.serviceId ?? data.services[0]?.id}>{editing && !data.services.some((item) => item.id === editing.serviceId) && <option value={editing.serviceId}>{editing.serviceName} · excluído</option>}{data.services.filter((item) => item.active || item.id === editing?.serviceId).map((item) => <option value={item.id} key={item.id}>{item.name}{data.agendaSettings.useServiceDuration ? ` · ${item.durationMinutes} min` : ""}</option>)}</select></Field>
        <Field label="Barbeiro"><select name="barberId" defaultValue={editing?.barberId ?? data.team[0]?.id}>{data.team.filter((item) => item.active || item.id === editing?.barberId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Observações"><textarea name="notes" placeholder="Opcional" defaultValue={editing?.notes ?? ""} /></Field>
        <button className="primary-button" disabled={pending}>{pending ? "Verificando horário..." : editing ? "Salvar alterações" : "Agendar horário"}</button>
        {editing && <button type="button" className="cancel-button" onClick={() => setEditingId(null)}>Fechar edição</button>}
      </form>
    </div>
  </section></>;
}

function AppointmentCompletionPanel({ data, appointment, post, pending, onClose }: { data: DashboardData; appointment: Appointment; post: Post; pending: boolean; onClose: () => void }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const ok = await post({ action: "complete-appointment", id: appointment.id, occurredAt: String(form.get("occurredAt")), paymentMethodId: Number(form.get("paymentMethodId")), membershipClientId: Number(form.get("membershipClientId") ?? 0), tipCents: Math.round(Number(form.get("tip") ?? 0) * 100) }, `${appointment.clientName}: atendimento concluído e lançado no financeiro.`);
    if (ok) onClose();
  }
  return <section className="panel edit-panel appointment-completion-panel">
    <SectionTitle title="Concluir atendimento" copy="Confira o pagamento. O serviço e o barbeiro já vieram do agendamento." />
    <form className="app-form" onSubmit={submit}>
      <div className="appointment-completion-summary"><strong>{appointment.clientName}</strong><span>{appointment.paymentChoice === "Mensalista" ? "Mensalista" : appointment.serviceName} · {appointment.barberName}</span><small>{date(appointment.appointmentDate)} às {appointment.appointmentTime}{appointment.paymentChoice === "Mensalista" ? " · Conferir e usar o plano" : ""}</small></div>
      <div className="field-grid"><Field label="Data do atendimento"><input name="occurredAt" type="date" defaultValue={appointment.appointmentDate} required /></Field>{appointment.paymentChoice === "Mensalista" && <Field label="Cadastro do mensalista"><select name="membershipClientId" defaultValue={data.clients.find((client) => client.status === "Ativo" && client.name.toLocaleLowerCase("pt-BR") === appointment.clientName.toLocaleLowerCase("pt-BR"))?.id ?? ""} required><option value="">Escolha o cliente</option>{data.clients.filter((client) => client.status === "Ativo").map((client) => <option value={client.id} key={client.id}>{client.name} · {client.remaining} {client.remaining === 1 ? "uso restante" : "usos restantes"}</option>)}</select></Field>}{appointment.paymentChoice === "Mensalista" ? <input type="hidden" name="paymentMethodId" value={data.paymentMethods[0]?.id ?? 0} /> : <Field label="Pagamento"><select name="paymentMethodId" defaultValue={data.paymentMethods.find((payment) => payment.name.toLowerCase().includes(appointment.paymentChoice.toLowerCase()))?.id ?? data.paymentMethods[0]?.id}>{data.paymentMethods.map((payment) => <option value={payment.id} key={payment.id}>{payment.name}</option>)}</select></Field>}<Field label="Gorjeta (R$)"><input name="tip" type="number" min="0" max="10000" step="0.01" defaultValue="0" /></Field></div>
      <div className="form-actions"><button className="primary-button" disabled={pending}>{pending ? "Salvando..." : "Salvar atendimento"}</button><button type="button" className="cancel-button" onClick={onClose}>Cancelar</button></div>
    </form>
  </section>;
}

function Finance({ data: baseData, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const [start, setStart] = useState(monthStart);
  const [end, setEnd] = useState(today);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const data = usePeriodDashboardData(baseData, start, end);
  const [editingId, setEditingId] = useState<number | null>(null);
  const editorRef = useEditorAutoScroll<HTMLDivElement>(editingId);
  const editing = data.expenses.find((item) => item.id === editingId);
  const expenses = data.expenses.filter((item) => inRange(item.occurredAt, start, end));
  const records = data.records.filter((item) => inRange(item.occurredAt, start, end));
  const productSales = data.productSales.filter((item) => inRange(item.occurredAt, start, end));
  const membershipPaymentList = data.membershipPayments.filter((payment) => inRange(payment.occurredAt, start, end));
  const serviceRevenueCents = records.reduce((sum, item) => sum + item.valueCents + item.tipCents, 0);
  const membershipRevenueCents = membershipPaymentList.reduce((sum, payment) => sum + payment.amountCents, 0);
  const productRevenueCents = productSales.reduce((sum, item) => sum + item.revenueCents, 0);
  const productCostCents = productSales.reduce((sum, item) => sum + item.unitCostCents * item.quantity, 0);
  const automaticCosts = records.reduce((sum, item) => sum + item.feeCents + barberPayoutCents(item), 0) + productSales.reduce((sum, item) => sum + item.feeCents + item.commissionCents, 0) + membershipPaymentList.reduce((sum, payment) => sum + payment.feeCents, 0);
  const expenseCents = expenses.reduce((sum, item) => sum + item.valueCents, 0);
  const netProfitCents = serviceRevenueCents + membershipRevenueCents + productRevenueCents - productCostCents - automaticCosts - expenseCents;
  const currentGoalProgress = pct(baseData.stats.revenueCents, baseData.goal.revenueCents);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const ok = await post({ action: "expense", id: editingId ?? 0, occurredAt: String(form.get("occurredAt")), type: String(form.get("type")), description: String(form.get("description")), valueCents: Math.round(Number(form.get("value")) * 100), paid: form.get("paid") === "on" }, editingId ? "Despesa atualizada." : "Despesa registrada no financeiro."); if (ok) setEditingId(null); }
  async function remove(id: number) { if (window.confirm("Excluir esta despesa? O financeiro será recalculado.")) await post({ action: "delete-expense", id }, "Despesa excluída e financeiro atualizado."); }
  return <>
    <DateFilter start={start} end={end} setStart={setStart} setEnd={setEnd} />
    <section className="stat-grid finance-stats"><Stat label="Receita avulsa" value={money(serviceRevenueCents)} note="Serviços + gorjetas" tone="gold" icon={<AppIcon name="trend" />} /><Stat label="Mensalidades recebidas" value={money(membershipRevenueCents)} note="Histórico financeiro do período" tone="blue" icon={<AppIcon name="members" />} /><Stat label="Venda de produtos" value={money(productRevenueCents)} note={`${money(productCostCents)} em custo dos produtos`} tone="cyan" icon={<AppIcon name="box" />} /><Stat label="Taxas e comissões" value={money(automaticCosts)} note="Custos automáticos" tone="purple" icon="%" /><Stat label="Total de despesas" value={money(expenseCents)} note={`${expenses.length} ${expenses.length === 1 ? "lançamento" : "lançamentos"} no período`} tone="rose" icon={<AppIcon name="trend" className="icon-down" />} /><Stat className="finance-profit" label="Lucro líquido" value={money(netProfitCents)} note="Valor que realmente sobrou no período" tone="green" icon={<AppIcon name="money" />} /></section>
    <section className={`panel finance-goals-panel${goalsOpen ? " open" : ""}`}>
      <button type="button" className="finance-goals-toggle" onClick={() => setGoalsOpen((value) => !value)} aria-expanded={goalsOpen}>
        <span className="finance-goals-icon" aria-hidden="true">◎</span>
        <span className="finance-goals-copy"><small>METAS DE {appMonthLabel(today).toUpperCase()}</small><strong>Acompanhar e editar metas</strong><span>{money(baseData.stats.revenueCents)} de {money(baseData.goal.revenueCents)} no faturamento</span><span className="finance-goals-progress"><i style={{ width: `${currentGoalProgress}%` }} /></span></span>
        <span className="finance-goals-percent">{currentGoalProgress}%</span>
        <b>{goalsOpen ? "Fechar" : "Ver e editar"}<i aria-hidden="true">{goalsOpen ? "↑" : "↓"}</i></b>
      </button>
      {goalsOpen && <div className="finance-goals-content"><Goals data={baseData} /><GoalSettings data={baseData} post={post} pending={pending} /></div>}
    </section>
    <section className="form-layout"><div className="panel"><SectionTitle title="Despesas do período" copy={`${expenses.length} ${expenses.length === 1 ? "lançamento" : "lançamentos"} · ${money(expenseCents)}`} /><div className="expense-list">{expenses.map((item) => <div className="expense" key={item.id}><span className={item.type === "Fixa" ? "expense-icon fixed" : "expense-icon"}><AppIcon name="trend" /></span><div><strong>{item.description}</strong><small>{date(item.occurredAt)} · {item.type}</small></div><b>{money(item.valueCents)}</b><span className={item.paid ? "paid" : "unpaid"}>{item.paid ? "Pago" : "Pendente"}</span><div className="icon-actions"><button title="Editar despesa" aria-label="Editar despesa" onClick={() => setEditingId(item.id)}><AppIcon name="edit" /></button><button className="danger" title="Excluir despesa" aria-label="Excluir despesa" onClick={() => remove(item.id)}><AppIcon name="trash" /></button></div></div>)}{!expenses.length && <Empty text="Nenhuma despesa neste período." />}</div></div><div className={`panel form-card compact editor-scroll-target${editing ? " is-editing" : ""}`} ref={editorRef} tabIndex={-1}><SectionTitle title={editing ? "Editar despesa" : "Nova despesa"} copy={editing ? "Altere e salve o lançamento." : "Registre uma saída de caixa."} /><form className="app-form" onSubmit={submit} key={editing?.id ?? "new-expense"}><Field label="Data"><input name="occurredAt" type="date" defaultValue={editing?.occurredAt ?? today} required /></Field><Field label="Tipo"><select name="type" defaultValue={editing?.type ?? "Variável"}><option>Variável</option><option>Fixa</option></select></Field><Field label="Descrição"><input name="description" placeholder="Ex.: produtos" defaultValue={editing?.description ?? ""} required /></Field><Field label="Valor (R$)"><input name="value" type="number" min="0.01" step="0.01" defaultValue={editing ? editing.valueCents / 100 : undefined} required /></Field><label className="check"><input name="paid" type="checkbox" defaultChecked={editing?.paid ?? true} /> Já foi pago</label><button className="primary-button" disabled={pending}>{editing ? "Salvar alterações" : "Salvar despesa"}</button>{editing && <button type="button" className="cancel-button" onClick={() => setEditingId(null)}>Cancelar edição</button>}</form></div></section>
  </>;
}

function Goals({ data }: { data: DashboardData }) { const items = [{ label: "Faturamento", value: data.stats.revenueCents, target: data.goal.revenueCents, format: money }, { label: "Lucro bruto", value: data.stats.grossProfitCents, target: data.goal.grossProfitCents, format: money }, { label: "Lucro líquido", value: data.stats.netProfitCents, target: data.goal.netProfitCents, format: money }, { label: "Atendimentos", value: data.stats.visitsThisMonth, target: data.goal.attendanceTarget, format: (v: number) => String(v) }]; return <section className="goal-grid">{items.map((item) => { const progress = pct(item.value, item.target); return <article className="panel goal-detail" key={item.label}><div className="goal-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><span>{progress}%</span></div><div><p>{item.label}</p><h2>{item.format(item.value)}</h2><small>Meta: {item.format(item.target)}</small><Progress value={progress} /><b>Falta {item.format(Math.max(0, item.target - item.value))}</b></div></article>; })}</section>; }

function Club({ data: baseData, register, renew, addClient, post, pending }: { data: DashboardData; register: (id: number) => void; renew: (id: number) => void; addClient: () => void; post: Post; pending: boolean }) {
  const [selectedMonth, setSelectedMonth] = useState(appMonth());
  const [clientSearch, setClientSearch] = useState("");
  const selectedPeriod = appMonthPeriod(selectedMonth, today);
  const data = usePeriodDashboardData(baseData, selectedPeriod.start, selectedPeriod.end);
  const monthLabel = appMonthLabel(`${selectedMonth}-01`);
  const membershipPayments = data.membershipPayments.filter((payment) => payment.paidMonth === selectedMonth);
  const membershipRecords = data.records.filter((item) => item.recordType === "Mensalista" && item.occurredAt.startsWith(selectedMonth));
  const monthTotals = membershipMonthTotals(membershipPayments, membershipRecords);
  const paymentByClient = new Map(membershipPayments.map((payment) => [payment.clientId, payment]));
  const usageByClient = new Map<number, number>();
  membershipRecords.forEach((record) => {
    if (record.membershipClientId === null) return;
    usageByClient.set(record.membershipClientId, (usageByClient.get(record.membershipClientId) ?? 0) + record.quantity);
  });
  const currentClientIds = new Set(data.clients.map((client) => client.id));
  const currentRows = data.clients
    .filter((client) => client.paidMonth === selectedMonth || paymentByClient.has(client.id))
    .map((client) => {
      const payment = paymentByClient.get(client.id);
      const usedThisMonth = usageByClient.get(client.id) ?? 0;
      const isCurrentReference = client.paidMonth === selectedMonth;
      const renewalDays = isCurrentReference ? appDaysUntil(client.dueDate, today) : null;
      return {
        key: `client-${client.id}`,
        id: client.id,
        paymentId: payment?.id ?? null,
        name: payment?.clientName ?? client.name,
        phone: client.phone,
        plan: payment?.planName ?? client.plan,
        monthlyValueCents: payment?.amountCents ?? client.monthlyValueCents,
        paymentName: payment?.paymentName ?? client.paymentName,
        paidMonth: selectedMonth,
        usedThisMonth,
        maxBalance: client.maxBalance,
        remaining: Math.max(0, client.maxBalance - usedThisMonth),
        overLimit: usedThisMonth > client.maxBalance,
        dueDate: isCurrentReference ? client.dueDate : "",
        renewalAlert: renewalDays !== null && renewalDays <= 3,
        renewalNote: renewalDays === null ? "" : renewalDays < 0 ? `Vencido há ${Math.abs(renewalDays)} ${Math.abs(renewalDays) === 1 ? "dia" : "dias"}` : renewalDays === 0 ? "Vence hoje" : renewalDays <= 3 ? `Vence em ${renewalDays} ${renewalDays === 1 ? "dia" : "dias"}` : "",
        status: isCurrentReference ? client.status : "Arquivado",
        canManage: isCurrentReference,
      };
    });
  const archivedRows = membershipPayments
    .filter((payment) => !currentClientIds.has(payment.clientId))
    .map((payment) => {
      const usedThisMonth = usageByClient.get(payment.clientId) ?? 0;
      const maxBalance = data.plans.find((plan) => plan.name === payment.planName)?.maxUses ?? usedThisMonth;
      return {
        key: `payment-${payment.id}`,
        id: payment.clientId,
        paymentId: payment.id,
        name: payment.clientName,
        phone: "",
        plan: payment.planName,
        monthlyValueCents: payment.amountCents,
        paymentName: payment.paymentName,
        paidMonth: payment.paidMonth,
        usedThisMonth,
        maxBalance,
        remaining: Math.max(0, maxBalance - usedThisMonth),
        overLimit: usedThisMonth > maxBalance,
        dueDate: "",
        renewalAlert: false,
        renewalNote: "",
        status: "Arquivado",
        canManage: false,
      };
    });
  const monthRows = [...currentRows, ...archivedRows].sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  const normalizedSearch = clientSearch.trim().toLocaleLowerCase("pt-BR");
  const list = monthRows.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
  async function removeClient(id: number, name: string) {
    if (!window.confirm(`Excluir o mensalista ${name}? Ele sairá da lista, mas os atendimentos antigos continuarão no histórico.`)) return;
    await post({ action: "delete-client", id }, "Mensalista excluído. O histórico foi preservado.");
  }
  async function removeMonthEntry(id: number, name: string, paidMonth: string) {
    const referenceLabel = appMonthLabel(`${paidMonth}-01`);
    if (!window.confirm(`Excluir ${name} de ${referenceLabel}? A mensalidade e a receita deste mês serão removidas. Os atendimentos continuarão no Histórico.`)) return;
    await post({ action: "delete-membership-payment", id }, `${name} foi removido de ${referenceLabel}.`);
  }
  return <>
    <section className="panel date-filter membership-month-filter">
      <div><strong>Qual mês você quer consultar?</strong><small>Escolha o mês da mensalidade. Depois, pesquise pelo nome.</small></div>
      <label><span>MÊS DE REFERÊNCIA</span><input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value || appMonth())} /></label>
      <div className="date-shortcuts"><button type="button" onClick={() => setSelectedMonth(shiftAppMonth(selectedMonth, -1))}>‹ Anterior</button><button type="button" onClick={() => setSelectedMonth(appMonth())}>Mês atual</button><button type="button" onClick={() => setSelectedMonth(shiftAppMonth(selectedMonth, 1))}>Próximo ›</button></div>
    </section>
    <div className="section-action">
      <button type="button" className="primary-button membership-add-button" onClick={addClient}>
        <span aria-hidden="true">＋</span> Adicionar mensalista
      </button>
    </div>
    <section className="club-summary"><article><small>RECEITA DE {monthLabel.toUpperCase()}</small><strong>{money(monthTotals.revenueCents)}</strong></article><article><small>USOS NO MÊS</small><strong>{monthTotals.uses}</strong></article><article><small>COMISSÕES DA EQUIPE</small><strong>{money(monthTotals.payoutCents)}</strong></article><article><small>SALDO DA BARBEARIA</small><strong>{money(monthTotals.revenueCents - monthTotals.payoutCents)}</strong></article></section><section className="panel"><SectionTitle title={`Mensalistas de ${monthLabel}`} copy={`${monthRows.length} ${monthRows.length === 1 ? "cadastro" : "cadastros"} no mês`} /><label className="membership-search"><span>BUSCAR NESTE MÊS</span><input type="search" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Digite o nome do mensalista" /></label><div className="table-wrap"><table><thead><tr><th>CLIENTE</th><th>PLANO</th><th>PAGAMENTO DA MENSALIDADE</th><th>USOS</th><th>RESTANTES</th><th>VENCIMENTO</th><th>STATUS</th><th /></tr></thead><tbody>{list.map((client) => <tr key={client.key} className={client.overLimit ? "over-limit" : ""}><td><div className="person"><span className="avatar">{initials(client.name)}</span><div><strong>{client.name}</strong><small>{client.phone || (client.status === "Arquivado" ? "Registro deste mês" : "Telefone não cadastrado")}</small></div></div></td><td>{client.plan}<small className="block">{money(client.monthlyValueCents)}/mês</small></td><td><strong>{client.paymentName}</strong><small className="block">Mensalidade de {client.paidMonth.split("-").reverse().join("/")}</small></td><td><strong>{client.usedThisMonth}/{client.maxBalance}</strong>{client.overLimit && <small className="limit-warning">Limite ultrapassado</small>}</td><td><strong>{client.remaining}</strong></td><td>{client.dueDate ? date(client.dueDate) : "—"}{client.renewalNote && <small className="membership-due-note">{client.renewalNote}</small>}</td><td><span className={`status ${client.status.toLowerCase()}`}>{client.status}</span></td><td>{client.canManage ? <div className="row-actions"><button disabled={pending || client.status !== "Ativo"} onClick={() => register(client.id)}>Registrar uso</button><button className={`membership-renew-button${client.renewalAlert ? " alert" : ""}`} disabled={pending} onClick={() => renew(client.id)}>{client.renewalAlert ? "Renovar agora" : "Renovar"}</button><button className="trash" disabled={pending} onClick={() => void removeClient(client.id, client.name)} aria-label={`Excluir ${client.name}`}><AppIcon name="trash" /></button></div> : client.paymentId ? <button className="membership-month-delete" disabled={pending} onClick={() => void (client.paymentId !== null && removeMonthEntry(client.paymentId, client.name, client.paidMonth))}>Excluir deste mês</button> : null}</td></tr>)}{!list.length && <tr><td colSpan={8}><Empty text={normalizedSearch ? `Nenhum mensalista com esse nome em ${monthLabel}.` : `Nenhum mensalista encontrado em ${monthLabel}.`} /></td></tr>}</tbody></table></div></section>
  </>;
}

type InviteItem = { id: number; teamMemberId: number | null; invitedName: string; role: string; accessRole: string; expiresAt: string; createdAt: string; status: string };
type ManagedUser = { id: number; name: string; role: string; email: string | null; accessRole: string; active: boolean; hasPassword: boolean; isCurrentUser: boolean };
type AccessPayload = { invites?: InviteItem[]; users?: ManagedUser[]; inviteUrl?: string; error?: string };

function UserInvites() {
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [inviteUrl, setInviteUrl] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function applyPayload(payload: AccessPayload) {
    if (payload.invites) setInvites(payload.invites);
    if (payload.users) setUsers(payload.users);
    if (payload.inviteUrl) setInviteUrl(payload.inviteUrl);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/invites").then(async (response) => ({ response, payload: await response.json() as AccessPayload })).then(({ response, payload }) => {
      if (!active) return;
      if (!response.ok) setFeedback(payload.error ?? "Não foi possível carregar os usuários.");
      else applyPayload(payload);
    }).catch(() => { if (active) setFeedback("Não foi possível carregar os usuários."); });
    return () => { active = false; };
  }, []);

  async function action(body: Record<string, string | number | boolean>) {
    setPending(true); setFeedback(null);
    try {
      const response = await fetch("/api/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as AccessPayload;
      if (!response.ok) { setFeedback(payload.error ?? "Não foi possível concluir."); return false; }
      applyPayload(payload); return true;
    } catch { setFeedback("Não foi possível concluir. Verifique sua conexão."); return false; }
    finally { setPending(false); }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget; const data = new FormData(form);
    const ok = await action({ action: "create", teamMemberId: Number(data.get("teamMemberId") ?? 0), invitedName: String(data.get("invitedName") ?? ""), role: String(data.get("role") ?? "Barbeiro"), accessRole: String(data.get("accessRole") ?? "barber"), commissionRateBps: Math.round(Number(data.get("commission") ?? 50) * 100) });
    if (ok) { showAppToast("Convite criado. Copie o link e envie ao funcionário."); form.reset(); }
  }

  async function copyInvite() {
    try { await navigator.clipboard.writeText(inviteUrl); setFeedback(null); showAppToast("Link copiado. Agora é só enviar pelo WhatsApp."); }
    catch { setFeedback("Toque e segure o link para copiá-lo."); }
  }

  async function revokeInvite(id: number) {
    if (window.confirm("Cancelar este convite? O link deixará de funcionar.")) {
      if (await action({ action: "revoke", inviteId: id })) showAppToast("Convite cancelado.");
    }
  }

  async function toggleUser(user: ManagedUser) {
    const active = !user.active;
    if (await action({ action: "toggle-user", teamMemberId: user.id, active })) showAppToast(active ? "Acesso reativado." : "Acesso suspenso. Os registros foram preservados.");
  }

  return <><section className="settings-layout user-access-layout"><div className="panel"><SectionTitle title="Usuários cadastrados" copy="Suspenda ou reative o acesso sem apagar atendimentos e ganhos." /><div className="user-access-list">{users.map((user) => <div className="user-access-row" key={user.id}><span className="avatar">{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.email || "Cadastro ainda sem e-mail"} · {user.accessRole === "owner" ? "Administrador" : "Funcionário"}</small></div><span className={user.active && user.hasPassword ? "access-state active" : "access-state"}>{user.active ? (user.hasPassword ? "Ativo" : "Senha pendente") : "Suspenso"}</span>{!user.isCurrentUser && <button className={user.active ? "suspend-button" : "reactivate-button"} disabled={pending} onClick={() => toggleUser(user)}>{user.active ? "Suspender" : "Reativar"}</button>}{user.isCurrentUser && <span className="self-label">VOCÊ</span>}</div>)}</div></div><div className="panel form-card compact"><SectionTitle title="Convidar funcionário" copy="Escolha alguém da equipe ou cadastre uma pessoa nova." /><form className="app-form" onSubmit={createInvite}><Field label="Quem será convidado?"><select name="teamMemberId" defaultValue="0"><option value="0">Novo profissional</option>{users.filter((user) => !user.isCurrentUser && !user.hasPassword).map((user) => <option value={user.id} key={user.id}>{user.name} — cadastro existente</option>)}</select></Field><Field label="Nome (para novo profissional)"><input name="invitedName" placeholder="Ex.: Novo barbeiro" /></Field><Field label="Função"><input name="role" defaultValue="Barbeiro" required /></Field><Field label="Permissão"><select name="accessRole" defaultValue="barber"><option value="barber">Funcionário — somente os próprios dados</option><option value="owner">Administrador — acesso completo</option></select></Field><Field label="Comissão avulso (%)"><input name="commission" type="number" min="0" max="100" step="0.01" defaultValue="50" required /></Field><p className="form-note">Ao escolher um cadastro existente, o acesso será ligado ao histórico correto desse profissional.</p><button className="primary-button" disabled={pending}>{pending ? "Gerando..." : "Gerar link de convite"}</button></form></div></section>{inviteUrl && <section className="panel invite-result"><div><span>LINK PRONTO PARA ENVIAR</span><strong>Este link funciona uma única vez e expira em 7 dias.</strong></div><div className="invite-copy"><input value={inviteUrl} readOnly aria-label="Link de convite" /><button onClick={copyInvite}>Copiar link</button></div><small>Por segurança, guarde este link agora. Depois de sair desta tela, gere outro se precisar.</small></section>}{feedback && <div className={feedback.includes("Não") || feedback.includes("não") ? "notice error access-feedback" : "notice access-feedback"}>{feedback}</div>}<section className="panel invite-history"><SectionTitle title="Convites recentes" copy="Links utilizados, ativos, expirados ou cancelados." /><div className="invite-list">{invites.map((invite) => <div className="invite-row" key={invite.id}><div><strong>{invite.invitedName || "Novo profissional"}</strong><small>{invite.role} · {invite.accessRole === "owner" ? "Administrador" : "Funcionário"} · expira {new Date(invite.expiresAt).toLocaleDateString("pt-BR")}</small></div><span className={`invite-status ${invite.status.toLowerCase()}`}>{invite.status}</span>{invite.status === "Ativo" && <button disabled={pending} onClick={() => revokeInvite(invite.id)}>Cancelar</button>}</div>)}{!invites.length && <Empty text="Nenhum convite criado ainda." />}</div></section></>;
}

function TeamHub({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const [view, setView] = useState<"Vales e pagamentos" | "Usuários e convites">("Vales e pagamentos");
  const [start, setStart] = useState(data.dataPeriod.start);
  const [end, setEnd] = useState(data.dataPeriod.end);
  const periodData = usePeriodDashboardData(data, start, end);
  return <>
    <div className="type-switch team-hub-tabs" aria-label="Áreas da equipe">
      <button type="button" className={view === "Vales e pagamentos" ? "active" : ""} onClick={() => setView("Vales e pagamentos")}>Vales e pagamentos</button>
      <button type="button" className={view === "Usuários e convites" ? "active" : ""} onClick={() => setView("Usuários e convites")}>Usuários e convites</button>
    </div>
    {view !== "Usuários e convites" && <DateFilter start={start} end={end} setStart={setStart} setEnd={setEnd} />}
    {view === "Vales e pagamentos" && <TeamPayments data={periodData} post={post} pending={pending} />}
    {view === "Usuários e convites" && <UserInvites />}
  </>;
}

function TeamPayments({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const editing = data.teamPayments.find((entry) => entry.id === editingId);
  const editorRef = useEditorAutoScroll<HTMLElement>(editingId);
  const employees = data.team.filter((member) => member.id !== data.viewer.teamMemberId);
  const defaultDate = inRange(today, data.dataPeriod.start, data.dataPeriod.end) ? today : data.dataPeriod.end;
  const employeeRows = employees.map((member) => {
    const earnedCents = data.records
      .filter((record) => record.barberId === member.id)
      .reduce((sum, record) => sum + barberPayoutCents(record), 0)
      + data.productSales
        .filter((sale) => sale.sellerTeamMemberId === member.id)
        .reduce((sum, sale) => sum + sale.commissionCents, 0);
    const entries = data.teamPayments.filter((entry) => entry.teamMemberId === member.id);
    return { member, ...teamPaymentSummary(earnedCents, entries) };
  });
  const totals = teamPaymentSummary(
    employeeRows.reduce((sum, row) => sum + row.earnedCents, 0),
    data.teamPayments.filter((entry) => employees.some((member) => member.id === entry.teamMemberId)),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const teamMemberId = Number(form.get("teamMemberId"));
    const employee = data.team.find((member) => member.id === teamMemberId);
    const kind = String(form.get("kind") ?? "Vale");
    const saved = await post({
      action: "team-payment",
      id: editing?.id ?? 0,
      teamMemberId,
      occurredAt: String(form.get("occurredAt") ?? defaultDate),
      kind,
      reason: String(form.get("reason") ?? ""),
      valueCents: Math.round(Number(form.get("value") ?? 0) * 100),
    }, editing ? "Lançamento atualizado." : `${kind} registrado para ${employee?.name ?? "o funcionário"}.`);
    if (saved) setEditingId(null);
  }

  async function remove(entry: DashboardData["teamPayments"][number]) {
    if (!window.confirm(`Excluir ${entry.kind.toLowerCase()} de ${money(entry.valueCents)} de ${entry.teamMemberName}?`)) return;
    const removed = await post({ action: "delete-team-payment", id: entry.id }, "Lançamento excluído.");
    if (removed && editingId === entry.id) setEditingId(null);
  }

  return <>
    <section className="team-payment-total panel">
      <div><span>RESUMO DO PERÍODO</span><strong>{date(data.dataPeriod.start)} a {date(data.dataPeriod.end)}</strong><small>O saldo considera comissões, gorjetas e vendas dos funcionários.</small></div>
      <dl><div><dt>Gerado</dt><dd>{money(totals.earnedCents)}</dd></div><div><dt>Vales</dt><dd>{money(totals.valeCents)}</dd></div><div><dt>Pagamentos</dt><dd>{money(totals.paidCents)}</dd></div><div className={totals.remainingCents < 0 ? "is-advanced" : "is-balance"}><dt>Saldo restante</dt><dd>{money(totals.remainingCents)}</dd></div></dl>
    </section>
    <section className="team-payment-cards">
      {employeeRows.map((row) => <article className="panel team-payment-card" key={row.member.id}><header><span className="large-avatar">{initials(row.member.name)}</span><div><h2>{row.member.name}</h2><small>{row.member.role}</small></div></header><dl><div><dt>Comissões + gorjetas</dt><dd>{money(row.earnedCents)}</dd></div><div><dt>Vales entregues</dt><dd>{money(row.valeCents)}</dd></div><div><dt>Pagamentos feitos</dt><dd>{money(row.paidCents)}</dd></div><div className={row.remainingCents < 0 ? "is-advanced" : "is-balance"}><dt>Saldo restante</dt><dd>{money(row.remainingCents)}</dd></div></dl></article>)}
      {!employeeRows.length && <section className="panel"><Empty text="Cadastre um funcionário para controlar vales e pagamentos." /></section>}
    </section>
    <p className="team-payment-accounting-note"><b>Sem desconto duplicado:</b> vale e pagamento só registram o que já foi entregue ao funcionário. Eles não entram novamente como despesa, porque a comissão já foi descontada do lucro.</p>
    <section className="team-payment-layout">
      <div className="panel team-payment-history"><SectionTitle title="Histórico de vales e pagamentos" copy={`${data.teamPayments.length} ${data.teamPayments.length === 1 ? "lançamento" : "lançamentos"} no período`} /><div className="team-payment-list">{data.teamPayments.map((entry) => <article key={entry.id}><span className={`team-payment-kind ${entry.kind === "Vale" ? "vale" : "payment"}`}>{entry.kind}</span><div><strong>{entry.teamMemberName}</strong><small>{date(entry.occurredAt)} · {entry.reason}</small></div><b>{money(entry.valueCents)}</b><div className="icon-actions"><button type="button" title="Editar lançamento" aria-label={`Editar ${entry.kind.toLowerCase()} de ${entry.teamMemberName}`} onClick={() => setEditingId(entry.id)}><AppIcon name="edit" /></button><button type="button" className="danger" disabled={pending} title="Excluir lançamento" aria-label={`Excluir ${entry.kind.toLowerCase()} de ${entry.teamMemberName}`} onClick={() => void remove(entry)}><AppIcon name="trash" /></button></div></article>)}{!data.teamPayments.length && <Empty text="Nenhum vale ou pagamento neste período." />}</div></div>
      <section className={`panel form-card compact editor-scroll-target${editing ? " is-editing" : ""}`} ref={editorRef} tabIndex={-1}><SectionTitle title={editing ? "Editar lançamento" : "Novo vale ou pagamento"} copy={editing ? "Altere os dados e salve novamente." : "Registre o valor que foi entregue ao funcionário."} />{employees.length ? <form className="app-form" onSubmit={submit} key={editing?.id ?? `new-${data.dataPeriod.start}`}><Field label="Funcionário"><select name="teamMemberId" defaultValue={editing?.teamMemberId ?? employees[0]?.id} required>{employees.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></Field><Field label="Data"><input name="occurredAt" type="date" min={data.dataPeriod.start} max={data.dataPeriod.end} defaultValue={editing?.occurredAt ?? defaultDate} required /></Field><Field label="Tipo"><select name="kind" defaultValue={editing?.kind ?? "Vale"}><option>Vale</option><option>Pagamento</option></select></Field><Field label="Valor (R$)"><input name="value" type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" defaultValue={editing ? editing.valueCents / 100 : undefined} required /></Field><Field label="Motivo"><input name="reason" maxLength={160} placeholder="Ex.: adiantamento do dia" defaultValue={editing?.reason ?? ""} required /></Field><button className="primary-button" disabled={pending}>{pending ? "Salvando..." : editing ? "Salvar alterações" : "Salvar lançamento"}</button>{editing && <button type="button" className="cancel-button" onClick={() => setEditingId(null)}>Cancelar edição</button>}</form> : <Empty text="Cadastre um funcionário antes de fazer um lançamento." />}</section>
    </section>
  </>;
}

type PlatformShop = { id: number; name: string; status: string; isBlocked: boolean; trialEndsAt: string | null; createdAt: string; ownerName: string; ownerEmail: string; ownerWhatsapp: string; signupSource: string; isCurrent: boolean };
type PlatformPayload = { barbershops?: PlatformShop[]; error?: string };
type PlatformShopFilter = "Todas" | "Ativas" | "Em teste" | "Bloqueadas";
type PlatformView = "Resumo" | "Afiliados" | "Cobrança" | "Barbearias";
type MercadoPagoIntegrationStatus = { configured: boolean; webhookConfigured: boolean; updatedAt: string | null };
type MercadoPagoMarketplaceStatus = { configured: boolean; updatedAt: string | null };
type MercadoPagoIntegrationPayload = { status?: MercadoPagoIntegrationStatus; marketplaceStatus?: MercadoPagoMarketplaceStatus; account?: { accountId: string; accountLabel: string }; error?: string };
type PlatformPricingPayload = { offer?: DashboardData["billingOffer"]; error?: string };
type PlatformAffiliate = { id: number; name: string; email: string; whatsapp: string; payoutStatus: string; pixKey: string; active: boolean; code: string; commissionBps: number; commissionMonths: number; linkActive: boolean; createdAt: string; linksCount: number; links: Array<{ id: number; label: string; code: string; active: boolean; referrals: number; url: string }>; referrals: number; earnedCents: number; pendingCents: number; paidCents: number; lastPaidAt: string | null; hasAccess: boolean; lastLoginAt: string | null; url: string };
type AffiliatePayload = { affiliates?: PlatformAffiliate[]; summary?: { totalCents: number; pendingCents: number; paidCents: number }; inviteUrl?: string; inviteExpiresAt?: string; inviteAffiliateId?: number; error?: string };

function PlatformAdmin({ onOfferChange }: { onOfferChange: (offer: DashboardData["billingOffer"]) => void }) {
  const [platformView, setPlatformView] = useState<PlatformView>("Resumo");
  const [barbershops, setBarbershops] = useState<PlatformShop[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shopSearch, setShopSearch] = useState("");
  const [shopFilter, setShopFilter] = useState<PlatformShopFilter>("Todas");
  const [visibleShopCount, setVisibleShopCount] = useState(5);
  const [expandedShopId, setExpandedShopId] = useState<number | null>(null);
  const [mercadoPagoStatus, setMercadoPagoStatus] = useState<MercadoPagoIntegrationStatus | null>(null);
  const [mercadoPagoPending, setMercadoPagoPending] = useState(false);
  const [mercadoPagoFeedback, setMercadoPagoFeedback] = useState<string | null>(null);
  const [mercadoPagoOpen, setMercadoPagoOpen] = useState(false);
  const [billingOffer, setBillingOffer] = useState<DashboardData["billingOffer"] | null>(null);
  const [pricingPending, setPricingPending] = useState(false);
  const [pricingFeedback, setPricingFeedback] = useState<string | null>(null);
  const [affiliates, setAffiliates] = useState<PlatformAffiliate[]>([]);
  const [affiliateSummary, setAffiliateSummary] = useState({ totalCents: 0, pendingCents: 0, paidCents: 0 });
  const [affiliatePending, setAffiliatePending] = useState(false);
  const [affiliateFeedback, setAffiliateFeedback] = useState<string | null>(null);
  const [affiliateInvite, setAffiliateInvite] = useState<{ affiliateId: number; name: string; url: string; expiresAt?: string } | null>(null);
  const [visibleAffiliateCount, setVisibleAffiliateCount] = useState(5);
  const [affiliateReloadKey, setAffiliateReloadKey] = useState(0);

  function applyPayload(payload: PlatformPayload) {
    if (payload.barbershops) setBarbershops(payload.barbershops);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/platform/invites").then(async (response) => ({ response, payload: await response.json() as PlatformPayload })).then(({ response, payload }) => {
      if (!active) return;
      if (!response.ok) setFeedback(payload.error ?? "Não foi possível carregar a plataforma.");
      else applyPayload(payload);
    }).catch(() => { if (active) setFeedback("Não foi possível carregar a plataforma."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/affiliates", { cache: "no-store" }).then(async (response) => ({ response, payload: await response.json() as AffiliatePayload })).then(({ response, payload }) => {
      if (!active) return;
      if (!response.ok) setAffiliateFeedback(payload.error ?? "Não foi possível carregar os afiliados.");
      else {
        if (payload.affiliates) setAffiliates(payload.affiliates);
        if (payload.summary) setAffiliateSummary(payload.summary);
      }
    }).catch(() => { if (active) setAffiliateFeedback("Não foi possível carregar os afiliados."); });
    return () => { active = false; };
  }, [affiliateReloadKey]);

  async function affiliateAction(body: Record<string, string | number | boolean>) {
    setAffiliatePending(true);
    setAffiliateFeedback(null);
    try {
      const response = await fetch("/api/platform/affiliates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as AffiliatePayload;
      if (!response.ok) { setAffiliateFeedback(payload.error ?? "Não foi possível salvar o afiliado."); return null; }
      if (payload.affiliates) setAffiliates(payload.affiliates);
      if (payload.summary) setAffiliateSummary(payload.summary);
      return payload;
    } catch {
      setAffiliateFeedback("Não foi possível salvar agora. Verifique sua internet.");
      return null;
    } finally {
      setAffiliatePending(false);
    }
  }

  async function createAffiliateFromForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const payload = await affiliateAction({
      action: "create",
      name: String(values.get("affiliateName") ?? ""),
      email: String(values.get("affiliateEmail") ?? ""),
      whatsapp: String(values.get("affiliateWhatsapp") ?? ""),
      pixKey: String(values.get("affiliatePixKey") ?? ""),
      code: "",
      commissionPercent: Number(values.get("commissionPercent")),
      commissionMonths: Number(values.get("commissionMonths")),
    });
    if (payload) {
      form.reset();
      if (payload.inviteUrl && payload.inviteAffiliateId) setAffiliateInvite({ affiliateId: payload.inviteAffiliateId, name: String(values.get("affiliateName") ?? "Novo afiliado"), url: payload.inviteUrl, expiresAt: payload.inviteExpiresAt });
      showAppToast("Afiliado criado. Agora envie o convite de acesso para ele.");
    }
  }

  async function generateAffiliateInvite(affiliate: PlatformAffiliate) {
    const payload = await affiliateAction({ action: "create-invite", affiliateId: affiliate.id });
    if (!payload?.inviteUrl || !payload.inviteAffiliateId) return;
    setAffiliateInvite({ affiliateId: payload.inviteAffiliateId, name: affiliate.name, url: payload.inviteUrl, expiresAt: payload.inviteExpiresAt });
    showAppToast(`Convite de acesso de ${affiliate.name} gerado.`);
  }

  async function copyAffiliateInvite() {
    if (!affiliateInvite) return;
    try { await navigator.clipboard.writeText(affiliateInvite.url); setAffiliateFeedback(null); showAppToast("Link do afiliado copiado."); }
    catch { window.prompt(`Copie o convite de ${affiliateInvite.name}:`, affiliateInvite.url); }
  }

  async function deleteAffiliateFromPlatform(affiliate: PlatformAffiliate) {
    const confirmation = window.prompt(`Para excluir ${affiliate.name} e os dados de teste ligados a ele, digite o nome exatamente como aparece:`, "");
    if (confirmation?.trim().toLocaleLowerCase("pt-BR") !== affiliate.name.trim().toLocaleLowerCase("pt-BR")) {
      if (confirmation !== null) setAffiliateFeedback("Exclusão cancelada: o nome digitado não confere.");
      return;
    }
    if (await affiliateAction({ action: "delete", affiliateId: affiliate.id })) {
      if (affiliateInvite?.affiliateId === affiliate.id) setAffiliateInvite(null);
      setAffiliateFeedback(null);
      showAppToast("Afiliado excluído.");
    }
  }

  async function saveAffiliatePix(event: FormEvent<HTMLFormElement>, affiliate: PlatformAffiliate) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (await affiliateAction({ action: "update-pix", affiliateId: affiliate.id, pixKey: String(values.get("pixKey") ?? "") })) {
      showAppToast(`Chave Pix de ${affiliate.name} salva.`);
    }
  }

  async function copyAffiliatePix(affiliate: PlatformAffiliate) {
    if (!affiliate.pixKey) { setAffiliateFeedback(`Cadastre a chave Pix de ${affiliate.name} primeiro.`); return; }
    try { await navigator.clipboard.writeText(affiliate.pixKey); setAffiliateFeedback(null); showAppToast("Chave Pix copiada."); }
    catch { window.prompt(`Copie a chave Pix de ${affiliate.name}:`, affiliate.pixKey); }
  }

  async function confirmAffiliatePayout(affiliate: PlatformAffiliate) {
    if (!affiliate.pixKey) { setAffiliateFeedback(`Cadastre a chave Pix de ${affiliate.name} primeiro.`); return; }
    if (Number(affiliate.pendingCents) <= 0) { setAffiliateFeedback(`${affiliate.name} não possui comissão pendente.`); return; }
    if (!window.confirm(`Confirmar que você enviou ${money(Number(affiliate.pendingCents))} por Pix para ${affiliate.name}?`)) return;
    if (await affiliateAction({ action: "mark-paid", affiliateId: affiliate.id })) {
      showAppToast(`Comissão de ${money(Number(affiliate.pendingCents))} marcada como paga para ${affiliate.name}.`);
    }
  }

  async function toggleAffiliateActive(affiliate: PlatformAffiliate) {
    if (await affiliateAction({ action: "set-active", affiliateId: affiliate.id, active: !affiliate.active })) {
      showAppToast(affiliate.active ? "Afiliado pausado." : "Afiliado ativado.");
    }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/platform/pricing", { cache: "no-store" }).then(async (response) => ({ response, payload: await response.json() as PlatformPricingPayload })).then(({ response, payload }) => {
      if (!active) return;
      if (!response.ok) setPricingFeedback(payload.error ?? "Não foi possível consultar o preço do Pix.");
      else if (payload.offer) setBillingOffer(payload.offer);
    }).catch(() => { if (active) setPricingFeedback("Não foi possível consultar o preço do Pix."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/platform/mercado-pago", { cache: "no-store" }).then(async (response) => ({ response, payload: await response.json() as MercadoPagoIntegrationPayload })).then(({ response, payload }) => {
      if (!active) return;
      if (!response.ok) setMercadoPagoFeedback(payload.error ?? "Não foi possível consultar a integração.");
      else {
        if (payload.status) setMercadoPagoStatus(payload.status);
      }
    }).catch(() => { if (active) setMercadoPagoFeedback("Não foi possível consultar a integração."); });
    return () => { active = false; };
  }, []);

  async function connectMercadoPago(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMercadoPagoPending(true);
    setMercadoPagoFeedback(null);
    try {
      const response = await fetch("/api/platform/mercado-pago", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accessToken: String(data.get("accessToken") ?? "") }),
      });
      const payload = await response.json() as MercadoPagoIntegrationPayload;
      if (!response.ok) {
        setMercadoPagoFeedback(payload.error ?? "Não foi possível conectar o Mercado Pago.");
        return;
      }
      if (payload.status) setMercadoPagoStatus(payload.status);
      form.reset();
      showAppToast(`Mercado Pago conectado${payload.account?.accountLabel ? ` à conta ${payload.account.accountLabel}` : ""}. O Pix integrado está pronto.`);
    } catch {
      setMercadoPagoFeedback("Não foi possível conectar agora. Verifique sua internet e tente novamente.");
    } finally {
      setMercadoPagoPending(false);
    }
  }

  async function savePricing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const pixPriceCents = Math.round(Number(data.get("pixPrice")) * 100);
    const quarterlyDiscountBps = Math.round(Number(data.get("quarterlyDiscount")) * 100);
    const semiannualDiscountBps = Math.round(Number(data.get("semiannualDiscount")) * 100);
    const annualDiscountBps = Math.round(Number(data.get("annualDiscount")) * 100);
    setPricingPending(true);
    setPricingFeedback(null);
    try {
      const response = await fetch("/api/platform/pricing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pixPriceCents, quarterlyDiscountBps, semiannualDiscountBps, annualDiscountBps }),
      });
      const payload = await response.json() as PlatformPricingPayload;
      if (!response.ok || !payload.offer) {
        setPricingFeedback(payload.error ?? "Não foi possível salvar o preço do Pix.");
        return;
      }
      setBillingOffer(payload.offer);
      onOfferChange(payload.offer);
      showAppToast(`Planos Pix atualizados. Mensal ${money(payload.offer.pixPriceCents)} e anual ${money(payload.offer.pixPlans.find((plan) => plan.code === "annual")?.priceCents ?? 0)}.`);
    } catch {
      setPricingFeedback("Não foi possível salvar o preço agora. Verifique sua conexão.");
    } finally {
      setPricingPending(false);
    }
  }

  async function action(body: Record<string, string | number | boolean>) {
    setPending(true); setFeedback(null);
    try {
      const response = await fetch("/api/platform/invites", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as PlatformPayload;
      if (!response.ok) { setFeedback(payload.error ?? "Não foi possível concluir."); return false; }
      applyPayload(payload); return true;
    } catch { setFeedback("Não foi possível concluir. Verifique sua conexão."); return false; }
    finally { setPending(false); }
  }

  async function sharePublicSignup() {
    const publicUrl = `${canonicalSiteOrigin}/comece`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Cortou Anotou", text: "Crie sua barbearia e teste o Cortou Anotou por 14 dias.", url: publicUrl });
        showAppToast("Página pública compartilhada.");
      } else {
        await navigator.clipboard.writeText(publicUrl);
        showAppToast("Link público copiado. Use o mesmo link em todos os anúncios.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFeedback("Não foi possível compartilhar. Abra a página e copie o endereço.");
    }
  }

  async function toggleBarbershop(shop: PlatformShop) {
    const shouldBlock = !shop.isBlocked;
    if (shouldBlock && !window.confirm(`Bloquear ${shop.name}? O proprietário e a equipe ficarão sem acesso até você desbloquear.`)) return;
    const ok = await action({ action: "set-barbershop-blocked", organizationId: shop.id, blocked: shouldBlock });
    if (ok) showAppToast(shouldBlock ? `${shop.name} foi bloqueada. Os dados foram preservados.` : `${shop.name} foi desbloqueada e já pode acessar o app.`);
  }

  async function endTrialNow(shop: PlatformShop) {
    if (!window.confirm(`Encerrar agora o teste de ${shop.name}? No próximo acesso, o proprietário verá somente a renovação por Pix e a equipe ficará pausada.`)) return;
    const ok = await action({ action: "end-barbershop-trial", organizationId: shop.id });
    if (ok) showAppToast(`O teste de ${shop.name} foi encerrado.`);
  }

  async function restartTrial(shop: PlatformShop) {
    if (!window.confirm(`Reabrir o teste de ${shop.name} por mais 14 dias?`)) return;
    const ok = await action({ action: "restart-barbershop-trial", organizationId: shop.id });
    if (ok) showAppToast(`O teste de ${shop.name} foi reaberto por 14 dias.`);
  }

  async function removeBarbershop(shop: PlatformShop) {
    const confirmed = window.confirm(`Excluir ${shop.name} da plataforma? Ela perderá o acesso e desaparecerá desta lista. Esta ação não poderá ser desfeita por aqui.`);
    if (!confirmed) return;
    const ok = await action({ action: "delete-barbershop", organizationId: shop.id });
    if (ok) {
      setExpandedShopId(null);
      showAppToast(`${shop.name} foi excluída da plataforma.`);
    }
  }

  const customerShops = barbershops.filter((shop) => !shop.isCurrent);
  const activeTrials = customerShops.filter((shop) => !shop.isBlocked && shop.status === "trial" && !accessPeriodEnded(shop.trialEndsAt)).length;
  const activeShops = customerShops.filter((shop) => shop.status === "active" && !shop.isBlocked && !accessPeriodEnded(shop.trialEndsAt)).length;
  const blockedShops = customerShops.filter((shop) => shop.isBlocked).length;
  const normalizedSearch = shopSearch.trim().toLocaleLowerCase("pt-BR");
  const filteredShops = customerShops.filter((shop) => {
    const matchesSearch = !normalizedSearch || [shop.name, shop.ownerName, shop.ownerEmail, shop.ownerWhatsapp].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    const matchesFilter = shopFilter === "Todas"
      || (shopFilter === "Ativas" && shop.status === "active" && !shop.isBlocked && !accessPeriodEnded(shop.trialEndsAt))
      || (shopFilter === "Em teste" && (shop.status === "trial" || shop.status === "pending_email") && !shop.isBlocked)
      || (shopFilter === "Bloqueadas" && shop.isBlocked);
    return matchesSearch && matchesFilter;
  });
  const visibleShops = filteredShops.slice(0, visibleShopCount);

  function shopStatus(shop: PlatformShop) {
    if (shop.isBlocked) return { label: "Bloqueada", className: "blocked" };
    if (shop.status === "pending_email") return { label: "Aguardando e-mail", className: "pending" };
    if (accessPeriodEnded(shop.trialEndsAt)) return { label: shop.status === "trial" ? "Teste encerrado" : "Plano vencido", className: "expired" };
    if (shop.status === "trial") {
      return { label: "Em teste", className: "trial" };
    }
    return { label: "Ativa", className: "active" };
  }
  return <>
    <section className="panel platform-command-center">
      <div className="platform-command-intro"><span>CENTRAL DO CORTOU ANOTOU</span><strong>O que você quer administrar?</strong><small>Abra somente a área que precisa. Nada fica amontoado na mesma tela.</small></div>
      <div className="platform-command-tabs" role="tablist" aria-label="Áreas da plataforma">{([
        { label: "Resumo", icon: "⌂", detail: "Visão geral" },
        { label: "Afiliados", icon: "↗", detail: `${affiliates.length} cadastrado${affiliates.length === 1 ? "" : "s"}` },
        { label: "Cobrança", icon: "◇", detail: mercadoPagoStatus?.configured ? "Pix ativo" : "Configurar Pix" },
        { label: "Barbearias", icon: "▦", detail: `${customerShops.length} cliente${customerShops.length === 1 ? "" : "s"}` },
      ] as Array<{ label: PlatformView; icon: string; detail: string }>).map((item) => <button type="button" role="tab" aria-selected={platformView === item.label} className={platformView === item.label ? "active" : ""} key={item.label} onClick={() => setPlatformView(item.label)}><b>{item.icon}</b><span><strong>{item.label}</strong><small>{item.detail}</small></span></button>)}</div>
    </section>
    {platformView === "Resumo" && <>
      <section className="panel platform-public-entry"><div><span>LINK ÚNICO PARA ANÚNCIOS</span><h2>Cadastro automático de novas barbearias</h2><p>Este link não expira. Cada proprietário cria sozinho sua conta, recebe 14 dias grátis e entra no próprio espaço.</p></div><div><button onClick={sharePublicSignup}>Compartilhar link público</button><a href={`${canonicalSiteOrigin}/comece`} target="_blank" rel="noreferrer">Abrir página</a></div></section>
      <section className="platform-stat-grid"><article><span>BARBEARIAS</span><strong>{customerShops.length}</strong><small>Clientes na plataforma</small></article><article><span>ATIVAS</span><strong>{activeShops}</strong><small>Planos em funcionamento</small></article><article><span>EM TESTE</span><strong>{activeTrials}</strong><small>Testes gratuitos ativos</small></article><article><span>BLOQUEADAS</span><strong>{blockedShops}</strong><small>Acessos suspensos</small></article></section>
      <section className="platform-overview-actions" aria-label="Atalhos da plataforma"><button type="button" onClick={() => setPlatformView("Afiliados")}><b>↗</b><span><strong>Afiliados</strong><small>Convites, indicações e comissões</small></span><em>Abrir</em></button><button type="button" onClick={() => setPlatformView("Cobrança")}><b>◇</b><span><strong>Cobrança e planos</strong><small>Mercado Pago, preço e descontos</small></span><em>Abrir</em></button><button type="button" onClick={() => setPlatformView("Barbearias")}><b>▦</b><span><strong>Barbearias clientes</strong><small>Pesquisar, bloquear ou excluir</small></span><em>Abrir</em></button></section>
    </>}
    {platformView === "Cobrança" && <>
    <section className={`panel platform-payment-summary${mercadoPagoStatus?.configured ? " connected" : ""}`}>
      <span className="platform-payment-icon">◇</span>
      <div><small>PIX INTEGRADO</small><strong>{mercadoPagoStatus?.configured ? "Mercado Pago conectado" : mercadoPagoStatus ? "Integração pendente" : "Consultando integração"}</strong><p>{mercadoPagoStatus?.configured ? `Cobranças Pix e liberações automáticas prontas${billingOffer ? ` · mensal a partir de ${money(billingOffer.pixPriceCents)}` : ""}.` : "Conecte a conta que receberá os pagamentos do aplicativo."}</p></div>
      <b>{mercadoPagoStatus?.configured ? "ATIVO" : "PENDENTE"}</b>
      <button type="button" onClick={() => setMercadoPagoOpen((open) => !open)}>{mercadoPagoOpen ? "Fechar" : "Gerenciar"}</button>
    </section>
    {mercadoPagoOpen && <section className={`panel mercado-pago-integration platform-payment-details${mercadoPagoStatus?.configured ? " connected" : ""}`}>
      <div className="mercado-pago-copy"><div className="mercado-pago-heading"><span className="mercado-pago-icon">◇</span><div><small>CONFIGURAÇÃO DE COBRANÇA</small><h2>{mercadoPagoStatus?.configured ? "Atualizar integração" : "Conectar Mercado Pago"}</h2></div><b>{mercadoPagoStatus?.configured ? "CONECTADO" : "ÚLTIMO PASSO"}</b></div><p>Essa configuração vale para todas as barbearias. O cliente escolhe um plano, paga pelo banco que quiser e o período é liberado automaticamente.</p><ol><li><span>1</span>Abra as credenciais de produção no Mercado Pago.</li><li><span>2</span>Copie somente o <strong>Access Token</strong> que começa por APP_USR-.</li><li><span>3</span>Cole no campo ao lado e toque em conectar.</li></ol><div className="mercado-pago-security"><span>▣</span><p><strong>Área privada do administrador</strong><small>A chave é criptografada antes de ser guardada e nunca volta a aparecer na tela.</small></p></div></div>
      <form className="mercado-pago-form" onSubmit={connectMercadoPago}><label><span>ACCESS TOKEN DE PRODUÇÃO</span><input name="accessToken" type="password" minLength={40} maxLength={500} autoComplete="off" spellCheck={false} placeholder="APP_USR-••••••••••••••••" required /></label><small>{mercadoPagoStatus?.configured && mercadoPagoStatus.updatedAt ? `Conectado em ${new Date(mercadoPagoStatus.updatedAt).toLocaleDateString("pt-BR")}. Cole uma nova chave somente para atualizar.` : "Não envie essa chave por WhatsApp ou pelo chat."}</small><button type="submit" disabled={mercadoPagoPending}>{mercadoPagoPending ? "Validando com o Mercado Pago..." : mercadoPagoStatus?.configured ? "Atualizar integração" : "Conectar Mercado Pago"}</button>{mercadoPagoFeedback && <p className={mercadoPagoFeedback.includes("conectado") ? "mercado-pago-feedback success" : "mercado-pago-feedback error"} role="status">{mercadoPagoFeedback}</p>}</form>
    </section>}
    <section className="panel platform-central-pricing"><div><span>PLANOS PIX CENTRALIZADOS</span><h2>Preço-base e descontos</h2><p>Altere o valor mensal e os descontos. Os totais de 3, 6 e 12 meses são recalculados automaticamente em todo o aplicativo. Códigos Pix já gerados mantêm o valor original.</p>{billingOffer && <div className="platform-plan-preview">{billingOffer.pixPlans.map((plan) => <article key={plan.code}><span>{plan.label}</span><strong>{money(plan.priceCents)}</strong><small>{plan.discountBps ? `${plan.discountBps / 100}% de desconto` : `${plan.periodDays} dias`}</small></article>)}</div>}</div><form onSubmit={savePricing}><label><span>VALOR MENSAL</span><div><b>R$</b><input name="pixPrice" type="number" min="1" max="10000" step="0.01" defaultValue={billingOffer ? (billingOffer.pixPriceCents / 100).toFixed(2) : "9.99"} key={`price-${billingOffer?.pixPriceCents ?? 999}`} required /></div></label><div className="platform-discount-grid"><label><span>TRIMESTRAL</span><div><input name="quarterlyDiscount" type="number" min="0" max="50" step="0.01" defaultValue={billingOffer ? billingOffer.quarterlyDiscountBps / 100 : 10} key={`quarter-${billingOffer?.quarterlyDiscountBps ?? 1000}`} required /><b>%</b></div></label><label><span>SEMESTRAL</span><div><input name="semiannualDiscount" type="number" min="0" max="50" step="0.01" defaultValue={billingOffer ? billingOffer.semiannualDiscountBps / 100 : 15} key={`semester-${billingOffer?.semiannualDiscountBps ?? 1500}`} required /><b>%</b></div></label><label><span>ANUAL</span><div><input name="annualDiscount" type="number" min="0" max="50" step="0.01" defaultValue={billingOffer ? billingOffer.annualDiscountBps / 100 : 20} key={`annual-${billingOffer?.annualDiscountBps ?? 2000}`} required /><b>%</b></div></label></div><button type="submit" disabled={pricingPending}>{pricingPending ? "Salvando..." : "Salvar todos os planos"}</button><small>Somente Pix. Sem cobrança ou renovação automática.</small>{pricingFeedback && <p className={pricingFeedback.includes("atualizados") ? "success" : "error"} role="status">{pricingFeedback}</p>}</form></section>
    </>}
    {platformView === "Afiliados" && <section className="panel affiliate-admin">
      <div className="affiliate-admin-heading"><div><span>PROGRAMA DE INDICAÇÃO</span><h2>Afiliados do Cortou Anotou</h2><p>Você cria o afiliado e envia um convite de acesso. Depois ele gera os próprios links e acompanha os resultados sem entrar no painel das barbearias.</p></div><div className="affiliate-summary"><article><small>INDICAÇÕES</small><strong>{affiliates.reduce((total, affiliate) => total + Number(affiliate.referrals), 0)}</strong></article><article><small>COMISSÕES GERADAS</small><strong>{money(affiliateSummary.totalCents)}</strong></article><article><small>AGUARDANDO COMISSÃO</small><strong>{money(affiliateSummary.pendingCents)}</strong></article></div></div>
      <div className="affiliate-admin-layout">
        <form className="affiliate-create-form" onSubmit={createAffiliateFromForm}>
          <h3>Criar afiliado e acesso</h3>
          <label><span>NOME</span><input name="affiliateName" minLength={2} maxLength={100} placeholder="Nome do colaborador" required /></label>
          <div><label><span>WHATSAPP</span><input name="affiliateWhatsapp" type="tel" placeholder="(41) 99999-9999" /></label><label><span>E-MAIL</span><input name="affiliateEmail" type="email" placeholder="afiliado@email.com" /></label></div>
          <label><span>CHAVE PIX</span><input name="affiliatePixKey" maxLength={160} placeholder="CPF, telefone, e-mail ou chave aleatória" /><small>Pode cadastrar agora ou completar depois.</small></label>
          <div><label><span>COMISSÃO</span><div className="affiliate-number"><input name="commissionPercent" type="number" min="1" max="50" step="0.01" defaultValue="30" required /><b>%</b></div></label><label><span>DURAÇÃO</span><div className="affiliate-number"><input name="commissionMonths" type="number" min="1" max="36" step="1" defaultValue="12" required /><b>meses</b></div></label></div>
          <button type="submit" disabled={affiliatePending}>{affiliatePending ? "Criando..." : "Criar afiliado e gerar convite de acesso"}</button>
          <small className="affiliate-rule">Você envia somente o convite de acesso. Depois de entrar, o próprio afiliado gera os links que serão enviados às barbearias.</small>
        </form>
        <div className="affiliate-list">
          <div className="affiliate-list-title"><h3>Afiliados cadastrados</h3><small>{affiliates.length} afiliado{affiliates.length === 1 ? "" : "s"}</small></div>
          {affiliates.slice(0, visibleAffiliateCount).map((affiliate) => <article key={affiliate.id} className={!affiliate.active ? "inactive" : ""}>
            <div className="affiliate-row-main"><span className="affiliate-avatar">{initials(affiliate.name)}</span><div><strong>{affiliate.name}</strong><small>{affiliate.commissionBps / 100}% por {affiliate.commissionMonths} meses · {affiliate.referrals} indicação{Number(affiliate.referrals) === 1 ? "" : "ões"}</small></div><div className="affiliate-row-header-actions"><b>{affiliate.active ? "ATIVO" : "PAUSADO"}</b>{!affiliate.hasAccess && <button type="button" disabled={affiliatePending || !affiliate.active} onClick={() => generateAffiliateInvite(affiliate)}>Gerar convite</button>}</div></div>
            {affiliateInvite?.affiliateId === affiliate.id && <div className="affiliate-card-invite"><div><span>LINK DE ACESSO DE {affiliate.name.toLocaleUpperCase("pt-BR")}</span><small>Funciona uma única vez{affiliateInvite.expiresAt ? ` · expira em ${new Date(affiliateInvite.expiresAt).toLocaleDateString("pt-BR")}` : " · válido por 7 dias"}.</small></div><div><input value={affiliateInvite.url} readOnly aria-label={`Convite de acesso de ${affiliate.name}`} /><button type="button" onClick={copyAffiliateInvite}>Copiar link</button></div></div>}
            <div className={`affiliate-access-state ${affiliate.hasAccess ? "active" : "pending"}`}><span>{affiliate.hasAccess ? "✓" : "!"}</span><div><strong>{affiliate.hasAccess ? "Área do afiliado liberada" : "Convite de acesso ainda não utilizado"}</strong><small>{affiliate.hasAccess ? (affiliate.lastLoginAt ? `Última entrada em ${new Date(affiliate.lastLoginAt).toLocaleDateString("pt-BR")}` : `${affiliate.name} já pode gerar links na própria área`) : `Envie para ${affiliate.name} o convite de acesso, não o link de indicação`}</small></div></div>
            {affiliate.hasAccess && <><small className="affiliate-admin-links-kicker">LINKS GERADOS NA ÁREA DO AFILIADO</small><div className="affiliate-admin-code-list">{affiliate.links.map((link) => <span key={link.id} className={!link.active ? "inactive" : ""}><b>{link.label}</b><code>{link.code}</code><small>{link.referrals} indicação{Number(link.referrals) === 1 ? "" : "ões"}</small></span>)}</div></>}
            <div className="affiliate-row-stats"><span><small>Total gerado</small><strong>{money(Number(affiliate.earnedCents))}</strong></span><span><small>A pagar</small><strong className={Number(affiliate.pendingCents) > 0 ? "pending" : ""}>{money(Number(affiliate.pendingCents))}</strong></span><span><small>Já pago</small><strong>{money(Number(affiliate.paidCents))}</strong></span></div>
            <form className="affiliate-pix-form" onSubmit={(event) => saveAffiliatePix(event, affiliate)}><label><span>CHAVE PIX DO AFILIADO</span><input name="pixKey" defaultValue={affiliate.pixKey} key={`${affiliate.id}-${affiliate.pixKey}`} maxLength={160} placeholder="Cadastre a chave Pix" /></label><button type="submit" disabled={affiliatePending}>Salvar chave</button></form>
            {affiliate.lastPaidAt && <small className="affiliate-last-paid">Última comissão confirmada em {new Date(affiliate.lastPaidAt).toLocaleDateString("pt-BR")}.</small>}
            <div className="affiliate-row-actions"><button type="button" disabled={affiliatePending || !affiliate.pixKey} onClick={() => copyAffiliatePix(affiliate)}>Copiar chave Pix</button><button type="button" className="payout" disabled={affiliatePending || !affiliate.pixKey || Number(affiliate.pendingCents) <= 0} onClick={() => confirmAffiliatePayout(affiliate)}>Marcar como pago</button><button type="button" className="pause" disabled={affiliatePending} onClick={() => toggleAffiliateActive(affiliate)}>{affiliate.active ? "Pausar" : "Ativar"}</button><button type="button" className="delete" disabled={affiliatePending} onClick={() => deleteAffiliateFromPlatform(affiliate)}>Excluir afiliado</button></div>
          </article>)}
          {!affiliates.length && <Empty text="Nenhum afiliado criado ainda." />}
          {affiliates.length > 5 && <button type="button" className="affiliate-show-more" onClick={() => setVisibleAffiliateCount((current) => current >= affiliates.length ? 5 : Math.min(affiliates.length, current + 5))}>{visibleAffiliateCount >= affiliates.length ? "Mostrar menos" : `Ver mais ${Math.min(5, affiliates.length - visibleAffiliateCount)} afiliado${Math.min(5, affiliates.length - visibleAffiliateCount) === 1 ? "" : "s"}`}</button>}
        </div>
      </div>
      {affiliateFeedback && <div className="affiliate-feedback error" role="alert"><span>{affiliateFeedback}</span>{(affiliateFeedback.includes("Não") || affiliateFeedback.includes("não")) && <button type="button" onClick={() => { setAffiliateFeedback(null); setAffiliateReloadKey((value) => value + 1); }}>Tentar novamente</button>}</div>}
    </section>}
    {platformView === "Barbearias" && <>
    <section className="platform-stat-grid"><article><span>BARBEARIAS</span><strong>{customerShops.length}</strong><small>Clientes na plataforma</small></article><article><span>ATIVAS</span><strong>{activeShops}</strong><small>Planos em funcionamento</small></article><article><span>EM TESTE</span><strong>{activeTrials}</strong><small>Testes gratuitos ativos</small></article><article><span>BLOQUEADAS</span><strong>{blockedShops}</strong><small>Acessos suspensos</small></article></section>
    {feedback && <div className={feedback.includes("Não") || feedback.includes("não") ? "notice error access-feedback" : "notice access-feedback"}>{feedback}</div>}
    <section className="panel platform-management-panel">
      <SectionTitle title="Barbearias clientes" copy="Pesquise, acompanhe, bloqueie ou exclua sem misturar os dados de cada negócio." />
      <div className="platform-shop-toolbar"><label><span>⌕</span><input value={shopSearch} onChange={(event) => { setShopSearch(event.target.value); setVisibleShopCount(5); }} placeholder="Buscar barbearia, proprietário, e-mail..." aria-label="Buscar barbearias" /></label><div className="platform-shop-filters">{(["Todas", "Ativas", "Em teste", "Bloqueadas"] as PlatformShopFilter[]).map((filter) => <button type="button" className={shopFilter === filter ? "active" : ""} key={filter} onClick={() => { setShopFilter(filter); setVisibleShopCount(5); }}>{filter}</button>)}</div></div>
      <div className="platform-customer-list">{visibleShops.map((shop) => {
        const status = shopStatus(shop);
        const expanded = expandedShopId === shop.id;
        return <article className={`platform-customer-row${expanded ? " expanded" : ""}`} key={shop.id}>
          <button type="button" className="platform-customer-summary" onClick={() => setExpandedShopId(expanded ? null : shop.id)} aria-expanded={expanded}><span className="platform-shop-avatar">{initials(shop.name)}</span><span className="platform-customer-name"><strong>{shop.name}</strong><small>{shop.ownerName}{shop.ownerEmail ? ` · ${shop.ownerEmail}` : ""}</small></span><span className={`platform-shop-status ${status.className}`}>{status.label}</span><b aria-hidden="true">{expanded ? "−" : "+"}</b></button>
          {expanded && <div className="platform-customer-details"><dl><div><dt>WhatsApp</dt><dd>{shop.ownerWhatsapp || "Não informado"}</dd></div><div><dt>Cadastro</dt><dd>{new Date(shop.createdAt).toLocaleDateString("pt-BR")}</dd></div><div><dt>Origem</dt><dd>{shop.signupSource || "Link público"}</dd></div>{shop.trialEndsAt && <div><dt>Fim do teste</dt><dd>{new Date(shop.trialEndsAt).toLocaleDateString("pt-BR")}</dd></div>}</dl><div className="platform-shop-actions">{shop.status === "trial" && !shop.isBlocked && (accessPeriodEnded(shop.trialEndsAt) ? <button type="button" className="trial-restart" disabled={pending} onClick={() => restartTrial(shop)}>Reabrir teste · 14 dias</button> : <button type="button" className="trial-end" disabled={pending} onClick={() => endTrialNow(shop)}>Encerrar teste agora</button>)}<button type="button" className={shop.isBlocked ? "unblock" : "block"} disabled={pending} onClick={() => toggleBarbershop(shop)}>{shop.isBlocked ? "Desbloquear acesso" : "Bloquear acesso"}</button><button type="button" className="trash" disabled={pending} onClick={() => removeBarbershop(shop)} aria-label={`Excluir ${shop.name}`} title={`Excluir ${shop.name}`}><AppIcon name="trash" /> Excluir</button></div></div>}
        </article>;
      })}{!filteredShops.length && <Empty text="Nenhuma barbearia encontrada com esse filtro." />}</div>
      {filteredShops.length > 5 && <button type="button" className="platform-list-more" onClick={() => setVisibleShopCount((count) => count >= filteredShops.length ? 5 : count + 5)}>{visibleShopCount >= filteredShops.length ? "Mostrar menos" : `Ver mais (${filteredShops.length - visibleShopCount})`}</button>}
      <p className="platform-main-shop-note">Sua barbearia principal fica protegida e não aparece nesta lista de clientes.</p>
    </section>
    </>}
  </>;
}

function Configurations({ data, post, pending, initialTab }: { data: DashboardData; post: Post; pending: boolean; initialTab?:string }) {
  const [tab, setTab] = useState(initialTab || "Clientes"); const [editingId, setEditingId] = useState<number | null>(null);
  const tabs = ["Clientes", "Planos", "Serviços", "Agenda", "Agendamento público", "Pagamentos", "Equipe", "Minha senha"];
  useEffect(() => {
    const editor = document.querySelector<HTMLElement>(".settings-layout .editor-scroll-target");
    if (editingId === null) {
      editor?.classList.remove("is-editing");
      return;
    }
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const currentEditor = document.querySelector<HTMLElement>(".settings-layout .editor-scroll-target");
        if (!currentEditor) return;
        currentEditor.classList.add("is-editing");
        currentEditor.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
        currentEditor.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      editor?.classList.remove("is-editing");
    };
  }, [editingId, tab]);
  function changeTab(value: string) { setTab(value); setEditingId(null); }
  return <><div className="config-tabs">{tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => changeTab(item)}>{item}</button>)}</div>
    {tab === "Clientes" && <ClientSettings data={data} post={post} pending={pending} editingId={editingId} setEditingId={setEditingId} />}
    {tab === "Planos" && <PlanSettings data={data} post={post} pending={pending} editingId={editingId} setEditingId={setEditingId} />}
    {tab === "Serviços" && <ServiceSettings data={data} post={post} pending={pending} editingId={editingId} setEditingId={setEditingId} />}
    {tab === "Agenda" && <AgendaSettings data={data} post={post} pending={pending} />}
    {tab === "Agendamento público" && <PublicBookingSettings data={data} post={post} pending={pending} />}
    {tab === "Pagamentos" && <PaymentSettings data={data} post={post} pending={pending} editingId={editingId} setEditingId={setEditingId} />}
    {tab === "Equipe" && <TeamSettings data={data} post={post} pending={pending} editingId={editingId} setEditingId={setEditingId} />}
    {tab === "Minha senha" && <PasswordSettings post={post} pending={pending} />}
  </>;
}

function ShareAppIcon({ name }: { name: "whatsapp" | "instagram" | "facebook" }) {
  if (name === "whatsapp") return <svg className="social-network-icon whatsapp-logo" viewBox="0 0 16 16" aria-hidden="true"><path d="M13.6 2.33A7.85 7.85 0 0 0 7.99 0 7.94 7.94 0 0 0 .06 7.93c0 1.4.37 2.76 1.06 3.96L0 16l4.2-1.1a7.9 7.9 0 0 0 3.79.96H8a7.94 7.94 0 0 0 7.93-7.93 7.9 7.9 0 0 0-2.33-5.6ZM7.99 14.52a6.6 6.6 0 0 1-3.35-.92l-.24-.14-2.5.65.67-2.43-.16-.25a6.56 6.56 0 0 1-1-3.51 6.6 6.6 0 0 1 6.59-6.58 6.56 6.56 0 0 1 4.66 1.93 6.56 6.56 0 0 1 1.93 4.66 6.6 6.6 0 0 1-6.6 6.59Zm3.62-4.93c-.2-.1-1.17-.58-1.35-.65-.18-.06-.32-.1-.45.1-.13.2-.51.65-.63.78-.11.13-.23.15-.43.05-.2-.1-.84-.31-1.59-.99a5.39 5.39 0 0 1-1.1-1.37c-.12-.2-.02-.3.08-.4l.3-.35c.1-.11.13-.2.2-.33.06-.13.03-.25-.02-.35-.05-.1-.44-1.07-.61-1.47-.16-.39-.32-.33-.45-.34h-.38a.73.73 0 0 0-.53.25c-.18.2-.69.68-.69 1.65 0 .98.71 1.92.81 2.05.1.13 1.39 2.13 3.38 2.99.47.2.84.32 1.13.42.48.15.9.13 1.25.08.38-.06 1.17-.48 1.34-.94.16-.47.16-.86.11-.95-.05-.08-.18-.13-.38-.23Z" /></svg>;
  if (name === "instagram") return <svg className="social-network-icon instagram-logo" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.1" /><circle cx="12" cy="12" r="4.15" /><circle className="social-icon-dot" cx="17.45" cy="6.75" r="1.05" /></svg>;
  return <svg className="social-network-icon facebook-logo" viewBox="0 0 24 24" aria-hidden="true"><path className="social-icon-fill" d="M13.55 22v-8.55h2.88l.43-3.34h-3.31V7.97c0-.97.27-1.63 1.7-1.63h1.82V3.3c-.32-.04-1.4-.13-2.65-.13-2.62 0-4.42 1.6-4.42 4.58v2.36H7.07v3.34H10V22h3.55Z" /></svg>;
}

function PublicBookingSettings({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const relativeUrl = `/agendar/${data.agendaSettings.publicBookingSlug}`;
  const publicUrl = `${canonicalSiteOrigin}${relativeUrl}`;
  const [shareFeedback, setShareFeedback] = useState("");

  async function copyLink(message = "Link copiado. Agora é só colar onde quiser.") {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setShareFeedback("");
      showAppToast(message);
    } catch {
      setShareFeedback("Toque e segure no endereço acima para copiar.");
    }
  }

  function openInstagram() {
    window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    void copyLink("Link copiado. O Instagram foi aberto: cole na bio, no story ou na mensagem.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await post({
      action: "save-agenda-settings",
      useServiceDuration: data.agendaSettings.useServiceDuration,
      openingTime: data.agendaSettings.openingTime,
      closingTime: data.agendaSettings.closingTime,
      publicBookingEnabled: form.get("publicBookingEnabled") === "on",
      publicBookingRequiresApproval: form.get("publicBookingRequiresApproval") === "on",
      publicBookingWeekdays: form.getAll("publicBookingWeekday").map(Number).join(","),
    }, "Configuração do agendamento público atualizada.");
  }

  const shareText = encodeURIComponent(`Agende seu horário na ${data.viewer.organizationName}: ${publicUrl}`);
  return <><section className="public-link-layout">
    <div className="panel public-link-preview">
      <div className="public-link-heading"><span>LINK EXCLUSIVO DA BARBEARIA</span><h2>Seu cliente agenda sozinho</h2><p>O calendário mostra apenas horários disponíveis e o pedido entra direto na sua Agenda.</p></div>
      <div className="public-link-box"><small>SEU ENDEREÇO PÚBLICO</small><div><input value={publicUrl} readOnly aria-label="Link público de agendamento" /><button type="button" onClick={() => void copyLink()}>Copiar</button></div><a href={publicUrl} target="_blank" rel="noreferrer">Abrir página pública <b>↗</b></a></div>
      <div className="share-app-grid" aria-label="Compartilhar link de agendamento">
        <a className="share-app-button whatsapp" href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer"><ShareAppIcon name="whatsapp" /><div><strong>WhatsApp</strong><small>Abrir e enviar</small></div></a>
        <button className="share-app-button instagram" type="button" onClick={openInstagram}><ShareAppIcon name="instagram" /><div><strong>Instagram</strong><small>Copiar e abrir</small></div></button>
        <a className="share-app-button facebook" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(publicUrl)}`} target="_blank" rel="noreferrer"><ShareAppIcon name="facebook" /><div><strong>Facebook</strong><small>Abrir e publicar</small></div></a>
      </div>
      {shareFeedback && <p className="public-share-feedback" role="status">✓ {shareFeedback}</p>}
    </div>
    <div className="panel form-card compact public-booking-config"><SectionTitle title="Controlar agendamentos" copy="Você decide se o link fica ativo e se cada pedido precisa de aprovação." /><form className="app-form" onSubmit={submit}>
      <label className="agenda-toggle"><input name="publicBookingEnabled" type="checkbox" defaultChecked={data.agendaSettings.publicBookingEnabled} /><span /><div><strong>Link público ativo</strong><small>Clientes podem abrir o calendário e solicitar horários</small></div></label>
      <label className="agenda-toggle"><input name="publicBookingRequiresApproval" type="checkbox" defaultChecked={data.agendaSettings.publicBookingRequiresApproval} /><span /><div><strong>Confirmar antes de aceitar</strong><small>O pedido entra como “Aguardando” e você confirma na Agenda</small></div></label>
      <fieldset className="booking-weekday-settings"><legend>Dias disponíveis no link público</legend><div>{BOOKING_WEEKDAY_OPTIONS.map((day) => <label key={day.value}><input name="publicBookingWeekday" type="checkbox" value={day.value} defaultChecked={data.agendaSettings.publicBookingWeekdays.includes(day.value)} /><span>{day.shortLabel}</span></label>)}</div><small>Dias desmarcados ficam bloqueados no calendário. Os agendamentos já existentes não são alterados.</small></fieldset>
      <div className="public-booking-rules"><span>30</span><div><strong>Horários a cada meia hora</strong><small>A duração real vem do serviço cadastrado. Corte de 60 minutos, por exemplo, bloqueia dois intervalos.</small></div></div>
      <button className="primary-button" disabled={pending}>{pending ? "Salvando..." : "Salvar agendamento público"}</button>
    </form></div>
  </section><BookingPaymentSettings /><PublicGallerySettings team={data.team} /></>;
}

function SettingsLayout({ title, copy, list, form, editingKey = null }: { title: string; copy: string; list: React.ReactNode; form: React.ReactNode; editingKey?: number | string | null }) {
  const editorRef = useEditorAutoScroll<HTMLDivElement>(editingKey);
  return <section className="settings-layout"><div className="panel"><SectionTitle title={title} copy={copy} />{list}</div><div className={`panel form-card compact editor-scroll-target${editingKey !== null ? " is-editing" : ""}`} ref={editorRef} tabIndex={-1}>{form}</div></section>;
}
function EditRow({ title, detail, active, onEdit, onDelete, pending }: { title: string; detail: string; active?: boolean; onEdit: () => void; onDelete?: () => void; pending?: boolean }) { return <div className="edit-row"><span className="edit-icon"><AppIcon name={active === false ? "settings" : "check"} /></span><div><strong>{title}</strong><small>{detail}</small></div><span className="edit-row-actions"><button onClick={onEdit}>Editar</button>{onDelete && <button className="delete" disabled={pending} onClick={onDelete} aria-label={`Excluir ${title}`}><AppIcon name="trash" /></button>}</span></div>; }
function ClientSettings({ data, post, pending, editingId, setEditingId }: SettingProps) {
  const item = data.clients.find((x) => x.id === editingId);
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); if (await post({ action: "save-client", id: editingId ?? 0, name: String(f.get("name")), phone: String(f.get("phone")), planId: Number(f.get("planId")), paymentMethodId: Number(f.get("paymentMethodId")), status: String(f.get("status")), dueDate: String(f.get("dueDate")), paidMonth: String(f.get("paidMonth")) }, editingId ? "Cliente e pagamento da mensalidade atualizados." : "Cliente mensalista cadastrado com a forma de pagamento.")) setEditingId(null); }
  async function remove(id: number, name: string) { if (!window.confirm(`Excluir o mensalista ${name}? Ele sairá da lista, mas os atendimentos antigos continuarão no histórico.`)) return; const ok = await post({ action: "delete-client", id }, "Mensalista excluído. O histórico foi preservado."); if (ok && editingId === id) setEditingId(null); }
  return <SettingsLayout
    title="Clientes mensalistas"
    copy="Cadastre o plano e como a mensalidade foi recebida."
    list={<div className="edit-list">{data.clients.map((x) => <EditRow key={x.id} title={x.name} detail={`${x.plan} · ${x.paymentName} · ${x.status}`} onEdit={() => setEditingId(x.id)} onDelete={() => void remove(x.id, x.name)} pending={pending} />)}</div>}
    form={<>
      <SectionTitle
        title={item ? "Editar cliente" : "Novo cliente"}
        copy={item ? "Confira o mês pago e quando este cliente deverá pagar novamente." : "O mês atual e o próximo vencimento já vêm preenchidos para você."}
      />
      <form className="app-form" onSubmit={submit} key={item?.id ?? "new"}>
        <Field label="Nome"><input name="name" defaultValue={item?.name ?? ""} required /></Field>
        <Field label="Telefone"><input name="phone" defaultValue={item?.phone ?? ""} /></Field>
        <Field label="Plano"><select name="planId" defaultValue={item?.planId ?? data.plans[0]?.id}>{data.plans.filter((x) => x.active).map((x) => <option value={x.id} key={x.id}>{x.name}</option>)}</select></Field>
        <Field label="Como a mensalidade foi paga"><select name="paymentMethodId" defaultValue={item?.paymentMethodId || data.paymentMethods[0]?.id} required>{data.paymentMethods.map((payment) => <option value={payment.id} key={payment.id}>{payment.name}{payment.feeBps ? ` · ${(payment.feeBps / 100).toFixed(2).replace(".", ",")}% de taxa` : ""}</option>)}</select></Field>
        <Field label="Status"><select name="status" defaultValue={item?.status ?? "Ativo"}><option>Ativo</option><option>Pendente</option><option>Bloqueado</option></select></Field>
        <Field label="Mensalidade referente a">
          <input name="paidMonth" type="month" defaultValue={item?.paidMonth ?? appMonth()} required />
          <small className="field-help">Mês que este pagamento está cobrindo.</small>
        </Field>
        <Field label="Próximo vencimento">
          <input name="dueDate" type="date" defaultValue={item?.dueDate ?? nextMonthDueDate()} required />
          <small className="field-help">Data em que o cliente deverá pagar novamente.</small>
        </Field>
        <button className="primary-button" disabled={pending}>Salvar cliente</button>
        {item && <button type="button" className="cancel-button" onClick={() => setEditingId(null)}>Cancelar edição</button>}
      </form>
    </>}
  />;
}
function PlanSettings({ data, post, pending, editingId, setEditingId }: SettingProps) { const item = data.plans.find((x) => x.id === editingId); async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); if (await post({ action: "save-plan", id: editingId ?? 0, name: String(f.get("name")), planKind: String(f.get("planKind")), monthlyValueCents: Math.round(Number(f.get("value")) * 100), maxUses: Number(f.get("uses")), barberPayoutCents: Math.round(Number(f.get("payout")) * 100), active: f.get("active") === "on" }, "Plano salvo.")) setEditingId(null); } async function remove(id: number, name: string) { const linkedClients = data.clients.filter((client) => client.planId === id); if (linkedClients.length) { window.alert(`O plano ${name} ainda está ligado a ${linkedClients.length} ${linkedClients.length === 1 ? "cliente mensalista" : "clientes mensalistas"}. Altere o plano desses clientes antes de excluir.`); return; } if (!window.confirm(`Excluir o plano ${name}? Ele sairá da lista, mas os atendimentos antigos continuarão no histórico.`)) return; const ok = await post({ action: "delete-plan", id }, "Plano excluído. O histórico foi preservado."); if (ok && editingId === id) setEditingId(null); } return <SettingsLayout title="Planos de mensalistas" copy="Mensalidade, quantidade de usos e comissão da equipe." list={<div className="edit-list">{data.plans.map((x) => <EditRow key={x.id} title={x.name} detail={`${money(x.monthlyValueCents)} · ${x.maxUses} usos · comissão do funcionário ${money(x.barberPayoutCents)}`} active={x.active} onEdit={() => setEditingId(x.id)} onDelete={() => void remove(x.id, x.name)} pending={pending} />)}</div>} form={<><SectionTitle title={item ? "Editar plano" : "Novo plano"} copy="Mudanças valem para os próximos registros." /><form className="app-form" onSubmit={submit} key={item?.id ?? "new"}><Field label="Nome"><input name="name" defaultValue={item?.name ?? ""} required /></Field><Field label="Serviço incluído"><select name="planKind" defaultValue={item?.planKind ?? data.services[0]?.name}>{data.services.map((x) => <option key={x.id}>{x.name}</option>)}</select></Field><Field label="Mensalidade (R$)"><input name="value" type="number" step="0.01" defaultValue={(item?.monthlyValueCents ?? 0) / 100} /></Field><Field label="Usos por mês"><input name="uses" type="number" min="1" defaultValue={item?.maxUses ?? 4} /></Field><Field label="Comissão por uso ao funcionário (R$)"><input name="payout" type="number" step="0.01" defaultValue={(item?.barberPayoutCents ?? 0) / 100} /></Field><p className="form-note">Essa comissão é aplicada somente quando um funcionário atende. Quando o proprietário atende, o valor permanece na barbearia.</p><label className="check"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Plano ativo</label><button className="primary-button" disabled={pending}>Salvar plano</button></form></>} />; }
function ServiceSettings({ data, post, pending, editingId, setEditingId }: SettingProps) {
  const item = data.services.find((x) => x.id === editingId);
  async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); if (await post({ action: "save-service", id: editingId ?? 0, name: String(f.get("name")), priceCents: Math.round(Number(f.get("price")) * 100), durationMinutes: Number(f.get("durationMinutes")), active: f.get("active") === "on" }, "Serviço salvo.")) setEditingId(null); }
  async function remove(id: number, name: string) { if (!window.confirm(`Excluir o serviço ${name}? Ele sairá das novas marcações, mas os registros e agendamentos antigos continuarão no histórico.`)) return; const ok = await post({ action: "delete-service", id }, "Serviço excluído. O histórico foi preservado."); if (ok && editingId === id) setEditingId(null); }
  return <SettingsLayout title="Serviços e preços" copy="Preço do atendimento e duração usada somente na agenda inteligente." list={<div className="edit-list">{data.services.map((x) => <EditRow key={x.id} title={x.name} detail={`${money(x.priceCents)} · ${x.durationMinutes} min na agenda`} active={x.active} onEdit={() => setEditingId(x.id)} onDelete={() => void remove(x.id, x.name)} pending={pending} />)}</div>} form={<><SectionTitle title={item ? "Editar serviço" : "Novo serviço"} copy="A duração não interfere nos registros avulsos." /><form className="app-form" onSubmit={submit} key={item?.id ?? "new"}><Field label="Serviço"><input name="name" defaultValue={item?.name ?? ""} required /></Field><Field label="Preço (R$)"><input name="price" type="number" step="0.01" defaultValue={(item?.priceCents ?? 0) / 100} /></Field><Field label="Duração na agenda (minutos)"><input name="durationMinutes" type="number" min="5" max="480" step="5" defaultValue={item?.durationMinutes ?? 30} required /></Field><label className="check"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Serviço ativo</label><button className="primary-button" disabled={pending}>Salvar serviço</button></form></>} />;
}
function AgendaSettings({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) { async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); await post({ action: "save-agenda-settings", useServiceDuration: f.get("useServiceDuration") === "on", openingTime: String(f.get("openingTime")), closingTime: String(f.get("closingTime")) }, "Configuração da agenda atualizada."); } return <section className="settings-layout agenda-settings-layout"><div className="panel agenda-settings-info"><SectionTitle title="Agenda inteligente" copy="Cada barbearia escolhe como prefere trabalhar." /><div className="agenda-choice-list"><article><span>Ligada</span><strong>Horários por duração</strong><small>Evita sobreposição e respeita o expediente.</small></article><article><span>Desligada</span><strong>Agenda simples</strong><small>Bloqueia apenas horários exatamente iguais.</small></article><article><span>Sempre livre</span><strong>Registros avulsos</strong><small>Nunca são afetados por esta configuração.</small></article></div></div><div className="panel form-card compact"><SectionTitle title="Configurar agenda" copy="Você pode mudar esta opção quando quiser." /><form className="app-form" onSubmit={submit}><label className="agenda-toggle"><input name="useServiceDuration" type="checkbox" defaultChecked={data.agendaSettings.useServiceDuration} /><span /><div><strong>Usar duração dos serviços</strong><small>Calcula automaticamente o fim de cada horário marcado</small></div></label><div className="field-grid"><Field label="Abertura"><input name="openingTime" type="time" step="60" defaultValue={data.agendaSettings.openingTime} required /></Field><Field label="Fechamento"><input name="closingTime" type="time" step="60" defaultValue={data.agendaSettings.closingTime} required /></Field></div><p className="agenda-settings-help">Esses horários só serão aplicados quando a duração inteligente estiver ligada.</p><button className="primary-button" disabled={pending}>{pending ? "Salvando..." : "Salvar configuração da agenda"}</button></form></div></section>; }
function PaymentSettings({ data, post, pending, editingId, setEditingId }: SettingProps) { const item = data.paymentMethods.find((x) => x.id === editingId); async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); if (await post({ action: "save-payment", id: editingId ?? 0, name: String(f.get("name")), feeBps: Math.round(Number(f.get("fee")) * 100) }, "Forma de pagamento salva.")) setEditingId(null); } return <SettingsLayout title="Formas de pagamento" copy="Taxas descontadas automaticamente." list={<div className="edit-list">{data.paymentMethods.map((x) => <EditRow key={x.id} title={x.name} detail={`${(x.feeBps / 100).toFixed(2).replace(".", ",")}% de taxa`} onEdit={() => setEditingId(x.id)} />)}</div>} form={<><SectionTitle title={item ? "Editar pagamento" : "Novo pagamento"} copy="Informe a taxa cobrada." /><form className="app-form" onSubmit={submit} key={item?.id ?? "new"}><Field label="Nome"><input name="name" defaultValue={item?.name ?? ""} required /></Field><Field label="Taxa (%)"><input name="fee" type="number" step="0.01" defaultValue={(item?.feeBps ?? 0) / 100} /></Field><button className="primary-button" disabled={pending}>Salvar pagamento</button></form></>} />; }
function TeamSettings({ data, post, pending, editingId, setEditingId }: SettingProps) {
  const item = data.team.find((x) => x.id === editingId);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const saved = await post({ action: "save-team", id: editingId ?? 0, name: String(f.get("name")), role: String(f.get("role")), loginEmail: String(f.get("loginEmail") ?? ""), accessRole: String(f.get("accessRole") ?? "barber"), commissionRateBps: Math.round(Number(f.get("commission")) * 100), active: f.get("active") === "on" }, "Profissional e acesso salvos.");
    if (!saved) return;
    const password = String(f.get("teamPassword") ?? "");
    if (editingId && password) {
      const passwordSaved = await post({ action: "set-team-password", teamMemberId: editingId, password }, "A nova senha do profissional já está valendo.");
      if (!passwordSaved) return;
    }
    setEditingId(null);
  }
  return <SettingsLayout title="Equipe e acessos" copy="Cada profissional entra com seu próprio e-mail e senha." list={<div className="edit-list">{data.team.map((x) => <EditRow key={x.id} title={x.name} detail={`${x.role} · ${x.loginEmail ? `${x.loginEmail} · ${x.hasPassword ? "login ativo" : "senha pendente"}` : "e-mail de acesso pendente"}`} active={x.active} onEdit={() => setEditingId(x.id)} />)}</div>} form={<><SectionTitle title={item ? "Editar profissional" : "Novo profissional"} copy={item ? "Altere o cadastro ou crie uma nova senha provisória." : "Cadastre primeiro o profissional; depois edite para criar a senha."} /><form className="app-form" onSubmit={submit} key={item?.id ?? "new"}><Field label="Nome"><input name="name" defaultValue={item?.name ?? ""} required /></Field><Field label="Função"><input name="role" defaultValue={item?.role ?? "Barbeiro"} /></Field><Field label="E-mail de acesso"><input name="loginEmail" type="email" autoCapitalize="none" autoComplete="off" placeholder="exemplo@icloud.com" defaultValue={item?.loginEmail ?? ""} /></Field><Field label="Permissão"><select name="accessRole" defaultValue={item?.accessRole ?? "barber"}><option value="barber">Barbeiro — somente os próprios dados</option><option value="owner">Administrador — acesso completo</option></select></Field>{item && item.id !== data.viewer.teamMemberId && <Field label={item.hasPassword ? "Nova senha provisória (opcional)" : "Senha provisória"}><PasswordInput name="teamPassword" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" /></Field>}<Field label="Comissão avulso (%)"><input name="commission" type="number" step="0.01" defaultValue={(item?.commissionRateBps ?? 0) / 100} /></Field><label className="check"><input name="active" type="checkbox" defaultChecked={item?.active ?? true} /> Profissional ativo</label><button className="primary-button" disabled={pending}>Salvar profissional e acesso</button></form></>} />;
}
function GoalSettings({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) { async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const f = new FormData(e.currentTarget); await post({ action: "save-goal", revenueCents: Math.round(Number(f.get("revenue")) * 100), grossProfitCents: Math.round(Number(f.get("gross")) * 100), expenseCents: Math.round(Number(f.get("expense")) * 100), netProfitCents: Math.round(Number(f.get("net")) * 100), attendanceTarget: Number(f.get("attendance")) }, "Metas atualizadas."); } return <section className="panel form-card config-goal"><SectionTitle title={`Metas de ${appMonthLabel()}`} copy="Altere os objetivos sempre que quiser." /><form className="app-form field-grid" onSubmit={submit}><Field label="Faturamento (R$)"><input name="revenue" type="number" step="0.01" defaultValue={data.goal.revenueCents / 100} /></Field><Field label="Lucro bruto (R$)"><input name="gross" type="number" step="0.01" defaultValue={data.goal.grossProfitCents / 100} /></Field><Field label="Despesas (R$)"><input name="expense" type="number" step="0.01" defaultValue={data.goal.expenseCents / 100} /></Field><Field label="Lucro líquido (R$)"><input name="net" type="number" step="0.01" defaultValue={data.goal.netProfitCents / 100} /></Field><Field label="Atendimentos"><input name="attendance" type="number" defaultValue={data.goal.attendanceTarget} /></Field><button className="primary-button" disabled={pending}>Salvar metas</button></form></section>; }
function PasswordSettings({ post, pending }: { post: Post; pending: boolean }) {
  const [localError, setLocalError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLocalError(null);
    const f = new FormData(e.currentTarget);
    const password = String(f.get("newPassword") ?? "");
    const confirmation = String(f.get("confirmPassword") ?? "");
    if (password !== confirmation) { setLocalError("As duas senhas precisam ser iguais."); return; }
    const saved = await post({ action: "change-my-password", password }, "Senha alterada com segurança. Entre novamente.");
    if (saved) window.location.assign("/api/auth/logout");
  }
  return <section className="panel form-card config-goal"><SectionTitle title="Trocar minha senha" copy="Crie uma senha diferente das que você usa em outros lugares." />{localError && <div className="notice error">{localError}</div>}<form className="app-form" onSubmit={submit}><Field label="Nova senha"><PasswordInput name="newPassword" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Mínimo de 6 caracteres" required /></Field><Field label="Confirmar nova senha"><PasswordInput name="confirmPassword" minLength={6} maxLength={128} autoComplete="new-password" placeholder="Digite novamente" required /></Field><p className="form-note">Ao salvar, o Cortou Anotou encerrará sua sessão. Entre novamente usando a nova senha.</p><button className="primary-button" disabled={pending}>{pending ? "Alterando..." : "Alterar minha senha"}</button></form></section>;
}
type SettingProps = { data: DashboardData; post: Post; pending: boolean; editingId: number | null; setEditingId: (id: number | null) => void };

function OwnerPayoutEditor({ data, post, pending }: { data: DashboardData; post: Post; pending: boolean }) {
  const [editingOwnerPayout, setEditingOwnerPayout] = useState(false);
  const owner = data.team.find((member) => member.id === data.viewer.teamMemberId);

  async function saveOwnerPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!owner) return;
    const form = new FormData(event.currentTarget);
    const commission = Number(form.get("commission") ?? 0);
    if (!Number.isFinite(commission) || commission < 0 || commission > 100) return;
    const saved = await post({
      action: "save-team",
      id: owner.id,
      name: owner.name,
      role: owner.role,
      loginEmail: owner.loginEmail ?? data.viewer.email,
      accessRole: "owner",
      commissionRateBps: Math.round(commission * 100),
      active: true,
    }, "Sua comissão de proprietário foi atualizada. Os próximos atendimentos usarão essa porcentagem.");
    if (saved) setEditingOwnerPayout(false);
  }

  if (!owner) return null;
  return <section className="panel owner-payout-card">
      <div>
        <span>MINHA COMISSÃO COMO BARBEIRO</span>
        <h2>{(owner.commissionRateBps / 100).toFixed(2).replace(".", ",")}%</h2>
        <p>Você é administrador e também pode receber comissão pelos próprios atendimentos avulsos.</p>
      </div>
      {!editingOwnerPayout ? <button type="button" className="primary-button" onClick={() => setEditingOwnerPayout(true)}>Editar minha comissão</button> : <form className="owner-payout-form" onSubmit={saveOwnerPayout}>
        <Field label="Comissão nos meus atendimentos avulsos (%)"><input name="commission" type="number" min="0" max="100" step="0.01" defaultValue={(owner.commissionRateBps / 100).toFixed(2)} required autoFocus /></Field>
        <small>Exemplo: 65% para você e 35% ficam no resultado da barbearia. Registros já lançados não mudam sozinhos; ao editá-los, o valor é recalculado.</small>
        <div><button className="primary-button" disabled={pending}>{pending ? "Salvando..." : "Salvar comissão"}</button><button type="button" className="cancel-button" onClick={() => setEditingOwnerPayout(false)}>Cancelar</button></div>
      </form>}
    </section>;
}
function DateFilter({ start, end, setStart, setEnd }: { start: string; end: string; setStart: (value: string) => void; setEnd: (value: string) => void }) {
  const currentDate = appDate();
  const selectedMonth = /^\d{4}-\d{2}/.test(start) ? start.slice(0, 7) : appMonth(currentDate);
  function selectMonth(month: string) {
    const period = appMonthPeriod(month, currentDate);
    setStart(period.start);
    setEnd(period.end);
  }
  return <section className="panel date-filter" data-tour="date-filter"><div><strong>Período da análise</strong><small>Escolha as datas ou navegue mês por mês.</small></div><label><span>DE</span><input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label><span>ATÉ</span><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label><div className="date-shortcuts"><button type="button" onClick={() => { setStart(currentDate); setEnd(currentDate); }}>Hoje</button><button type="button" onClick={() => selectMonth(shiftAppMonth(selectedMonth, -1))}>‹ Anterior</button><button type="button" onClick={() => selectMonth(appMonth(currentDate))}>Mês atual</button><button type="button" disabled={selectedMonth >= appMonth(currentDate)} onClick={() => selectMonth(shiftAppMonth(selectedMonth, 1))}>Próximo ›</button></div></section>;
}
function SectionTitle({ title, copy }: { title: string; copy: string }) { return <div className="panel-header"><div><h2>{title}</h2><p>{copy}</p></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Stat({ label, value, note, icon, tone, className = "" }: { label: string; value: string; note: string; icon: React.ReactNode; tone: string; className?: string }) { return <article className={`stat-card ${className}`.trim()}><div className={`stat-icon ${tone}`}>{icon}</div><p>{label}</p><h2>{value}</h2><small>{note}</small></article>; }
function Progress({ value }: { value: number }) { return <div className="progress"><i style={{ width: `${value}%` }} /></div>; }
function Empty({ text }: { text: string }) { return <div className="empty"><span><AppIcon name="clock" /></span><p>{text}</p></div>; }
function QuickGuide() {
  const [curiosity, setCuriosity] = useState(barbershopCuriosities[0]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setCuriosity(barbershopCuriosities[Math.floor(Math.random() * barbershopCuriosities.length)]));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return <aside className="panel guide curiosity-card"><span><AppIcon name="spark" /></span><p className="curiosity-label">CURIOSIDADE DA BARBEARIA</p><h2>Você sabia?</h2><p className="curiosity-text">{curiosity}</p><small>Uma nova curiosidade aparece a cada acesso.</small></aside>;
}
