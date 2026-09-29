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

  const knownService = context.services.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const knownBarber = context.barbers.some(item => normalized.includes(normalizeCaAtendeText(item.name)));
  const bookingContinuation = (memory.intent === "booking" || memory.intent === "availability")
    && (knownService || knownBarber || Boolean(extractCaAtendeDate(message)) || Boolean(extractCaAtendeTime(message)) || Boolean(extractCaAtendeTimeWindow(message).afterTime) || Boolean(extractCaAtendeTimeWindow(message).beforeTime) || wantsAssistedBooking(message) || wantsAnotherProfessional(message) || wantsBookingConfirmation(message));

  // Escritas e mudanças sensíveis continuam em fluxos determinísticos. Para a
  // linguagem natural, a IA interpreta primeiro e as regras ficam como fallback.
  if (rule.intent === "spam" || rule.intent === "human" || rule.intent === "cancel" || rule.intent === "reschedule") return rule;

  let interpretation: CaAtendeInterpretation = rule;
  if (context.settings.aiFallbackEnabled) {
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
  if ([...context.services.map(item => item.name), ...context.barbers.map(item => item.name)]
    .some(name => normalized === normalizeCaAtendeText(name) || normalized === `quero o ${normalizeCaAtendeText(name)}`)) {
    return { ...rule, intent:memory.intent === "prices" ? "prices" as const : "booking" as const };
  }

  return interpretation;
}'''

text = text[:start] + replacement + text[end:]
old_call = "const interpreted = await interpretationFor(event.text, context, oldMemory);"
if text.count(old_call) != 1:
    raise SystemExit(f"chamada interpretationFor inesperada: {text.count(old_call)}")
text = text.replace(old_call, "const interpreted = await interpretationFor(event.text, context, oldMemory, stage);", 1)
path.write_text(text)
print("IA-first patch aplicado")
