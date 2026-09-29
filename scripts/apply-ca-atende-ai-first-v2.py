from pathlib import Path

path = Path("db/ca-atende.ts")
text = path.read_text()
start_marker = "async function interpretationFor(message: string, context: CaAtendeRuntimeContext, memory: CaAtendeContextMemory) {"
end_marker = "\n\ntype CaAtendeConversationSnapshot"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("interpretationFor não encontrado")

replacement = '''async function interpretationFor(message: string, context: CaAtendeRuntimeContext, memory: CaAtendeContextMemory, state = "") {
  const rule = classifyCaAtendeByRule(message);
  if (context.settings.spamFilterEnabled && highConfidenceCommercialOffer(message)) return { ...rule, intent:"spam" as const };

  const normalized = normalizeCaAtendeText(message);
  if (normalized === "qualquer profissional") return { ...rule, intent:memory.intent === "availability" ? "availability" as const : "booking" as const };
  if (normalized === "precos e servicos") return { ...rule, intent:"prices" as const };

  const date = extractCaAtendeDate(message);
  const time = extractCaAtendeTime(message);
  const timeWindow = extractCaAtendeTimeWindow(message);
  const words = normalized.split(" ").filter(Boolean);
  const shortEntityChoice = words.length <= 4 && [...context.services.map(item => item.name), ...context.barbers.map(item => item.name)].some((name) => {
    const entityWords = normalizeCaAtendeText(name).split(" ").filter(Boolean);
    return entityWords.length > 0 && entityWords.every((word) => words.includes(word));
  });
  const exactEntityChoice = [...context.services.map(item => item.name), ...context.barbers.map(item => item.name)]
    .some(name => normalized === normalizeCaAtendeText(name) || normalized === `quero o ${normalizeCaAtendeText(name)}`);
  const knownService = context.services.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const knownBarber = context.barbers.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const bookingContinuation = (memory.intent === "booking" || memory.intent === "availability")
    && (knownService || knownBarber || shortEntityChoice || Boolean(date) || Boolean(time) || Boolean(timeWindow.afterTime) || Boolean(timeWindow.beforeTime) || wantsAssistedBooking(message) || wantsAnotherProfessional(message) || wantsBookingConfirmation(message));
  const simpleDateChoice = Boolean(date) && words.length <= 3;
  const simpleTimeChoice = Boolean(time) && words.length <= 3;
  const simpleWindowChoice = (Boolean(timeWindow.afterTime) || Boolean(timeWindow.beforeTime)) && words.length <= 6;
  const guidedConversationCommand = wantsAssistedBooking(message) || wantsAnotherProfessional(message) || wantsBookingConfirmation(message);
  const deterministicContinuation = bookingContinuation
    && (exactEntityChoice || shortEntityChoice || simpleDateChoice || simpleTimeChoice || simpleWindowChoice || guidedConversationCommand);

  // Escritas e mudanças sensíveis continuam determinísticas. Cumprimentos,
  // preços e respostas curtas dos botões também não precisam gastar uma chamada
  // de modelo. A IA vira o intérprete principal da conversa livre.
  if (rule.intent === "spam" || rule.intent === "human" || rule.intent === "cancel" || rule.intent === "reschedule" || rule.intent === "greeting" || rule.intent === "prices") return rule;
  if (deterministicContinuation) return { ...rule, intent:memory.intent as "booking" | "availability" };
  if (exactEntityChoice || shortEntityChoice) {
    return { ...rule, intent:memory.intent === "prices" ? "prices" as const : "booking" as const };
  }

  let interpretation: CaAtendeInterpretation = rule;
  const shouldUseAi = context.settings.aiFallbackEnabled
    && (rule.intent === "booking" || rule.intent === "availability" || rule.intent === "unknown");
  if (shouldUseAi) {
    const ai = await interpretCaAtendeWithAi({
      message,
      organizationName: context.organization.name,
      services: context.services.map(item => item.name),
      barbers: context.barbers.map(item => item.name),
      memory,
      state,
    });
    if (ai) {
      await recordAiUsageSafely({ organizationId:context.organization.id, surface:"ca_atende", usage:ai.aiUsage });
      interpretation = ai;
      if (ai.intent !== "unknown") return ai;
    }
  }

  if (rule.intent !== "unknown") return rule;
  if (bookingContinuation) return { ...rule, intent:memory.intent as "booking" | "availability" };
  return interpretation;
}'''

text = text[:start] + replacement + text[end:]
old_call = "const interpreted = await interpretationFor(event.text, context, oldMemory);"
if text.count(old_call) != 1:
    raise SystemExit(f"chamada interpretationFor inesperada: {text.count(old_call)}")
text = text.replace(old_call, "const interpreted = await interpretationFor(event.text, context, oldMemory, stage);", 1)
path.write_text(text)
print("IA-first seletiva aplicada")
