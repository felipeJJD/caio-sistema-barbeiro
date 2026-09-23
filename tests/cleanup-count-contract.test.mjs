import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("lixeira soma suspensos cadastros pendentes e convites", async () => {
  const source = await readFile(new URL("../app/ui/team-cleanup-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /suspended\.length \+ pending\.length \+ invites\.length/);
});
