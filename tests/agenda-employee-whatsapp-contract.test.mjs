import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const dashboard=fs.readFileSync(new URL("../db/dashboard.ts",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../app/ui/dashboard-app.tsx",import.meta.url),"utf8");

test("funcionário pode confirmar Pix somente no próprio agendamento",()=>{
  const start=dashboard.indexOf("export async function confirmAppointment");
  const end=dashboard.indexOf("export async function completeAppointment",start);
  const body=dashboard.slice(start,end);
  assert.match(body,/requireOwnBarber\(access, existing\.barberId\)/);
  assert.doesNotMatch(body,/requireOwner\(access\)/);
  assert.match(ui,/\(data\.viewer\.isOwner \|\| item\.barberId === data\.viewer\.teamMemberId\).*item\.paymentChoice === "Pix"/);
});

test("confirmar horário continua enviando confirmação automática",()=>{
  const start=dashboard.indexOf("export async function confirmAppointment");
  const end=dashboard.indexOf("export async function completeAppointment",start);
  const body=dashboard.slice(start,end);
  assert.match(body,/queueAppointmentWhatsappSafely\("confirmation", id\)/);
  assert.match(body,/processConnectedWhatsappQueueSafely\(access\.organizationId, id, 3\)/);
});

test("remarcação confirmada dispara WhatsApp e preserva isolamento",()=>{
  const start=dashboard.indexOf("export async function rescheduleAppointmentFromAgenda");
  const end=dashboard.indexOf("export async function cancelAppointment",start);
  const body=dashboard.slice(start,end);
  assert.match(body,/eq\(appointments\.organizationId, access\.organizationId\)/);
  assert.match(body,/requireOwnBarber\(access, existing\.barberId\)/);
  assert.match(body,/existing\.status === "Agendado"/);
  assert.match(body,/queueAppointmentWhatsappSafely\("rescheduled", existing\.id\)/);
  assert.match(body,/processConnectedWhatsappQueueSafely\(access\.organizationId, existing\.id, 3\)/);
});
