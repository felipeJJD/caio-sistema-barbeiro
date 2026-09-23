import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function read(path) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("funcionário vê confirmação enviada sem entrar automaticamente", async () => {
  const source = await read("app/ui/team-invite-screen.tsx");
  assert.match(source, /CONFIRMAÇÃO ENVIADA/);
  assert.match(source, /só será criado depois que você confirmar/);
  assert.doesNotMatch(source, /window\.location\.assign\("\/"\).*verificationRequired/s);
});

test("afiliado vê confirmação enviada antes do painel", async () => {
  const source = await read("app/ui/affiliate-invite-screen.tsx");
  assert.match(source, /CONFIRMAÇÃO ENVIADA/);
  assert.match(source, /só será criado depois que você confirmar/);
});
