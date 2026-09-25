import { readFileSync, writeFileSync } from "node:fs";

const path = "app/ui/dashboard-app.tsx";
let text = readFileSync(path, "utf8");

const rankingStart = text.indexOf("  const teamRanking = data.team.map((member) => {");
const payoutStart = text.indexOf("  const periodPayoutFor =", rankingStart);
if (rankingStart < 0 || payoutStart < 0) throw new Error("Cálculo antigo da equipe não encontrado");
text = text.slice(0, rankingStart) + text.slice(payoutStart);

const clientPulseMarker = "    <ClientPulse />";
const clientPulseIndex = text.indexOf(clientPulseMarker);
if (clientPulseIndex < 0) throw new Error("Clientes parados não encontrado");
const overviewEnd = text.indexOf("\n  </>;\n}\n\nfunction trialPlanDetails", clientPulseIndex);
if (overviewEnd < 0) throw new Error("Fim do painel não encontrado");
const tail = text.slice(clientPulseIndex + clientPulseMarker.length, overviewEnd);
if (!tail.includes("Equipe no período")) throw new Error("Bloco antigo da equipe não encontrado");
text = text.slice(0, clientPulseIndex + clientPulseMarker.length) + text.slice(overviewEnd);

writeFileSync(path, text);
