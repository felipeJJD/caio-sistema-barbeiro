from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: esperado 1 trecho, encontrado {count}: {old[:100]!r}")
    file.write_text(text.replace(old, new, 1))


# db/whatsapp.ts
replace_once(
    "db/whatsapp.ts",
    'import { getDb } from "./index";\n',
    'import { getDb } from "./index";\nimport { getWhatsappEntitlementForOrganization, type WhatsappEntitlement } from "./whatsapp-entitlement";\n',
)
replace_once(
    "db/whatsapp.ts",
    '  settings: {\n    enabled: boolean;\n',
    '  entitlement: WhatsappEntitlement;\n  settings: {\n    enabled: boolean;\n',
)
replace_once(
    "db/whatsapp.ts",
    '  const monthlyMessageLimit = Math.max(0, Number(settings.monthlyMessageLimit ?? 0));\n  return {\n',
    '  const monthlyMessageLimit = Math.max(0, Number(settings.monthlyMessageLimit ?? 0));\n  const entitlement = await getWhatsappEntitlementForOrganization(access.organizationId, monthlyMessageLimit);\n  return {\n',
)
replace_once(
    "db/whatsapp.ts",
    '    },\n    settings: {\n      enabled: Boolean(settings.enabled),\n',
    '    },\n    entitlement,\n    settings: {\n      enabled: Boolean(settings.enabled),\n',
)
replace_once(
    "db/whatsapp.ts",
    '  if (!settings.enabled || !connection || connection.status !== "connected" || Number(settings.monthlyMessageLimit) <= 0) {\n    return { queued: false, reason: "automation_inactive" as const };\n  }\n\n  const now = new Date().toISOString();\n',
    '  const entitlement = await getWhatsappEntitlementForOrganization(appointment.organizationId, Number(settings.monthlyMessageLimit));\n  if (!settings.enabled || !connection || connection.status !== "connected" || !entitlement.hasAccess) {\n    return { queued: false, reason: "automation_inactive" as const };\n  }\n\n  const now = new Date().toISOString();\n',
)
replace_once(
    "db/whatsapp.ts",
    '  if (!settings.enabled || !settings.botEnabled || !connection || connection.status !== "connected" || Number(settings.monthlyMessageLimit) <= 0) {\n    return { queued:false, reason:"automation_inactive" as const };\n  }\n  const db = await getDb();\n',
    '  const entitlement = await getWhatsappEntitlementForOrganization(input.organizationId, Number(settings.monthlyMessageLimit));\n  if (!settings.enabled || !settings.botEnabled || !connection || connection.status !== "connected" || !entitlement.hasAccess) {\n    return { queued:false, reason:"automation_inactive" as const };\n  }\n  const db = await getDb();\n',
)
replace_once(
    "db/whatsapp.ts",
    '  if (!settings.enabled || !connection || connection.status !== "connected" || !connection.encryptedAccessToken || !connection.accessTokenIv) {\n    throw new Error("A conexão do WhatsApp desta barbearia não está ativa.");\n  }\n  const sentThisMonth = await sentCountThisMonth(message.organizationId);\n  if (sentThisMonth >= Number(settings.monthlyMessageLimit)) throw new Error("O limite mensal de mensagens desta barbearia foi atingido.");\n',
    '  const entitlement = await getWhatsappEntitlementForOrganization(message.organizationId, Number(settings.monthlyMessageLimit));\n  if (!settings.enabled || !entitlement.hasAccess || !connection || connection.status !== "connected" || !connection.encryptedAccessToken || !connection.accessTokenIv) {\n    throw new Error("A conexão do WhatsApp desta barbearia não está ativa.");\n  }\n  if (!entitlement.unlimited) {\n    const sentThisMonth = await sentCountThisMonth(message.organizationId);\n    if (sentThisMonth >= entitlement.monthlyMessageLimit) throw new Error("O limite mensal de mensagens desta barbearia foi atingido.");\n  }\n',
)

