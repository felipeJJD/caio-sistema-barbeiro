import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("lixeira usa diálogo modal com fechamento", async () => {
  const source = await readFile(new URL("../app/ui/team-cleanup-panel.tsx", import.meta.url), "utf8");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
});
