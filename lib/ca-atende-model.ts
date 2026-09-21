import { appDate } from "./app-date";
import { parseAiUsage } from "./ai-usage";
import type { CaAtendeInterpretation, CaAtendeIntent, CaAtendeContextMemory } from "./ca-atende";

const INTENTS: CaAtendeIntent[] = ["greeting","booking","availability","prices","human","cancel","reschedule","spam","unknown"];

export async function interpretCaAtendeWithAi(input: {
  message: string;
  organizationName: string;
  services: string[];
  barbers: string[];
  memory?: CaAtendeContextMemory;
}): Promise<CaAtendeInterpretation | null> {
  const { env } = await import("@/runtime/env");
  const settings = env as unknown as { OPENAI_API_KEY?: string; OPENAI_WHATSAPP_MODEL?: string; OPENAI_HELP_MODEL?: string };
  const key = settings.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const model = settings.OPENAI_WHATSAPP_MODEL || process.env.OPENAI_WHATSAPP_MODEL || settings.OPENAI_HELP_MODEL || process.env.OPENAI_HELP_MODEL || "gpt-4.1-mini-2025-04-14";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(9000),
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 180,
        instructions: `Você classifica UMA mensagem recebida por WhatsApp para o C.A. Atende, atendente econômico de uma barbearia. Não escreva resposta ao cliente. Apenas classifique a intenção e extraia dados mencionados.

Hoje é ${appDate()} em America/Sao_Paulo.
Barbearia: ${input.organizationName.slice(0,120)}.
Serviços cadastrados: ${input.services.slice(0,30).join(" | ") || "nenhum"}.
Profissionais cadastrados: ${input.barbers.slice(0,30).join(" | ") || "nenhum"}.
Contexto curto da conversa: ${JSON.stringify(input.memory || {})}.

Intenções:
greeting = cumprimento sem outro pedido.
booking = quer marcar e não pediu uma consulta específica de vagas.
availability = quer saber horários/vagas/disponibilidade.
prices = quer preço/valor.
human = quer explicitamente falar/conversar/chamar uma pessoa, dono, responsável ou atendente. Dizer apenas "quero o Eduardo", "com o Eduardo", "Eduardo" ou escolher um profissional NÃO é human; nesses casos mantenha booking/availability conforme o contexto.
cancel = quer cancelar/desmarcar.
reschedule = quer mudar/remarcar.
spam = oferta comercial clara enviada à barbearia (operadora, empréstimo, marketing, vendedor etc.).
unknown = não há segurança suficiente.

service e barber devem ser nomes do cadastro quando a mensagem apontar claramente para um deles; caso contrário vazio.
date deve ser YYYY-MM-DD quando o cliente disser hoje, amanhã, dia da semana ou uma data clara; caso contrário vazio.
time deve ser HH:MM quando houver horário claro como "9h", "9 horas", "às 9" ou "14:30"; caso contrário vazio.
Leve a memória em conta em respostas curtas. Se a conversa estava escolhendo agendamento/horário e a pessoa disser apenas "Corte", "Eduardo", "amanhã", "9h" ou "quero resolver por aqui", trate isso como continuação do agendamento, não como assunto novo.
Se houver dúvida entre spam e cliente real, use unknown. Não invente nomes, datas, horários ou serviços.`,
        input: input.message.slice(0,1200),
        text: { format: { type: "json_schema", name: "ca_atende_intent", strict: true, schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: { type: "string", enum: INTENTS },
            date: { type: "string" },
            time: { type: "string" },
            service: { type: "string" },
            barber: { type: "string" }
          },
          required: ["intent","date","time","service","barber"]
        }}}
      })
    });
    if (!response.ok) {
      console.warn("ca_atende_model_unavailable", { status: response.status });
      return null;
    }
    const payload = await response.json() as {
      status?: string;
      output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
      usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
    };
    if (payload.status && payload.status !== "completed") return null;
    const raw = payload.output?.filter(item => item.type === "message").flatMap(item => item.content || []).filter(item => item.type === "output_text").map(item => item.text || "").join("") || "";
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { intent?: string; date?: string; time?: string; service?: string; barber?: string };
    if (!INTENTS.includes(parsed.intent as CaAtendeIntent)) return null;
    return {
      intent: parsed.intent as CaAtendeIntent,
      date: String(parsed.date || "").slice(0,10),
      time: String(parsed.time || "").slice(0,5),
      service: String(parsed.service || "").slice(0,120),
      barber: String(parsed.barber || "").slice(0,120),
      source: "ai",
      aiUsage: parseAiUsage(payload, model),
    };
  } catch {
    console.warn("ca_atende_model_unavailable", { reason: "request_or_format" });
    return null;
  }
}
