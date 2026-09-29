import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bot,evolution]=await Promise.all([
  readFile(new URL("../db/ca-atende.ts", import.meta.url),"utf8"),
  readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url),"utf8"),
]);

test("agendamento guiado não cria etapa link x conversa",()=>{
  assert.match(bot,/normalized === "agendar horario"[\s\S]*state:"awaiting_service"/);
  assert.doesNotMatch(bot,/return \{ reply:"Como prefere agendar\?"/);
});

test("dias e horários do vídeo têm navegação mais ampla",()=>{
  assert.match(bot,/function bookingDayChoices/);
  assert.match(bot,/function representativeSlots/);
  assert.match(bot,/slot\.time >= "18:00"/);
});

test("mensagens Evolution exibem data brasileira",()=>{
  assert.match(evolution,/function formatWhatsappDate/);
  assert.match(evolution,/const date = formatWhatsappDate/);
  assert.match(evolution,/match \? `\$\{match\[3\]\}\/\$\{match\[2\]\}\/\$\{match\[1\]\}`/);
});
