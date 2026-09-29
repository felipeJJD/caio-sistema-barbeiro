from pathlib import Path


def replace_once(path: str, old: str, new: str):
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho, encontrado {count}: {old[:90]!r}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


# 1) C.A. Atende: primeira resposta já mostra o que o cliente pode fazer.
replace_once(
    "db/ca-atende.ts",
    '''function defaultGreeting(context: CaAtendeRuntimeContext) {
  const link = bookingLink(context.organization.slug);
  const custom = context.settings.greetingText.trim();
  if (custom) {
    const rendered = custom
      .replaceAll("{barbearia}", context.organization.name)
      .replaceAll("{link}", link)
      .trim();
    const withLink = rendered.includes(link)
      ? rendered
      : `${rendered}\n\nPara agendar seu horário: ${link}`;
    return withLink.slice(0,3500);
  }
  return `Olá! Seja bem-vindo à ${context.organization.name}. Para agendar seu horário é só acessar: ${link}\n\nSe preferir outro assunto, toque em “Ver opções” ou escreva o que precisa.`;
}''',
    '''function defaultGreeting(context: CaAtendeRuntimeContext) {
  const link = bookingLink(context.organization.slug);
  const custom = context.settings.greetingText.trim();
  if (custom) {
    const rendered = custom
      .replaceAll("{barbearia}", context.organization.name)
      .replaceAll("{link}", link)
      .trim();
    const withLink = rendered.includes(link)
      ? rendered
      : `${rendered}\n\nAgendamento pelo link: ${link}`;
    return `${withLink}\n\nEscolha uma opção abaixo ou escreva do seu jeito.`.slice(0,3500);
  }
  return `Olá! Seja bem-vindo à ${context.organization.name}. Posso ajudar com agendamento, horários, preços, cancelamento ou remarcação.\n\nSe preferir agendar pelo link: ${link}\n\nEscolha uma opção abaixo ou escreva do seu jeito.`;
}''',
)

# 2) Dias em formato de mini-calendário e horários equilibrados entre manhã/tarde/noite.
replace_once(
    "db/ca-atende.ts",
    '''const mainChoices = ["Agendar horário", "Ver horários disponíveis", "Preços e serviços", "Cancelar ou remarcar", "Falar com a barbearia"];
const bookingChoices = ["Agendar pelo link", "Quero ajuda por aqui"];
''',
    '''const mainChoices = ["Agendar horário", "Ver horários disponíveis", "Preços e serviços", "Cancelar ou remarcar", "Falar com a barbearia"];

function bookingDayChoices(count = 5) {
  const today = appDate();
  const base = new Date(`${today}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday:"long", timeZone:"America/Sao_Paulo" });
  return Array.from({ length:count }, (_, index) => {
    const day = new Date(base);
    day.setUTCDate(day.getUTCDate() + index);
    const name = weekday.format(day).replace("-feira", "");
    const prettyName = name.charAt(0).toUpperCase() + name.slice(1);
    const dd = String(day.getUTCDate()).padStart(2, "0");
    const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
    if (index === 0) return `Hoje · ${prettyName}`;
    if (index === 1) return `Amanhã · ${prettyName}`;
    return `${prettyName} · ${dd}/${mm}`;
  });
}

function representativeSlots<T extends { time:string; barberId:number; barberName:string }>(slots: T[], max = 9) {
  const seen = new Set<string>();
  const unique = slots.filter((slot) => {
    const key = `${slot.barberId}:${slot.time}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const buckets = [
    unique.filter((slot) => slot.time < "12:00"),
    unique.filter((slot) => slot.time >= "12:00" && slot.time < "18:00"),
    unique.filter((slot) => slot.time >= "18:00"),
  ];
  const picked: T[] = [];
  while (picked.length < max && buckets.some((bucket) => bucket.length)) {
    for (const bucket of buckets) {
      const next = bucket.shift();
      if (next) picked.push(next);
      if (picked.length >= max) break;
    }
  }
  return picked.sort((left, right) => left.time.localeCompare(right.time) || left.barberName.localeCompare(right.barberName, "pt-BR"));
}
''',
)

