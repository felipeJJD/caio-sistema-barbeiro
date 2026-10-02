import test from "node:test";
import assert from "node:assert/strict";
import { chooseCityPlace, mapOverturePlace, parseBrazilPhone } from "../app/api/leads/search/route.js";

test("descarta telefone incompleto como apenas DDD", () => {
  assert.equal(parseBrazilPhone("66"), null);
  assert.equal(parseBrazilPhone("123"), null);
  assert.equal(parseBrazilPhone("+55 66"), null);
});

test("normaliza celular e telefone fixo brasileiros completos", () => {
  const mobile = parseBrazilPhone("+55 11 98394-4279");
  assert.deepEqual(mobile, {
    national: "11983944279",
    e164: "5511983944279",
    display: "(11) 98394-4279",
    kind: "mobile",
    whatsappCandidate: true,
  });

  const landline = parseBrazilPhone("+55 11 2769-3189");
  assert.deepEqual(landline, {
    national: "1127693189",
    e164: "551127693189",
    display: "(11) 2769-3189",
    kind: "landline",
    whatsappCandidate: false,
  });
});

test("mapeia barbearia da Overture e prefere celular quando há mais de um telefone", () => {
  const lead = mapOverturePlace({
    id: "08f-place-123",
    name: "Barbearia Zeronze",
    category: "barber",
    confidence: 0.92,
    operatingStatus: "open",
    phones: ["+551127693189", "+5511983944279"],
    addresses: [{
      freeform: "Rua Exemplo, 123",
      locality: "São Paulo",
      region: "BR-SP",
      postcode: "01000-000",
      country: "BR",
    }],
    websites: ["https://barbearia.example"],
    socials: [],
    lat: -23.55,
    lon: -46.63,
  }, "São Paulo", "SP");

  assert.equal(lead.name, "Barbearia Zeronze");
  assert.equal(lead.phone, "(11) 98394-4279");
  assert.equal(lead.phoneE164, "5511983944279");
  assert.equal(lead.phoneKind, "mobile");
  assert.equal(lead.whatsappCandidate, true);
  assert.match(lead.address, /São Paulo/);
  assert.equal(lead.source, "Overture Maps");
  assert.equal(lead.potential, "alto");
});

test("escolhe a cidade da UF pedida quando o nome é ambíguo", () => {
  const places = [
    {
      addresstype: "city",
      address: { city: "São Paulo", state: "São Paulo" },
      extratags: { "ISO3166-2": "BR-SP" },
      boundingbox: ["-24.0", "-23.3", "-46.9", "-46.3"],
    },
    {
      addresstype: "city",
      address: { city: "São Paulo", state: "Paraná" },
      extratags: { "ISO3166-2": "BR-PR" },
      boundingbox: ["-25.0", "-24.7", "-52.0", "-51.7"],
    },
  ];

  const selected = chooseCityPlace(places, "SP");
  assert.equal(selected.extratags["ISO3166-2"], "BR-SP");
});
