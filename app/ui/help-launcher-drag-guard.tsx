"use client";

import { useEffect } from "react";

const STORAGE_KEY = "cortou-anotou:help-launcher-position:v1";
const MOBILE_QUERY = "(max-width: 680px)";
const EDGE_MARGIN = 12;
const DRAG_THRESHOLD = 6;

type SavedPosition = {
  side: "left" | "right";
  yRatio: number;
};

type Bounds = {
  minLeft: number;
  maxLeft: number;
  minTop: number;
  maxTop: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function readPosition(): SavedPosition {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { side: "right", yRatio: 1 };
    const parsed = JSON.parse(raw) as Partial<SavedPosition>;
    return {
      side: parsed.side === "left" ? "left" : "right",
      yRatio: clamp(Number(parsed.yRatio) || 0, 0, 1),
    };
  } catch {
    return { side: "right", yRatio: 1 };
  }
}

function savePosition(position: SavedPosition) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // O botão continua funcionando mesmo quando o navegador bloqueia armazenamento local.
  }
}

function launcherBounds(button: HTMLButtonElement): Bounds {
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const rect = button.getBoundingClientRect();
  const width = rect.width || 54;
  const height = rect.height || 54;

  const minLeft = viewportLeft + EDGE_MARGIN;
  const maxLeft = Math.max(minLeft, viewportLeft + viewportWidth - width - EDGE_MARGIN);
  const minTop = viewportTop + EDGE_MARGIN;
  let maxTop = Math.max(minTop, viewportTop + viewportHeight - height - EDGE_MARGIN);

  const bottomNavigation = document.querySelector<HTMLElement>(".mobile-bottom-navigation");
  if (bottomNavigation) {
    const navigationTop = bottomNavigation.getBoundingClientRect().top;
    const viewportBottom = viewportTop + viewportHeight;
    if (navigationTop > minTop && navigationTop < viewportBottom + height) {
      maxTop = Math.max(minTop, Math.min(maxTop, navigationTop - height - EDGE_MARGIN));
    }
  }

  return { minLeft, maxLeft, minTop, maxTop };
}

function placeFromSavedPosition(button: HTMLButtonElement, position: SavedPosition) {
  const bounds = launcherBounds(button);
  const left = position.side === "left" ? bounds.minLeft : bounds.maxLeft;
  const availableY = Math.max(0, bounds.maxTop - bounds.minTop);
  const top = bounds.minTop + availableY * clamp(position.yRatio, 0, 1);
  button.style.left = `${Math.round(left)}px`;
  button.style.top = `${Math.round(clamp(top, bounds.minTop, bounds.maxTop))}px`;
}