replace_once(
    "db/ca-atende.ts",
    '''function slotSummary(slots: Array<{ time: string; barberId: number; barberName: string }>, maxPerBarber = 4) {
  const groups = new Map<string, string[]>();
  for (const slot of slots) {
    const times = groups.get(slot.barberName) ?? [];
    if (times.length < maxPerBarber && !times.includes(slot.time)) times.push(slot.time);
    groups.set(slot.barberName, times);
  }
  if (groups.size === 1) return [...groups.values()][0].join(", ");
  return [...groups.entries()].map(([barberName, times]) => `${barberName}: ${times.join(", ")}`).join(" · ");
}''',
    '''function slotSummary(slots: Array<{ time: string; barberId: number; barberName: string }>, max = 6) {
  const groups = new Map<string, string[]>();
  for (const slot of representativeSlots(slots, max)) {
    const times = groups.get(slot.barberName) ?? [];
    if (!times.includes(slot.time)) times.push(slot.time);
    groups.set(slot.barberName, times);
  }
  if (groups.size === 1) return [...groups.values()][0].join(", ");
  return [...groups.entries()].map(([barberName, times]) => `${barberName}: ${times.join(", ")}`).join(" · ");
}''',
)

# 3) Agendar horário vai direto ao serviço; o link só aparece se for pedido explicitamente.
replace_once(
    "db/ca-atende.ts",
    '''  if (normalized === "agendar horario" || normalized === "agendar pelo link") {
    if (normalized === "agendar pelo link") {
      return { reply:bookingLink(context.organization.slug), intent:"booking", state:"", memory:{}, source:"rule" };
    }
    return { reply:"Como prefere agendar?", intent:"booking", state:"booking_method", memory:{ intent:"booking" }, source:"rule", choices:bookingChoices };
  }''',
    '''  if (normalized === "agendar horario" || normalized === "agendar pelo link") {
    if (normalized === "agendar pelo link") {
      return { reply:bookingLink(context.organization.slug), intent:"booking", state:"", memory:{}, source:"rule" };
    }
    return { reply:"Qual serviço você quer?", intent:"booking", state:"awaiting_service", memory:{ intent:"booking" }, source:"rule", choices:serviceChoices(context) };
  }''',
)

# 4) Remarcação e agendamento usam mais dias que só Hoje/Amanhã.
for old in [
    'choices:["Hoje", "Amanhã"], dataSource:"agenda"',
    'choices:["Hoje", "Amanhã"] }',
]:
    path = Path("db/ca-atende.ts")
    text = path.read_text(encoding="utf-8")
    if old in text:
        text = text.replace(old, 'choices:bookingDayChoices(), dataSource:"agenda"' if 'dataSource' in old else 'choices:bookingDayChoices() }')
        path.write_text(text, encoding="utf-8")

