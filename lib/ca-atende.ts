import { appDate, appTimeMinutes } from "./app-date";

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
  time: string;
  service: string;
  barber: string;
  source: "rule" | "ai";
};

export type CaAtendeContextMemory = {
  intent?: string;
  date?: string;
  time?: string;
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

export function extractCaAtendeTime(value: string) {
  const text = normalizeCaAtendeText(value);
  const colon = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(text);
  if (colon) return `${String(Number(colon[1])).padStart(2,"0")}:${colon[2]}`;
  const hours = /\b(?:as|a|pelas)?\s*([01]?\d|2[0-3])\s*(?:h|hs|hora|horas)\b/.exec(text);
  if (hours) return `${String(Number(hours[1])).padStart(2,"0")}:00`;
  return "";
}

function addDays(dateValue: string, days: number) {
  const date = new Date(`${dateValue}T12:00:00-03:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

export function extractCaAtendeDate(value: string, today = appDate(), currentMinutes = appTimeMinutes()) {
  const text = normalizeCaAtendeText(value);
  if (/\b(hoje|hj)\b/.test(text)) return today;
  if (/\bamanha\b/.test(text)) return caAtendeTomorrow(today);
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

  const weekdayNames = [
    ["domingo",0],["segunda",1],["segunda feira",1],["terca",2],["terca feira",2],
    ["quarta",3],["quarta feira",3],["quinta",4],["quinta feira",4],["sexta",5],["sexta feira",5],
    ["sabado",6],
  ] as const;
  const found = weekdayNames.find(([name]) => text.includes(name));
  if (found) {
    const todayDate = new Date(`${today}T12:00:00-03:00`);
    const todayWeekday = todayDate.getDay();
    let delta = (found[1] - todayWeekday + 7) % 7;
    const desiredTime = extractCaAtendeTime(value);
    if (delta === 0 && desiredTime) {
      const [hour, minute] = desiredTime.split(":").map(Number);
      if (hour * 60 + minute <= currentMinutes) delta = 7;
    }
    return addDays(today, delta);
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
  const time = extractCaAtendeTime(value);
  if (!text) return { intent:"unknown", date:"", time:"", service:"", barber:"", source:"rule" };
  if (highConfidenceCommercialOffer(value)) return { intent:"spam", date:"", time:"", service:"", barber:"", source:"rule" };
  if (/\b(quero|preciso|posso|gostaria).{0,28}\b(falar|conversar).{0,22}\b(dono|proprietario|responsavel|barbeiro|pessoa|atendente|humano)\b/.test(text)
    || /\b(falar com o dono|falar com proprietario|falar com responsavel|atendimento humano)\b/.test(text)) {
    return { intent:"human", date, time, service:"", barber:"", source:"rule" };
  }
  if (/\b(cancelar|cancela|cancelamento|desmarcar|desmarca)\b/.test(text)) return { intent:"cancel", date, time, service:"", barber:"", source:"rule" };
  if (/\b(remarcar|remarca|mudar meu horario|trocar meu horario|mudar o horario|trocar o horario)\b/.test(text)) return { intent:"reschedule", date, time, service:"", barber:"", source:"rule" };
  if (/\b(preco|precos|valor|valores|quanto custa|quanto e|tabela)\b/.test(text)) return { intent:"prices", date, time, service:"", barber:"", source:"rule" };
  if (/\b(horario|horarios|vaga|vagas|disponivel|disponibilidade|tem hora|tem horario)\b/.test(text)) return { intent:"availability", date, time, service:"", barber:"", source:"rule" };
  if (/\b(agendar|agenda|marcar|marca um horario|marcar horario|quero cortar|quero fazer a barba)\b/.test(text)) return { intent:"booking", date, time, service:"", barber:"", source:"rule" };
  if (text.length <= 70 && /^(oi|ola|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|oi tudo bem|ola tudo bem|salve|fala)(\b|$)/.test(text)) {
    return { intent:"greeting", date, time, service:"", barber:"", source:"rule" };
  }
  return { intent:"unknown", date, time, service:"", barber:"", source:"rule" };
}

export function formatCaAtendeMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL" }).format(cents / 100);
}

export function mergeCaAtendeMemory(memory: CaAtendeContextMemory, next: Partial<CaAtendeContextMemory>) {
  return {
    intent: next.intent || memory.intent || "",
    date: next.date || memory.date || "",
    time: next.time || memory.time || "",
    service: next.service || memory.service || "",
    barber: next.barber || memory.barber || "",
  };
}