# db/evolution-whatsapp.ts
replace_once(
    "db/evolution-whatsapp.ts",
    'import { getDb } from "./index";\n',
    'import { getDb } from "./index";\nimport { getWhatsappEntitlementForOrganization } from "./whatsapp-entitlement";\n',
)
replace_once(
    "db/evolution-whatsapp.ts",
    '    const settings = (await db.select().from(whatsappAutomationSettings).where(eq(whatsappAutomationSettings.organizationId, message.organizationId)).limit(1))[0];\n    if (!settings?.enabled || Number(settings.monthlyMessageLimit) <= 0) continue;\n',
    '    const settings = (await db.select().from(whatsappAutomationSettings).where(eq(whatsappAutomationSettings.organizationId, message.organizationId)).limit(1))[0];\n    if (!settings?.enabled) continue;\n    const entitlement = await getWhatsappEntitlementForOrganization(message.organizationId, Number(settings.monthlyMessageLimit));\n    if (!entitlement.hasAccess) continue;\n',
)

# db/ca-atende.ts
replace_once(
    "db/ca-atende.ts",
    'import { getDb } from "./index";\n',
    'import { getDb } from "./index";\nimport { getWhatsappEntitlementForOrganization } from "./whatsapp-entitlement";\n',
)
replace_once(
    "db/ca-atende.ts",
    '  if (!context.settings.enabled || !context.settings.botEnabled || !context.connected || context.settings.monthlyMessageLimit <= 0) {\n    return { handled:false, reason:"bot_inactive" as const };\n  }\n',
    '  const entitlement = await getWhatsappEntitlementForOrganization(event.organizationId, context.settings.monthlyMessageLimit);\n  if (!context.settings.enabled || !context.settings.botEnabled || !context.connected || !entitlement.hasAccess) {\n    return { handled:false, reason:"bot_inactive" as const };\n  }\n',
)

# app/ui/whatsapp-automation.tsx
replace_once(
    "app/ui/whatsapp-automation.tsx",
    '  settings: {\n    enabled: boolean;\n',
    '  entitlement: {\n    hasAccess: boolean;\n    unlimited: boolean;\n    source: "platform_admin" | "package" | "none";\n    monthlyMessageLimit: number;\n  };\n  settings: {\n    enabled: boolean;\n',
)
replace_once(
    "app/ui/whatsapp-automation.tsx",
    '  const hasPackage = Boolean(data && data.settings.monthlyMessageLimit > 0 && data.settings.planCode !== "off");\n  const canEnable = Boolean(connected && hasPackage);\n  const usagePercent = useMemo(() => {\n    if (!data?.settings.monthlyMessageLimit) return 0;\n    return Math.min(100, Math.round(data.usage.sentThisMonth / data.settings.monthlyMessageLimit * 100));\n  }, [data]);\n',
    '  const hasMessageAccess = Boolean(data?.entitlement.hasAccess);\n  const hasPackage = data?.entitlement.source === "package";\n  const isPlatformAdminAccess = data?.entitlement.source === "platform_admin";\n  const canEnable = Boolean(connected && hasMessageAccess);\n  const usagePercent = useMemo(() => {\n    if (!data?.settings.monthlyMessageLimit || data.entitlement.unlimited) return 0;\n    return Math.min(100, Math.round(data.usage.sentThisMonth / data.settings.monthlyMessageLimit * 100));\n  }, [data]);\n',
)
replace_once(
    "app/ui/whatsapp-automation.tsx",
    '        <strong>{planLabel(data.settings.planCode, data.settings.monthlyMessageLimit)}</strong>\n        <small>{hasPackage ? `${data.settings.monthlyMessageLimit.toLocaleString("pt-BR")} mensagens disponíveis por mês` : "Ative um pacote para liberar os envios automáticos"}</small>\n',
    '        <strong>{isPlatformAdminAccess ? "Acesso administrativo completo" : planLabel(data.settings.planCode, data.settings.monthlyMessageLimit)}</strong>\n        <small>{isPlatformAdminAccess ? "WhatsApp liberado sem pacote ou limite para a administração da plataforma" : hasPackage ? `${data.settings.monthlyMessageLimit.toLocaleString("pt-BR")} mensagens disponíveis por mês` : "Ative um pacote para liberar os envios automáticos"}</small>\n',
)
replace_once(
    "app/ui/whatsapp-automation.tsx",
    '        <div className="whatsapp-usage-bar" aria-label={`${usagePercent}% do pacote utilizado`}><i style={{ width: `${usagePercent}%` }} /></div>\n        <small>{hasPackage ? `${data.usage.remainingThisMonth.toLocaleString("pt-BR")} restantes` : "Nenhuma mensagem será enviada sem pacote"}</small>\n',
    '        <div className="whatsapp-usage-bar" aria-label={isPlatformAdminAccess ? "Acesso administrativo sem limite de pacote" : `${usagePercent}% do pacote utilizado`}><i style={{ width: `${usagePercent}%` }} /></div>\n        <small>{isPlatformAdminAccess ? "Acesso administrativo sem limite de pacote" : hasPackage ? `${data.usage.remainingThisMonth.toLocaleString("pt-BR")} restantes` : "Nenhuma mensagem será enviada sem pacote"}</small>\n',
)
replace_once(
    "app/ui/whatsapp-automation.tsx",
    '<div><span>AUTOMAÇÕES</span><h3>O que o Cortou Anotou pode enviar sozinho</h3><p>Você escolhe cada automação. Nada é enviado sem conexão e pacote ativos.</p></div>\n',
    '<div><span>AUTOMAÇÕES</span><h3>O que o Cortou Anotou pode enviar sozinho</h3><p>Você escolhe cada automação. Nada é enviado sem conexão e acesso ativos.</p></div>\n',
)
replace_once(
    "app/ui/whatsapp-automation.tsx",
    '<span><strong>{data.settings.botEnabled ? "C.A. Atende ligado" : "C.A. Atende desligado"}</strong><small>{!connected ? "Conecte o WhatsApp primeiro" : !hasPackage ? "Ative um pacote primeiro" : !data.settings.enabled ? "Ligue as automações primeiro" : "IA conversa; o sistema valida e executa"}</small></span>\n',
    '<span><strong>{data.settings.botEnabled ? "C.A. Atende ligado" : "C.A. Atende desligado"}</strong><small>{!connected ? "Conecte o WhatsApp primeiro" : !hasMessageAccess ? "Ative um pacote primeiro" : !data.settings.enabled ? "Ligue as automações primeiro" : "IA conversa; o sistema valida e executa"}</small></span>\n',
)