# Ajusta a escolha de dia depois do profissional e remove o texto confuso "corte ou amanhã".
replace_once(
    "db/ca-atende.ts",
    '''    if (stage === "awaiting_professional" && !date && (explicitBarber || normalized === "qualquer profissional")) {
      return { reply:"Qual dia você prefere?", intent:preservedIntent, state:"awaiting_booking_details", memory:nextMemory, source:"rule", choices:["Hoje", "Amanhã"] };
    }

    if (!date) {
      const missing: string[] = [];
      if (!selectedService) missing.push("qual serviço você quer");
      if (!date) missing.push("qual dia");
      const known: string[] = [];
      if (selectedBarber) known.push(`com ${selectedBarber.name}`);
      if (desiredTime) known.push(`às ${desiredTime}`);
      return {
        reply:`${changingProfessional ? "Claro, podemos trocar de profissional. " : ""}${known.length ? `Beleza, ${known.join(" ")}. ` : ""}Me diga ${missing.join(" e ")}. Pode responder curto, por exemplo: “corte” ou “amanhã”.`,
        intent: preservedIntent,
        state:"awaiting_booking_details",
        memory:nextMemory,
        source:"rule",
      };
    }''',
    '''    if (stage === "awaiting_professional" && !date && (explicitBarber || normalized === "qualquer profissional")) {
      return { reply:`Perfeito. ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""}. Qual dia você prefere?`, intent:preservedIntent, state:"awaiting_booking_details", memory:nextMemory, source:"rule", choices:bookingDayChoices() };
    }

    if (!date) {
      return {
        reply:`${changingProfessional ? "Claro, podemos trocar de profissional. " : ""}Certo, ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""}. Qual dia você prefere?`,
        intent: preservedIntent,
        state:"awaiting_booking_details",
        memory:nextMemory,
        source:"rule",
        choices:bookingDayChoices(),
      };
    }''',
)

# 5) Saudação e mensagem desconhecida inicial já oferecem as ações principais.
replace_once(
    "db/ca-atende.ts",
    '''  if (intent === "greeting") {
    return { reply:defaultGreeting(context), intent, state:"menu", memory:{}, source:interpreted.source, choices:["Ver opções"] };
  }''',
    '''  if (intent === "greeting") {
    return { reply:defaultGreeting(context), intent, state:"menu", memory:{}, source:interpreted.source, choices:mainChoices };
  }''',
)

replace_once(
    "db/ca-atende.ts",
    '''  return {
    reply:`Posso te ajudar com preço, horário, agendamento ou chamar uma pessoa da ${context.organization.name}. Me fala do seu jeito o que você precisa.`,
    intent:"unknown",
    state:"",
    memory:{},
    source:interpreted.source,
  };''',
    '''  if (!stage) return menuDecision(context);
  return {
    reply:`Posso te ajudar com preço, horário, agendamento ou chamar uma pessoa da ${context.organization.name}. Me fala do seu jeito o que você precisa.`,
    intent:"unknown",
    state:"",
    memory:oldMemory,
    source:interpreted.source,
    choices:mainChoices,
  };''',
)

# 6) Horários exibidos representam manhã/tarde/noite, sem despejar uma lista gigante.
replace_once(
    "db/ca-atende.ts",
    '''      if (desiredTime) {
        const exact = slots.filter(slot => slot.time === desiredTime);''',
    '''      const visibleSlots = representativeSlots(slots, 9);
      if (desiredTime) {
        const exact = slots.filter(slot => slot.time === desiredTime);''',
)

replace_once(
    "db/ca-atende.ts",
    '''          reply:`Às ${desiredTime} não está livre para ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""} em ${humanDate(date)}. Tenho ${changingProfessional && !selectedBarber && slots.length ? `${slots[0].barberName}: ` : ""}${slotSummary(slots)}. Qual desses fica melhor?`,
          intent:preservedIntent,
          state:"awaiting_booking_choice",
          memory:{ ...nextMemory, time:"" },
          source:interpreted.source,
          dataSource:"agenda",
          choices:slots.slice(0,10).map(slot => `${slot.barberName} · ${slot.time}`),''',
    '''          reply:`Às ${desiredTime} não está livre para ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""} em ${humanDate(date)}. Alguns horários disponíveis são ${changingProfessional && !selectedBarber && visibleSlots.length ? `${visibleSlots[0].barberName}: ` : ""}${slotSummary(visibleSlots)}. Se quiser outro, pode digitar o horário (ex.: 18h).`,
          intent:preservedIntent,
          state:"awaiting_booking_choice",
          memory:{ ...nextMemory, time:"" },
          source:interpreted.source,
          dataSource:"agenda",
          choices:visibleSlots.map(slot => `${slot.barberName} · ${slot.time}`),''',
)

