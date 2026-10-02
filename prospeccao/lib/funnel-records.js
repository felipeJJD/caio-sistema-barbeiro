export const FUNNEL_STATUSES = new Set([
  "preparado",
  "contatado",
  "respondeu",
  "interessado",
  "sem_interesse",
]);

export function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export function normalizePhoneE164(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return /^55\d{11}$/.test(digits) ? digits : "";
}

export function normalizeLead(input = {}, fallbackCity = "") {
  const phoneE164 = normalizePhoneE164(input.phoneE164);
  if (!phoneE164) throw new Error("Contato sem celular brasileiro válido.");

  const sourceId = text(input.id || input.sourceId, 180);
  const leadKey = `phone:${phoneE164}`;

  return {
    leadKey,
    sourceId,
    name: text(input.name || "Barbearia", 240),
    phone: text(input.phone, 40),
    phoneE164,
    address: text(input.address, 600),
    city: text(input.city || fallbackCity, 180),
    sourceUrl: text(input.sourceUrl, 900),
    message: text(input.message, 1800),
  };
}

export function normalizeStatus(value) {
  const status = text(value, 40);
  if (!FUNNEL_STATUSES.has(status)) throw new Error("Status inválido.");
  return status;
}

export function statusTransition(current = {}, nextStatus) {
  const status = normalizeStatus(nextStatus);
  if (current.doNotContact && status !== "sem_interesse") {
    const error = new Error("Esse contato está marcado para não receber novas abordagens.");
    error.status = 409;
    throw error;
  }
  return {
    status,
    doNotContact: Boolean(current.doNotContact) || status === "sem_interesse",
  };
}
