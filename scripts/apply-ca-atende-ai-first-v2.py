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

# A conversa livre passa propositalmente pela IA uma vez antes dos passos curtos
# e determinísticos. As regressões devem registrar essa nova responsabilidade.
conversation_path = Path("tests/ca-atende-conversations.test.mjs")
conversation = conversation_path.read_text()
conversation = conversation.replace(
    'test("pedido direto consulta agenda real, confirma sem trocar serviço e não cria reserva",async()=>{\n  const [candidate,confirmed]=await chat(["quero cortar com Eduardo amanhã às10","quero que vc marque pra mim"]);',
    'test("pedido direto usa IA para interpretar a conversa livre e mantém execução segura",async()=>{\n  const [candidate,confirmed]=await chat(["quero cortar com Eduardo amanhã às10","quero que vc marque pra mim"]);',
    1,
)
old_direct = '  assert.equal(confirmed.state,"test_confirmation");\n  assert.equal(globalThis.__caAiCalls,0);\n});\n\ntest("troca profissional não perde serviço e dia, e consulta alternativas"'
new_direct = '  assert.equal(confirmed.state,"test_confirmation");\n  assert.equal(globalThis.__caAiCalls,1);\n});\n\ntest("troca profissional não perde serviço e dia, e consulta alternativas"'
if old_direct not in conversation:
    raise SystemExit("assert de IA do pedido direto não encontrado")
conversation = conversation.replace(old_direct, new_direct, 1)
old_swap = '  assert.match(swap.reply,/Davi/);\n  assert.equal(globalThis.__caAiCalls,0);\n});\n\ntest("consultar todos e após 17h mantém todos os profissionais"'
new_swap = '  assert.match(swap.reply,/Davi/);\n  assert.equal(globalThis.__caAiCalls,1);\n});\n\ntest("consultar todos e após 17h mantém todos os profissionais"'
if old_swap not in conversation:
    raise SystemExit("assert de IA da troca de profissional não encontrado")
conversation = conversation.replace(old_swap, new_swap, 1)
conversation_path.write_text(conversation)

master_path = Path("tests/ca-atende-master-scenarios.test.mjs")
master = master_path.read_text()
old_combo = '  assert.doesNotMatch(second.reply,/prefere Barba\\?/);\n  assert.equal(globalThis.__caAiCalls,0);\n});'
new_combo = '  assert.doesNotMatch(second.reply,/prefere Barba\\?/);\n  assert.equal(globalThis.__caAiCalls,1);\n});'
if old_combo not in master:
    raise SystemExit("assert de IA do combo não encontrado")
master = master.replace(old_combo, new_combo, 1)
# Nestes cenários, a primeira mensagem completa usa IA; o segundo passo curto não.
master = master.replace(
    '  assert.equal(answer.state,"awaiting_confirmation");\n  assert.equal(globalThis.__caAiCalls,0);\n});\n\nconst switchPhrases=',
    '  assert.equal(answer.state,"awaiting_confirmation");\n  assert.equal(globalThis.__caAiCalls,1);\n});\n\nconst switchPhrases=',
    1,
)
master = master.replace(
    '  assert.ok((answer.choices||[]).every(choice=>!choice.startsWith("Eduardo ·")));\n  assert.equal(globalThis.__caAiCalls,0);\n});\n\nconst confirmPhrases=',
    '  assert.ok((answer.choices||[]).every(choice=>!choice.startsWith("Eduardo ·")));\n  assert.equal(globalThis.__caAiCalls,1);\n});\n\nconst confirmPhrases=',
    1,
)
master_path.write_text(master)

static_path = Path("tests/ca-atende.test.mjs")
static = static_path.read_text()
old_static = '''test("pedidos claros usam regra; IA interpreta somente linguagem ambígua", () => {
  assert.match(botDb, /if \\(rule\\.intent !== "unknown"\\) return rule/);
  assert.match(botDb, /if \\(bookingContinuation\\) return/);
  assert.match(botDb, /if \\(context\\.settings\\.aiFallbackEnabled\\)/);
  assert.match(botDb, /interpretCaAtendeWithAi/);
  assert.match(botDb, /interpretation\\.intent === "unknown"/);
});'''
new_static = '''test("IA interpreta conversa livre; regras protegem passos simples e críticos", () => {
  assert.match(botDb, /const shouldUseAi = context\\.settings\\.aiFallbackEnabled/);
  assert.match(botDb, /rule\\.intent === "booking"/);
  assert.match(botDb, /rule\\.intent === "availability"/);
  assert.match(botDb, /rule\\.intent === "unknown"/);
  assert.match(botDb, /deterministicContinuation/);
  assert.match(botDb, /interpretCaAtendeWithAi/);
});'''
if old_static not in static:
    raise SystemExit("teste estático antigo não encontrado")
static_path.write_text(static.replace(old_static, new_static, 1))

print("IA-first seletiva e regressões aplicadas")
