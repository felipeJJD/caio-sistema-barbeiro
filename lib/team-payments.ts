export const TEAM_PAYMENT_KINDS = ["Vale", "Pagamento"] as const;

export type TeamPaymentKind = typeof TEAM_PAYMENT_KINDS[number];

export type TeamPaymentAmount = {
  kind: string;
  valueCents: number;
};

export function isTeamPaymentKind(value: string): value is TeamPaymentKind {
  return TEAM_PAYMENT_KINDS.some((kind) => kind === value);
}

export function teamPaymentSummary(earnedCents: number, entries: TeamPaymentAmount[]) {
  const valeCents = entries
    .filter((entry) => entry.kind === "Vale")
    .reduce((sum, entry) => sum + entry.valueCents, 0);
  const paidCents = entries
    .filter((entry) => entry.kind === "Pagamento")
    .reduce((sum, entry) => sum + entry.valueCents, 0);
  const deliveredCents = valeCents + paidCents;

  return {
    earnedCents,
    valeCents,
    paidCents,
    deliveredCents,
    remainingCents: earnedCents - deliveredCents,
  };
}
