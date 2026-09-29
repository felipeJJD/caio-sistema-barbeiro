import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ca = fs.readFileSync("db/ca-atende.ts", "utf8");
const memory = fs.readFileSync("lib/ca-atende.ts", "utf8");
const agenda = fs.readFileSync("app/ui/dashboard-app.tsx", "utf8");
const dashboard = fs.readFileSync("db/dashboard.ts", "utf8");
const action = fs.readFileSync("app/api/action/route.ts", "utf8");

test("serviço combinado respeita negação e correção", () => {
  assert.match(ca, /rejectBeard/);
  assert.match(ca, /singleService\(items, "cut"\)/);
  assert.match(ca, /mentionsCut && mentionsBeard && !rejectBeard && !rejectCut/);
});

test("memória preserva contexto quando o interpretador não traz valor novo", () => {
  assert.match(memory, /next\.barber \|\| memory\.barber/);
  assert.match(memory, /next\.service \|\| memory\.service/);
  assert.match(memory, /next\.time \|\| memory\.time/);
});

test("agenda diferencia remarcar de editar dados", () => {
  assert.match(agenda, /appointment-reschedule/);
  assert.match(agenda, /appointment-update-details/);
  assert.match(agenda, />Remarcar<\/button>/);
  assert.match(agenda, />Editar dados<\/button>/);
  assert.match(dashboard, /rescheduleAppointmentFromAgenda/);
  assert.match(dashboard, /updateAppointmentDetails/);
  assert.match(action, /appointment-reschedule/);
  assert.match(action, /appointment-update-details/);
});

test("notificação localiza o agendamento sem executar ação", () => {
  assert.match(agenda, /get\("appointment"\)/);
  assert.match(agenda, /scrollIntoView/);
  assert.match(agenda, /notification-focus/);
});

test("remarcação preserva dados e reaproveita validação central", () => {
  const block = dashboard.slice(dashboard.indexOf("export async function rescheduleAppointmentFromAgenda"), dashboard.indexOf("export async function cancelAppointment"));
  assert.match(block, /serviceId: existing\.serviceId/);
  assert.match(block, /clientName: existing\.clientName/);
  assert.match(block, /saveAppointment\(access/);
});

test("remarcar Pix cancelado nunca aprova pagamento automaticamente", () => {
  assert.match(dashboard, /existing\?\.status === "Cancelado" && existing\.paymentChoice === "Pix"/);
  assert.match(dashboard, /paymentConfirmationToken \? "Aguardando pagamento" : "Aguardando"/);
});
