# C|A — revisão do sistema e planos ilimitados

Revisão iniciada em 09/10/2026 (horário de Brasília). Base conferida: main `360cd25b1f2a7c4a737c9f6b4539d983409f7321`, PRs #170/#171 integrados e a mesma versão respondendo em `/api/health`.

## Escopo e limites

Varredura dos fluxos principais por leitura de código, inventário das 58 rotas API `.ts`, execução da suíte completa, testes de interação da página pública, servidor local com SQLite temporário, teste de carga sintético e registros recentes da aplicação. Abrange autenticação/equipe, agenda, atendimento, mensalistas, financeiro/comissões, produtos, página pública, notificações, pagamentos, assistente, afiliados/prospecção e filas WhatsApp.

Não é uma auditoria independente de segurança nem uma leitura integral de todos os dados da produção. Não foram feitas cobranças, envios reais de teste, alteração de usuários ou acesso ao banco privado da produção. Ivan permanece fora desta rodada. Nenhum resultado de entrega a um aparelho ou destinatário é presumido apenas porque um provedor aceitou uma requisição.

## Implementado nesta rodada

- Configurações → Planos de mensalistas: opção **Usos ilimitados**, com o serviço incluído, preço e comissão por uso.
- Clientes novos herdam a modalidade do plano. Renovação adota o limite/modalidade atual. Editar um plano não muda a quantidade ou modalidade que um mensalista já comprou; a interface explica a aplicação na próxima renovação.
- Registro de atendimentos ilimitados não desconta créditos. Contagem de usos, comissão do funcionário, valor que permanece com o proprietário e histórico continuam funcionando.
- Identificação, reserva e conclusão do agendamento público aceitam ilimitados sem exigir saldo numérico. Mantêm isolamento por barbearia, serviço incluído, profissional, conflitos de horários, estado ativo e conclusão idempotente.
- Ilimitados não podem agendar ou registrar um atendimento depois do vencimento. O calendário e a remarcação também respeitam essa validade. A política anterior de créditos dos planos limitados não foi alterada.
- A modalidade e o limite passam a constar nos novos registros de mensalidade, para que alterações posteriores do plano não mudem a apresentação desses meses. Dados legados cujo limite não foi registrado continuam com `max_uses` nulo; não foi inventado um limite histórico.
- Migração 0052 aditiva, com modalidade limitada por padrão. Não apaga/recria tabelas, altera saldos anteriores ou converte clientes automaticamente para ilimitados.

## Verificações

Build e typecheck aprovados. Lint com zero erros e os mesmos 33 avisos já existentes. **780 testes aprovados**; carga sintética aprovada. Inclui nove testes novos, além da atualização dos modelos SQL de teste para os novos campos.

Testes novos verificam oito usos pelo funcionário mais um pelo proprietário, saldo estável, comissões, exclusão do registro, sete reservas públicas com saldo zero, conflito de horário, cancelamento, conclusão duplicada, vencimento, isolamento entre organizações, permissão do proprietário, renovação, preservação da modalidade comprada e edição sem o novo campo. Também executam a atualização de uma base temporária com as migrações anteriores, preservando os valores legados e verificando reabertura sem reaplicar a migração. A interface pública é renderizada e acionada para confirmar que ilimitados não são apresentados como zero créditos.

## Pontos que precisam de revisão

