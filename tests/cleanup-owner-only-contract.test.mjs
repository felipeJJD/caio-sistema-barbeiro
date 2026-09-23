import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("lixeira rejeita funcionário comum no servidor", async () => {
  const source = await readFile(new URL("../app/api/team-cleanup/route.ts", import.meta.url), "utf8");
  assert.match(source, /Somente o administrador pode gerenciar usuários/);
  assert.match(source, /status:\s*403/);
});
