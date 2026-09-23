import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../app/mercado-pago-seguranca/page.tsx", import.meta.url), "utf8");
const formSource = readFileSync(new URL("../app/mercado-pago-seguranca/security-form.tsx", import.meta.url), "utf8");
const platformRouteSource = readFileSync(new URL("../app/api/platform/mercado-pago/route.ts", import.meta.url), "utf8");
const secretsSource = readFileSync(new URL("../db/platform-secrets.ts", import.meta.url), "utf8");

test("tela privada do Mercado Pago recebe token e assinatura sem revelar os valores", () => {
  assert.match(pageSource, /robots:\s*\{ index: false, follow: false \}/);
  assert.match(formSource, /name="accessToken"\s+type="password"/);
  assert.match(formSource, /name="webhookSecret"\s+type="password"/);
  assert.match(formSource, /webhookSecret: String\(data\.get\("webhookSecret"\)/);
  assert.match(formSource, /accessToken: String\(data\.get\("accessToken"\)/);
  assert.match(formSource, /form\.reset\(\)/);
  assert.doesNotMatch(formSource, /console\.(log|info|debug)\(/);
});

test("API e cofre interno continuam guardando a assinatura secreta do webhook", () => {
  assert.match(platformRouteSource, /webhookSecret\?: string/);
  assert.match(platformRouteSource, /webhookSecret: String\(data\.webhookSecret \?\? ""\)/);
  assert.match(secretsSource, /const MERCADO_PAGO_WEBHOOK_SECRET_KEY = "mercado_pago_webhook_secret"/);
  assert.match(secretsSource, /if \(webhookSecret\) await storeSecret\(access, MERCADO_PAGO_WEBHOOK_SECRET_KEY, webhookSecret\)/);
  assert.match(secretsSource, /webhookConfigured: Boolean\(webhookSecret\)/);
});
