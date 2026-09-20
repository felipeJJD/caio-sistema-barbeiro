export type MembershipServiceLike = { id: number; name: string };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\bcabelos?\b/g, "corte").replace(/\bcortes?\b/g, "corte").replace(/[^a-z0-9+ ]+/g, " ").replace(/\s+/g, " ").trim();
}

const serviceTokens = ["corte", "barba", "sobrancelha", "bigode", "pezinho", "pigmentado"] as const;

function cues(value: string) {
  const normalized = normalize(value);
  return serviceTokens.filter((token) => normalized.includes(token));
}

export function resolveMembershipService<T extends MembershipServiceLike>(planKind: string, planName: string, services: T[]): T | null {
  const exact = services.find((service) => normalize(service.name) === normalize(planKind)) ?? null;
  const planCues = cues(planName);
  if (!planCues.length) return exact;

  const candidates = services
    .map((service) => ({ service, cues: cues(service.name) }))
    .filter((entry) => planCues.every((token) => entry.cues.includes(token)))
    .sort((left, right) => left.cues.length - right.cues.length || left.service.name.localeCompare(right.service.name, "pt-BR"));

  const inferred = candidates[0]?.service ?? null;
  if (!inferred) return exact;
  if (!exact) return inferred;

  const exactCues = cues(exact.name);
  const exactMatchesPlan = planCues.every((token) => exactCues.includes(token));
  return exactMatchesPlan ? exact : inferred;
}

export function normalizeMembershipIdentity(value: string) {
  return normalize(value);
}

export function phoneDigits(value: string) {
  return value.replace(/\D/g, "");
}
