import { appDate } from "./app-date";

export type CaAtendeIntent =
  | "greeting"
  | "booking"
  | "availability"
  | "prices"
  | "human"
  | "cancel"
  | "reschedule"
  | "spam"
  | "unknown";

export type CaAtendeInterpretation = {
  intent: CaAtendeIntent;
  date: string;
  service: string;
  barber: string;
  source: "rule" | "ai";
};

export type CaAtendeContextMemory = {
  intent?: string;
  date?: string;
  service?: string;
  barber?: string;
};

export function normalizeCaAtendeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s:/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function caAtendeTomorrow(today = appDate()) {
  const date = new Date(`${today}T12:00:00-03:00`);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function extractCaAtendeDate(value: string, today = appDate()) {
  const text = normalizeCaAtendeText(value);
  if (/\b(hoje|hj)\b/.test(text)) return today;
  if (/\b(amanha|amanhã)\b/.test(value.toLowerCase())) return caAtendeTomorrow(today);
  const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}))?\b/.exec(text);
  if (br) {
    const year = Number(br[3] || today.slice(0,4));
    const month = Number(br[2]);
    const day = Number(br[1]);
    const result = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const parsed = new Date(`${result}T12:00:00-03:00`);
    if (Number.isFinite(parsed.getTime()) && parsed.getFullYear() === year && parsed.getMonth() + 1 === month && parsed.getDate() === day) return result;
  }
  return "";
}

export function highConfidenceCommercialOffer(value: string) {
  const text = normalizeCaAtendeText(value);
  if (text.length < 18) return false;
  const explicit = /\b(proposta comercial|oferta comercial|parceria comercial|queremos apresentar|gostaria de apresentar|tenho uma oferta|temos uma oferta)\b/.test(text);
  if (explicit) return true;
  const seller = /\b(sou consultor|sou representante|falo da|represento a|represento o|equipe comercial|consultoria|vendedor|especialista comercial|plano empresarial|condicao especial)\b/.test(text);
  const category = /\b(vivo|claro|tim|oi|internet|telefonia|fibra|emprestimo|credito|consorcio|maquininha|marketing|trafego pago|energia solar|seguro)\b/.test(text);
  return seller && category;
}

export function classifyCaAtendeByRule(value: string): CaAtendeInterpretation {
  const text = normalizeCaAtendeText(value);
  const date = extractCaAtendeDate(value);
  if (!text) return { intent:"unknown", date:"", service:"", barber:"", source:"rule" };
  if (highConfidenceCommercialOffer(value)) return { intent:"spam", date:"", service:"", barber:"", source:"rule" };
  if (/\b(quero|preciso|posso|gostaria).{0,28}\b(falar|conversar).{0,22}\b(dono|proprietario|responsavel|barbeiro|pessoa|atendente|humano)\b/.test(text)
    || /\b(falar com o dono|falar com proprietario|falar com responsavel|atendimento humano)\b/.test(text)) {
    return { intent:"human", date, service:"", barber:"", source:"rule" };
  }
  if (/\b(cancelar|cancela|cancelamento|desmarcar|desmarca)\b/.test(text)) return { intent:"cancel", date, service:"", barber:"", source:"rule" };
  if (/\b(remarcar|remarca|mudar meu horario|trocar meu horario|mudar o horario|trocar o horario)\b/.test(text)) return { intent:"reschedule", date, service:"", barber:"", source:"rule" };
  if (/\b(preco|precos|valor|valores|quanto custa|quanto e|tabela)\b/.test(text)) return { intent:"prices", date, service:"", barber:"", source:"rule" };
  if (/\b(horario|horarios|vaga|vagas|disponivel|disponibilidade|tem hora|tem horario)\b/.test(text)) return { intent:"availability", date, service:"", barber:"", source:"rule" };
  if (/\b(agendar|agenda|marcar|marca um horario|marcar horario|quero cortar|quero fazer a barba)\b/.test(text)) return { intent:"booking", date, service:"", barber:"", source:"rule" };
  if (text.length <= 70 && /^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|oi tudo bem|ola tudo bem|salve|fala)(\b|$)/.test(text)) {
    return { intent:"greeting", date, service:"", barber:"", source:"rule" };
  }
  return { intent:"unknown", date, service:"", barber:"", source:"rule" };
}

export function formatCaAtendeMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(cents / 100);
}

export function mergeCaAtendeMemory(memory: CaAtendeContextMemory, next: Partial<CaAtendeContextMemory>) {
  return {
    intent: next.intent || memory.intent || "",
    date: next.date || memory.date || "",
    service: next.service || memory.service || "",
    barber: next.barber || memory.barber || "",
  };
}
