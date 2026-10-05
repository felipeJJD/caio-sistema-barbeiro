export type TourRect = { left: number; top: number; right: number; bottom: number; width: number; height: number };
export type TourViewport = { width: number; height: number; top: number; bottom: number };

/** Recheck live navigation when a delayed start fires, not only when scheduled. */
export function tourStartAllowed(id: string, section: string, configTab: string, drawer: "open" | "closing" | null) {
  if (id === "Mais") return drawer === "open";
  if (drawer) return false;
  if (id.startsWith("Configurações:")) return section === "Configurações" && id === `Configurações:${configTab}`;
  return id === section;
}

/** Never enlarge a missing/offscreen target into a surrounding panel. */
export function tourFocus(rect: TourRect, viewport: TourViewport): TourRect | null {
  const left = Math.max(6, rect.left - 4);
  const top = Math.max(viewport.top + 6, rect.top - 4);
  const right = Math.min(viewport.width - 6, rect.right + 4);
  const bottom = Math.min(viewport.bottom - 6, rect.bottom + 4);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Measure the real text and footer: copy must fit wholly above or below the focus. */
export function tourCopyPosition(focus: TourRect, viewport: TourViewport, copyHeight: number, controlsTop: number) {
  const width = Math.min(360, viewport.width - 32);
  const left = Math.max(16, Math.min(focus.left + focus.width / 2 - width / 2, viewport.width - width - 16));
  const minTop = viewport.top + 16;
  const maxBottom = Math.min(controlsTop - 16, viewport.bottom - 16);
  const below = focus.bottom + 18;
  if (below + copyHeight <= maxBottom) return { left, top: below, width };
  const above = focus.top - 18 - copyHeight;
  if (above >= minTop && above + copyHeight <= maxBottom) return { left, top: above, width };
  return null;
}

export function compactTourTarget(rect: TourRect, viewport: TourViewport) {
  return rect.width > 0 && rect.height > 0 && rect.height <= Math.min(340, viewport.height * 0.55);
}

export function tourPresentation(rect: TourRect, viewport: TourViewport, copyHeight: number, controlsTop: number) {
  let focus = tourFocus(rect, { ...viewport, bottom: Math.min(viewport.bottom, controlsTop - 12) });
  let copy = focus ? tourCopyPosition(focus, viewport, copyHeight, controlsTop) : null;
  if (focus && !copy) {
    // Legacy approved tours may teach a long form. Show its visible portion,
    // reserving real space for the explanation instead of drawing text over it.
    focus = tourFocus(rect, { ...viewport, bottom: Math.min(viewport.bottom, controlsTop - copyHeight - 36) });
    copy = focus ? tourCopyPosition(focus, viewport, copyHeight, controlsTop) : null;
  }
  return { focus, copy };
}
