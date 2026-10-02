import test from "node:test";
import assert from "node:assert/strict";
import { leadKeyFrom, normalizeProspectorKey } from "../lib/affiliate-claims.js";

test("cria chave global por celular brasileiro", () => {
  assert.equal(leadKeyFrom({ phoneE164: "5541999999999" }), "phone:5541999999999");
  assert.equal(leadKeyFrom({ phoneE164: "66" }), "");
});

test("aceita apenas identidade interna de admin ou afiliado", () => {
  assert.equal(normalizeProspectorKey("admin:1"), "admin:1");
  assert.equal(normalizeProspectorKey("affiliate:42"), "affiliate:42");
  assert.throws(() => normalizeProspectorKey("qualquer-coisa"), /inválida/i);
});
