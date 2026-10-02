import test from "node:test";
import assert from "node:assert/strict";

function normalizeLikeRuntime(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(4);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return "";
}

test("mantém celular brasileiro completo", () => {
  assert.equal(normalizeLikeRuntime("55 41 99582-4583"), "5541995824583");
});

test("preserva exatamente o número brasileiro que a Evolution reconhece sem nono dígito", () => {
  assert.equal(normalizeLikeRuntime("554195824583"), "554195824583");
});

test("preserva formato nacional sem nono dígito para o pareamento", () => {
  assert.equal(normalizeLikeRuntime("4195824583"), "554195824583");
});

test("aceita formato completo nacional com nono dígito", () => {
  assert.equal(normalizeLikeRuntime("41995824583"), "5541995824583");
});
