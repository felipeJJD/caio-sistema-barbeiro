"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

type InviteItem = {
  id: number;
  invitedName: string;
  status: string;
};

type Target = {
  invite: InviteItem;
  row: HTMLElement;
};

type InvitePayload = {
  invites?: InviteItem[];
  error?: string;
};

export function InviteHistoryTrash() {
  const [targets, setTargets] = useState<Target[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const syncTargets = useCallback(async () => {
    const rows = Array.from(document.querySelectorAll<HTMLElement>(".invite-history .invite-list > .invite-row"));
    if (!rows.length) {
      setTargets([]);
      return;
    }

    const response = await fetch("/api/invites", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json() as InvitePayload;
    const invites = Array.isArray(payload.invites) ? payload.invites : [];
    setTargets(rows.slice(0, invites.length).map((row, index) => ({ row, invite: invites[index] })));
  }, []);

  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { void syncTargets(); }, 120);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [syncTargets]);

  async function removeInvite(invite: InviteItem) {
    const label = invite.invitedName || "funcionário";
    const confirmation = invite.status === "Utilizado"
      ? `Excluir só este registro de convite de ${label}? O funcionário continuará cadastrado e o histórico dele será preservado.`
      : invite.status === "Ativo"
        ? `Excluir este convite de ${label}? O link deixará de funcionar.`
        : `Excluir este registro de convite de ${label}?`;

    if (!window.confirm(confirmation)) return;
    setBusyId(invite.id);

    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-history", inviteId: invite.id }),
      });
      const payload = await response.json() as InvitePayload;
      if (!response.ok) throw new Error(payload.error || "Não foi possível apagar este convite.");
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível apagar este convite.");
      setBusyId(null);
    }
  }

  return <>
    {targets.map(({ row, invite }) => createPortal(
      <button
        type="button"
        aria-label={`Excluir convite de ${invite.invitedName || "funcionário"}`}
        title="Excluir convite"
        disabled={busyId !== null}
        onClick={() => void removeInvite(invite)}
        style={{
          width: 34,
          height: 34,
          padding: 0,
          marginLeft: 6,
          borderRadius: 10,
          border: "1px solid rgba(220, 38, 38, 0.22)",
          background: "rgba(220, 38, 38, 0.08)",
          color: "#dc2626",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
          cursor: busyId === null ? "pointer" : "wait",
          opacity: busyId !== null && busyId !== invite.id ? 0.45 : 1,
        }}
      >
        {busyId === invite.id ? <span style={{ fontSize: 12, lineHeight: 1 }}>...</span> : <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" }}>
          <path d="M4 7h16" />
          <path d="M9 7V4h6v3" />
          <path d="m6 7 1 13h10l1-13" />
          <path d="M10 11v5M14 11v5" />
        </svg>}
      </button>,
      row,
      `invite-trash-${invite.id}`,
    ))}
  </>;
}