| Prioridade | Ponto | Evidência e efeito | Próxima ação recomendada |
| --- | --- | --- | --- |
| Alta | Supervisão dos processos de WhatsApp e prospecção | `scripts/start.mjs` registra a saída dos workers, mas não os reinicia. O processo web pode continuar saudável com automações paradas. Isso é uma fragilidade confirmada no código, não prova de que tenha causado as desconexões relatadas. | Reinício supervisionado com limite e intervalo; saúde das automações visível separadamente da saúde do site. |
| Alta | Reservas antigas de mensalistas limitados | `archiveFinishedAppointments` muda um horário vencido para Concluído sem mudar `membership_credit_state`. As consultas de reservas contam todos os registros reservados. Um horário antigo que não foi concluído/cancelado manualmente pode reter crédito. | Definir a regra de falta e expiração da reserva antes de liberar ou consumir créditos automaticamente; mostrar reservas pendentes de revisão. |
| Média | Diagnóstico de notificações | Registros de 09/10 às 22h12 e 22h15 mostram uma tentativa aceita e duas recusadas com HTTP 400 por lote. `logBatchResult` registra o status, mas não o motivo categorizado. O usuário confirmou que o Não Perturbe silenciava o próprio aparelho; isso não identifica a causa das demais recusas. | Registrar razão segura por provedor sem URL, chaves ou conteúdo privado, para diferenciar inscrição inválida de erro de autenticação/formato. |
| Média | Vencimento dos planos limitados | A identificação pública e o registro de uso existentes dependem de status ativo e créditos, sem exigir vencimento válido. A proteção por data desta rodada aplica-se aos ilimitados. | Confirmar se a barbearia quer tolerância após vencimento ou bloqueio de novos usos; implementar regra explícita e igual nas entradas pública e interna. |
| Média | Busca pública de nomes em barbearia indisponível | `publicMembershipContext` aplica slug e organização, mas não o mesmo estado `enabled` usado na disponibilidade pública. | Uniformizar a verificação para página desativada, bloqueada ou com acesso vencido. Não muda contas existentes nesta rodada. |
| Média | Limitação de tentativas sem IP | `enforceRateLimit` retorna sem limitar quando não recebe identificador; os endpoints públicos de mensalistas podem retornar `undefined` se o proxy não fornecer IP. | Validar cabeçalhos confiáveis na infraestrutura e estabelecer comportamento explícito para ausência de identificação. Não há confirmação de exploração ou de ausência desses cabeçalhos em produção. |
| Média | Mensagens técnicas em outras rotas | O filtro de `Failed query` existe em `/api/action`; outras rotas ainda retornam diretamente `error.message`. Isso pode expor detalhes internos caso uma consulta falhe nelas. | Tratamento compartilhado de erros, com referência de incidente e diagnóstico seguro no servidor. |
| Média | Recuperação de dados | Há volume persistente obrigatório e migrações com checksum/transação. A varredura não comprovou uma restauração recente de backup da produção. | Conferir política de backup e testar restauração isolada de banco, fotos e chaves persistentes. Não afirmar ausência de backups sem consultar a configuração. |
| Baixa | Margem dos planos ilimitados | A comissão continua sendo por atendimento; muitos usos podem superar a mensalidade. Os cálculos preservam esse resultado. | Mostrar custo por cliente e alerta de margem negativa, para a barbearia escolher um preço sustentável. |

## Resultados por módulo

| Módulo | Verificação realizada |
| --- | --- |
| Autenticação e equipe | Sessão, autorização, isolamento, e-mail duplicado, convite e recuperação cobertos pela suíte; sem alterar contas reais. |
| Agenda e página pública | Conflitos, profissional/serviço, Pix informado, cancelamento, remarcação, fotos e fluxo móvel cobertos; novos ilimitados testados com o motor real em base temporária. |
| Mensalistas | Cadastro, reserva, uso, comissão, renovação e apresentação histórica revisados; fragilidades de reservas antigas e regra de vencimento limitada registradas acima. |
| Financeiro, produtos e equipe | Suíte completa de cálculos, estoque, comissões, vales, fechamentos e PDFs; carga local aprovada. Não é conciliação dos valores reais de todas as barbearias. |
| WhatsApp e C.A. Atende | Regressões do PR #171 permanecem aprovadas, incluindo telefone/data alterados e isolamento da fila. Supervisão dos workers precisa de revisão. |
| Afiliados e prospecção | Autenticação, filas, áudio e isolamento têm cobertura existente; código do processador distingue envio incerto de falha/repetição segura. Motor de busca preservado. |
| Pagamentos | Código consulta pagamento autenticado no provedor, confere referência e estado. Assinatura de webhook depende da configuração; a validação tem caminhos opcionais/split. As credenciais privadas não foram consultadas e nenhuma cobrança real foi executada. |
| Assistente e notificações | Testes existentes aprovados e consulta de mensalistas ajustada para mostrar ilimitados. Falhas push e falta de motivo detalhado permanecem registradas como pendência. |

Ordem sugerida: supervisão/saúde das automações, diagnóstico seguro de falhas, regra de reservas antigas e vencimento, depois margem dos ilimitados e confirmação de restauração. Esta publicação implementa os ilimitados e preserva a varredura; não apresenta essas pendências como corrigidas.
