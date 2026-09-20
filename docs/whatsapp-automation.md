# C.A. Atende — automação de WhatsApp

Este documento registra as decisões de produto já tomadas para o WhatsApp do Cortou Anotou.

## Princípios

- Integração oficial e direta com a Meta WhatsApp Business Platform / Cloud API.
- Sem intermediário de mensageria na primeira versão.
- Cada barbearia conecta o próprio WhatsApp Business e nunca compartilha número, token ou dados com outra organização.
- WhatsApp é opcional. O Cortou Anotou continua funcionando sem ele.
- Confirmações e lembretes são automações transacionais, sem prospecção ou spam.
- Quando o proprietário assume uma conversa, o bot conversacional deve ficar em silêncio durante o período de atendimento humano.
- Mensagens recebidas não consomem o pacote interno do Cortou Anotou. O limite interno controla mensagens enviadas.
- Ao atingir o limite mensal contratado, novos envios automáticos devem parar até renovação/aumento do pacote.
- Valores comerciais e limites devem ser administráveis; a interface comercial mostra um preço único do plano, sem apresentar ao cliente uma soma “app + mensagens”.

## Planos discutidos

Nomes aceitos:
- Cortou Anotou Essencial
- Cortou Anotou Plus
- Cortou Anotou Pro

Pacotes de mensagens discutidos:
- 1.000 mensagens
- 1.500 mensagens
- 3.000 mensagens

Valores já citados em conversas anteriores foram hipóteses comerciais e não ficam fixados no código. O administrador da plataforma deve poder alterá-los.

## Fluxo de agenda

1. Cliente agenda pelo link público.
2. Se a barbearia exige aprovação, o pedido fica aguardando.
3. Proprietário/barbeiro autorizado confirma.
4. O Cortou Anotou envia a confirmação pelo WhatsApp conectado daquela barbearia.
5. O sistema agenda um lembrete algumas horas antes.
6. Se o cliente cancelar, o lembrete pendente é invalidado e pode ser enviada mensagem de cancelamento.
7. Se remarcar, o lembrete antigo é invalidado e um novo é criado para o novo horário.
8. Se a agenda não exigir aprovação, a confirmação pode ser enfileirada assim que o horário entra como Agendado.

## C.A. Atende

O núcleo conversacional econômico já está preparado no código. Ele continua desligado por padrão e só pode ser ligado quando existir conexão Meta válida, pacote de mensagens ativo e automações gerais ligadas.

Regras atuais:

- cumprimento simples recebe uma única saudação com o nome da barbearia e o link público;
- o link de agendamento é a primeira opção para reduzir conversa desnecessária;
- preço é lido dos serviços reais da organização e agrupado em uma resposta;
- disponibilidade usa a agenda real e nunca inventa horários;
- se faltarem serviço ou dia, o bot pede somente os dados essenciais e preserva um contexto curto para a próxima mensagem;
- cancelamento e remarcação conversacional ainda não alteram a agenda: nesta etapa o pedido é transferido para atendimento humano;
- quando o cliente pede uma pessoa, o bot envia uma mensagem curta, notifica o proprietário e fica em silêncio até o proprietário encerrar o atendimento na aba WhatsApp;
- ofertas comerciais com alta confiança são marcadas como possível oferta e não recebem resposta;
- mensagens simples usam regras locais; a IA só é consultada quando as regras não conseguem interpretar a intenção;
- a IA serve apenas para classificar intenção e extrair serviço/profissional/data. Respostas, preços e horários continuam vindo de regras e dados do Cortou Anotou;
- cada resposta do bot é enfileirada com deduplicação baseada na mensagem recebida;
- o webhook responde à Meta primeiro e o processamento conversacional roda depois, evitando segurar a confirmação do webhook;
- mensagens do bot contam no limite interno apenas como mensagens enviadas, enquanto mensagens recebidas não consomem o pacote interno.

A fila também passou a reivindicar uma mensagem como `sending` antes da chamada externa, reduzindo risco de dois executores enviarem a mesma mensagem.