Path("tests/whatsapp-platform-entitlement-contract.test.mjs").write_text('''import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\nimport test from "node:test";\n\nconst entitlement = await readFile(new URL("../db/whatsapp-entitlement.ts", import.meta.url), "utf8");\nconst whatsapp = await readFile(new URL("../db/whatsapp.ts", import.meta.url), "utf8");\nconst evolution = await readFile(new URL("../db/evolution-whatsapp.ts", import.meta.url), "utf8");\nconst caAtende = await readFile(new URL("../db/ca-atende.ts", import.meta.url), "utf8");\nconst ui = await readFile(new URL("../app/ui/whatsapp-automation.tsx", import.meta.url), "utf8");\n\ntest("WhatsApp centralizes platform-admin entitlement without a fake package", () => {\n  assert.match(entitlement, /eq\\(team\\.platformAdmin, true\\)/);\n  assert.match(entitlement, /source: "platform_admin"/);\n  assert.match(entitlement, /if \\(limit > 0\\)/);\n  assert.match(entitlement, /source: "none"/);\n  assert.doesNotMatch(entitlement, /organizationId\\s*===\\s*1/);\n});\n\ntest("C.A. Atende and both outbound queues use the same entitlement", () => {\n  assert.match(caAtende, /getWhatsappEntitlementForOrganization\\(event\\.organizationId/);\n  assert.match(caAtende, /!entitlement\\.hasAccess/);\n  assert.match(whatsapp, /getWhatsappEntitlementForOrganization\\(appointment\\.organizationId/);\n  assert.match(whatsapp, /getWhatsappEntitlementForOrganization\\(input\\.organizationId/);\n  assert.match(evolution, /getWhatsappEntitlementForOrganization\\(message\\.organizationId/);\n  assert.match(evolution, /!entitlement\\.hasAccess/);\n});\n\ntest("Platform admin bypasses only the package limit while customer package rules remain", () => {\n  assert.match(whatsapp, /if \\(!entitlement\\.unlimited\\)/);\n  assert.match(whatsapp, /sentThisMonth >= entitlement\\.monthlyMessageLimit/);\n  assert.match(ui, /Acesso administrativo completo/);\n  assert.match(ui, /data\\?\\.entitlement\\.hasAccess/);\n  assert.match(ui, /source === "package"/);\n});\n''')
