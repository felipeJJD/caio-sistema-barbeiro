export type MobileViewportFrame = {
  height: number;
  top: number;
  keyboardOpen: boolean;
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
  const keyboardOpen = editing && windowHeight - visualHeight > 120;
  if (resetIdleOffset) {
    return {
      height: Math.round(windowHeight),
      top: 0,
      keyboardOpen,
    };
  }

  return {
    height: Math.round(visualHeight),
    top: Math.round(Math.max(0, visualTop)),
    keyboardOpen,
  };
}