## Teste interno do C.A. Atende

A aba WhatsApp possui um laboratório de conversa que usa o mesmo motor do atendimento real sem depender da Meta. O proprietário pode escrever como se fosse um cliente e conferir a resposta antes de conectar qualquer número.

No laboratório:

- nenhuma mensagem é enviada à Meta;
- nenhum cliente real recebe mensagem;
- nenhum agendamento é criado, alterado ou cancelado;
- preços e horários podem ser consultados nos dados reais da própria barbearia;
- a interface mostra se a decisão veio de regra local ou IA e se houve consulta à agenda/serviços;
- pedido de atendimento humano simula o silêncio do bot até a conversa ser reiniciada;
- oferta comercial de alta confiança mostra que o bot ficaria em silêncio;
- o contexto da conversa fica somente no estado do teste e pode ser zerado com “Reiniciar conversa”.

O modo de teste reutiliza a mesma função de composição de resposta usada pelo webhook real. Isso evita manter um “bot de demonstração” diferente do que irá para produção.

## Segurança

- Todas as consultas e gravações são isoladas por organizationId.
- O token da Meta de cada barbearia é criptografado antes de ser persistido.
- O proprietário não pode aumentar o próprio limite mensal de mensagens.
- Webhooks da Meta precisam de verificação e assinatura.
- IDs vindos do navegador ou webhook nunca definem organização sem revalidação no servidor.

## Estado da implementação

A fundação criada no PR #28 inclui:
- conexão por organização;
- configurações por organização;
- fila idempotente;
- limite mensal;
- confirmação, lembrete, cancelamento e remarcação;
- webhook de recebimento e status;
- pausa de conversa para atendimento humano;
- executor protegido da fila.

A integração nasce desligada e com limite 0. Nenhuma mensagem real sai até existir conexão Meta e ativação explícita.

## Embedded Signup

O Cortou Anotou agora possui o fluxo técnico do Embedded Signup oficial da Meta.

Há dois caminhos na interface:

- **Conectar meu WhatsApp atual:** usa o onboarding de coexistência para negócios que já atendem pelo WhatsApp Business no celular. A própria Meta decide a elegibilidade do número.
- **Conectar outro número:** usa o fluxo Cloud API padrão e registra o número com um PIN de duas etapas gerado pelo servidor e armazenado criptografado.

O navegador recebe somente App ID, Config ID e versão pública da Graph API. O App Secret nunca é enviado ao cliente. O código de autorização de uso único é trocado pelo token no servidor.

Antes de persistir a conexão, o servidor:

1. valida que o token pertence ao app do Cortou Anotou;
2. exige as permissões `whatsapp_business_management` e `whatsapp_business_messaging`;
3. confirma que a WABA autorizada é acessível pelo token;
4. consulta os números diretamente na Meta e confirma que o `phone_number_id` pertence à WABA;
5. assina o app nos webhooks daquela WABA;
6. registra o número quando for o fluxo Cloud API padrão;
7. criptografa token e PIN antes de salvar.

Para liberar o botão em produção ainda é necessário configurar no Railway:

- `WHATSAPP_APP_ID`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`
- `WHATSAPP_GRAPH_VERSION`

Também é necessário que o app da Meta esteja configurado para Embedded Signup, HTTPS e com as permissões necessárias aprovadas conforme o estágio do app.

## Próximas etapas

1. Configurar o app/Embedded Signup real da Meta e as variáveis de produção.
2. Fazer a primeira conexão real com um número de teste.
3. Templates oficiais e aprovados para confirmação, lembrete, cancelamento e remarcação.
4. Agendamento periódico do executor da fila para lembretes.
5. Histórico visual completo de enviados, entregues, lidos e falhas.
6. Completar eventos específicos de coexistência antes de ativar o C.A. Atende em um número real.
7. Evoluir cancelamento/remarcação pelo chat com validações seguras.
8. Adicionar informações configuráveis da barbearia como endereço, estacionamento, formas de pagamento e regras de atraso.
9. Planos comerciais e cobrança integrada.
