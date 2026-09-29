from pathlib import Path

def once(path, old, new):
    p=Path(path); text=p.read_text(); c=text.count(old)
    if c!=1: raise SystemExit(f'{path}: expected 1, got {c}: {old[:100]!r}')
    p.write_text(text.replace(old,new,1))

once(
    'tests/ca-atende-master-scenarios.test.mjs',
    '["Agendar horário","booking_method"],["AGENDAR HORÁRIO","booking_method"],',
    '["Agendar horário","awaiting_service"],["AGENDAR HORÁRIO","awaiting_service"],',
)

once(
    'tests/ca-atende-master-scenarios.test.mjs',
    '''test("saudação real inclui link público e botão Ver opções sem usar IA",async()=>{\n  const [answer]=await chat(["bom dia"]);\n  assert.match(answer.reply,/https:\\/\\/cortouanotou\\.com\\.br\\/agendar\\/cenarios/);\n  assert.match(answer.reply,/Ver opções/);\n  assert.deepEqual(answer.choices,["Ver opções"]);\n  assert.equal(globalThis.__caAiCalls,0);\n});''',
    '''test("saudação real conversa primeiro e mantém Ver opções sem usar IA",async()=>{\n  const [answer]=await chat(["bom dia"]);\n  assert.match(answer.reply,/Como posso te ajudar/);\n  assert.doesNotMatch(answer.reply,/https:\\/\\/cortouanotou\\.com\\.br\\/agendar\\/cenarios/);\n  assert.match(answer.reply,/Ver opções/);\n  assert.deepEqual(answer.choices,["Ver opções"]);\n  assert.equal(globalThis.__caAiCalls,0);\n});''',
)

once(
    'tests/ca-atende-master-scenarios.test.mjs',
    '''test("saudação personalizada também recebe o link se o texto customizado esquecer dele",async()=>{\n  const custom={...context,settings:{...context.settings,greetingText:"Olá! Bem-vindo à {barbearia}."}};\n  const [answer]=await chat(["bom dia"],custom);\n  assert.match(answer.reply,/Olá! Bem-vindo à Barbearia Cenários\\./);\n  assert.match(answer.reply,/https:\\/\\/cortouanotou\\.com\\.br\\/agendar\\/cenarios/);\n});''',
    '''test("saudação personalizada não força link quando a barbearia não colocou {link}",async()=>{\n  const custom={...context,settings:{...context.settings,greetingText:"Olá! Bem-vindo à {barbearia}."}};\n  const [answer]=await chat(["bom dia"],custom);\n  assert.match(answer.reply,/Olá! Bem-vindo à Barbearia Cenários\\./);\n  assert.doesNotMatch(answer.reply,/https:\\/\\/cortouanotou\\.com\\.br\\/agendar\\/cenarios/);\n});''',
)

once(
    'tests/ca-atende.test.mjs',
    '''test("saudação padrão manda uma única mensagem com link e mantém Ver opções", () => {\n  assert.match(botDb, /Seja bem-vindo à/);\n  assert.match(botDb, /Para agendar seu horário é só acessar/);\n  assert.match(botDb, /Se preferir outro assunto, toque em “Ver opções”/);\n  assert.match(botDb, /bookingLink\\(context\\.organization\\.slug\\)/);\n});''',
    '''test("saudação padrão conversa primeiro e mantém o link como opção explícita", () => {\n  assert.match(botDb, /Seja bem-vindo à/);\n  assert.match(botDb, /Como posso te ajudar/);\n  assert.match(botDb, /tocar em “Ver opções”/);\n  assert.match(botDb, /normalized === "agendar pelo link"/);\n  assert.match(botDb, /bookingLink\\(context\\.organization\\.slug\\)/);\n});''',
)
