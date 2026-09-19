import { notFound } from "next/navigation";
import { getOwnerSessionIdentity } from "../../db/auth";
import { getOwnerSyncDiagnostic } from "../../db/sync-diagnostic";

export const dynamic = "force-dynamic";

export default async function SyncDiagnosticPage() {
  const identity = await getOwnerSessionIdentity();
  if (!identity) notFound();
  const diagnostic = await getOwnerSyncDiagnostic(identity.access.organizationId);
  const report = {
    session: {
      authAccountId: identity.authAccountId,
      authAccountOrganizationId: identity.accountOrganizationId,
      authAccountTeamMemberId: identity.accountTeamMemberId,
      teamOrganizationId: identity.teamOrganizationId,
      accessRole: identity.accessRole,
      resolvedOrganizationId: identity.access.organizationId,
      resolvedTeamMemberId: identity.access.teamMemberId,
    },
    ...diagnostic,
  };
  return <main style={{ maxWidth: 900, margin: "2rem auto", padding: 20 }}>
    <h1>Diagnóstico de sincronização</h1>
    <p>Consulta somente de leitura. IDs e datas; nenhum atendimento é alterado.</p>
    <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(report, null, 2)}</pre>
  </main>;
}
