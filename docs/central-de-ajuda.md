# Central de ajuda — implementação de setembro de 2026

## Fluxo

`HelpAssistant` mantém a conversa durante a navegação. `/api/help` autentica a sessão, aplica o limite por organização/profissional, valida a mensagem e resolve explicações ou consultas. Os destinos são uma lista explícita em `lib/help-guide.ts`, verificada no servidor e no cliente. Configurações aceita uma aba específica; a ajuda minimiza antes da navegação. Não há URLs, SQL ou gravações arbitrárias vindas do modelo.

## Respostas com dados

`db/help-reports.ts` faz consultas SELECT preparadas, limitadas pelo período e pela organização da sessão. Funcionários recebem apenas dados próprios. Proprietários podem consultar a barbearia ou um profissional do mesmo estabelecimento. Falhas não viram resultados zerados. Os números não são enviados ao provedor de linguagem.

O resumo soma serviços e gorjetas registrados, vendas de produtos e pagamentos de mensalistas pela data do lançamento. Usos de mensalista têm valor de serviço zero; a mensalidade entra uma vez. A sobra desconta comissões (incluindo gorjetas), taxas, custo histórico dos produtos vendidos e todas as despesas lançadas no período, como no Painel. Não é uma conciliação bancária nem uma garantia de lucro contábil. A comissão própria já foi deduzida da sobra. Comissão gerada não é comprovante de repasse pago.

Consultas rápidas cobrem hoje, ontem, semana atual/anterior, mês atual/anterior e datas explícitas com até 366 dias entre elas. Perguntas de contagem retornam atendimentos; filtros por serviço, cliente, pagamento e comparações precisam ser especificados na tela correspondente e não são substituídos silenciosamente pelo total geral.

## Linguagem natural: ativação pendente

O ambiente publicado foi consultado nesta implementação e não tinha a variável `OPENAI_API_KEY`. Configure essa chave como segredo no servidor do Sites, nunca no código, cliente ou repositório. `OPENAI_HELP_MODEL` é opcional e usa `gpt-4.1-mini-2025-04-14` por padrão. O código consulta primeiro os bindings do Worker. A API deve ter acesso ao modelo e faturamento ativo.

`lib/help-model.ts` usa Responses com Structured Outputs, `store:false`, prazo de 12 segundos, 600 tokens de saída e somente as últimas cinco mensagens do usuário, sem relatórios retornados pelo banco. O modelo interpreta intenções; relatórios usam cálculo determinístico no servidor. O manual deve ser atualizado quando uma função mudar. Sem a chave ou com erro do provedor, continuam disponíveis o guia local e as consultas reconhecidas; perguntas livres não têm a mesma compreensão de uma IA conectada. Não apresentar essa integração como ativada antes do teste real.

Documentação consultada: https://developers.openai.com/api/docs/models/gpt-4.1-mini e https://developers.openai.com/api/docs/guides/structured-outputs.

## Voz e celular

O microfone somente dita. A pessoa revisa e envia; uma pausa não envia a mensagem. A transcrição acumula segmentos, permite 25 segundos de silêncio, termina após dois minutos e tem limite de 2.400 caracteres. Eventos atrasados são invalidados ao parar/enviar. Digitar manualmente interrompe a gravação. A caixa cresce até 180 px e passa a rolar; o painel acompanha o teclado pelo visualViewport já existente no app.

A caixa de autorização do microfone é do navegador e mostra a origem real que solicitou acesso. O logotipo/manifesto não alteram esse texto nem garantem permissão permanente. Instalações no endereço antigo `*.chatgpt.site` continuam identificando essa origem. Não mudar o slug nem forçar redirecionamento de sessão como tentativa de esconder a origem. Validar o domínio próprio e a instalação no iPhone antes de orientar reinstalação.

## Validação e publicação

`tests/help-assistant.test.mjs` executa consultas reais em SQLite com duas organizações, proprietário e funcionário; verifica isolamento, cálculos, datas, destinos e a transcrição usando reconhecimento simulado. `tests/core-regressions.test.mjs` mantém as proteções existentes. Não foi feito teste de áudio físico no iPhone nem chamada real à API sem chave. Não há alterações no esquema ou migração de dados. Esta entrega deve ser salva como versão; publicar é uma etapa separada.
