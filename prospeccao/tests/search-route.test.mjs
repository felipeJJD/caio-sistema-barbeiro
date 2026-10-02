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

function cityPlace(overrides = {}) {
  return {
    osm_type: "relation",
    osm_id: 12345,
    addresstype: "city",
    type: "administrative",
    place_rank: 16,
    lat: "-25.42",
    lon: "-49.27",
    display_name: "Curitiba, Paraná, Brasil",
    address: { city: "Curitiba", state: "Paraná", country_code: "br" },
    extratags: { "ISO3166-2": "BR-PR" },
    boundingbox: ["-25.65", "-25.20", "-49.50", "-49.05"],
    ...overrides,
  };
}

test("prioriza município e retorna barbearias com telefone primeiro", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim.openstreetmap.org")) {
      return jsonResponse([
        {
          addresstype: "state",
          type: "administrative",
          place_rank: 8,
          display_name: "Paraná, Brasil",
          address: { state: "Paraná", country_code: "br" },
          extratags: { "ISO3166-2": "BR-PR" },
          boundingbox: ["-26.7", "-22.5", "-54.7", "-48.0"],
        },
        cityPlace(),
      ]);
    }

    return jsonResponse({
      elements: [
        {
          type: "node",
          id: 1,
          lat: -25.42,
          lon: -49.27,
          tags: { name: "Barbearia Central", shop: "hairdresser", phone: "+55 41 99999-9999", "addr:city": "Curitiba" },
        },
        {
          type: "node",
          id: 2,
          lat: -25.43,
          lon: -49.28,
          tags: { name: "Studio Masculino", shop: "hairdresser", male: "yes", "addr:city": "Curitiba" },
        },
      ],
    });
  };

  try {
    const response = await GET(requestFor("Curitiba, PR"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.leads.length, 2);
    assert.equal(body.leads[0].name, "Barbearia Central");
    assert.equal(body.leads[0].phone, "+55 41 99999-9999");
    assert.equal(body.leads[1].potential, "bom");
    assert.match(body.scope, /cidade/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("explica quando o usuário digita apenas um estado", async () => {
  const originalFetch = globalThis.fetch;
  let overpassCalled = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim.openstreetmap.org")) {
      return jsonResponse([{
        addresstype: "state",
        type: "administrative",
        place_rank: 8,
        display_name: "Paraná, Brasil",
        address: { state: "Paraná", country_code: "br" },
        extratags: { "ISO3166-2": "BR-PR" },
        boundingbox: ["-26.7", "-22.5", "-54.7", "-48.0"],
      }]);
    }
    overpassCalled = true;
    return jsonResponse({ elements: [] });
  };

  try {
    const response = await GET(requestFor("Paraná"));
    assert.equal(response.status, 422);
    const body = await response.json();
    assert.match(body.error, /estado/i);
    assert.match(body.error, /Curitiba, PR/);
    assert.equal(overpassCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("usa servidor alternativo do Overpass quando o primeiro falha", async () => {
  const originalFetch = globalThis.fetch;
  let overpassCalls = 0;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim.openstreetmap.org")) return jsonResponse([cityPlace()]);
    overpassCalls += 1;
    if (overpassCalls === 1) return jsonResponse({ error: "busy" }, 429);
    return jsonResponse({
      elements: [{
        type: "node",
        id: 3,
        lat: -25.42,
        lon: -49.27,
        tags: { name: "Barber Teste", shop: "hairdresser", phone: "41999999999" },
      }],
    });
  };

  try {
    const response = await GET(requestFor("Curitiba, PR"));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.leads.length, 1);
    assert.equal(overpassCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
