import type { AccessContext } from "./access";
import { requireOwner } from "./access";
import { listTeamInvites, listTeamUsers } from "./auth";
import { env } from "../runtime/env";

type SuspendedCandidate = {
  id: number;
  name: string;
  role: string;
  email: string | null;
};

type PendingCandidate = {
  id: number;
  name: string;
  email: string;
  createdAt: string;
  sourceInviteId: number;
};

async function deletedTeamIds(organizationId: number) {
  const result = await env.DB.prepare("SELECT id FROM team WHERE organization_id = ? AND deleted_at IS NOT NULL")
    .bind(organizationId)
    .all();
  return new Set((result.results as Array<{ id: number }>).map((row) => Number(row.id)));
}

export async function listVisibleTeamUsers(access: AccessContext) {
  requireOwner(access);
  const users = await listTeamUsers(access);
  const deleted = await deletedTeamIds(access.organizationId);
  return users.filter((user) => !deleted.has(user.id));
}

export async function listTeamCleanupCandidates(access: AccessContext) {
  requireOwner(access);
  const suspendedResult = await env.DB.prepare(`SELECT t.id, t.name, t.role, t.login_email AS email
    FROM team t
    WHERE t.organization_id = ? AND t.active = 0 AND t.deleted_at IS NULL AND t.id <> ?
    ORDER BY t.name COLLATE NOCASE, t.id`)
    .bind(access.organizationId, access.teamMemberId)
    .all();
  const suspended = (suspendedResult.results as Array<{ id: number; name: string; role: string; email: string | null }>).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    role: String(row.role),
    email: row.email ? String(row.email) : null,
  })) satisfies SuspendedCandidate[];

  const pendingResult = await env.DB.prepare(`SELECT id, name, email, created_at, source_invite_id
    FROM pending_registrations
    WHERE kind = 'team' AND organization_id = ? AND used_at IS NULL
    ORDER BY id DESC`)
    .bind(access.organizationId)
    .all();
  const pending = (pendingResult.results as Array<{ id: number; name: string; email: string; created_at: string; source_invite_id: number }>).map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    email: String(row.email),
    createdAt: String(row.created_at),
    sourceInviteId: Number(row.source_invite_id),
  })) satisfies PendingCandidate[];

  const invites = (await listTeamInvites(access)).filter((invite) => invite.status !== "Utilizado");
  return { suspended, pending, invites };
}

export async function deleteSuspendedTeamUser(access: AccessContext, teamMemberId: number) {
  requireOwner(access);
  if (!Number.isInteger(teamMemberId) || teamMemberId <= 0) throw new Error("Funcionário inválido.");
  if (teamMemberId === access.teamMemberId) throw new Error("Você não pode excluir seu próprio acesso.");
  const member = await env.DB.prepare("SELECT id, active, deleted_at FROM team WHERE id = ? AND organization_id = ? LIMIT 1")
    .bind(teamMemberId, access.organizationId)
    .first() as { id: number; active: number; deleted_at: string | null } | null;
  if (!member || member.deleted_at) throw new Error("Este funcionário já foi removido.");
  if (Number(member.active) !== 0) throw new Error("Suspenda o funcionário antes de excluí-lo.");

  const account = await env.DB.prepare("SELECT id FROM auth_accounts WHERE team_member_id = ? LIMIT 1")
    .bind(teamMemberId)
    .first() as { id: number } | null;
  const now = new Date().toISOString();
  const statements = [];
  if (account?.id) {
    statements.push(
      env.DB.prepare("DELETE FROM auth_sessions WHERE account_id = ?").bind(account.id),
      env.DB.prepare("DELETE FROM email_verifications WHERE account_id = ?").bind(account.id),
      env.DB.prepare("DELETE FROM password_resets WHERE account_id = ?").bind(account.id),
      env.DB.prepare("DELETE FROM auth_accounts WHERE id = ?").bind(account.id),
    );
  }
  statements.push(
    env.DB.prepare("DELETE FROM push_subscriptions WHERE organization_id = ? AND team_member_id = ?").bind(access.organizationId, teamMemberId),
    env.DB.prepare("DELETE FROM pending_registrations WHERE kind = 'team' AND organization_id = ? AND team_member_id = ? AND used_at IS NULL").bind(access.organizationId, teamMemberId),
    env.DB.prepare("DELETE FROM team_invites WHERE organization_id = ? AND team_member_id = ? AND used_at IS NULL").bind(access.organizationId, teamMemberId),
    env.DB.prepare("UPDATE team SET active = 0, login_email = NULL, deleted_at = ? WHERE id = ? AND organization_id = ? AND active = 0 AND deleted_at IS NULL").bind(now, teamMemberId, access.organizationId),
  );
  const results = await env.DB.batch(statements);
  const updateResult = results[results.length - 1];
  if (Number(updateResult.meta.changes) !== 1) throw new Error("Não foi possível remover este funcionário.");
}

export async function deleteUnusedTeamInvite(access: AccessContext, inviteId: number) {
  requireOwner(access);
  if (!Number.isInteger(inviteId) || inviteId <= 0) throw new Error("Convite inválido.");
  const result = await env.DB.prepare("DELETE FROM team_invites WHERE id = ? AND organization_id = ? AND used_at IS NULL")
    .bind(inviteId, access.organizationId)
    .run();
  if (Number(result.meta.changes) !== 1) throw new Error("Este convite já foi utilizado ou não está disponível para exclusão.");
}

export async function deletePendingTeamRegistration(access: AccessContext, pendingId: number) {
  requireOwner(access);
  if (!Number.isInteger(pendingId) || pendingId <= 0) throw new Error("Cadastro pendente inválido.");
  const row = await env.DB.prepare("SELECT source_invite_id FROM pending_registrations WHERE id = ? AND kind = 'team' AND organization_id = ? AND used_at IS NULL LIMIT 1")
    .bind(pendingId, access.organizationId)
    .first() as { source_invite_id: number } | null;
  if (!row) throw new Error("Este cadastro pendente não está mais disponível.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM pending_registrations WHERE id = ? AND kind = 'team' AND organization_id = ? AND used_at IS NULL").bind(pendingId, access.organizationId),
    env.DB.prepare("DELETE FROM team_invites WHERE id = ? AND organization_id = ?").bind(row.source_invite_id, access.organizationId),
  ]);
}
