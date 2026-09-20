export type MembershipServiceLike = { id: number; name: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bcabelos?\b/g, "corte").replace(/\bcortes?\b/g, "corte").replace(/[^a-z0-9+ ]+/g, " ").replace(/\s+/g, " ").trim();
}

const serviceTokens = ["corte", "barba", "sobrancelha", "bigode", "pezinho", "pigmentado"] as const;

function cues(value: string) {
  const normalized = normalize(value);
  return serviceTokens.filter((token) => normalized.includes(token));
}

export function resolveMembershipService<T extends MembershipServiceLike>(planKind: string, planName: string, services: T[], serviceId?: number | null): T | null {
  if (serviceId) {
    const linked = services.find((service) => service.id === serviceId) ?? null;
    if (linked) return linked;
  }

  const exact = services.find((service) => normalize(service.name) === normalize(planKind)) ?? null;
  if (exact) return exact;

  // Compatibilidade somente para planos antigos que ainda não possuem vínculo explícito.
  const planCues = cues(planName);
  if (!planCues.length) return null;
  return services
    .map((service) => ({ service, cues: cues(service.name) }))
    .filter((entry) => planCues.every((token) => entry.cues.includes(token)))
    .sort((left, right) => left.cues.length - right.cues.length || left.service.name.localeCompare(right.service.name, "pt-BR"))[0]?.service ?? null;
}

export function normalizeMembershipIdentity(value: string) {
  return normalize(value);
}

export function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}


export function membershipNameMatches(query: string, name: string) {
  const normalizedQuery = normalizeMembershipIdentity(query);
  if (normalizedQuery.length < 3) return false;
  return normalizeMembershipIdentity(name).includes(normalizedQuery);
}

export function membershipNameNeedsPhone(name: string, names: string[]) {
  const normalized = normalizeMembershipIdentity(name);
  return names.filter((item) => normalizeMembershipIdentity(item) === normalized).length > 1;
}

export function availableMembershipUses(balance: number, reservedUses: number) {
  return Math.max(0, Math.floor(Number(balance) || 0) - Math.max(0, Math.floor(Number(reservedUses) || 0)));
}
