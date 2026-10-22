import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GET } from "../app/api/locations/cities/route.js";

const snapshot = JSON.parse(readFileSync(new URL("../data/municipios-ibge.json", import.meta.url), "utf8"));

async function withoutNetwork(run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    throw new Error(`A rota de cidades não pode chamar a rede: ${input}`);
  };

  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("lista as cidades do estado escolhido, ordenadas por nome", async () => {
  await withoutNetwork(async () => {
    const response = await GET(new Request("http://localhost/api/locations/cities?uf=pr"));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /max-age=21600/);

    const body = await response.json();
    assert.equal(body.uf, "PR");
    assert.equal(body.cities.length, 399);

    const names = body.cities.map((city) => city.name);
    assert.ok(names.includes("Colombo"));
    assert.ok(names.includes("Curitiba"));
    assert.ok(names.includes("São José dos Pinhais"));
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, "pt-BR")));
    assert.deepEqual(body.cities.find((city) => city.name === "Colombo"), { id: 4105805, name: "Colombo" });
    assert.ok(body.cities.every((city) => Number.isInteger(city.id)));
  });
});

test("não chama fetch para listar cidades", async () => {
  await withoutNetwork(async (calls) => {
    for (const uf of ["PR", "SC", "DF"]) {
      const response = await GET(new Request(`http://localhost/api/locations/cities?uf=${uf}`));
      assert.equal(response.status, 200);
    }
    assert.deepEqual(calls, []);
  });
});

test("rejeita UF inválida ou ausente", async () => {
  await withoutNetwork(async (calls) => {
    for (const query of ["?uf=XX", "?uf=", ""]) {
      const response = await GET(new Request(`http://localhost/api/locations/cities${query}`));
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.match(body.error, /estado válido/i);
    }
    assert.deepEqual(calls, []);
  });
});

test("o snapshot do IBGE cobre as 27 UFs e todos os municípios", () => {
  const ufs = Object.keys(snapshot.ufs);
  assert.equal(ufs.length, 27);
  assert.match(snapshot.geradoEm, /^\d{4}-\d{2}-\d{2}$/);

  const rows = ufs.flatMap((uf) => snapshot.ufs[uf]);
  assert.ok(rows.length >= 5570, `esperava ao menos 5570 municípios, veio ${rows.length}`);
  assert.equal(new Set(rows.map(([id]) => id)).size, rows.length);
  assert.ok(rows.every(([id, name]) => Number.isInteger(id) && typeof name === "string" && name.trim() === name && name));

  const santaCatarina = snapshot.ufs.SC.map(([, name]) => name);
  assert.equal(santaCatarina.length, 295);
  assert.equal(new Set(santaCatarina).size, santaCatarina.length);
});
