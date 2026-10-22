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

const IBGE_HOST = "servicodados.ibge.gov.br";
const BRASILAPI_HOST = "brasilapi.com.br";

async function withFetch(handler, run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  };

  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function networkError() {
  const error = new TypeError("fetch failed");
  error.cause = Object.assign(new Error("Connect Timeout Error"), { code: "UND_ERR_CONNECT_TIMEOUT" });
  return error;
}

const brasilApiPR = [
  { nome: "SÃO JOSÉ DOS PINHAIS", codigo_ibge: "4125506" },
  { nome: "COLOMBO (PARANÁ)", codigo_ibge: "4105805" },
  { nome: "CURITIBA", codigo_ibge: "4106902" },
  { nome: "ÂNGULO (PARANÁ)", codigo_ibge: "4101853" },
];

const expectedPR = [
  { id: 4101853, name: "Ângulo" },
  { id: 4105805, name: "Colombo" },
  { id: 4106902, name: "Curitiba" },
  { id: 4125506, name: "São José dos Pinhais" },
];

test("usa a BrasilAPI quando o IBGE falha por erro de rede", async () => {
  await withFetch(
    (url) => {
      if (url.includes(IBGE_HOST)) throw networkError();
      return jsonResponse(brasilApiPR);
    },
    async (calls) => {
      const response = await GET(new Request("http://localhost/api/locations/cities?uf=PR"));
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.uf, "PR");
      assert.deepEqual(body.cities, expectedPR);

      assert.equal(calls.length, 2);
      assert.ok(calls[0].url.includes(IBGE_HOST));
      assert.ok(calls[0].init.signal instanceof AbortSignal);
      assert.equal(
        calls[1].url,
        "https://brasilapi.com.br/api/ibge/municipios/v1/PR?providers=dados-abertos-br,gov,wikipedia",
      );
      assert.ok(calls[1].init.signal instanceof AbortSignal);
      assert.match(calls[1].init.headers["user-agent"], /CortouAnotouProspeccao/);
    },
  );
});

test("usa a BrasilAPI quando o IBGE responde com erro HTTP", async () => {
  await withFetch(
    (url) => (url.includes(IBGE_HOST) ? jsonResponse({ erro: "indisponível" }, 500) : jsonResponse(brasilApiPR)),
    async (calls) => {
      const response = await GET(new Request("http://localhost/api/locations/cities?uf=PR"));
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).cities, expectedPR);
      assert.equal(calls.filter((call) => call.url.includes(BRASILAPI_HOST)).length, 1);
    },
  );
});

test("usa a BrasilAPI quando o IBGE devolve lista vazia ou inválida", async () => {
  for (const payload of [[], { mensagem: "sem dados" }]) {
    await withFetch(
      (url) => (url.includes(IBGE_HOST) ? jsonResponse(payload) : jsonResponse(brasilApiPR)),
      async () => {
        const response = await GET(new Request("http://localhost/api/locations/cities?uf=PR"));
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).cities, expectedPR);
      },
    );
  }
});

test("converte nomes da BrasilAPI para título preservando preposições e acentos", async () => {
  await withFetch(
    (url) =>
      url.includes(IBGE_HOST)
        ? jsonResponse({}, 503)
        : jsonResponse([
            { nome: "SÃO JOSÉ DOS PINHAIS", codigo_ibge: "4125506" },
            { nome: "COLOMBO", codigo_ibge: "4105805" },
            { nome: "FOZ DO IGUAÇU", codigo_ibge: "4108304" },
            { nome: "OLHO D'ÁGUA DAS FLORES", codigo_ibge: "2704708" },
            { nome: "XIQUE-XIQUE", codigo_ibge: "2933604" },
            { nome: "SANTA MARIA E SÃO JOÃO", codigo_ibge: "9999999" },
          ]),
    async () => {
      const response = await GET(new Request("http://localhost/api/locations/cities?uf=PR"));
      assert.equal(response.status, 200);
      const names = (await response.json()).cities.map((city) => city.name);
      assert.deepEqual(names, [
        "Colombo",
        "Foz do Iguaçu",
        "Olho d'Água das Flores",
        "Santa Maria e São João",
        "São José dos Pinhais",
        "Xique-Xique",
      ]);
    },
  );
});

test("retorna 503 quando IBGE e BrasilAPI falham", async () => {
  const falhas = [
    () => {
      throw networkError();
    },
    () => jsonResponse({ erro: "indisponível" }, 502),
    () => jsonResponse([]),
  ];

  for (const handler of falhas) {
    await withFetch(
      (url, init) => {
        if (url.includes(IBGE_HOST)) throw networkError();
        return handler(url, init);
      },
      async (calls) => {
        const response = await GET(new Request("http://localhost/api/locations/cities?uf=PR"));
        assert.equal(response.status, 503);
        const body = await response.json();
        assert.equal(body.error, "Não consegui carregar as cidades agora. Tente novamente em alguns segundos.");
        assert.equal(calls.length, 2);
      },
    );
  }
});

test("não consulta a BrasilAPI quando o IBGE responde normalmente", async () => {
  await withFetch(
    () => jsonResponse([{ id: 4106902, nome: "Curitiba" }]),
    async (calls) => {
      const response = await GET(new Request("http://localhost/api/locations/cities?uf=PR"));
      assert.equal(response.status, 200);
      assert.deepEqual((await response.json()).cities, [{ id: 4106902, name: "Curitiba" }]);
      assert.equal(calls.length, 1);
      assert.ok(calls.every((call) => !call.url.includes(BRASILAPI_HOST)));
    },
  );
});
