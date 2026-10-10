import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { createRequire } from "node:module";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const compiled = await build({ entryPoints: [new URL("../app/ui/public-booking-app.tsx", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", external: ["react", "react/jsx-runtime"], loader: { ".css": "empty" } });
const hours = Array.from({ length: 7 }, (_, day) => ({ day, enabled: day !== 0, openingTime: "08:00", closingTime: "19:00" }));
const fixture = {
  organization: { id: 42, name: "Barbearia Teste", slug: "teste", enabled: true, requiresApproval: false, weekdays: [1,2,3,4,5,6], weeklyHours: hours },
  services: [{ id: 11, name: "Corte", priceCents: 3000, durationMinutes: 30 }, { id: 12, name: "Barba", priceCents: 2500, durationMinutes: 20 }],
  barbers: [{ id: 1, name: "Davi", photoUrl: "/davi.jpg", weeklyHours: hours }, { id: 2, name: "Eduardo", photoUrl: null, weeklyHours: hours.map(h => ({ ...h, enabled: h.enabled && h.day !== 4 })) }],
  hasMemberships: true,
  gallery: [{ id: 1, kind: "cover", url: "/cover.jpg" }, ...[2,3,4].map(id => ({ id, kind: "work", url: `/work-${id}.jpg`, barberName: "Equipe" }))],
  payments: { pixEnabled: true, pixKey: "test", cashEnabled: true, debitEnabled: false, creditEnabled: false },
};

async function setup({ reduced = false, noPhotos = false, unlimited = false } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: "https://example.test/agendar/teste", pretendToBeVisual: true });
  const { window } = dom;
  const names = ["window", "document", "navigator", "HTMLElement", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  for (const [name, value] of Object.entries({ window, document: window.document, navigator: window.navigator, HTMLElement: window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  window.matchMedia = () => ({ matches: reduced });
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.scrollTo = () => {};
  const timers = new Map(); let nextTimer = 1;
  window.setInterval = (callback, delay) => { const id = nextTimer++; timers.set(id, { callback, delay }); return id; };
  window.clearInterval = id => timers.delete(id);
  const requests = [];
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.includes("/membership?q=")) return Response.json({ candidates: [{ clientId: 9, clientName: "João Silva", requiresPhone: false }] });
    if (url.endsWith("/membership")) return Response.json({ membership: { clientId: 9, clientName: "João Silva", planId: 1, planName: "Mensal", serviceId: 11, serviceName: "Corte", durationMinutes: 30, remainingUses: unlimited ? 0 : 3, unlimitedUses: unlimited, dueDate: "2026-11-07" } });
    if (url.includes("payments=1")) return Response.json({ payments: fixture.payments });
    return Response.json({ slots: [{ time: "10:00", barberId: 1, barberName: "Davi" }] });
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require, window, document: window.document, fetch, console, AbortController, Response, setTimeout, clearTimeout }, { filename: "public-booking-app.cjs" });
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(window.document.getElementById("root"));
  await act(async () => root.render(React.createElement(module.exports.PublicBookingApp, { data: noPhotos ? { ...fixture, gallery: [], barbers: fixture.barbers.map(b => ({ ...b, photoUrl: null })) } : fixture, today: "2026-10-07" })));
  const settle = async (ms = 40) => act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
  const click = async node => { assert.ok(node, "control exists"); await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))); await settle(); };
  return { window, document: window.document, requests, timers, click, settle, cleanup: async () => {
    await act(async () => root.unmount()); dom.window.close();
    for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name]; }
  } };
}

test("capa vem primeiro e agendamento avança profissional → serviço → data e horário", async () => {
  const ui = await setup(); const { document, click, settle, requests } = ui;
  try {
    assert.equal(document.querySelector("main .public-booking-shell").firstElementChild.className, "booking-hero");
    assert.equal(document.querySelector("#booking-service"), null);
    assert.equal(document.querySelector("#booking-date"), null);
    await click(document.querySelector('[aria-label="Escolher Davi"]'));
    assert.ok(document.querySelector("#booking-service"));
    assert.equal(document.querySelector("#booking-date"), null);
    await click([...document.querySelectorAll(".services button")].find(b => b.textContent.includes("Barba")));
    assert.ok(document.querySelector("#booking-date"));
    await click([...document.querySelectorAll(".booking-days button")].find(b => b.textContent === "8"));
    await settle();
    assert.ok(requests.some(r => r.url.includes("serviceId=12&barberId=1")));
    await click(document.querySelector(".booking-times button"));
    assert.ok(document.querySelector("#booking-contact"));
    await click(document.querySelector('[aria-label="Escolher Eduardo"]'));
    assert.equal(document.querySelector("#booking-contact"), null, "trocar profissional limpa o horário anterior");
    assert.equal([...document.querySelectorAll(".booking-days button")].find(b => b.textContent === "8").disabled, true, "folga do profissional não pode ser selecionada");
    assert.equal(requests.filter(r => r.options.method === "POST").length, 0, "selecionar etapas nunca cria agendamento");
  } finally { await ui.cleanup(); }
});

