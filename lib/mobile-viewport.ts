export type MobileViewportFrame = {
  height: number;
  top: number;
  keyboardOpen: boolean;
  keyboardInset: number;
};

type AppleTouchDeviceInput = {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
};

type MobileViewportInput = {
  visualHeight: number;
  visualTop: number;
  windowHeight: number;
  editing: boolean;
  resetIdleOffset: boolean;
};

export function isAppleTouchDevice({ userAgent, platform = "", maxTouchPoints = 0 }: AppleTouchDeviceInput) {
  return /iPhone|iPad|iPod/i.test(userAgent)
    || (platform === "MacIntel" && maxTouchPoints > 1);
}

export function resolveMobileViewport({
  visualHeight,
  visualTop,
  windowHeight,
  editing,
  resetIdleOffset,
}: MobileViewportInput): MobileViewportFrame {
  const hiddenHeight = Math.max(0, Math.round(windowHeight - visualHeight));
  const keyboardOpen = editing && hiddenHeight > 120;
  if (resetIdleOffset) {
    return {
      height: Math.round(windowHeight),
      top: 0,
      keyboardOpen,
      // iOS keeps the layout viewport at its original height while the visual
      // viewport is shortened by the keyboard. Keep the shell stable, but
      // expose the covered area so the inner scroller can create real space.
      keyboardInset: keyboardOpen ? hiddenHeight : 0,
    };
  }

  return {
    height: Math.round(visualHeight),
    top: Math.round(Math.max(0, visualTop)),
    keyboardOpen,
    keyboardInset: 0,
  };
}
