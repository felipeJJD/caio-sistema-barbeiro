# C.A. Prospecção

Serviço de busca e armazenamento da prospecção integrado ao painel `/afiliado/prospeccao`.
Busca existente: IBGE, Nominatim e Overture/DuckDB. Não usa Google Places pago.

## Conexões e responsabilidade

Cada afiliado usa `ca-prospeccao-affiliate-<affiliateId>`. O ADM preserva a instância existente `ca-prospeccao-outbound`.
O aplicativo principal detém as credenciais da Evolution e valida o acesso ativo do afiliado antes de despachar.
Este serviço nunca usa instâncias `ca-org-*` nem envia mensagens do C.A. Atende.

## Reservas e fila

Reserva de preparação: 60 minutos. Depois de enfileirar, a reserva permanece até o trabalho terminar.
Deduplicação global por telefone e source ID, incluindo recusas anteriores. Cada lead tem no máximo um trabalho.
A fila é persistida no Postgres; o worker do aplicativo consulta `/api/queue` com assinatura server-side.
Concessões anteriores ao despacho podem ser recuperadas; envios interrompidos ficam `uncertain` e nunca são reenviados cegamente.
Webhooks com comprovante de saída reconciliam envios incertos. Intervalo mínimo persistido de 12 segundos por instância, incluindo falhas.
Não há limite de 10 por lote. Operações maiores que 1000 são recusadas explicitamente, nunca truncadas.
Abrir wa.me não marca contato: a pessoa deve confirmar que enviou.

## Segurança

`/api/claims`, `/api/queue` e `/api/connections` exigem HMAC do servidor, com timestamp e hash do corpo, além da identidade assinada.
A chave de assinatura é o código de acesso existente. Ela nunca é devolvida ao navegador.
`PROSPECCAO_BRIDGE_REQUIRED=false` é usado apenas no curto rollout compatível com o cliente antigo. Deve permanecer `true` em produção após atualizar o aplicativo.
Cookies da prévia não concedem acesso a filas ou conexões. Nenhum segredo deve ser escrito em logs.

## Validação

`npm test` e `npm run build`. A suíte de integração exige `PROSPECCAO_TEST_DATABASE_URL` apontando exclusivamente para um banco chamado `prospecting_test`.
O CI provisiona seu próprio Postgres descartável. Nunca usar o banco de produção nos testes.
`/api/health` valida apenas banco e schema, sem contato com a Evolution.

Variáveis existentes: `PROSPECCAO_DATABASE_URL`, `PROSPECCAO_ACCESS_CODE`, `PROSPECCAO_WORKSPACE_ID`.
Mudanças de schema são aditivas e preservam os registros.
