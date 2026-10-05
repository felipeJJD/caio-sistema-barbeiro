"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DashboardData } from "../../db/dashboard";

import { sectionTour, configTour, moreTour, type TourStep, type TourAccess } from "../../lib/guided-tour-steps";
import { tourPresentation, compactTourTarget, type TourViewport } from "../../lib/guided-tour-layout";

type TourState = { id: string; steps: TourStep[]; index: number; restoreConfigTab?: string; restoreChartMode?: string; closeDrawer: boolean };
type OnboardingProgress = { version: 2; enabled: boolean; seen: string[]; reviewed: string[]; checklistDismissed: boolean };
type ChecklistItem = { key: string; title: string; copy: string; done: boolean; tab: string };

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
  const button = findButton(document.querySelector(".mobile-drawer") ? ".mobile-drawer-nav button" : ".desktop-navigation .nav-item", label);
  button?.click();
  return Boolean(button);
}

function clickConfigTab(label: string, reset = false) {
  const button = findButton(".config-tabs button", label);
  if (!button) return false;
  if (reset || !button.classList.contains("active")) button.click();
  return true;
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

function findTarget(selector: string) {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).find(visible) ?? null;
}

function viewport(): TourViewport {
  const view = window.visualViewport;
  const top = view?.offsetTop ?? 0;
  const height = view?.height ?? window.innerHeight;
  return { width: view?.width ?? window.innerWidth, height, top, bottom: top + height };
}

function closeDrawer() {
  document.querySelector<HTMLButtonElement>(".mobile-menu-button[aria-expanded='true']")?.click();
}

const pause = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function waitForTarget(selector: string, cancelled: () => boolean) {
  // Async charts, React editors and menu animations must finish before measuring.
  for (let attempt = 0; attempt < 20 && !cancelled(); attempt++) {
    const target = findTarget(selector);
    if (target) return target;
    await pause(60);
  }
  return null;
}

