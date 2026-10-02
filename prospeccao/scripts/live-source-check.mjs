import { GET } from "../app/api/leads/search/route.js";

const request = new Request("http://localhost/api/leads/search?city=S%C3%A3o%20Paulo%2C%20SP");
const response = await GET(request);
const body = await response.json();

if (response.status !== 200) {
  throw new Error(`Busca real de São Paulo falhou com ${response.status}: ${body?.error || "erro sem mensagem"}`);
}

const leads = Array.isArray(body?.leads) ? body.leads : [];
if (body?.source !== "Overture Maps") {
  throw new Error(`A rota está usando fonte inesperada: ${body?.source || "sem fonte"}.`);
}
if (leads.length < 5) {
  throw new Error(`A busca real retornou poucos barbeiros em São Paulo: ${leads.length}.`);
}

const mobiles = leads.filter((lead) => lead?.whatsappCandidate && /^55\d{11}$/.test(String(lead?.phoneE164 || "")));
if (mobiles.length < 5) {
  throw new Error(`A rota retornou apenas ${mobiles.length} celulares brasileiros válidos em São Paulo.`);
}

const malformed = leads.filter((lead) => lead?.phone && !/^\(\d{2}\) \d{4,5}-\d{4}$/.test(String(lead.phone)));
if (malformed.length) {
  throw new Error(`A rota deixou passar ${malformed.length} telefone(s) com formato inválido.`);
}

const sample = mobiles.slice(0, 3).map((lead) => `${lead.name}: ${lead.phone}`).join(" | ");
console.log(`Busca real OK: ${body.displayName} -> ${leads.length} barbearias, ${mobiles.length} celulares válidos. Amostra: ${sample}`);