replace_once(
    "db/ca-atende.ts",
    '''        reply:`${changingProfessional ? "Claro. " : ""}Para ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""} em ${humanDate(date)}, tenho ${changingProfessional && !selectedBarber && slots.length && slots.every(slot => slot.barberId === slots[0].barberId) ? `${slots[0].barberName}: ` : ""}${slotSummary(slots)}. Qual horário você prefere?`,
        intent:preservedIntent,
        state:"awaiting_booking_choice",
        memory:changingProfessional ? { ...nextMemory, barber:"", time:desiredTime, afterTime, beforeTime } : { ...nextMemory, afterTime, beforeTime },
        source:changingProfessional ? "rule" : interpreted.source,
        dataSource:"agenda",
        choices:slots.slice(0,10).map(slot => `${slot.barberName} · ${slot.time}`),''',
    '''        reply:`${changingProfessional ? "Claro. " : ""}Para ${selectedService.name}${selectedBarber ? ` com ${selectedBarber.name}` : ""} em ${humanDate(date)}, alguns horários são ${changingProfessional && !selectedBarber && visibleSlots.length && visibleSlots.every(slot => slot.barberId === visibleSlots[0].barberId) ? `${visibleSlots[0].barberName}: ` : ""}${slotSummary(visibleSlots)}. Qual você prefere? Se quiser outro, pode digitar o horário (ex.: 18h).`,
        intent:preservedIntent,
        state:"awaiting_booking_choice",
        memory:changingProfessional ? { ...nextMemory, barber:"", time:desiredTime, afterTime, beforeTime } : { ...nextMemory, afterTime, beforeTime },
        source:changingProfessional ? "rule" : interpreted.source,
        dataSource:"agenda",
        choices:visibleSlots.map(slot => `${slot.barberName} · ${slot.time}`),''',
)

# Remarcação também mostra horários equilibrados quando houver muitos.
replace_once(
    "db/ca-atende.ts",
    '''    const slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, current.serviceId, current.barberId);
    if (!slots.length) return { reply:`Não encontrei horário livre com ${current.barberName} em ${humanDate(date)}. Me diga outro dia.`, intent:"reschedule", state:"awaiting_reschedule_date", memory:oldMemory, source:"rule", dataSource:"agenda" };
    return { reply:`Tenho ${slots.slice(0,8).map((slot) => slot.time).join(", ")}. Qual horário fica melhor?`, intent:"reschedule", state:"awaiting_reschedule_time", memory:{ ...oldMemory, date, time:"" }, source:"rule", choices:slots.slice(0,8).map((slot) => slot.time), dataSource:"agenda" };''',
    '''    const slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, current.serviceId, current.barberId);
    if (!slots.length) return { reply:`Não encontrei horário livre com ${current.barberName} em ${humanDate(date)}. Me diga outro dia.`, intent:"reschedule", state:"awaiting_reschedule_date", memory:oldMemory, source:"rule", dataSource:"agenda" };
    const visibleSlots = representativeSlots(slots, 8);
    return { reply:`Alguns horários livres são ${visibleSlots.map((slot) => slot.time).join(", ")}. Se quiser outro, pode digitar o horário.`, intent:"reschedule", state:"awaiting_reschedule_time", memory:{ ...oldMemory, date, time:"" }, source:"rule", choices:visibleSlots.map((slot) => slot.time), dataSource:"agenda" };''',
)