async function settledRect(target: HTMLElement, cancelled: () => boolean) {
  let previous = target.getBoundingClientRect();
  let stable = 0;
  for (let frame = 0; frame < 55 && !cancelled(); frame++) {
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    const next = target.getBoundingClientRect();
    stable = Math.abs(next.top - previous.top) < 0.5 && Math.abs(next.left - previous.left) < 0.5 && Math.abs(next.height - previous.height) < 0.5 ? stable + 1 : 0;
    previous = next;
    if (stable >= 4) break;
  }
  return previous;
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
  const [configTab, setConfigTab] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [layout, setLayout] = useState<{ view: TourViewport; copyHeight: number; controlsTop: number } | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const transitionRef = useRef(0);
  const startingRef = useRef(false);
  const targetRef = useRef<HTMLElement | null>(null);
  const progressKeyRef = useRef("");
  const progressRef = useRef<OnboardingProgress>(EMPTY_PROGRESS);
  const startTimerRef = useRef<number | null>(null);

  const access = useMemo<TourAccess>(() => ({
    owner: Boolean(data?.viewer.isOwner),
    teamSettings: Boolean(data?.viewer.isOwner && data.viewer.accountType !== "individual"),
  }), [data?.viewer.accountType, data?.viewer.isOwner]);

  const progressIdentity = data ? `ca:onboarding:v${TOUR_VERSION}:${data.viewer.teamMemberId}` : "";
  const autoEnabled = Boolean(data && (data.viewer.organizationStatus === "trial" || data.viewer.organizationStatus === "pending_email"));

  const persistProgress = useCallback((next: OnboardingProgress) => {
    progressRef.current = next;
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
      const checklist = document.querySelector(".ca-checklist-host");
      setConfigTab(activeConfigTab());
      setDesktopHost((current) => current === desktop ? current : desktop);
      setMobileHost((current) => current === mobile ? current : mobile);
      setChecklistHost((current) => current === checklist ? current : checklist);
      setDrawerOpen(Boolean(document.querySelector(".mobile-drawer")));
    };
    discover();
    const observer = new MutationObserver(discover);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
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
  }, [appReady, section, configTab, loadDashboard]);

  useEffect(() => {
    if (!progressIdentity) return;
    const timer = window.setTimeout(() => {
      progressKeyRef.current = progressIdentity;
      const next = readProgress(progressIdentity, autoEnabled);
      progressRef.current = next;
      setProgress(next);
      setProgressReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [autoEnabled, progressIdentity]);

  const markSeen = useCallback((id: string) => {
    const current = progressRef.current;
    if (!id || current.seen.includes(id)) return;
    persistProgress({ ...current, seen: [...current.seen, id] });
  }, [persistProgress]);

  const markReviewed = useCallback((key: string) => {
    const current = progressRef.current;
    if (current.reviewed.includes(key)) return;
    persistProgress({ ...current, reviewed: [...current.reviewed, key] });
  }, [persistProgress]);

  const restoreView = useCallback((state: TourState) => {
    if (state.restoreConfigTab && currentSection() === "Configurações") clickConfigTab(state.restoreConfigTab, true);
    if (state.restoreChartMode && currentSection() === "Financeiro") findButton("[role='group'][aria-label='Tipo de gráfico'] button", state.restoreChartMode)?.click();
    if (state.closeDrawer) closeDrawer();
  }, []);

  const finishTour = useCallback((mark = true) => {
    transitionRef.current++;
    startingRef.current = false;
    const current = tour;
    setTour(null);
    setPreparing(false);
    setTargetRect(null);
    targetRef.current = null;
    if (current) restoreView(current);
    previousFocusRef.current?.focus({ preventScroll: true });
    if (mark && current) markSeen(current.id);
  }, [markSeen, restoreView, tour]);

  const prepareStep = useCallback(async (state: TourState, index: number) => {
    const request = ++transitionRef.current;
    const cancelled = () => request !== transitionRef.current;
    setPreparing(true);
    setTargetRect(null);
    targetRef.current = null;
    for (let candidate = index; candidate < state.steps.length && !cancelled(); candidate++) {
      const step = state.steps[candidate];
      if (step.configTab) {
        clickConfigTab(step.configTab);
        await pause(100);
        if (cancelled()) return;
      }
      if (step.openMenu && !findTarget(step.selector)) {
        document.querySelector<HTMLButtonElement>(".mobile-menu-button[aria-expanded='false']")?.click();
        await pause(400);
        if (cancelled()) return;
      }
      const button = step.clickSelector ? findTarget(step.clickSelector) : step.clickButton ? findButton(step.clickButton.selector, step.clickButton.label) : null;
      if (button) {
        button.click();
        await pause(160);
        if (cancelled()) return;
      }
      const target = await waitForTarget(step.selector, cancelled);
      if (cancelled()) return;
      if (!target) continue; // An empty account must never fall back to a large container.
      const view = viewport();
      const initial = target.getBoundingClientRect();
      if (!["Agenda", "Registrar", "Histórico"].includes(state.id) && !compactTourTarget(initial, view)) continue;
      const header = window.innerWidth <= 680 ? document.querySelector(".sidebar")?.getBoundingClientRect().bottom ?? view.top : view.top;
      const controlsTop = controlsRef.current?.getBoundingClientRect().top ?? view.bottom - 100;
      if (initial.top < header + 20 || initial.bottom > controlsTop - 155 || initial.left < 0 || initial.right > view.width) {
        target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center", inline: "nearest" });
        await pause(100);
        if (cancelled()) return;
      }
      const rect = await settledRect(target, cancelled);
      if (cancelled()) return;
      targetRef.current = target;
      setTargetRect(rect);
      setPreparing(false);
      setTour({ ...state, index: candidate });
      return;
    }
    if (cancelled()) return;
    startingRef.current = false;
    setTour(null);
    setPreparing(false);
    restoreView(state);
    markSeen(state.id);
  }, [markSeen, restoreView]);

  const startTour = useCallback((id: string, steps: TourStep[]) => {
    if (!steps.length || tour || startingRef.current) return;
    startingRef.current = true;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const state: TourState = {
      id, steps, index: 0,
      restoreConfigTab: id === "Configurações" ? activeConfigTab() : undefined,
      restoreChartMode: currentSection() === "Financeiro" ? document.querySelector("[role='group'][aria-label='Tipo de gráfico'] button[aria-pressed='true']")?.textContent?.trim() : undefined,
      closeDrawer: id !== "Mais" && !document.querySelector(".mobile-drawer"),
    };
    setTour(state);
    void prepareStep(state, 0);
  }, [prepareStep, tour]);

  useEffect(() => {
    if (!appReady || !data || !progressReady || !progress.enabled || tour || drawerOpen || document.querySelector(".app-loading-screen")) return;
    const miniSteps = section === "Configurações" && configTab !== "Primeiros passos" ? configTour(configTab, access) : [];
    if (section === "Configurações" && configTab !== "Primeiros passos" && !miniSteps.length) return;
    const id = miniSteps.length ? `Configurações:${configTab}` : section;
    if (progress.seen.includes(id)) return;
    const steps = miniSteps.length ? miniSteps : sectionTour(section, access);
    if (!steps.length) return;
    if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
    startTimerRef.current = window.setTimeout(() => startTour(id, steps), 420);
    return () => {
      if (startTimerRef.current) window.clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    };
  }, [access, appReady, configTab, data, drawerOpen, progress.enabled, progress.seen, progressReady, section, startTour, tour]);

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
      else setTargetRect(null);
      const view = viewport();
      setLayout({ view, copyHeight: copyRef.current?.getBoundingClientRect().height ?? 140, controlsTop: controlsRef.current?.getBoundingClientRect().top ?? view.bottom - 100 });
    };
    const frame = window.requestAnimationFrame(update);
    const resize = new ResizeObserver(update);
    if (copyRef.current) resize.observe(copyRef.current);
    if (controlsRef.current) resize.observe(controlsRef.current);
    if (targetRef.current) resize.observe(targetRef.current);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finishTour(true); }
      if (event.key === "Tab") {
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    // Keep keyboard focus inside the tour, without focusing or changing a real input.
    if (!dialogRef.current?.contains(document.activeElement)) controlsRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("keydown", keydown);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("keydown", keydown);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [finishTour, tour, targetRect?.width, targetRect?.height]);

  useEffect(() => () => { transitionRef.current++; }, []);

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
  const showChecklist = Boolean(appReady && data?.viewer.isOwner && section === "Configurações" && checklistHost);

  const openChecklistItem = useCallback((item: ChecklistItem) => {
    markReviewed(item.key);
    markSeen("Configurações");
    clickConfigTab(item.tab);
    startTour(`Configurações:${item.tab}`, configTour(item.tab, access));
  }, [access, markReviewed, markSeen, startTour]);

  const restart = useCallback(() => {
    persistProgress({ version: 2, enabled: true, seen: [], reviewed: progress.reviewed, checklistDismissed: false });
    finishTour(false);
    clickMainSection("Painel");
    window.setTimeout(() => setSection("Painel"), 100);
  }, [finishTour, persistProgress, progress.reviewed]);

  if (!appReady || !data || !progressReady) return null;

  const currentStep = tour?.steps[tour.index] ?? null;
  const view = layout?.view ?? viewport();
  const presentation = targetRect ? tourPresentation(targetRect, view, layout?.copyHeight ?? 140, layout?.controlsTop ?? view.bottom - 100) : null;
  const focus = presentation?.focus ?? null;
  const copyStyle = presentation?.copy ?? null;

  const nextStep = () => {
    if (!tour || preparing) return;
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
      <div className="ca-checklist-heading" data-tour="setup-heading"><div><span>PRIMEIROS PASSOS</span><h2>Configure seu C|A</h2><p>Escolha um item para revisar com uma orientação rápida.</p></div></div>
      <div className="ca-checklist-progress"><span><b>{checklistDone}</b> de {checklistItems.length} concluídos</span><i><b style={{ width: `${checklistItems.length ? Math.round(checklistDone / checklistItems.length * 100) : 0}%` }} /></i></div>
      <div className="ca-checklist-items">{checklistItems.map((item) => <button type="button" key={item.key} data-tour={`setup-${item.key}`} className={item.done ? "done" : ""} onClick={() => openChecklistItem(item)}><span>{item.done ? "✓" : "○"}</span><div><strong>{item.title}</strong><small>{item.copy}</small></div><b>{item.done ? "Revisar" : "Abrir"}</b></button>)}</div>
    </section>, checklistHost)}

    {tour && currentStep && createPortal(<div ref={dialogRef} className="ca-guided-tour" data-tour-selector={currentStep.selector} role="dialog" aria-modal="true" aria-labelledby="ca-tour-title" aria-describedby="ca-tour-description">
      {focus ? <>
        <div className="ca-tour-blur" style={{ left: 0, top: 0, right: 0, height: focus.top }} />
        <div className="ca-tour-blur" style={{ left: 0, top: focus.top, width: focus.left, height: focus.height }} />
        <div className="ca-tour-blur" style={{ left: focus.right, top: focus.top, right: 0, height: focus.height }} />
        <div className="ca-tour-blur" style={{ left: 0, top: focus.bottom, right: 0, bottom: 0 }} />
        {currentStep.interactive ? <button type="button" className="ca-tour-spotlight interactive" aria-label={`Abrir ${currentStep.title}`} style={{ left: focus.left, top: focus.top, width: focus.width, height: focus.height }} onClick={() => {
          const selector = currentStep.selector;
          finishTour(true);
          window.requestAnimationFrame(() => findTarget(selector)?.click());
        }} /> : <div className="ca-tour-spotlight" style={{ left: focus.left, top: focus.top, width: focus.width, height: focus.height }} />}
      </> : <div className="ca-tour-blur" style={{ inset: 0 }} />}
      <div ref={copyRef} key={`${tour.id}:${tour.index}`} className={`ca-tour-copy${copyStyle ? "" : " waiting"}`} style={copyStyle ?? { left: 16, top: view.top + 24, width: Math.min(360, view.width - 32) }} aria-live="polite">
        <small>{tour.index + 1} de {tour.steps.length}</small>
        <h3 id="ca-tour-title">{currentStep.title}</h3>
        <p id="ca-tour-description">{currentStep.copy}</p>
      </div>
      <div ref={controlsRef} className="ca-tour-controls">
        <button type="button" className="secondary" onClick={() => finishTour(true)}>Fechar</button>
        <button type="button" className="primary" disabled={preparing} onClick={nextStep}>{preparing ? "Preparando…" : tour.index + 1 >= tour.steps.length ? "Entendi" : "Seguir"}</button>
      </div>
    </div>, document.body)}
  </>;
}
