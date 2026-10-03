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
  const ddd = Number(digits.slice(2, 4));
  const validDDD = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);
  return /^55\d{2}9\d{8}$/.test(digits) && validDDD.has(ddd) ? digits : "";
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

