import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/locations/cities/route.js";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("carrega e ordena as cidades do estado escolhido", async () => {
  const originalFetch = globalThis.fetch;
  let calledUrl = "";
  globalThis.fetch = async (input) => {
    calledUrl = String(input);
    return jsonResponse([
      { id: 4106902, nome: "Curitiba" },
      { id: 4105805, nome: "Colombo" },
      { id: 4125506, nome: "São José dos Pinhais" },
    ]);
  };

  try {
    const response = await GET(new Request("http://localhost/api/locations/cities?uf=PR"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.uf, "PR");
    assert.deepEqual(body.cities, [
      { id: 4106902, name: "Curitiba" },
      { id: 4105805, name: "Colombo" },
      { id: 4125506, name: "São José dos Pinhais" },
    ]);
    assert.match(calledUrl, /estados\/PR\/municipios/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejeita UF inválida sem consultar o IBGE", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return jsonResponse([]);
  };

  try {
    const response = await GET(new Request("http://localhost/api/locations/cities?uf=XX"));
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /estado válido/i);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
