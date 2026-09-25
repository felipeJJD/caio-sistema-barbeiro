import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/apply-client-radar.mjs";
let text = readFileSync(path, "utf8");
const replacements = [
  [
    '<span>{search ? `${ordered.length} resultado${ordered.length === 1 ? "" : "s"}` : `${ordered.length} clientes recorrentes`}</span>',
    '<span>{search ? ordered.length + " resultado" + (ordered.length === 1 ? "" : "s") : ordered.length + " clientes recorrentes"}</span>',
  ],
  [
    '<div className={styles.frequencyTrack} aria-hidden="true"><i style={{ width: `${Math.max(8, Math.round(client.visitCount / maxVisits * 100))}%` }} /></div>',
    '<div className={styles.frequencyTrack} aria-hidden="true"><i style={{ width: Math.max(8, Math.round(client.visitCount / maxVisits * 100)) + "%" }} /></div>',
  ],
  [
    '<em>{client.cadenceDays ? `Retorno médio: ${client.cadenceDays} dias` : client.visitCount > 1 ? "Ainda calculando o ritmo de retorno" : "Uma visita registrada neste período"}</em>',
    '<em>{client.cadenceDays ? "Retorno médio: " + client.cadenceDays + " dias" : client.visitCount > 1 ? "Ainda calculando o ritmo de retorno" : "Uma visita registrada neste período"}</em>',
  ],
  [
    '{ordered.length > 6 && <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Ver menos" : `Ver mais (${ordered.length})`}</button>}',
    '{ordered.length > 6 && <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Ver menos" : "Ver mais (" + ordered.length + ")"}</button>}',
  ],
];
for (const [from, to] of replacements) {
  if (!text.includes(from)) throw new Error(`Trecho para correção não encontrado: ${from.slice(0, 60)}`);
  text = text.replace(from, to);
}
writeFileSync(path, text);
