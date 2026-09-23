"use client";

import { useState } from "react";
import styles from "./team-cleanup-panel.module.css";
import { showAppToast } from "./app-toast";

type SuspendedUser = { id: number; name: string; role: string; email: string | null };
type PendingRegistration = { id: number; name: string; email: string; createdAt: string; sourceInviteId: number };
type Invite = { id: number; invitedName: string; role: string; accessRole: string; expiresAt: string; createdAt: string; status: string };
type CleanupPayload = { suspended?: SuspendedUser[]; pending?: PendingRegistration[]; invites?: Invite[]; error?: string };

export function TeamCleanupPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [payload, setPayload] = useState<CleanupPayload>({});
  const [message, setMessage] = useState("");

  async function request(method: "GET" | "POST", body?: Record<string, string | number>) {
    const response = await fetch("/api/team-cleanup", {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (response.status === 401) {
      window.location.assign("/");
      return null;
    }
    const next = await response.json() as CleanupPayload;
    if (!response.ok) throw new Error(next.error ?? "Não foi possível atualizar a lixeira.");
    setPayload(next);
    return next;
  }

  async function openPanel() {
    setOpen(true);
    setLoading(true);
    setMessage("");
    try {
      await request("GET");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível carregar a lixeira.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(action: "delete-user" | "delete-invite" | "delete-pending", id: number, confirmation: string, success: string) {
    if (!window.confirm(confirmation)) return;
    const key = `${action}:${id}`;
    setPendingAction(key);
    setMessage("");
    try {
      const field = action === "delete-user" ? "teamMemberId" : action === "delete-invite" ? "inviteId" : "pendingId";
      await request("POST", { action, [field]: id });
      showAppToast(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível excluir agora.");
    } finally {
      setPendingAction("");
    }
  }

  const suspended = payload.suspended ?? [];
  const pending = payload.pending ?? [];
  const invites = payload.invites ?? [];
  const total = suspended.length + pending.length + invites.length;

  return <>
    <button type="button" className={styles.launcher} onClick={() => void openPanel()}>🗑 Lixeira da equipe</button>
    {open && <div className={styles.backdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label="Lixeira da equipe">
        <header className={styles.header}><div><strong>Lixeira da equipe</strong><small>Remova acessos antigos sem apagar o histórico</small></div><button type="button" aria-label="Fechar lixeira" onClick={() => setOpen(false)}>×</button></header>
        <div className={styles.content}>
          {loading && <p className={styles.empty}>Carregando acessos e convites...</p>}
          {message && <p className={`${styles.notice} ${styles.error}`} role="alert">{message}</p>}
          {!loading && !total && <p className={styles.empty}>Nada para limpar agora.</p>}

          {!loading && suspended.length > 0 && <section className={styles.section}><div className={styles.sectionTitle}><strong>Funcionários suspensos</strong><small>{suspended.length}</small></div>{suspended.map((user) => <div className={styles.row} key={user.id}><div><strong>{user.name}</strong><small>{user.role}{user.email ? ` · ${user.email}` : ""}</small></div><button className={styles.trash} type="button" disabled={Boolean(pendingAction)} onClick={() => void remove("delete-user", user.id, `Excluir o acesso de ${user.name}? O login será removido, mas atendimentos, comissões, pagamentos e histórico continuarão guardados.`, `${user.name} foi removido da equipe. O histórico foi preservado.`)}>{pendingAction === `delete-user:${user.id}` ? "Excluindo..." : "Excluir"}</button></div>)}</section>}

          {!loading && pending.length > 0 && <section className={styles.section}><div className={styles.sectionTitle}><strong>Cadastros aguardando e-mail</strong><small>{pending.length}</small></div>{pending.map((item) => <div className={styles.row} key={item.id}><div><strong>{item.name || "Novo funcionário"}</strong><small>{item.email} · confirmação não concluída</small></div><button className={styles.trash} type="button" disabled={Boolean(pendingAction)} onClick={() => void remove("delete-pending", item.id, `Apagar o cadastro pendente de ${item.name || item.email}? O link de confirmação e o convite deixarão de funcionar.`, "Cadastro pendente e convite removidos.")}>{pendingAction === `delete-pending:${item.id}` ? "Excluindo..." : "Excluir"}</button></div>)}</section>}

          {!loading && invites.length > 0 && <section className={styles.section}><div className={styles.sectionTitle}><strong>Convites não utilizados</strong><small>{invites.length}</small></div>{invites.map((invite) => <div className={styles.row} key={invite.id}><div><strong>{invite.invitedName || "Novo profissional"}</strong><small>{invite.role} · {invite.status} · expira {new Date(invite.expiresAt).toLocaleDateString("pt-BR")}</small></div><button className={styles.trash} type="button" disabled={Boolean(pendingAction)} onClick={() => void remove("delete-invite", invite.id, `Apagar este convite de ${invite.invitedName || "funcionário"}? O link deixará de funcionar.`, "Convite removido.")}>{pendingAction === `delete-invite:${invite.id}` ? "Excluindo..." : "Excluir"}</button></div>)}</section>}

          {!loading && total > 0 && <p className={styles.notice}>Excluir um funcionário suspenso remove somente o acesso. Atendimentos, comissões, vales, pagamentos e fechamentos antigos continuam preservados.</p>}
        </div>
      </section>
    </div>}
  </>;
}
