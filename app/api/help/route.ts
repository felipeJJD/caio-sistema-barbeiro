import { getSessionAccess } from "../../../db/auth";
import { isOrganizationAccessExpired } from "../../../db/access";
import { readHelpReport } from "../../../db/help-reports";
import { executeHelpTool } from "../../../db/help-tools";
import { enforceRateLimit, RateLimitError } from "../../../db/rate-limit";
import { findGuide, guideReply, HELP_MESSAGE_LIMIT, normalizeHelp, type HelpMessage, type HelpReply } from "../../../lib/help-guide";
import { parseReport } from "../../../lib/help-reports";
import { normalizeModelAction, parseHelpAction, revisePendingHelpAction } from "../../../lib/help-actions";
import { interpretHelp } from "../../../lib/help-model";
import { fallbackHelpIntent, isShortHelpContinuation, lastHelpIntent, reconcileHelpIntent } from "../../../lib/help-intent";
import { SAFE_ASSISTANT_CONTEXT_PREFIX } from "../../../lib/help-conversation";
import { learnAssistantProfile, readAssistantProfile } from "../../../db/assistant-profile";

const json=(body:HelpReply|{error:string},status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store, private"}});

export async function POST(request:Request) {
  const access=await getSessionAccess();
  if(!access)return json({error:"Sua sessão terminou. Entre novamente."},401);
  try {
    if(Number(request.headers.get("content-length")||0)>40000)return json({error:"Envie uma mensagem mais curta."},413);
    const raw=await request.text();
    if(raw.length>40000)return json({error:"Envie uma mensagem mais curta."},413);
    let body:{messages?:unknown;pendingAction?:unknown};
    try {body=JSON.parse(raw);}catch{return json({error:"Não consegui ler a mensagem. Tente novamente."},400);}
    if(!body||!Array.isArray(body.messages))return json({error:"Escreva uma dúvida sobre o Cortou Anotou."},400);
    const messages:HelpMessage[]=body.messages.slice(-10).filter((m):m is HelpMessage=>Boolean(m)&&(m.role==="user"||m.role==="assistant")&&typeof m.content==="string").map(m=>({role:m.role,content:m.content.trim().slice(0,HELP_MESSAGE_LIMIT)}));
    const question=messages.at(-1)?.role==="user"?messages.at(-1)!.content:"";
    if(!question)return json({error:"Escreva sua pergunta antes de enviar."},400);
    await enforceRateLimit({scope:"help",identifier:access.organizationId+":"+access.teamMemberId,limit:30,windowMs:60000,message:"Você enviou várias perguntas seguidas. Aguarde um minuto e tente novamente."});
    if(isOrganizationAccessExpired(access))return json(access.isOwner?guideReply("subscription",true)!:{answer:"Peça ao proprietário para renovar o plano da barbearia."});
    const currentProfile=await readAssistantProfile(access);
    const profile=await learnAssistantProfile(access,question,currentProfile);
    const pending=access.isOwner?normalizeModelAction(body.pendingAction):null;
    if(pending){
      const revised=revisePendingHelpAction(pending,question);
      if(revised)return json({answer:"Atualizei a proposta. Confira novamente antes de salvar.",action:revised,contextMessage:`${SAFE_ASSISTANT_CONTEXT_PREFIX} Alteração proposta, aguardando confirmação.`});
    }

    const previous=lastHelpIntent(messages);
    const fallback=fallbackHelpIntent(question,previous,access.isOwner);
    const direct=isShortHelpContinuation(question,previous)||fallback?.tool==="analyze_performance"||(!previous&&fallback?.tool==="get_revenue"&&Boolean(parseReport(question,access.isOwner)));
    if(direct&&fallback&&!pending)return json(await executeHelpTool(access,fallback,profile));

    // Only one interpretation call. The deterministic fallback runs only when
    // the model is unavailable or returned a malformed/unlisted intent.
    const interpreted=await interpretHelp(messages,access.isOwner,profile,pending);
    if(interpreted?.kind==="tool")return json(await executeHelpTool(access,reconcileHelpIntent(question,interpreted.intent,access.isOwner),profile));
    if(interpreted?.kind==="action"){
      if(interpreted.action.kind==="public-booking-link"){
        const intent=fallbackHelpIntent("meu link de agendamento",null,access.isOwner);
        if(intent)return json(await executeHelpTool(access,intent,profile));
      }
      return json({answer:interpreted.answer,action:interpreted.action,contextMessage:`${SAFE_ASSISTANT_CONTEXT_PREFIX} Alteração proposta, aguardando confirmação.`});
    }
    if(interpreted?.kind==="guide"){
      if(fallback)return json(await executeHelpTool(access,fallback,profile));
      const guide=guideReply(interpreted.topic,access.isOwner);
      if(guide)return json(guide);
    }
    if(interpreted?.kind==="clarify")return json(fallback?await executeHelpTool(access,fallback,profile):{answer:interpreted.answer});
    if(fallback)return json(await executeHelpTool(access,fallback,profile));
    if(pending)return json({answer:"Para mudar a proposta, diga o valor ou horário desejado; para começar outro pedido, cancele a proposta anterior."});

    const parsedAction=parseHelpAction(question,access.isOwner);
    if(parsedAction){
      if("clarification" in parsedAction)return json({answer:parsedAction.clarification});
      if(parsedAction.action.kind==="public-booking-link"){
        const intent=fallbackHelpIntent("meu link de agendamento",null,access.isOwner);
        if(intent)return json(await executeHelpTool(access,intent,profile));
      }
      return json({answer:"Entendi. Confira a alteração antes de confirmar.",action:parsedAction.action});
    }
    const report=parseReport(question,access.isOwner);
    if(report&&!("clarification" in report))return json(await readHelpReport(access,report,profile));
    if(report&&"clarification" in report)return json({answer:report.clarification});
    const guideId=findGuide(question);
    if(guideId)return json(guideReply(guideId,access.isOwner)!);
    const clean=normalizeHelp(question);
    if(/^(oi|ola|opa|bom dia|boa tarde|boa noite|tudo bem)$/.test(clean))return json({answer:"Olá! Posso consultar sua agenda, produção e configurações, ou preparar uma alteração para você confirmar. O que precisa?",suggestions:["Como está a agenda hoje?","Quanto faturei este mês?"]});
    return json({answer:"Me conte qual parte do aplicativo você quer conferir ou mudar. Por exemplo: 'quais horários tenho hoje?' ou 'quanto a barbearia faturou ontem?'.",suggestions:["Como está a agenda hoje?","Por que meu cliente não consegue agendar?"]});
  }catch(error){
    if(error instanceof RateLimitError)return json({error:error.message},429);
    console.error("help_request_failed",{type:error instanceof Error?error.name:"Unknown"});
    return json({error:"Não consegui consultar os dados agora. Tente novamente; não vou mostrar valores sem confirmar no sistema."},503);
  }
}
