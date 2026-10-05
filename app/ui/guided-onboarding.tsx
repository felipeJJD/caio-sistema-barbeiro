"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DashboardData } from "../../db/dashboard";

type TourStep = { selector: string; title: string; copy: string; configTab?: string };
type TourState = { id: string; steps: TourStep[]; index: number; restoreConfigTab?: string };
type OnboardingProgress = { version: 2; enabled: boolean; seen: string[]; reviewed: string[]; checklistDismissed: boolean };
type ChecklistItem = { key: string; title: string; copy: string; done: boolean; tab: string };

type TourAccess = {
  owner: boolean;
  teamSettings: boolean;
};

const TOUR_VERSION = 2;
const EMPTY_PROGRESS: OnboardingProgress = { version: 2, enabled: false, seen: [], reviewed: [], checklistDismissed: false };

function clean(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function currentSection() {
  const raw = new URLSearchParams(window.location.search).get("section");
  if (!raw) return "Painel";
  if (raw === "Historico") return "Histórico";
  if (raw === "Usuarios") return "Equipe";
  return raw;
}

function findButton(selector: string, label: string) {
  const expected = clean(label).trim();
  return Array.from(document.querySelectorAll<HTMLButtonElement>(selector)).find((button) => clean(button.textContent ?? "").trim() === expected);
}

function clickMainSection(label: string) {
  const button = findButton(".desktop-navigation .nav-item", label);
  button?.click();
  return Boolean(button);
}

function clickConfigTab(label: string) {
  const button = findButton(".config-tabs button", label);
  button?.click();
  return Boolean(button);
}

function activeConfigTab() {
  return document.querySelector<HTMLButtonElement>(".config-tabs button.active")?.textContent?.trim() || "";
}

function visible(element: Element | null) {
  if (!(element instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function readProgress(key: string, autoEnabled: boolean): OnboardingProgress {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null") as Partial<OnboardingProgress> | null;
    if (!value || value.version !== TOUR_VERSION) return { ...EMPTY_PROGRESS, enabled: autoEnabled };
    return {
      version: 2,
      enabled: Boolean(value.enabled || autoEnabled),
      seen: Array.isArray(value.seen) ? value.seen.filter((item): item is string => typeof item === "string") : [],
      reviewed: Array.isArray(value.reviewed) ? value.reviewed.filter((item): item is string => typeof item === "string") : [],
      checklistDismissed: Boolean(value.checklistDismissed),
    };
  } catch {
    return { ...EMPTY_PROGRESS, enabled: autoEnabled };
  }
}

function sectionTour(section: string, access: TourAccess): TourStep[] {
  if (section === "Painel") return [
    { selector: ".topbar", title: "Seja bem-vindo ao Cortou Anotou", copy: "Este é o seu ponto de partida. Aqui você acompanha a barbearia e entra rapidamente nas áreas que mais usa." },
    { selector: ".section-stage .stat-grid", title: "Resumo rápido", copy: "Estes cartões mostram os principais números do período. Eles mudam conforme os atendimentos, agenda e financeiro." },
    { selector: ".section-stage [data-tour='quick-actions'], .section-stage .dashboard-grid", title: "Atalhos do dia a dia", copy: "Use os atalhos para registrar atendimento, abrir a agenda, consultar histórico e chegar mais rápido ao que precisa." },
    ...(access.owner ? [{ selector: ".ca-onboarding-checklist", title: "Configure o essencial", copy: "Este checklist mostra o que vale revisar primeiro para deixar o C|A pronto para trabalhar com sua barbearia." }] : []),
  ];

  if (section === "Agenda") return [
    { selector: ".section-stage .agenda-mode-note", title: "Como sua agenda está funcionando", copy: "Aqui você vê se a duração inteligente está ligada e como o C|A protege os horários contra sobreposição." },
    { selector: ".section-stage .appointment-list", title: "Seus horários", copy: "Pedidos, confirmações, Pix, lembretes, remarcações e cancelamentos ficam organizados nesta lista." },
    { selector: ".section-stage .form-card, .section-stage form", title: "Criar ou ajustar um horário", copy: "Use o formulário para agendar internamente. Serviço, profissional, data e horário ficam ligados ao mesmo agendamento." },
  ];

  if (section === "Registrar") return [
    { selector: ".section-stage .type-switch", title: "Escolha o tipo de registro", copy: "Você pode lançar atendimento avulso, mensalista ou somente uma venda de produto." },
    { selector: ".section-stage .app-form", title: "Preencha só o necessário", copy: "Cliente, profissional, serviço e pagamento alimentam Histórico, Financeiro e comissões automaticamente." },
    { selector: ".section-stage .calculation", title: "Confira antes de salvar", copy: "O C|A mostra o valor calculado e explica o que será aplicado antes do registro." },
    { selector: ".section-stage .primary-button", title: "Salvar atendimento", copy: "Ao salvar, os dados entram no histórico sem você precisar atualizar a página." },
  ];

  if (section === "Histórico") return [
    { selector: ".section-stage .history-payment-summary, .section-stage .stat-grid", title: "Resumo do período", copy: "Veja quanto entrou por forma de pagamento e acompanhe comissões e valores do período escolhido." },
    { selector: ".section-stage .history-export-bar", title: "Exportar quando precisar", copy: "Você pode gerar uma planilha organizada para conferência e fechamento." },
    { selector: ".section-stage .table-wrap", title: "Tudo que já aconteceu", copy: "Atendimentos, produtos e horários concluídos ficam aqui. As ações disponíveis respeitam o seu nível de acesso." },
  ];

  if (section === "Produtos") return [
    { selector: ".section-stage .product-stat-grid", title: "Resumo de produtos", copy: "Acompanhe vendas, lucro ou comissão, unidades vendidas e avisos de estoque." },
    { selector: ".section-stage .product-inventory", title: "Estoque", copy: "Cadastre produtos e acompanhe quantidade, custo, preço e comissão de venda." },
    { selector: ".section-stage .product-sale-card", title: "Venda rápida", copy: "Registre uma venda em poucos campos. O estoque baixa automaticamente e a venda aparece no Histórico." },
  ];

  if (section === "Financeiro") return [
    { selector: ".section-stage .finance-stats", title: "Leitura financeira", copy: "O C|A separa receita, mensalidades, produtos, taxas, comissões, despesas e o lucro que realmente sobrou." },
    { selector: ".section-stage .finance-goals-panel", title: "Metas", copy: "Abra esta área quando quiser definir e acompanhar metas de faturamento, lucro e atendimentos." },
  ];

  if (section === "Mensalistas") return [
    { selector: ".section-stage .panel", title: "Mensalistas", copy: "Planos, créditos, pagamentos e renovações ficam ligados ao cliente para você acompanhar o uso sem fazer conta manual." },
  ];

  if (section === "Equipe") return [
    { selector: ".section-stage .panel", title: "Equipe e acessos", copy: "Cadastre profissionais, defina acesso, comissão e horários. Cada pessoa entra no próprio espaço." },
  ];

  if (section === "WhatsApp") return [
    { selector: ".section-stage .panel", title: "WhatsApp do C|A", copy: "Esta área reúne conexão e automações de atendimento. Faça mudanças aqui somente quando souber qual número deve ficar conectado." },
  ];

  if (section === "Minha Grana") return [
    { selector: ".section-stage .panel", title: "Minha Grana", copy: "Aqui o profissional acompanha valores, adiantamentos e pagamentos sem enxergar o financeiro completo da barbearia." },
  ];

  if (section === "Configurações") return [
    { selector: ".config-tabs", title: "Configurações sem bagunça", copy: "As configurações são separadas por assunto. Você não precisa ajustar tudo de uma vez." },
    { selector: ".settings-layout", configTab: "Serviços", title: "Serviços, preços e duração", copy: "Revise preço e duração. A duração é usada pela agenda inteligente para evitar sobreposição." },
    { selector: ".agenda-settings-layout", configTab: "Agenda", title: "Expediente da barbearia", copy: "Defina dias e horários de funcionamento. O link público acompanha estes horários automaticamente." },
    { selector: ".public-link-layout", configTab: "Agendamento público", title: "Seu link de agendamento", copy: "Este é o endereço que você manda ao cliente. Aqui também decide se cada pedido precisa de aprovação." },
    { selector: ".settings-layout", configTab: "Pagamentos", title: "Taxas da maquininha", copy: "Cadastre as formas de pagamento e a taxa de cada uma. O Financeiro usa esses percentuais nos cálculos." },
    ...(access.teamSettings ? [{ selector: ".settings-layout", configTab: "Equipe", title: "Profissionais e permissões", copy: "Revise acessos, comissões e horários da equipe para cada profissional trabalhar somente com o que precisa." }] : []),
  ];

  return [];
}

function moreTour(): TourStep[] {
  return [
    { selector: ".mobile-drawer .mobile-menu-group:first-of-type", title: "Operação", copy: "Estas são as áreas usadas no atendimento do dia a dia." },
    { selector: ".mobile-drawer .mobile-menu-group.management", title: "Gestão", copy: "Aqui ficam as áreas administrativas disponíveis para o seu acesso." },
    { selector: ".mobile-drawer .mobile-drawer-assistant", title: "Ajuda quando precisar", copy: "A Central de ajuda fica disponível sem tirar você do aplicativo." },
  ];
}

export function GuidedOnboarding() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [appReady, setAppReady] = useState(false);
  const [section, setSection] = useState("Painel");
  const [progress, setProgress] = useState<OnboardingProgress>(EMPTY_PROGRESS);
  const [progressReady, setProgressReady] = useState(false);
  const [tour, setTour] = useState<TourState | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [desktopHost, setDesktopHost] = useState<Element | null>(null);
  const [mobileHost, setMobileHost] = useState<Element | null>(null);
  const [checklistHost, setChecklistHost] = useState<Element | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const progressKeyRef = useRef("");
  const startTimerRef = useRef<number | null>(null);

  const access = useMemo<TourAccess>(() => ({
    owner: Boolean(data?.viewer.isOwner),
    teamSettings: Boolean(data?.viewer.isOwner && data.viewer.accountType !== "individual"),
  }), [data?.viewer.accountType, data?.viewer.isOwner]);

  const progressIdentity = data ? `ca:onboarding:v${TOUR_VERSION}:${data.viewer.teamMemberId}` : "";
  const autoEnabled = Boolean(data && (data.viewer.organizationStatus === "trial" || data.viewer.organizationStatus === "pending_email"));

  const persistProgress = useCallback((next: OnboardingProgress) => {
    setProgress(next);
    if (!progressKeyRef.current) return;
    try { window.localStorage.setItem(progressKeyRef.current, JSON.stringify(next)); } catch { /* storage indisponível não bloqueia o app */ }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (window.location.pathname !== "/" || !document.querySelector(".app-shell")) return;
    try {
      const response = await fetch("/api/dashboard-period", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { data?: DashboardData };
      if (payload.data) setData(payload.data);
    } catch {
      // O onboarding é acessório e nunca deve impedir o uso do aplicativo.
    }
  }, []);

  useEffect(() => {
    const discover = () => {
      const ready = window.location.pathname === "/" && Boolean(document.querySelector(".app-shell"));
      setAppReady(ready);
      if (!ready) return;
      setSection(currentSection());
      const desktop = document.querySelector(".sidebar-bottom");
      const mobile = document.querySelector(".mobile-drawer .mobile-drawer-scroll");
      const checklist = document.querySelector(".section-stage");
      setDesktopHost((current) => current === desktop ? current : desktop);
      setMobileHost((current) => current === mobile ? current : mobile);
      setChecklistHost((current) => current === checklist ? current : checklist);
      setDrawerOpen(Boolean(document.querySelector(".mobile-drawer")));
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", discover);
    window.addEventListener("focus", discover);
    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", discover);
      window.removeEventListener("focus", discover);
    };
  }, []);

  useEffect(() => {
    if (!appReady) return;
    const timer = window.setTimeout(() => { void loadDashboard(); }, 0);
    return () => window.clearTimeout(timer);
  }, [appReady, section, loadDashboard]);

  useEffect(() => {
    if (!progressIdentity) return;
    const timer = window.setTimeout(() => {
      progressKeyRef.current = progressIdentity;
      setProgress(readProgress(progressIdentity, autoEnabled));
      setProgressReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoEnabled, progressIdentity]);

  const markSeen = useCallback((id: string) => {
    if (!id || progress.seen.includes(id)) return;
    persistProgress({ ...progress, seen: [...progress.seen, id] });
  }, [persistProgress, progress]);

  const markReviewed = useCallback((key: string) => {
    if (progress.reviewed.includes(key)) return;
    persistProgress({ ...progress, reviewed: [...progress.reviewed, key] });
  }, [persistProgress, progress]);

  const finishTour = useCallback((mark = true) => {
    const current = tour;
    setTour(null);
    setTargetRect(null);
    targetRef.current = null;
    if (current?.restoreConfigTab) window.setTimeout(() => clickConfigTab(current.restoreConfigTab || ""), 80);
    if (mark && current) markSeen(current.id);
  }, [markSeen, tour]);

  const prepareStep = useCallback(async (state: TourState, index: number) => {
    let candidate = index;
    while (candidate < state.steps.length) {
      const step = state.steps[candidate];
      if (step.configTab) {
        clickConfigTab(step.configTab);
        await new Promise((resolve) => window.setTimeout(resolve, 120));
        if (step.configTab === "Serviços") markReviewed("services");
        if (step.configTab === "Agenda") markReviewed("agenda");
        if (step.configTab === "Agendamento público") markReviewed("public-booking");
        if (step.configTab === "Pagamentos") markReviewed("payments");
        if (step.configTab === "Equipe") markReviewed("team");
      }
      const target = document.querySelector<HTMLElement>(step.selector);
      if (target && visible(target)) {
        targetRef.current = target;
        const initial = target.getBoundingClientRect();
        if (initial.top < 16 || initial.bottom > window.innerHeight - 16) {
          target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center", inline: "nearest" });
          await new Promise((resolve) => window.setTimeout(resolve, 300));
        }
        setTargetRect(target.getBoundingClientRect());
        if (candidate !== state.index) setTour({ ...state, index: candidate });
        return;
      }
      candidate += 1;
    }
    setTour(null);
    setTargetRect(null);
    targetRef.current = null;
    if (state.restoreConfigTab) window.setTimeout(() => clickConfigTab(state.restoreConfigTab || ""), 80);
    markSeen(state.id);
  }, [markReviewed, markSeen]);

  const startTour = useCallback((id: string, steps: TourStep[]) => {
    if (!steps.length || tour) return;
    const state: TourState = { id, steps, index: 0, restoreConfigTab: id === "Configurações" ? activeConfigTab() : undefined };
    setTour(state);
    void prepareStep(state, 0);
  }, [prepareStep, tour]);

  useEffect(() => {
    if (!appReady || !data || !progressReady || !progress.enabled || tour || document.querySelector(".app-loading-screen")) return;
    if (progress.seen.includes(section)) return;
    const steps = sectionTour(section, access);
    if (!steps.length) return;
    if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
    startTimerRef.current = window.setTimeout(() => startTour(section, steps), 420);
    return () => {
      if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    };
  }, [access, appReady, data, progress.enabled, progress.seen, progressReady, section, startTour, tour]);

  useEffect(() => {
    if (!drawerOpen || !data || !progressReady || !progress.enabled || progress.seen.includes("Mais") || tour) return;
    const timer = window.setTimeout(() => startTour("Mais", moreTour()), 260);
    return () => window.clearTimeout(timer);
  }, [data, drawerOpen, progress.enabled, progress.seen, progressReady, startTour, tour]);

  useEffect(() => {
    if (!tour) return;
    const update = () => {
      const target = targetRef.current;
      if (target && visible(target)) setTargetRect(target.getBoundingClientRect());
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") finishTour(true); };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [finishTour, tour]);

  const checklistItems = useMemo<ChecklistItem[]>(() => {
    if (!data?.viewer.isOwner) return [];
    const activeServices = data.services.filter((item) => item.active);
    const hoursReady = data.agendaSettings.weeklyHours.some((row) => row.enabled && row.openingTime < row.closingTime);
    const cardFeeReady = data.paymentMethods.some((method) => /credito|debito|cartao/.test(clean(method.name)) && method.feeBps > 0);
    const teamReady = data.viewer.accountType === "individual" || data.team.filter((member) => member.active).length > 1;
    return [
      { key: "services", title: "Serviços e preços", copy: "Confira preço e duração dos serviços.", done: activeServices.length > 0 && activeServices.every((item) => item.priceCents > 0 && item.durationMinutes >= 5), tab: "Serviços" },
      { key: "agenda", title: "Expediente", copy: "Defina os dias e horários em que a agenda pode receber marcações.", done: hoursReady, tab: "Agenda" },
      { key: "public-booking", title: "Link de agendamento", copy: "Confira o link público e se os pedidos precisam de aprovação.", done: Boolean(data.agendaSettings.publicBookingEnabled && data.agendaSettings.publicBookingSlug), tab: "Agendamento público" },
      { key: "payments", title: "Taxas da maquininha", copy: "Revise Débito, Crédito e outras taxas usadas no Financeiro.", done: cardFeeReady || progress.reviewed.includes("payments"), tab: "Pagamentos" },
      ...(data.viewer.accountType === "individual" ? [] : [{ key: "team", title: "Equipe e acessos", copy: "Confira profissionais, comissões, logins e horários.", done: teamReady || progress.reviewed.includes("team"), tab: "Equipe" }]),
    ];
  }, [data, progress.reviewed]);

  const checklistDone = checklistItems.filter((item) => item.done).length;
  const showChecklist = Boolean(appReady && data?.viewer.isOwner && section === "Painel" && checklistHost && !progress.checklistDismissed && (progress.enabled || autoEnabled));

  const openChecklistItem = useCallback((item: ChecklistItem) => {
    markReviewed(item.key);
    if (!clickMainSection("Configurações")) return;
    window.setTimeout(() => clickConfigTab(item.tab), 180);
  }, [markReviewed]);

  const restart = useCallback(() => {
    persistProgress({ version: 2, enabled: true, seen: [], reviewed: progress.reviewed, checklistDismissed: false });
    finishTour(false);
    clickMainSection("Painel");
    window.setTimeout(() => setSection("Painel"), 100);
  }, [finishTour, persistProgress, progress.reviewed]);

  const dismissChecklist = useCallback(() => {
    persistProgress({ ...progress, checklistDismissed: true });
  }, [persistProgress, progress]);

  if (!appReady || !data || !progressReady) return null;

  const currentStep = tour?.steps[tour.index] ?? null;
  const cardStyle = (() => {
    if (!targetRect) return undefined;
    const width = Math.min(360, window.innerWidth - 32);
    const left = Math.min(Math.max(16, targetRect.left), Math.max(16, window.innerWidth - width - 16));
    const roomBelow = window.innerHeight - targetRect.bottom;
    const top = roomBelow >= 245 ? targetRect.bottom + 14 : Math.max(16, targetRect.top - 224);
    return { left, top, width };
  })();

  const nextStep = () => {
    if (!tour) return;
    const index = tour.index + 1;
    if (index >= tour.steps.length) {
      finishTour(true);
      return;
    }
    const next = { ...tour, index };
    setTour(next);
    void prepareStep(next, index);
  };

  return <>
    {desktopHost && createPortal(<button type="button" className="ca-onboarding-restart" onClick={restart}><span>?</span><div><strong>Conhecer o C|A</strong><small>Ver o tour guiado novamente</small></div></button>, desktopHost)}
    {mobileHost && createPortal(<button type="button" className="ca-onboarding-restart mobile" onClick={restart}><span>?</span><div><strong>Conhecer o C|A</strong><small>Tour rápido das áreas principais</small></div><i>›</i></button>, mobileHost)}

    {showChecklist && checklistHost && createPortal(<section className="ca-onboarding-checklist panel" aria-label="Checklist de configuração inicial">
      <div className="ca-checklist-heading"><div><span>PRIMEIROS PASSOS</span><h2>Configure seu C|A</h2><p>Revise só o essencial agora. O restante você aprende conforme usar.</p></div><button type="button" onClick={dismissChecklist}>Ocultar</button></div>
      <div className="ca-checklist-progress"><span><b>{checklistDone}</b> de {checklistItems.length} concluídos</span><i><b style={{ width: `${checklistItems.length ? Math.round(checklistDone / checklistItems.length * 100) : 0}%` }} /></i></div>
      <div className="ca-checklist-items">{checklistItems.map((item) => <button type="button" key={item.key} className={item.done ? "done" : ""} onClick={() => openChecklistItem(item)}><span>{item.done ? "✓" : "○"}</span><div><strong>{item.title}</strong><small>{item.copy}</small></div><b>{item.done ? "Revisar" : "Abrir"}</b></button>)}</div>
    </section>, checklistHost)}

    {tour && currentStep && targetRect && createPortal(<div className="ca-guided-tour" role="dialog" aria-modal="true" aria-label={`Tour guiado: ${currentStep.title}`}>
      <div className="ca-tour-spotlight" style={{ left: Math.max(8, targetRect.left - 7), top: Math.max(8, targetRect.top - 7), width: Math.max(24, targetRect.width + 14), height: Math.max(24, targetRect.height + 14) }} />
      <div className="ca-tour-card" style={cardStyle}>
        <div className="ca-tour-card-top"><span>{tour.index + 1}/{tour.steps.length}</span><button type="button" onClick={() => finishTour(true)} aria-label="Fechar tour">×</button></div>
        <h3>{currentStep.title}</h3><p>{currentStep.copy}</p>
        <div className="ca-tour-actions"><button type="button" className="secondary" onClick={() => finishTour(true)}>Fechar</button><button type="button" className="primary" onClick={nextStep}>{tour.index + 1 >= tour.steps.length ? "Entendi" : "Próximo"}</button></div>
      </div>
    </div>, document.body)}
  </>;
}
