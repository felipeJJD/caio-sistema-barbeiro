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
    let shortTimer = 0;
    let longTimer = 0;
    let layoutViewportHeight = window.innerHeight;

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
      root.toggleAttribute("data-app-keyboard-open", viewport.keyboardOpen);
    };

    const refreshVisibleViewport = () => {
      syncVisibleViewport();
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncVisibleViewport);
      window.clearTimeout(shortTimer);
      window.clearTimeout(longTimer);
      shortTimer = window.setTimeout(syncVisibleViewport, 120);
      longTimer = window.setTimeout(syncVisibleViewport, 420);
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshVisibleViewport();
    };

    const refreshAfterFieldInteraction = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']")) {
        refreshVisibleViewport();
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
    const preventGesture = (event: Event) => event.preventDefault();
    const preventDoubleTap = (event: MouseEvent) => event.preventDefault();

    document.addEventListener("touchstart", preventMultiTouch, { passive: false });
    document.addEventListener("touchmove", preventMultiTouch, { passive: false });
    document.addEventListener("gesturestart", preventGesture, { passive: false });
    document.addEventListener("gesturechange", preventGesture, { passive: false });
    document.addEventListener("dblclick", preventDoubleTap, { passive: false });
    window.addEventListener("resize", refreshVisibleViewport);
    window.addEventListener("focus", refreshVisibleViewport);
    window.addEventListener("pageshow", refreshVisibleViewport);
    document.addEventListener("focusin", refreshAfterFieldInteraction);
    document.addEventListener("focusout", refreshAfterFieldInteraction);
    document.addEventListener("change", refreshAfterFieldInteraction);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    document.addEventListener("visibilitychange", releaseFocusWhenHidden);
    visualViewport?.addEventListener("resize", syncVisibleViewport);
    if (!resetIdleOffset) visualViewport?.addEventListener("scroll", syncVisibleViewport);
    refreshVisibleViewport();

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(shortTimer);
      window.clearTimeout(longTimer);
      document.removeEventListener("touchstart", preventMultiTouch);
      document.removeEventListener("touchmove", preventMultiTouch);
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("dblclick", preventDoubleTap);
      window.removeEventListener("resize", refreshVisibleViewport);
    window.removeEventListener("focus", refreshVisibleViewport);
    window.removeEventListener("pageshow", refreshVisibleViewport);
    document.removeEventListener("focusin", refreshAfterFieldInteraction);
    document.removeEventListener("focusout", refreshAfterFieldInteraction);
    document.removeEventListener("change", refreshAfterFieldInteraction);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      document.removeEventListener("visibilitychange", releaseFocusWhenHidden);
      visualViewport?.removeEventListener("resize", syncVisibleViewport);
      if (!resetIdleOffset) visualViewport?.removeEventListener("scroll", syncVisibleViewport);
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--app-viewport-top");
      root.removeAttribute("data-app-keyboard-open");
    };
  }, []);

  return null;
}
