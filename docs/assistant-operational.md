# Assistente operacional: contratos e limites

## Fluxo

1. `app/api/help/route.ts` autentica, limita requisições, consulta o perfil individual e lê o último contexto estruturado. Nenhuma fonte enviada pelo cliente escolhe `organizationId` ou `teamMemberId`.
2. `lib/help-model.ts` faz no máximo uma chamada de interpretação estruturada e recebe o catálogo de leituras e `lib/help-knowledge.ts`. Ele escolhe uma ferramenta e filtros, ou propõe uma alteração. Não recebe SQL, conexão, segredo ou resultados financeiros de consultas anteriores.
3. `lib/help-intent.ts` valida IDs, datas, duração da consulta, horários e campos; continua perguntas curtas alterando apenas filtros mencionados. Interpreta perguntas simples localmente se não é necessária uma chamada ao modelo.
4. `db/help-tools.ts` executa apenas SELECTs parametrizados sob o tenant da sessão. Consultas de funcionários usam o `teamMemberId` autenticado. Disponibilidade usa a rotina de vagas do próprio agendamento público, após obter o slug da organização autenticada.
5. Alterações retornam proposta e cartão. O usuário pode corrigir a proposta e revisar novo cartão; só a confirmação envia a ação existente para o endpoint normal de gravação, que revalida as permissões.

## Fontes de verdade

- Reservas/agenda: `appointments`; disponibilidade: `db/public-booking.ts` e regras de `lib/booking-hours.ts`.
- Atendimentos realizados e faturamento: `daily_records`, `product_sales`, `membership_payments`, `expenses` via `db/help-reports.ts`.
- Comissões lançadas são separadas de vales e pagamentos em `team_payments`.
- Serviços, pagamentos, produtos, mensalistas e expedientes vêm das tabelas respectivas filtradas pela organização da sessão.
- Retorno de clientes baseia-se apenas em registros identificados pelo nome. Nomes idênticos de pessoas diferentes não podem ser distinguidos com segurança pelos dados existentes.

## Extensão segura

Para acrescentar uma consulta: inserir ID e descrição em `HELP_TOOLS`, validar os campos em `normalizeHelpIntent`, adicionar uma consulta parametrizada em `executeHelpTool` e testar proprietário, funcionário, outro tenant e ausência de dados. Para acrescentar uma alteração: usar o endpoint existente e seus validadores; a interface deve continuar exigindo confirmação. Atualizar `productKnowledge` quando mudar o comportamento real do aplicativo.

## Limitações conscientemente preservadas

- A proposta de configuração cobre serviço, plano, agenda, expediente e pagamento. Outras gravações continuam usando os fluxos já existentes no chat e suas próprias confirmações.
- O assistente não controla permissões de microfone, entrega garantida de notificações externas, envio de WhatsApp ou transferência bancária.
- Se a interpretação externa estiver indisponível, consultas comuns e continuações estruturadas têm alternativa local. Pedidos complexos não são convertidos em uma gravação por adivinhação.
- A revisão visual no iPhone e a resposta do modelo configurado em produção dependem de teste humano com sessão autorizada antes de merge; esta branch não muda a produção.
