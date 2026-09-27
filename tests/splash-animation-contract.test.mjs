import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, css, layout] = await Promise.all([
  readFile(new URL("../app/ui/app-loading-screen.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/splash.css", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
]);

test("splash mantém a identidade clara preta e dourada do Cortou Anotou", () => {
  assert.match(css, /#f7f6f0/i);
  assert.match(css, /#1b1e1a/i);
  assert.match(css, /#d7a642/i);
  assert.match(css, /#c88f28/i);
  assert.match(component, /CORTOU <strong>ANOTOU<\/strong>/);
  assert.match(component, /AGENDA E GESTÃO PARA BARBEARIAS/);
  assert.match(component, /BY KAIO/);
});

test("abertura usa montagem tecnológica sem depender de biblioteca externa", () => {
  assert.match(component, /app-loading-tech-ring/);
  assert.match(component, /app-loading-tech-scan/);
  assert.match(css, /@keyframes ca-logo-c/);
  assert.match(css, /@keyframes ca-logo-a/);
  assert.match(css, /@keyframes ca-splash-scan/);
  assert.match(css, /@keyframes ca-splash-progress/);
});

test("assinatura sonora é curta, sintetizada localmente e não fica bloqueada por uma sessão antiga", () => {
  assert.match(component, /AudioContext/);
  assert.match(component, /createOscillator/);
  assert.match(component, /createGain/);
  assert.doesNotMatch(component, /sessionStorage|SPLASH_SOUND_KEY/);
  assert.doesNotMatch(component, /https?:\/\//);
});

test("abertura nunca trava esperando áudio e não mostra escolha de som", () => {
  assert.match(component, /finishAfterOpening\(\)/);
  assert.match(component, /setTimeout\(\(\) => onComplete\?\.\(\), 2100\)/);
  assert.doesNotMatch(component, /Abrir com som/);
  assert.doesNotMatch(component, /Entrar sem som/);
  assert.doesNotMatch(component, /app-loading-sound-actions/);
});

test("iPhone pode liberar o som no primeiro toque sem bloquear a entrada", () => {
  assert.match(component, /window\.addEventListener\("pointerdown", trySoundOnGesture/);
  assert.match(component, /playSplashSignature\(true\)/);
  assert.match(component, /context\.resume\(\)/);
});

test("movimento reduzido preserva uma abertura simples sem tentativa automática de áudio", () => {
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /if \(!reducedMotion\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
});

test("layout carrega o css dedicado depois do estilo global", () => {
  const globalIndex = layout.indexOf('import "./globals.css"');
  const splashIndex = layout.indexOf('import "./splash.css"');
  assert.ok(globalIndex >= 0);
  assert.ok(splashIndex > globalIndex);
});
