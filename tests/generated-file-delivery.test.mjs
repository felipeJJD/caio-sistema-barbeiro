import assert from "node:assert/strict";
import test from "node:test";
import { deliverGeneratedFile, isAndroidUserAgent } from "../lib/generated-file-delivery.ts";

test("identifica Android sem confundir iPhone e computador", () => {
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36"), true);
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) SamsungBrowser/25.0"), true);
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15"), false);
  assert.equal(isAndroidUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"), false);
});

test("Android baixa direto sem tentar compartilhar", async () => {
  const calls = [];
  const result = await deliverGeneratedFile({
    userAgent: "Mozilla/5.0 (Linux; Android 15; SM-S921B)",
    createFile: () => { calls.push("create-file"); return {}; },
    canShare: () => { calls.push("can-share"); return true; },
    share: async () => { calls.push("share"); },
    download: () => { calls.push("download"); },
  });
  assert.equal(result, "downloaded");
  assert.deepEqual(calls, ["download"]);
});

test("iPhone mantém o compartilhamento de arquivo", async () => {
  const calls = [];
  const result = await deliverGeneratedFile({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)",
    createFile: () => { calls.push("create-file"); return { name: "historico.xlsx" }; },
    canShare: () => { calls.push("can-share"); return true; },
    share: async () => { calls.push("share"); },
    download: () => { calls.push("download"); },
  });
  assert.equal(result, "shared");
  assert.deepEqual(calls, ["create-file", "can-share", "share"]);
});

test("falha de compartilhamento usa download como plano B", async () => {
  const calls = [];
  const result = await deliverGeneratedFile({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)",
    createFile: () => ({}),
    canShare: () => true,
    share: async () => { calls.push("share"); throw new DOMException("Falha ao enviar", "DataError"); },
    download: () => { calls.push("download"); },
  });
  assert.equal(result, "downloaded");
  assert.deepEqual(calls, ["share", "download"]);
});

test("cancelar o compartilhamento não força um download", async () => {
  const calls = [];
  const result = await deliverGeneratedFile({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)",
    createFile: () => ({}),
    canShare: () => true,
    share: async () => { calls.push("share"); throw new DOMException("Cancelado", "AbortError"); },
    download: () => { calls.push("download"); },
  });
  assert.equal(result, "cancelled");
  assert.deepEqual(calls, ["share"]);
});
