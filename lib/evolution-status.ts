export function evolutionDeliveryStatus(value: unknown) {
  const status = String(value ?? "").toUpperCase();
  if (status === "READ" || status === "PLAYED" || status === "4") return "read" as const;
  if (status === "DELIVERY_ACK" || status === "3") return "delivered" as const;
  return null;
}

/** Only explicit rate limiting can be replayed without an ambiguous send. */
export function evolutionRetryDelay(httpStatus: number, attempt: number) {
  return httpStatus === 429 && Number.isInteger(attempt) && attempt >= 0 && attempt < 3
    ? 60_000 * 2 ** attempt : null;
}
