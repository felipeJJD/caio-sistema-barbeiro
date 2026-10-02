import test from "node:test";
import assert from "node:assert/strict";

function normalizeLikeRuntime(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0055")) digits = digits.slice(4);
  if (digits.startsWith("55") && digits.length === 13) return digits;
  if (digits.startsWith("55") && digits.length === 12) {
    const national = digits.slice(2);
    if (/^\d{2}[6-9]\d{7}$/.test(national)) return `55${national.slice(0, 2)}9${national.slice(2)}`;
  }
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 10 && /^\d{2}[6-9]\d{7}$/.test(digits)) return `55${digits.slice(0, 2)}9${digits.slice(2)}`;
  return "";
}

test("mantém celular brasileiro completo", () => {
  assert.equal(normalizeLikeRuntime("55 41 99582-4583"), "5541995824583");
});

test("corrige formato móvel antigo com país", () => {
  assert.equal(normalizeLikeRuntime("554195824583"), "5541995824583");
});

test("corrige formato móvel antigo sem país", () => {
  assert.equal(normalizeLikeRuntime("4195824583"), "5541995824583");
});

test("não transforma telefone fixo antigo em celular", () => {
  assert.equal(normalizeLikeRuntime("554132345678"), "");
});
