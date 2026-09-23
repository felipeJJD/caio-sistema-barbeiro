import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const billingSource = readFileSync(new URL("../db/billing.ts", import.meta.url), "utf8");
const webhookRouteSource = readFileSync(new URL("../app/api/payments/mercado-pago/webhook/route.ts", import.meta.url), "utf8");

test("Mercado Pago usa o dominio canonico do Cortou Anotou como fallback", () => {
  assert.match(billingSource, /const DEFAULT_PUBLIC_APP_URL = "https:\/\/cortouanotou\.com\.br";/);
  assert.doesNotMatch(billingSource, /clube-fiel-v11\.kaylon-estefani2016\.chatgpt\.site/);
  assert.match(billingSource, /notification_url: `\$\{config\.publicAppUrl\}\/api\/payments\/mercado-pago\/webhook\?source_news=webhooks`/);
});

test("webhook do Mercado Pago falha fechado quando o segredo nao esta configurado", () => {
  const missingSecretCheck = billingSource.indexOf("if (!webhookSecret) return false;");
  const splitLookup = billingSource.indexOf("const splitOrder =");
  const splitBypass = billingSource.indexOf("if (splitOrder?.splitAffiliateId) return true;");

  assert.ok(missingSecretCheck >= 0, "a ausencia do segredo deve rejeitar a assinatura");
  assert.ok(splitLookup >= 0 && splitBypass >= 0, "o fluxo de split deve continuar protegido pela consulta autenticada ao provedor");
  assert.ok(missingSecretCheck < splitLookup, "o segredo deve ser exigido antes de qualquer excecao do fluxo split");
  assert.ok(missingSecretCheck < splitBypass, "o fluxo split nao pode ignorar a ausencia do segredo");
  assert.doesNotMatch(billingSource, /if \(!webhookSecret\) return true;/);
  assert.match(
    webhookRouteSource,
    /if \(!await validateMercadoPagoWebhookSignature\(request, dataId\)\) \{\s*return Response\.json\(\{ error: "Assinatura inválida\." \}, \{ status: 401 \}\);/,
  );
});
