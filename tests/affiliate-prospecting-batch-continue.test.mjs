import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("erros da Evolution não viram object Object na tela", async () => {
 const source=await readFile(new URL("../lib/affiliate-prospecting-whatsapp.ts",import.meta.url),"utf8");
 assert.match(source,/function evolutionErrorDetail/);assert.match(source,/O WhatsApp recusou esse número/);
});
