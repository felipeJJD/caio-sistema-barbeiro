import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("logout redireciona de volta para a raiz do mesmo dominio", async () => {
  const source = await read("app/api/auth/logout/route.ts");

  assert.match(source, /status:\s*303/);
  assert.match(source, /location:\s*"\/"/);
  assert.doesNotMatch(source, /new URL\("\/",\s*request\.url\)/);
  assert.doesNotMatch(source, /0\.0\.0\.0/);
  assert.match(source, /clearedSessionCookie\(\)/);
});
