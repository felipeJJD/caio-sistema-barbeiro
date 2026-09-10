import assert from "node:assert/strict";
import test from "node:test";

import { activeMembershipTotals, membershipMonthTotals, membershipPayoutCentsForAccessRole } from "../lib/membership-summary.ts";

test("active membership cards ignore deleted clients without erasing their history", () => {
  const totals = activeMembershipTotals(
    [
      { id: 1, status: "Ativo" },
      { id: 2, status: "Bloqueado" },
    ],
    [
      { clientId: 1, amountCents: 8990 },
      { clientId: 2, amountCents: 14990 },
    ],
    [
      { recordType: "Mensalista", membershipClientId: 1, quantity: 1, commissionCents: 1500, tipCents: 0 },
      { recordType: "Mensalista", membershipClientId: 2, quantity: 2, commissionCents: 2500, tipCents: 0 },
    ],
  );

  assert.deepEqual(totals, { revenueCents: 8990, payoutCents: 1500, uses: 1 });
});

test("tips remain part of the professional payout for an active member use", () => {
  const totals = activeMembershipTotals(
    [{ id: 1, status: "Ativo" }],
    [{ clientId: 1, amountCents: 8990 }],
    [{ recordType: "Mensalista", membershipClientId: 1, quantity: 1, commissionCents: 1500, tipCents: 500 }],
  );

  assert.equal(totals.payoutCents, 2000);
});

test("selected membership month keeps historical clients in its totals", () => {
  const totals = membershipMonthTotals(
    [
      { clientId: 1, amountCents: 8990 },
      { clientId: 2, amountCents: 14990 },
    ],
    [
      { recordType: "Mensalista", membershipClientId: 1, quantity: 1, commissionCents: 1500, tipCents: 0 },
      { recordType: "Mensalista", membershipClientId: 2, quantity: 2, commissionCents: 2500, tipCents: 500 },
      { recordType: "Avulso", membershipClientId: null, quantity: 1, commissionCents: 3000, tipCents: 0 },
    ],
  );

  assert.deepEqual(totals, { revenueCents: 23980, payoutCents: 4500, uses: 3 });
});

test("owner membership payout follows the role instead of a hardcoded person name", () => {
  assert.equal(membershipPayoutCentsForAccessRole("owner", 2500, "Corte + barba"), 0);
  assert.equal(membershipPayoutCentsForAccessRole("barber", 2500, "Corte + barba"), 2500);
});