replace_once(
    "db/ca-atende.ts",
    '''    const slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, current.serviceId, current.barberId);
    const exact = slots.find((slot) => slot.time === time);
    if (!time || !exact) return { reply:`Esse horário não está livre. Tenho ${slots.slice(0,8).map((slot) => slot.time).join(", ")}. Qual prefere?`, intent:"reschedule", state:"awaiting_reschedule_time", memory:oldMemory, source:"rule", choices:slots.slice(0,8).map((slot) => slot.time), dataSource:"agenda" };''',
    '''    const slots = await getPublicBookingSlotsExpanded(context.organization.slug, date, current.serviceId, current.barberId);
    const exact = slots.find((slot) => slot.time === time);
    const visibleSlots = representativeSlots(slots, 8);
    if (!time || !exact) return { reply:`Esse horário não está livre. Alguns horários livres são ${visibleSlots.map((slot) => slot.time).join(", ")}. Se quiser outro, pode digitar o horário.`, intent:"reschedule", state:"awaiting_reschedule_time", memory:oldMemory, source:"rule", choices:visibleSlots.map((slot) => slot.time), dataSource:"agenda" };''',
)

# 7) Data das mensagens automáticas em formato brasileiro.
replace_once(
    "db/evolution-whatsapp.ts",
    '''function evolutionText(kind: string, payload: Record<string, string>) {
  if (kind === "bot_text") return String(payload.text ?? "").trim().slice(0, 3500);''',
    '''function formatWhatsappDate(value: string) {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value.trim());
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value.trim();
}

function evolutionText(kind: string, payload: Record<string, string>) {
  if (kind === "bot_text") return String(payload.text ?? "").trim().slice(0, 3500);''',
)
replace_once(
    "db/evolution-whatsapp.ts",
    '  const date = String(payload.date ?? "").trim();',
    '  const date = formatWhatsappDate(String(payload.date ?? ""));',
)

# 8) Testes que reproduzem o vídeo real.
replace_once(
    "tests/ca-atende-master-scenarios.test.mjs",
    '["Agendar horário","booking_method"],["AGENDAR HORÁRIO","booking_method"],',
    '["Agendar horário","awaiting_service"],["AGENDAR HORÁRIO","awaiting_service"],',
)

replace_once(
    "tests/ca-atende-master-scenarios.test.mjs",
    '''test("saudação real inclui link público e botão Ver opções sem usar IA",async()=>{
  const [answer]=await chat(["bom dia"]);
  assert.match(answer.reply,/https:\\/\\/cortouanotou\\.com\\.br\\/agendar\\/cenarios/);
  assert.match(answer.reply,/Ver opções/);
  assert.deepEqual(answer.choices,["Ver opções"]);
  assert.equal(globalThis.__caAiCalls,0);
});''',
    '''test("saudação real já mostra as ações principais sem exigir Ver opções",async()=>{
  const [answer]=await chat(["bom dia"]);
  assert.match(answer.reply,/https:\\/\\/cortouanotou\\.com\\.br\\/agendar\\/cenarios/);
  assert.deepEqual(answer.choices,["Agendar horário","Ver horários disponíveis","Preços e serviços","Cancelar ou remarcar","Falar com a barbearia"]);
  assert.ok(!answer.choices.includes("Ver opções"));
  assert.equal(globalThis.__caAiCalls,0);
});''',
)

