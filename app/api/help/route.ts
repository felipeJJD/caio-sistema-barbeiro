import { getSessionAccess } from "../../../db/auth";
import { isOrganizationAccessExpired } from "../../../db/access";
import { readHelpReport } from "../../../db/help-reports";
import { enforceRateLimit, RateLimitError } from "../../../db/rate-limit";
import { findGuide, guideReply, HELP_MESSAGE_LIMIT, normalizeHelp, type HelpMessage, type HelpReply } from "../../../lib/help-guide";
import { parseReport } from "../../../lib/help-reports";
import { parseHelpAction } from "../../../lib/help-actions";
import { interpretHelp } from "../../../lib/help-model";

const json = (body: HelpReply | {error:string}, status = 200) => Response.json(body, {status, headers:{"Cache-Control":"no-store, private"}});

export async function POST(request: Request) {
  const access = await getSessionAccess();
  if (!access) return json({error:"Sua sessão terminou. Entre novamente."},401);
  try {
    if (Number(request.headers.get("content-length") || 0) > 40000) return json({error:"Envie uma mensagem mais curta."},413);
    const raw = await request.text();
    if (raw.length > 40000) return json({error:"Envie uma mensagem mais curta."},413);
    let body: {messages?:unknown};
    try { body = JSON.parse(raw); } catch { return json({error:"Não consegui ler a mensagem. Tente novamente."},400); }
    if (!body || !Array.isArray(body.messages)) return json({error:"Escreva uma dúvida sobre o Cortou Anotou."},400);
    const messages: HelpMessage[] = body.messages.slice(-10).filter((m): m is HelpMessage => Boolean(m) && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").map(m=>({role:m.role,content:m.content.trim().slice(0,HELP_MESSAGE_LIMIT)}));
    const question = messages.at(-1)?.role === "user" ? messages.at(-1)!.content : "";
    if (!question) return json({error:"Escreva sua pergunta antes de enviar."},400);

    await enforceRateLimit({scope:"help",identifier:access.organizationId+":"+access.teamMemberId,limit:30,windowMs:60000,message:"Você enviou várias perguntas seguidas. Aguarde um minuto e tente novamente."});
    // Owners with an expired plan can still ask how to renew it.
    if (isOrganizationAccessExpired(access)) return json(access.isOwner ? guideReply("subscription",true)! : {answer:"Peça ao proprietário para renovar o plano da barbearia."});

    let reportQuestion = question;
    if (/^(e )?(hoje|ontem|neste mes|esse mes|mes passado|esta semana)\??$/.test(normalizeHelp(question))) {
      const previous = [...messages.slice(0,-1)].reverse().find(m=>m.role === "user" && parseReport(m.content,access.isOwner));
      if (previous) reportQuestion = previous.content.replace(/\b(hoje|ontem|neste m[eê]s|esse m[eê]s|m[eê]s passado|esta semana)\b/gi,"") + " " + question;
    }
    const report = parseReport(reportQuestion,access.isOwner);
    if (report && !("clarification" in report)) return json(await readHelpReport(access, report));
    const parsedAction = parseHelpAction(question, access.isOwner);
    if (parsedAction) {
      if ("clarification" in parsedAction) return json({ answer: parsedAction.clarification });
      if (parsedAction.action.kind === "public-booking-link") return json({ answer: "Claro. Posso abrir ou copiar seu link público de agendamento.", action: parsedAction.action });
      return json({ answer: "Entendi. Confira a alteração abaixo antes de confirmar.", action: parsedAction.action });
    }
    const guideId = findGuide(question);
    if (guideId === "overview") return json(guideReply(guideId,access.isOwner)!);

    const interpreted = await interpretHelp(messages, access.isOwner);
    if (interpreted?.kind === "report") return json(await readHelpReport(access, interpreted.report));
    if (interpreted?.kind === "action") return json({ answer: interpreted.answer, action: interpreted.action });
    if (interpreted?.kind === "guide") {
      const guide = guideReply(interpreted.topic,access.isOwner);
      if (guide) return json({...guide, answer: interpreted.answer});
    }
    if (report && "clarification" in report) return json({answer:report.clarification});
    if (interpreted?.kind === "clarify") return json({answer:interpreted.answer});
    if (guideId) return json(guideReply(guideId,access.isOwner)!);
    const clean = normalizeHelp(question);
    if (/^(oi|ola|opa|bom dia|boa tarde|boa noite|tudo bem)[ !?]*$/.test(clean)) return json({answer:"Olá! Posso explicar o app, mostrar onde fazer algo ou consultar seus resultados. O que você precisa?",suggestions:["O que o app faz?","Quanto eu fiz hoje?"]});
    return json({answer:"Você quer aprender a usar uma função ou consultar seus resultados? Me conte com suas palavras, por exemplo: como registrar um corte?",suggestions:["O que o app faz?","Como registrar um corte?","Quanto eu fiz hoje?"]});
  } catch (error) {
    if (error instanceof RateLimitError) return json({error:error.message},429);
    console.error("help_request_failed", {type:error instanceof Error ? error.name : "Unknown"});
    return json({error:"Não consegui consultar os dados agora. Tente novamente; não vou mostrar valores sem confirmar no sistema."},503);
  }
}