export function HelpLauncherDragGuard() {
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    let launcher: HTMLButtonElement | null = null;
    let detachLauncher: (() => void) | null = null;
    let savedPosition = readPosition();

    const attach = (button: HTMLButtonElement) => {
      detachLauncher?.();
      launcher = button;
      button.dataset.helpDraggable = "true";

      let pointerId: number | null = null;
      let startX = 0;
      let startY = 0;
      let grabOffsetX = 0;
      let grabOffsetY = 0;
      let moved = false;
      let suppressClick = false;
      let suppressTimer = 0;

      const resetDesktopPosition = () => {
        button.style.removeProperty("left");
        button.style.removeProperty("top");
      };

      const syncPosition = () => {
        if (!media.matches || pointerId !== null) return;
        placeFromSavedPosition(button, savedPosition);
      };

      const onPointerDown = (event: PointerEvent) => {
        if (!media.matches || event.button !== 0) return;
        const rect = button.getBoundingClientRect();
        pointerId = event.pointerId;
        startX = event.clientX;
        startY = event.clientY;
        grabOffsetX = event.clientX - rect.left;
        grabOffsetY = event.clientY - rect.top;
        moved = false;
        suppressClick = false;
        window.clearTimeout(suppressTimer);
        button.setPointerCapture?.(event.pointerId);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (pointerId !== event.pointerId || !media.matches) return;
        const distance = Math.hypot(event.clientX - startX, event.clientY - startY);
        if (!moved && distance < DRAG_THRESHOLD) return;
        moved = true;
        event.preventDefault();
        button.classList.add("is-dragging");
        const bounds = launcherBounds(button);
        const left = clamp(event.clientX - grabOffsetX, bounds.minLeft, bounds.maxLeft);
        const top = clamp(event.clientY - grabOffsetY, bounds.minTop, bounds.maxTop);
        button.style.left = `${Math.round(left)}px`;
        button.style.top = `${Math.round(top)}px`;
      };

      const finishDrag = (event: PointerEvent) => {
        if (pointerId !== event.pointerId) return;
        const activePointer = pointerId;
        pointerId = null;
        button.classList.remove("is-dragging");
        try {
          button.releasePointerCapture?.(activePointer);
        } catch {
          // Alguns navegadores já liberam a captura antes do pointerup.
        }

        if (!moved || !media.matches) return;
        const bounds = launcherBounds(button);
        const rect = button.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        const viewport = window.visualViewport;
        const viewportLeft = viewport?.offsetLeft ?? 0;
        const viewportWidth = viewport?.width ?? window.innerWidth;
        const side: SavedPosition["side"] = center < viewportLeft + viewportWidth / 2 ? "left" : "right";
        const snappedLeft = side === "left" ? bounds.minLeft : bounds.maxLeft;
        const top = clamp(rect.top, bounds.minTop, bounds.maxTop);
        const availableY = Math.max(1, bounds.maxTop - bounds.minTop);
        savedPosition = { side, yRatio: clamp((top - bounds.minTop) / availableY, 0, 1) };
        savePosition(savedPosition);
        button.style.left = `${Math.round(snappedLeft)}px`;
        button.style.top = `${Math.round(top)}px`;
        suppressClick = true;
        suppressTimer = window.setTimeout(() => { suppressClick = false; }, 450);
      };

      const onClickCapture = (event: MouseEvent) => {
        if (!suppressClick) return;
        suppressClick = false;
        window.clearTimeout(suppressTimer);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      };

      const onMediaChange = () => {
        if (media.matches) {
          savedPosition = readPosition();
          window.requestAnimationFrame(syncPosition);
        } else {
          resetDesktopPosition();
        }
      };

      button.addEventListener("pointerdown", onPointerDown);
      button.addEventListener("pointermove", onPointerMove, { passive: false });
      button.addEventListener("pointerup", finishDrag);
      button.addEventListener("pointercancel", finishDrag);
      button.addEventListener("click", onClickCapture, true);
      window.addEventListener("resize", syncPosition);
      window.visualViewport?.addEventListener("resize", syncPosition);
      window.visualViewport?.addEventListener("scroll", syncPosition);
      media.addEventListener("change", onMediaChange);

      if (media.matches) window.requestAnimationFrame(syncPosition);

      detachLauncher = () => {
        window.clearTimeout(suppressTimer);
        button.removeEventListener("pointerdown", onPointerDown);
        button.removeEventListener("pointermove", onPointerMove);
        button.removeEventListener("pointerup", finishDrag);
        button.removeEventListener("pointercancel", finishDrag);
        button.removeEventListener("click", onClickCapture, true);
        window.removeEventListener("resize", syncPosition);
        window.visualViewport?.removeEventListener("resize", syncPosition);
        window.visualViewport?.removeEventListener("scroll", syncPosition);
        media.removeEventListener("change", onMediaChange);
        button.classList.remove("is-dragging");
        delete button.dataset.helpDraggable;
        resetDesktopPosition();
        if (launcher === button) launcher = null;
      };
    };

    const findLauncher = () => {
      const next = document.querySelector<HTMLButtonElement>(".help-launcher");
      if (next && next !== launcher) attach(next);
      if (!next && launcher) {
        detachLauncher?.();
        detachLauncher = null;
      }
    };

    findLauncher();
    const observer = new MutationObserver(findLauncher);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      detachLauncher?.();
    };
  }, []);

  return null;
}
