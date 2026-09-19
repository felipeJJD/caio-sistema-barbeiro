"use client";

import { useState } from "react";

type Summary = { pendingIds?: number[]; alreadyImported?: number[]; problems?: string[];
  byBarber?: { Davi: number; Eduardo: number }; imported?: number; error?: string };

export function LegacyImportForm() {
  const [rows, setRows] = useState<unknown[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function request(mode: "preview" | "apply", records: unknown[]) {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/legacy-record-import", {
        method: "POST", headers: { "content-type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ mode, rows: records }),
      });
      const result = await response.json() as Summary;
      setSummary(result);
      if (response.ok && mode === "apply") setDone(true);
    } catch {
      setSummary({ error: "Não foi possível conferir o arquivo. Tente novamente." });
    } finally { setLoading(false); }
  }

  return <section>
    <label htmlFor="legacy-file">Arquivo de atendimentos do banco antigo</label>
    <input id="legacy-file" type="file" accept="application/json,.json" disabled={loading || done}
      onChange={async (event) => {
        setRows(null); setSummary(null);
        const file = event.currentTarget.files?.[0];
        if (!file || file.size > 80000) { setSummary({ error: "Selecione um arquivo JSON de até 80 KB." }); return; }
        try {
          const records: unknown = JSON.parse(await file.text());
          if (!Array.isArray(records)) throw new Error("Formato inválido.");
          setRows(records);
          await request("preview", records);
        } catch { setSummary({ error: "Arquivo inválido." }); }
      }} />
    {loading && <p>Conferindo...</p>}
    {summary?.error && <p role="alert">{summary.error}</p>}
    {summary?.byBarber && <p>Para incluir: {summary.byBarber.Davi} de Davi e {summary.byBarber.Eduardo} de Eduardo.</p>}
    {!!summary?.alreadyImported?.length && <p>Já incluídos: {summary.alreadyImported.join(", ")}.</p>}
    {!!summary?.problems?.length && <ul>{summary.problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
    {rows && !loading && !done && !!summary?.pendingIds?.length && !summary?.problems?.length &&
      <button type="button" onClick={() => request("apply", rows)}>Criar cópia de segurança e incluir {summary.pendingIds.length} atendimentos</button>}
    {done && <p role="status">{summary?.imported} atendimentos recuperados. Confira o Histórico em outro aparelho.</p>}
  </section>;
}
