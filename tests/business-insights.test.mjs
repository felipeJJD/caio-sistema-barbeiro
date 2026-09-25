import assert from "node:assert/strict";
import test from "node:test";

import { buildClientFrequency, buildDormantClients, buildFinanceMonths } from "../lib/business-insights.ts";

const attendance = (occurredAt, clientName, valueCents = 3000, quantity = 1) => ({
  occurredAt,
  clientName,
  quantity,
  valueCents,
  tipCents: 0,
  serviceName: "Corte",
  barberName: "Davi",
});

test("flags repeat clients only after they leave their normal return rhythm", () => {
  const clients = buildDormantClients({
    today: "2026-10-05",
    attendances: [
      attendance("2026-08-01", "Ana"),
      attendance("2026-08-16", "Ana"),
      attendance("2026-09-01", "Ana"),
      attendance("2026-08-01", "Bruno"),
      attendance("2026-09-20", "Carla"),
    ],
    appointments: [{ appointmentDate: "2026-09-01", clientName: "Ana", phone: "(41) 99999-9999" }],
    membershipClients: [],
  });

  assert.equal(clients.some((client) => client.name === "Ana"), true);
  assert.equal(clients.find((client) => client.name === "Ana")?.expectedReturnDays, 30);
  assert.equal(clients.find((client) => client.name === "Ana")?.whatsappReady, true);
  assert.equal(clients.some((client) => client.name === "Carla"), false);
});

test("waits longer before treating a one-time visit as a dormant client", () => {
  const clients = buildDormantClients({
    today: "2026-10-05",
    attendances: [attendance("2026-08-01", "Bruno")],
    appointments: [],
    membershipClients: [{ name: "Bruno", phone: "41988887777" }],
  });

  assert.equal(clients.length, 1);
  assert.equal(clients[0].expectedReturnDays, 60);
  assert.equal(clients[0].bucket, "60+");
});

test("builds monthly revenue from services, memberships and products without changing financial records", () => {
  const months = buildFinanceMonths({
    today: "2026-09-24",
    monthCount: 2,
    attendances: [
      { ...attendance("2026-09-02", "Ana", 1000), tipCents: 100 },
      attendance("2026-09-03", "Bruno", 2000),
      attendance("2026-08-10", "Ana", 1500, 2),
    ],
    membershipPayments: [
      { occurredAt: "2026-09-05", valueCents: 3000 },
      { occurredAt: "2026-08-05", valueCents: 2500 },
    ],
    productSales: [
      { occurredAt: "2026-09-03", valueCents: 500 },
      { occurredAt: "2026-08-11", valueCents: 700 },
    ],
  });

  assert.equal(months[0].month, "2026-09");
  assert.equal(months[0].totalRevenueCents, 6600);
  assert.equal(months[0].attendanceCount, 2);
  assert.equal(months[1].month, "2026-08");
  assert.equal(months[1].totalRevenueCents, 4700);
  assert.equal(months[1].attendanceCount, 2);
});


test("builds client frequency ranking inside the selected period", () => {
  const clients = buildClientFrequency({
    today: "2026-09-25",
    days: 90,
    attendances: [
      attendance("2026-07-10", "João"),
      attendance("2026-08-10", "João"),
      attendance("2026-09-10", "João"),
      attendance("2026-08-20", "Lucas"),
      attendance("2026-09-20", "Lucas"),
      attendance("2026-05-01", "Fora do período"),
    ],
  });

  assert.equal(clients[0].name, "João");
  assert.equal(clients[0].visitCount, 3);
  assert.equal(clients[0].cadenceDays, 31);
  assert.equal(clients.find((client) => client.name === "Lucas")?.visitCount, 2);
  assert.equal(clients.some((client) => client.name === "Fora do período"), false);
});
