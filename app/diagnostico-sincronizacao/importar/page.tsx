import { notFound } from "next/navigation";
import { getOwnerSessionIdentity } from "../../../db/auth";
import { LegacyImportForm } from "./legacy-import-form";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  if (!await getOwnerSessionIdentity()) notFound();
  return <main style={{ maxWidth: 720, margin: "2rem auto", padding: 24 }}>
    <h1>Recuperar atendimentos da equipe</h1>
    <p>Confira os registros do banco antigo antes de adicioná-los ao banco atual.</p>
    <LegacyImportForm />
  </main>;
}
