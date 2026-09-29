from pathlib import Path

path = Path("tests/ca-atende-conversations.test.mjs")
text = path.read_text(encoding="utf-8")
old = '''test("saudação, opções e link público passam pelo mesmo motor sem IA",async()=>{
  const [hello,menu,booking,link]=await chat(["oi boa tarde","Ver opções","Agendar horário","Agendar pelo link"]);
  assert.match(hello.reply,/Barbearia Exemplo/);
  assert.deepEqual(hello.choices,["Ver opções"]);
  assert.equal(menu.choices.length,5);
  assert.deepEqual(booking.choices,["Agendar pelo link","Quero ajuda por aqui"]);
  assert.equal(link.reply,"https://cortouanotou.com.br/agendar/exemplo");
  assert.equal(globalThis.__caAiCalls,0);
});'''
new = '''test("saudação, opções e link público passam pelo mesmo motor sem IA",async()=>{
  const [hello,menu,booking,link]=await chat(["oi boa tarde","Ver opções","Agendar horário","Agendar pelo link"]);
  assert.match(hello.reply,/Barbearia Exemplo/);
  assert.deepEqual(hello.choices,["Agendar horário","Ver horários disponíveis","Preços e serviços","Cancelar ou remarcar","Falar com a barbearia"]);
  assert.equal(menu.choices.length,5);
  assert.equal(booking.state,"awaiting_service");
  assert.ok(booking.choices.includes("Corte"));
  assert.doesNotMatch(booking.reply,/Como prefere agendar/i);
  assert.equal(link.reply,"https://cortouanotou.com.br/agendar/exemplo");
  assert.equal(globalThis.__caAiCalls,0);
});'''
if text.count(old) != 1:
    raise SystemExit(f"teste antigo não encontrado exatamente uma vez: {text.count(old)}")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Teste antigo atualizado para o fluxo novo.")
