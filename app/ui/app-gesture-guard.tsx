"use client";

import { useEffect } from "react";
import { isAppleTouchDevice, resolveMobileViewport } from "../../lib/mobile-viewport";

export function AppGestureGuard() {
  useEffect(() => {
    const coarsePointer = window.matchMedia("(pointer: coarse)");
    if (!coarsePointer.matches) return;

    const root = document.documentElement;
    const visualViewport = window.visualViewport;
    const resetIdleOffset = isAppleTouchDevice({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    let frame = 0;
    let settleTimer = 0;
    let layoutViewportHeight = window.innerHeight;
    let edgeGestureStart: { x: number; y: number } | null = null;
    const edgeGuardWidth = 32;

    const focusedField = () => {
      const active = document.activeElement;
      return active instanceof HTMLElement
        && active.matches("input, textarea, select, [contenteditable='true']")
        ? active
        : null;
    };

    const revealFocusedField = () => {
      if (!resetIdleOffset || !root.hasAttribute("data-app-keyboard-open")) return;
      const active = focusedField();
      const scroller = active?.closest<HTMLElement>(".app-shell > .content");
      if (!active || !scroller) return;

      const visibleTop = Math.max(visualViewport?.offsetTop ?? 0, 0) + 14;
      const visibleBottom = (visualViewport?.offsetTop ?? 0)
        + (visualViewport?.height ?? window.innerHeight)
        - 18;
      const field = active.getBoundingClientRect();
      const delta = field.bottom > visibleBottom
        ? field.bottom - visibleBottom
        : field.top < visibleTop
          ? field.top - visibleTop
          : 0;

      // Safari already moves the visual viewport while the keyboard opens.
      // Only correct a meaningful remaining overlap, once the viewport settles,
      // and avoid a smooth animation fighting the browser's own movement.
      if (Math.abs(delta) > 12) scroller.scrollBy({ top: delta, behavior: "auto" });
    };

    const syncVisibleViewport = () => {
      const active = document.activeElement;
      const editing = active instanceof HTMLElement
        && active.matches("input, textarea, select, [contenteditable='true']");
      if (!editing) layoutViewportHeight = window.innerHeight;
      else layoutViewportHeight = Math.max(layoutViewportHeight, window.innerHeight);
      const viewport = resolveMobileViewport({
        visualHeight: visualViewport?.height ?? window.innerHeight,
        visualTop: visualViewport?.offsetTop ?? 0,
        windowHeight: resetIdleOffset ? layoutViewportHeight : window.innerHeight,
        editing,
        resetIdleOffset,
      });
      root.style.setProperty("--app-viewport-height", `${viewport.height}px`);
      root.style.setProperty("--app-viewport-top", `${viewport.top}px`);
      root.style.setProperty("--app-keyboard-inset", `${viewport.keyboardInset}px`);
      root.toggleAttribute("data-app-keyboard-open", viewport.keyboardOpen);
    };

    const scheduleFocusedFieldReveal = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        syncVisibleViewport();
        revealFocusedField();
      }, 220);
    };

    const refreshVisibleViewport = (revealAfterSettle = false) => {
      syncVisibleViewport();
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncVisibleViewport);
      if (revealAfterSettle) scheduleFocusedFieldReveal();
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshVisibleViewport(false);
    };

    const refreshAfterFieldInteraction = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']")) {
        refreshVisibleViewport(event.type === "focusin");
      }
    };

    const releaseFocusWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.matches("input, textarea, select, [contenteditable='true']")) active.blur();
    };

    const preventMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) event.preventDefault();
    };

    const trackEdgeGestureStart = (event: TouchEvent) => {
      preventMultiTouch(event);
      edgeGestureStart = null;
      if (!resetIdleOffset || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const viewportWidth = visualViewport?.width ?? window.innerWidth;
      if (touch.clientX <= edgeGuardWidth || touch.clientX >= viewportWidth - edgeGuardWidth) {
        edgeGestureStart = { x: touch.clientX, y: touch.clientY };
      }
    };

    const preventEdgeHorizontalSwipe = (event: TouchEvent) => {
      preventMultiTouch(event);
      if (!edgeGestureStart || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - edgeGestureStart.x;
      const deltaY = touch.clientY - edgeGestureStart.y;

      // Preserve normal vertical scrolling even when the finger starts near an edge.
      // Only cancel a deliberate horizontal swipe once its direction is clear.
      if (Math.abs(deltaX) >= 8 && Math.abs(deltaX) > Math.abs(deltaY) * 1.15) {
        event.preventDefault();
      }
    };

    const clearEdgeGesture = () => {
      edgeGestureStart = null;
    };

    const preventGesture = (event: Event) => event.preventDefault();
    const preventDoubleTap = (event: MouseEvent) => event.preventDefault();
    const refreshForResize = () => refreshVisibleViewport(true);
    const refreshForViewportScroll = () => refreshVisibleViewport(false);

    document.addEventListener("touchstart", trackEdgeGestureStart, { passive: false });
    document.addEventListener("touchmove", preventEdgeHorizontalSwipe, { passive: false });
    document.addEventListener("touchend", clearEdgeGesture, { passive: true });
    document.addEventListener("touchcancel", clearEdgeGesture, { passive: true });
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("dblclick", preventDoubleTap, { passive: false });
    window.addEventListener("resize", refreshForResize);
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("pageshow", refreshWhenVisible);
    document.addEventListener("focusin", refreshAfterFieldInteraction);
    document.addEventListener("focusout", refreshAfterFieldInteraction);
    document.addEventListener("change", refreshAfterFieldInteraction);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    document.addEventListener("visibilitychange", releaseFocusWhenHidden);
    visualViewport?.addEventListener("resize", refreshForResize);
    visualViewport?.addEventListener("scroll", refreshForViewportScroll);
    refreshVisibleViewport(false);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      document.removeEventListener("touchstart", trackEdgeGestureStart);
      document.removeEventListener("touchmove", preventEdgeHorizontalSwipe);
      document.removeEventListener("touchend", clearEdgeGesture);
      document.removeEventListener("touchcancel", clearEdgeGesture);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("dblclick", preventDoubleTap);
      window.removeEventListener("resize", refreshForResize);
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshWhenVisible);
      document.removeEventListener("focusin", refreshAfterFieldInteraction);
      document.removeEventListener("focusout", refreshAfterFieldInteraction);
      document.removeEventListener("change", refreshAfterFieldInteraction);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      document.removeEventListener("visibilitychange", releaseFocusWhenHidden);
      visualViewport?.removeEventListener("resize", refreshForResize);
      visualViewport?.removeEventListener("scroll", refreshForViewportScroll);
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--app-viewport-top");
      root.style.removeProperty("--app-keyboard-inset");
      root.removeAttribute("data-app-keyboard-open");
    };
  }, []);

  return null;
}
