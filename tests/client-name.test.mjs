import assert from "node:assert/strict";
import test from "node:test";

import { validClientName } from "../lib/client-name.ts";

test("accepts real names with accents, apostrophes and hyphens", () => {
  assert.equal(validClientName("  João   D'Ávila  "), "João D'Ávila");
  assert.equal(validClientName("Ana-Clara"), "Ana-Clara");
});

test("rejects offensive words and non-name symbols", () => {
  assert.throws(() => validClientName("Seu arrombado"), /palavras impróprias ou ofensivas/);
  assert.throws(() => validClientName("Pica grossa"), /palavras impróprias ou ofensivas/);
  assert.throws(() => validClientName("P.i.c.a grossa"), /palavras impróprias ou ofensivas/);
  assert.throws(() => validClientName("Piiiica grossa"), /palavras impróprias ou ofensivas/);
  assert.throws(() => validClientName("Cliente 123"), /somente letras/);
  assert.throws(() => validClientName("💈💈"), /somente letras/);
});
