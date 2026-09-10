import type { ReactNode, SVGProps } from "react";

export type AppIconName =
  | "bell"
  | "box"
  | "calendar"
  | "check"
  | "clock"
  | "edit"
  | "help"
  | "members"
  | "money"
  | "scissors"
  | "settings"
  | "spark"
  | "trash"
  | "trend"
  | "whatsapp";

const iconPaths: Record<AppIconName, ReactNode> = {
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  box: <><path d="m4 8 8-4 8 4-8 4-8-4Z" /><path d="m4 8 8 4 8-4v9l-8 4-8-4V8Z" /><path d="M12 12v9" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.7 9a2.6 2.6 0 1 1 4.8 1.4c-.8 1.1-2.5 1.3-2.5 3.1M12 17.5h.01" /></>,
  members: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></>,
  money: <><path d="M12 2v20" /><path d="M17 6.5C16 5.5 14.5 5 12 5c-3 0-5 1.4-5 3.5S9 12 12 12s5 1.4 5 3.5S15 19 12 19c-2.5 0-4-.5-5-1.5" /></>,
  scissors: <><circle cx="6" cy="7" r="3" /><circle cx="6" cy="17" r="3" /><path d="m8.7 8.4 10.8 6.1M8.7 15.6 19.5 9.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1A8 8 0 0 0 15 6l-.4-2.6h-4L10 6a8 8 0 0 0-1.5 1L6 6 4 9.4 6.1 11a7 7 0 0 0 0 2L4 14.6 6 18l2.5-1a8 8 0 0 0 1.5 1l.5 2.6h4L15 18a8 8 0 0 0 1.5-1l2.5 1 2-3.4-2.1-1.6c.1-.3.1-.7.1-1Z" /></>,
  spark: <><path d="M12 3c.5 4.1 2.9 6.5 7 7-4.1.5-6.5 2.9-7 7-.5-4.1-2.9-6.5-7-7 4.1-.5 6.5-2.9 7-7Z" /><path d="M19 3v4M17 5h4" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /></>,
  trend: <><path d="m4 16 6-6 4 4 6-7" /><path d="M15 7h5v5" /></>,
  // Bootstrap Icons, MIT: https://icons.getbootstrap.com/icons/whatsapp/
  // Kept as a filled silhouette: an outline stroke distorts the phone and bubble.
  whatsapp: <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232" />,
};

export function AppIcon({ name, className = "", ...props }: { name: AppIconName } & SVGProps<SVGSVGElement>) {
  if (name === "whatsapp") return <svg className={`app-icon app-icon-whatsapp ${className}`.trim()} viewBox="0 0 16 16" fill="currentColor" stroke="none" aria-hidden="true" {...props}>{iconPaths.whatsapp}</svg>;
  return <svg className={`app-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{iconPaths[name]}</svg>;
}
