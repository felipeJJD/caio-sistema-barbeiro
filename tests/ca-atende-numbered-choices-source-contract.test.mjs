import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("C.A. exibe escolhas numeradas com emoji e mantém números por etapa", async () => {
  const [dbSource, smartSource, libSource] = await Promise.all([
    readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/ca-atende-smart.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ca-atende.ts", import.meta.url), "utf8"),
  ]);

  assert.match(libSource, /lastChoices\?: string\[\]/);
  assert.match(dbSource, /choiceNumberEmoji = \["1️⃣", "2️⃣", "3️⃣"/);
  assert.match(dbSource, /rememberedChoice\(event\.text, oldMemory\.lastChoices\)/);
  assert.match(dbSource, /formatChoiceLine\(choice,index\)/);
  assert.match(dbSource, /lastChoices:safeChoices\(decision\.choices\)/);
  assert.match(smartSource, /1️⃣ 💬 Continuar por aqui/);
  assert.match(smartSource, /2️⃣ 👤 Falar com alguém/);
  assert.match(smartSource, /1️⃣ 📅 Agendar horário/);
  assert.match(smartSource, /4️⃣ 👤 Falar com alguém/);
  assert.match(smartSource, /conversation\?\.botState === "smart_clarify"/);
});
