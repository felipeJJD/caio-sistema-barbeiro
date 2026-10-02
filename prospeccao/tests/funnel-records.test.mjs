import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLead, normalizePhoneE164, normalizeStatus, statusTransition } from "../lib/funnel-records.js";

test("normaliza contato do funil usando telefone como chave estável", () => {
  const item = normalizeLead({
    id: "place-123",
    name: "Barbearia Exemplo",
    phone: "(41) 99999-8888",
    phoneE164: "+55 41 99999-8888",
    address: "Rua Exemplo, 10",
  }, "Colombo, PR");

  assert.equal(item.leadKey, "phone:5541999998888");
  assert.equal(item.phoneE164, "5541999998888");
  assert.equal(item.sourceId, "place-123");
  assert.equal(item.city, "Colombo, PR");
});

test("rejeita telefone que não é celular brasileiro completo", () => {
  assert.equal(normalizePhoneE164("41"), "");
  assert.throws(() => normalizeLead({ name: "Teste", phoneE164: "554133334444" }), /celular brasileiro válido/i);
});

test("sem interesse ativa bloqueio permanente de nova abordagem", () => {
  const transition = statusTransition({ doNotContact: false }, "sem_interesse");
  assert.deepEqual(transition, { status: "sem_interesse", doNotContact: true });

  assert.throws(
    () => statusTransition({ doNotContact: true }, "interessado"),
    /não receber novas abordagens/i,
  );
});

test("aceita somente status conhecidos do funil", () => {
  assert.equal(normalizeStatus("preparado"), "preparado");
  assert.equal(normalizeStatus("interessado"), "interessado");
  assert.throws(() => normalizeStatus("qualquer-coisa"), /Status inválido/i);
});
