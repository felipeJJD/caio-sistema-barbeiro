from pathlib import Path

path = Path('db/evolution-whatsapp.ts')
text = path.read_text()

old_queue = '''    const entitlement = await getWhatsappEntitlementForOrganization(message.organizationId, Number(settings.monthlyMessageLimit));
    if (!entitlement.hasAccess) continue;

    const claimedAt = new Date().toISOString();
'''
new_queue = '''    const entitlement = await getWhatsappEntitlementForOrganization(message.organizationId, Number(settings.monthlyMessageLimit));
    if (!entitlement.hasAccess) continue;

    if (message.kind === "bot_text") {
      const conversation = (await db.select({
        pauseReason:whatsappConversations.pauseReason,
        automationPausedUntil:whatsappConversations.automationPausedUntil,
      }).from(whatsappConversations).where(and(
        eq(whatsappConversations.organizationId, message.organizationId),
        eq(whatsappConversations.phone, message.phone),
      )).limit(1))[0];
      const pausedByHuman = conversation?.pauseReason === "human_takeover"
        && (!conversation.automationPausedUntil || conversation.automationPausedUntil > new Date().toISOString());
      if (pausedByHuman) {
        const cancelledAt = new Date().toISOString();
        await db.update(whatsappMessages).set({
          status:"cancelled",
          failedAt:cancelledAt,
          errorText:"Atendimento assumido manualmente no WhatsApp.",
          updatedAt:cancelledAt,
        }).where(eq(whatsappMessages.id, message.id));
        continue;
      }
    }

    const claimedAt = new Date().toISOString();
'''
if old_queue not in text:
    raise SystemExit('queue insertion point not found')
text = text.replace(old_queue, new_queue, 1)

old_webhook = '''  const key = data.key && typeof data.key === "object" ? data.key as Record<string, unknown> : {};
  if (Boolean(key.fromMe)) return { received:0, statuses:0, inboundTextEvents:[] };
  const remoteJid = String(key.remoteJid ?? data.remoteJid ?? "");
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("broadcast")) return { received:0, statuses:0, inboundTextEvents:[] };
  const barePhone = remoteJid.split("@")[0].split(":")[0];
  const phone = normalizeWhatsappPhone(barePhone);
  const providerMessageId = String(key.id ?? data.id ?? "").trim();
  const text = inboundText(data).slice(0, 3500);
  if (!phone || !providerMessageId) return { received:0, statuses:0, inboundTextEvents:[] };
'''
new_webhook = '''  const key = data.key && typeof data.key === "object" ? data.key as Record<string, unknown> : {};
  const remoteJid = String(key.remoteJid ?? data.remoteJid ?? "");
  if (!remoteJid || remoteJid.endsWith("@g.us") || remoteJid.includes("broadcast")) return { received:0, statuses:0, inboundTextEvents:[] };
  const barePhone = remoteJid.split("@")[0].split(":")[0];
  const phone = normalizeWhatsappPhone(barePhone);
  const providerMessageId = String(key.id ?? data.id ?? "").trim();
  const text = inboundText(data).slice(0, 3500);
  if (!phone || !providerMessageId) return { received:0, statuses:0, inboundTextEvents:[] };

  if (Boolean(key.fromMe)) {
    const knownSystemMessage = (await db.select({ id:whatsappMessages.id }).from(whatsappMessages).where(and(
      eq(whatsappMessages.organizationId, connection.organizationId),
      eq(whatsappMessages.providerMessageId, providerMessageId),
      eq(whatsappMessages.direction, "outbound"),
    )).limit(1))[0];
    if (knownSystemMessage?.id) return { received:0, statuses:0, inboundTextEvents:[] };

    const systemSendInFlight = (await db.select({ id:whatsappMessages.id }).from(whatsappMessages).where(and(
      eq(whatsappMessages.organizationId, connection.organizationId),
      eq(whatsappMessages.phone, phone),
      eq(whatsappMessages.direction, "outbound"),
      eq(whatsappMessages.status, "sending"),
    )).limit(1))[0];
    if (systemSendInFlight?.id) return { received:0, statuses:0, inboundTextEvents:[] };

    const takeoverAt = evolutionTimestamp(data.messageTimestamp ?? body.date_time ?? body.dateTime);
    await db.insert(whatsappConversations).values({
      organizationId:connection.organizationId,
      phone,
      botState:"human_takeover",
      pauseReason:"human_takeover",
      automationPausedUntil:null,
      lastOutboundAt:takeoverAt,
      updatedAt:takeoverAt,
    }).onConflictDoUpdate({
      target:[whatsappConversations.organizationId, whatsappConversations.phone],
      set:{
        botState:"human_takeover",
        pauseReason:"human_takeover",
        automationPausedUntil:null,
        lastOutboundAt:takeoverAt,
        updatedAt:takeoverAt,
      },
    });
    await db.update(whatsappMessages).set({
      status:"cancelled",
      failedAt:takeoverAt,
      errorText:"Atendimento assumido manualmente no WhatsApp.",
      updatedAt:takeoverAt,
    }).where(and(
      eq(whatsappMessages.organizationId, connection.organizationId),
      eq(whatsappMessages.phone, phone),
      eq(whatsappMessages.kind, "bot_text"),
      or(eq(whatsappMessages.status, "queued"), eq(whatsappMessages.status, "failed")),
    ));
    return { received:0, statuses:0, inboundTextEvents:[] };
  }
'''
if old_webhook not in text:
    raise SystemExit('webhook replacement point not found')
text = text.replace(old_webhook, new_webhook, 1)
path.write_text(text)

Path('tests/evolution-human-takeover-contract.test.mjs').write_text('''import assert from "node:assert/strict";\nimport test from "node:test";\nimport fs from "node:fs";\n\nconst source=fs.readFileSync(new URL("../db/evolution-whatsapp.ts",import.meta.url),"utf8");\n\ntest("mensagem manual enviada pela barbearia assume a conversa",()=>{\n  assert.doesNotMatch(source,/if \\(Boolean\\(key\\.fromMe\\)\\) return/);\n  assert.match(source,/pauseReason:\"human_takeover\"/);\n  assert.match(source,/botState:\"human_takeover\"/);\n  assert.match(source,/automationPausedUntil:null/);\n});\n\ntest("eco de mensagem do próprio sistema não é confundido com atendimento humano",()=>{\n  assert.match(source,/knownSystemMessage/);\n  assert.match(source,/systemSendInFlight/);\n  assert.match(source,/providerMessageId/);\n  assert.match(source,/direction, \"outbound\"/);\n});\n\ntest("fila Evolution não envia bot_text durante atendimento humano",()=>{\n  assert.match(source,/message\\.kind === \"bot_text\"/);\n  assert.match(source,/pausedByHuman/);\n  assert.match(source,/Atendimento assumido manualmente no WhatsApp/);\n  assert.match(source,/status:\"cancelled\"/);\n});\n''')
