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

Evolução prevista:
- responder dúvidas básicas da barbearia;
- mandar o link público para agendar;
- consultar disponibilidade;
- confirmar agendamentos;
- ajudar em cancelamento e remarcação;
- responder preços, endereço e informações configuradas pela barbearia;
- transferir para atendimento humano;
- ignorar grupos;
- não responder contatos/conversas marcados como atendimento humano;
- usar regras determinísticas primeiro e IA apenas quando realmente necessário.

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

## Próximas etapas

1. Embedded Signup da Meta para o proprietário conectar o próprio número sem colar token manual.
2. Aba WhatsApp dentro do Cortou Anotou.
3. Templates oficiais e aprovados para confirmação, lembrete, cancelamento e remarcação.
4. Agendamento periódico do executor da fila.
5. Histórico visual de enviados, entregues, lidos e falhas.
6. C.A. Atende conversacional com regras antes de IA.
7. Planos comerciais e cobrança integrada.
