import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("lixeira dos convites só é montada após sessão autenticada", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const sessionIndex = source.indexOf("if (sessionAccess)");
  const trashIndex = source.indexOf("<InviteHistoryTrash");
  const signInIndex = source.indexOf("<SignInScreen");
  assert.ok(sessionIndex >= 0 && trashIndex > sessionIndex && signInIndex > trashIndex);
});
