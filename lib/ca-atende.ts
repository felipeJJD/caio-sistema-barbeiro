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
  // The customer's explicit selection is kept separate from the last displayed options.
  afterTime?: string;
  beforeTime?: string;
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
  const afterAt = /\b(?:as|a|pelas|umas|das)\s*([01]?\d|2[0-3])\b/.exec(text);
  if (afterAt) return `${String(Number(afterAt[1])).padStart(2,"0")}:00`;
  if (/^([01]?\d|2[0-3])$/.test(text)) return `${String(Number(text)).padStart(2,"0")}:00`;
  return "";
}

export function extractCaAtendeTimeWindow(value: string): { afterTime: string; beforeTime: string } {
  const text = normalizeCaAtendeText(value);

  if (/\b(de manha|pela manha|na parte da manha|manha cedo)\b/.test(text)) {
    return { afterTime: "06:59", beforeTime: "12:00" };
  }
  if (/\b(a tarde|de tarde|pela tarde|na parte da tarde|depois do almoco)\b/.test(text)) {
    return { afterTime: "11:59", beforeTime: "18:00" };
  }
  if (/\b(a noite|de noite|pela noite|na parte da noite)\b/.test(text)) {
    return { afterTime: "17:59", beforeTime: "" };
  }

  const between = /\bentre\s*([01]?\d|2[0-3])(?::([0-5]\d))?\s*(?:h|hs|hora|horas)?\s*(?:e|ate)\s*([01]?\d|2[0-3])(?::([0-5]\d))?/.exec(text);
  if (between) {
    const start = `${String(Number(between[1])).padStart(2,"0")}:${between[2] ?? "00"}`;
    const end = `${String(Number(between[3])).padStart(2,"0")}:${between[4] ?? "00"}`;
    return { afterTime: start === "00:00" ? "" : minutesBefore(start), beforeTime: end };
  }

  const before = /\b(?:antes d[aeo]s?|antes de)\s*([01]?\d|2[0-3])(?::([0-5]\d))?\s*(?:h|hs|hora|horas)?/.exec(text);
  if (before) return { afterTime: "", beforeTime: `${String(Number(before[1])).padStart(2,"0")}:${before[2] ?? "00"}` };

  const after = /\b(depois d[aeo]s?|depois de|apos|a partir d[aeo]s?|a partir de)\s*([01]?\d|2[0-3])(?::([0-5]\d))?\s*(?:h|hs|hora|horas)?/.exec(text);
  if (after) {
    const time = `${String(Number(after[2])).padStart(2,"0")}:${after[3] ?? "00"}`;
    return { afterTime: /a partir/.test(after[1]) ? minutesBefore(time) : time, beforeTime: "" };
  }

  return { afterTime: "", beforeTime: "" };
}

function minutesBefore(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  const total = Math.max(0, hour * 60 + minute - 1);
  return `${String(Math.floor(total / 60)).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`;
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
  const dayOnly = /\bdia\s+(\d{1,2})\b/.exec(text);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    const [year, month] = today.split("-").map(Number);
    for (let offset = 0; offset < 12; offset++) {
      const candidate = new Date(year, month - 1 + offset, day, 12);
      if (candidate.getDate() !== day) continue;
      const result = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      if (result >= today) return result;
    }
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
  if (/\b(preco|precos|valor|valores|vlr|quanto custa|quanto e|quanto ta|qual valor|tabela)\b/.test(text) || /\bqto custa\b/.test(text)) return { intent:"prices", date, time, service:"", barber:"", source:"rule" };
  if (/\b(horario|horarios|hr|hrs|vaga|vagas|encaixe|disponivel|disponibilidade|tem hora|tem horario|tem hr)\b/.test(text) || /^tem\s+(?:corte|barba|cabelo)\b/.test(text)) return { intent:"availability", date, time, service:"", barber:"", source:"rule" };
  if (/\b(agendar|agenda|marcar|marca um horario|marcar horario|quero cortar|quero fazer a barba)\b/.test(text)) return { intent:"booking", date, time, service:"", barber:"", source:"rule" };
  if (text.length <= 70 && /^(oi+|ola+|opa+|e ai|eai|eae|bom dia|bomdia|bo dia|boa tarde|boatarde|boua tarde|boa noite|boanoite|tudo bem|oi tudo bem|ola tudo bem|salve|fala)/.test(text)) {
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
    afterTime: next.afterTime || memory.afterTime || "",
    beforeTime: next.beforeTime || memory.beforeTime || "",
  };
}