test("galeria abre a foto certa sem escolher barbeiro nem repetir controles acessíveis", async () => {
  const ui = await setup(); const { document, click } = ui;
  try {
    assert.doesNotMatch(document.body.textContent, /Pausar fotos|Mover fotos|Arraste para ver mais|Vamos reservar seu próximo visual|SEU HORÁRIO, DO SEU JEITO|QUEM VAI TE ATENDER/);
    assert.equal(document.querySelector(".booking-steps"), null);
    const photos = [...document.querySelectorAll(".booking-work-rail button")];
    assert.equal(photos.filter(button => button.tabIndex === 0).length, 3, "cada trabalho tem apenas um controle no teclado");
    for (const photo of [photos[0], photos.find(button => button.tabIndex === -1)]) {
      const expectedSrc = photo.querySelector("img").getAttribute("src");
      await click(photo);
      const dialog = document.querySelector('[role="dialog"][aria-label="Foto ampliada"]');
      assert.equal(dialog.querySelector("img").getAttribute("src"), expectedSrc);
      assert.equal(document.body.style.overflow, "hidden");
      await click(document.querySelector('[aria-label="Fechar foto"]'));
      assert.equal(document.body.style.overflow, "");
      assert.equal(document.querySelectorAll(".booking-team-portrait.selected").length, 0);
      assert.equal(document.querySelector("#booking-service"), null);
    }
  } finally { await ui.cleanup(); }
});

test("mensalista se identifica depois do profissional e segue com o serviço do plano", async () => {
  const ui = await setup();
  try {
    await ui.click(ui.document.querySelector('[aria-label="Escolher Davi"]'));
    await ui.click(ui.document.querySelector(".booking-membership-entry"));
    const field = ui.document.querySelector(".membership-name-field input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(ui.window.HTMLInputElement.prototype, "value").set.call(field, "João");
      field.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
    });
    await ui.settle(340);
    await ui.click(ui.document.querySelector(".membership-name-option"));
    await ui.click(ui.document.querySelector(".membership-credit-confirm .booking-membership-find"));
    assert.equal(ui.document.querySelector(".membership-picker"), null);
    assert.ok(ui.document.querySelector("#booking-date"));
    assert.match(ui.document.querySelector(".booking-membership-entry").textContent, /João Silva/);
    assert.equal(ui.requests.filter(r => r.options.method === "POST" && !r.url.includes("/membership")).length, 0);
  } finally { await ui.cleanup(); }
});

test("sem fotos, a capa alternativa e qualquer profissional preservam o acesso ao agendamento", async () => {
  const fallback = await setup({ noPhotos: true, reduced: true });
  try {
    assert.ok(fallback.document.querySelector(".booking-hero-empty"));
    assert.ok(fallback.document.querySelector(".booking-team-initial"));
    await fallback.click(fallback.document.querySelector(".booking-any-professional"));
    assert.ok(fallback.document.querySelector("#booking-service"));
    assert.ok([...fallback.document.querySelectorAll("button")].some(b => b.textContent.includes("Sou mensalista")));
  } finally { await fallback.cleanup(); }
});


test("plano ilimitado mostra modalidade e vencimento sem anunciar reserva de crédito", async () => {
  const ui = await setup({ unlimited: true });
  try {
    await ui.click(ui.document.querySelector('[aria-label="Escolher Davi"]'));
    await ui.click(ui.document.querySelector(".booking-membership-entry"));
    const field = ui.document.querySelector(".membership-name-field input");
    await act(async () => {
      Object.getOwnPropertyDescriptor(ui.window.HTMLInputElement.prototype, "value").set.call(field, "João");
      field.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
    });
    await ui.settle(340);
    await ui.click(ui.document.querySelector(".membership-name-option"));
    const confirmed = ui.document.querySelector(".membership-credit-confirm");
    assert.match(confirmed.textContent, /Usos ilimitados/);
    assert.match(confirmed.textContent, /07\/11\/2026/);
    assert.doesNotMatch(confirmed.textContent, /1 crédito|0 créditos|será reservado/);
    await ui.click(confirmed.querySelector(".booking-membership-find"));
    assert.ok(ui.document.querySelector("#booking-date"));
  } finally { await ui.cleanup(); }
});
