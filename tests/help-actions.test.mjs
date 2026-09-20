import assert from "node:assert/strict";
import test from "node:test";
import { parseHelpAction, parseScheduleChanges } from "../lib/help-actions.ts";

test("assistente entende criação de serviço falada de forma natural", () => {
  const parsed = parseHelpAction("Cria um serviço Corte + Barba por 70 reais que dura 1 hora", true);
  assert.ok(parsed && "action" in parsed);
  assert.equal(parsed.action.kind, "service");
  assert.equal(parsed.action.mode, "create");
  assert.equal(parsed.action.name.toLowerCase(), "corte + barba");
  assert.equal(parsed.action.priceCents, 7000);
  assert.equal(parsed.action.durationMinutes, 60);
});

test("assistente entende horário individual no domingo", () => {
  const parsed = parseHelpAction("Eduardo trabalha domingo das 9 às 13", true);
  assert.ok(parsed && "action" in parsed);
  assert.equal(parsed.action.kind, "team-hours");
  assert.equal(parsed.action.target.toLowerCase(), "eduardo");
  assert.deepEqual(parsed.action.scheduleChanges[0].days, [0]);
  assert.equal(parsed.action.scheduleChanges[0].openingTime, "09:00");
  assert.equal(parsed.action.scheduleChanges[0].closingTime, "13:00");
});

test("assistente entende dois expedientes na mesma frase", () => {
  const changes = parseScheduleChanges("segunda a sábado das 8 às 19 e domingo das 9 às 13");
  assert.deepEqual(changes[0].days, [1,2,3,4,5,6]);
  assert.equal(changes[0].openingTime, "08:00");
  assert.equal(changes[0].closingTime, "19:00");
  assert.deepEqual(changes[1].days, [0]);
  assert.equal(changes[1].openingTime, "09:00");
  assert.equal(changes[1].closingTime, "13:00");
});

test("funcionário não recebe proposta de alteração administrativa", () => {
  const parsed = parseHelpAction("Muda a taxa do débito para 1,5%", false);
  assert.ok(parsed && "clarification" in parsed);
  assert.match(parsed.clarification, /proprietário/i);
});

test("link público é consulta e pode ser entregue sem ação de escrita", () => {
  const parsed = parseHelpAction("me manda o link do meu agendamento", false);
  assert.ok(parsed && "action" in parsed);
  assert.equal(parsed.action.kind, "public-booking-link");
});
