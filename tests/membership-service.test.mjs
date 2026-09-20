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

test("plano mensalista usa o serviço real, inclusive cadastro antigo incoerente", () => {
  assert.equal(membership.resolveMembershipService("Corte", "4 cortes", services)?.id, 1);
  assert.equal(membership.resolveMembershipService("Corte + barba", "4 cortes barba", services)?.id, 3);
  assert.equal(membership.resolveMembershipService("Barba", "Cabelo + sobrancelha", services)?.id, 4);
});

test("plano sem pistas no nome respeita o serviço configurado", () => {
  assert.equal(membership.resolveMembershipService("Barba", "Plano Premium", services)?.id, 2);
});

test("normalização permite comparar identidade com acentos e espaços", () => {
  assert.equal(membership.normalizeMembershipIdentity("  João   da Silva "), membership.normalizeMembershipIdentity("Joao da Silva"));
  assert.equal(membership.phoneDigits("(41) 99999-1234"), "41999991234");
});
