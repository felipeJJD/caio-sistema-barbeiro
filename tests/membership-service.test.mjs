import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

async function load(entry) {
  const result = await build({ entryPoints:[fileURLToPath(new URL(entry, import.meta.url))], bundle:true, write:false, platform:"node", format:"esm" });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}

const membership = await load("../lib/membership-service.ts");

const services = [
  { id:1, name:"Corte", durationMinutes:30 },
  { id:2, name:"Barba", durationMinutes:20 },
  { id:3, name:"Corte + barba", durationMinutes:45 },
  { id:4, name:"Corte + sobrancelha", durationMinutes:35 },
];

test("plano mensalista prioriza vínculo real e usa inferência só em cadastro antigo sem vínculo", () => {
  assert.equal(membership.resolveMembershipService("Corte", "4 cortes", services, 1)?.id, 1);
  assert.equal(membership.resolveMembershipService("Corte + barba", "4 cortes barba", services, 3)?.id, 3);
  assert.equal(membership.resolveMembershipService("Barba", "Cabelo + sobrancelha", services, 2)?.id, 2);
  assert.equal(membership.resolveMembershipService("Serviço antigo", "Cabelo + sobrancelha", services, null)?.id, 4);
});

test("plano sem pistas no nome respeita o serviço configurado", () => {
  assert.equal(membership.resolveMembershipService("Barba", "Plano Premium", services)?.id, 2);
});

test("normalização permite comparar identidade com acentos e espaços", () => {
  assert.equal(membership.normalizeMembershipIdentity("  João   da Silva "), membership.normalizeMembershipIdentity("Joao da Silva"));
  assert.equal(membership.phoneDigits("(41) 99999-1234"), "41999991234");
});


test("busca pública exige três letras e identifica nomes duplicados", () => {
  assert.equal(membership.membershipNameMatches("Kai", "Kaio Ferreira"), true);
  assert.equal(membership.membershipNameMatches("Ka", "Kaio Ferreira"), false);
  assert.equal(membership.membershipNameNeedsPhone("João Silva", ["João Silva", "Maria Lima"]), false);
  assert.equal(membership.membershipNameNeedsPhone("João Silva", ["João Silva", "Joao Silva"]), true);
});

test("créditos disponíveis descontam somente reservas ativas", () => {
  assert.equal(membership.availableMembershipUses(4, 0), 4);
  assert.equal(membership.availableMembershipUses(4, 2), 2);
  assert.equal(membership.availableMembershipUses(1, 2), 0);
});
