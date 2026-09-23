import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("confirmação pendente usa token hash e expiração", async () => {
  const source = await readFile(new URL("../db/verified-registration.ts", import.meta.url), "utf8");
  assert.match(source, /token_hash/);
  assert.match(source, /sha256\(verificationToken\)/);
  assert.match(source, /expires_at/);
  assert.match(source, /used_at/);
});
