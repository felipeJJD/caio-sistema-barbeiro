import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../app/shell-chrome.css");
const dashboard = read("../app/ui/dashboard-app.tsx");
const help = read("../app/ui/help-assistant.tsx");

test("WhatsApp uses a correctly proportioned filled icon, without a duplicate outline", () => {
  const compiled = ts.transpileModule(read("../app/ui/app-icon.tsx"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), module, module.exports);
  const whatsapp = renderToStaticMarkup(createElement(module.exports.AppIcon, { name: "whatsapp" }));
  const calendar = renderToStaticMarkup(createElement(module.exports.AppIcon, { name: "calendar" }));
  assert.match(whatsapp, /viewBox="0 0 16 16"/);
  assert.match(whatsapp, /fill="currentColor" stroke="none"/);
  assert.equal((whatsapp.match(/<path /g) ?? []).length, 1);
  assert.match(calendar, /viewBox="0 0 24 24" fill="none" stroke="currentColor"/);
});

test("the same three-line menu toggles both ways and stays visible above the drawer", () => {
  assert.match(dashboard, /onClick=\{mobileMenuOpen && !mobileMenuClosing \? closeMobileMenu : openMobileMenu\}/);
  assert.match(dashboard, /aria-expanded=\{mobileMenuOpen && !mobileMenuClosing\}/);
  assert.doesNotMatch(dashboard, /className="mobile-menu-close"/);
  assert.match(css, /rotate\(45deg\)/);
  assert.match(css, /rotate\(-45deg\)/);
  assert.match(css, /scaleX\(0\)/);
  assert.match(css, /\[data-menu-open\] > \.sidebar \{ z-index: 42/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("brand cannot shrink into its wordmark and help removes duplicate framing", () => {
  assert.match(css, /width: 64px; height: 48px; flex: 0 0 64px/);
  assert.match(css, /brand-divider[^}]+flex: 0 0 1px/);
  assert.doesNotMatch(help, /help-home-intro|help-avatar|Bora resolver/);
  assert.match(help, /Falar com o suporte/);
  assert.match(help, /target="_blank" rel="noreferrer"/);
  assert.match(help, /helpSuggestions\.map/);
  assert.match(help, /Escreva sua dúvida/);
  assert.doesNotMatch(help, /help-action-shortcuts/);
  assert.match(css, /help-launcher\.is-open \{ visibility: hidden/);
});
