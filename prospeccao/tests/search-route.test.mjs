import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "../app/api/leads/search/route.js";

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestFor(city) {
  return new Request(`http://localhost/api/leads/search?city=${encodeURIComponent(city)}`);
}

const curitibaMunicipality = { id: 4106902, nome: "Curitiba" };

function company(overrides = {}) {
  return {
    cnpj: "12345678000190",
    nome_fantasia: "Barbearia Central",
    razao_social: "BARBEARIA CENTRAL LTDA",
    descricao_situacao_cadastral: "ATIVA",
    descricao_tipo_de_logradouro: "RUA",
    logradouro: "DAS FLORES",
    numero: "100",
    bairro: "CENTRO",
    municipio: "CURITIBA",
    uf: "PR",
    ddd_telefone_1: "41999999999",
    ddd_telefone_2: "",
    ...overrides,
  };
}

test("busca CNPJ por cidade e CNAE e prioriza contatos com telefone", async () => {
  const originalFetch = globalThis.fetch;
  const called = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    called.push(url);
    if (url.includes("servicodados.ibge.gov.br")) {
      return jsonResponse([curitibaMunicipality, { id: 4104808, nome: "Cascavel" }]);
    }
    if (url.includes("minhareceita.org")) {
      return jsonResponse({
        data: [
          company(),
          company({
            cnpj: "98765432000110",
            nome_fantasia: "Studio Navalha",
            razao_social: "JOAO DA SILVA",
            ddd_telefone_1: "",
          }),
          company({
            cnpj: "11111111000111",
            nome_fantasia: "Barbearia Inativa",
            descricao_situacao_cadastral: "BAIXADA",
          }),
        ],
      });
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  try {
    const response = await GET(requestFor("Curitiba, PR"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.displayName, "Curitiba, PR");
    assert.equal(body.leads.length, 2);
    assert.equal(body.leads[0].name, "Barbearia Central");
    assert.equal(body.leads[0].phone, "(41) 99999-9999");
    assert.equal(body.leads[0].potential, "alto");
    assert.equal(body.source, "CNPJ público / Minha Receita");
    assert.ok(called.some((url) => url.includes("cnae=9602501")));
    assert.ok(called.some((url) => url.includes("municipio=4106902")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("resolve São Paulo sem UF e encontra o município correto", async () => {
  const originalFetch = globalThis.fetch;
  let nominatimCalled = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim.openstreetmap.org")) {
      nominatimCalled = true;
      return jsonResponse([
        {
          addresstype: "state",
          display_name: "São Paulo, Brasil",
          address: { state: "São Paulo", country_code: "br" },
          extratags: { "ISO3166-2": "BR-SP" },
        },
        {
          addresstype: "city",
          display_name: "São Paulo, São Paulo, Brasil",
          address: { city: "São Paulo", state: "São Paulo", country_code: "br" },
          extratags: { "ISO3166-2": "BR-SP" },
        },
      ]);
    }
    if (url.includes("servicodados.ibge.gov.br")) {
      return jsonResponse([{ id: 3550308, nome: "São Paulo" }, { id: 3509502, nome: "Campinas" }]);
    }
    if (url.includes("minhareceita.org")) {
      return jsonResponse({ data: [company({ municipio: "SAO PAULO", uf: "SP", ddd_telefone_1: "11987654321" })] });
    }
    throw new Error(`URL inesperada: ${url}`);
  };

  try {
    const response = await GET(requestFor("São Paulo"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.displayName, "São Paulo, SP");
    assert.equal(body.leads[0].phone, "(11) 98765-4321");
    assert.equal(nominatimCalled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("explica quando o usuário digita apenas um estado", async () => {
  const originalFetch = globalThis.fetch;
  let otherSourceCalled = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim.openstreetmap.org")) {
      return jsonResponse([{
        addresstype: "state",
        display_name: "Paraná, Brasil",
        address: { state: "Paraná", country_code: "br" },
        extratags: { "ISO3166-2": "BR-PR" },
      }]);
    }
    otherSourceCalled = true;
    return jsonResponse([]);
  };

  try {
    const response = await GET(requestFor("Paraná"));
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.match(body.error, /estado/i);
    assert.match(body.error, /Curitiba, PR/);
    assert.equal(otherSourceCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
