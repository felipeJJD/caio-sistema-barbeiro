export type TippedCommission = {
  commissionCents: number;
  tipCents?: number | null;
};

/** The professional receives their service commission plus the full tip. */
export function barberPayoutCents(record: TippedCommission) {
  return record.commissionCents + (record.tipCents ?? 0);
}
