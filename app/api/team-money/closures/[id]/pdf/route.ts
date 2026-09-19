import { getSessionAccess } from "../../../../../../db/auth";
import { getTeamPaymentClosureForAccess } from "../../../../../../db/team-money";
import { buildTeamClosurePdf } from "../../../../../../lib/team-closure-pdf";

const filePart = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "") || "funcionario";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getSessionAccess();
    if (!access) return Response.json({ error: "Sua sessão terminou. Entre novamente." }, { status: 401 });
    const { id } = await params;
    const closureId = Number(id);
    if (!Number.isInteger(closureId) || closureId <= 0) return Response.json({ error: "Fechamento inválido." }, { status: 400 });
    const { snapshot } = await getTeamPaymentClosureForAccess(access, closureId);
    const pdf = buildTeamClosurePdf(snapshot);
    const filename = `fechamento-${filePart(snapshot.teamMember.name)}-${snapshot.periodEndDate}.pdf`;
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Não foi possível gerar o PDF." }, { status: 400 });
  }
}
