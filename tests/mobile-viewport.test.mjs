import assert from "node:assert/strict";
import test from "node:test";
import { isAppleTouchDevice, resolveMobileViewport } from "../lib/mobile-viewport.ts";

test("identifica iPhone e iPad sem incluir Android ou computador", () => {
  assert.equal(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)" }), true);
  assert.equal(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Linux; Android 15; SM-S921B)" }), false);
  assert.equal(isAppleTouchDevice({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }), false);
});

test("iPhone elimina o deslocamento antigo ao trocar teclado por lista", () => {
  assert.deepEqual(resolveMobileViewport({
    visualHeight: 844,
    visualTop: 248,
    windowHeight: 844,
    editing: true,
    resetIdleOffset: true,
  }), { height: 844, top: 0, keyboardOpen: false, keyboardInset: 0 });
});

test("iPhone mantém a moldura completa e estável enquanto o teclado está aberto", () => {
  assert.deepEqual(resolveMobileViewport({
    visualHeight: 510,
    visualTop: 174,
    windowHeight: 844,
    editing: true,
    resetIdleOffset: true,
  }), { height: 844, top: 0, keyboardOpen: true, keyboardInset: 334 });
});

test("demais dispositivos mantêm o cálculo anterior", () => {
  assert.deepEqual(resolveMobileViewport({
    visualHeight: 780,
    visualTop: 36,
    windowHeight: 800,
    editing: false,
    resetIdleOffset: false,
  }), { height: 780, top: 36, keyboardOpen: false, keyboardInset: 0 });
});
