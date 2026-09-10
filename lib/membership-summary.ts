type MembershipClient = { id: number; status: string };
type MembershipPayment = { clientId: number; amountCents: number };
type MembershipRecord = {
  commissionCents: number;
  tipCents?: number | null;
  membershipClientId: number | null;
  quantity: number;
  recordType: string;
};

/**
 * Totals shown in the operational membership cards.
 *
 * Deleted or inactive clients keep their payment and attendance history for the
 * Finance and History screens, but must not inflate the active-plan cards.
 */
export function activeMembershipTotals(
  clients: MembershipClient[],
  payments: MembershipPayment[],
  records: MembershipRecord[],
) {
  const activeClientIds = new Set(
    clients.filter((client) => client.status === "Ativo").map((client) => client.id),
  );
  const activePayments = payments.filter((payment) => activeClientIds.has(payment.clientId));
  const activeRecords = records.filter((record) => (
    record.recordType === "Mensalista"
    && record.membershipClientId !== null
    && activeClientIds.has(record.membershipClientId)
  ));

  return {
    revenueCents: activePayments.reduce((sum, payment) => sum + payment.amountCents, 0),
    payoutCents: activeRecords.reduce((sum, record) => sum + record.commissionCents + (record.tipCents ?? 0), 0),
    uses: activeRecords.reduce((sum, record) => sum + record.quantity, 0),
  };
}

/** Totals for the selected reference month, including preserved history. */
export function membershipMonthTotals(
  payments: MembershipPayment[],
  records: MembershipRecord[],
) {
  const paidClientIds = new Set(payments.map((payment) => payment.clientId));
  const monthRecords = records.filter((record) => (
    record.recordType === "Mensalista"
    && record.membershipClientId !== null
    && paidClientIds.has(record.membershipClientId)
  ));

  return {
    revenueCents: payments.reduce((sum, payment) => sum + payment.amountCents, 0),
    payoutCents: monthRecords.reduce((sum, record) => sum + record.commissionCents + (record.tipCents ?? 0), 0),
    uses: monthRecords.reduce((sum, record) => sum + record.quantity, 0),
  };
}

/** The owner keeps the shop's plan balance; configured per-use payout is for staff. */
export function membershipPayoutCentsForAccessRole(
  accessRole: string,
  configuredPayoutCents: number | null | undefined,
  planKind: string,
) {
  if (accessRole === "owner") return 0;
  return configuredPayoutCents ?? (planKind.toLocaleLowerCase("pt-BR").includes("barba") ? 2500 : 1500);
}