insert_after = '''test("correção 'na verdade às 11' muda só o horário",async()=>{
  const [first,second]=await chat(["quero corte amanhã às 10 com Eduardo","na verdade às 11"]);
  assert.equal(second.memory.service,"Corte");
  assert.equal(second.memory.date,first.memory.date);
  assert.equal(second.memory.barber,"Eduardo");
  assert.equal(second.memory.time,"11:00");
});
'''
extra = '''

test("vídeo real: Agendar horário vai direto aos serviços, sem perguntar link x conversa",async()=>{
  const [answer]=await chat(["Agendar horário"]);
  assert.equal(answer.state,"awaiting_service");
  assert.match(answer.reply,/Qual serviço você quer/i);
  assert.ok(answer.choices.includes("Corte"));
  assert.doesNotMatch(answer.reply,/Como prefere agendar/i);
});

test("vídeo real: depois do profissional oferece cinco dias em formato de calendário",async()=>{
  const replies=await chat(["Agendar horário","Corte","Kaio"]);
  const answer=replies.at(-1);
  assert.equal(answer.state,"awaiting_booking_details");
  assert.equal(answer.choices.length,5);
  assert.match(answer.choices[0],/^Hoje · /);
  assert.match(answer.choices[1],/^Amanhã · /);
  assert.doesNotMatch(answer.reply,/corte.? ou.? amanhã/i);
});

test("vídeo real: horários sugeridos incluem noite quando existe vaga e continuam aceitando horário digitado",async()=>{
  const replies=await chat(["Agendar horário","Corte","Kaio","amanhã"]);
  const answer=replies.at(-1);
  const times=choiceTimes(answer);
  assert.ok(times.some(time=>time<"12:00"));
  assert.ok(times.some(time=>time>="18:00"));
  assert.ok(times.length<=9);
  assert.match(answer.reply,/pode digitar o horário/i);
});

test("vídeo real: mensagem inicial desconhecida também apresenta as ações principais",async()=>{
  const [answer]=await chat(["preciso de uma ajuda"]);
  assert.deepEqual(answer.choices,["Agendar horário","Ver horários disponíveis","Preços e serviços","Cancelar ou remarcar","Falar com a barbearia"]);
});
'''
path = Path("tests/ca-atende-master-scenarios.test.mjs")
text = path.read_text(encoding="utf-8")
if text.count(insert_after) != 1:
    raise SystemExit("não encontrei ponto de inserção dos testes do vídeo")
path.write_text(text.replace(insert_after, insert_after + extra, 1), encoding="utf-8")

replace_once(
    "tests/ca-atende.test.mjs",
    '''test("saudação padrão manda uma única mensagem com link e mantém Ver opções", () => {
  assert.match(botDb, /Seja bem-vindo à/);
  assert.match(botDb, /Para agendar seu horário é só acessar/);
  assert.match(botDb, /Se preferir outro assunto, toque em “Ver opções”/);
  assert.match(botDb, /bookingLink\\(context\\.organization\\.slug\\)/);
});''',
    '''test("saudação padrão já entrega menu principal em uma mensagem", () => {
  assert.match(botDb, /Seja bem-vindo à/);
  assert.match(botDb, /Posso ajudar com agendamento, horários, preços, cancelamento ou remarcação/);
  assert.match(botDb, /Escolha uma opção abaixo ou escreva do seu jeito/);
  assert.match(botDb, /choices:mainChoices/);
  assert.match(botDb, /bookingLink\\(context\\.organization\\.slug\\)/);
});''',
)

# Teste contratual pequeno para a formatação de data e amostragem de horários.
Path("tests/ca-atende-video-flow-contract.test.mjs").write_text('''import test from "node:test";\nimport assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\n\nconst [bot,evolution]=await Promise.all([\n  readFile(new URL("../db/ca-atende.ts", import.meta.url),"utf8"),\n  readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url),"utf8"),\n]);\n\ntest("agendamento guiado não cria etapa link x conversa",()=>{\n  assert.match(bot,/normalized === "agendar horario"[\\s\\S]*state:"awaiting_service"/);\n  assert.doesNotMatch(bot,/return \\{ reply:"Como prefere agendar\\?"/);\n});\n\ntest("dias e horários do vídeo têm navegação mais ampla",()=>{\n  assert.match(bot,/function bookingDayChoices/);\n  assert.match(bot,/Array\\.from\\(\\{ length:count \\}/);\n  assert.match(bot,/function representativeSlots/);\n  assert.match(bot,/slot\\.time >= "18:00"/);\n});\n\ntest("mensagens Evolution exibem data brasileira",()=>{\n  assert.match(evolution,/function formatWhatsappDate/);\n  assert.match(evolution,/match\\[3\\]\\}\\/\\$\\{match\\[2\\]\\}\\/\\$\\{match\\[1\\]\\}/);\n  assert.match(evolution,/const date = formatWhatsappDate/);\n});\n''', encoding="utf-8")

print("Correções do vídeo aplicadas.")
